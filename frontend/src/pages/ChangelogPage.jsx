import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { TIERS, UPSET_LEVELS, pct0 } from '../utils/eloLean'

function Screenshot({ name, alt }) {
  const src = `/img/changelog/${name}.png`
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block">
      <img src={src} alt={alt} loading="lazy" className="h-auto max-w-full rounded border border-line" />
    </a>
  )
}

export default function ChangelogPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-8 text-sm leading-relaxed" aria-label="Nov 11 – 18, 2026">
      <PageHeader
        title={<>What's new in the <span className="text-accent">Red Zone</span></>}
        qualifier="Red Zone Stats · Nov 11 – 18, 2026"
        takeaway="A big week for the stats site. There's a new home page, Elo power ratings with game predictions, a QB leaderboard, a team efficiency page, and every table can now be exported. This takes about three minutes to read, and each section ends with something to try."
      />
      <nav className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 gap-px border border-line bg-line" aria-label="Jump to a feature">
        <a href="#playoffs" className="flex flex-col bg-bg p-3 hover:bg-surface"><b className="font-display text-xl uppercase">Playoffs</b><small className="text-sm text-muted">The field if the season ended today</small></a>
        <a href="#elo" className="flex flex-col bg-bg p-3 hover:bg-surface"><b className="font-display text-xl uppercase">Elo Ratings</b><small className="text-sm text-muted">Power ratings, predictions, upsets</small></a>
        <a href="#qbs" className="flex flex-col bg-bg p-3 hover:bg-surface"><b className="font-display text-xl uppercase">QB Rankings</b><small className="text-sm text-muted">Who's really the best passer</small></a>
        <a href="#efficiency" className="flex flex-col bg-bg p-3 hover:bg-surface"><b className="font-display text-xl uppercase">Efficiency</b><small className="text-sm text-muted">Points per drive, O vs D</small></a>
        <a href="#home" className="flex flex-col bg-bg p-3 hover:bg-surface"><b className="font-display text-xl uppercase">Home Page</b><small className="text-sm text-muted">The whole league at a glance</small></a>
        <a href="#standings" className="flex flex-col bg-bg p-3 hover:bg-surface"><b className="font-display text-xl uppercase">Standings</b><small className="text-sm text-muted">History and week-by-week tabs</small></a>
        <a href="#exports" className="flex flex-col bg-bg p-3 hover:bg-surface"><b className="font-display text-xl uppercase">Exports</b><small className="text-sm text-muted">Excel, images, and AI</small></a>
      </nav>

      <section id="playoffs" className="space-y-3 border-t-2 border-rule pt-3 scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="font-display font-extrabold uppercase text-3xl">Playoffs</h2><span className="rounded border border-accent px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">Beta · Nov 22, 2026</span></div>
        <p className="text-base">See the seven playoff seeds in each conference and every team in the hunt, using only completed regular-season games.</p>
        <ul className="space-y-2 [&>li]:border-l-2 [&>li]:border-line [&>li]:pl-3">
          <li>Switch between Madden 27 and real NFL tiebreakers. Markers show when a team would have a different seed or miss the field under the other rules.</li>
          <li>Open Tiebreak details for a plain-English explanation, or export either conference to Excel, CSV, an image or an AI-ready text block.</li>
        </ul>
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 rounded bg-surface p-3"><span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">Try this</span><p>Open <Link to="/playoffs?tab=picture&rules=madden" className="text-accent hover:underline">Playoffs → Picture</Link> and switch rules to see how the field changes.</p></div>
      </section>

      <section id="elo" className="space-y-3 border-t-2 border-rule pt-3 scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="font-display font-extrabold uppercase text-3xl">Elo Ratings</h2><span className="rounded border border-accent px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">New page</span></div>
        <p className="text-base">Every team now has one power rating that carries across seasons. Wins over good teams count for more, blowouts count for more, and the rating moves after every game, playoffs included.</p>
        <ul className="space-y-2 [&>li]:border-l-2 [&>li]:border-line [&>li]:pl-3">
          <li><b>Ratings.</b> All 32 teams ranked by Elo, showing this week's change, rank movement, and the biggest risers and droppers.</li>
          <li><b>History.</b> A chart of every team's rating across every season. Click teams to highlight them and follow a dynasty or a collapse.</li>
          <li><b>Matchup.</b> Pick any two teams and get a predicted win probability.</li>
          <li><b>Predictions for every unplayed game.</b> Each one shows who Elo favors, their win chance, and a rating for how close it should be:</li>
        </ul>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1" role="list" aria-label="Matchup tiers by favorite's win chance">
          {TIERS.map((tier, index) => (
            <div key={tier.label} role="listitem" className="rounded border-t-2 p-2 last:col-span-2 sm:last:col-span-1"
              style={{ borderColor: `rgb(${tier.rgb})`, backgroundColor: `rgb(${tier.rgb} / 0.22)` }}>
              <b className="block font-display text-xl uppercase">{tier.label}</b>
              <span className="text-xs text-muted num">{Math.round(tier.lo * 100)}{index === TIERS.length - 1 ? '%+' : `–${pct0(tier.hi)}`}</span>
            </div>
          ))}
        </div>
        <ul className="space-y-2 [&>li]:border-l-2 [&>li]:border-line [&>li]:pl-3">
          <li><b>Upset alerts.</b> Finished games are flagged when the underdog won, and the bigger the favorite that went down, the louder the flag:</li>
        </ul>
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
          {UPSET_LEVELS.map((level, index) => (
            <span key={level.label} className="inline-flex items-center gap-1.5">
              {index > 0 && <span aria-hidden="true">→</span>}
              <span className="rounded px-2 py-0.5 font-semibold text-ink"
                style={{ backgroundColor: `rgb(var(--bad) / ${level.alpha})` }}>{level.label}</span>
            </span>
          ))}
        </div>
        <p className="text-sm text-muted">Across three seasons, 80%+ favorites lost 8 of 82 games, so expect about three Stunners a season. Is your team on the wrong end of one?</p>
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 rounded bg-surface p-3"><span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">Try this</span><p>Open <Link to="/elo?tab=games" className="text-accent hover:underline">Elo → Games</Link>, switch to <i>Rest of season</i> and sort by Outlook to find the closest games left on your schedule. Then pull up Matchup against your rival.</p></div>
        <Screenshot name="elo-games" alt="Elo Games showing projected matchups, win probabilities, and Outlook tiers" />
        <Screenshot name="elo-history" alt="Elo History chart tracking team power ratings across seasons" />
        <Screenshot name="elo-matchup" alt="Elo Matchup comparing two teams with a predicted win probability" />
      </section>

      <section id="qbs" className="space-y-3 border-t-2 border-rule pt-3 scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="font-display font-extrabold uppercase text-3xl">QB Rankings</h2><span className="rounded border border-accent px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">New page</span></div>
        <p className="text-base">Passer rating doesn't count sacks or fumbles, and it ignores what a QB does with his legs. The new QB page ranks every quarterback by <b>TANY/A</b>, a single efficiency number that does.</p>
        <ul className="space-y-2 [&>li]:border-l-2 [&>li]:border-line [&>li]:pl-3">
          <li><b>Leaderboard</b> by week, season, or all-time, for regular season, playoffs, or both. You can switch the columns between efficiency, classic box score, and rushing.</li>
          <li><b>RUSH+</b> measures how much a scrambling QB adds with his legs, so mobile QBs get credit for it.</li>
          <li><b>Movement.</b> Biggest risers and fallers, plus a rank-by-week chart. Switch it to all-time to watch a QB climb the career list in the middle of a season.</li>
          <li>Click any QB's name to open his NeonSportz player page.</li>
        </ul>
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 rounded bg-surface p-3"><span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">Try this</span><p>Set the <Link to="/qb" className="text-accent hover:underline">QB leaderboard</Link> to all-time and playoffs only. Who's the real big-game QB in league history?</p></div>
        <Screenshot name="qb-leaderboard" alt="QB leaderboard ranking quarterbacks by TANY/A with passing and rushing statistics" />
        <Screenshot name="qb-movement" alt="QB Movement showing risers, fallers, and quarterback ranks over time" />
      </section>

      <section id="efficiency" className="space-y-3 border-t-2 border-rule pt-3 scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="font-display font-extrabold uppercase text-3xl">Team Efficiency</h2><span className="rounded border border-accent px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">New page</span></div>
        <p className="text-base">Total yards can be padded in garbage time. Points per drive is harder to fake. The Efficiency page shows how well each offense and defense actually performs on every possession.</p>
        <ul className="space-y-2 [&>li]:border-l-2 [&>li]:border-line [&>li]:pl-3">
          <li><b>Overview.</b> A chart of every team's logo placed by offense against defense, split into four quadrants, plus net points per drive.</li>
          <li><b>Offense and Defense tabs</b> with points per drive and per play, yards per play, series success, 3rd down, red zone TD rate, turnovers, and sack rate, each column heat-colored.</li>
        </ul>
        <Screenshot name="efficiency" alt="Team Efficiency overview plotting each team’s offense and defense points per drive against the league averages" />
        <p className="text-sm text-muted">The chart's four corners, split at the league average.</p>
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 rounded bg-surface p-3"><span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">Try this</span><p>Find your logo on the <Link to="/efficiency" className="text-accent hover:underline">Efficiency overview</Link>. Is your record backed by your quadrant, or have you been winning on luck?</p></div>
      </section>

      <section id="home" className="space-y-3 border-t-2 border-rule pt-3 scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="font-display font-extrabold uppercase text-3xl">Home Page</h2><span className="rounded border border-accent px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">New</span></div>
        <p className="text-base">The site now opens on a dashboard of the whole league: PyPAT leaders, latest scores, top Elo teams, top QBs, and team efficiency, each linking to its full page.</p>
        <ul className="space-y-2 [&>li]:border-l-2 [&>li]:border-line [&>li]:pl-3">
          <li><b>Best Games Ahead</b> lists the five closest matchups this week and next, ranked by how close Elo has them to a coin flip. It moves forward on its own as games are played.</li>
        </ul>
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 rounded bg-surface p-3"><span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">Try this</span><p>Check <Link to="/" className="text-accent hover:underline">Best Games Ahead</Link> before you schedule. If you're in a Toss-up, it's worth playing live.</p></div>
        <Screenshot name="home" alt="Home dashboard with Best Games Ahead and league statistics previews" />
      </section>

      <section id="standings" className="space-y-3 border-t-2 border-rule pt-3 scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="font-display font-extrabold uppercase text-3xl">Standings</h2><span className="rounded border border-accent px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">Upgraded</span></div>
        <p className="text-base">Standings is now one page with three tabs, so the history is next to the current table.</p>
        <ul className="space-y-2 [&>li]:border-l-2 [&>li]:border-line [&>li]:pl-3">
          <li><b>Standings.</b> The PyPAT, Luck, and Strength of Schedule table, as before.</li>
          <li><b>Season History.</b> W-L, PyPAT, and Luck for every team in every season, sortable by any season.</li>
          <li><b>Week by Week.</b> A PyPAT line chart for the season. Click teams to compare them.</li>
          <li>Strength of Schedule is more accurate. A division rival you play twice now counts twice.</li>
        </ul>
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 rounded bg-surface p-3"><span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">Try this</span><p>Sort <Link to="/standings?tab=history" className="text-accent hover:underline">Season History</Link> by Luck to see who has been the league's luckiest owner, and who is due for a better season.</p></div>
        <Screenshot name="standings-history" alt="Standings Season History comparing team records, PyPAT, and Luck across seasons" />
      </section>

      <section id="exports" className="space-y-3 border-t-2 border-rule pt-3 scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="font-display font-extrabold uppercase text-3xl">Export Anything</h2><span className="rounded border border-accent px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">Every table</span></div>
        <p className="text-base">Every table on the site now has four export buttons, and each one exports exactly what's on screen.</p>
        <div className="flex flex-wrap gap-1.5 [&>span]:rounded [&>span]:border [&>span]:border-line [&>span]:px-2.5 [&>span]:py-1 [&>span]:font-display [&>span]:font-bold" aria-label="Export formats"><span>XLSX</span><span>CSV</span><span>PNG</span><span>AI</span></div>
        <ul className="space-y-2 [&>li]:border-l-2 [&>li]:border-line [&>li]:pl-3">
          <li><b>PNG</b> copies an image of the table, with team logos and heat colors, ready to paste into Discord.</li>
          <li><b>AI</b> copies the table with explanations of every column, ready to paste into ChatGPT, Claude, or Gemini. Ask it to break down your schedule or write a trash-talk recap backed by real numbers.</li>
          <li><b>XLSX and CSV</b> download the data for your own spreadsheets.</li>
        </ul>
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 rounded bg-surface p-3"><span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">Try this</span><p>Copy the Elo Ratings table with the AI button and ask: <i>"Who's the most overrated team in the league, and why?"</i></p></div>
      </section>

      <section id="also" className="space-y-3 border-t-2 border-rule pt-3 scroll-mt-20">
        <h2 className="font-display font-extrabold uppercase text-3xl">Also new</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 [&_p]:text-sm [&_p]:text-muted">
          <div><h3 className="font-display font-bold uppercase text-xl mb-1">New look, plus dark mode</h3><p>The whole site has a cleaner design, and there's a light/dark toggle in the header.</p></div>
          <div><h3 className="font-display font-bold uppercase text-xl mb-1">League season numbers</h3><p>Seasons are labeled the way the league counts them, so this is Season 103 and later, not calendar years.</p></div>
          <div><h3 className="font-display font-bold uppercase text-xl mb-1">Playoff rounds on Games</h3><p>Playoff games are named by round instead of showing up as week 19 or week 20.</p></div>
          <div><h3 className="font-display font-bold uppercase text-xl mb-1">Elo retuned (Nov 19)</h3><p>After testing ten seasons of past results across Madden 26 and Madden 27, Elo now keeps 78% of a team's rating between seasons instead of 90%, and counts blowouts up to 28 points. Ratings and history shifted slightly.</p></div>
          <div><h3 className="font-display font-bold uppercase text-xl mb-1">Owner changes in Elo (Nov 20)</h3><p>When a team gets a new owner mid-season, its Elo is pulled part of the way back toward 1500, the same as at a new season.</p></div>
          <div><h3 className="font-display font-bold uppercase text-xl mb-1">Team profiles (Nov 20)</h3><p>Every team has its own page under <Link to="/teams" className="text-accent hover:underline">Teams</Link>: league ranks, a percentile fingerprint, wins against expectation, a game-by-game season arc, the road ahead, franchise history and head-to-head records. Click any team name in a table to open it. Profile summaries explain what the numbers mean, with matching copy in PNG exports. The header shows Strength of Schedule for games played, and Road Ahead shows a projected record, win probabilities and Remaining SoS. Previous-season opponent quality through Week 9; current-season quality from Week 10 through the playoffs. Finished seasons use their own season. The toggle overrides the default.</p></div>
          <div><h3 className="font-display font-bold uppercase text-xl mb-1">Sortable everywhere</h3><p>Every column on the Elo and QB tables sorts, and the game tables order teams by Elo.</p></div>
        </div>
      </section>

      <footer className="border-t border-line pt-4 text-sm text-muted">
        Every number is explained on the <Link to="/about" className="text-accent hover:underline">About page</Link>. Stats sync from NeonSportz every morning at 4:00 AM ET.
      </footer>
    </article>
  )
}
