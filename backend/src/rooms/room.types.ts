export interface Participant {
  id: string;
  displayName: string;
  tokenHash: string;
  clientIdentityHash: string;
  socketId: string | null; // null while disconnected
  isOwner: boolean;
}

export interface BlockedParticipant {
  id: string;
  displayName: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: number;
  edited?: boolean;
}

export interface Room {
  code: string;
  inviteToken: string;
  name: string;
  ownerId: string;
  participants: Map<string, Participant>;
  blockedParticipants: Map<string, BlockedParticipant>;
  typingParticipantIds: Set<string>;
  messages: Message[];
  ownerGraceTimer?: NodeJS.Timeout;
  ownerGraceEndsAt?: number;
  inactivityTimer?: NodeJS.Timeout;
}