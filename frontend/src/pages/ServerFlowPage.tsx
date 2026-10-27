import type { FormEvent } from 'react'
import { AlertTriangle, ArrowRight, ArrowUpRight, HeartHandshake, Ticket, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SiteChrome } from '@/components/site/SiteChrome'
import type { FlowMode, Screen } from '@/types/hushly'

type ServerFlowPageProps = {
  mode: FlowMode
  roomName: string
  onRoomNameChange: (value: string) => void
  inviteCode: string
  onInviteCodeChange: (value: string) => void
  connecting: boolean
  error: string
  onDismissError: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onNavigate: (screen: Screen) => void
}

function FlowIllustration({ mode, roomName }: { mode: FlowMode; roomName: string }) {
  if (mode === 'create') {
    return (
      <div className="invite-art relative mx-auto grid place-items-center">
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <div className="invite-card">
          <div className="invite-card-top">
            <span>A LITTLE ROOM OF YOUR OWN</span>
            <Ticket size={17} />
          </div>
          <strong>{roomName || 'Midnight lounge'}</strong>
          <p>Invite your people with a room code.</p>
          <ArrowUpRight className="invite-card-arrow" size={16} />
        </div>
      </div>
    )
  }

  return (
    <div className="guest-art relative mx-auto grid place-items-center">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="guest-note">
        <span className="guest-avatar">MM</span>
        <div>
          <b>MELLOW MOON</b>
          <p>hey, saved you a little space.</p>
        </div>
      </div>
      <div className="guest-reply">
        <span className="mini-ghost">●</span> okay, I’m in.
      </div>
    </div>
  )
}

export function ServerFlowPage({
  mode,
  roomName,
  onRoomNameChange,
  inviteCode,
  onInviteCodeChange,
  connecting,
  error,
  onDismissError,
  onSubmit,
  onNavigate,
}: ServerFlowPageProps) {
  const creating = mode === 'create'

  return (
    <SiteChrome home={false} onHome={() => onNavigate('home')}>
      {error && (
        <p className="form-error error-popup flow-error-popup flow-error-banner" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="error-popup-dismiss" aria-label="Dismiss alert" onClick={onDismissError}>
            <X size={15} />
          </button>
        </p>
      )}
      <section
        className={`flow-layout ${creating ? 'create-layout' : 'join-layout'} mx-auto grid flex-1 items-center`}
      >
        <div className="flow-copy">
          <p className="eyebrow flex items-center gap-2 text-[10px] font-semibold text-[#d5ff67]">
            <span className="lime-dot" />
            {creating ? 'YOUR CORNER OF THE INTERNET' : 'GOOD COMPANY STARTS HERE'}
          </p>
          <h1>
            {creating ? (
              <>
                A little space.
                <br />
                <span>A lot to say.</span>
              </>
            ) : (
              <>
                You’re on
                <br />
                <span>the guest list.</span>
              </>
            )}
          </h1>
          <p className="flow-description">
            {creating
              ? 'Name your room, then share its invite code with the people you want to meet.'
              : 'Enter the 8-character code from your host. Hushly will give you a fresh name when you join.'}
          </p>
          <FlowIllustration mode={mode} roomName={roomName} />
          <p className="flow-steps">
            <span>01</span> {creating ? 'Name your room' : 'Enter your code'} · <span>02</span>{' '}
            Hushly gives you a name · <span>03</span> Join the conversation
          </p>
        </div>
        <div className="form-column">
          <form
            className="flow-card rounded-2xl border border-[#2b332a] bg-[#171b17] p-6"
            onSubmit={onSubmit}
          >
            <div className="card-heading mb-5 flex items-center justify-between">
              <h2>{creating ? 'Make it yours' : 'Your way in'}</h2>
              <span>NO ACCOUNT NEEDED</span>
            </div>

            {creating ? (
              <>
                <label className="field-label" htmlFor="room-name">
                  Room name
                </label>
                <input
                  id="room-name"
                  className="text-field w-full rounded-lg border border-[#30382d] bg-[#111510] px-3 text-sm text-[#e5e7df]"
                  value={roomName}
                  maxLength={50}
                  placeholder="Midnight lounge"
                  onChange={(event) => onRoomNameChange(event.target.value)}
                  required
                />
                <p className="field-hint">
                  Up to 50 characters; rooms close automatically when
                  everyone has left.
                </p>
              </>
            ) : (
              <>
                <label className="field-label" htmlFor="invite-code">
                  8-character room code
                </label>
                <div className="input-with-icon relative">
                  <Ticket size={17} />
                  <input
                    id="invite-code"
                    className="text-field w-full rounded-lg border border-[#30382d] bg-[#111510] text-sm uppercase tracking-[0.12em] text-[#e5e7df]"
                    value={inviteCode}
                    onChange={(event) => onInviteCodeChange(event.target.value)}
                    placeholder="HUSH7K2A"
                    maxLength={8}
                    pattern="[A-HJ-KM-NP-Z2-9]{8}"
                    title="Enter the 8-character room code from your host."
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                  <span className="code-count" aria-live="polite">
                    {inviteCode.length}/8
                  </span>
                </div>
                <p className="field-hint">
                  Ask your host for the code. Letters I, L, O and numbers 0, 1 aren’t used.
                </p>
              </>
            )}

            <div className="identity-note mt-5 flex items-start gap-3 rounded-xl border border-[#30382d] bg-[#121611] p-3">
              <span className="identity-icon grid size-9 shrink-0 place-items-center rounded-lg bg-[#29331e] text-[#d5ff67]">
                <HeartHandshake size={18} />
              </span>
              <span>
                <strong className="block text-sm font-medium text-[#e5e7df]">
                  A unique room name, chosen for you
                </strong>
                <span className="identity-copy mt-1 block text-xs leading-relaxed text-[#a0a798]">
                  Hushly picks your anonymous name when you enter. No profile or personal details
                  needed.
                </span>
              </span>
            </div>

            <Button
              className="button button-primary submit-button w-full rounded-lg bg-[#d5ff67] font-semibold text-[#151a0d] hover:bg-[#e0ff8b]"
              disabled={connecting}
              type="submit"
            >
              {connecting
                ? creating
                  ? 'Creating room…'
                  : 'Joining room…'
                : creating
                  ? 'Create room'
                  : 'Join room'}
              <ArrowRight size={17} />
            </Button>
            <p className="next-up" role="status">
              {creating
                ? 'Your room code appears after the room is created.'
                : 'Messages are shared live and kept only while the room exists.'}
            </p>
            <div className="kindness-note mt-4 flex items-start gap-2">
              <HeartHandshake size={16} />
              <span>
                Be kind to the people in the room. Messages are limited to 1,000 characters.
              </span>
            </div>
            <p className="rate-limit-note">
              Room requests are limited to help keep Hushly safe.
            </p>
          </form>
          <p className="switch-flow">
            {creating ? 'Already have a code?' : 'Want to start a room?'}{' '}
            <button type="button" onClick={() => onNavigate(creating ? 'join' : 'create')}>
              {creating ? 'Join a room' : 'Create a room'} <ArrowRight size={14} />
            </button>
          </p>
        </div>
      </section>
    </SiteChrome>
  )
}
