import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TokenService } from '../identity/token.service';
import { IdentityService } from '../identity/identity.service';
import { RoomsService } from './rooms.service';

const OWNER_IDENTITY = 'a0000000-0000-4000-8000-000000000001';
const GUEST_IDENTITY = 'b0000000-0000-4000-8000-000000000002';
const SECOND_GUEST_IDENTITY = 'c0000000-0000-4000-8000-000000000003';

describe('RoomsService', () => {
  let service: RoomsService;
  let nameCounter: number;

  beforeEach(async () => {
    nameCounter = 0;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'OWNER_GRACE_MS' ? 30_000 : 900_000,
          },
        },
        {
          provide: IdentityService,
          useValue: { generateName: () => `Guest ${++nameCounter}` },
        },
        { provide: TokenService, useValue: new TokenService() },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('blocks a browser from rejoining until the owner unblocks it', () => {
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner) || !('participantId' in owner)) {
      throw new Error('Expected the room to be created');
    }
    service.markOwnerReady('owner-socket');
    const guest = service.joinRoom(owner.roomCode, 'guest-socket', GUEST_IDENTITY);
    if (!('participantId' in guest)) throw new Error('Expected the guest to join');
    service.updateTyping('guest-socket', true);

    const blocked = service.blockParticipant('owner-socket', guest.participantId);
    if (!('blocked' in blocked)) throw new Error('Expected the guest to be blocked');
    expect(blocked.disconnectedSocketIds).toContain('guest-socket');
    expect(blocked.stoppedTyping).toContainEqual({
      participantId: guest.participantId,
      displayName: guest.displayName,
    });
    expect(
      service.joinRoom(owner.roomCode, 'guest-retry', GUEST_IDENTITY),
    ).toEqual({
      error: 'This browser has been blocked from this room. Ask the owner to unblock you.',
    });

    expect(
      service.unblockParticipant('owner-socket', blocked.blocked.id),
    ).toEqual({ ok: true, roomCode: owner.roomCode });
    expect(
      service.joinRoom(owner.roomCode, 'guest-retry', GUEST_IDENTITY),
    ).toHaveProperty('participantId');
  });

  it('tracks live participants and owner-only roster data', () => {
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner)) throw new Error('Expected the room to be created');
    service.markOwnerReady('owner-socket');
    const guest = service.joinRoom(owner.roomCode, 'guest-socket', GUEST_IDENTITY);
    if (!('participantId' in guest)) throw new Error('Expected the guest to join');

    expect(service.getRoomPresence(owner.roomCode)).toEqual({
      connectedCount: 2,
      ownerGraceEndsAt: null,
    });
    expect(service.getRoomParticipants(owner.roomCode)).toHaveLength(2);
    expect(service.getOwnerRoster(owner.roomCode)?.participants).toHaveLength(2);
  });

  it('caps rooms at 100 participants', () => {
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner)) throw new Error('Expected the room to be created');
    service.markOwnerReady('owner-socket');

    for (let index = 1; index < 100; index += 1) {
      const identity = `b0000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
      const joined = service.joinRoom(owner.roomCode, `guest-${index}`, identity);
      expect(joined).toHaveProperty('participantId');
    }

    expect(service.getOwnerRoster(owner.roomCode)?.participants).toHaveLength(100);
    expect(
      service.joinRoom(
        owner.roomCode,
        'extra-guest',
        'c0000000-0000-4000-8000-000000000003',
      ),
    ).toEqual({
      error: 'This room is full. Ask the host to make space and try again.',
    });
  });

  it('previews a room by invite code without exposing its code', () => {
    const owner = service.createRoom('Midnight lounge', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner)) throw new Error('Expected the room to be created');
    service.markOwnerReady('owner-socket');

    expect(service.previewRoom(owner.roomCode)).toEqual({
      roomName: 'Midnight lounge',
    });
    expect(service.previewRoom('NOTACODE')).toEqual({ error: 'Room not found' });
  });

  it('previews a room using an opaque invite token without exposing its code', () => {
    const owner = service.createRoom('Midnight lounge', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner) || !('inviteToken' in owner)) {
      throw new Error('Expected the room to be created');
    }
    service.markOwnerReady('owner-socket');

    expect(owner.inviteToken).not.toBe(owner.roomCode);
    expect(service.previewInvite(owner.inviteToken)).toEqual({
      roomName: 'Midnight lounge',
    });
    expect(service.previewInvite('not-a-valid-token')).toEqual({ error: 'Room not found' });
    const guest = service.joinRoom(owner.roomCode, 'guest-socket', GUEST_IDENTITY);
    expect(guest).toMatchObject({
      roomCode: owner.roomCode,
    });
    expect(guest).not.toHaveProperty('inviteToken');
  });

  it('reports typing status only when a participant changes typing state', () => {
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner)) throw new Error('Expected the room to be created');
    service.markOwnerReady('owner-socket');
    const guest = service.joinRoom(owner.roomCode, 'guest-socket', GUEST_IDENTITY);
    if (!('participantId' in guest)) throw new Error('Expected the guest to join');

    expect(service.updateTyping('guest-socket', true)).toMatchObject({
      displayName: guest.displayName,
      isTyping: true,
    });
    expect(service.updateTyping('guest-socket', true)).toBeNull();
    expect(service.updateTyping('guest-socket', false)).toMatchObject({
      displayName: guest.displayName,
      isTyping: false,
    });
  });

  it('identifies active participants mentioned by their exact display name', () => {
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner) || !('participantId' in owner)) {
      throw new Error('Expected the room to be created');
    }
    service.markOwnerReady('owner-socket');
    const guest = service.joinRoom(owner.roomCode, 'guest-socket', GUEST_IDENTITY);
    if (!('participantId' in guest)) throw new Error('Expected the guest to join');

    const sent = service.sendMessage(
      owner.roomCode,
      'guest-socket',
      `Hello @${owner.displayName}!`,
    );
    if (!('message' in sent)) throw new Error('Expected the message to be sent');
    expect(sent.mentionedParticipants).toEqual([
      {
        id: owner.participantId,
        displayName: owner.displayName,
        socketId: 'owner-socket',
      },
    ]);

    const partialMatch = service.sendMessage(
      owner.roomCode,
      'guest-socket',
      `Hello @${owner.displayName}x`,
    );
    if (!('message' in partialMatch)) throw new Error('Expected the message to be sent');
    expect(partialMatch.mentionedParticipants).toEqual([]);
  });

  it('lets message authors edit and owners delete messages without leaving a tombstone', () => {
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner)) throw new Error('Expected the room to be created');
    service.markOwnerReady('owner-socket');
    const guest = service.joinRoom(owner.roomCode, 'guest-socket', GUEST_IDENTITY);
    if (!('participantId' in guest)) throw new Error('Expected the guest to join');
    const sent = service.sendMessage(owner.roomCode, 'guest-socket', 'Original message');
    if (!('message' in sent)) throw new Error('Expected the message to be sent');

    expect(service.editMessage('owner-socket', sent.message.id, 'Owner edit')).toMatchObject({
      roomCode: owner.roomCode,
      message: {
        id: sent.message.id,
        body: 'Owner edit',
        edited: true,
      },
    });
    expect(
      service.editMessage('guest-socket', sent.message.id, '  Edited message  '),
    ).toMatchObject({
      roomCode: owner.roomCode,
      message: {
        id: sent.message.id,
        body: 'Edited message',
        edited: true,
      },
    });

    expect(service.deleteMessage('owner-socket', sent.message.id)).toEqual({
      roomCode: owner.roomCode,
      messageId: sent.message.id,
    });
    const restored = service.reconnect(
      owner.roomCode,
      guest.token,
      'guest-reconnected',
      GUEST_IDENTITY,
    );
    expect('messages' in restored ? restored.messages : null).toEqual([]);
  });

  it('prevents participants from editing or deleting someone else’s messages', () => {
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner)) throw new Error('Expected the room to be created');
    service.markOwnerReady('owner-socket');
    const guest = service.joinRoom(owner.roomCode, 'guest-socket', GUEST_IDENTITY);
    if (!('participantId' in guest)) throw new Error('Expected the guest to join');
    const sent = service.sendMessage(owner.roomCode, 'owner-socket', 'Owner message');
    if (!('message' in sent)) throw new Error('Expected the message to be sent');

    expect(service.editMessage('guest-socket', sent.message.id, 'Changed')).toEqual({
      error: 'Not allowed',
    });
    expect(service.deleteMessage('guest-socket', sent.message.id)).toEqual({
      error: 'Not allowed',
    });
  });

  it('sets an owner reconnect grace deadline when the owner disconnects', () => {
    jest.useFakeTimers();
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner)) throw new Error('Expected the room to be created');

    expect(owner.ownerGraceMs).toBe(30_000);
    service.handleDisconnect('owner-socket');

    expect(service.getRoomPresence(owner.roomCode)?.ownerGraceEndsAt).toBe(
      Date.now() + 30_000,
    );
  });

  it('holds guests until the owner enters and after they reconnect', () => {
    jest.useFakeTimers();
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner)) throw new Error('Expected the room to be created');

    expect(service.joinRoom(owner.roomCode, 'guest-socket', GUEST_IDENTITY)).toMatchObject({
      waitingForOwner: true,
    });
    service.markOwnerReady('owner-socket');
    expect(service.joinRoom(owner.roomCode, 'guest-socket', GUEST_IDENTITY)).toHaveProperty(
      'participantId',
    );

    service.handleDisconnect('owner-socket');

    expect(service.joinRoom(owner.roomCode, 'guest-retry', SECOND_GUEST_IDENTITY)).toEqual({
      waitingForOwner: true,
      waitRoom: owner.roomCode,
    });

    const reconnected = service.reconnect(
      owner.roomCode,
      owner.token,
      'owner-reconnected',
      OWNER_IDENTITY,
    );
    expect(reconnected).toHaveProperty('isOwner', true);
    expect(service.joinRoom(owner.roomCode, 'guest-retry', SECOND_GUEST_IDENTITY)).toMatchObject({
      waitingForOwner: true,
    });
    service.markOwnerReady('owner-reconnected');
    expect(service.joinRoom(owner.roomCode, 'guest-retry', SECOND_GUEST_IDENTITY)).toHaveProperty(
      'participantId',
    );
  });

  it('destroys the room and its contents when the owner does not reconnect', () => {
    jest.useFakeTimers();
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner)) throw new Error('Expected the room to be created');
    service.markOwnerReady('owner-socket');
    const guest = service.joinRoom(owner.roomCode, 'guest-socket', GUEST_IDENTITY);
    if (!('participantId' in guest)) throw new Error('Expected the guest to join');
    service.sendMessage(owner.roomCode, 'guest-socket', 'Room message');
    const onDestroyed = jest.fn();
    service.setDestroyHandler(onDestroyed);

    service.handleDisconnect('owner-socket');
    jest.advanceTimersByTime(30_000);

    expect(onDestroyed).toHaveBeenCalledWith(owner.roomCode, 'owner-disconnected');
    expect(service.previewRoom(owner.roomCode)).toEqual({ error: 'Room not found' });
    expect(service.previewInvite(owner.inviteToken)).toEqual({ error: 'Room not found' });
    expect(service.reconnect(owner.roomCode, guest.token, 'guest-retry', GUEST_IDENTITY))
      .toEqual({ error: 'Room not found' });
  });

  it('keeps the room when the owner reconnects before the grace period ends', () => {
    jest.useFakeTimers();
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner)) throw new Error('Expected the room to be created');

    service.handleDisconnect('owner-socket');
    const reconnected = service.reconnect(
      owner.roomCode,
      owner.token,
      'owner-reconnected',
      OWNER_IDENTITY,
    );
    expect(reconnected).toHaveProperty('roomCode', owner.roomCode);
    expect(reconnected).toHaveProperty('ownerGraceMs', 30_000);
    expect(reconnected).toHaveProperty('inviteToken', owner.inviteToken);

    jest.advanceTimersByTime(30_000);

    expect(service.previewRoom(owner.roomCode)).toEqual({ roomName: 'A room' });
  });

  it('destroys the room when its owner explicitly ends it', () => {
    const owner = service.createRoom('A room', 'owner-socket', OWNER_IDENTITY);
    if (!('roomCode' in owner)) throw new Error('Expected the room to be created');
    const onDestroyed = jest.fn();
    service.setDestroyHandler(onDestroyed);

    expect(service.destroyRoom('owner-socket')).toEqual({ ok: true });

    expect(onDestroyed).toHaveBeenCalledWith(owner.roomCode, 'owner-ended');
    expect(service.previewRoom(owner.roomCode)).toEqual({ error: 'Room not found' });
  });
});
