// 게임 엔진 규칙 테스트: npm test
import assert from 'node:assert/strict';
import { COUNTRY_IDS, RES } from '../shared/data';
import { aliveIds, calcPeace, commands, joinRoom, newRoom, publicView, ranking, tick } from '../shared/engine';
import { diagnose } from '../shared/lessons';
import { GameError, type CountryId, type Room } from '../shared/types';

let now = 1_000_000;
const T = { now: 0, teacher: true };
const codes = Object.fromEntries(COUNTRY_IDS.map((id) => [id, id])) as Record<CountryId, string>;
function mk(): Room {
  const r = newRoom('TEST1', '테스트', 600, codes, now);
  for (const id of COUNTRY_IDS) { joinRoom(r, id, `d-${id}`, `${id}대표`, now); joinRoom(r, id, `m-${id}`, `${id}단원`, now); }
  return r;
}
const run = (r: Room, name: string, who: CountryId | 'T', args: Record<string, unknown> = {}, member = false) =>
  commands[name](r, who === 'T' ? { ...T, now } : { now, pid: `${member ? 'm' : 'd'}-${who}`, country: who }, args);
const fails = (fn: () => void, re?: RegExp) => assert.throws(fn, (e: unknown) => e instanceof GameError && (!re || re.test(e.message)));
const total = (r: Room, k: (typeof RES)[number]) => COUNTRY_IDS.reduce((s, id) => s + r.countries[id].stock[k], 0);
const noNeg = (r: Room) => { for (const id of COUNTRY_IDS) { const c = r.countries[id]; for (const k of RES) assert.ok(c.stock[k] >= 0, `${id}.${k} 음수`); for (const k of ['env', 'trust'] as const) assert.ok(c[k] >= 0 && c[k] <= 100); assert.ok(c.lives >= 0 && c.lives <= 2); } };
let n = 0;
const test = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

console.log('엔진 규칙 테스트');
test('로비에서는 학생 행동 불가, 학생은 교사 명령 불가', () => {
  const r = mk();
  fails(() => run(r, 'policy', 'ARC', { id: 'green' }), /행동할 수 없습니다/);
  fails(() => run(r, 'start', 'ARC'), /교사 권한/);
  fails(() => run(r, 'adjust', 'ARC', { country: 'ARC', key: 'eco', delta: 99 }), /교사 권한/);
});
test('대표가 아닌 학생은 정책·거래 불가', () => {
  const r = mk(); run(r, 'start', 'T');
  fails(() => run(r, 'policy', 'ARC', { id: 'green' }, true), /대표만/);
  fails(() => run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: 1 } }, true), /대표만/);
  r.players['d-ARC'].online = true;
  fails(() => run(r, 'claimDelegate', 'ARC', {}, true), /접속 중/);
  r.players['d-ARC'].online = false;
  run(r, 'claimDelegate', 'ARC', {}, true); assert.equal(r.countries.ARC.delegate, 'm-ARC');
});
test('정책 카드: 라운드마다 1장, 비용 차감, 돈 부족 시 불가', () => {
  const r = mk(); run(r, 'start', 'T');
  const c = r.countries.IND; const eco = c.stock.eco, env = c.env, prod = c.prod.energy;
  fails(() => run(r, 'policy', 'IND', { id: 'invest' }), /자원을 고르세요/);
  assert.equal(c.stock.eco, eco);
  run(r, 'policy', 'IND', { id: 'invest', pick: 'energy' });
  assert.equal(c.stock.eco, eco - 8); assert.equal(c.prod.energy, prod + 4); assert.equal(c.env, env - 3);
  fails(() => run(r, 'policy', 'IND', { id: 'green' }), /이미 골랐습니다/);
  const nov = r.countries.NOV; nov.stock.eco = 3;
  fails(() => run(r, 'policy', 'NOV', { id: 'green' }), /돈이 부족/);
  fails(() => run(r, 'policy', 'NOV', { id: 'welfare' }), /알 수 없는/);
  assert.equal(nov.stock.eco, 3); assert.equal(nov.policy, null);
  now += 1000; run(r, 'endRound', 'T'); run(r, 'nextRound', 'T');
  fails(() => run(r, 'policy', 'IND', { id: 'invest', pick: 'energy' }), /자원마다 한 번/); // 같은 자원에는 다시 못 씀
  run(r, 'policy', 'IND', { id: 'invest', pick: 'water' }); // 다른 자원은 가능
});
test('공동 대응: 참여 1회, 필요한 나라 수를 채워야 성공', () => {
  const r = mk(); run(r, 'start', 'T');
  const w = r.countries.ARC.prod.water;
  for (const id of ['ARC', 'SOL', 'GRN'] as CountryId[]) run(r, 'joinProject', id);
  fails(() => run(r, 'joinProject', 'ARC'), /이미 참여/);
  now += 1000; run(r, 'endRound', 'T');
  assert.equal(r.projectResults.water.success, false); assert.equal(r.countries.ARC.prod.water, w);
  run(r, 'nextRound', 'T');
  for (const id of ['ARC', 'SOL', 'GRN', 'IND'] as CountryId[]) run(r, 'joinProject', id);
  const e = r.countries.NOV.prod.energy;
  now += 1000; run(r, 'endRound', 'T');
  assert.equal(r.projectResults.energy.success, true); assert.equal(r.countries.NOV.prod.energy, e + 1);
});
test('거래: 상호 승인, 원자적 처리, 중복 승인 방지, 자원 보존', () => {
  const r = mk(); run(r, 'start', 'T');
  const before = RES.map((k) => total(r, k));
  run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: 10 }, take: { energy: 8 } });
  const p = r.proposals[0];
  fails(() => run(r, 'respond', 'GRN', { id: p.id, action: 'accept' }), /제안받은 국가만/);
  fails(() => run(r, 'respond', 'ARC', { id: p.id, action: 'accept' }), /제안받은 국가만/);
  const a0 = { ...r.countries.ARC.stock }, s0 = { ...r.countries.SOL.stock };
  run(r, 'respond', 'SOL', { id: p.id, action: 'accept' });
  assert.equal(r.countries.ARC.stock.energy, a0.energy + 8); assert.equal(r.countries.ARC.stock.eco, a0.eco - 10);
  assert.equal(r.countries.SOL.stock.eco, s0.eco + 10); assert.equal(r.countries.SOL.stock.energy, s0.energy - 8);
  fails(() => run(r, 'respond', 'SOL', { id: p.id, action: 'accept' }), /이미 처리/);
  assert.deepEqual(RES.map((k) => total(r, k)), before);
  run(r, 'propose', 'NOV', { to: 'OCE', give: { eco: 5 }, take: { water: 500 } });
  const q = r.proposals[1]; const snap = JSON.stringify(r.countries);
  fails(() => run(r, 'respond', 'OCE', { id: q.id, action: 'accept' }), /자원이 부족/);
  assert.equal(JSON.stringify(r.countries), snap); assert.equal(q.status, 'pending');
  fails(() => run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: -5 } })); fails(() => run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: 1.5 } }));
  fails(() => run(r, 'propose', 'ARC', { to: 'ARC', give: { eco: 1 } })); fails(() => run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: 9999 } }));
});
test('인도적 지원: 부족한 나라를 도울 때만 신뢰도 상승', () => {
  const r = mk(); run(r, 'start', 'T');
  r.countries.SOL.stock.water = 2;
  const t0 = r.countries.OCE.trust;
  run(r, 'propose', 'OCE', { to: 'SOL', give: { water: 6 } }); run(r, 'respond', 'SOL', { id: r.proposals[0].id, action: 'accept' });
  assert.equal(r.countries.OCE.trust, t0 + 2);
  for (let i = 0; i < 4; i++) { run(r, 'propose', 'ARC', { to: 'GRN', give: { food: 1 } }); run(r, 'respond', 'GRN', { id: r.proposals.at(-1)!.id, action: 'accept' }); }
  assert.equal(r.countries.ARC.trust, 55);
});
test('라운드 종료 후 제출 불가, 시간 만료 자동 종료, 일시정지', () => {
  const r = mk(); run(r, 'start', 'T');
  run(r, 'pause', 'T'); fails(() => run(r, 'policy', 'ARC', { id: 'green' }), /일시정지/);
  now += 60_000; run(r, 'resume', 'T');
  assert.equal(r.endsAt, now + 600_000);
  run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: 1 }, take: { energy: 1 } });
  now = r.endsAt!;
  fails(() => run(r, 'policy', 'ARC', { id: 'green' }), /시간이 종료/);
  fails(() => run(r, 'respond', 'SOL', { id: r.proposals[0].id, action: 'accept' }), /시간이 종료/);
  assert.equal(tick(r, now), true); assert.equal(r.phase, 'roundEnd'); assert.equal(r.proposals[0].status, 'expired');
  fails(() => run(r, 'policy', 'ARC', { id: 'green' })); fails(() => run(r, 'endRound', 'T'));
  run(r, 'nextRound', 'T'); assert.equal(r.round, 2);
  fails(() => run(r, 'respond', 'SOL', { id: r.proposals[0].id, action: 'accept' }), /이미 처리/);
});
test('공개 상태에 비밀 정보 없음', () => {
  const r = mk(); r.sessions.tok = 'd-ARC';
  const s = JSON.stringify(publicView(r));
  assert.ok(!s.includes('joinCodes') && !s.includes('sessions') && !s.includes('quizAnswers'));
});
test('퀴즈: 1인 1회, 정답 시 국가당 1회 보너스, 오답 불이익 없음', () => {
  const r = mk(); run(r, 'start', 'T');
  const before = JSON.stringify(r.countries.ARC);
  run(r, 'quiz', 'ARC', { choice: 0 }, true); assert.equal(JSON.stringify(r.countries.ARC), before);
  fails(() => run(r, 'quiz', 'ARC', { choice: 1 }, true), /이미/);
  const eco = r.countries.ARC.stock.eco;
  run(r, 'quiz', 'ARC', { choice: 1 }); assert.equal(r.countries.ARC.stock.eco, eco + 3);
  joinRoom(r, 'ARC', 'x', 'x', now); commands.quiz(r, { now, pid: 'x', country: 'ARC' }, { choice: 1 }); assert.equal(r.countries.ARC.stock.eco, eco + 3);
});
test('협약: 살아 있는 나라의 과반 찬성, 3개 조항 이상이면 채택', () => {
  const r = mk(); run(r, 'start', 'T');
  for (let i = 1; i < 5; i++) { for (const id of COUNTRY_IDS) for (const k of ['food', 'water', 'energy'] as const) r.countries[id].stock[k] = 99; now += 1000; run(r, 'endRound', 'T'); run(r, 'nextRound', 'T'); }
  fails(() => run(r, 'treatyVote', 'ARC', { clause: 'nope', yes: true }));
  for (const id of aliveIds(r)) for (const cl of ['climate', 'peace', 'sdg']) run(r, 'treatyVote', id, { clause: cl, yes: true });
  now += 1000; run(r, 'endRound', 'T');
  assert.equal(r.treaty!.result!.adopted, true); assert.equal(r.results!.world.treatyClauses, 3);
});

test('목숨: 자원이 모자라면 −1, 두 번이면 멸망, 멸망국은 행동 불가', () => {
  const r = mk(); run(r, 'start', 'T');
  const fill = () => { for (const id of COUNTRY_IDS) for (const k of ['food', 'water', 'energy'] as const) r.countries[id].stock[k] = 99; };
  fill(); r.countries.ARC.stock.energy = 0; r.countries.ARC.stock.food = 0;
  now += 1000; run(r, 'endRound', 'T');
  assert.equal(r.countries.ARC.lives, 1); assert.equal(r.countries.SOL.lives, 2); assert.equal(r.countries.ARC.diedRound, null);
  run(r, 'nextRound', 'T'); fill(); r.countries.ARC.stock.water = 0;
  run(r, 'propose', 'SOL', { to: 'ARC', give: { water: 1 } }); // 대기 중인 제안
  now += 1000; run(r, 'endRound', 'T');
  assert.equal(r.countries.ARC.lives, 0); assert.equal(r.countries.ARC.diedRound, 2); assert.deepEqual(aliveIds(r).includes('ARC'), false);
  run(r, 'nextRound', 'T'); fill();
  const stock = JSON.stringify(r.countries.ARC.stock);
  fails(() => run(r, 'policy', 'ARC', { id: 'green' }), /구호단/);
  fails(() => run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: 1 } }), /구호단/);
  fails(() => run(r, 'propose', 'SOL', { to: 'ARC', give: { eco: 1 } }), /멸망한 나라/);
  fails(() => run(r, 'mediate', 'ARC'), /구호단/);
  assert.equal(JSON.stringify(r.countries.ARC.stock), stock); // 멸망국은 생산도 소비도 없음
  assert.equal(ranking(r).at(-1), 'ARC');
});
test('국제 구호단: 멸망국만, 라운드마다 한 번, 살아 있는 나라에만', () => {
  const r = mk(); run(r, 'start', 'T');
  fails(() => run(r, 'relief', 'ARC', { to: 'SOL', res: 'water' }), /구호단/);
  r.countries.ARC.lives = 0; r.countries.ARC.diedRound = 1; r.countries.GRN.lives = 0; r.countries.GRN.diedRound = 1;
  const w = r.countries.SOL.stock.water;
  fails(() => run(r, 'relief', 'ARC', { to: 'GRN', res: 'water' }), /살아 있는/);
  fails(() => run(r, 'relief', 'ARC', { to: 'SOL', res: 'eco' }), /자원을 고르세요/);
  fails(() => run(r, 'relief', 'ARC', { to: 'SOL', res: 'water' }, true), /대표만/);
  run(r, 'relief', 'ARC', { to: 'SOL', res: 'water' }); assert.equal(r.countries.SOL.stock.water, w + 3);
  fails(() => run(r, 'relief', 'ARC', { to: 'SOL', res: 'water' }), /이미 보냈습니다/);
  now += 1000; run(r, 'endRound', 'T'); run(r, 'nextRound', 'T');
  run(r, 'relief', 'ARC', { to: 'SOL', res: 'food' }); // 다음 라운드에 다시 가능
});
test('노바리아 성장: 라운드마다 수입 +2', () => {
  const r = mk(); run(r, 'start', 'T');
  const p0 = r.countries.NOV.prod.eco, a0 = r.countries.ARC.prod.eco;
  for (let i = 1; i < 5; i++) { for (const id of COUNTRY_IDS) for (const k of ['food', 'water', 'energy'] as const) r.countries[id].stock[k] = 99; now += 1000; run(r, 'endRound', 'T'); run(r, 'nextRound', 'T'); }
  assert.equal(r.countries.NOV.prod.eco, p0 + 8); assert.equal(r.countries.ARC.prod.eco, a0);
});

// ── 전체 플레이 시뮬레이션 ──
function play(mode: 'solo' | 'mixed' | 'trade' | 'smart' | 'coop'): Room {
  const r = mk(); now += 1000; run(r, 'start', 'T');
  const tr = (from: CountryId, to: CountryId, give: object, take: object = {}) => {
    try { run(r, 'propose', from, { to, give, take }); run(r, 'respond', to, { id: r.proposals.at(-1)!.id, action: 'accept' }); } catch (e) { if (!(e instanceof GameError)) throw e; }
  };
  const tryRun = (name: string, c: CountryId, args: Record<string, unknown> = {}) => { try { run(r, name, c, args); } catch (e) { if (!(e instanceof GameError)) throw e; } };
  for (let rd = 1; rd <= 5; rd++) {
    if (mode === 'coop' || mode === 'trade' || mode === 'smart') {
      // 부족분을 남는 나라에서 사 오는 단순한 협력 전략
      for (const k of ['energy', 'water', 'food'] as const) {
        for (const id of COUNTRY_IDS) {
          const c = r.countries[id]; let lack = c.need[k] - c.stock[k];
          if (lack <= 0) continue;
          for (const s of [...COUNTRY_IDS].sort((x, y) => (r.countries[y].stock[k] - r.countries[y].need[k]) - (r.countries[x].stock[k] - r.countries[x].need[k]))) {
            const spare = r.countries[s].stock[k] - r.countries[s].need[k];
            if (s === id || spare <= 0 || lack <= 0) continue;
            const amt = Math.min(lack, spare); const payEco = Math.min(c.stock.eco, amt);
            tr(id, s, payEco > 0 ? { eco: payEco } : {}, { [k]: amt }); lack -= amt;
          }
        }
      }
      if (r.project && mode === 'coop') for (const id of aliveIds(r)) tryRun('joinProject', id);
      if (r.dispute) { run(r, 'stance', 'GRN', { stance: 'negotiate' }); run(r, 'stance', 'SOL', { stance: 'mediate' }); tryRun('mediate', 'OCE'); tryRun('mediate', 'NOV'); }
      if (rd === 5 && mode === 'coop') for (const id of aliveIds(r)) for (const cl of ['climate', 'coop', 'peace', 'support', 'sdg']) run(r, 'treatyVote', id, { clause: cl, yes: true });
      // 정책: 아직 모자란 자원이 있으면 긴급 구입, 없으면 가장 모자라는 자원의 생산을 늘리고(자원마다 한 번), 그다음엔 환경
      for (const id of aliveIds(r)) {
        const c = r.countries[id]; const short = (['energy', 'water', 'food'] as const).find((k) => c.stock[k] < c.need[k]);
        const weak = (['energy', 'water', 'food'] as const).find((k) => c.prod[k] < c.need[k] && !c.invested.includes(k));
        if (mode !== 'trade' && short) tryRun('policy', id, { id: 'emergency', pick: short });
        else if (mode !== 'trade' && weak && rd <= 3) tryRun('policy', id, { id: 'invest', pick: weak });
        if (!c.policy) tryRun('policy', id, { id: 'green' });
      }
    } else if (mode === 'mixed') {
      // 현실적인 학급: 에너지만 일부 거래, 공동 대응은 절반만 참여, 협약은 일부 반대
      // 경쟁: 솔라니아는 아르카디아에만 에너지를 팔고 인더스트리아에는 팔지 않음. 물은 오세아나에서 삼
      { const c = r.countries.ARC; const lack = c.need.energy - c.stock.energy; if (lack > 0) tr('ARC', 'SOL', { eco: Math.min(c.stock.eco, lack * 2) }, { energy: lack }); }
      const sol = r.countries.SOL; if (sol.stock.water < sol.need.water) tr('SOL', 'OCE', { eco: 5 }, { water: sol.need.water - sol.stock.water });
      for (const id of COUNTRY_IDS) if (!aliveIds(r).includes(id)) tryRun('relief', id, { to: 'NOV', res: 'food' });
      if (r.project) for (const id of ['ARC', 'GRN', 'OCE', 'SOL'] as CountryId[]) if (rd !== 2 || id !== 'SOL') tryRun('joinProject', id);
      if (r.dispute) { run(r, 'stance', 'GRN', { stance: 'negotiate' }); run(r, 'stance', 'SOL', { stance: 'negotiate' }); }
      if (rd === 5) for (const id of aliveIds(r)) for (const cl of ['climate', 'peace', 'sdg', 'support']) run(r, 'treatyVote', id, { clause: cl, yes: id !== 'SOL' });
      for (const id of aliveIds(r)) tryRun('policy', id, id === 'IND' ? { id: 'invest', pick: 'energy' } : { id: 'emergency', pick: (['energy', 'water', 'food'] as const).find((k) => r.countries[id].stock[k] < r.countries[id].need[k]) ?? 'food' });
    } else {
      if (r.dispute) { run(r, 'stance', 'GRN', { stance: 'unilateral' }); run(r, 'stance', 'SOL', { stance: 'unilateral' }); }
      for (const id of aliveIds(r)) tryRun('policy', id, { id: 'emergency', pick: id === 'SOL' ? 'water' : 'energy' });
    }
    noNeg(r);
    now += 10_000; run(r, 'endRound', 'T'); noNeg(r);
    if (rd < 5) run(r, 'nextRound', 'T');
  }
  return r;
}
for (const mode of ['solo', 'mixed', 'trade', 'smart', 'coop'] as const) {
  const r = play(mode); const res = r.results!;
  console.log(`\n[${mode === 'solo' ? '각자도생' : mode === 'mixed' ? '선택적 거래(경쟁)' : mode === 'trade' ? '모두 거래, 정책은 환경만' : mode === 'smart' ? '모두 거래 + 정책 카드를 생존에 사용' : '모두 거래 + 정책 + 공동 대응·협약 참여'} 시나리오] 살아남은 나라 ${res.world.survivors}/6 · 순위: ${res.ranking.join(' > ')}`);
  for (const id of res.ranking) { const c = r.countries[id], s = res.countries[id]; console.log(`  ${s.rank}위 ${id} ${'♥'.repeat(c.lives) || '멸망(R' + c.diedRound + ')'} 점수 ${s.score} 환경 ${c.env} 신뢰 ${c.trust} 돈 ${c.stock.eco} · ${diagnose(publicView(r), id).map((f) => f.title).join(' / ')}`); }
  if (mode === 'solo') assert.ok(res.world.survivors <= 3, '거래 없이는 여러 나라가 멸망해야 함');
  if (mode === 'trade') assert.ok(res.world.survivors <= 4, '거래만으로는 자원이 모자라 여러 나라가 멸망해야 함');
  if (mode === 'smart' || mode === 'coop') assert.ok(res.world.survivors >= 5, '거래와 정책 카드를 모두 잘 쓰면 대부분 살아남을 수 있어야 함');
  assert.equal(calcPeace(r).value, r.peace); assert.deepEqual(res.ranking, ranking(r));
  for (const id of COUNTRY_IDS) assert.ok(diagnose(publicView(r), id).length > 0);
}
console.log(`\n모든 테스트 통과 (${n}개 + 시뮬레이션 5종)`);
