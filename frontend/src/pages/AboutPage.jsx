import { useSyncLine } from '../utils/useSyncLine'
import { Link } from 'react-router-dom'
import { PYPAT_TIP, SOS_TIP, eloMarginTip } from '../utils/siteCopy'
import { TANYA_BENCHMARK, RUSHPLUS_TIP } from '../utils/qb'
import { METRICS } from '../utils/efficiencyMetrics'
import { getPublicEloConfig } from '../api/client'
import { useLoad } from '../utils/useLoad'
import PageHeader from '../components/PageHeader'

const STATS = config => [
  {
    name: 'PyPAT',
    def: PYPAT_TIP,
    bullets: [
      'Points scored and allowed predict future results better than record does',
      'Dynamic exponent (Chase Stuart) adjusts for each team\'s scoring environment',
      'Shown as a percent; 50% is break-even. 61% means points scored and allowed point to about 10 wins in 17 games',
    ],
  },
  {
    name: 'Luck',
    def: "Wins above or below what PyPAT expects. Points scored and allowed predict future results better than record does, so a big Luck number is a sign the record overstates or understates the team. Big gaps tend not to last.",
    bullets: [
      "Analysts call this regression to the mean. It doesn't mean a lucky team is due for losses; its future results are simply expected to track how well it actually plays rather than its record.",
    ],
  },
  {
    name: 'Strength of Schedule',
    def: SOS_TIP,
    bullets: [
      'More accurate than opponent win% — PyPAT reflects true team quality',
      'Each opponent\'s PyPAT is recalculated with the subject team removed, so a team\'s own results can\'t make its opponents look better or worse',
      'Weighted per game, not per opponent — a division rival played twice counts twice',
      'Previous-season opponent quality through Week 9; current-season quality from Week 10 through the playoffs. Finished seasons use their own season. The toggle overrides the default.',
      'Blank until an opponent has games that were not against you — early in a season there is nothing to measure',
      'Toggle on Standings between this season\'s and last season\'s results',
    ],
  },
  {
    name: 'Elo',
    def: 'Long-term team strength across seasons, built from game results, opponent quality, and scoring margin.',
    bullets: [
      'Every team starts at 1500 — higher is stronger, and ratings move after every game, playoffs included',
      'Ratings only move between the two teams in a game, so the league average stays at about 1500',
      eloMarginTip(config),
      'Ratings are pulled toward the league average of 1500 between seasons, so good teams stay good with room to change',
      'Mid-season owner changes pull the affected team toward the league average of 1500, using the same retention as a new season',
    ],
  },
  {
    name: 'Expected Wins',
    def: 'Two ways: PyPAT wins and Elo wins. Team profiles also show a projected record.',
    bullets: [
      'PyPAT wins: expected wins based on points scored and allowed. Actual wins minus PyPAT wins is Luck',
      'Elo wins: expected wins from adding up each regular-season game\'s pregame win probability, accounting for opponent strength and home field',
      'Projected record: current wins plus the Elo win probability of every remaining game, rounded to whole games',
    ],
  },
  {
    name: 'Percentile',
    def: 'Where a team ranks against the rest of the league on one number, from 0 (worst) to 100 (best).',
    bullets: [
      'The share of other teams it beats, with ties counting half. 50 is the league median',
      'Flipped where lower is better, such as points allowed or sacks taken, so 100 is always best',
      'Teams with no data are left out instead of counted as zero',
    ],
  },
  {
    name: 'TANY/A',
    def: 'Total adjusted net yards per attempt, where an attempt is every dropback or carry. Touchdowns add 20 yards; interceptions and lost fumbles cost 45. Higher is better.',
    bullets: [
      'Touchdowns add 20 adjusted yards; interceptions and lost fumbles subtract 45.',
      'Includes passing attempts, sacks, and rushing attempts. Higher is better.',
      'Sack yardage and lost fumbles are estimated from team game stats.',
      TANYA_BENCHMARK,
    ],
  },
  {
    name: 'RUSH+',
    def: RUSHPLUS_TIP,
    bullets: [
      'Credits rushing yards above 4 per carry, adds 20 for each rushing touchdown, subtracts 45 for each estimated lost fumble.',
      'Positive means his running is worth more than it costs. Higher is better.',
      'Divide by pass attempts plus sacks to put RUSH+ on the same per-dropback scale as ANY/A. All estimated lost fumbles are charged here, including fumbles on sacks, so a pocket passer can rate below 0. Read alongside TANY/A, not added to it.',
    ],
  },
  {
    name: 'Points per Drive',
    def: 'Points an offense scored, or a defense allowed, per possession.',
    bullets: [
      'Counts only the offense\'s own points: touchdowns, field goals and the extra points after its touchdowns. Pick-sixes and return scores are not charged to either side',
      'Drives are estimated: touchdowns + field goal attempts + punts + turnovers + failed fourth downs. End-of-half kneel-downs and clock-outs are not visible in the box score, so those possessions are missed',
      'Net Pts/Drive is offense minus defense. Higher is better on offense, lower is better on defense',
    ],
  },
  {
    name: 'Points per Play',
    def: METRICS.find(m => m.key === 'pointsPerPlay').off,
    bullets: [
      'Expected points added (EPA) per play is the best public measure of efficiency, but it needs play-by-play data, which Madden does not provide. One goal of this site is to get as close to that insight as possible from box-score data. Points per play, points per drive and the other efficiency rates are those stand-ins. They use actual points, not expected points.',
      'Plays = pass attempts + rush attempts + sacks taken',
      'Same offensive points as Points per Drive, but divided by plays instead of possessions, so a fast, short-drive offense can rate differently on the two',
    ],
  },
  {
    name: 'Series %',
    def: 'How often a series keeps the chains moving or scores.',
    bullets: [
      '(first downs + touchdowns) ÷ (first downs + drives): each first down and each drive\'s last series counts as a series',
      'Higher is better on offense, lower on defense',
    ],
  },
  {
    name: 'Efficiency rates',
    def: 'Supporting rates on the Efficiency page.',
    bullets: [
      '3rd %: third downs converted ÷ third downs attempted',
      'RZ TD %: red-zone trips (inside the 20) that ended in a touchdown',
      'TO/Drive: turnovers (interceptions plus lost fumbles) per drive; on defense, takeaways',
      'Sack %: sacks ÷ dropbacks; on defense, the share of opposing dropbacks sacked',
    ],
  },
]

const PAGES = [
  {
    name: 'Teams',
    bullets: [
      'Every team grouped by division; click one for its profile, or click a team name in any table',
      'Profile: headline numbers with league ranks, a percentile fingerprint for offense and defense beside the league efficiency map, and actual wins against PyPAT and Elo expectations week by week',
      'Game-by-game season arc with upset flags and Elo after every game, the remaining schedule with Elo win probabilities and a projected record, and the team\'s quarterbacks',
      'Franchise history: Elo across every season with its peak and low, season-by-season results, and the all-time record against every opponent',
      'Strength of Schedule in the profile header covers games played so far; Neutral luck means actual wins are within half a win of the scoring-margin expectation',
      'QB Room colors compare each stat with qualified quarterbacks across the league. Qualification requires 10 pass attempts per team game',
      'Rivalries includes playoff games; GP is games played, Point Diff is total points scored minus allowed, and Pts/G For–Against shows scoring averages',
      'Pick any season from the profile header; every table and list exports to Excel, CSV, an image or an AI-ready text block',
    ],
  },
  {
    name: 'Home',
    bullets: [
      'A snapshot of every page — PyPAT leaders, team efficiency, latest scores, top Elo, top quarterbacks',
      'Click any card to open that page in full',
      'The Best Games Ahead card exports like any other table',
    ],
  },
  {
    name: 'Playoffs',
    bullets: [
      'Picture — “If the season ended today” applies end-of-season tiebreakers to completed regular-season games only. Unplayed games do not count; this is the current field, not a forecast.',
      'The top four seeds in each conference are division leaders; seeds five through seven are wild cards. Every remaining team is shown in the hunt.',
      "Seeds follow Madden 27's tiebreaker rules.",
      'Picture uses compact sortable conference tables, with tiebreak explanations under the info icon. The hunt divider appears only in ascending seed order. Each conference exports the displayed order to Excel, CSV, an image or an AI-ready text block.',
    ],
  },
  {
    name: 'Playoff probability',
    bullets: [
      'Simulate the remaining regular-season games thousands of times, then apply the Madden 27 tiebreaker rules to count playoff appearances, division wins and No. 1 seeds. Each conference has one sortable table, ordered by playoff probability by default; exports follow the displayed order.',
      'Each game uses win probabilities from Elo ratings and home field. Ratings stay fixed within a simulated season, and simulated games have no ties.',
      'In a simulated game, the loser scores 20 and the winner wins by 1, 3, 7, 10, 14 or 21 points, each equally likely. These scores only matter for point-differential tiebreakers.',
      'Probabilities round to whole percents. “>99%” replaces 100% (99.5% or higher), and “<1%” replaces 0% (under 0.5%). These are estimates, not clinch or elimination markers.',
      'Green playoff shading means a higher probability; red means a lower probability, with neutral at 50%. Other chances use green intensity. The seed distribution shows the chance of each seed, 1–7. Blue to teal marks division winners (1–4); amber to red marks wild cards (5–7). The unfilled part is the chance of missing the playoffs.',
    ],
  },
  {
    name: 'Probability history',
    bullets: [
      'The Table / Over time switch opens a chart and sortable data table. Team colours and line styles identify each selected team. Probability over time tracks saved weekly chances of making the playoffs, winning the division or earning the No. 1 seed using Madden 27’s tiebreakers. Pick teams and a goal to compare their paths.',
      'Weekly snapshots are saved after each sync. Snapshots only start accumulating after launch; an admin backfill can fill earlier weeks using Elo ratings as of those weeks. Weeks without a snapshot are not shown.',
      'Team profiles include a small playoff probability history chart when at least two snapshots exist. Export the selected teams and goal to Excel, CSV, a chart image or AI-ready text.',
    ],
  },
  {
    name: 'Title probability',
    bullets: [
      'Each regular-season simulation continues through a seven-seed playoff bracket in each conference. Seed 1 gets a bye; the wild-card games are 2 vs 7, 3 vs 6 and 4 vs 5. The best remaining seed then hosts the lowest remaining seed.',
      'Games use Elo win probabilities with home field for the better seed, except the neutral-site final. Ratings stay fixed within each simulated season and games have no ties.',
      'Make playoffs, Reach round 2 (including a bye), Conference final, Final and Champion are the chances of reaching each stage from today, including the chance of missing the playoffs. Title probability also appears on team profiles. Once the regular season ends, this is a pre-playoff projection with ratings frozen at the end of the regular season to show who was favoured going in.',
      'The Probability tables include Conf. title (reaching the final) and Title (winning the championship), shaded by green intensity. Reach round 2 and Conference final chances appear in their tooltips and exports. A Pre-playoff projection chip identifies frozen forecasts. These are estimates rounded to whole percents, using >99% and <1% at the extremes.',
    ],
  },
  {
    name: 'Leverage',
    bullets: [
      'Compare a team’s probability if it wins its next game with its probability if it loses. Swing is the difference in percentage points; 70% minus 45% is a 25-point swing.',
      'Orange marks a loss and blue a win; the logo marks current probability. Small swings under 10 points can be shown with the toggle.',
      'Biggest games are ranked by importance: add up how much probability moves across all teams between the two outcomes, then divide by two. Other affected teams show who benefits or loses probability with a home win.',
    ],
  },
  {
    name: 'What-If',
    bullets: [
      'Pick home wins, away wins or ties. Picked games are forced; every other remaining game is simulated. Changes compare the scenario with the same simulation’s unpicked baseline.',
      'Share the URL to share your picks. Pick every remaining game for final seeds. Winners alone can leave a spot dependent on scores: point differential or a coin toss can still decide the order. Those spots carry a Depends on scores badge and their probabilities can remain fractional.',
    ],
  },
  {
    name: 'Clinched / Eliminated',
    bullets: [
      'A badge means the result is proven in every possible outcome of the remaining games. Ties and unknown scores are considered. Proven probabilities show 100% or 0%; simulated estimates keep >99% or <1%.',
      'Standings and playoff tables use icons with a visible key: a green check for a playoff spot, crown for the division, and 1 for the No. 1 seed. A muted slashed symbol means out of that goal; a red cross means eliminated from the playoffs. Tables show the highest clinched goal and broadest elimination, up to two icons. Team pages spell out the status.',
      'No badge means it is not settled yet. The proof relies on Madden 27’s tiebreak rules, which match past decisions about 99.85% of the time.',
    ],
  },
  {
    name: 'Path to the playoffs',
    bullets: [
      'Your team’s path shows whether winning out is proven to secure a playoff spot, its best simulated seed, and its probability at each final record. A simulated 100% alone is not proof that you control your destiny.',
      'See which other results help if you win out, and who to root for this week. Swing measures percentage points of playoff probability. Load your remaining wins and the helpful results into What-If to explore the combined scenario.',
    ],
  },
  {
    name: 'Final-week scenarios',
    bullets: [
      'With 1–16 games left across the league, final-week scenarios check every combination of wins and losses. In means the goal is secured in every outcome; out means it is impossible; open means it is unresolved. Each listed condition is a sufficient combination of results to clinch the goal or eliminate us. No ties are assumed and scores are unknown, so score-dependent tiebreakers can leave a goal open with no proven conditions.',
    ],
  },
  {
    name: 'Playoff accuracy check',
    bullets: [
      'Do teams given a 70% win probability win about 70% of the time? The bucket table compares predicted home win probabilities with actual home win rates in completed regular-season games; ties count as half a win.',
      'The Brier score is the average squared error of those game predictions. Lower is better, zero is perfect, and always predicting a coin flip provides a comparison. This checks Elo game predictions, not playoff outcome calibration.',
    ],
  },
  {
    name: 'Standings',
    bullets: [
      'Standings — every team ranked by PyPAT by default, with three SoS columns: Played (opponents so far), Left (remaining schedule), Total (full season)',
      'Season History — W-L, PyPAT and Luck across every season; sort by any season',
      'Week by Week — PyPAT line chart; click teams to highlight them',
      'SoS Played, Left and Total share one source. Previous-season opponent quality through Week 9; current-season quality from Week 10 through the playoffs. Finished seasons use their own season. The toggle overrides the default.',
      'All columns sortable; every table here exports to Excel, CSV, an image or an AI-ready text block',
    ],
  },
  {
    name: 'Efficiency',
    bullets: [
      'Overview — a chart of offense against defense points per drive, plus net points per drive for every team',
      'Offense and Defense — points, yards, series, third-down, red-zone, turnover and sack rates, heat-colored within each column',
      'Regular season, playoffs or both. Needs the player and team stat sync; the page says so when it is empty',
      'Overview, Offense and Defense each export to Excel, CSV, an image or an AI-ready text block',
    ],
  },
  {
    name: 'Games',
    bullets: [
      'Game results by season and week',
      'Filter by regular season or playoffs',
      'Links to full recaps on NeonSportz',
      'Export the week\'s results to Excel, CSV, an image or an AI-ready text block',
    ],
  },
  {
    name: 'Elo',
    bullets: [
      'Ratings — all 32 teams ranked by Elo, with weekly change, rank movement, and biggest risers and fallers',
      'History — rating trends across every season; click teams to highlight them',
      'Matchup — pick any two teams for a predicted win probability',
      'Games — game-by-game Elo changes and pregame ratings, plus unplayed games for This week or Rest of season. Sort projected games by Outlook to find the closest matchups',
      'Every table and rating history exports to Excel, CSV, an image or an AI-ready text block',
    ],
  },
  {
    name: 'QBs',
    bullets: [
      'Leaderboard — every quarterback ranked by TANY/A, by week, season or all-time',
      'Column presets for efficiency, classic box score, rushing and All; all columns sortable',
      'Movement — biggest risers and fallers, plus a rank-by-week chart you can track season by season or across every season',
      'Regular season, playoffs or both; the leaderboard, movers and rank history export to Excel, CSV, an image or an AI-ready text block',
      'Click any quarterback to open his player page on NeonSportz',
    ],
  },
]

const EXPORTS = [
  'Every table and data list has four buttons: XLSX, CSV, PNG and AI. Every row of the table, in its current sort and columns.',
  'XLSX and CSV download the data. PNG copies an image of the whole table to your clipboard, or downloads it if your browser cannot copy images (Firefox). A table too large to draw as an image says so; CSV and AI always carry every row',
  'AI copies a text block you can paste into ChatGPT, Claude or Gemini: a short league primer, what the table is, a definition of every column, the complete data, and the link to fetch it again',
  'The API behind that link is public: no key and no login. An assistant that can browse can pull fresh numbers itself, so you do not have to copy the table again',
  'Empty cells mean no data, which is not zero',
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
  const syncLine = useSyncLine()
  const { data: config } = useLoad('elo-config', getPublicEloConfig)
  return (
    <div>
      <PageHeader title="About" qualifier="How the numbers work" />
      <p className="text-sm text-muted mb-6">See what's new in the <Link to="/changelog" className="text-accent hover:underline">Changelog</Link>.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {STATS(config).map(({ name, def, bullets }) => (
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

      <h2 className="th mb-3">Exports</h2>
      <div className="border-t border-line pt-3 mb-10 max-w-3xl">
        <Bullets items={EXPORTS} />
      </div>

      <p className="text-sm text-muted border-y border-line py-3 mb-10">
        {syncLine}
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
