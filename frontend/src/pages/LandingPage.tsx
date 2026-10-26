import { ArrowUpRight, HeartHandshake, Hourglass, Plus, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BlurFade } from '@/components/ui/blur-fade'
import { SiteChrome } from '@/components/site/SiteChrome'
import Logo from '../../public/Motion · floating spirit.png'

type LandingPageProps = {
  onJoin: () => void
  onCreate: () => void
  roomClosureNotice: string
  onDismissRoomClosure: () => void
}

function LandingIllustration() {
  return (
    <div className="hero-art mx-auto grid w-full place-items-center" aria-label="Hushly ghost mascot illustration">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="orbit orbit-three" />
      <span className="orbit-star star-one" />
      <span className="orbit-star star-two" />
      <div className="speech-bubble bubble-top">
        <span className="bubble-dot" />
        any night owls here?
      </div>
      <img src={Logo} alt="hushly" className="mascot" />
      <div className="speech-bubble bubble-bottom">
        <span>MELLOW MOON</span>
        <br />
        found my people.
      </div>
      <span className="art-caption">A NEW ALIAS. A REAL CONNECTION.</span>
    </div>
  )
}

export function LandingPage({
  onJoin,
  onCreate,
  roomClosureNotice,
  onDismissRoomClosure,
}: LandingPageProps) {
  return (
    <SiteChrome home onHome={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      {roomClosureNotice && (
        <div className="error-popup room-closed-popup" role="alert">
          <span>{roomClosureNotice}</span>
          <button
            type="button"
            className="error-popup-dismiss"
            aria-label="Dismiss room closed alert"
            onClick={onDismissRoomClosure}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <section className="home-hero mx-auto grid w-[min(100%-3rem,1240px)] flex-1 items-center gap-12 py-12 md:w-[min(100%-9.4%,1240px)] md:grid-cols-2 md:gap-[7%] md:py-[70px]">
        <div className="hero-copy">
          <BlurFade className="eyebrow flex items-center gap-2 text-[10px] font-semibold tracking-wide text-[#d5ff67]">
            <span className="lime-dot" /> LESS NOISE. MORE CONNECTION.
          </BlurFade>
          <h1>
            Less profile.
            <br />
            <span>More you.</span>
          </h1>
          <p className="hero-description">
            Drop the profile. Pick a temporary alias. Make a server, share a code, and see where the
            conversation goes.
          </p>
          <div className="hero-buttons flex flex-col gap-2.5 sm:flex-row">
            <Button
              className="button button-primary min-h-11 rounded-lg bg-[#d5ff67] px-5 font-semibold text-[#151a0d] hover:bg-[#e0ff8b] sm:w-auto"
              onClick={onJoin}
            >
              Join server <ArrowUpRight size={17} />
            </Button>
            <Button
              variant="secondary"
              className="button button-secondary min-h-11 rounded-lg border border-[#2b3229] bg-[#20251f] px-5 font-semibold text-[#edeee8] hover:bg-[#292f27] sm:w-auto"
              onClick={onCreate}
            >
              Create server <Plus className="text-[#adb3a7]" size={18} />
            </Button>
          </div>
          <p className="privacy-note">No account. No follower count. Just show up.</p>
        </div>
        <LandingIllustration />
      </section>
      <section
        className="value-strip grid grid-cols-1 gap-5 border-t border-[#2b3229] md:grid-cols-3 md:gap-6"
        id="how"
      >
        <div className="value-item flex items-center gap-3">
          <span className="value-icon grid place-items-center rounded-xl bg-[#1b201a] text-[#d5ff67]">
            <HeartHandshake size={19} />
          </span>
          <div>
            <h3>An alias, not a profile.</h3>
            <p>No signup. Just a name for the moment.</p>
          </div>
        </div>
        <div className="value-item flex items-center gap-3">
          <span className="value-icon grid place-items-center rounded-xl bg-[#1b201a] text-[#d5ff67]">
            <Users size={19} />
          </span>
          <div>
            <h3>Your people. Your space.</h3>
            <p>Start a server. Invite them with a code.</p>
          </div>
        </div>
        <div className="value-item flex items-center gap-3">
          <span className="value-icon grid place-items-center rounded-xl bg-[#1b201a] text-[#d5ff67]">
            <Hourglass size={19} />
          </span>
          <div>
            <h3>Good things don’t need forever.</h3>
            <p>Temporary rooms. Conversations that count.</p>
          </div>
        </div>
        <p className="value-quote">
          For the late-night thoughts, the niche obsessions, the “you had to be there.”
        </p>
      </section>
    </SiteChrome>
  )
}
