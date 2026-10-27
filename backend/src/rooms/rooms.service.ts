import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'crypto';
import { IdentityService } from '../identity/identity.service';
import { TokenService } from '../identity/token.service';
import { validateMessage, validateRoomName } from '../security/validators';
import { BlockedParticipant, Message, Participant, Room } from './room.types';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_PARTICIPANTS_PER_ROOM = 100;
const MAX_MESSAGES_PER_ROOM = 500;
const NOT_FOUND = 'Room not found'; // one message for every kind of failure
type RoomDestroyReason = 'owner-disconnected' | 'owner-ended' | 'room-inactive';

function containsMention(body: string, displayName: string) {
  const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(^|[^\\p{L}\\p{N}_])@${escapedName}(?=$|[^\\p{L}\\p{N}_])`,
    'iu',
  ).test(body);
}

@Injectable()
export class RoomsService {
  private rooms = new Map<string, Room>(); // room code -> room
  private inviteIndex = new Map<string, string>(); // opaque invite token -> room code
  private socketIndex = new Map<string, string>(); // socket id -> room code
  private onDestroyed?: (code: string, reason: RoomDestroyReason) => void;

  private inactivityMs: number;
  private ownerGraceMs: number;

  constructor(
    config: ConfigService,
    private identity: IdentityService,
    private tokens: TokenService,
  ) {
    this.inactivityMs =
      Number(config.get('ROOM_INACTIVITY_TIMEOUT_MS'));
    this.ownerGraceMs = Number(config.get('OWNER_GRACE_MS'));
  }

  previewInvite(token: string) {
    if (typeof token !== 'string') return { error: NOT_FOUND };
    const code = this.inviteIndex.get(token);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) return { error: NOT_FOUND };
    return { roomName: room.name };
  }

  getPublicInfo(code: string) {
  const room = this.rooms.get(code.toUpperCase()); // your in-memory Map
  if (!room) return null;
  return { name: room.name.trim().slice(0, 60) };
}

  // The gateway registers this so it can notify and disconnect people on destroy
  setDestroyHandler(fn: (code: string, reason: RoomDestroyReason) => void) {
    this.onDestroyed = fn;
  }

  // ---------- helpers ----------

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return code;
  }

  private generateUniqueCode(): string {
    let code = this.generateCode();
    while (this.rooms.has(code)) code = this.generateCode();
    return code;
  }

  private findRoom(code: string): Room | undefined {
    return this.rooms.get((code ?? '').toString().trim().toUpperCase());
  }

  private usedNames(room: Room): Set<string> {
    return new Set([...room.participants.values()].map((p) => p.displayName));
  }

  private findParticipantBySocket(room: Room, socketId: string) {
    for (const p of room.participants.values()) {
      if (p.socketId === socketId) return p;
    }
    return undefined;
  }

  private connectedCount(room: Room): number {
    let n = 0;
    for (const p of room.participants.values()) if (p.socketId !== null) n++;
    return n;
  }

  private clientIdentityHash(clientIdentity: unknown): string | null {
    if (
      typeof clientIdentity !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        clientIdentity,
      )
    ) {
      return null;
    }
    return this.tokens.hash(clientIdentity);
  }

  // ---------- timers ----------

  private startOwnerGrace(room: Room) {
    if (room.ownerGraceTimer) clearTimeout(room.ownerGraceTimer);
    room.ownerGraceEndsAt = Date.now() + this.ownerGraceMs;
    room.ownerGraceTimer = setTimeout(() => {
      // Re-check: room must still be this room, and the owner still gone
      if (this.rooms.get(room.code) !== room) return;
      const owner = room.participants.get(room.ownerId);
      if (owner && owner.socketId === null)
        this.destroy(room.code, 'owner-disconnected');
    }, this.ownerGraceMs);
  }

  private startInactivityTimer(room: Room) {
    if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
    room.inactivityTimer = setTimeout(() => {
      // Re-check: room must still exist and still be empty
      if (this.rooms.get(room.code) !== room) return;
      if (this.connectedCount(room) === 0)
        this.destroy(room.code, 'room-inactive');
    }, this.inactivityMs);
  }

  private clearTimers(room: Room) {
    if (room.ownerGraceTimer) clearTimeout(room.ownerGraceTimer);
    if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
    room.ownerGraceTimer = undefined;
    room.ownerGraceEndsAt = undefined;
    room.inactivityTimer = undefined;
  }

  // ---------- destroy ----------

  private destroy(code: string, reason: RoomDestroyReason) {
    const room = this.rooms.get(code);
    if (!room) return;

    this.clearTimers(room);
    for (const p of room.participants.values()) {
      if (p.socketId) this.socketIndex.delete(p.socketId);
    }
    // Deleting the room also wipes messages, participants and tokens
    this.rooms.delete(code);
    this.inviteIndex.delete(room.inviteToken);
    this.onDestroyed?.(code, reason);
  }

  // ---------- public actions ----------

  createRoom(name: string, socketId: string, clientIdentity: unknown) {
    const nameError = validateRoomName(name);
    if (nameError) return { error: nameError };
    if (this.socketIndex.has(socketId)) return { error: 'Already in a room' };
    const identityHash = this.clientIdentityHash(clientIdentity);
    if (!identityHash)
      return {
        error: 'Could not verify this browser. Please refresh and try again.',
      };

    const code = this.generateUniqueCode();
    const token = this.tokens.generate();
    let inviteToken = randomUUID();
    while (this.inviteIndex.has(inviteToken)) inviteToken = randomUUID();

    const owner: Participant = {
      id: randomUUID(),
      displayName: this.identity.generateName(new Set()),
      tokenHash: this.tokens.hash(token),
      clientIdentityHash: identityHash,
      socketId,
      isOwner: true,
    };

    const room: Room = {
      code,
      inviteToken,
      name: name.trim(),
      ownerId: owner.id,
      ownerReady: false,
      participants: new Map([[owner.id, owner]]),
      blockedParticipants: new Map(),
      typingParticipantIds: new Set(),
      messages: [],
    };

    this.rooms.set(code, room);
    this.inviteIndex.set(inviteToken, code);
    this.socketIndex.set(socketId, code);

    return {
      roomCode: code,
      inviteToken,
      roomName: room.name,
      participantId: owner.id,
      displayName: owner.displayName,
      token,
      messages: [] as Message[],
      connectedCount: 1,
      ownerGraceMs: this.ownerGraceMs,
    };
  }

  joinRoom(code: string, socketId: string, clientIdentity: unknown) {
    const room = this.findRoom(code);
    if (!room) return { error: NOT_FOUND };
    if (this.socketIndex.has(socketId)) return { error: 'Already in a room' };
    const identityHash = this.clientIdentityHash(clientIdentity);
    if (!identityHash)
      return {
        error: 'Could not verify this browser. Please refresh and try again.',
      };
    if (room.blockedParticipants.has(identityHash)) {
      return {
        error:
          'This browser has been blocked from this room. Ask the owner to unblock you.',
      };
    }
    const owner = room.participants.get(room.ownerId);
    if (!owner?.socketId || !room.ownerReady) {
      return { waitingForOwner: true, waitRoom: room.code };
    }
    if (room.participants.size >= MAX_PARTICIPANTS_PER_ROOM) {
      return {
        error: 'This room is full. Ask the host to make space and try again.',
      };
    }

    const token = this.tokens.generate();
    const participant: Participant = {
      id: randomUUID(),
      displayName: this.identity.generateName(this.usedNames(room)),
      tokenHash: this.tokens.hash(token),
      clientIdentityHash: identityHash,
      socketId,
      isOwner: false,
    };

    room.participants.set(participant.id, participant);
    this.socketIndex.set(socketId, room.code);

    // Someone is here, so cancel the empty-room countdown
    if (room.inactivityTimer) {
      clearTimeout(room.inactivityTimer);
      room.inactivityTimer = undefined;
    }

    return {
      roomCode: room.code,
      roomName: room.name,
      participantId: participant.id,
      displayName: participant.displayName,
      token,
      messages: room.messages,
      connectedCount: this.connectedCount(room),
      ownerGraceMs: this.ownerGraceMs,
    };
  }

  previewRoom(code: string) {
    const room = this.findRoom(code);
    if (!room) return { error: NOT_FOUND };
    return { roomName: room.name };
  }

  markOwnerReady(socketId: string) {
    const code = this.socketIndex.get(socketId);
    const room = code ? this.rooms.get(code) : undefined;
    const owner = room && this.findParticipantBySocket(room, socketId);
    if (!room || !owner?.isOwner) return { error: 'Not allowed' };
    room.ownerReady = true;
    return { ok: true, roomCode: room.code };
  }

  isOwnerReady(code: string) {
    const room = this.findRoom(code);
    return Boolean(
      room?.ownerReady && room.participants.get(room.ownerId)?.socketId,
    );
  }

  reconnect(
    code: string,
    token: string,
    socketId: string,
    clientIdentity: unknown,
  ) {
    const room = this.findRoom(code);
    if (!room || typeof token !== 'string') return { error: NOT_FOUND };
    const identityHash = this.clientIdentityHash(clientIdentity);
    if (!identityHash) return { error: NOT_FOUND };

    const candidate = this.tokens.hash(token);
    let participant: Participant | undefined;
    for (const p of room.participants.values()) {
      if (this.tokens.matches(p.tokenHash, candidate)) participant = p;
    }
    if (!participant || participant.clientIdentityHash !== identityHash) {
      return { error: NOT_FOUND };
    }
    if (room.blockedParticipants.has(identityHash)) {
      return {
        error:
          'This browser has been blocked from this room. Ask the owner to unblock you.',
      };
    }

    // If an old connection was still attached, detach it
    if (participant.socketId && participant.socketId !== socketId) {
      this.socketIndex.delete(participant.socketId);
    }
    participant.socketId = socketId;
    this.socketIndex.set(socketId, room.code);

    if (participant.isOwner && room.ownerGraceTimer) {
      clearTimeout(room.ownerGraceTimer);
      room.ownerGraceTimer = undefined;
      room.ownerGraceEndsAt = undefined;
    }
    if (room.inactivityTimer) {
      clearTimeout(room.inactivityTimer);
      room.inactivityTimer = undefined;
    }

    return {
      roomCode: room.code,
      roomName: room.name,
      participantId: participant.id,
      displayName: participant.displayName,
      isOwner: participant.isOwner,
      messages: room.messages,
      connectedCount: this.connectedCount(room),
      ownerGraceMs: this.ownerGraceMs,
      ...(participant.isOwner ? { inviteToken: room.inviteToken } : {}),
    };
  }

  getRoomPresence(code: string) {
    const room = this.findRoom(code);
    if (!room) return null;
    return {
      connectedCount: this.connectedCount(room),
      ownerGraceEndsAt: room.ownerGraceEndsAt ?? null,
    };
  }

  getParticipantRoomCode(socketId: string) {
    return this.socketIndex.get(socketId);
  }

  getRoomParticipants(code: string) {
    const room = this.findRoom(code);
    if (!room) return null;
    return [...room.participants.values()].map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      isOwner: participant.isOwner,
      connected: participant.socketId !== null,
    }));
  }

  getOwnerRoster(code: string) {
    const room = this.findRoom(code);
    if (!room) return null;
    const owner = room.participants.get(room.ownerId);
    if (!owner?.socketId) return null;
    return {
      ownerSocketId: owner.socketId,
      participants: this.getRoomParticipants(code) ?? [],
      blockedParticipants: [...room.blockedParticipants.values()],
    };
  }

  blockParticipant(ownerSocketId: string, participantId: string) {
    const code = this.socketIndex.get(ownerSocketId);
    const room = code ? this.rooms.get(code) : undefined;
    const owner = room && this.findParticipantBySocket(room, ownerSocketId);
    if (!room || !owner?.isOwner) return { error: 'Not allowed' };

    const target = room.participants.get(participantId);
    if (!target || target.isOwner) return { error: 'Participant not found' };
    if (target.clientIdentityHash === owner.clientIdentityHash) {
      return { error: 'You cannot block your own browser from this room' };
    }

    const blocked: BlockedParticipant = {
      id: randomUUID(),
      displayName: target.displayName,
    };
    room.blockedParticipants.set(target.clientIdentityHash, blocked);

    const disconnectedSocketIds: string[] = [];
    const stoppedTyping: Array<{ participantId: string; displayName: string }> =
      [];
    for (const [id, participant] of room.participants) {
      if (participant.clientIdentityHash !== target.clientIdentityHash)
        continue;
      if (participant.socketId) {
        this.socketIndex.delete(participant.socketId);
        disconnectedSocketIds.push(participant.socketId);
      }
      if (room.typingParticipantIds.delete(id)) {
        stoppedTyping.push({
          participantId: id,
          displayName: participant.displayName,
        });
      }
      room.participants.delete(id);
    }

    if (this.connectedCount(room) === 0) this.startInactivityTimer(room);
    return {
      ok: true,
      roomCode: room.code,
      blocked,
      disconnectedSocketIds,
      stoppedTyping,
    };
  }

  unblockParticipant(ownerSocketId: string, blockedId: string) {
    const code = this.socketIndex.get(ownerSocketId);
    const room = code ? this.rooms.get(code) : undefined;
    const owner = room && this.findParticipantBySocket(room, ownerSocketId);
    if (!room || !owner?.isOwner) return { error: 'Not allowed' };

    for (const [identityHash, blocked] of room.blockedParticipants) {
      if (blocked.id === blockedId) {
        room.blockedParticipants.delete(identityHash);
        return { ok: true, roomCode: room.code };
      }
    }
    return { error: 'Blocked participant not found' };
  }

  updateTyping(socketId: string, isTyping: boolean) {
    const code = this.socketIndex.get(socketId);
    const room = code ? this.rooms.get(code) : undefined;
    const participant = room && this.findParticipantBySocket(room, socketId);
    if (!room || !participant) return { error: NOT_FOUND };

    const wasTyping = room.typingParticipantIds.has(participant.id);
    if (wasTyping === isTyping) return null;
    if (isTyping) room.typingParticipantIds.add(participant.id);
    else room.typingParticipantIds.delete(participant.id);
    return {
      roomCode: room.code,
      participantId: participant.id,
      displayName: participant.displayName,
      isTyping,
    };
  }

  sendMessage(code: string, socketId: string, body: string) {
    const room = this.findRoom(code);
    if (!room) return { error: NOT_FOUND };

    // Membership check: is this connection a participant of this room?
    const sender = this.findParticipantBySocket(room, socketId);
    if (!sender) return { error: NOT_FOUND };

    const error = validateMessage(body);
    if (error) return { error };
    room.typingParticipantIds.delete(sender.id);

    const message: Message = {
      id: randomUUID(),
      senderId: sender.id,
      senderName: sender.displayName,
      body: body.trim(),
      sentAt: Date.now(),
    };

    room.messages.push(message);
    if (room.messages.length > MAX_MESSAGES_PER_ROOM) room.messages.shift();

    const mentionedParticipants = [...room.participants.values()]
      .filter(
        (participant) =>
          participant.id !== sender.id &&
          participant.socketId !== null &&
          containsMention(message.body, participant.displayName),
      )
      .map(({ id, displayName, socketId }) => ({ id, displayName, socketId }));

    return { roomCode: room.code, message, mentionedParticipants };
  }

  editMessage(socketId: string, messageId: string, body: string) {
    const code = this.socketIndex.get(socketId);
    const room = code ? this.rooms.get(code) : undefined;
    const participant = room && this.findParticipantBySocket(room, socketId);
    if (!room || !participant) return { error: NOT_FOUND };

    const error = validateMessage(body);
    if (error) return { error };
    const index = room.messages.findIndex(
      (message) => message.id === messageId,
    );
    if (index === -1) return { error: 'Message not found' };
    const message = room.messages[index];
    if (message.senderId !== participant.id && !participant.isOwner) {
      return { error: 'Not allowed' };
    }

    const editedMessage = { ...message, body: body.trim(), edited: true };
    room.messages[index] = editedMessage;
    return { roomCode: room.code, message: editedMessage };
  }

  deleteMessage(socketId: string, messageId: string) {
    const code = this.socketIndex.get(socketId);
    const room = code ? this.rooms.get(code) : undefined;
    const participant = room && this.findParticipantBySocket(room, socketId);
    if (!room || !participant) return { error: NOT_FOUND };

    const index = room.messages.findIndex(
      (message) => message.id === messageId,
    );
    if (index === -1) return { error: 'Message not found' };
    const message = room.messages[index];
    if (message.senderId !== participant.id && !participant.isOwner) {
      return { error: 'Not allowed' };
    }

    room.messages.splice(index, 1);
    return { roomCode: room.code, messageId };
  }

  // Deliberate leave
  leaveRoom(socketId: string) {
    const code = this.socketIndex.get(socketId);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) return { error: NOT_FOUND };

    const participant = this.findParticipantBySocket(room, socketId);
    if (!participant) return { error: NOT_FOUND };

    // Owner leaving on purpose destroys the room immediately
    if (participant.isOwner) {
      this.destroy(room.code, 'owner-ended');
      return { ok: true, destroyed: true };
    }

    // Ordinary participant: keep their old messages, drop their access
    this.socketIndex.delete(socketId);
    participant.socketId = null;
    participant.tokenHash = ''; // their token no longer works
    room.typingParticipantIds.delete(participant.id);

    if (this.connectedCount(room) === 0) this.startInactivityTimer(room);
    return { ok: true, roomCode: room.code };
  }

  // Owner presses "Destroy Room"
  destroyRoom(socketId: string) {
    const code = this.socketIndex.get(socketId);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) return { error: NOT_FOUND };

    const participant = this.findParticipantBySocket(room, socketId);
    if (!participant || !participant.isOwner) return { error: 'Not allowed' };

    this.destroy(room.code, 'owner-ended');
    return { ok: true };
  }

  // Unexpected connection loss (tab closed, internet dropped)
  handleDisconnect(socketId: string) {
    const code = this.socketIndex.get(socketId);
    if (!code) return null;
    this.socketIndex.delete(socketId);

    const room = this.rooms.get(code);
    if (!room) return null;

    const participant = this.findParticipantBySocket(room, socketId);
    if (!participant) return null;
    participant.socketId = null;
    const stoppedTyping = room.typingParticipantIds.delete(participant.id);

    if (participant.isOwner) {
      room.ownerReady = false;
      this.startOwnerGrace(room);
    }
    if (this.connectedCount(room) === 0) this.startInactivityTimer(room);
    return {
      roomCode: room.code,
      stoppedTyping: stoppedTyping
        ? {
            participantId: participant.id,
            displayName: participant.displayName,
          }
        : null,
    };
  }
}
