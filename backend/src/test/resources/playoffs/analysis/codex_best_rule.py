from evalb import MB, make, full, LEAGUES, TWO, MULTI, check, check2, seeds, collections, EPS


class Candidate(MB):
    def reduce(self, lg, group):
        divisions = collections.defaultdict(list)
        for team in group:
            divisions[lg.T[team]['div']].append(team)
        keep = []
        for div, teams in divisions.items():
            if len(teams) == 1:
                keep.extend(teams)
                continue
            above = sum(lg.pct[t] > lg.pct[teams[0]] + EPS
                        for t in lg.T if lg.T[t]['div'] == div and t not in teams)
            steps = list(self.RL)
            if above >= 2:
                steps[0] = 'H2H'
            if len(teams) == 2:
                keep.append(self.two(lg, teams[0], teams[1], steps))
            else:
                keep.append(sorted(teams)[0])
        return [t for t in group if t in keep]


def candidate(**kwargs):
    base = make(LM=['SWEEPLS', 'PCTINV_HALF', 'COM', 'CONF', 'DIV', 'SOV', 'SOS', 'NET'], **kwargs)
    return Candidate(**base.__dict__)


if __name__ == '__main__':
    m = candidate()
    print('Conferences:', full(m), '/', 2 * len(LEAGUES))
    print('Two-team decisions:', sum(check2(m, d) for d in TWO), '/', len(TWO))
    print('Multi-team decisions:', sum(check(m, d) for d in MULTI), '/', len(MULTI))
    for lg in LEAGUES:
        for conf in ['AFC', 'NFC']:
            actual = seeds(m, lg, conf)
            print(lg.id, conf, actual, actual in lg.seeds[conf])
