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
      'Weighted per game, not per opponent — a division rival played twice counts twice',
      'Blank until an opponent has games that were not against you — early in a season there is nothing to measure',
      'Toggle on Standings between current-season and prior-season opponent PyPAT — prior season is the default for the active season, where small sample sizes make current-season data less reliable',
    ],
  },
  {
    name: 'Elo',
    def: 'Long-term team strength across seasons, built from game results, opponent quality, and scoring margin.',
    bullets: [
      'Every team starts at 1500 — higher is stronger, and ratings move after every game, playoffs included',
      'Beating strong teams earns more points, and losing to weak teams costs more; bigger wins count more, with diminishing returns after 21 points',
      'Teams keep 90% of their distance from 1500 between seasons, so good teams stay good with room to change',
    ],
  },
  {
    name: 'TANY/A',
    def: 'Total Adjusted Net Yards per Attempt — measures overall QB efficiency by combining passing and rushing production.',
    bullets: [
      'Touchdowns add 20 adjusted yards; interceptions and lost fumbles subtract 45.',
      'Includes passing attempts, sacks, and rushing attempts. Higher is better.',
      'Sack yardage and lost fumbles are estimated from team game stats.',
    ],
  },
  {
    name: 'RUSH+',
    def: 'The extra production a quarterback adds with his legs, measured against each passing opportunity.',
    bullets: [
      'Credits rushing yards above 4 per carry, adds 20 for each rushing touchdown, subtracts 45 for each estimated lost fumble.',
      'Positive means his running is worth more than it costs. Higher is better.',
      'Every estimated fumble is charged here, so RUSH+ is read alongside TANY/A, not added to it.',
    ],
  },
  {
    name: 'Points per Drive',
    def: 'Points an offense scored, or a defense allowed, per possession.',
    bullets: [
      'Counts only the offense\'s own points: touchdowns, field goals and the extra points after its touchdowns. Pick-sixes and return scores are not charged to either side',
      'Drives are estimated: touchdowns + field goal attempts + punts + turnovers + failed fourth downs. End-of-half kneel-downs are the only possessions this misses',
      'Net Pts/Drive is offense minus defense. Higher is better on offense, lower is better on defense',
    ],
  },
  {
    name: 'Points per Play',
    def: 'Offensive points per play, our stand-in for EPA per play.',
    bullets: [
      'Plays = pass attempts + rush attempts + sacks taken',
      'Same offensive points as Points per Drive, but divided by plays instead of possessions, so a fast, short-drive offense can rate differently on the two',
    ],
  },
  {
    name: 'Series %',
    def: 'How often a series keeps the chains moving or scores.',
    bullets: [
      '(first downs + touchdowns) ÷ (first downs + drives): each first down and each drive\'s last series counts as a series',
      'Modeled on Drive Success Rate. Higher is better on offense, lower on defense',
    ],
  },
  {
    name: 'Efficiency rates',
    def: 'Supporting rates on the Efficiency page.',
    bullets: [
      '3rd %: third downs converted ÷ attempted',
      'RZ TD %: red-zone trips that ended in a touchdown',
      'TO/Drive: interceptions plus lost fumbles per drive; on defense, takeaways',
      'Sack %: sacks ÷ dropbacks; on defense, the share of opposing dropbacks sacked',
    ],
  },
]

const PAGES = [
  {
    name: 'Home',
    bullets: [
      'A snapshot of every page — PyPAT leaders, latest scores, top Elo, top quarterbacks',
      'Click any card to open that page in full',
    ],
  },
  {
    name: 'Standings',
    bullets: [
      'Standings — every team ranked by PyPAT by default, with three SoS columns: Played (opponents so far), Left (remaining schedule), Total (full season)',
      'Season History — W-L, PyPAT and Luck across every season; sort by any season',
      'Week by Week — PyPAT line chart; click teams to highlight them',
      'SoS toggle: current-season or prior-season opponent PyPAT — prior season is default for the active season',
      'All columns sortable; export to CSV or Excel',
    ],
  },
  {
    name: 'Efficiency',
    bullets: [
      'Overview — a chart of offense against defense points per drive, plus net points per drive for every team',
      'Offense and Defense — points, yards, series, third-down, red-zone, turnover and sack rates, heat-colored within each column',
      'Regular season, playoffs or both. Needs the player and team stat sync; the page says so when it is empty',
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
    name: 'Elo',
    bullets: [
      'Ratings — all 32 teams ranked by Elo, with weekly change, rank movement, and biggest risers and droppers',
      'History — rating trends across every season; click teams to highlight them',
      'Matchup — pick any two teams for a predicted win probability',
      'Games — game-by-game Elo changes, pregame ratings, and projected win chances for unplayed games',
    ],
  },
  {
    name: 'QBs',
    bullets: [
      'Leaderboard — every quarterback ranked by TANY/A, by week, season or all-time',
      'Column presets for efficiency, classic box score and rushing; all columns sortable',
      'Movement — biggest risers and fallers, plus a rank-by-week chart you can track season by season or across every season',
      'Regular season, playoffs or both; export to CSV or Excel',
      'Click any quarterback to open his player page on NeonSportz',
    ],
  },
]

const RESOURCES = [
  { href: 'https://youtu.be/SweB-Tg7uUI', label: 'PyPAT Video Walkthrough' },
  { href: 'https://legacy.daddyleagues.com/redzone/blog/news/46068/PythagoreanPAT-Win-Expectancy-Season-86', label: 'PythagoreanPAT Win Expectancy — Season 86' },
  { href: 'https://legacy.daddyleagues.com/redzone/blog/news/45389/PythagoreanPAT', label: 'PythagoreanPAT' },
  { href: 'https://legacy.daddyleagues.com/redzone/blog/news/45508/Season-82-PythagoreanPat', label: 'Season 82 PythagoreanPAT' },
  { href: 'https://modules.scorenetwork.org/football/nfl-elo-ratings/', label: 'Introduction to NFL Elo Ratings — SCORE' },
  { href: 'https://www.stampedeblue.com/2020/5/27/21265202/qb-stats-matter-pt-3-anya-epa-efficiency-win-rate-pp', label: 'QB Stats Matter (pt. 3): ANY/A, TANY/A and EPA — Stampede Blue' },
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {STATS.map(({ name, def, bullets }) => (
          <div key={name} className="border-t-2 border-rule pt-3">
            <h2 className="font-display font-bold uppercase text-xl mb-1">{name}</h2>
            <p className="text-sm mb-3">{def}</p>
            <Bullets items={bullets} />
          </div>
        ))}
      </div>

      <h2 className="th mb-3">Pages</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
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
