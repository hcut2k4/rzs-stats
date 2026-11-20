import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSeasons, getStandings, getEloGames, getEloRatings } from '../api/client'
import PageHeader from '../components/PageHeader'
import ExportMenu from '../components/ExportMenu'
import { TeamLogo } from '../components/TeamLogo'
import { recordText, teamColorVars, teamGames } from '../utils/teamProfile'
import { seasonLabel } from '../utils/seasons'

const pct = v => (v * 100).toFixed(1) + '%'
const FORM = { W: 'bg-good', L: 'bg-bad', T: 'bg-muted' }
const FORM_GAMES = 5

export default function TeamsPage() {
  const [data, setData] = useState(null)
  const [extras, setExtras] = useState({ games: [], ratings: [] })
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    getSeasons()
      .then(s => {
        if (!s.length) return { rows: [], season: null }
        const latest = s[s.length - 1]
        // Form and Elo rank are extras: the index still works if either fails.
        Promise.all([getEloGames(latest).catch(() => []), getEloRatings(latest).catch(() => [])])
          .then(([games, ratings]) => { if (live) setExtras({ games, ratings }) })
        return getStandings(latest).then(rows => ({ rows, season: latest }))
      })
      .then(d => { if (live) setData(d) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [])

  const rows = data?.rows ?? []
  const season = data?.season ?? null
  const form = teamId => teamGames(extras.games, teamId).filter(g => !g.playoff).slice(-FORM_GAMES)
  const eloRank = teamId => extras.ratings.find(r => r.teamId === teamId)?.rank
  const divisions = [...new Set(rows.map(r => r.division))].sort()
  const ordered = divisions.flatMap(d => rows.filter(r => r.division === d).sort((a, b) => b.winPct - a.winPct || b.pythagoreanPat - a.pythagoreanPat))
  const spec = season == null ? null : {
    name: 'Teams',
    qualifier: `${seasonLabel(season)} · grouped by division · win % descending within each`,
    description: 'Every team with its division, record, PyPAT, Elo rank and its last five regular-season results.',
    rows: ordered,
    cols: [
      { label: 'Division', desc: 'Conference and division.', text: r => r.division },
      { label: 'Team', desc: 'City plus nickname.', text: r => `${r.cityName} ${r.displayName}`, logo: r => r.abbrName },
      { label: 'Record', desc: 'Regular-season wins, losses and ties.', text: recordText },
      { label: 'PyPAT', desc: 'PythagoreanPAT win expectancy from points scored and allowed.', text: r => (r.gamesPlayed ? pct(r.pythagoreanPat) : ''), value: r => (r.gamesPlayed ? r.pythagoreanPat : null), z: '0.0%' },
      { label: 'Elo Rank', desc: 'Rank by Elo after the latest week.', text: r => String(eloRank(r.teamId) ?? ''), value: r => eloRank(r.teamId) ?? null, z: '0' },
      { label: 'Last 5', form: r => form(r.teamId).map(g => g.result), desc: 'Results of the last five regular-season games, oldest first.', text: r => form(r.teamId).map(g => g.result).join('') },
    ],
    api: { path: '/standings', params: { season }, note: `Grouped by division, then win % and PyPAT descending. Elo rank from /api/elo/ratings?season=${season}; last five from /api/elo/games?season=${season}.` },
  }

  return (
    <div>
      <PageHeader title="Teams" qualifier={season == null ? null : `${seasonLabel(season)} · pick a team for its full profile`}>
        {spec && <ExportMenu spec={spec} />}
      </PageHeader>
      {error && <p className="text-bad">Could not load teams.</p>}
      {!error && !data && <p className="text-muted">Loading…</p>}
      {data && !rows.length && <p className="text-muted">No teams yet. Run a sync from Admin.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
        {divisions.map(d => (
          <section key={d} aria-label={d}>
            <h2 className="th px-0 border-b-2 border-rule mb-1">{d}</h2>
            <ul>
              {ordered.filter(r => r.division === d).map(r => {
                const recent = form(r.teamId)
                const rank = eloRank(r.teamId)
                return (
                  <li key={r.teamId}>
                    <Link to={`/teams/${r.abbrName}`} className="team-scope group flex items-center gap-3 py-2 pl-2 border-b border-line border-l-4 hover:bg-surface transition-colors"
                      style={{ ...teamColorVars(r.primaryColor), borderLeftColor: 'var(--team-c)' }}>
                      <TeamLogo abbr={r.abbrName} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] uppercase tracking-wide text-muted leading-none">{r.cityName}</span>
                        <span className="block font-display font-bold uppercase text-xl leading-tight group-hover:text-accent truncate">{r.displayName}</span>
                        {recent.length > 0 && (
                          <span className="flex gap-0.5 mt-0.5" title={`Last ${recent.length}: ${recent.map(g => g.result).join(' ')}`} aria-label={`Last ${recent.length} results ${recent.map(g => g.result).join(' ')}`}>
                            {recent.map(g => <span key={g.gameId ?? g.week} className={`w-1.5 h-2.5 rounded-sm ${FORM[g.result]}`} />)}
                          </span>
                        )}
                      </span>
                      <span className="text-right num pr-1">
                        <span className="block text-sm font-semibold">{recordText(r)}</span>
                        {r.gamesPlayed > 0 && <span className="block text-[11px] text-muted">{pct(r.pythagoreanPat)} PyPAT</span>}
                        {rank != null && <span className="block text-[11px] text-muted">Elo #{rank}</span>}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
