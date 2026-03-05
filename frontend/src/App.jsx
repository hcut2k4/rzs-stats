import { Routes, Route, NavLink } from 'react-router-dom'
import StandingsPage from './pages/StandingsPage'
import GamesPage from './pages/GamesPage'
import TrendsPage from './pages/TrendsPage'
import AdminPage from './pages/AdminPage'

const navClass = ({ isActive }) =>
  `px-4 py-2 rounded text-sm font-medium transition-colors ${
    isActive
      ? 'bg-green-600 text-white'
      : 'text-gray-300 hover:text-white hover:bg-gray-800'
  }`

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-2 h-14">
          <span className="text-green-400 font-bold text-lg mr-4">RZS Stats</span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>Standings</NavLink>
            <NavLink to="/games" className={navClass}>Games</NavLink>
            <NavLink to="/trends" className={navClass}>Trends</NavLink>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Routes>
          <Route path="/" element={<StandingsPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  )
}
