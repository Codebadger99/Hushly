import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomsService } from '../rooms/rooms.service';
import { RateLimitService } from '../security/rate-limit.service';

const TOO_MANY = { error: 'Too many requests, slow down' };

@WebSocketGateway()
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly roomsService: RoomsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  afterInit() {
    // When a room is destroyed: tell everyone, then disconnect them
    this.roomsService.setDestroyHandler((code, reason) => {
      this.server.to(code).emit('room:destroyed', { reason });
      this.server.to(this.waitingRoom(code)).emit('room:destroyed', { reason });
      // Let room notifications and Socket.IO acknowledgements flush before closing sockets.
      setTimeout(() => this.server.in(code).disconnectSockets(true), 0);
    });
  }

  private waitingRoom(code: string) {
    return `room-wait:${code}`;
  }

  private publishRoomState(code: string) {
    const presence = this.roomsService.getRoomPresence(code);
    if (!presence) return;
    this.server.to(code).emit('room:presence', presence);
    this.server.to(code).emit('room:participants:public', {
      participants: this.roomsService.getRoomParticipants(code) ?? [],
    });

    const ownerRoster = this.roomsService.getOwnerRoster(code);
    if (ownerRoster) {
      this.server.to(ownerRoster.ownerSocketId).emit('room:participants', {
        participants: ownerRoster.participants,
        blockedParticipants: ownerRoster.blockedParticipants,
      });
    }
  }

  @SubscribeMessage('room:state:request')
  handleRoomStateRequest(@ConnectedSocket() client: Socket) {
    if (!this.rateLimit.allow(`state:${client.id}`, 30, 60_000)) return TOO_MANY;
    const code = this.roomsService.getParticipantRoomCode(client.id);
    if (!code) return { error: 'Room not found' };
    this.publishRoomState(code);
    return { ok: true };
  }

  handleConnection(client: Socket) {
    if (!this.rateLimit.allow(`connect:${this.ip(client)}`, 120, 60_000)) {
      client.disconnect(true);
      return;
    }
    console.log(`Connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Disconnected: ${client.id}`);
    const result = this.roomsService.handleDisconnect(client.id);
    if (!result) return;
    if (result.stoppedTyping) {
      this.server.to(result.roomCode).emit('room:typing', {
        ...result.stoppedTyping,
        isTyping: false,
      });
    }
    this.publishRoomState(result.roomCode);
  }

   private ip(client: Socket): string {
    if (process.env.TRUST_PROXY === 'true') {
      const forwarded = client.handshake.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        const parts = forwarded.split(',').map((p) => p.trim());
        return parts[parts.length - 1]; // the entry added by the host's proxy
      }
    }
    return client.handshake.address;
  }
  
  @SubscribeMessage('room:create')
  async handleCreate(
    @MessageBody() data: { name: string; clientIdentity: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`create:${this.ip(client)}`, 5, 60_000)) return TOO_MANY;

   const result = this.roomsService.createRoom(data?.name, client.id, data?.clientIdentity);
   if (typeof result.roomCode === 'string') {
     await client.join(result.roomCode);
     this.publishRoomState(result.roomCode);
   }
   return result;
  }

  @SubscribeMessage('room:join')
  async handleJoin(
    @MessageBody() data: { code: string; clientIdentity: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Limits code guessing
    if (!this.rateLimit.allow(`code:${this.ip(client)}`, 10, 60_000)) return TOO_MANY;

   const result = this.roomsService.joinRoom(data?.code, client.id, data?.clientIdentity);
   if (result.waitingForOwner && result.waitRoom) {
     await client.join(this.waitingRoom(result.waitRoom));
     return {
       waitingForOwner: true,
       ...(this.roomsService.isOwnerReady(result.waitRoom) ? { ownerReady: true } : {}),
     };
   }
   if (typeof result.roomCode === 'string') {
     await client.leave(this.waitingRoom(result.roomCode));
     await client.join(result.roomCode);
     this.publishRoomState(result.roomCode);
     client.to(result.roomCode).emit('room:notice', {
       displayName: result.displayName,
     });
   }
    return result;
  }

  @SubscribeMessage('room:preview')
  handlePreview(
    @MessageBody() data: { code: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`preview:${this.ip(client)}`, 10, 60_000)) {
      return TOO_MANY;
    }
    return this.roomsService.previewRoom(data?.code);
  }

  @SubscribeMessage('room:invite:preview')
  handleInvitePreview(
    @MessageBody() data: { token: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`preview:${this.ip(client)}`, 10, 60_000)) {
      return TOO_MANY;
    }
    return this.roomsService.previewInvite(data?.token);
  }

  @SubscribeMessage('room:owner:enter')
  handleOwnerEnter(@ConnectedSocket() client: Socket) {
    const result = this.roomsService.markOwnerReady(client.id);
    if (result.roomCode) {
      this.server.to(this.waitingRoom(result.roomCode)).emit('room:owner:ready');
    }
    return result;
  }

  @SubscribeMessage('room:reconnect')
  async handleReconnect(
    @MessageBody() data: { code: string; token: string; clientIdentity: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`code:${this.ip(client)}`, 10, 60_000)) return TOO_MANY;

   const result = this.roomsService.reconnect(
     data?.code,
     data?.token,
     client.id,
     data?.clientIdentity,
   );
   if ('roomCode' in result && typeof result.roomCode === 'string') {
     await client.join(result.roomCode);
     this.publishRoomState(result.roomCode);
   }
    return result;
  }

  @SubscribeMessage('message:send')
  handleSend(
    @MessageBody() data: { code: string; body: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`msg:${client.id}`, 20, 10_000)) return TOO_MANY;

    this.publishTypingStop(client);
    const result = this.roomsService.sendMessage(data?.code, client.id, data?.body);
    if ('error' in result) return result;

    this.server.to(result.roomCode).emit('message:new', result.message);
    for (const participant of result.mentionedParticipants) {
      if (!participant.socketId) continue;
      this.server.to(participant.socketId).emit('message:mention', {
        senderName: result.message.senderName,
        messageId: result.message.id,
      });
    }
    return { ok: true };
  }

  @SubscribeMessage('message:edit')
  handleEditMessage(
    @MessageBody() data: { messageId: string; body: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`msg:${client.id}`, 20, 10_000)) return TOO_MANY;
    const result = this.roomsService.editMessage(
      client.id,
      data?.messageId,
      data?.body,
    );
    if ('error' in result) return result;

    this.server.to(result.roomCode).emit('message:updated', result.message);
    return { ok: true };
  }

  @SubscribeMessage('message:delete')
  handleDeleteMessage(
    @MessageBody() data: { messageId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`msg:${client.id}`, 20, 10_000)) return TOO_MANY;
    const result = this.roomsService.deleteMessage(client.id, data?.messageId);
    if ('error' in result) return result;

    this.server.to(result.roomCode).emit('message:deleted', {
      messageId: result.messageId,
    });
    return { ok: true };
  }

  @SubscribeMessage('typing:update')
  handleTyping(
    @MessageBody() data: { isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    if (typeof data?.isTyping !== 'boolean') return { error: 'Invalid typing state' };
    if (!this.rateLimit.allow(`typing:${client.id}`, 30, 10_000)) return TOO_MANY;

    const result = this.roomsService.updateTyping(client.id, data.isTyping);
    if (!result || 'error' in result) return result ?? { ok: true };
    client.to(result.roomCode).emit('room:typing', {
      participantId: result.participantId,
      displayName: result.displayName,
      isTyping: result.isTyping,
    });
    return { ok: true };
  }

  private publishTypingStop(client: Socket) {
    const result = this.roomsService.updateTyping(client.id, false);
    if (!result || 'error' in result) return;
    client.to(result.roomCode).emit('room:typing', {
      participantId: result.participantId,
      displayName: result.displayName,
      isTyping: false,
    });
  }

  @SubscribeMessage('room:participant:block')
  handleBlockParticipant(
    @MessageBody() data: { participantId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`moderation:${client.id}`, 20, 60_000)) return TOO_MANY;
    const result = this.roomsService.blockParticipant(client.id, data?.participantId);
    if ('error' in result) return result;

    result.stoppedTyping.forEach((participant) => {
      this.server.to(result.roomCode).emit('room:typing', {
        ...participant,
        isTyping: false,
      });
    });
    result.disconnectedSocketIds.forEach((socketId) => {
      this.server.to(socketId).emit('room:blocked');
      this.server.in(socketId).disconnectSockets(true);
    });
    this.publishRoomState(result.roomCode);
    return { ok: true };
  }

  @SubscribeMessage('room:participant:unblock')
  handleUnblockParticipant(
    @MessageBody() data: { blockedId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`moderation:${client.id}`, 20, 60_000)) return TOO_MANY;
    const result = this.roomsService.unblockParticipant(client.id, data?.blockedId);
    if ('error' in result) return result;
    this.publishRoomState(result.roomCode);
    return { ok: true };
  }

  @SubscribeMessage('room:leave')
  async handleLeave(@ConnectedSocket() client: Socket) {
    this.publishTypingStop(client);
    const result = this.roomsService.leaveRoom(client.id);
    if ('roomCode' in result && result.roomCode) {
      await client.leave(result.roomCode);
      this.publishRoomState(result.roomCode);
    }
    return result;
  }

  @SubscribeMessage('room:destroy')
  handleDestroy(@ConnectedSocket() client: Socket) {
    if (!this.rateLimit.allow(`destroy:${client.id}`, 3, 60_000)) return TOO_MANY;
    return this.roomsService.destroyRoom(client.id);
  }
}