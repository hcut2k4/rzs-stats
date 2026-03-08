const STATS = [
  {
    name: 'PyPAT',
    def: 'Win expectancy based on scoring differential, not W-L record.',
    bullets: [
      'One-score games are random; scoring margin predicts future success better',
      'Dynamic exponent (Chase Stuart) adjusts for each team\'s scoring environment',
      'Scale: 0–1, where 0.5 = break-even expectation',
    ],
  },
  {
    name: 'Luck',
    def: 'Actual wins minus PyPAT-expected wins.',
    bullets: [
      'Positive = won more games than scoring margin predicts',
      'Negative = deserved more wins',
      'Tends to normalize — a predictor of regression or rebound',
    ],
  },
  {
    name: 'Strength of Schedule',
    def: 'Average opponent-adjusted PyPAT across a team\'s schedule.',
    bullets: [
      'More accurate than opponent win% — PyPAT reflects true team quality',
      'Each opponent\'s PyPAT is recalculated with the subject team removed, eliminating circular bias',
      'Toggle on Standings between current-season and prior-season opponent PyPAT — prior season is the default for the active season, where small sample sizes make current-season data less reliable',
    ],
  },
]

const PAGES = [
  {
    name: 'Standings',
    bullets: [
      'Sortable standings ranked by PyPAT by default',
      'Three SoS columns: Played (opponents so far), Left (remaining schedule), Total (full season)',
      'SoS toggle: current-season or prior-season opponent PyPAT — prior season is default for the active season',
      'All columns sortable; export to CSV or Excel',
    ],
  },
  {
    name: 'Games',
    bullets: [
      'Game results by season and week',
      'Filter by regular season or playoffs',
      'Links to full recaps on NeonSportz',
    ],
  },
  {
    name: 'Trends',
    bullets: [
      'Season History — W-L, PyPAT, Luck across all seasons, sortable',
      'Week by Week — PyPAT line chart with per-team toggles',
    ],
  },
]

const RESOURCES = [
  { href: 'https://youtu.be/SweB-Tg7uUI', label: 'PyPAT Video Walkthrough' },
  { href: 'https://legacy.daddyleagues.com/redzone/blog/news/46068/PythagoreanPAT-Win-Expectancy-Season-86', label: 'PythagoreanPAT Win Expectancy — Season 86' },
  { href: 'https://legacy.daddyleagues.com/redzone/blog/news/45389/PythagoreanPAT', label: 'PythagoreanPAT' },
  { href: 'https://legacy.daddyleagues.com/redzone/blog/news/45508/Season-82-PythagoreanPat', label: 'Season 82 PythagoreanPAT' },
  { href: 'https://library.fangraphs.com/principles/expected-wins-and-losses/', label: 'Expected Wins and Losses — FanGraphs' },
  { href: 'https://legacy.baseballprospectus.com/glossary/index.php?mode=viewstat&stat=136', label: 'Pythagorean Record — Baseball Prospectus' },
]

export default function AboutPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-xl font-bold">About</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {STATS.map(({ name, def, bullets }) => (
          <div key={name} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-1">{name}</p>
            <p className="text-sm text-gray-300 mb-3">{def}</p>
            <ul className="space-y-1.5">
              {bullets.map(b => (
                <li key={b} className="text-xs text-gray-400 border-l-2 border-gray-700 pl-2">{b}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Pages */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pages</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PAGES.map(({ name, bullets }) => (
            <div key={name} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-sm font-semibold text-white mb-2">{name}</p>
              <ul className="space-y-1.5">
                {bullets.map(b => (
                  <li key={b} className="text-xs text-gray-400 border-l-2 border-gray-700 pl-2">{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Data */}
      <div className="bg-gray-900 border border-gray-800 rounded px-4 py-2.5 text-sm text-gray-400">
        Stats sync from NeonSportz daily at <span className="text-white font-medium">4:00 AM ET</span>.
        Admins can trigger a manual sync at any time.
      </div>

      {/* Resources */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Resources</p>
        <div className="flex flex-col gap-1.5">
          {RESOURCES.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-400 hover:text-green-300"
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
