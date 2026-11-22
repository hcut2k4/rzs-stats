# NeonSportz Madden 27 seasons (other leagues)

Pulled 2026-11-21 from the public API `https://neonsportz.com/api/leagues/{ABBR}/` by `fetch.py`. The leagues are UFL, SML, DM2, SMLP, SFL, ALS27, MSS and MMGA6.

- `*-bracket.txt`: a completed season. Each `P week home away` line is a playoff game: week 18 is the wild-card round and week 19 is the divisional round. Madden's seeds are inferred from these games: the #1 seed is the team on a bye, and the wild-card games pair 2v7, 3v6 and 4v5, with the higher seed at home.
- Other line types: `T abbr conference division` for teams and `G week home away homeScore awayScore` for completed regular-season games. Status 4 marks a tie game.
- `Run2.java` scores the NFL model and model M2 against every file. Run it with `java -cp backend/target/classes Run2.java <files>`.

Only actual playoff matchups are used as ground truth. Mid-season standings `seed` values are deliberately excluded.
