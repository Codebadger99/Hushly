export interface User {
   id: string
   display_name: string
   tokenhash: string
   socketId: string | null
   IsOwner: boolean
}

export interface Message{
 id: string
 senderId: string
 senderName: string
 body: string
 sentAt: number
}

export interface Room{
    code: string
    name: string
    ownerId: string
    participants: Map<string, User>
    ownerGraceTimer: NodeJS.Timeout
    inactivityTimer: NodeJS.Timeout
}