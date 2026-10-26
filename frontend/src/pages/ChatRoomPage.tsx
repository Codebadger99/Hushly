import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as AlertDialog from 'radix-ui/alert-dialog'
import * as Dialog from 'radix-ui/dialog'
import * as DropdownMenu from 'radix-ui/dropdown-menu'
import * as Popover from 'radix-ui/popover'
import {
  ArrowUp,
  Check,
  X,
  MoreHorizontal,
  Pencil,
  Smile,
  Ticket,
  Timer,
  Trash2,
  UserRoundMinus,
  UserRoundPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  BlockedParticipant,
  Message,
  RoomNotice,
  RoomParticipant,
  Session,
} from '@/types/hushly'
import { avatarColor, initials } from '@/types/hushly'
import Logo from '../../public/Spirit mark.png'

const composerEmojis = ['😊', '😂', '🥹', '😍', '😎', '👀', '🙌', '👏', '❤️', '✨', '🔥', '👍']

type ChatRoomPageProps = {
  session: Session
  messages: Message[]
  draft: string
  error: string
  sendFailure: string | null
  sendingMessage: boolean
  copied: boolean
  connected: boolean
  connectedCount: number
  ownerGraceEndsAt: number | null
  pendingRoomEnd: boolean
  welcomeName: string
  roomNotice: RoomNotice | null
  typingParticipants: string[]
  participants: RoomParticipant[]
  blockedParticipants: BlockedParticipant[]
  onDraftChange: (value: string | ((current: string) => string)) => void
  onDismissError: () => void
  onDismissSendFailure: () => void
  onSend: (event: FormEvent<HTMLFormElement>) => void
  onEditMessage: (messageId: string, body: string) => void
  onDeleteMessage: (messageId: string) => void
  onTypingChange: (isTyping: boolean) => void
  onCopyCode: () => void
  onBlockParticipant: (participantId: string) => void
  onUnblockParticipant: (blockedId: string) => void
  onLeave: () => void
  onClose: () => void
}

export function ChatRoomPage({
  session,
  messages,
  draft,
  error,
  sendFailure,
  sendingMessage,
  copied,
  connected,
  connectedCount,
  ownerGraceEndsAt,
  pendingRoomEnd,
  welcomeName,
  roomNotice,
  typingParticipants,
  participants,
  blockedParticipants,
  onDraftChange,
  onDismissError,
  onDismissSendFailure,
  onSend,
  onEditMessage,
  onDeleteMessage,
  onTypingChange,
  onCopyCode,
  onBlockParticipant,
  onUnblockParticipant,
  onLeave,
  onClose,
}: ChatRoomPageProps) {
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const typingStateRef = useRef(false)
  const messageHoldTimerRef = useRef<number | null>(null)
  const messageHoldOriginRef = useRef<{ x: number; y: number } | null>(null)
  const draftBeforeEditRef = useRef('')
  const holdTriggeredRef = useRef(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [managePeopleOpen, setManagePeopleOpen] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [heldMessage, setHeldMessage] = useState<{
    messageId: string
    x: number
    y: number
  } | null>(null)
  const [welcomeVisible, setWelcomeVisible] = useState(Boolean(welcomeName))
  const [clockNow, setClockNow] = useState(() => Date.now())

  useEffect(() => {
    if (!ownerGraceEndsAt) return
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [ownerGraceEndsAt])

  useEffect(
    () => () => {
      if (messageHoldTimerRef.current !== null) {
        window.clearTimeout(messageHoldTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!heldMessage) return
    function dismissMessageActions(event: PointerEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest('.message-hold-actions')
      ) {
        return
      }
      setHeldMessage(null)
    }
    document.addEventListener('pointerdown', dismissMessageActions)
    return () => document.removeEventListener('pointerdown', dismissMessageActions)
  }, [heldMessage])

  useEffect(() => {
    if (!welcomeName) return
    const timer = window.setTimeout(() => setWelcomeVisible(false), 5000)
    return () => window.clearTimeout(timer)
  }, [welcomeName])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!draft && composerRef.current) composerRef.current.style.height = 'auto'
  }, [draft])

  function setTyping(isTyping: boolean) {
    if (typingStateRef.current === isTyping) return
    typingStateRef.current = isTyping
    onTypingChange(isTyping)
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    setTyping(false)
    if (!editingMessageId) {
      onSend(event)
      return
    }
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    onEditMessage(editingMessageId, body)
    setEditingMessageId(null)
    draftBeforeEditRef.current = ''
    onDraftChange('')
  }

  function beginEdit(message: Message) {
    draftBeforeEditRef.current = draft
    setEditingMessageId(message.id)
    onDraftChange(message.body)
    setHeldMessage(null)
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  function cancelEdit() {
    setEditingMessageId(null)
    onDraftChange(draftBeforeEditRef.current)
    draftBeforeEditRef.current = ''
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  function cancelMessageHold() {
    if (messageHoldTimerRef.current !== null) {
      window.clearTimeout(messageHoldTimerRef.current)
      messageHoldTimerRef.current = null
    }
    messageHoldOriginRef.current = null
  }

  function startMessageHold(message: Message, x: number, y: number) {
    const own = message.senderId === session.participantId
    if (!own && !session.isOwner) return
    cancelMessageHold()
    holdTriggeredRef.current = false
    messageHoldOriginRef.current = { x, y }
    messageHoldTimerRef.current = window.setTimeout(() => {
      holdTriggeredRef.current = true
      setHeldMessage({
        messageId: message.id,
        x: Math.max(8, Math.min(x, window.innerWidth - 170)),
        y: Math.max(8, Math.min(y - 54, window.innerHeight - 58)),
      })
      messageHoldTimerRef.current = null
    }, 500)
  }

  function handleMessagePointerMove(x: number, y: number) {
    const origin = messageHoldOriginRef.current
    if (!origin || messageHoldTimerRef.current === null) return
    if (Math.hypot(x - origin.x, y - origin.y) > 12) cancelMessageHold()
  }

  const typingLabel =
    typingParticipants.length === 1
      ? `${typingParticipants[0]} is typing…`
      : typingParticipants.length === 2
        ? `${typingParticipants[0]} and ${typingParticipants[1]} are typing…`
        : typingParticipants.length > 2
          ? `${typingParticipants[0]} and ${typingParticipants.length - 1} others are typing…`
          : null
  const graceSeconds =
    ownerGraceEndsAt === null
      ? null
      : Math.max(0, Math.ceil((ownerGraceEndsAt - clockNow) / 1000))
  const lastOwnMessageId = [...messages]
    .reverse()
    .find((message) => message.senderId === session.participantId)?.id
  const connectedParticipants = participants.filter((participant) => participant.connected)

  return (
    <main className="chat-shell min-h-svh bg-[#0d100d] text-[#edeee8]">
      <header className="chat-header flex items-center justify-between border-b border-[#2b3229]">
        <div className="chat-room-title">
          <div className="chat-room-heading">
            <h1>{session.roomName}</h1>
          </div>
          <span className="chat-room-status">
            <i className={connected ? 'online-dot' : 'online-dot offline'} />
            {connected
              ? `${connectedCount} ${connectedCount === 1 ? 'person' : 'people'} connected`
              : 'Reconnecting'}
          </span>
        </div>
        <div className="chat-actions flex items-center gap-3">
          {session.isOwner ? (
            <Button
              className="chat-code-button rounded-md px-2 py-1 text-xs text-[#92998d] hover:bg-[#20251f] hover:text-[#d5ff67]"
              variant="ghost"
              type="button"
              onClick={onCopyCode}
              aria-label={`Copy room code ${session.roomCode}`}
            >
              <Ticket size={14} /> {session.roomCode}
            </Button>
          ) : (
            <span className="private-room-label">Private room</span>
          )}
          <span className="profile-pill hidden place-items-center md:grid" title={session.displayName}>
            {initials(session.displayName)}
          </span>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="icon-button size-8 text-[#81897d]"
                aria-label="Room menu"
              >
                <MoreHorizontal size={20} />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="chat-room-menu z-50 min-w-40 rounded-lg border border-[#2b3229] bg-[#191d18] p-1 shadow-xl"
                align="end"
                sideOffset={8}
              >
                {session.isOwner && (
                  <>
                    <DropdownMenu.Item
                      className="cursor-pointer rounded px-2 py-2 text-xs text-[#dce0d5] outline-none hover:bg-[#272d25] focus:bg-[#272d25]"
                      onSelect={onCopyCode}
                    >
                      Copy invite code
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cursor-pointer rounded px-2 py-2 text-xs text-[#dce0d5] outline-none hover:bg-[#272d25] focus:bg-[#272d25]"
                      onSelect={() => setManagePeopleOpen(true)}
                    >
                      Manage people
                    </DropdownMenu.Item>
                  </>
                )}
                {!session.isOwner && (
                  <DropdownMenu.Item
                    className="cursor-pointer rounded px-2 py-2 text-xs text-[#dce0d5] outline-none hover:bg-[#272d25] focus:bg-[#272d25]"
                    onSelect={onLeave}
                  >
                    Leave room
                  </DropdownMenu.Item>
                )}
                {session.isOwner && (
                  <DropdownMenu.Item
                    className="danger-item cursor-pointer rounded px-2 py-2 text-xs outline-none hover:bg-[#272d25] focus:bg-[#272d25]"
                    onSelect={(event) => {
                      event.preventDefault()
                      setConfirmClose(true)
                    }}
                  >
                    End room for everyone
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <Dialog.Root open={managePeopleOpen} onOpenChange={setManagePeopleOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="people-dialog-overlay fixed inset-0 z-50 bg-black/70" />
          <Dialog.Content className="people-dialog fixed left-1/2 top-1/2 z-50 w-[min(calc(100%-2rem),460px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#30382d] bg-[#171b17] shadow-2xl">
            <Dialog.Title className="text-lg font-semibold text-[#edeee8]">
              Manage people
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-[#b7bead]">
              Block a browser to remove it and prevent it from rejoining with this room code.
            </Dialog.Description>
            <section className="people-section" aria-label="People in this room">
              <h3>In this room ({connectedCount} connected)</h3>
              <div className="people-list">
                {connectedParticipants.map((participant) => (
                  <div className="person-row" key={participant.id}>
                    <div className="person-details">
                      <strong>{participant.displayName}{participant.isOwner ? ' (you)' : ''}</strong>
                      <span>{participant.connected ? 'Connected' : 'Away'}</span>
                    </div>
                    {!participant.isOwner && (
                      <Button
                        className="person-action block-person"
                        type="button"
                        variant="ghost"
                        aria-label={`Block ${participant.displayName}`}
                        onClick={() => onBlockParticipant(participant.id)}
                      >
                        <UserRoundMinus size={16} />
                        <span>Block</span>
                      </Button>
                    )}
                  </div>
                ))}
                {connectedParticipants.length === 0 && (
                  <p className="people-empty">No one is connected right now.</p>
                )}
              </div>
            </section>
            <section className="people-section blocked-section" aria-label="Blocked browsers">
              <h3>Blocked browsers ({blockedParticipants.length})</h3>
              <div className="people-list">
                {blockedParticipants.map((blocked) => (
                  <div className="person-row" key={blocked.id}>
                    <div className="person-details">
                      <strong>{blocked.displayName}</strong>
                      <span>Can’t rejoin until unblocked</span>
                    </div>
                    <Button
                      className="person-action unblock-person"
                      type="button"
                      variant="ghost"
                      aria-label={`Unblock ${blocked.displayName}`}
                      onClick={() => onUnblockParticipant(blocked.id)}
                    >
                      <UserRoundPlus size={16} />
                      <span>Unblock</span>
                    </Button>
                  </div>
                ))}
                {blockedParticipants.length === 0 && (
                  <p className="people-empty">No browsers are blocked.</p>
                )}
              </div>
            </section>
            <p className="block-scope-note">
              Blocks are tied to this browser profile. Clearing site data or switching browsers/devices
              can reset this anonymous identity.
            </p>
            <div className="people-dialog-actions">
              <Dialog.Close asChild>
                <Button
                  variant="secondary"
                  className="rounded-lg border border-[#30382d] bg-[#20251f] text-sm text-[#edeee8]"
                >
                  Done
                </Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {!connected &&
        (!session.isOwner || pendingRoomEnd || graceSeconds === null) && (
        <p className="connection-alert" role="alert">
          <span>
            {pendingRoomEnd
              ? 'End room requested. It will close as soon as your connection returns.'
              : 'Connection lost. Reconnecting to your room…'}
          </span>
        </p>
      )}

      <AlertDialog.Root open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="close-room-overlay fixed inset-0 z-50 bg-black/65" />
          <AlertDialog.Content className="close-room-dialog fixed left-1/2 top-1/2 z-50 w-[min(calc(100%-2rem),420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#30382d] bg-[#171b17]">
            <AlertDialog.Title className="text-lg font-semibold text-[#edeee8]">
              End this room?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-[#b7bead]">
              Everyone will be disconnected, and the room’s messages and invite code will be deleted.
              This can’t be undone.
            </AlertDialog.Description>
            <div className="close-room-actions mt-6 flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <Button
                  variant="secondary"
                  className="rounded-lg border border-[#30382d] bg-[#20251f] text-sm text-[#edeee8]"
                >
                  Keep room open
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  className="end-room-confirm-button rounded-lg text-sm font-semibold"
                  onClick={onClose}
                >
                  End room for everyone
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {copied && (
        <div className="toast flex items-center gap-2" role="status">
          Invite code copied <Check size={14} />
        </div>
      )}
      {welcomeVisible && welcomeName && (
        <div className="welcome-toast" role="status">
          <span className="profile-pill toast-avatar" aria-hidden="true">
            {initials(welcomeName).slice(0, 1)}
          </span>
          <span>
            <strong>You’re {welcomeName}</strong>
            <small>That’s your name for this room.</small>
          </span>
        </div>
      )}
      {roomNotice && (
        <div className="welcome-toast join-notice-toast" role="status" aria-live="polite">
          <span className="profile-pill toast-avatar" aria-hidden="true">
            {initials(roomNotice.displayName).slice(0, 1)}
          </span>
          <span>
            <strong>{roomNotice.displayName} joined the room</strong>
            <small>Say hello and make them feel welcome.</small>
          </span>
        </div>
      )}

      <section className="conversation overflow-y-auto" aria-label="Room conversation" aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-orbit">
              <img className="chat-spirit-mark" src={Logo} alt="" />
            </div>
            <h2>A little space. A lot to say.</h2>
            <p>Start with a question, a thought, or whatever brought you here.</p>
          </div>
        ) : (
          messages.map((message, index) => {
            const own = message.senderId === session.participantId
            const previous = messages[index - 1]
            const grouped =
              previous?.senderId === message.senderId &&
              message.sentAt - previous.sentAt < 120000
            const canEdit = own || Boolean(session.isOwner)
            const canDelete = own || Boolean(session.isOwner)

            return (
              <div key={message.id} className="message-line">
                <article
                  className={`message-row ${own ? 'own-message' : ''} ${grouped ? 'grouped-message' : ''}`}
                >
                  {!own &&
                    (!grouped ? (
                      <div
                        className="avatar"
                        role="img"
                        aria-label={message.senderName}
                        style={avatarColor(message.senderId)}
                      >
                        {initials(message.senderName)}
                      </div>
                    ) : (
                      <div className="avatar-spacer" />
                    ))}
                  <div className="message-content">
                    <div className="message-body-row">
                      <p
                        className="message-bubble"
                        onPointerDown={(event) => {
                          if (event.button !== 0) return
                          startMessageHold(message, event.clientX, event.clientY)
                        }}
                        onPointerMove={(event) =>
                          handleMessagePointerMove(event.clientX, event.clientY)
                        }
                        onPointerUp={cancelMessageHold}
                        onPointerCancel={cancelMessageHold}
                        onPointerLeave={cancelMessageHold}
                        onContextMenu={(event) => {
                          if (!canEdit && !canDelete) return
                          event.preventDefault()
                          setHeldMessage({
                            messageId: message.id,
                            x: Math.max(8, Math.min(event.clientX, window.innerWidth - 170)),
                            y: Math.max(8, Math.min(event.clientY - 54, window.innerHeight - 58)),
                          })
                        }}
                        onClick={(event) => {
                          if (!holdTriggeredRef.current) return
                          event.preventDefault()
                          event.stopPropagation()
                          holdTriggeredRef.current = false
                        }}
                      >
                        {message.body}
                      </p>
                    </div>
                    {(message.edited || (own && message.id === lastOwnMessageId)) && (
                      <div className="message-meta-row">
                        {message.edited && <span className="message-edited">Edited</span>}
                        {own && message.id === lastOwnMessageId && (
                          <span className="message-status">Sent</span>
                        )}
                      </div>
                    )}
                  </div>
                  {own &&
                    (!grouped ? (
                      <div
                        className="avatar avatar-own"
                        role="img"
                        aria-label={`You, ${session.displayName}`}
                      >
                        {initials(session.displayName)}
                      </div>
                    ) : (
                      <div className="avatar-spacer" />
                    ))}
                </article>
              </div>
            )
          })
        )}
        {heldMessage &&
          messages.some((message) => message.id === heldMessage.messageId) &&
          (() => {
            const message = messages.find((item) => item.id === heldMessage.messageId)
            if (!message) return null
            const own = message.senderId === session.participantId
            const canEdit = own || Boolean(session.isOwner)
            const canDelete = own || Boolean(session.isOwner)
            return (
              <div
                className="message-hold-actions"
                role="group"
                aria-label={`Actions for message from ${message.senderName}`}
                style={{ left: heldMessage.x, top: heldMessage.y }}
              >
                {canEdit && (
                  <Button type="button" variant="ghost" onClick={() => beginEdit(message)}>
                    <Pencil size={14} />
                    Edit
                  </Button>
                )}
                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      onDeleteMessage(message.id)
                      setHeldMessage(null)
                    }}
                  >
                    <Trash2 size={14} />
                    Delete
                  </Button>
                )}
              </div>
            )
          })()}
        <div ref={messageEndRef} />
      </section>

      <div className="composer-area">
        <div className="typing-line">
          {typingLabel ? (
            <span className="typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : (
            <span className={`online-dot ${connected ? '' : 'offline'}`} />
          )}
          <span>
            {typingLabel ??
              (connected
              ? 'Messages are limited to 20 every 10 seconds.'
              : 'Reconnecting to your room…')}
          </span>
        </div>
        {graceSeconds !== null && (
          <div className="owner-grace-notice" role="status" aria-live="polite">
            <Timer size={17} aria-hidden="true" />
            <span>
              <strong>Room owner reconnecting</strong>
              <span>
                <b>{graceSeconds}s</b> remaining. The chat will be destroyed if the owner doesn’t reconnect.
              </span>
            </span>
          </div>
        )}
        {editingMessageId && (
          <div className="composer-editing-label">
            <span>
              <Pencil size={13} />
              Editing message
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Cancel editing"
              onClick={cancelEdit}
            >
              <X size={16} />
            </Button>
          </div>
        )}
        <form className="composer" onSubmit={handleSend}>
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="emoji-button size-7 text-[#b8babc]"
                type="button"
                aria-label="Choose emoji"
                disabled={sendingMessage}
              >
                <Smile size={18} />
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="emoji-picker"
                align="start"
                side="top"
                sideOffset={12}
                aria-label="Choose an emoji"
              >
                <p>Choose an emoji</p>
                <div className="emoji-picker-grid">
                  {composerEmojis.map((emoji) => (
                    <Button
                      key={emoji}
                      type="button"
                      variant="ghost"
                      className="emoji-choice"
                      aria-label={`Insert ${emoji}`}
                      onClick={() => onDraftChange((current) => `${current}${emoji}`)}
                    >
                      {emoji}
                    </Button>
                  ))}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <textarea
            ref={composerRef}
            value={draft}
            maxLength={1000}
            rows={1}
            placeholder={
              !connected
                ? 'Reconnecting…'
                : editingMessageId
                  ? 'Edit your message…'
                  : `Say something, ${session.displayName}`
            }
            aria-label="Write a message"
            disabled={!connected || sendingMessage}
            onChange={(event) => {
              onDraftChange(event.target.value)
              setTyping(Boolean(event.target.value.trim()))
              event.currentTarget.style.height = 'auto'
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                setTyping(false)
                event.currentTarget.form?.requestSubmit()
              }
            }}
            onBlur={() => setTyping(false)}
          />
          <Button
            className="send-button size-9 rounded-full bg-[#d5ff67] p-0 text-[#18200e] hover:bg-[#e0ff8b]"
            type="submit"
            aria-label={editingMessageId ? 'Save edited message' : 'Send message'}
            disabled={!draft.trim() || !connected || sendingMessage}
          >
            {editingMessageId ? (
             <Check size={19} />
            ) : sendingMessage ? (
             <span className="send-spinner" aria-label="Sending message" />
            ) : (
             <ArrowUp size={19} />
            )}
          </Button>
        </form>
        {sendFailure && (
          <div className="send-failure error-popup" role="alert">
            <span>{sendFailure}</span>
            <div className="send-failure-actions">
              <Button
                type="button"
                variant="ghost"
                className="send-retry-button"
                disabled={!connected || sendingMessage || !draft.trim()}
                onClick={() => composerRef.current?.form?.requestSubmit()}
              >
                Try again
              </Button>
              <button
                type="button"
                className="error-popup-dismiss"
                aria-label="Dismiss message warning"
                onClick={onDismissSendFailure}
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}
        <div className="composer-foot">
          <span>
            You’re <b>{session.displayName}</b>. No backstory required.
          </span>
          <span className="message-count" aria-live="polite">
            {draft.length}/1000
          </span>
        </div>
        {error && (
          <p className="inline-error error-popup chat-error-popup" role="alert">
            <span>{error}</span>
            <button type="button" className="error-popup-dismiss" aria-label="Dismiss alert" onClick={onDismissError}>
              <X size={15} />
            </button>
          </p>
        )}
      </div>
    </main>
  )
}
