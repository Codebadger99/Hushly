import type { ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'

type SiteChromeProps = {
  children: ReactNode
  home: boolean
  onHome: () => void
}

export function SiteChrome({ children, home, onHome }: SiteChromeProps) {
  return (
    <div className="site-shell min-h-svh bg-[#0d100d] text-[#edeee8]">
      <header className="site-header flex shrink-0 items-center justify-between border-b border-[#2b3229]">
        <a
          className="brand inline-flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#f2f3ed] no-underline"
          href="#home"
          onClick={(event) => {
            event.preventDefault()
            onHome()
          }}
          aria-label="Hushly home"
        >
          <img className="brand-spirit" src="/spirit-mark.png" alt="" />
          <span>hushly</span>
        </a>
        <div className="header-right flex items-center gap-7">
          <span className="header-whisper text-xs text-[#92998d]">
            A little less profile. A lot more you.
          </span>
          <a
            className="header-link inline-flex items-center gap-2 text-xs text-[#dedfd8] no-underline"
            href={home ? '#how' : '#home'}
            onClick={(event) => {
              event.preventDefault()
              if (!home) onHome()
              else document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            {home ? 'How it works' : 'Back to Hushly'} <ArrowUpRight size={14} />
          </a>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="site-footer flex items-center justify-between border-t border-[#2b3229] text-xs text-[#92998d]">
        <span>© 2026 Hushly · Be a good human.</span>
        <div className="flex gap-6">
          <a href="#privacy" onClick={(event) => event.preventDefault()}>
            Privacy
          </a>
          <a href="#guidelines" onClick={(event) => event.preventDefault()}>
            {home ? 'Community guidelines' : 'Rules'}
          </a>
        </div>
      </footer>
    </div>
  )
}
