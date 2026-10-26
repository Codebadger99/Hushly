import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { io, type Socket } from 'socket.io-client'
import '@/App.css'
import type {
  BlockedParticipant,
  FlowMode,
  Message,
  RoomParticipant,
  RoomPresence,
  RoomNotice,
  Screen,
  Session,
  SocketResponse,
} from '@/types/hushly'

const socketUrl =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin)
const LandingPage = lazy(() =>
  import('@/pages/LandingPage').then(({ LandingPage }) => ({ default: LandingPage })),
)
const ServerFlowPage = lazy(() =>
  import('@/pages/ServerFlowPage').then(({ ServerFlowPage }) => ({ default: ServerFlowPage })),
)
const ChatRoomPage = lazy(() =>
  import('@/pages/ChatRoomPage').then(({ ChatRoomPage }) => ({ default: ChatRoomPage })),
)
const RoomInvitePage = lazy(() =>
  import('@/pages/RoomInvitePage').then(({ RoomInvitePage }) => ({ default: RoomInvitePage })),
)

const SESSION_STORAGE_KEY = 'hushly-room-session'
const CLIENT_IDENTITY_KEY = 'hushly-client-identity'
const ROOM_CODE_PATTERN = /^[A-HJ-KM-NP-Z2-9]{8}$/

type InvitationQuery = { code: string; error: string } | null

function readInvitationQuery(): InvitationQuery {
  const rawCode = new URLSearchParams(window.location.search).get('invite')
  if (rawCode === null) return null
  const code = rawCode.trim().toUpperCase()
  return ROOM_CODE_PATTERN.test(code)
    ? { code, error: '' }
    : { code: '', error: 'This invitation link is invalid.' }
}

function makeInviteLink(code: string) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('invite', code)
  return url.toString()
}

function getClientIdentity() {
  const existing = localStorage.getItem(CLIENT_IDENTITY_KEY)
  if (
    existing &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      existing,
    )
  ) {
    return existing
  }
  const identity = crypto.randomUUID()
  localStorage.setItem(CLIENT_IDENTITY_KEY, identity)
  return identity
}

function readClientIdentity() {
  try {
    return getClientIdentity()
  } catch {
    return null
  }
}

function isStoredSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Session>
  return (
    typeof candidate.roomCode === 'string' &&
    typeof candidate.roomName === 'string' &&
    typeof candidate.participantId === 'string' &&
    typeof candidate.displayName === 'string' &&
    typeof candidate.token === 'string'
  )
}

function getStoredSession(): Session | null {
  const value = sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (isStoredSession(parsed)) return { ...parsed, messages: [] }
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
  return null
}

function PageLoading() {
  return (
    <main className="grid min-h-svh place-items-center bg-[#0d100d] text-sm text-[#92998d]">
      Making a little space…
    </main>
  )
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const messagesById = new Map(current.map((message) => [message.id, message]))
  incoming.forEach((message) => messagesById.set(message.id, message))
  return [...messagesById.values()].sort((left, right) => left.sentAt - right.sentAt)
}

function App() {
  const [initialInvitation] = useState(readInvitationQuery)
  const [initialSession] = useState(() => (initialInvitation ? null : getStoredSession()))
  const [clientIdentity] = useState(readClientIdentity)
  const [screen, setScreen] = useState<Screen>(
    initialInvitation ? 'invite' : initialSession ? (clientIdentity ? 'chat' : 'join') : 'home',
  )
  const [roomName, setRoomName] = useState('')
  const [inviteCode, setInviteCode] = useState(initialInvitation?.code ?? '')
  const [session, setSession] = useState<Session | null>(initialSession)
  const [inviteRoomName, setInviteRoomName] = useState('')
  const [inviteLoading, setInviteLoading] = useState(
    Boolean(initialInvitation && !initialInvitation.error),
  )
  const [inviteError, setInviteError] = useState(initialInvitation?.error ?? '')
  const [messages, setMessages] = useState<Message[]>(initialSession?.messages ?? [])
  const [draft, setDraft] = useState('')
  const [sendFailure, setSendFailure] = useState<string | null>(null)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [error, setError] = useState(
    clientIdentity ? '' : 'Browser storage is needed to join Hushly. Enable storage and try again.',
  )
  const [copied, setCopied] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectedCount, setConnectedCount] = useState(initialSession ? 1 : 0)
  const [ownerGraceEndsAt, setOwnerGraceEndsAt] = useState<number | null>(null)
  const [welcomeName, setWelcomeName] = useState('')
  const [shareFeedback, setShareFeedback] = useState('')
  const [typingParticipants, setTypingParticipants] = useState<Record<string, string>>({})
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [blockedParticipants, setBlockedParticipants] = useState<BlockedParticipant[]>([])
  const [roomNotices, setRoomNotices] = useState<RoomNotice[]>([])
  const socketRef = useRef<Socket | null>(null)
  const sendingMessageRef = useRef(false)
  const joinedSocketRef = useRef<string | null>(null)
  const roomNoticeSequenceRef = useRef(0)

  const roomCode = session?.roomCode
  const roomToken = session?.token
  const roomNotice = roomNotices[0] ?? null

  useEffect(() => {
    if (!roomNotice) return
    const timer = window.setTimeout(() => {
      setRoomNotices((current) => current.filter((notice) => notice.id !== roomNotice.id))
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [roomNotice])

  useEffect(() => {
    const ownsInviteScreen = screen === 'invite' && session?.isOwner
    if ((screen !== 'chat' && !ownsInviteScreen) || !roomCode || !roomToken || !clientIdentity) {
      return
    }

    const currentRoomCode = roomCode
    const currentRoomToken = roomToken
    const socket = socketRef.current ?? io(socketUrl, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    function handleReconnect() {
      setConnected(true)
      socket.emit(
        'room:reconnect',
        {
          code: currentRoomCode,
          token: currentRoomToken,
          clientIdentity,
        },
        (result: SocketResponse) => {
        const roomName = result.roomName
        const participantId = result.participantId
        const displayName = result.displayName
        const restoredMessages = result.messages
        if (
          result.error ||
          !roomName ||
          !participantId ||
          !displayName ||
          !Array.isArray(restoredMessages)
        ) {
          setError(result.error || 'Could not restore your room. Please join again.')
          socket.disconnect()
          socketRef.current = null
          setConnected(false)
          setSession(null)
          setScreen('join')
          sessionStorage.removeItem(SESSION_STORAGE_KEY)
          return
        }
        const refreshedSession: Session = {
          roomCode: currentRoomCode,
          roomName,
          participantId,
          displayName,
          token: currentRoomToken,
          messages: restoredMessages,
          isOwner: result.isOwner,
        }
        setMessages((current) => mergeMessages(current, restoredMessages))
        setConnectedCount(result.connectedCount ?? 1)
        setSession(refreshedSession)
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(refreshedSession))
        },
      )
    }
    function handleDisconnect() {
      setConnected(false)
    }
    function handleMessage(message: Message) {
      setMessages((current) => mergeMessages(current, [message]))
    }
    function handleMessageUpdated(message: Message) {
      setMessages((current) =>
        current.map((existing) => (existing.id === message.id ? message : existing)),
      )
    }
    function handleMessageDeleted(data: { messageId: string }) {
      if (typeof data?.messageId !== 'string') return
      setMessages((current) => current.filter((message) => message.id !== data.messageId))
    }
    function handleRoomNotice(notice: { displayName: string }) {
      if (typeof notice?.displayName !== 'string' || !notice.displayName.trim()) return
      const id = ++roomNoticeSequenceRef.current
      setRoomNotices((current) => [...current, { id, displayName: notice.displayName }])
    }
    function handleRoomDestroyed() {
      setError('This room has closed. Good things do not need to last forever.')
      socketRef.current = null
      setConnected(false)
      setSession(null)
      setScreen('home')
      setConnectedCount(0)
      setOwnerGraceEndsAt(null)
      setTypingParticipants({})
      setParticipants([])
      setBlockedParticipants([])
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
    }
    function handleRoomPresence(presence: RoomPresence) {
      setConnectedCount(presence.connectedCount)
      setOwnerGraceEndsAt(presence.ownerGraceEndsAt)
    }
    function handleParticipants(data: {
      participants: RoomParticipant[]
      blockedParticipants: BlockedParticipant[]
    }) {
      setParticipants(data.participants)
      setBlockedParticipants(data.blockedParticipants)
    }
    function handleTyping(data: {
      participantId: string
      displayName: string
      isTyping: boolean
    }) {
      setTypingParticipants((current) => {
        const next = { ...current }
        if (data.isTyping) next[data.participantId] = data.displayName
        else delete next[data.participantId]
        return next
      })
    }
    function handleBlocked() {
      setError('The room owner blocked this browser from the room.')
      setSession(null)
      setScreen('join')
      setConnected(false)
      setConnectedCount(0)
      setTypingParticipants({})
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      socketRef.current = null
    }

    setConnected(socket.connected)
    socket.on('connect', handleReconnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('message:new', handleMessage)
    socket.on('message:updated', handleMessageUpdated)
    socket.on('message:deleted', handleMessageDeleted)
    socket.on('room:notice', handleRoomNotice)
    socket.on('room:destroyed', handleRoomDestroyed)
    socket.on('room:presence', handleRoomPresence)
    socket.on('room:participants', handleParticipants)
    socket.on('room:typing', handleTyping)
    socket.on('room:blocked', handleBlocked)
    socket.emit('room:state:request')
    if (socket.connected) {
      if (joinedSocketRef.current === socket.id) {
        joinedSocketRef.current = null
        setConnected(true)
      } else {
        handleReconnect()
      }
    }
    return () => {
      socket.off('connect', handleReconnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('message:new', handleMessage)
      socket.off('message:updated', handleMessageUpdated)
      socket.off('message:deleted', handleMessageDeleted)
      socket.off('room:notice', handleRoomNotice)
      socket.off('room:destroyed', handleRoomDestroyed)
      socket.off('room:presence', handleRoomPresence)
      socket.off('room:participants', handleParticipants)
      socket.off('room:typing', handleTyping)
      socket.off('room:blocked', handleBlocked)
    }
  }, [clientIdentity, roomCode, roomToken, screen, session?.isOwner])

  useEffect(() => {
    if (
      screen !== 'invite' ||
      session?.isOwner ||
      inviteError ||
      !ROOM_CODE_PATTERN.test(inviteCode)
    ) {
      return
    }

    let requested = false
    let cancelled = false
    const socket = io(socketUrl, { transports: ['websocket', 'polling'] })

    function requestPreview() {
      if (requested) return
      requested = true
      socket.emit('room:preview', { code: inviteCode }, (result: SocketResponse) => {
        if (cancelled) return
        setInviteLoading(false)
        if (result.error || !result.roomName) {
          setInviteError(result.error || 'This invitation is no longer available.')
          socket.disconnect()
          return
        }
        setInviteRoomName(result.roomName)
        socket.disconnect()
      })
    }
    function handlePreviewConnectionError() {
      if (cancelled) return
      setInviteLoading(false)
      setInviteError('Could not open this invitation. Check your connection and try again.')
      socket.disconnect()
    }

    socket.on('connect', requestPreview)
    socket.once('connect_error', handlePreviewConnectionError)
    if (socket.connected) requestPreview()
    return () => {
      cancelled = true
      socket.off('connect', requestPreview)
      socket.off('connect_error', handlePreviewConnectionError)
      socket.disconnect()
    }
  }, [inviteCode, inviteError, screen, session?.isOwner])

  function connectToRoom(
    event: FormEvent<HTMLFormElement> | undefined,
    mode: 'create' | 'join',
  ) {
    event?.preventDefault()
    setError('')
    setConnecting(true)
    setConnected(false)
    if (!clientIdentity) {
      setError('Browser storage is needed to join Hushly. Enable storage and try again.')
      setConnecting(false)
      return
    }
    const socket = io(socketUrl, { transports: ['websocket', 'polling'] })
    socketRef.current?.disconnect()
    socketRef.current = socket

    socket.once('connect', () => {
      const eventName = mode === 'create' ? 'room:create' : 'room:join'
      const payload =
        mode === 'create'
          ? { name: roomName, clientIdentity }
          : { code: inviteCode.trim(), clientIdentity }
      socket.emit(eventName, payload, (result: SocketResponse) => {
        if (
          result.error ||
          !result.roomCode ||
          !result.token ||
          !result.roomName ||
          !result.participantId ||
          !result.displayName
        ) {
          setError(result.error || 'Could not enter that room. Check the code and try again.')
          setConnecting(false)
          socket.disconnect()
          socketRef.current = null
          return
        }
        const nextSession: Session = {
          roomCode: result.roomCode,
          roomName: result.roomName,
          participantId: result.participantId,
          displayName: result.displayName,
          token: result.token,
          messages: result.messages ?? [],
          isOwner: mode === 'create',
        }
        setSession(nextSession)
        setMessages(nextSession.messages)
        setConnectedCount(result.connectedCount ?? 1)
        setOwnerGraceEndsAt(null)
        setTypingParticipants({})
        setParticipants([])
        setBlockedParticipants([])
        setRoomNotices([])
        setInviteCode(nextSession.roomCode)
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession))
        setWelcomeName(nextSession.displayName)
        setInviteRoomName(nextSession.roomName)
        setInviteError('')
        setInviteLoading(false)
        setShareFeedback('')
        if (mode === 'join' && new URLSearchParams(window.location.search).has('invite')) {
          window.history.replaceState({}, '', window.location.pathname)
        }
        joinedSocketRef.current = socket.id ?? null
        setConnected(true)
        setConnecting(false)
        setScreen(mode === 'create' ? 'invite' : 'chat')
      })
    })
    socket.once('connect_error', () => {
      setError('Could not reach Hushly right now. Make sure the server is running, then try again.')
      setConnecting(false)
      socket.disconnect()
      socketRef.current = null
    })
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || !session || sendingMessageRef.current) return
    const socket = socketRef.current
    if (!socket?.connected) {
      setSendFailure('Couldn’t send your message. Check your connection and try again.')
      return
    }

    sendingMessageRef.current = true
    setSendingMessage(true)
    setSendFailure(null)
    socket.timeout(10_000).emit(
      'message:send',
      { code: session.roomCode, body },
      (timeoutError: Error | null, result?: SocketResponse) => {
        sendingMessageRef.current = false
        setSendingMessage(false)
        if (timeoutError || !result) {
          setSendFailure('Couldn’t send your message. Check your connection and try again.')
          return
        }
        if (result.error) {
          setSendFailure(`${result.error} Try sending your message again.`)
          return
        }
        setDraft((current) => (current === body ? '' : current))
        setSendFailure(null)
        setError('')
      },
    )
  }

  function changeDraft(value: string | ((current: string) => string)) {
    setDraft(value)
    setSendFailure(null)
  }

  function editMessage(messageId: string, body: string) {
    const socket = socketRef.current
    if (!socket?.connected) {
      setError('You’re reconnecting. Try editing your message when you’re back.')
      return
    }
    socket.emit('message:edit', { messageId, body }, (result: SocketResponse) => {
      if (result.error) setError(result.error)
      else setError('')
    })
  }

  function deleteMessage(messageId: string) {
    const socket = socketRef.current
    if (!socket?.connected) {
      setError('You’re reconnecting. Try deleting your message when you’re back.')
      return
    }
    socket.emit('message:delete', { messageId }, (result: SocketResponse) => {
      if (result.error) setError(result.error)
      else setError('')
    })
  }

  function updateTyping(isTyping: boolean) {
    socketRef.current?.emit('typing:update', { isTyping }, (result: SocketResponse) => {
      if (result.error) setError(result.error)
    })
  }

  function blockParticipant(participantId: string) {
    socketRef.current?.emit(
      'room:participant:block',
      { participantId },
      (result: SocketResponse) => {
        if (result.error) setError(result.error)
      },
    )
  }

  function unblockParticipant(blockedId: string) {
    socketRef.current?.emit(
      'room:participant:unblock',
      { blockedId },
      (result: SocketResponse) => {
        if (result.error) setError(result.error)
      },
    )
  }

  function leaveRoom(destroy = false) {
    const socket = socketRef.current
    if (!socket?.connected) {
      setError('You’re reconnecting. Wait for your connection before leaving the room.')
      return
    }
    socket.emit(destroy ? 'room:destroy' : 'room:leave', {}, (result: SocketResponse) => {
      if (result.error) {
        setError(result.error)
        return
      }
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      setSession(null)
      setMessages([])
      setWelcomeName('')
      setRoomNotices([])
      setScreen('home')
      window.history.replaceState({}, '', window.location.pathname)
    })
  }

  async function copyCode() {
    if (!session) return
    try {
      await navigator.clipboard.writeText(session.roomCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Clipboard access is unavailable. You can select and copy the invite code.')
    }
  }

  async function copyShareCode() {
    if (!session) return
    try {
      await navigator.clipboard.writeText(session.roomCode)
      setShareFeedback('Room code copied')
      window.setTimeout(() => setShareFeedback(''), 2200)
    } catch {
      setError('Clipboard access is unavailable. You can select and copy the room code.')
    }
  }

  async function copyInviteLink() {
    if (!session) return
    try {
      await navigator.clipboard.writeText(makeInviteLink(session.roomCode))
      setShareFeedback('Invitation link copied')
      window.setTimeout(() => setShareFeedback(''), 2200)
    } catch {
      setError('Clipboard access is unavailable. Select and copy the invitation link.')
    }
  }

  function enterCreatedRoom() {
    setScreen('chat')
  }

  function enterManualJoin() {
    window.history.replaceState({}, '', window.location.pathname)
    setInviteCode('')
    setInviteRoomName('')
    setInviteError('')
    setScreen('join')
  }

  const navigate = (nextScreen: Screen) => {
    if (new URLSearchParams(window.location.search).has('invite')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (nextScreen === 'create') setRoomName('')
    setScreen(nextScreen)
    setError('')
  }

  if (screen === 'chat' && session) {
    return (
      <Suspense fallback={<PageLoading />}>
        <ChatRoomPage
          session={session}
          messages={messages}
          draft={draft}
          error={error}
          sendFailure={sendFailure}
          sendingMessage={sendingMessage}
          copied={copied}
          connected={connected}
          connectedCount={connectedCount}
          ownerGraceEndsAt={ownerGraceEndsAt}
          welcomeName={welcomeName}
          roomNotice={roomNotice}
          typingParticipants={Object.values(typingParticipants)}
          participants={participants}
          blockedParticipants={blockedParticipants}
          onDraftChange={changeDraft}
          onSend={sendMessage}
          onEditMessage={editMessage}
          onDeleteMessage={deleteMessage}
          onTypingChange={updateTyping}
          onCopyCode={copyCode}
          onBlockParticipant={blockParticipant}
          onUnblockParticipant={unblockParticipant}
          onLeave={() => leaveRoom()}
          onClose={() => leaveRoom(true)}
        />
      </Suspense>
    )
  }

  if (screen === 'invite') {
    return (
      <Suspense fallback={<PageLoading />}>
        <RoomInvitePage
          isOwner={Boolean(session?.isOwner)}
          roomName={session?.isOwner ? session.roomName : inviteRoomName}
          roomCode={session?.isOwner ? session.roomCode : undefined}
          inviteLink={session?.isOwner ? makeInviteLink(session.roomCode) : undefined}
          loading={inviteLoading}
          connecting={connecting}
          error={inviteError || error}
          feedback={shareFeedback}
          joinNotice={session?.isOwner ? roomNotice : null}
          onCopyCode={copyShareCode}
          onCopyLink={copyInviteLink}
          onEnterRoom={enterCreatedRoom}
          onJoinRoom={() => connectToRoom(undefined, 'join')}
          onManualJoin={enterManualJoin}
          onHome={session?.isOwner ? enterCreatedRoom : () => navigate('home')}
        />
      </Suspense>
    )
  }

  if (screen === 'home') {
    return (
      <Suspense fallback={<PageLoading />}>
        <LandingPage onJoin={() => navigate('join')} onCreate={() => navigate('create')} />
      </Suspense>
    )
  }

  const flowMode: FlowMode = screen === 'create' ? 'create' : 'join'

  return (
    <Suspense fallback={<PageLoading />}>
      <ServerFlowPage
        mode={flowMode}
        roomName={roomName}
        onRoomNameChange={setRoomName}
        inviteCode={inviteCode}
        onInviteCodeChange={(value) =>
          setInviteCode(value.toUpperCase().replace(/[^A-HJ-KM-NP-Z2-9]/g, '').slice(0, 8))
        }
        connecting={connecting}
        error={error}
        onSubmit={(event) => connectToRoom(event, flowMode)}
        onNavigate={navigate}
      />
    </Suspense>
  )
}

export default App
