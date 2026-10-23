import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'crypto';
import { IdentityService } from '../identity/identity.service';
import { TokenService } from '../identity/token.service';
import { validateMessage, validateRoomName } from '../security/validators';
import { Message, Participant, Room } from './room.types';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_MESSAGES_PER_ROOM = 500;
const NOT_FOUND = 'Room not found'; // one message for every kind of failure

@Injectable()
export class RoomsService {
  private rooms = new Map<string, Room>(); // room code -> room
  private socketIndex = new Map<string, string>(); // socket id -> room code
  private onDestroyed?: (code: string) => void;

  private inactivityMs: number;
  private ownerGraceMs: number;

  constructor(
    config: ConfigService,
    private identity: IdentityService,
    private tokens: TokenService,
  ) {
    this.inactivityMs =
      Number(config.get('ROOM_INACTIVITY_TIMEOUT_MS')) || 900000;
    this.ownerGraceMs = Number(config.get('OWNER_GRACE_MS')) || 30000;
  }

  // The gateway registers this so it can notify and disconnect people on destroy
  setDestroyHandler(fn: (code: string) => void) {
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

  // ---------- timers ----------

  private startOwnerGrace(room: Room) {
    if (room.ownerGraceTimer) clearTimeout(room.ownerGraceTimer);
    room.ownerGraceTimer = setTimeout(() => {
      // Re-check: room must still be this room, and the owner still gone
      if (this.rooms.get(room.code) !== room) return;
      const owner = room.participants.get(room.ownerId);
      if (owner && owner.socketId === null) this.destroy(room.code);
    }, this.ownerGraceMs);
  }

  private startInactivityTimer(room: Room) {
    if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
    room.inactivityTimer = setTimeout(() => {
      // Re-check: room must still exist and still be empty
      if (this.rooms.get(room.code) !== room) return;
      if (this.connectedCount(room) === 0) this.destroy(room.code);
    }, this.inactivityMs);
  }

  private clearTimers(room: Room) {
    if (room.ownerGraceTimer) clearTimeout(room.ownerGraceTimer);
    if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
    room.ownerGraceTimer = undefined;
    room.inactivityTimer = undefined;
  }

  // ---------- destroy ----------

  private destroy(code: string) {
    const room = this.rooms.get(code);
    if (!room) return;

    this.clearTimers(room);
    for (const p of room.participants.values()) {
      if (p.socketId) this.socketIndex.delete(p.socketId);
    }
    // Deleting the room also wipes messages, participants and tokens
    this.rooms.delete(code);
    this.onDestroyed?.(code);
  }

  // ---------- public actions ----------

  createRoom(name: string, socketId: string) {
    const nameError = validateRoomName(name);
    if (nameError) return { error: nameError };
    if (this.socketIndex.has(socketId)) return { error: 'Already in a room' };

    const code = this.generateUniqueCode();
    const token = this.tokens.generate();

    const owner: Participant = {
      id: randomUUID(),
      displayName: this.identity.generateName(new Set()),
      tokenHash: this.tokens.hash(token),
      socketId,
      isOwner: true,
    };

    const room: Room = {
      code,
      name: name.trim(),
      ownerId: owner.id,
      participants: new Map([[owner.id, owner]]),
      messages: [],
    };

    this.rooms.set(code, room);
    this.socketIndex.set(socketId, code);

    return {
      roomCode: code,
      roomName: room.name,
      participantId: owner.id,
      displayName: owner.displayName,
      token,
      messages: [] as Message[],
    };
  }

  joinRoom(code: string, socketId: string) {
    const room = this.findRoom(code);
    if (!room) return { error: NOT_FOUND };
    if (this.socketIndex.has(socketId)) return { error: 'Already in a room' };

    const token = this.tokens.generate();
    const participant: Participant = {
      id: randomUUID(),
      displayName: this.identity.generateName(this.usedNames(room)),
      tokenHash: this.tokens.hash(token),
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
    };
  }

  reconnect(code: string, token: string, socketId: string) {
    const room = this.findRoom(code);
    if (!room || typeof token !== 'string') return { error: NOT_FOUND };

    const candidate = this.tokens.hash(token);
    let participant: Participant | undefined;
    for (const p of room.participants.values()) {
      if (this.tokens.matches(p.tokenHash, candidate)) participant = p;
    }
    if (!participant) return { error: NOT_FOUND };

    // If an old connection was still attached, detach it
    if (participant.socketId && participant.socketId !== socketId) {
      this.socketIndex.delete(participant.socketId);
    }
    participant.socketId = socketId;
    this.socketIndex.set(socketId, room.code);

    if (participant.isOwner && room.ownerGraceTimer) {
      clearTimeout(room.ownerGraceTimer);
      room.ownerGraceTimer = undefined;
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

    const message: Message = {
      id: randomUUID(),
      senderId: sender.id,
      senderName: sender.displayName,
      body: body.trim(),
      sentAt: Date.now(),
    };

    room.messages.push(message);
    if (room.messages.length > MAX_MESSAGES_PER_ROOM) room.messages.shift();

    return { roomCode: room.code, message };
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
      this.destroy(room.code);
      return { ok: true, destroyed: true };
    }

    // Ordinary participant: keep their old messages, drop their access
    this.socketIndex.delete(socketId);
    participant.socketId = null;
    participant.tokenHash = ''; // their token no longer works

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

    this.destroy(room.code);
    return { ok: true };
  }

  // Unexpected connection loss (tab closed, internet dropped)
  handleDisconnect(socketId: string) {
    const code = this.socketIndex.get(socketId);
    if (!code) return;
    this.socketIndex.delete(socketId);

    const room = this.rooms.get(code);
    if (!room) return;

    const participant = this.findParticipantBySocket(room, socketId);
    if (!participant) return;
    participant.socketId = null;

    if (participant.isOwner) this.startOwnerGrace(room);
    if (this.connectedCount(room) === 0) this.startInactivityTimer(room);
  }
}
