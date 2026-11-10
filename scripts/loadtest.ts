// 실제 서버에 대한 다중 접속 통합·부하 테스트
// 사용법: 서버 실행 후  BASE=http://localhost:8080 TEACHER_PASSWORD=... npm run loadtest
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { COUNTRY_IDS } from '../shared/data';
import type { CountryId, PublicRoom } from '../shared/types';

const BASE = process.env.BASE ?? 'http://localhost:8080';
const PW = process.env.TEACHER_PASSWORD ?? '';
const ROOMS = Number(process.env.ROOMS ?? 9);
const PER_COUNTRY = Number(process.env.PER_COUNTRY ?? 5);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function http<T = any>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { method: opts.method ?? (opts.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status });
  return data;
}

class Client {
  ws!: WebSocket; state!: PublicRoom; me: any; n = 0; lastAt = 0; closed = false;
  private pend = new Map<string, ((r: { ok: boolean; error?: string }) => void)[]>();
  constructor(public hello: Record<string, unknown>) {}
  connect() {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws');
      this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'hello', ...this.hello })));
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.t === 'state') { this.state = m.s; this.lastAt = Date.now(); resolve(); }
        if (m.t === 'me') this.me = m.me;
        if (m.t === 'ack') { this.pend.get(m.id)?.shift()?.(m); }
      });
      this.ws.on('close', (code) => { this.closed = true; reject(new Error(`closed ${code}`)); });
      this.ws.on('error', reject);
    });
  }
  cmd(name: string, args: Record<string, unknown> = {}, id = `c${++this.n}-${Math.random().toString(36).slice(2)}`) {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => { this.pend.set(id, [...(this.pend.get(id) ?? []), resolve]); this.ws.send(JSON.stringify({ t: 'cmd', id, name, args })); });
  }
}
let passed = 0;
const ok = (name: string) => { passed++; console.log(`  ✓ ${name}`); };

const t0 = Date.now();
const { token } = await http('/teacher/login', { body: { password: PW } });
await assert.rejects(http('/teacher/rooms'), (e: any) => e.status === 401);
await assert.rejects(http('/teacher/login', { body: { password: 'wrong' } }), (e: any) => e.status === 401);
ok('교사 인증: 토큰 없이는 관리 API 접근 불가');

interface R { code: string; codes: Record<CountryId, string>; teacher: Client; board: Client; students: Client[]; delegates: Record<CountryId, Client>; tokens: Record<string, string> }
const rooms: R[] = [];
for (let i = 0; i < ROOMS; i++) {
  const { room } = await http('/teacher/rooms', { token, body: { className: `부하테스트 ${i + 1}반`, minutes: 1 } });
  const exp = await http(`/teacher/rooms/${room.code}/export`, { token });
  rooms.push({ code: room.code, codes: exp.room.joinCodes, teacher: new Client({ role: 'teacher', room: room.code, token }), board: new Client({ role: 'board', room: room.code }), students: [], delegates: {} as any, tokens: {} });
}
await assert.rejects(http('/join', { body: { room: rooms[0].code, code: 'ZZZZ', nick: 'x' } }), (e: any) => e.status === 403);
await assert.rejects(http('/join', { body: { room: 'NOPE1', code: 'ZZZZ', nick: 'x' } }), (e: any) => e.status === 404);
ok('잘못된 방 코드·국가 코드로는 입장 불가');

// 모든 학생 동시 입장 + 접속
await Promise.all(rooms.flatMap((r) => COUNTRY_IDS.flatMap((id) => Array.from({ length: PER_COUNTRY }, async (_, k) => {
  if (k > 0) await sleep(150); // 첫 학생이 대표가 되도록
  const s = await http('/join', { body: { room: r.code, code: r.codes[id], nick: `${id}${k + 1}` } });
  const c = new Client({ role: 'student', room: r.code, token: s.token });
  await c.connect();
  r.students.push(c); r.tokens[`${id}${k}`] = s.token;
  if (k === 0) r.delegates[id] = c;
}))));
await Promise.all(rooms.flatMap((r) => [r.teacher.connect(), r.board.connect()]));
const total = rooms.reduce((s, r) => s + r.students.length + 2, 0);
const health = await http('/health');
assert.equal(health.connections, total);
ok(`${ROOMS}개 방 · 학생 ${total - ROOMS * 2}명 + 교사·칠판 ${ROOMS * 2}개 동시 접속 (총 ${total} 연결, ${Date.now() - t0}ms)`);

const bad = new Client({ role: 'teacher', room: rooms[0].code, token: 'x.y' });
await assert.rejects(bad.connect(), /4003/);
assert.equal((await rooms[0].students[0].cmd('start')).ok, false);
assert.equal((await rooms[0].board.cmd('start')).ok, false);
assert.equal((await rooms[0].students[0].cmd('adjust', { country: 'ARC', key: 'eco', delta: 50 })).ok, false);
assert.equal((await rooms[0].students[0].cmd('__proto__')).ok, false);
ok('학생·칠판 연결은 교사 명령 실행 불가, 위조 토큰 거부');

await Promise.all(rooms.map((r) => r.teacher.cmd('start')));
await sleep(300);
for (const r of rooms) for (const c of r.students) assert.equal(c.state.phase, 'running');
ok('모든 방 게임 시작 → 전 학생 화면 동기화');

// 방 독립성: 0번 방에서만 행동
const r0 = rooms[0];
assert.equal((await r0.delegates.ARC.cmd('policy', { id: 'green' })).ok, true);
await sleep(200);
assert.equal(r0.students.at(-1)!.state.countries.ARC.env, rooms[1].students[0].state.countries.ARC.env + 8);
ok('방끼리 상태가 섞이지 않음 (독립 게임방)');

// 대표가 아닌 학생 차단
const member = r0.students.find((c) => c.me.country === 'ARC' && c !== r0.delegates.ARC)!;
const rej = await member.cmd('policy', { id: 'green' });
assert.equal(rej.ok, false); assert.match(rej.error!, /대표만/);
ok('같은 국가의 대표단원은 정책 실행 불가');

// 동시 거래·중복 승인: 모든 방에서 동시에, 같은 제안을 여러 연결이 동시에 승인 시도
await Promise.all(rooms.map(async (r) => {
  const sum = (s: PublicRoom, k: 'eco' | 'energy') => COUNTRY_IDS.reduce((a, id) => a + s.countries[id].stock[k], 0);
  const before = { eco: sum(r.teacher.state, 'eco'), energy: sum(r.teacher.state, 'energy') };
  const arcEnergy = r.teacher.state.countries.ARC.stock.energy;
  assert.equal((await r.delegates.ARC.cmd('propose', { to: 'SOL', give: { eco: 6 }, take: { energy: 5 } })).ok, true);
  await sleep(150);
  const pid = r.delegates.SOL.state.proposals.at(-1)!.id;
  // 같은 대표가 두 기기(탭)로 접속해 동시에 승인 + 같은 요청 id 재전송 + 제안국의 동시 취소
  const twin = new Client({ role: 'student', room: r.code, token: r.tokens.SOL0 }); await twin.connect();
  const res = await Promise.all([
    r.delegates.SOL.cmd('respond', { id: pid, action: 'accept' }, 'same-id'), r.delegates.SOL.cmd('respond', { id: pid, action: 'accept' }, 'same-id'),
    twin.cmd('respond', { id: pid, action: 'accept' }), twin.cmd('respond', { id: pid, action: 'accept' }),
    r.delegates.ARC.cmd('respond', { id: pid, action: 'cancel' }),
  ]);
  await sleep(250);
  const s = r.teacher.state;
  assert.equal(s.proposals.find((p) => p.id === pid)!.status, 'accepted');
  assert.equal(s.countries.ARC.stock.energy, arcEnergy + 5, '거래는 정확히 한 번만 실행');
  assert.equal(sum(s, 'eco'), before.eco); assert.equal(sum(s, 'energy'), before.energy);
  assert.ok(res.filter((x) => !x.ok).length >= 3);
  twin.ws.close();
  // 여러 국가가 한 국가의 자원을 동시에 요구 (합계가 보유량 초과) → 음수 없이 일부만 체결
  const grnFood = s.countries.GRN.stock.food;
  const askers = ['ARC', 'IND', 'NOV', 'OCE'] as CountryId[];
  await Promise.all(askers.map((id) => r.delegates[id].cmd('propose', { to: 'GRN', give: { eco: 1 }, take: { food: Math.ceil(grnFood / 2.5) } })));
  await sleep(150);
  const ps = r.delegates.GRN.state.proposals.filter((p) => p.to === 'GRN' && p.status === 'pending');
  const out = await Promise.all(ps.map((p) => r.delegates.GRN.cmd('respond', { id: p.id, action: 'accept' })));
  await sleep(200);
  assert.equal(out.filter((x) => x.ok).length, 2);
  for (const id of COUNTRY_IDS) for (const v of Object.values(r.teacher.state.countries[id].stock)) assert.ok(v >= 0);
}));
ok('동시 거래: 중복 승인·승인/취소 경합에도 1회만 체결, 자원 총량 보존, 음수 없음');

// 재접속: 연결을 끊었다가 같은 토큰으로 복귀
const d = r0.delegates.OCE; d.ws.close(); await sleep(300);
assert.equal(r0.teacher.state.players[d.me.pid].online, false);
const back = new Client({ role: 'student', room: r0.code, token: r0.tokens.OCE0 }); await back.connect(); await sleep(200);
assert.equal(back.me.country, 'OCE'); assert.equal(back.state.countries.OCE.delegate, back.me.pid);
assert.equal(r0.teacher.state.players[back.me.pid].online, true);
assert.equal((await back.cmd('policy', { id: 'green' })).ok, true);
ok('접속 해제 → 재접속 후 국가·대표 권한·게임 상태 유지');

// 브로드캐스트 지연 측정
const lat: number[] = [];
for (let i = 0; i < 5; i++) {
  const t = Date.now();
  await r0.teacher.cmd('adjust', { country: 'NOV', key: 'eco', delta: 1 });
  await sleep(120);
  lat.push(Math.max(...r0.students.filter((c) => !c.closed).map((c) => c.lastAt)) - t);
}
ok(`상태 동기화 지연: 최대 ${Math.max(...lat)}ms (방 내 전 학생 기준)`);

// 라운드 종료 직전·직후 제출: 타이머(1분)가 끝날 때까지 대기
const left = r0.teacher.state.endsAt! - Date.now();
console.log(`  … 라운드 자동 종료까지 ${Math.round(left / 1000)}초 대기`);
await sleep(Math.max(0, left - 400));
const burst = await Promise.all(Array.from({ length: 12 }, async (_, i) => { await sleep(i * 80); return r0.delegates.IND.cmd('propose', { to: 'SOL', give: { eco: 1 }, take: { energy: 1 }, memo: `막판 ${i}` }); }));
await sleep(900);
assert.equal(r0.teacher.state.phase, 'roundEnd');
const late = await r0.delegates.IND.cmd('policy', { id: 'green' });
assert.equal(late.ok, false);
assert.ok(burst.some((x) => !x.ok), '종료 후 도착한 제안은 거부되어야 함');
assert.ok(r0.teacher.state.proposals.every((p) => p.status !== 'pending'));
ok(`라운드 종료 직전 연속 제출: ${burst.filter((x) => x.ok).length}건 접수 / ${burst.filter((x) => !x.ok).length}건 거부, 종료 후 행동 불가, 대기 제안 자동 만료`);
for (const r of rooms) assert.equal(r.teacher.state.phase, 'roundEnd');
ok('모든 방이 서버 타이머로 자동 결산');

// 복구
await r0.teacher.cmd('nextRound'); await sleep(200);
await http(`/teacher/rooms/${r0.code}/restore`, { token, body: { round: 1 } }); await sleep(200);
assert.equal(r0.teacher.state.round, 1); assert.equal(r0.teacher.state.phase, 'paused'); assert.equal(Object.keys(r0.teacher.state.players).length, 30);
ok('교사 복구 기능: 라운드 시작 시점으로 되돌리기');

for (const r of rooms) { for (const c of [...r.students, r.teacher, r.board]) c.ws.close(); await http(`/teacher/rooms/${r.code}`, { token, method: 'DELETE' }); }
console.log(`\n통합·부하 테스트 통과 (${passed}개 항목, 메모리 ${Math.round(process.memoryUsage().rss / 1e6)}MB[클라이언트 측])`);
process.exit(0);
