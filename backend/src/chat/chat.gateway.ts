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
    this.roomsService.setDestroyHandler((code) => {
      this.server.to(code).emit('room:destroyed');
      this.server.in(code).disconnectSockets(true);
    });
  }

  handleConnection(client: Socket) {
    console.log(`Connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Disconnected: ${client.id}`);
    this.roomsService.handleDisconnect(client.id);
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
  handleCreate(
    @MessageBody() data: { name: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`create:${this.ip(client)}`, 5, 60_000)) return TOO_MANY;

    const result = this.roomsService.createRoom(data?.name, client.id);
   if (result.roomCode) client.join(result.roomCode);
    return result;
  }

  @SubscribeMessage('room:join')
  handleJoin(
    @MessageBody() data: { code: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Limits code guessing
    if (!this.rateLimit.allow(`code:${this.ip(client)}`, 10, 60_000)) return TOO_MANY;

    const result = this.roomsService.joinRoom(data?.code, client.id);
   if (result.roomCode) client.join(result.roomCode);
    return result;
  }

  @SubscribeMessage('room:reconnect')
  handleReconnect(
    @MessageBody() data: { code: string; token: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`code:${this.ip(client)}`, 10, 60_000)) return TOO_MANY;

    const result = this.roomsService.reconnect(data?.code, data?.token, client.id);
   if (result.roomCode) client.join(result.roomCode);
    return result;
  }

  @SubscribeMessage('message:send')
  handleSend(
    @MessageBody() data: { code: string; body: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.rateLimit.allow(`msg:${client.id}`, 20, 10_000)) return TOO_MANY;

    const result = this.roomsService.sendMessage(data?.code, client.id, data?.body);
    if ('error' in result) return result;

    this.server.to(result.roomCode).emit('message:new', result.message);
    return { ok: true };
  }

  @SubscribeMessage('room:leave')
  handleLeave(@ConnectedSocket() client: Socket) {
    const result = this.roomsService.leaveRoom(client.id);
    if ('roomCode' in result && result.roomCode) client.leave(result.roomCode);
    return result;
  }

  @SubscribeMessage('room:destroy')
  handleDestroy(@ConnectedSocket() client: Socket) {
    return this.roomsService.destroyRoom(client.id);
  }
}