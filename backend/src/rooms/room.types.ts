export interface Participant {
  id: string;
  displayName: string;
  tokenHash: string;
  socketId: string | null; // null while disconnected
  isOwner: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: number;
}

export interface Room {
  code: string;
  name: string;
  ownerId: string;
  participants: Map<string, Participant>;
  messages: Message[];
  ownerGraceTimer?: NodeJS.Timeout;
  inactivityTimer?: NodeJS.Timeout;
}