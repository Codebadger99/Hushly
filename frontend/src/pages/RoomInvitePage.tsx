import { ArrowRight, Check, Copy, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SiteChrome } from '@/components/site/SiteChrome'
import type { RoomNotice } from '@/types/hushly'

type RoomInvitePageProps = {
  isOwner: boolean
  roomName: string
  roomCode?: string
  inviteLink?: string
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

  return (
    <SiteChrome home={false} onHome={onHome}>
      {isOwner && joinNotice && (
        <div className="welcome-toast join-notice-toast" role="status" aria-live="polite">
          <img src="/spirit-mark.png" alt="" />
          <span>
            <strong>{joinNotice.displayName} joined the room</strong>
            <small>Say hello and make them feel welcome.</small>
          </span>
        </div>
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
              <img src="/spirit-mark.png" alt="" />
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
                The link includes the invite automatically. Guests can join without entering a code.
              </p>

              <label className="share-label room-code-label" htmlFor="share-room-code">
                Room code
              </label>
              <div className="share-code-row">
                <span className="share-code-value" id="share-room-code">
                  <Ticket size={17} />
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
              {error && <p className="form-error" role="alert">{error}</p>}

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
                    : `You’ve been invited to ${displayName}. The invitation code is included, so just join to get your own name for this visit.`}
              </p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button
                className="button button-primary invitation-cta"
                type="button"
                onClick={onJoinRoom}
                disabled={loading || connecting || Boolean(error)}
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
