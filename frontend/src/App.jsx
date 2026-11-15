import { useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import StandingsPage from './pages/StandingsPage'
import GamesPage from './pages/GamesPage'
import TrendsPage from './pages/TrendsPage'
import AdminPage from './pages/AdminPage'
import AboutPage from './pages/AboutPage'
import EloPage from './pages/EloPage'
import QbPage from './pages/QbPage'
import ThemeToggle from './components/ThemeToggle'

const LINKS = [
  { to: '/', label: 'Standings', end: true },
  { to: '/games', label: 'Games' },
  { to: '/elo', label: 'Elo' },
  { to: '/qb', label: 'QBs' },
  { to: '/trends', label: 'Trends' },
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
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-bg border-b border-line sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 flex items-center h-14">
          <span className="font-display font-extrabold uppercase text-2xl tracking-tight mr-6">
            RZS<span className="text-accent"> Stats</span>
          </span>
          <nav className="hidden sm:flex items-center gap-1" aria-label="Main">
            {LINKS.map(l => <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>{l.label}</NavLink>)}
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
              <NavLink key={l.to} to={l.to} end={l.end} className={mobileNavClass} onClick={() => setOpen(false)}>{l.label}</NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Routes>
          <Route path="/" element={<StandingsPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/elo" element={<EloPage />} />
          <Route path="/qb" element={<QbPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </main>

      <footer className="border-t border-line text-xs text-muted">
        <div className="max-w-7xl mx-auto px-4 py-4">
          Data from NeonSportz, synced nightly at 4 AM ET. Season label = index + 2026.
        </div>
      </footer>
    </div>
  )
}
