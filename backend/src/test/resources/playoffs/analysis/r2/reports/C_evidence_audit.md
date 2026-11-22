# M3 exercise, discrimination and held-out audit

The supplied M3 description fits **34/34 conferences**. That is fitted performance. A family of **5,328,961 configurations including the NFL reference** was refitted within each training fold. Selected-model predictions are **32/34** leave-one-season-out, **30/32** leave-one-named-league-out, and **2/3** on partial 2026. Full-data fitting leaves **693** maximizers; **315** also fit the partial groups.

## Scope, ground truth and interpretation

Only files under this output directory were created or edited. All source data and prior analysis scripts were read-only; Python bytecode writes were disabled. No outside football rule source was needed: the supplied NFL procedure and existing validated engine/harness define the comparison.

There are 17 season datasets: nine named franchise leagues plus the separately labeled SIMFULL dataset. The requested nine league folds exclude SIMFULL from the held-out targets but retain it in training; its independent exclusion is shown as an extra fold and is also one of the 17 season folds. Counting SIMFULL as a tenth league would produce a separate 32/34 aggregate, not the requested nine-league aggregate. Seasons mean dataset IDs, not two calendar-year folds.

All 34 conference predictions were tested against complete candidate seven-seed lists. MSS-2027 has two candidates for **each** conference, and each candidate couples division-winner ordering to wild-card ordering. These constraints must remain coupled. The prior decisions harness omits ambiguous conferences and adds one unconstrained-order AFC multi tie: its 69 useful local constraints are 52 oriented two-team ties and 17 multi-team ties. The three omitted MSS two-team pairs have either orientation allowed; they cannot prove a comparator. Local tables use those 69 constraints; whole-conference scores preserve all candidate coupling. In particular, one-at-a-time ranking violates MSS-2027 AFC jointly even though its stand-alone wild-card order is allowed.

**Held-out protocol:** no held-out scores or partial-season scores enter training maximization, the NFL-distance tie break, or the final deterministic tie break. However, M3, the original grids and even the partial-season result were already developed/exposed using these data. Thus these are honest fold-refitted predictions conditional on a retrospectively designed family, not a blind prospective validation or an unbiased estimate of a whole discovery process. The three partial groups share teams/games and are not three independent seasons. A fresh sim is still needed.

## Exercise and discrimination

For each alternative, only that component changes from M3. "Observable difference" compares the constrained selected/order output, not the order of nonqualifiers. "Falsified" means the alternative violates a permitted outcome; differences that are allowed by an ambiguous candidate are not falsifications. Full-conference columns also capture candidate coupling and propagation of a changed division champion. Local ablations measure conditional necessity within M3, not global proof of that mechanism. All witness records and H2H edges appear in [observations.md](observations.md).

### Exercise counts

A "reach" is an observed decision whose M3 recursion calls the step; a "split" is a nontrivial partition anywhere in that recursion. Splits can concern unobserved eliminated-team ordering; **they do not imply empirical necessity**. The alternative tables measure actual observable discrimination and supply the stronger causal test.

| Step | Decisions reached /69 | Decisions with split | Split cases |
|---|---|---|---|
| Two-team H2H | 65 | 25 | DM2-2027 AFC div CIN,BAL; DM2-2027 AFC wc HOU,BAL; DM2-2027 NFC wc PHI,WAS,DET; MMGA6-2026 AFC wc PIT,JAX; MMGA6-2026 NFC div NYG,WAS; MMGA6-2026 NFC wc LAR,WAS; MMGA6-2027 AFC dw NE,BAL; MSS-2026 AFC div BAL,CLE; MSS-2026 AFC dw JAX,BAL; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; RZS-2027 AFC div LV,KC; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT; SFL-2026 NFC dw GB,ATL; SFL-2026 NFC wc DAL,SEA; SFL-2026 NFC wc NYG,AZ; SIMFULL AFC div CLE,PIT; SIMFULL AFC div DEN,LAC; SIMFULL NFC dw SEA,DET; SML-2027 NFC dw SF,NYG; SML-2027 NFC wc NO,LAR; SMLP-2027 AFC wc BUF,LV; UFL-2027 AFC dw BAL,NE; UFL-2027 AFC wc JAX,CLE,NYJ; UFL-2027 NFC div NYG,WAS; UFL-2027 NFC dw CHI,CAR |
| Two-team DIV | 41 | 30 | ALS27-2026 AFC dw BAL,NE; ALS27-2026 AFC dw KC,TEN; ALS27-2026 AFC wc PIT,NYJ; ALS27-2026 NFC wc LAR,CAR; DM2-2026 NFC wc LAR,CHI; DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 AFC div CIN,PIT; MMGA6-2026 NFC div AZ,LAR; MMGA6-2027 AFC dw IND,LAC; MMGA6-2027 NFC div ATL,TB; MMGA6-2027 NFC dw NYG,SEA; MMGA6-2027 NFC wc CHI,PHI; MSS-2026 AFC wc TEN,BUF; MSS-2026 NFC wc CHI,LAR; MSS-2027 AFC wc DEN,BUF,JAX; RZS-2026 AFC dw BUF,JAX; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT; SIMFULL AFC wc BUF,LV,CLE; SML-2026 AFC dw LV,JAX; SML-2026 AFC wc NE,HOU,LAC; SML-2026 NFC div PHI,NYG; SML-2026 NFC wc ATL,AZ,DET; SML-2027 AFC wc CLE,NE; SML-2027 NFC dw CHI,CAR; SMLP-2026 AFC dw PIT,MIA; SMLP-2026 NFC dw LAR,DET; SMLP-2026 NFC wc CHI,NYG; UFL-2026 AFC div LV,DEN; UFL-2026 AFC wc NYJ,CIN,CLE; UFL-2027 NFC dw NYG,LAR |
| Multi lost-to-everyone | 17 | 3 | SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT; SML-2026 AFC wc NE,HOU,LAC; UFL-2027 AFC wc JAX,CLE,NYJ |
| Multi inverted H2H% | 10 | 10 | DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; SML-2026 NFC wc ATL,AZ,DET; UFL-2026 NFC wc DAL,SEA,MIN |
| Same-division reduction | 11 | 7 | DM2-2027 NFC wc PHI,WAS,DET; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; RZS-2027 NFC wc PHI,DET,WAS; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT; SIMFULL NFC wc WAS,NYG,CHI; UFL-2026 AFC wc NYJ,CIN,CLE |
| Multi common games | 0 | 0 | — |
| Multi conference | 0 | 0 | — |
| Multi division | 0 | 0 | — |
| SOV | 2 | 2 | MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; UFL-2026 AFC wc NYJ,CIN,CLE |
| SOS | 0 | 0 | — |
| NET | 0 | 0 | — |


### Two-team decisions

52 directly observed two-team decisions. These counts stop at the first separating criterion; they exclude pairs created inside a larger tie.

| Context | N | H2H reached / decides | DIV reached / decides | COM reached / decides | CONF reached / decides | SOV reached / decides | SOS reached / decides | NET reached / decides |
|---|---|---|---|---|---|---|---|---|
| div | 15 | 15 / 7 | 8 / 5 | 3 / 3 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| dw | 22 | 22 / 7 | 15 / 10 | 5 / 2 | 3 / 3 | 0 / 0 | 0 / 0 | 0 / 0 |
| wc | 15 | 15 / 7 | 8 / 8 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |


| Conflict | Condition | N | Known-outcome cases |
|---|---|---|---|
| DIV vs CONF | Unconditional | 9 | UFL-2026 AFC div LV,DEN; UFL-2027 AFC dw BAL,NE; SML-2027 NFC dw CHI,CAR; SMLP-2026 NFC dw LAR,DET; SFL-2026 NFC dw GB,ATL; ALS27-2026 AFC wc PIT,NYJ; MSS-2026 AFC div BAL,CLE; MSS-2026 AFC dw JAX,BAL; MMGA6-2026 NFC div AZ,LAR |
| DIV vs CONF | Earlier M3 steps tied | 5 | UFL-2026 AFC div LV,DEN; SML-2027 NFC dw CHI,CAR; SMLP-2026 NFC dw LAR,DET; ALS27-2026 AFC wc PIT,NYJ; MMGA6-2026 NFC div AZ,LAR |
| COM vs CONF | Unconditional | 10 | SIMFULL AFC div CLE,PIT; SIMFULL AFC div DEN,LAC; UFL-2026 AFC div LV,DEN; UFL-2026 NFC div WAS,NYG; UFL-2027 NFC dw CHI,CAR; SML-2027 AFC wc CLE,NE; DM2-2027 AFC div CIN,BAL; SMLP-2027 AFC wc BUF,LV; MSS-2026 AFC dw JAX,BAL; MMGA6-2026 NFC div AZ,LAR |
| COM vs CONF | Earlier M3 steps tied | 1 | UFL-2026 NFC div WAS,NYG |
| DIV vs COM | Unconditional | 15 | SIMFULL AFC div CLE,PIT; SIMFULL AFC div DEN,LAC; UFL-2027 AFC dw BAL,NE; UFL-2027 NFC dw CHI,CAR; SML-2027 AFC wc CLE,NE; SML-2027 NFC dw CHI,CAR; DM2-2027 AFC div CIN,BAL; SMLP-2027 AFC wc BUF,LV; ALS27-2026 AFC dw KC,TEN; ALS27-2026 AFC wc PIT,NYJ; MSS-2026 AFC div BAL,CLE; MSS-2026 NFC wc CHI,LAR; MMGA6-2026 AFC div CIN,PIT; MMGA6-2026 NFC div NYG,WAS; MMGA6-2027 AFC dw IND,LAC |
| DIV vs COM | Earlier M3 steps tied | 7 | SML-2027 AFC wc CLE,NE; SML-2027 NFC dw CHI,CAR; ALS27-2026 AFC dw KC,TEN; ALS27-2026 AFC wc PIT,NYJ; MSS-2026 NFC wc CHI,LAR; MMGA6-2026 AFC div CIN,PIT; MMGA6-2027 AFC dw IND,LAC |


### Two-team list alternatives

| Alternative (one change from M3) | Observable differences /69 | Falsified /69 | Fit | Partial | Specific falsifying observations | Full conference failures |
|---|---|---|---|---|---|---|
| Division CONF before COM | 1 | 1 | 33/34 | 2/3 | UFL-2026 NFC div WAS,NYG | UFL-2026 NFC |
| NFL wild-card list everywhere | 17 | 17 | 20/34 | 1/3 | SIMFULL AFC wc BUF,LV,CLE; UFL-2026 AFC div LV,DEN; UFL-2026 AFC wc NYJ,CIN,CLE; UFL-2026 NFC div WAS,NYG; SML-2026 AFC wc NE,HOU,LAC; SML-2026 NFC wc ATL,AZ,DET; SML-2027 NFC dw CHI,CAR; DM2-2027 NFC dw MIN,NYG,TB; SMLP-2026 NFC dw LAR,DET; SMLP-2026 NFC wc CHI,NYG; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT; ALS27-2026 AFC dw KC,TEN; ALS27-2026 AFC wc PIT,NYJ; MSS-2026 NFC wc CHI,LAR; MMGA6-2026 AFC div CIN,PIT; MMGA6-2026 NFC div AZ,LAR; MMGA6-2027 AFC dw IND,LAC | SIMFULL AFC; UFL-2026 AFC; UFL-2026 NFC; SML-2026 AFC; SML-2026 NFC; SML-2027 NFC; DM2-2027 NFC; SMLP-2026 NFC; SFL-2026 AFC; ALS27-2026 AFC; MSS-2026 NFC; MMGA6-2026 AFC; MMGA6-2026 NFC; MMGA6-2027 AFC |
| CONF before DIV | 10 | 10 | 24/34 | 2/3 | UFL-2026 AFC div LV,DEN; UFL-2026 NFC div WAS,NYG; SML-2026 AFC wc NE,HOU,LAC; SML-2026 NFC wc ATL,AZ,DET; SML-2027 NFC dw CHI,CAR; DM2-2027 NFC dw MIN,NYG,TB; SMLP-2026 NFC dw LAR,DET; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT; ALS27-2026 AFC wc PIT,NYJ; MMGA6-2026 NFC div AZ,LAR | UFL-2026 AFC; UFL-2026 NFC; SML-2026 AFC; SML-2026 NFC; SML-2027 NFC; DM2-2027 NFC; SMLP-2026 NFC; SFL-2026 AFC; ALS27-2026 AFC; MMGA6-2026 NFC |
| COM before DIV | 9 | 9 | 26/34 | 3/3 | SIMFULL AFC wc BUF,LV,CLE; SML-2026 NFC wc ATL,AZ,DET; SML-2027 AFC wc CLE,NE; SML-2027 NFC dw CHI,CAR; ALS27-2026 AFC dw KC,TEN; ALS27-2026 AFC wc PIT,NYJ; MSS-2026 NFC wc CHI,LAR; MMGA6-2026 AFC div CIN,PIT; MMGA6-2027 AFC dw IND,LAC | SIMFULL AFC; SML-2026 NFC; SML-2027 AFC; SML-2027 NFC; ALS27-2026 AFC; MSS-2026 NFC; MMGA6-2026 AFC; MMGA6-2027 AFC |


### Multi H2H alternatives

| Alternative (one change from M3) | Observable differences /69 | Falsified /69 | Fit | Partial | Specific falsifying observations | Full conference failures |
|---|---|---|---|---|---|---|
| NONE | 7 | 7 | 28/34 | 3/3 | RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; UFL-2026 NFC wc DAL,SEA,MIN; DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX | RZS-2026 NFC; SIMFULL AFC; UFL-2026 NFC; DM2-2027 NFC; MSS-2027 AFC; MMGA6-2027 AFC |
| PCT_HALF | 10 | 10 | 26/34 | 3/3 | RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; UFL-2026 NFC wc DAL,SEA,MIN; SML-2026 NFC wc ATL,AZ,DET; DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX | RZS-2026 NFC; SIMFULL AFC; UFL-2026 NFC; SML-2026 NFC; DM2-2027 NFC; MSS-2027 AFC; MMGA6-2026 NFC; MMGA6-2027 AFC |
| PCT_NA | 8 | 8 | 27/34 | 3/3 | RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; UFL-2026 NFC wc DAL,SEA,MIN; SML-2026 NFC wc ATL,AZ,DET; DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX | RZS-2026 NFC; SIMFULL AFC; UFL-2026 NFC; SML-2026 NFC; DM2-2027 NFC; MSS-2027 AFC; MMGA6-2027 AFC |
| WINMIN | 1 | 1 | 33/34 | 3/3 | SIMFULL AFC dw NE,DEN,IND | SIMFULL AFC |
| WINMAX | 10 | 10 | 26/34 | 3/3 | RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; UFL-2026 NFC wc DAL,SEA,MIN; SML-2026 NFC wc ATL,AZ,DET; DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX | RZS-2026 NFC; SIMFULL AFC; UFL-2026 NFC; SML-2026 NFC; DM2-2027 NFC; MSS-2027 AFC; MMGA6-2026 NFC; MMGA6-2027 AFC |
| LOSSMAX | 1 | 1 | 33/34 | 3/3 | MMGA6-2027 AFC wc HOU,LV,BUF,NYJ | MMGA6-2027 AFC |
| LOSSMIN | 10 | 10 | 26/34 | 3/3 | RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; UFL-2026 NFC wc DAL,SEA,MIN; SML-2026 NFC wc ATL,AZ,DET; DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX | RZS-2026 NFC; SIMFULL AFC; UFL-2026 NFC; SML-2026 NFC; DM2-2027 NFC; MSS-2027 AFC; MMGA6-2026 NFC; MMGA6-2027 AFC |
| NETMIN | 0 | 0 | 34/34 | 3/3 | None | None |
| NETMAX | 10 | 10 | 26/34 | 3/3 | RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; UFL-2026 NFC wc DAL,SEA,MIN; SML-2026 NFC wc ATL,AZ,DET; DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX | RZS-2026 NFC; SIMFULL AFC; UFL-2026 NFC; SML-2026 NFC; DM2-2027 NFC; MSS-2027 AFC; MMGA6-2026 NFC; MMGA6-2027 AFC |
| OPP | 0 | 0 | 34/34 | 3/3 | None | None |


### No-game default alternatives

| Alternative (one change from M3) | Observable differences /69 | Falsified /69 | Fit | Partial | Specific falsifying observations | Full conference failures |
|---|---|---|---|---|---|---|
| PCTINV_ZERO | 1 | 1 | 33/34 | 3/3 | SIMFULL AFC dw NE,DEN,IND | SIMFULL AFC |
| PCTINV_ONE | 1 | 1 | 33/34 | 3/3 | MMGA6-2027 AFC wc HOU,LV,BUF,NYJ | MMGA6-2027 AFC |
| PCTINV_NA | 5 | 5 | 30/34 | 3/3 | RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; UFL-2026 NFC wc DAL,SEA,MIN; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ | RZS-2026 NFC; SIMFULL AFC; UFL-2026 NFC; MMGA6-2027 AFC |
| EXCLUDED | 6 | 6 | 30/34 | 3/3 | RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ | RZS-2026 NFC; SIMFULL AFC; MMGA6-2026 NFC; MMGA6-2027 AFC |


### Lost-to-everyone alternatives

| Alternative (one change from M3) | Observable differences /69 | Falsified /69 | Fit | Partial | Specific falsifying observations | Full conference failures |
|---|---|---|---|---|---|---|
| NONE | 3 | 3 | 31/34 | 0/3 | UFL-2027 AFC wc JAX,CLE,NYJ; SML-2026 AFC wc NE,HOU,LAC; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT | UFL-2027 AFC; SML-2026 AFC; SFL-2026 AFC |
| SWEEPLS | 0 | 0 | 34/34 | 3/3 | None | None |
| LOSTVAC | 1 | 1 | 33/34 | 3/3 | DM2-2027 NFC wc PHI,WAS,DET | DM2-2027 NFC |
| SWEEP | 4 | 4 | 30/34 | 3/3 | UFL-2026 AFC wc NYJ,CIN,CLE; SML-2026 NFC wc ATL,AZ,DET; DM2-2027 NFC dw MIN,NYG,TB; MSS-2027 AFC wc DEN,BUF,JAX | UFL-2026 AFC; SML-2026 NFC; DM2-2027 NFC; MSS-2027 AFC |
| SWEEPS | 4 | 4 | 30/34 | 3/3 | UFL-2026 AFC wc NYJ,CIN,CLE; SML-2026 NFC wc ATL,AZ,DET; DM2-2027 NFC dw MIN,NYG,TB; MSS-2027 AFC wc DEN,BUF,JAX | UFL-2026 AFC; SML-2026 NFC; DM2-2027 NFC; MSS-2027 AFC |
| SWEEPX | 1 | 1 | 33/34 | 2/3 | DM2-2027 NFC wc PHI,WAS,DET | DM2-2027 NFC |
| SWEEPXS | 0 | 0 | 34/34 | 3/3 | None | None |
| LOSTVACANY | 0 | 0 | 34/34 | 3/3 | None | None |


### Division reduction alternatives

| Alternative (one change from M3) | Observable differences /69 | Falsified /69 | Fit | Partial | Specific falsifying observations | Full conference failures |
|---|---|---|---|---|---|---|
| Normal H2H CONF first | 4 | 4 | 30/34 | 3/3 | RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; RZS-2027 NFC wc PHI,DET,WAS; UFL-2026 AFC wc NYJ,CIN,CLE; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT | RZS-2026 NFC; RZS-2027 NFC; UFL-2026 AFC; SFL-2026 AFC |
| Normal H2H COM first | 5 | 5 | 29/34 | 3/3 | RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; RZS-2027 NFC wc PHI,DET,WAS; UFL-2026 AFC wc NYJ,CIN,CLE; DM2-2027 NFC wc PHI,WAS,DET; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT | RZS-2026 NFC; RZS-2027 NFC; UFL-2026 AFC; DM2-2027 NFC; SFL-2026 AFC |
| Precomputed NFL division rank | 5 | 5 | 29/34 | 3/3 | RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; RZS-2027 NFC wc PHI,DET,WAS; UFL-2026 AFC wc NYJ,CIN,CLE; DM2-2027 NFC wc PHI,WAS,DET; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT | RZS-2026 NFC; RZS-2027 NFC; UFL-2026 AFC; DM2-2027 NFC; SFL-2026 AFC |
| No reduction | 2 | 2 | 32/34 | 3/3 | DM2-2027 NFC wc PHI,WAS,DET; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT | DM2-2027 NFC; SFL-2026 AFC |
| Inverted H2H COM first | 1 | 1 | 33/34 | 3/3 | DM2-2027 NFC wc PHI,WAS,DET | DM2-2027 NFC |
| No selected-division exception | 1 | 1 | 33/34 | 3/3 | SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT | SFL-2026 AFC |
| Reduce first | 0 | 0 | 34/34 | 2/3 | None | None |
| Reduce after H2H% | 2 | 2 | 32/34 | 3/3 | DM2-2027 NFC wc PHI,WAS,DET; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT | DM2-2027 NFC; SFL-2026 AFC |


### Tiering alternatives

| Alternative (one change from M3) | Observable differences /69 | Falsified /69 | Fit | Partial | Specific falsifying observations | Full conference failures |
|---|---|---|---|---|---|---|
| One-at-a-time | 4 | 3 | 30/34 | 3/3 | SML-2026 NFC wc ATL,AZ,DET; DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ | SML-2026 NFC; DM2-2027 NFC; MSS-2027 AFC; MMGA6-2027 AFC |


### Cutoff alternatives

| Alternative (one change from M3) | Observable differences /69 | Falsified /69 | Fit | Partial | Specific falsifying observations | Full conference failures |
|---|---|---|---|---|---|---|
| Take ranking order | 3 | 3 | 31/34 | 3/3 | SIMFULL AFC wc BUF,LV,CLE; UFL-2026 AFC wc NYJ,CIN,CLE; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT | SIMFULL AFC; UFL-2026 AFC; SFL-2026 AFC |


### Post-reduction two-team alternatives

| Alternative (one change from M3) | Observable differences /69 | Falsified /69 | Fit | Partial | Specific falsifying observations | Full conference failures |
|---|---|---|---|---|---|---|
| 1: H2H > CONF > COM > SOV > SOS > NET | 0 | 0 | 34/34 | 3/3 | None | None |
| 2: H2H > DIV > COM > CONF > SOV > SOS > NET | 1 | 1 | 33/34 | 3/3 | SIMFULL NFC wc WAS,NYG,CHI | SIMFULL NFC |
| 3: H2H > DIV > CONF > COM > SOV > SOS > NET | 1 | 1 | 33/34 | 3/3 | SIMFULL NFC wc WAS,NYG,CHI | SIMFULL NFC |
| 4: COM > CONF > SOV > SOS > NET | 0 | 0 | 34/34 | 3/3 | None | None |


### Multi fallback alternatives

| Alternative (one change from M3) | Observable differences /69 | Falsified /69 | Fit | Partial | Specific falsifying observations | Full conference failures |
|---|---|---|---|---|---|---|
| 1: CONF > COM > DIV > SOV > SOS > NET | 0 | 0 | 34/34 | 3/3 | None | None |
| 2: COM > DIV > CONF > SOV > SOS > NET | 0 | 0 | 34/34 | 3/3 | None | None |
| 3: DIV > COM > CONF > SOV > SOS > NET | 0 | 0 | 34/34 | 3/3 | None | None |
| 4: CONF > DIV > COM > SOV > SOS > NET | 0 | 0 | 34/34 | 3/3 | None | None |
| 5: COM4 > CONF > DIV > COM > SOV > SOS > NET | 0 | 0 | 34/34 | 3/3 | None | None |
| 6: CONF > COM4 > DIV > COM > SOV > SOS > NET | 0 | 0 | 34/34 | 3/3 | None | None |


### H2H metric discrimination at reached multi-team calls

This table compares tier partitions at the point M3 actually reaches the H2H% step, including calls that yield no split. It is not a count of final seed changes.

| Alternative | Decisions with different partition | Cases |
|---|---|---|
| PCTINV_ZERO | 7 | MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; UFL-2026 NFC wc DAL,SEA,MIN |
| PCTINV_NA | 7 | MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; UFL-2026 NFC wc DAL,SEA,MIN |
| PCT_HALF | 10 | DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; SML-2026 NFC wc ATL,AZ,DET; UFL-2026 NFC wc DAL,SEA,MIN |
| PCT_NA | 10 | DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; SML-2026 NFC wc ATL,AZ,DET; UFL-2026 NFC wc DAL,SEA,MIN |
| PCTINV_ONE | 7 | MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; UFL-2026 NFC wc DAL,SEA,MIN |
| EXCLUDED | 7 | MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; UFL-2026 NFC wc DAL,SEA,MIN |
| WINMIN | 7 | MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; UFL-2026 NFC wc DAL,SEA,MIN |
| LOSSMAX | 7 | MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; UFL-2026 NFC wc DAL,SEA,MIN |
| NETMIN | 0 | None |
| OPP | 0 | None |
| WINMAX | 10 | DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; SML-2026 NFC wc ATL,AZ,DET; UFL-2026 NFC wc DAL,SEA,MIN |
| LOSSMIN | 10 | DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; SML-2026 NFC wc ATL,AZ,DET; UFL-2026 NFC wc DAL,SEA,MIN |
| NETMAX | 10 | DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; SML-2026 NFC wc ATL,AZ,DET; UFL-2026 NFC wc DAL,SEA,MIN |
| PCT_ZERO | 10 | DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; SML-2026 NFC wc ATL,AZ,DET; UFL-2026 NFC wc DAL,SEA,MIN |
| PCT_ONE | 10 | DM2-2027 NFC dw MIN,NYG,TB; MMGA6-2026 NFC dw NYG,CAR,AZ; MMGA6-2027 AFC wc HOU,LV,BUF,NYJ; MSS-2027 AFC wc DEN,BUF,JAX; RZS-2026 NFC dw TB,SF,GB; RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET; SIMFULL AFC dw NE,DEN,IND; SIMFULL AFC wc BUF,LV,CLE; SML-2026 NFC wc ATL,AZ,DET; UFL-2026 NFC wc DAL,SEA,MIN |


### No-game exposure

| Observed decision | Reached group | No-game teams |
|---|---|---|
| RZS-2026 NFC dw TB,SF,GB | TB,SF,GB | SF |
| RZS-2026 NFC wc CHI,LAR,ATL,AZ,DET | CHI,LAR,ATL | LAR |
| SIMFULL AFC dw NE,DEN,IND | NE,DEN,IND | DEN |
| SIMFULL AFC wc BUF,LV,CLE | BUF,LV,CLE | BUF |
| UFL-2026 NFC wc DAL,SEA,MIN | DAL,SEA,MIN | MIN |
| MMGA6-2026 NFC dw NYG,CAR,AZ | NYG,CAR,AZ | CAR |
| MMGA6-2027 AFC wc HOU,LV,BUF,NYJ | HOU,LV,BUF | LV |


### Cross-league and season spread

Union of cases falsifying at least one named local alternative; repeated tests of one case count once. This is breadth of discrimination, not independent confirmations of all details. Individual alternatives and singleton dependencies are visible above.

| Component | Distinct decisions | Leagues | League names | Season IDs |
|---|---|---|---|---|
| Two-team list | 18 | 9 | ALS27,DM2,MMGA6,MSS,SFL,SIMFULL,SML,SMLP,UFL | ALS27-2026; DM2-2027; MMGA6-2026; MMGA6-2027; MSS-2026; SFL-2026; SIMFULL; SML-2026; SML-2027; SMLP-2026; UFL-2026 |
| Multi H2H | 10 | 7 | DM2,MMGA6,MSS,RZS,SIMFULL,SML,UFL | DM2-2027; MMGA6-2026; MMGA6-2027; MSS-2027; RZS-2026; SIMFULL; SML-2026; UFL-2026 |
| No-game default | 7 | 4 | MMGA6,RZS,SIMFULL,UFL | MMGA6-2026; MMGA6-2027; RZS-2026; SIMFULL; UFL-2026 |
| Lost-to-everyone | 8 | 5 | DM2,MSS,SFL,SML,UFL | DM2-2027; MSS-2027; SFL-2026; SML-2026; UFL-2026; UFL-2027 |
| Division reduction | 5 | 4 | DM2,RZS,SFL,UFL | DM2-2027; RZS-2026; RZS-2027; SFL-2026; UFL-2026 |
| Tiering | 3 | 3 | DM2,MMGA6,SML | DM2-2027; MMGA6-2027; SML-2026 |
| Cutoff | 3 | 3 | SFL,SIMFULL,UFL | SFL-2026; SIMFULL; UFL-2026 |
| Post-reduction two-team | 1 | 1 | SIMFULL | SIMFULL |
| Multi fallback | 0 | 0 |  |  |


### Additional context and late-step probes (outside the CV family)

The enumerated family shares one two-team list across contexts and holds the strength suffix fixed. These targeted probes assess those restrictions; they are **not** included in its reported family counts or CV selection. Thus even the exact family-equivalence counts understate the total implementation ambiguity.

| Probe | Local falsifications | Full-season fit | Partial fit | Falsifying observations |
|---|---|---|---|---|
| Division title COM before CONF, other two-team contexts CONF before COM | 0 | 34/34 | 3/3 | None |
| NFL division list for titles; NFL WC list outside titles | 13 | 23/34 | 2/3 | SIMFULL AFC wc BUF,LV,CLE; UFL-2026 AFC wc NYJ,CIN,CLE; SML-2026 AFC wc NE,HOU,LAC; SML-2026 NFC wc ATL,AZ,DET; SML-2027 NFC dw CHI,CAR; DM2-2027 NFC dw MIN,NYG,TB; SMLP-2026 NFC dw LAR,DET; SMLP-2026 NFC wc CHI,NYG; SFL-2026 AFC wc KC,BAL,BUF,DEN,PIT; ALS27-2026 AFC dw KC,TEN; ALS27-2026 AFC wc PIT,NYJ; MSS-2026 NFC wc CHI,LAR; MMGA6-2027 AFC dw IND,LAC |
| Replace SOV with NONE | 1 | 33/34 | 3/3 | MMGA6-2027 AFC wc HOU,LV,BUF,NYJ |
| Replace SOV with SOS | 1 | 33/34 | 3/3 | MMGA6-2027 AFC wc HOU,LV,BUF,NYJ |
| Replace SOV with NET | 0 | 34/34 | 3/3 | None |


| Additional component | Reached/eligible local decisions | Outcome discrimination |
|---|---|---|
| No-game default | 7 | 0 vs .5: one; 1 vs .5: one; exact .5 vs interior defaults: zero |
| Tier mode consulted at a multi partition | 13 | Three local constraints plus MSS AFC candidate coupling |
| Cutoff reranking | 19 cut constraints total: seven pairs with one slot; 12 multi ties (nine with two slots) | Three |
| Selected-division exception | One division pair in SFL-2026 AFC | One |
| Post-reduction two-team comparisons | Five local decisions | WC vs division list: one |


## What the discrimination actually establishes

Of the 52 oriented two-team decisions, **21** stop at H2H, **23** at DIV, **5** at COM and **3** at CONF; none reach SOV/SOS/NET. Only **five** DIV-versus-CONF conflicts survive an H2H tie (two division titles, two division-winner orders and one WC decision). The DIV-before-COM comparison has seven direct conflicts after an H2H tie. COM-before-CONF has exactly **one** direct witness, UFL-2026 NFC WAS/NYG; it is a division title, so applying that same order to cross-division two-team ties remains extrapolation. The data strongly reject a universal NFL wild-card list, but do not establish every suffix of a universal NFL division list. Keeping COM before CONF only for division titles and putting CONF before COM in other two-team contexts fits **34/34 and 3/3**. Using the official division/WC two-team split, while retaining all other M3 components, scores **23/34 and 2/3**; the universal-WC-list ablation’s 20/34 should not be mistaken for this correctly contextualized comparison.

Inverted multi-team H2H% is exercised in ten local decisions from seven leagues and differs from normal H2H% in all ten. All 17 full-season multi constraints are DW or WC (four DW, 13 WC); there are **no full-season multi-team division-title ties**. The partial division-title tie is reduced to two by the loser step, so applying inverted percentage to a 3+-team division title remains untested. But raw wins ascending fails only SIMFULL AFC DW; raw losses descending fails only MMGA6-2027 AFC WC. Those failures can be explained by handling of the unplayed team. Low net W−L fits every observation. Opponent-perspective H2H win% with reversed match results and a .5 empty record is algebraically 1−own-win%, so maximizing it is exactly equivalent to inversion on every possible dataset; no seeding observation can separate these descriptions.

Seven reached multi groups contain a team with no games within the group. Against .5, zero and one each have only one decisive full-season witness (SIMFULL and MMGA6-2027 respectively); those are generated schedules. At every baseline reached no-game comparison all played-team percentages are 0 or 1. Consequently **any default strictly between 0 and 1** induces the same partitions, not just .5. The discrete grid includes 0/.5/1, skipping the entire step, and deferring empty teams; it cannot identify the precise value .5. "Excluded" is defined here as placing nonparticipants below all participating tiers; skipping the step is separately tested. Other meanings of exclusion need their own explicit implementation.

A loser-elimination step is needed relative to the other fixed M3 components in UFL-2027 AFC, SML-2026 AFC and SFL-2026 AFC; the partial season supplies three additional correlated applications. But "lost at least once to each", "lost every meeting with each", and "eliminate strict sweep winners as well as strict losers" fit all current outputs. So does the **vacuous any-loss** version (an unplayed opponent counts as satisfied). The strict vacuous version fails DM2-2027 NFC; that failure cannot identify non-vacuity because strictness was changed too. The step removes a loser only when exactly one team meets the predicate, matching the reference code. Multiple losers are not all removed.

Reduction’s inverted H2H has four local witnesses against normal H2H spread across RZS, UFL and SFL. Reduction versus none has only DM2-2027 NFC and SFL-2026 AFC. CONF-before-COM within reduction depends exclusively on DM2-2027 NFC. The already-selected-division exception depends exclusively on SFL-2026 AFC and is not independently validated by the partial season. Moreover, vacuous any-loss elimination **without the exception** also fits 34/34 and 3/3: PIT has losses to BAL and DEN and unplayed KC/BUF; the vacuous predicate eliminates PIT before division reduction. BAL is then the only remaining North representative. Thus the special exception is not globally necessary and a missing played-opponent guard is a simpler competing explanation. The post-reduction preference for a WC list over a division list depends exclusively on SIMFULL NFC; the H2H/CONF/common ordering within that list is not identified.

Tiering has three stand-alone local falsifications from three leagues plus MSS-2027 AFC’s coupled constraint. Select-then-order has three full-season witnesses (SIMFULL, UFL and SFL). Timing of loser elimination before reduction has **no full-season discriminating observation**; it is separated only by the partial WC group. No actual 3+-team call reaches COM, CONF, DIV or any strength criterion after the multi H2H stage. Thus M3’s entire multi fallback ordering is untested. SOV is reached twice inside pairs produced by recursion. Skipping SOV or testing SOS there instead fails only MMGA6-2027 AFC; testing NET in SOV’s position fits 34/34 and 3/3. So that case proves a needed discriminator against those omissions, not that SOV itself is identified. SOS/NET at their own baseline positions are never reached. Later NFL combined-ranking/net-touchdown/coin steps are outside this fitted suffix and untested.

## Model family and fold selection

The supplied official NFL reference scores 19/34 in-sample and 2/3 on partial 2026. The original modelb.py Cartesian grid has 376,320 configurations: 2 universal two-team lists × 5 post-reduction lists × 4 reduction lists × 7 sweep predicates × 6 H2H variants × 4 reduction positions × 7 multi tails × 2 ranking modes × 2 cutoff modes × 2 post-after-multi settings. Its selected-division exception is off. This is the original grid evaluated on full seeds, not its old multi-only objective.

The extended factorial has 5,140,800 configurations: 5 two-team lists × 5 post lists × 6 reduction policies × 9 sweep policies × 17 H2H policies × 4 reduction positions × 7 tails × 2 ranking modes × 2 cutoff modes × 2 exception settings. This block fixes post-after-multi=false as in M3; the original block retains both settings. The blocks overlap in 188,160 configurations. The union is 5,328,960; the explicit official NFL reference adds one. This is a specified finite family, not every possible combination of all imaginable implementation defects. Large same-division subgroups retain the reference harness’s alphabetical fallback except for the precomputed-NFL-standing policy; no current M3 reduction witness relies on that fallback.

The dimensions, their exact ordered lists, and all model configurations are machine readable in audit.py, metadata.json and family_results.npz. Numeric model IDs are zero-based positions in models.bin; the NFL reference is the final extra row in family_results.npz. Aliases and behaviorally dead parameters remain separate configurations. Therefore fractions of optimal models use a **uniform prior over configurations**, not over distinct predictive algorithms; they are sensitivity measures, not posterior probabilities. Exact output classes and their sizes are also supplied.

Within each fold maximize the number of correct **whole conferences** in training. Then minimize a fixed unit-cost NFL-deviation score. Remaining ties use lexicographic numeric configuration order, with no held-out access. The score adds the following costs (indices follow audit.py); they explicitly encode ordinary rule edits rather than a data-fit complexity penalty:

| Axis | Costs by index |
|---|---|
| Two-team lists | [1,2,1,2,2] |
| Post lists | [0,1,1,2,1] |
| Reduction policies | [2,1,1,0,0,1] |
| Sweep policies | [1,1,1,2,0,0,1,1,2] |
| H2H policies | [1,3,3,2,2,1,3,3,3,3,3,3,3,3,3,2,2] |
| Multi tails | [2,1,2,2,1,2,1] |
| Reduction placement | +1 if non-first active reduction follows an active sweep or H2H; 0 for first or behaviorally absent reduction |
| Other switches | +1 each for tiers, select-then-order, post-after-multi; +1 for selected-division exception when it changes inverted reduction |
| Official NFL reference | 0 |


These costs count a reused two-team list as one defect, inversion plus secondary-order changes separately, substituting an unconditional multi percentage for a context-sensitive NFL step, and an empty-record convention separately. A normal/opponent percentage description is normalized to the same cost. Defect counts are judgment calls; the complete optimum sets expose conclusions that depend on the chosen tie break. Choosing a convenient maximizer after looking at its held-out result would defeat this protocol.

## Cross-validation results

| Evaluation | Folds | Chosen correct | Held targets | Entire folds correct | Mean optimal-model correct targets | Mean fraction of optima entirely right |
|---|---|---|---|---|---|---|
| Leave one season out | 17 | 32 | 34 | 15 | 30.8014/34 | 83.2394% |
| Leave one named league out | 9 | 30 | 32 | 7 | 29.8718/32 | 76.3536% |
| Partial 2026, not selected on | 1 | 2 | 3 | 0 | 2.3636/3 | 45.4545% |


The season and league aggregates overlap in observations and must not be pooled. In-sample training maxima below are separate from held-out accuracy. "All-right optima" is the count/fraction of **all training-maximal configurations**, before complexity tie breaking, that predict the entire held-out fold correctly. The optimal mean column is the mean correct conference/group count per optimum. [training_optimal_models.csv.gz](training_optimal_models.csv.gz) is the complete set for every fold: model ID, full configuration, distance, training/partial masks and a list of fold indices (the corresponding indices and chosen configurations are in [cv.json](cv.json)).

### Season folds

| Fold (index) | Training fit | Chosen model; distance | Held result | All-right optima | Mean correct; range | Failed held outputs |
|---|---|---|---|---|---|---|
| RZS-2026 (0) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| RZS-2027 (1) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| SIMFULL (2) | 32/32 | 379575; 11 | 2/2 | 693/2485 (27.887%) | 0.9296; 0–2 | None |
| UFL-2026 (3) | 32/32 | 379575; 11 | 2/2 | 693/1806 (38.372%) | 1.3837; 1–2 | None |
| UFL-2027 (4) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| SML-2026 (5) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| SML-2027 (6) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| DM2-2026 (7) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| DM2-2027 (8) | 32/32 | 409143; 10 | 1/2 | 693/1932 (35.870%) | 1.3587; 1–2 | DM2-2027 NFC |
| SMLP-2026 (9) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| SMLP-2027 (10) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| SFL-2026 (11) | 32/32 | 1582; 10 | 1/2 | 693/1309 (52.941%) | 1.5294; 1–2 | SFL-2026 AFC |
| ALS27-2026 (12) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| MSS-2026 (13) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| MSS-2027 (14) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| MMGA6-2026 (15) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| MMGA6-2027 (16) | 32/32 | 379575; 11 | 2/2 | 693/1155 (60.000%) | 1.6000; 1–2 | None |


### Nine named-league folds

| Fold (index) | Training fit | Chosen model; distance | Held result | All-right optima | Mean correct; range | Failed held outputs |
|---|---|---|---|---|---|---|
| ALS27 (17) | 32/32 | 379575; 11 | 2/2 | 693/693 (100.000%) | 2.0000; 2–2 | None |
| DM2 (18) | 30/30 | 409143; 10 | 3/4 | 693/1932 (35.870%) | 3.3587; 3–4 | DM2-2027 NFC |
| MMGA6 (19) | 30/30 | 379575; 11 | 4/4 | 693/1155 (60.000%) | 3.6000; 3–4 | None |
| MSS (20) | 30/30 | 379575; 11 | 4/4 | 693/693 (100.000%) | 4.0000; 4–4 | None |
| RZS (21) | 30/30 | 379575; 11 | 4/4 | 693/693 (100.000%) | 4.0000; 4–4 | None |
| SFL (22) | 32/32 | 1582; 10 | 1/2 | 693/1309 (52.941%) | 1.5294; 1–2 | SFL-2026 AFC |
| SML (24) | 30/30 | 379575; 11 | 4/4 | 693/693 (100.000%) | 4.0000; 4–4 | None |
| SMLP (25) | 30/30 | 379575; 11 | 4/4 | 693/693 (100.000%) | 4.0000; 4–4 | None |
| UFL (26) | 30/30 | 379575; 11 | 4/4 | 693/1806 (38.372%) | 3.3837; 3–4 | None |


### Additional SIMFULL league exclusion and partial 2026

| Fold (index) | Training fit | Chosen model; distance | Held result | All-right optima | Mean correct; range | Failed held outputs |
|---|---|---|---|---|---|---|
| SIMFULL (23) | 32/32 | 379575; 11 | 2/2 | 693/2485 (27.887%) | 0.9296; 0–2 | None |
| SIM26 (27) | 34/34 | 379575; 11 | 2/3 | 315/693 (45.455%) | 2.3636; 1–3 | WC 6-7 |


### Fold exercise of contested components

Counts below are the number of local constraints in that fold falsifying at least one named alternative in that component. Zero/absence means this fold supplies no outcome discrimination for that component; reach alone is recorded separately in the audit tables. Candidate coupling can add a conference-level distinction beyond these local counts.

| Fold | Discriminating contested components |
|---|---|
| season RZS-2026 | Multi H2H:2; No-game default:2; Division reduction:1 |
| season RZS-2027 | Division reduction:1 |
| season SIMFULL | Two-team list:1; Multi H2H:2; No-game default:2; Cutoff:1; Post-reduction two-team:1 |
| season UFL-2026 | Two-team list:3; Multi H2H:1; No-game default:1; Lost-to-everyone:1; Division reduction:1; Cutoff:1 |
| season UFL-2027 | Lost-to-everyone:1 |
| season SML-2026 | Two-team list:2; Multi H2H:1; Lost-to-everyone:2; Tiering:1 |
| season SML-2027 | Two-team list:2 |
| season DM2-2026 | None |
| season DM2-2027 | Two-team list:1; Multi H2H:1; Lost-to-everyone:2; Division reduction:1; Tiering:1 |
| season SMLP-2026 | Two-team list:2 |
| season SMLP-2027 | None |
| season SFL-2026 | Two-team list:1; Lost-to-everyone:1; Division reduction:1; Cutoff:1 |
| season ALS27-2026 | Two-team list:2 |
| season MSS-2026 | Two-team list:1 |
| season MSS-2027 | Multi H2H:1; Lost-to-everyone:1 |
| season MMGA6-2026 | Two-team list:2; Multi H2H:1; No-game default:1 |
| season MMGA6-2027 | Two-team list:1; Multi H2H:1; No-game default:1; Tiering:1 |
| league ALS27 | Two-team list:2 |
| league DM2 | Two-team list:1; Multi H2H:1; Lost-to-everyone:2; Division reduction:1; Tiering:1 |
| league MMGA6 | Two-team list:3; Multi H2H:2; No-game default:2; Tiering:1 |
| league MSS | Two-team list:1; Multi H2H:1; Lost-to-everyone:1 |
| league RZS | Multi H2H:2; No-game default:2; Division reduction:2 |
| league SFL | Two-team list:1; Lost-to-everyone:1; Division reduction:1; Cutoff:1 |
| league_extra SIMFULL | Two-team list:1; Multi H2H:2; No-game default:2; Cutoff:1; Post-reduction two-team:1 |
| league SML | Two-team list:4; Multi H2H:1; Lost-to-everyone:2; Tiering:1 |
| league SMLP | Two-team list:2 |
| league UFL | Two-team list:3; Multi H2H:1; No-game default:1; Lost-to-everyone:2; Division reduction:1; Cutoff:1 |
| SIM26 | Two-team DIV and COM; loser elimination; reduction timing. No inverted-% or no-game exposure. |


The selected full-data model uses reduction **before** the sweep-loser step because this costs fewer NFL deviations. Its partial-season miss is the WC group: it selects PHI/CHI instead of DET/PHI. M3’s after-loser reduction gets that group right but is not justified by full-season training data alone. All 693 full-training-optimal partial predictions avoid SOV/SOS and incomplete-opponent metrics (verified in verify.py). All partial baseline decisions and the selected model stop at H2H/DIV/COM among teams with complete 17-game schedules; they do not depend on incomplete opponent season records. For arbitrary poor models in the broad family, SOV/SOS may depend on incomplete schedules, so partial results are interpreted only for the training-optimal models.

## Observational equivalence

The enumerated family yields **34375 exact output signatures** across all 34 conferences plus three partial groups (excluding the separate NFL reference). C++ checks the exact output bytes whenever a hash repeats and verifies no collisions; these are not merely equal correct/incorrect vectors. [equivalence_classes.csv.gz](equivalence_classes.csv.gz), [equivalence_members.npz](equivalence_members.npz), and exact_signatures.bin enumerate every class, representative and model membership.

Among the **693** models fitting all full seasons, there are **3** different predictions once the partial groups are included. **315** models form the class matching every current observation. The exact sets of parameter values for the full fit are:

| Dimension | Full-season perfect-fit values | Also partial-perfect values |
|---|---|---|
| two | [0] | [0] |
| post | [0, 1, 4] | [0, 1, 4] |
| reduction | [0] | [0] |
| sweep | [1, 2, 3, 6, 7, 8] | [1, 2, 7, 8] |
| h2h | [1, 10, 11] | [1, 10, 11] |
| position | [0, 1] | [1] |
| tail | [0, 1, 2, 3, 4, 5, 6] | [0, 1, 2, 3, 4, 5, 6] |
| tiered | [1] | [1] |
| select_order | [1] | [1] |
| post_after_multi | [0] | [0] |
| exception | [0, 1] | [0, 1] |


The value sets alone are not a Cartesian product: reduction position and sweep predicate interact. With exception=1, full fit requires position=1 with sweep in {1,2,7,8}, or position=0 with sweep in {1,2,3,6,7,8}. One additional combination, sweep=8 / position=1 / exception=0, also fits everything. This gives 11 joint structural choices times 3 post lists times 3 H2H metrics times 7 tails = 693 full-season perfect models. Partial perfection retains five joint structural choices (the four after-loser cases with exception=1, plus vacuous-any after-loser without exception), giving 315 models. Other displayed free factors combine independently. Parameter spellings: post=0 WC min-four common; post=1 WC no minimum; post=4 COM then CONF and no H2H. sweep=1 any-loss loser, 2 strict loser, 3 strict vacuous loser, 6 eliminate any-loss/any-win sweeps, 7 eliminate strict sweep winners or losers, 8 vacuous any-loss loser. h2h=1 inverted percentage with .5 default, 10 low net W−L, 11 opponent-perspective percentage. position=0 first, 1 after loser step. tail=0..6 are all seven orders.

| Perfect-fit output class | Members | Partial group predictions | Partial mask |
|---|---|---|---|
| 7173784319863986318 | 315 | [['GB'], ['ATL', 'LAR', 'GB'], ['DET', 'PHI']] | 7 |
| 8054407918422865875 | 63 | [['CHI'], ['ATL', 'LAR', 'GB'], ['PHI', 'CHI']] | 2 |
| 16559117719264243889 | 315 | [['GB'], ['ATL', 'LAR', 'GB'], ['PHI', 'CHI']] | 3 |


The mechanisms separating these equivalent descriptions are: unequal H2H game counts with net and percentage disagreeing; a transitive full three-team sweep with both a universal winner and universal loser; split same-division series producing an any-loss but not strict loser; unplayed opponents plus exactly one vacuous loser; conflicting common/conf records after reduction; a post-reduction pair with a direct H2H conflicting with COM/CONF; and a multi group with equal H2H percentage that must actually reach the fallback. The scenario table gives concrete small constraints. Opponent-perspective inversion has no separating scenario because it is an algebraic identity. A .5 no-game constant is also not distinguished from any other interior (0,1) constant on current paths, although these constants can be separated by future fractional H2H records.

## Minimal future falsification targets

Each row specifies a tied group in a future season. Unlisted H2H pairs are unplayed. All teams finish 10-7 unless noted. DIV/CONF/common records are constraints on completing the other games, not a fabricated full-season schedule. Cross-division common percentages can use four games; same-division .5/.75 common records can use 12 games. Common and later fields not needed by a row may be ignored. In every row, observing an order/selection different from the listed M3 prediction falsifies that M3 rule **conditional on earlier steps and this context**. Later outputs should be observed, not inferred from merely being eliminated. Full constraints and executable predicted alternatives are in [scenarios.md](scenarios.md) and scenarios.json.

| Rule | Context | Tied H2H | Record constraints (all overall 10-7) | M3 observable result | Separating alternative result |
|---|---|---|---|---|---|
| Normal two-team H2H | dw | A>B x1 | DIV {'A': 0.5, 'B': 1}; CONF {'A': 0.5, 'B': 0.5}; COM {'A': 0.5, 'B': 0.5} | A,B | Any other observed output |
| Two-team DIV before COM/CONF | dw | None | DIV {'A': 0.8333333333333334, 'B': 0.6666666666666666}; CONF {'A': 0.5, 'B': 0.6666666666666666}; COM {'A': 0.5, 'B': 0.75} | A,B | NFL WC:B,A; CONF before DIV:B,A |
| Two-team COM before CONF | div | A>B x1; B>A x1 | DIV {'A': 0.5, 'B': 0.5}; CONF {'A': 0.5, 'B': 0.6666666666666666}; COM {'A': 0.75, 'B': 0.5} | A,B | CONF before COM:B,A |
| Two-team CONF after COM | dw | None | DIV {'A': 0.5, 'B': 0.5}; CONF {'A': 0.6666666666666666, 'B': 0.5833333333333334}; COM {'A': 0.5, 'B': 0.5} | A,B | Any other observed output |
| Lost-to-everyone and strict-any-sweep elimination | div | A>B x2; A>C x2; B>C x2 | DIV {'A': 0.6666666666666666, 'B': 0.5, 'C': 0.3333333333333333}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5} | A,B,C | No lost step:C,B,A; Strict any sweep:B,A,C |
| Lost at least once versus lost all meetings | div | A>B x1; B>A x1; B>C x2; C>A x2 | DIV {'A': 0.5, 'B': 0.5, 'C': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5} | B,C,A | Strict loser:A,C,B |
| Inverted win percentage | dw | A>B x1 | DIV {'A': 0.5, 'B': 0.5, 'C': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5} | B,C,A | Normal percentage:A,C,B |
| Inverted H2H in an untested three-team division title | div | A>B x2; A>C x2; B>C x1; C>B x1 | DIV {'A': 0.6666666666666666, 'B': 0.3333333333333333, 'C': 0.3333333333333333}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5}; COM {'A': 0.5833333333333334, 'B': 0.6666666666666666, 'C': 0.5833333333333334} | B,C,A | Normal percentage:A,B,C |
| No-game default | dw | A>B x1 | DIV {'A': 0.8333333333333334, 'B': 0.16666666666666666, 'C': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5} | B,C,A | Default zero:C,B,A; Default one:B,A,C; Exclude nonparticipants:B,A,C; Skip metric:A,C,B |
| Net W-L | dw | A>B x1; A>C x1; D>A x1 | DIV {'A': 0.5, 'B': 0.8333333333333334, 'C': 0.6666666666666666, 'D': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5, 'D': 0.5}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5, 'D': 0.5} | B,C,A,D | Named alternative:B,C,D,A |
| Tiered ranking | dw | A>B x1 | DIV {'A': 0.8333333333333334, 'B': 0.3333333333333333, 'C': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5} | B,C,A | Named alternative:B,A,C |
| Select then order | wc 2 slots | A>C x1 | DIV {'A': 0.6666666666666666, 'B': 0.8333333333333334, 'C': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5} | B,C | Named alternative:C,B |
| Vacuous losses | dw | A>B x1; B>C x1 | DIV {'A': 0.5, 'B': 0.5, 'C': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5} | C,B,A | Named alternative:A,B,C |
| Inverted same-division reduction | wc | A>B x2 | DIV {'A': 0.5, 'B': 0.5, 'C': 0.5}; CONF {'A': 0.75, 'B': 0.5, 'C': 0.6666666666666666}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5} | C,B,A | Normal reduction:A,C,B; No reduction:B,C,A |
| Selected-division normal-H2H exception | wc; earlier WC same division | A>B x2 | DIV {'A': 0.5, 'B': 0.5, 'C': 0.5}; CONF {'A': 0.75, 'B': 0.5, 'C': 0.6666666666666666}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5} | A,C,B | No exception:C,B,A |
| Post-reduction WC two-team list | wc | A>B x2 | DIV {'A': 0.5, 'B': 0.8333333333333334, 'C': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.6666666666666666}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5} | C,B,A | Division post list:B,C,A |
| Multi COM before CONF before DIV | dw | None | DIV {'A': 0.16666666666666666, 'B': 0.5, 'C': 0.8333333333333334}; CONF {'A': 0.5, 'B': 0.6666666666666666, 'C': 0.5833333333333334}; COM {'A': 0.75, 'B': 0.5, 'C': 0.25} | A,B,C | CONF first:B,C,A |
| Multi CONF before DIV | dw | None | DIV {'A': 0.16666666666666666, 'B': 0.8333333333333334, 'C': 0.5}; CONF {'A': 0.6666666666666666, 'B': 0.5, 'C': 0.5833333333333334}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5} | A,C,B | DIV first:B,C,A |
| Reduction CONF before COM after tied H2H/DIV | wc | A>B x1; B>A x1 | DIV {'A': 0.5, 'B': 0.5, 'C': 0.5}; CONF {'A': 0.6666666666666666, 'B': 0.5833333333333334, 'C': 0.5}; COM {'A': 0.5, 'B': 0.75, 'C': 0.5} | A,C,B | COM before CONF:B,C,A |
| Post-reduction H2H before COM/CONF | wc | A>B x2; B>C x1 | DIV {'A': 0.5, 'B': 0.5, 'C': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.6666666666666666}; COM {'A': 0.5, 'B': 0.5, 'C': 0.75} | B,C,A | COM then CONF; no H2H:C,B,A |
| Late SOV (earlier criteria all tied) | dw | None | DIV {'A': 0.5, 'B': 0.5, 'C': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5}; {'SOV': {'A': 0.6, 'B': 0.5, 'C': 0.4}, 'SOS': {'A': 0.5, 'B': 0.5, 'C': 0.5}, 'NET': {'A': 0, 'B': 0, 'C': 0}} | A,B,C | Any other observed output |
| Late SOS (earlier criteria all tied) | dw | None | DIV {'A': 0.5, 'B': 0.5, 'C': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5}; {'SOV': {'A': 0.5, 'B': 0.5, 'C': 0.5}, 'SOS': {'A': 0.6228373702422145, 'B': 0.5882352941176471, 'C': 0.5536332179930796}, 'NET': {'A': 0, 'B': 0, 'C': 0}} | A,B,C | Any other observed output |
| Late NET (earlier criteria all tied) | dw | None | DIV {'A': 0.5, 'B': 0.5, 'C': 0.5}; CONF {'A': 0.5, 'B': 0.5, 'C': 0.5}; COM {'A': 0.5, 'B': 0.5, 'C': 0.5}; {'SOV': {'A': 0.5, 'B': 0.5, 'C': 0.5}, 'SOS': {'A': 0.5, 'B': 0.5, 'C': 0.5}, 'NET': {'A': 30, 'B': 20, 'C': 10}} | A,B,C | Any other observed output |


Timing has a particularly direct target: DET, PHI, CHI all 10-7; DET sweeps CHI 2-0, PHI beats CHI 1-0, DET–PHI unplayed. With two WC spots, DIV records DET 5-1 and PHI 2-4, M3 eliminates CHI first and selects DET,PHI. Reducing the DET/CHI division first with inverted H2H instead selects PHI,CHI. A new independent repeat would test the currently partial-only timing result.

The best next simulations prioritize: (1) an independent SFL-shaped selected-division switch; (2) a DM2-shaped reduction pair with H2H and DIV tied but CONF opposing COM; (3) a three-team chain A beats B, B beats C, A–C unplayed, which distinguishes vacuous elimination; (4) the four-team net-versus-percentage fixture; (5) an all-.5/no-games multi tie with conflicting COM/CONF/DIV so the untested suffix is finally reached. Repeating normal-vs-inverted extreme H2H groups adds less information.

## Reproduction and artifacts

Run `bash rerun.sh` from this directory (Python 3 with NumPy; g++ C++17). It exports read-only source data, builds and evaluates the complete family, checks independent Python/C++ parity on 101 configurations and a sample against the original MB harness, writes every training-optimal set and exact equivalence class, then prints and builds this report. The search prints progress every 100,000 models. No writes to the repository or sibling output directories are required.

Source checksums (SHA-256) fix the observed inputs:

- `dataset.json`: `51814d21818102dd8a2ceb8161fa4434b43eba2cb71029356a38b230f5e710a9`

- `sim.py`: `f73758ad7b447d56201778dd5b3b2d04cb2dc96f7b49fa9496116aa6f9636fe6`

- `modelb.py`: `55ef7149e58b507633cf03323a554d3d46a5af6c70cfe7a779b91a3cb936ad23`

- `divwc.py`: `77a88f6c7a3e9317d52035312a744602b9d2f8e4eae3a5e701108b2e94db2298`

- `ablate.py`: `eb28b9e5931ebe85f7d7db167c4711c3ac4b28ad9f0b07b9a5718629d0ae9a0c`

- `decisions.py`: `2a322579e83faff2fc890fd9231bcb98d52fe7f7d80a5396e36e986381eaffb9`

- `multi.py`: `a57efd06a8ab00f7c345f13b7610f055a409bfa57428dad024e19ef19f9f6d94`

- `heldout26.py`: `6fb8497e4ef98f1905a1d1f18e4ffeeb92ca15bc5c7b6627ff1f9cd105460c24`


The complete family’s correctness masks, configurations, held-out partial masks, signatures and complexity scores are in family_results.npz. baseline_trace.json distinguishes reaches from separating calls. validation.txt and progress_final.log record parity and collision checks. No confidence interval based on 34 independent observations is appropriate: conferences share seasons, league schedules recur, and the family was designed after seeing these data.
