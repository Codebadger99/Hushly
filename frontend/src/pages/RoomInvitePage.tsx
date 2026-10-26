import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Copy, Ticket, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SiteChrome } from '@/components/site/SiteChrome'
import { firstNameInitial, type RoomNotice } from '@/types/hushly'
import Logo from '../../public/Spirit seal.png'

type RoomInvitePageProps = {
  isOwner: boolean
  roomName: string
  roomCode?: string
  inviteLink?: string
  invitationCode?: string
  inviteCode: string
  onInviteCodeChange: (value: string) => void
  loading?: boolean
  connecting?: boolean
  error?: string
  feedback?: string
  joinNotice?: RoomNotice | null
  onCopyCode?: () => void
  onCopyLink?: () => void
  onEnterRoom?: () => void
  onJoinRoom?: () => void
  onManualJoin?: () => void
  onHome: () => void
}

export function RoomInvitePage({
  isOwner,
  roomName,
  roomCode,
  inviteLink,
  invitationCode,
  inviteCode,
  onInviteCodeChange,
  loading = false,
  connecting = false,
  error = '',
  feedback = '',
  joinNotice = null,
  onCopyCode,
  onCopyLink,
  onEnterRoom,
  onJoinRoom,
  onManualJoin,
  onHome,
}: RoomInvitePageProps) {
  const displayName = roomName || (loading ? 'Finding your room…' : 'A little space')
  const spiritRef = useRef<HTMLImageElement>(null)
  const [dismissedError, setDismissedError] = useState('')

  useEffect(() => {
    const spirit = spiritRef.current
    if (!spirit || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const animation = spirit.animate(
      [
        { transform: 'translateY(0) rotate(-2deg)' },
        { transform: 'translateY(-8px) rotate(2deg)' },
        { transform: 'translateY(0) rotate(-2deg)' },
      ],
      { duration: 2800, easing: 'ease-in-out', iterations: Infinity },
    )

    return () => animation.cancel()
  }, [])

  return (
    <SiteChrome home={false} onHome={onHome}>
      {isOwner && joinNotice && (
        <div className="welcome-toast join-notice-toast" role="status" aria-live="polite">
          <span className="profile-pill toast-avatar" aria-hidden="true">
            {firstNameInitial(joinNotice.displayName)}
          </span>
          <span className="welcome-toast-copy">
            <strong>{joinNotice.displayName} joined the room</strong>
            <small>Say hello and make them feel welcome.</small>
          </span>
        </div>
      )}
      {error && error !== dismissedError && (
        <p className="form-error error-popup flow-error-popup" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="error-popup-dismiss"
            aria-label="Dismiss alert"
            onClick={() => setDismissedError(error)}
          >
            <X size={15} />
          </button>
        </p>
      )}
      <div className="invitation-layout">
        <section className="invitation-copy" aria-label="Room invitation">
          <p className="invitation-eyebrow">
            <span className="lime-dot" />
            {isOwner ? 'YOUR ROOM IS READY' : 'YOU’RE INVITED TO'}
          </p>
          <h1>{displayName}</h1>
          <p className="invitation-description">Late thoughts. Good company.</p>
          <div className="invitation-art" aria-label="A Hushly invitation">
            <div className="invitation-art-head">
              <span>A HUSHLY INVITATION</span>
              <span className="invitation-art-orbit" />
            </div>
            <div className="invitation-spirit">
              <img ref={spiritRef} src={Logo} alt="" />
            </div>
            <div className="invitation-perforation" aria-hidden="true">
              <span />
              <span />
            </div>
            <div className="invitation-art-foot">
              <strong>
                Come as
                <br />
                you aren’t.
              </strong>
              <ArrowRight size={21} aria-hidden="true" />
            </div>
          </div>
          <p className="invitation-caption">ONE ROOM. JUST WORDS.</p>
        </section>

        <section className="invitation-panel" aria-labelledby="invitation-panel-title">
          {isOwner ? (
            <>
              <p className="panel-eyebrow">READY WHEN YOU ARE</p>
              <h2 id="invitation-panel-title">Bring your people in.</h2>
              <p className="invitation-panel-copy">
                Share the link for a personal invitation, or send the code to someone you know.
              </p>

              <label className="share-label" htmlFor="invite-link">
                Invitation link
              </label>
              <div className="share-field">
                <input id="invite-link" value={inviteLink ?? ''} readOnly onFocus={(event) => event.currentTarget.select()} />
                <Button
                  className="share-action"
                  type="button"
                  variant="ghost"
                  onClick={onCopyLink}
                  aria-label="Copy invitation link"
                >
                  <Copy size={17} />
                  <span>Copy link</span>
                </Button>
              </div>
              <p className="share-hint">
                This private link does not contain the room code. Share the code separately so guests can join.
              </p>

              <label className="share-label room-code-label" htmlFor="share-room-code">
                Room code
              </label>
              <div className="share-code-row">
                <span className="share-code-value" id="share-room-code">
                  <Ticket className="desktop-room-ticket" size={17} />
                  {roomCode}
                </span>
                <Button className="share-action" type="button" variant="ghost" onClick={onCopyCode}>
                  <Copy size={17} />
                  <span>Copy code</span>
                </Button>
              </div>

              {feedback && (
                <p className="invite-feedback" role="status">
                  <Check size={15} />
                  {feedback}
                </p>
              )}
              <Button
                className="button button-primary invitation-cta"
                type="button"
                onClick={onEnterRoom}
              >
                Enter your room <ArrowRight size={17} />
              </Button>
            </>
          ) : (
            <>
              <p className="panel-eyebrow">YOUR WAY IN</p>
              <h2 id="invitation-panel-title">
                {loading ? 'Opening your invitation…' : 'A little space. A lot to say.'}
              </h2>
              <p className="invitation-panel-copy">
                {loading
                  ? 'We’re finding the room your host shared.'
                  : error
                    ? 'This invitation may have expired or the room may have closed.'
                    : `You’ve been invited to ${displayName}. Enter the room code below to continue.`}
              </p>
              <label className="share-label" htmlFor="guest-invite-code">
                8-character room code
              </label>
              <input
                id="guest-invite-code"
                className="text-field w-full rounded-lg border border-[#30382d] bg-[#111510] px-3 text-sm uppercase tracking-[0.12em] text-[#e5e7df]"
                value={inviteCode}
                onChange={(event) => onInviteCodeChange(event.target.value)}
                placeholder="Enter room code"
                maxLength={8}
                pattern="[A-HJ-KM-NP-Z2-9]{8}"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="guest-invite-code-hint"
                disabled={loading || connecting}
              />
              <p className="share-hint" id="guest-invite-code-hint">
                {invitationCode
                  ? <>Enter the code included with this invitation: <strong className="invitation-code-hint">{invitationCode}</strong></>
                  : 'Ask the host for the 8-character room code.'}
              </p>
              <Button
                className="button button-primary invitation-cta"
                type="button"
                onClick={onJoinRoom}
                disabled={
                  loading ||
                  connecting ||
                  Boolean(error) ||
                  !/^[A-HJ-KM-NP-Z2-9]{8}$/.test(inviteCode)
                }
              >
                {connecting ? 'Joining room…' : 'Join this room'} <ArrowRight size={17} />
              </Button>
              <p className="invitation-alias-note">
                No profile needed. Hushly will tell you your room name as soon as you join.
              </p>
              <button className="manual-code-link" type="button" onClick={onManualJoin}>
                Have a room code instead?
              </button>
            </>
          )}
        </section>
      </div>
    </SiteChrome>
  )
}
