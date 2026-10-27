import type { FormEvent } from 'react'

export type Screen = 'home' | 'create' | 'join' | 'chat' | 'invite'

export type Message = {
  id: string
  senderId: string
  senderName: string
  body: string
  sentAt: number
  edited?: boolean
}

export type Session = {
  roomCode: string
  roomName: string
  participantId: string
  displayName: string
  token: string
  messages: Message[]
  isOwner?: boolean
  inviteToken?: string
}

export type RoomParticipant = {
  id: string
  displayName: string
  isOwner: boolean
  connected: boolean
}

export type BlockedParticipant = {
  id: string
  displayName: string
}

export type SocketResponse = Partial<Session> & {
  error?: string
  ok?: boolean
  waitingForOwner?: boolean
  ownerReady?: boolean
  connectedCount?: number
  ownerGraceMs?: number
}

export type RoomPresence = {
  connectedCount: number
  ownerGraceEndsAt: number | null
}

export type RoomNotice = {
  id: number
  displayName: string
  kind: 'joined' | 'mention'
  leaving?: boolean
}

export type FlowMode = Extract<Screen, 'create' | 'join'>

export type FlowSubmitHandler = (event: FormEvent<HTMLFormElement>) => void

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export const firstNameInitial = (name: string) =>
  name.trim().split(/\s+/)[0]?.charAt(0).toUpperCase() ?? ''

export function avatarColor(identity: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 0x01000193)
  }

  const hue = (hash >>> 0) % 360
  const saturation = 56 + ((hash >>> 9) % 15)
  const lightness = 72 + ((hash >>> 18) % 8)
  return {
    backgroundColor: `hsl(${hue} ${saturation}% 25%)`,
    color: `hsl(${hue} ${saturation}% ${lightness}%)`,
  }
}
