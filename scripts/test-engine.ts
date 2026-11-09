// 게임 엔진 규칙 테스트: npm test
import assert from 'node:assert/strict';
import { COUNTRY_IDS, RES } from '../shared/data';
import { calcPeace, commands, joinRoom, newRoom, publicView, tick } from '../shared/engine';
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
const noNeg = (r: Room) => { for (const id of COUNTRY_IDS) { const c = r.countries[id]; for (const k of RES) assert.ok(c.stock[k] >= 0, `${id}.${k} 음수`); for (const k of ['happy', 'env', 'trust'] as const) assert.ok(c[k] >= 0 && c[k] <= 100); } };
let n = 0;
const test = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

console.log('엔진 규칙 테스트');
test('로비에서는 학생 행동 불가, 학생은 교사 명령 불가', () => {
  const r = mk();
  fails(() => run(r, 'act', 'ARC', { id: 'rnd' }), /행동할 수 없습니다/);
  fails(() => run(r, 'start', 'ARC'), /교사 권한/);
  fails(() => run(r, 'adjust', 'ARC', { country: 'ARC', key: 'eco', delta: 99 }), /교사 권한/);
});
test('대표가 아닌 학생은 정책·거래 불가', () => {
  const r = mk(); run(r, 'start', 'T');
  fails(() => run(r, 'act', 'ARC', { id: 'rnd' }, true), /대표만/);
  fails(() => run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: 1 } }, true), /대표만/);
  r.players['d-ARC'].online = true;
  fails(() => run(r, 'claimDelegate', 'ARC', {}, true), /접속 중/);
  r.players['d-ARC'].online = false;
  run(r, 'claimDelegate', 'ARC', {}, true); assert.equal(r.countries.ARC.delegate, 'm-ARC');
});
test('행동: 비용 차감, 라운드당 1회, 행동 포인트 한도', () => {
  const r = mk(); run(r, 'start', 'T');
  const c = r.countries.ARC; const eco = c.stock.eco, tech = c.stock.tech;
  run(r, 'act', 'ARC', { id: 'rnd' });
  assert.equal(c.stock.eco, eco - 8); assert.equal(c.stock.tech, tech + 7); assert.equal(c.ap, 2);
  fails(() => run(r, 'act', 'ARC', { id: 'rnd' }), /이미 실행/);
  run(r, 'act', 'ARC', { id: 'welfare' }); run(r, 'act', 'ARC', { id: 'invest', pick: 'energy' });
  fails(() => run(r, 'act', 'ARC', { id: 'renew' }), /행동 포인트/);
  fails(() => run(r, 'act', 'NOV', { id: 'refugee' }), /이번 라운드/);
  const nov = r.countries.NOV; nov.stock.eco = 3;
  fails(() => run(r, 'act', 'NOV', { id: 'rnd' }), /부족/);
  assert.equal(nov.stock.eco, 3);
});
test('거래: 상호 승인, 원자적 처리, 중복 승인 방지, 자원 보존', () => {
  const r = mk(); run(r, 'start', 'T');
  const before = RES.map((k) => total(r, k));
  run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: 10, tech: 2 }, take: { energy: 8 } });
  const p = r.proposals[0];
  fails(() => run(r, 'respond', 'GRN', { id: p.id, action: 'accept' }), /제안받은 국가만/);
  fails(() => run(r, 'respond', 'ARC', { id: p.id, action: 'accept' }), /제안받은 국가만/);
  const a0 = { ...r.countries.ARC.stock }, s0 = { ...r.countries.SOL.stock };
  run(r, 'respond', 'SOL', { id: p.id, action: 'accept' });
  assert.equal(r.countries.ARC.stock.energy, a0.energy + 8); assert.equal(r.countries.ARC.stock.eco, a0.eco - 10);
  assert.equal(r.countries.SOL.stock.eco, s0.eco + 10); assert.equal(r.countries.SOL.stock.energy, s0.energy - 8);
  fails(() => run(r, 'respond', 'SOL', { id: p.id, action: 'accept' }), /이미 처리/);
  assert.deepEqual(RES.map((k) => total(r, k)), before);
  // 승인 시점에 자원이 모자라면 아무것도 이동하지 않음
  run(r, 'propose', 'NOV', { to: 'OCE', give: { eco: 5 }, take: { water: 500 } });
  const q = r.proposals[1]; const snap = JSON.stringify(r.countries);
  fails(() => run(r, 'respond', 'OCE', { id: q.id, action: 'accept' }), /자원이 부족/);
  assert.equal(JSON.stringify(r.countries), snap); assert.equal(q.status, 'pending');
  // 잘못된 수량
  fails(() => run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: -5 } })); fails(() => run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: 1.5 } }));
  fails(() => run(r, 'propose', 'ARC', { to: 'ARC', give: { eco: 1 } })); fails(() => run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: 9999 } }));
});
test('인도적 지원: 부족한 나라를 도울 때만 신뢰도 상승, 상한 적용', () => {
  const r = mk(); run(r, 'start', 'T');
  r.countries.SOL.stock.water = 2;
  const t0 = r.countries.OCE.trust;
  run(r, 'propose', 'OCE', { to: 'SOL', give: { water: 6 } }); run(r, 'respond', 'SOL', { id: r.proposals[0].id, action: 'accept' });
  assert.equal(r.countries.OCE.trust, t0 + 2);
  for (let i = 0; i < 4; i++) { run(r, 'propose', 'ARC', { to: 'GRN', give: { food: 1 } }); run(r, 'respond', 'GRN', { id: r.proposals.at(-1)!.id, action: 'accept' }); }
  assert.equal(r.countries.ARC.trust, 55); // 그린벨트는 식량이 충분 → 보너스 없음
});
test('라운드 종료 후 제출 불가, 시간 만료 자동 종료, 일시정지', () => {
  const r = mk(); run(r, 'start', 'T');
  run(r, 'pause', 'T'); fails(() => run(r, 'act', 'ARC', { id: 'rnd' }), /일시정지/);
  now += 60_000; run(r, 'resume', 'T');
  assert.equal(r.endsAt, now + 600_000);
  run(r, 'propose', 'ARC', { to: 'SOL', give: { eco: 1 }, take: { energy: 1 } });
  now = r.endsAt!; // 종료 시각 정각
  fails(() => run(r, 'act', 'ARC', { id: 'rnd' }), /시간이 종료/);
  fails(() => run(r, 'respond', 'SOL', { id: r.proposals[0].id, action: 'accept' }), /시간이 종료/);
  assert.equal(tick(r, now), true); assert.equal(r.phase, 'roundEnd'); assert.equal(r.proposals[0].status, 'expired');
  fails(() => run(r, 'act', 'ARC', { id: 'rnd' })); fails(() => run(r, 'endRound', 'T'));
  run(r, 'nextRound', 'T'); assert.equal(r.round, 2);
  fails(() => run(r, 'respond', 'SOL', { id: r.proposals[0].id, action: 'accept' }), /이미 처리/);
});
test('공개 상태에 비밀 정보 없음', () => {
  const r = mk(); r.sessions.tok = 'd-ARC';
  const s = JSON.stringify(publicView(r));
  assert.ok(!s.includes('joinCodes') && !s.includes('sessions') && !s.includes('quizAnswers') && !s.includes('reflections'));
});
test('퀴즈: 1인 1회, 정답 시 국가당 1회 보너스, 오답 불이익 없음', () => {
  const r = mk(); run(r, 'start', 'T');
  const before = JSON.stringify(r.countries.ARC);
  run(r, 'quiz', 'ARC', { choice: 0 }, true); assert.equal(JSON.stringify(r.countries.ARC), before);
  fails(() => run(r, 'quiz', 'ARC', { choice: 1 }, true), /이미/);
  run(r, 'quiz', 'ARC', { choice: 1, __answer: 0 }); assert.equal(r.countries.ARC.ap, 4);
  joinRoom(r, 'ARC', 'x', 'x', now); commands.quiz(r, { now, pid: 'x', country: 'ARC' }, { choice: 1 }); assert.equal(r.countries.ARC.ap, 4);
});

// ── 전체 플레이 시뮬레이션 ──
function play(mode: 'solo' | 'coop'): Room {
  const r = mk(); now += 1000; run(r, 'start', 'T');
  const tr = (from: CountryId, to: CountryId, give: object, take: object = {}) => {
    try { run(r, 'propose', from, { to, give, take }); run(r, 'respond', to, { id: r.proposals.at(-1)!.id, action: 'accept' }); } catch (e) { if (!(e instanceof GameError)) throw e; }
  };
  const tryAct = (c: CountryId, id: string, pick?: string) => { try { run(r, 'act', c, { id, pick }); } catch (e) { if (!(e instanceof GameError)) throw e; } };
  for (let rd = 1; rd <= 5; rd++) {
    if (mode === 'coop') {
      // 부족분을 잉여국에서 사 오는 단순한 협력 전략
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
      if (r.project) for (const id of ['ARC', 'IND', 'SOL', 'GRN', 'OCE'] as CountryId[]) { try { run(r, 'contribute', id, { give: { eco: Math.min(8, r.countries[id].stock.eco) } }); } catch (e) { if (!(e instanceof GameError)) throw e; } }
      if (rd === 3) { run(r, 'stance', 'GRN', { stance: 'negotiate' }); run(r, 'stance', 'SOL', { stance: 'mediate' }); run(r, 'mediate', 'OCE'); run(r, 'mediate', 'NOV'); }
      if (rd === 5) for (const id of COUNTRY_IDS) { for (const cl of ['climate', 'tech', 'peace', 'support', 'sdg']) run(r, 'treatyChoice', id, { clause: cl, level: 'base' }); run(r, 'treatyRatify', id, { vote: 'yes' }); }
      for (const id of COUNTRY_IDS) { tryAct(id, id === 'IND' || id === 'SOL' ? 'carbon' : 'welfare'); tryAct(id, 'renew'); }
    } else {
      if (rd === 3) { run(r, 'stance', 'GRN', { stance: 'unilateral' }); run(r, 'stance', 'SOL', { stance: 'unilateral' }); }
      for (const id of COUNTRY_IDS) { tryAct(id, 'invest', 'energy'); tryAct(id, 'rnd'); tryAct(id, 'emergency', 'water'); }
    }
    noNeg(r);
    now += 10_000; run(r, 'endRound', 'T'); noNeg(r);
    if (rd < 5) run(r, 'nextRound', 'T');
  }
  return r;
}
for (const mode of ['solo', 'coop'] as const) {
  const r = play(mode); const res = r.results!;
  console.log(`\n[${mode === 'solo' ? '각자도생' : '협력'} 시나리오] 평화 지수 ${r.peaceHistory.map((p) => p.value).join(' → ')} · 결과: ${res.outcome} · 생존 ${res.world.survivors}/6`);
  for (const id of COUNTRY_IDS) { const c = r.countries[id], s = res.countries[id]; console.log(`  ${id} 점수 ${String(s.total).padStart(3)} 행복 ${c.happy} 환경 ${c.env} 신뢰 ${c.trust} 경제 ${c.stock.eco} 부족 ${s.shortageCount}회 ${s.survived ? '생존' : '위기'}`); }
  if (mode === 'solo') assert.notEqual(res.outcome, 'win', '협력 없이는 공동 승리가 불가능해야 함');
  else assert.equal(res.outcome, 'win', '협력하면 공동 승리가 가능해야 함');
  assert.equal(calcPeace(r).value, r.peace);
}
console.log(`\n모든 테스트 통과 (${n}개 + 시뮬레이션 2종)`);
