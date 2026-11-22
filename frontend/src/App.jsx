import PlayoffPathPage from './pages/PlayoffPathPage'
import { useState } from 'react'
import { Routes, Route, NavLink, Link, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import StandingsPage from './pages/StandingsPage'
import GamesPage from './pages/GamesPage'
import AdminPage from './pages/AdminPage'
import AboutPage from './pages/AboutPage'
import ChangelogPage from './pages/ChangelogPage'
import EloPage from './pages/EloPage'
import QbPage from './pages/QbPage'
import EfficiencyPage from './pages/EfficiencyPage'
import TeamsPage from './pages/TeamsPage'
import TeamPage from './pages/TeamPage'
import PlayoffsPage from './pages/PlayoffsPage'
import { useSyncLine } from './utils/useSyncLine'
import ThemeToggle from './components/ThemeToggle'

const LINKS = [
  { to: '/teams', label: 'Teams' },
  { to: '/standings', label: 'Standings' },
  { to: '/playoffs', label: 'Playoffs', beta: true },
  { to: '/efficiency', label: 'Efficiency' },
  { to: '/games', label: 'Games' },
  { to: '/elo', label: 'Elo' },
  { to: '/qb', label: 'QBs' },
  { to: '/about', label: 'About' },
]

const navClass = ({ isActive }) =>
  `px-3 py-4 text-sm font-semibold border-b-2 transition-colors ${
    isActive ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
  }`

const mobileNavClass = ({ isActive }) =>
  `block px-4 py-3 text-sm font-semibold border-l-2 ${
    isActive ? 'border-accent text-ink bg-surface' : 'border-transparent text-muted'
  }`

export default function App() {
  const syncLine = useSyncLine()
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-bg border-b border-line sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 flex items-center h-14">
          <Link
            to="/"
            className="flex items-center gap-2 font-display font-extrabold uppercase text-2xl tracking-tight mr-6 hover:opacity-80 transition-opacity"
            aria-label="RZS Stats home"
          >
            <img src="/logo.png" alt="" width="40" height="40" className="h-10 w-10" />
            <span>RZS<span className="text-accent"> Stats</span></span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1" aria-label="Main">
            {LINKS.map(l => <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>{l.label}{l.beta && <span className="ml-1 rounded border border-line px-1 text-[9px] uppercase text-muted">Beta</span>}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <button
              className="sm:hidden p-2 text-muted hover:text-ink"
              aria-label="Toggle menu"
              aria-expanded={open}
              onClick={() => setOpen(o => !o)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <nav className="sm:hidden border-t border-line" aria-label="Mobile">
            {LINKS.map(l => (
              <NavLink key={l.to} to={l.to} end={l.end} className={mobileNavClass} onClick={() => setOpen(false)}>{l.label}{l.beta && <span className="ml-1 rounded border border-line px-1 text-[9px] uppercase text-muted">Beta</span>}</NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/playoffs" element={<PlayoffsPage />} />
          <Route path="/playoffs/:abbr" element={<PlayoffPathPage />} />
          <Route path="/standings" element={<StandingsPage />} />
          <Route path="/efficiency" element={<EfficiencyPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/elo" element={<EloPage />} />
          <Route path="/qb" element={<QbPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/:abbr" element={<TeamPage />} />
          <Route path="/trends" element={<Navigate to="/standings?tab=history" replace />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="*" element={<div><h1 className="font-display font-bold text-3xl mb-2">Page not found</h1><p>Head back to the <Link to="/" className="text-accent hover:underline">home page</Link> or pick a page from the menu.</p></div>} />
        </Routes>
      </main>

      <footer className="border-t border-line text-xs text-muted">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {syncLine} Seasons use the league's numbering (Season 103 and on).
        </div>
      </footer>
    </div>
  )
}
