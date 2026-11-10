// 균형 측정: 실수도 하고 거절도 하는 "사람 같은" 자동 플레이로 여러 판을 돌려 나라별 유불리를 봅니다.
// 사용법: npx tsx scripts/balance.ts [판 수]
import { COUNTRY_IDS, EXTRA_CARD_COST, POLICIES, VITALS, policyCost } from '../shared/data';
import { aliveIds, commands, joinRoom, newRoom } from '../shared/engine';
import { GameError, type CountryId, type Room, type Vital } from '../shared/types';

const GAMES = Number(process.argv[2] ?? 600);
// 재현 가능한 난수
let seed = 20501111;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const chance = (p: number) => rnd() < p;
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

function play(skill: number): Room {
  let now = 1;
  const r = newRoom('BAL', 'b', 300, {} as Record<CountryId, string>, now);
  for (const id of COUNTRY_IDS) joinRoom(r, id, id, id, now);
  const T = () => ({ now, teacher: true });
  const D = (id: CountryId) => ({ now, pid: id, country: id });
  const tryCmd = (name: string, id: CountryId, args: Record<string, unknown> = {}) => { try { commands[name](r, D(id), args); return true; } catch (e) { if (!(e instanceof GameError)) throw e; return false; } };
  commands.start(r, T(), {});
  for (let rd = 1; rd <= 5; rd++) {
    // ① 거래: 모자란 자원마다 확률적으로 시도하고, 파는 쪽도 확률적으로 수락 (값은 1~2배 사이)
    for (let pass = 0; pass < 2; pass++) for (const id of shuffle(aliveIds(r))) {
      const c = r.countries[id];
      for (const k of VITALS) {
        let lack = c.need[k] - c.stock[k];
        if (lack <= 0 || !chance(skill)) continue;
        for (const s of shuffle(aliveIds(r).filter((x) => x !== id))) {
          const spare = r.countries[s].stock[k] - r.countries[s].need[k];
          if (spare <= 0 || lack <= 0) continue;
          if (!chance(0.5 + skill * 0.4)) continue; // 상대가 거절하거나 시간이 모자람
          const amt = Math.min(lack, spare);
          const price = Math.min(c.stock.eco, Math.round(amt * (1 + rnd())));
          if (price < Math.ceil(amt / 2)) continue; // 값을 못 맞추면 불발
          if (tryCmd('propose', id, { to: s, give: price > 0 ? { eco: price } : {}, take: { [k]: amt } }) && tryCmd('respond', s, { id: r.proposals.at(-1)!.id, action: 'accept' })) lack -= amt;
        }
      }
    }
    // ② 정책 카드
    for (const id of aliveIds(r)) {
      const c = r.countries[id];
      const pickCard = (): { id: string; pick?: Vital } | null => {
        const short = VITALS.find((k) => c.stock[k] < c.need[k]);
        const weak = VITALS.find((k) => c.prod[k] < c.need[k] && !c.invested.includes(k));
        if (short && chance(0.5 + skill * 0.4)) return { id: 'emergency', pick: short };
        if (weak && rd <= 3 && chance(0.5)) return { id: 'invest', pick: weak };
        return chance(0.8) ? { id: 'green' } : null;
      };
      const first = pickCard();
      if (first) tryCmd('policy', id, first);
      // 돈이 넉넉하고 아직 모자라면 추가 카드
      const still = VITALS.find((k) => c.stock[k] < c.need[k]);
      const cost = policyCost(id, POLICIES.find((p) => p.id === 'emergency')!) + EXTRA_CARD_COST;
      if (c.policy && still && c.stock.eco >= cost && chance(skill)) tryCmd('policy', id, { id: 'emergency', pick: still });
      else if (c.policy && c.stock.eco >= 40 && chance(0.4)) tryCmd('policy', id, { id: 'green' });
    }
    // ③ 사건 카드
    if (r.project) for (const id of aliveIds(r)) if (chance(0.55)) tryCmd('joinProject', id);
    if (r.dispute) { for (const id of r.dispute.parties) tryCmd('stance', id, { stance: chance(0.7) ? (chance(0.5) ? 'negotiate' : 'mediate') : 'unilateral' }); for (const id of aliveIds(r)) if (chance(0.5)) tryCmd('mediate', id); }
    if (r.treaty) for (const id of aliveIds(r)) for (const cl of ['climate', 'coop', 'peace', 'support', 'sdg']) tryCmd('treatyVote', id, { clause: cl, yes: chance(0.7) });
    // 국제 구호단
    for (const id of COUNTRY_IDS) if (r.countries[id].diedRound !== null) {
      const needy = shuffle(aliveIds(r)).map((x) => ({ x, k: VITALS.find((k) => r.countries[x].stock[k] < r.countries[x].need[k]) })).find((v) => v.k);
      if (needy) tryCmd('relief', id, { to: needy.x, res: needy.k });
    }
    now += 10; commands.endRound(r, T(), {});
    if (rd < 5) commands.nextRound(r, T(), {});
  }
  return r;
}

for (const [label, skill] of [['서툰 학급 (거래 성공률 낮음)', 0.45], ['보통 학급', 0.65], ['능숙한 학급', 0.85]] as const) {
  const stat = Object.fromEntries(COUNTRY_IDS.map((id) => [id, { alive: 0, rank: 0, win: 0, r1: 0, lives: 0, eco: 0 }]));
  let survivors = 0;
  for (let g = 0; g < GAMES; g++) {
    const r = play(skill);
    survivors += r.results!.world.survivors;
    for (const id of COUNTRY_IDS) {
      const c = r.countries[id], s = stat[id];
      s.alive += c.diedRound === null ? 1 : 0; s.rank += r.results!.countries[id].rank; s.win += r.results!.ranking[0] === id ? 1 : 0;
      s.r1 += (c.shortages[1]?.length ?? 0) > 0 ? 1 : 0; s.lives += c.lives; s.eco += c.stock.eco;
    }
  }
  console.log(`\n[${label}] ${GAMES}판 · 평균 생존 ${(survivors / GAMES).toFixed(1)}/6`);
  console.log('  나라   생존율  1위율  평균순위  남은목숨  남은돈  1R에 목숨 잃음');
  for (const id of COUNTRY_IDS) {
    const s = stat[id]; const p = (v: number) => `${Math.round((v / GAMES) * 100)}%`.padStart(5);
    console.log(`  ${id}   ${p(s.alive)}  ${p(s.win)}   ${(s.rank / GAMES).toFixed(2)}     ${(s.lives / GAMES).toFixed(2)}    ${String(Math.round(s.eco / GAMES)).padStart(3)}    ${p(s.r1)}`);
  }
}
