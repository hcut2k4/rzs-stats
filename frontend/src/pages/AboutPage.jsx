import PageHeader from '../components/PageHeader'

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
      'Week by Week — PyPAT line chart; click teams to highlight them',
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

function Bullets({ items }) {
  return (
    <ul className="space-y-1.5">
      {items.map(b => (
        <li key={b} className="text-sm text-muted border-l-2 border-line pl-2">{b}</li>
      ))}
    </ul>
  )
}

export default function AboutPage() {
  return (
    <div>
      <PageHeader title="About" qualifier="How the numbers work" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {STATS.map(({ name, def, bullets }) => (
          <div key={name} className="border-t-2 border-rule pt-3">
            <h2 className="font-display font-bold uppercase text-xl mb-1">{name}</h2>
            <p className="text-sm mb-3">{def}</p>
            <Bullets items={bullets} />
          </div>
        ))}
      </div>

      <h2 className="th mb-3">Pages</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {PAGES.map(({ name, bullets }) => (
          <div key={name} className="border-t border-line pt-3">
            <h3 className="text-sm font-semibold mb-2">{name}</h3>
            <Bullets items={bullets} />
          </div>
        ))}
      </div>

      <p className="text-sm text-muted border-y border-line py-3 mb-10">
        Stats sync from NeonSportz daily at <span className="text-ink font-semibold">4:00 AM ET</span>.
        Admins can trigger a manual sync at any time.
      </p>

      <h2 className="th mb-3">Resources</h2>
      <div className="flex flex-col gap-1.5">
        {RESOURCES.map(({ href, label }) => (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">
            {label}
          </a>
        ))}
      </div>
    </div>
  )
}
