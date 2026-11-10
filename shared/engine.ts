// WORLD 2050 — 게임 엔진. 모든 규칙은 이 파일에서 서버가 검증·실행합니다.
// 클라이언트는 같은 파일의 순수 계산 함수(평화 지수, 협약 집계 등)만 화면 표시용으로 사용합니다.
//
// 한 라운드에 각 나라가 하는 일은 세 가지뿐입니다.
//   ① 다른 나라와 자원 거래·지원 (횟수 제한 없음)
//   ② 정책 카드 4장 중 1장 선택
//   ③ 그 라운드의 사건 카드에 응답 (공동 대응 참여 / 분쟁 입장 / 협약 투표)
import { QUIZZES } from './content';
import {
  CLAUSES, COUNTRIES, COUNTRY_IDS, DISPUTE_PARTIES, POLICIES, RES, RES_INFO, ROUNDS,
  RELIEF_AMOUNT, START_LIVES, investGain, policyCost, TEACHER_EVENTS, TOTAL_ROUNDS, TREATY_RULES, VITALS, fmtBundle,
} from './data';
import {
  GameError, type CountryId, type CountryState, type Ctx, type LogEntry, type MeInfo, type News,
  type Proposal, type PublicRoom, type Res, type ResBundle, type Results, type Room, type Stance, type Vital,
} from './types';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const fail = (msg: string): never => { throw new GameError(msg); };
const need = (cond: unknown, msg: string): void => { if (!cond) fail(msg); };
const cname = (id: CountryId) => COUNTRIES[id].short;
const isCountry = (v: unknown): v is CountryId => typeof v === 'string' && (COUNTRY_IDS as string[]).includes(v);

// ───────────────────────── 생성 ─────────────────────────
function newCountry(id: CountryId): CountryState {
  const d = COUNTRIES[id];
  return {
    id, stock: { ...d.stock }, prod: { ...d.prod }, need: { ...d.need },
    lives: START_LIVES, diedRound: null, reliefDone: false, env: d.env, trust: d.trust, policy: null, invested: [],
    shortages: {}, trades: 0, roundTrust: { trade: 0, aid: 0 }, hubBonus: 0, quizBonus: [], delegate: null,
    history: [{ round: 0, stock: { ...d.stock }, lives: START_LIVES, env: d.env, trust: d.trust, shortages: [] }],
  };
}

export function newRoom(code: string, className: string, durationSec: number, joinCodes: Record<CountryId, string>, now: number): Room {
  const countries = {} as Record<CountryId, CountryState>;
  for (const id of COUNTRY_IDS) countries[id] = newCountry(id);
  const room: Room = {
    v: 5, code, className, createdAt: now, phase: 'lobby', round: 0, durationSec, endsAt: null, remainingMs: null,
    countries, players: {}, proposals: [], agreements: [], recurring: [], news: [], log: [],
    project: null, projectResults: {}, dispute: null, treaty: null,
    peace: 0, peaceHistory: [], severity: 1, results: null, quizStats: {}, seq: 0,
    joinCodes, sessions: {}, quizAnswers: {},
  };
  room.peace = calcPeace(room).value;
  room.peaceHistory.push({ round: 0, label: '시작', value: room.peace });
  return room;
}

/** 게임만 초기화 (참가자·참가 코드·세션은 유지) */
export function resetRoom(room: Room, now: number): void {
  const fresh = newRoom(room.code, room.className, room.durationSec, room.joinCodes, now);
  for (const id of COUNTRY_IDS) fresh.countries[id].delegate = room.countries[id].delegate;
  fresh.players = room.players;
  fresh.sessions = room.sessions;
  fresh.createdAt = room.createdAt;
  fresh.seq = room.seq + 1;
  Object.assign(room, fresh);
  addLog(room, now, 'teacher', '교사가 게임을 초기화했습니다.');
}

/**
 * 공개 상태. 교사용(full)은 전체, 학생·전자칠판용은 화면에 쓰지 않는 기록을 덜어 낸 가벼운 판.
 * (활동 기록은 교사 화면에서만 보므로 학생에게 보내지 않음 → 전송량이 크게 줄어듦)
 */
export function publicView(room: Room, full = true): PublicRoom {
  const { joinCodes, sessions, quizAnswers, ...pub } = room;
  if (full) return pub;
  const done = pub.proposals.filter((p) => p.status !== 'pending');
  return { ...pub, log: [], news: pub.news.slice(-12), proposals: [...done.slice(-40), ...pub.proposals.filter((p) => p.status === 'pending')] };
}

export function meView(room: Room, pid: string): MeInfo | null {
  const p = room.players[pid];
  if (!p) return null;
  const quiz: Record<number, number> = {};
  for (const [rd, ans] of Object.entries(room.quizAnswers)) if (pid in ans) quiz[Number(rd)] = ans[pid];
  return { pid, country: p.country, quiz };
}

// ───────────────────────── 공용 계산 ─────────────────────────
type HasCountries = Pick<Room, 'countries'>;
export const isAlive = (room: HasCountries, id: CountryId) => room.countries[id].diedRound === null;
export const aliveIds = (room: HasCountries) => COUNTRY_IDS.filter((id) => isAlive(room, id));

/** 세계 평화 지수 = 평균 신뢰도 50% + 평균 환경 25% + 남은 목숨 비율 25% (참고용 지표) */
export function calcPeace(room: HasCountries) {
  const cs = COUNTRY_IDS.map((id) => room.countries[id]);
  const avg = (f: (c: CountryState) => number) => cs.reduce((s, c) => s + f(c), 0) / cs.length;
  const trust = avg((c) => c.trust);
  const env = avg((c) => c.env);
  const life = clamp((cs.reduce((s, c) => s + c.lives, 0) / (cs.length * START_LIVES)) * 100);
  const value = clamp(0.5 * trust + 0.25 * env + 0.25 * life);
  return { value, trust: Math.round(trust), env: Math.round(env), life };
}

/** 환경 노력 점수(0~100): 처음보다 환경을 얼마나 올렸는가. 출발선이 낮은 나라도 같은 기준으로 평가 */
export function envEffort(c: CountryState): number {
  return clamp(50 + (c.env - COUNTRIES[c.id].env) * 2);
}

/** 나라 점수 (동점일 때 순위를 가르는 값) = 신뢰도 40% + 환경 노력 40% + 돈(최대 20점) */
export function countryScore(c: CountryState): number {
  return Math.round(c.trust * 0.4 + envEffort(c) * 0.4 + Math.min(20, c.stock.eco / 3));
}

/** 순위: 살아남은 나라가 먼저, 늦게 멸망할수록 위, 목숨이 많을수록 위, 나라 점수가 높을수록 위 */
export function ranking(room: HasCountries): CountryId[] {
  const key = (id: CountryId) => { const c = room.countries[id]; return [c.diedRound ?? 99, c.lives, countryScore(c)]; };
  return [...COUNTRY_IDS].sort((x, y) => { const a = key(x), b = key(y); return b[0] - a[0] || b[1] - a[1] || b[2] - a[2]; });
}

/** 지금 부족한(진행 중) 또는 이번 라운드에 부족했던(결산 후) 필수 자원. 멸망한 나라는 항상 빈 목록 */
export function lacking(room: Pick<Room, 'countries' | 'phase' | 'round'>, id: CountryId): Vital[] {
  const c = room.countries[id];
  if (room.phase === 'running' || room.phase === 'paused') return c.diedRound === null ? VITALS.filter((k) => c.stock[k] < c.need[k]) : [];
  return c.shortages[room.round] ?? [];
}

export function avgEnv(room: HasCountries): number {
  return COUNTRY_IDS.reduce((s, id) => s + room.countries[id].env, 0) / COUNTRY_IDS.length;
}

/** 이번 라운드 공동 대응에 참여할 수 있는 나라와 성공에 필요한 나라 수 */
export function projectInfo(room: Pick<Room, 'countries' | 'project'>) {
  const def = room.project ? ROUNDS[room.project.round].project! : null;
  const eligible = def ? aliveIds(room).filter((id) => !def.victims?.includes(id)) : [];
  return { def, eligible, need: def ? Math.max(1, Math.min(def.need, eligible.length)) : 0 };
}

/** 협약 조항별 찬성 수와 채택 여부. 살아 있는 나라의 과반이 찬성해야 조항이 합의됨 */
export function tallyTreaty(room: Pick<Room, 'treaty' | 'countries'>) {
  const t = room.treaty;
  const voters = aliveIds(room);
  const needVotes = Math.floor(voters.length / 2) + 1;
  const yes: Record<string, CountryId[]> = {};
  const clauses: Record<string, boolean> = {};
  for (const cl of CLAUSES) {
    yes[cl.id] = voters.filter((id) => t?.votes[id]?.[cl.id] === true);
    clauses[cl.id] = yes[cl.id].length >= needVotes;
  }
  const included = Object.values(clauses).filter(Boolean).length;
  return { yes, clauses, included, needVotes, voters: voters.length, adopted: included >= TREATY_RULES.minClauses };
}

export function calcResults(room: Room): Results {
  const order = ranking(room);
  const countries = {} as Results['countries'];
  for (const id of COUNTRY_IDS) {
    const c = room.countries[id];
    countries[id] = {
      rank: order.indexOf(id) + 1, lives: c.lives, diedRound: c.diedRound, env: c.env, trust: c.trust, eco: c.stock.eco,
      score: countryScore(c), shortageCount: Object.values(c.shortages).filter((a) => a.length).length,
    };
  }
  const tr = room.treaty?.result;
  const disputePeace = room.agreements.some((a) => a.title === '미르강 공동 관리 협정');
  return {
    ranking: order,
    countries,
    world: {
      peace: calcPeace(room).value, peaceStart: room.peaceHistory[0]?.value ?? 0,
      projects: Object.values(room.projectResults).filter((x) => x.success).length,
      reliefSuccess: !!room.projectResults.relief?.success,
      disputePeace,
      dispute: disputePeace ? 'peace' : room.log.some((l) => l.type === 'dispute' && l.round === 3) ? 'failed' : 'none',
      treatyAdopted: !!tr?.adopted, treatyClauses: tr?.adopted ? Object.values(tr.clauses).filter(Boolean).length : 0,
      survivors: aliveIds(room).length,
    },
  };
}

// ───────────────────────── 내부 도우미 ─────────────────────────
function addLog(room: Room, t: number, type: LogEntry['type'], text: string, country?: CountryId) {
  room.log.push({ t, round: room.round, type, text, country });
  if (room.log.length > 400) room.log.splice(0, room.log.length - 400);
}
function addNews(room: Room, t: number, title: string, body: string, tone: News['tone'] = 'info') {
  room.news.push({ id: `n${++room.seq}`, t, round: room.round, title, body, tone });
  if (room.news.length > 80) room.news.splice(0, room.news.length - 80);
}
function addAgreement(room: Room, title: string, parties: CountryId[], text: string) {
  room.agreements.push({ id: `a${++room.seq}`, round: room.round, title, parties, text });
}
function refreshPeace(room: Room) { room.peace = calcPeace(room).value; }
function idx(c: CountryState, k: 'env' | 'trust', v: number) { c[k] = clamp(c[k] + v); }
function gain(c: CountryState, k: Res, v: number) { c.stock[k] = Math.max(0, Math.round(c.stock[k] + v)); }

function cleanBundle(raw: unknown): ResBundle {
  const out: ResBundle = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of RES) {
    const v = (raw as Record<string, unknown>)[k];
    if (v === undefined || v === 0 || v === null) continue;
    need(typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 999, '자원 수량은 1~999의 정수여야 합니다.');
    out[k] = v as number;
  }
  return out;
}
const bundleSum = (b: ResBundle) => RES.reduce((s, k) => s + (b[k] ?? 0), 0);
const canPay = (c: CountryState, b: ResBundle) => RES.every((k) => c.stock[k] >= (b[k] ?? 0));
function pay(c: CountryState, b: ResBundle) { for (const k of RES) c.stock[k] -= b[k] ?? 0; }
function receive(c: CountryState, b: ResBundle) { for (const k of RES) c.stock[k] += b[k] ?? 0; }

function requireRunning(room: Room, now: number) {
  need(room.phase === 'running', room.phase === 'paused' ? '게임이 일시정지 상태입니다.' : '지금은 행동할 수 없습니다. (라운드 진행 중에만 가능)');
  need(room.endsAt !== null && now < room.endsAt, '라운드 시간이 종료되어 제출할 수 없습니다.');
}
function requireDelegate(room: Room, ctx: Ctx): CountryState {
  need(ctx.country && ctx.pid, '국가 대표단만 할 수 있는 행동입니다.');
  const c = room.countries[ctx.country!];
  need(c.delegate === ctx.pid, '이 행동은 국가 대표만 실행할 수 있습니다. 대표에게 의견을 전달하세요.');
  return c;
}
/** 살아 있는 나라의 대표만 */
function requireActive(room: Room, ctx: Ctx): CountryState {
  const c = requireDelegate(room, ctx);
  need(c.diedRound === null, '멸망한 나라는 국제 구호단으로만 활동할 수 있습니다.');
  return c;
}
function requireTeacher(ctx: Ctx) { need(ctx.teacher, '교사 권한이 필요합니다.'); }

// ───────────────────────── 라운드 진행 ─────────────────────────
function beginRound(room: Room, n: number, now: number) {
  const def = ROUNDS[n];
  room.round = n;
  room.phase = 'running';
  room.endsAt = now + room.durationSec * 1000;
  room.remainingMs = null;
  room.project = null;
  room.dispute = null;
  for (const id of COUNTRY_IDS) {
    const c = room.countries[id];
    c.policy = null;
    c.reliefDone = false;
    c.roundTrust = { trade: 0, aid: 0 };
    c.hubBonus = 0;
    if (c.diedRound !== null) continue;
    if (n > 1) c.prod.eco += COUNTRIES[id].growth;
    for (const k of RES) c.stock[k] += Math.round(c.prod[k] * (def.prodMult[k] ?? 1));
  }
  addNews(room, now, def.headline, def.body, n === 5 ? 'info' : 'bad');
  addLog(room, now, 'event', `ROUND ${n} 시작 — ${def.crisis}`);

  // 정기 이행 협정 (미르강 공동 관리 협정) — 두 나라가 모두 살아 있을 때만
  for (const rc of room.recurring.filter((x) => x.until >= n && isAlive(room, x.from) && isAlive(room, x.to))) {
    const from = room.countries[rc.from], to = room.countries[rc.to];
    const amt = Math.min(rc.amt, from.stock[rc.res]);
    from.stock[rc.res] -= amt;
    to.stock[rc.res] += amt;
    addLog(room, now, 'dispute', `${rc.label}: ${cname(rc.from)} → ${cname(rc.to)} ${RES_INFO[rc.res].name} ${amt}`);
  }

  if (def.project) {
    const victimsAlive = !def.project.victims || def.project.victims.some((id) => isAlive(room, id));
    const donors = aliveIds(room).filter((id) => !def.project!.victims?.includes(id));
    if (victimsAlive && donors.length) room.project = { round: n, id: def.project.id, joined: [] };
  }
  if (n === 3) {
    if (DISPUTE_PARTIES.every((id) => isAlive(room, id))) room.dispute = { parties: DISPUTE_PARTIES, stances: {}, mediators: [] };
    else addNews(room, now, '미르강 분쟁 소멸', '분쟁 당사국 가운데 멸망한 나라가 있어 분쟁이 일어나지 않았습니다.', 'info');
  }
  if (n === 4) applyDisaster(room, now);
  if (n === 5) room.treaty = { votes: {} };
  refreshPeace(room);
}

function applyDisaster(room: Room, now: number) {
  const e = avgEnv(room);
  const sev = e < 45 ? 1.3 : e >= 60 ? 0.8 : 1;
  room.severity = sev;
  const hit = (id: CountryId, d: { food: number; water: number; eco: number }) => {
    if (!isAlive(room, id)) return;
    const c = room.countries[id];
    gain(c, 'food', -d.food * sev); gain(c, 'water', -d.water * sev); gain(c, 'eco', -d.eco * sev);
    addLog(room, now, 'event', `${cname(id)} 재난 피해 (피해 배율 ×${sev})`, id);
  };
  hit('OCE', { food: 5, water: 6, eco: 8 });
  hit('NOV', { food: 4, water: 3, eco: 4 });
  const txt = sev > 1 ? '세계 환경 지수가 낮아 재난 피해가 30% 커졌습니다.' : sev < 1 ? '각국이 환경을 지킨 덕분에 재난 피해가 20% 줄었습니다.' : '세계 환경 지수가 보통 수준이어서 피해 규모는 예측대로였습니다.';
  addNews(room, now, '재난 피해 규모 발표', txt, sev > 1 ? 'bad' : 'info');
}

function endRound(room: Room, now: number) {
  const n = room.round;
  for (const p of room.proposals) if (p.status === 'pending') { p.status = 'expired'; p.doneT = now; }
  resolveProject(room, now);
  if (n === 3) resolveDispute(room, now);
  if (n === 5) resolveTreaty(room, now);

  // 소비와 부족 판정: 필수 자원이 하나라도 모자라면 목숨 −1, 0이 되면 멸망
  const hurt: CountryId[] = [], fallen: CountryId[] = [];
  for (const id of aliveIds(room)) {
    const c = room.countries[id];
    const short: Vital[] = [];
    for (const k of VITALS) {
      if (c.stock[k] >= c.need[k]) c.stock[k] -= c.need[k];
      else { c.stock[k] = 0; short.push(k); }
    }
    c.shortages[n] = short;
    if (short.length) {
      c.lives -= 1;
      hurt.push(id);
      const what = short.map((k) => RES_INFO[k].name).join('·');
      if (c.lives <= 0) {
        c.lives = 0; c.diedRound = n; fallen.push(id);
        addLog(room, now, 'system', `${cname(id)} 멸망 — ${what} 부족. 다음 라운드부터 국제 구호단이 됩니다.`, id);
      } else addLog(room, now, 'system', `${cname(id)}: ${what} 부족으로 목숨 −1 (남은 목숨 ${c.lives})`, id);
    }
    idx(c, 'env', COUNTRIES[id].envDrift);
  }
  if (avgEnv(room) < 45) {
    for (const id of aliveIds(room)) { gain(room.countries[id], 'food', -3); gain(room.countries[id], 'water', -3); }
    addNews(room, now, '기후 악화 경고', '세계 평균 환경 지수가 45 아래로 떨어져 살아 있는 모든 나라가 식량·물을 3씩 잃었습니다.', 'bad');
  }
  if (fallen.length) addNews(room, now, `ROUND ${n} 결산: ${fallen.map(cname).join(', ')} 멸망`, '필수 자원을 채우지 못해 마지막 목숨을 잃었습니다. 멸망한 나라는 국제 구호단이 되어 다른 나라를 돕습니다.', 'bad');
  const onlyHurt = hurt.filter((id) => !fallen.includes(id));
  if (onlyHurt.length) addNews(room, now, `ROUND ${n} 결산: ${onlyHurt.map(cname).join(', ')} 목숨 −1`, '필수 자원이 모자랐습니다. 한 번 더 모자라면 멸망합니다.', 'bad');
  if (!hurt.length) addNews(room, now, `ROUND ${n} 결산: 모든 나라가 자원 확보`, '이번 라운드에는 목숨을 잃은 나라가 없습니다.', 'good');

  for (const id of COUNTRY_IDS) {
    const c = room.countries[id];
    c.history.push({ round: n, stock: { ...c.stock }, lives: c.lives, env: c.env, trust: c.trust, shortages: c.shortages[n] ?? [] });
  }
  refreshPeace(room);
  room.peaceHistory.push({ round: n, label: `R${n}`, value: room.peace });
  room.endsAt = null;
  room.remainingMs = null;
  addLog(room, now, 'system', `ROUND ${n} 종료 — 살아남은 나라 ${aliveIds(room).length}개`);
  if (n >= TOTAL_ROUNDS) {
    room.phase = 'finished';
    room.results = calcResults(room);
    const first = room.results.ranking[0];
    addNews(room, now, `최종 1위: ${COUNTRIES[first].name}`, `살아남은 나라 ${room.results.world.survivors}개. 결과 화면에서 각 나라가 왜 그런 결과를 얻었는지 살펴보세요.`, 'info');
  } else room.phase = 'roundEnd';
}

function resolveProject(room: Room, now: number) {
  const pr = room.project;
  if (!pr) return;
  const { def, need: needN } = projectInfo(room);
  if (!def) return;
  pr.success = pr.joined.length >= needN;
  if (pr.id === 'relief') {
    // 모인 돈은 성공 여부와 관계없이 살아 있는 피해국에 나누어 전달
    const victims = def.victims!.filter((id) => isAlive(room, id));
    const pool = pr.joined.length * def.cost;
    victims.forEach((id, i) => { room.countries[id].stock.eco += i === 0 ? Math.ceil(pool / victims.length) : Math.floor(pool / victims.length); });
    if (pr.success) for (const id of victims) { room.countries[id].stock.food += 4; room.countries[id].stock.water += 4; }
  }
  const who = pr.joined.map(cname).join(', ') || '없음';
  if (pr.success) {
    if (pr.id === 'water') for (const id of aliveIds(room)) room.countries[id].prod.water += 1;
    if (pr.id === 'energy') for (const id of aliveIds(room)) { room.countries[id].prod.energy += 1; idx(room.countries[id], 'env', 3); }
    addNews(room, now, `${def.name} 성공!`, `${def.success}. 참여국: ${who}`, 'good');
    addAgreement(room, def.name, pr.joined, `${pr.joined.length}개국 참여 — ${def.success}`);
  } else {
    addNews(room, now, `${def.name} 실패`, `${needN}개국이 필요했지만 ${pr.joined.length}개국만 참여했습니다.${pr.id === 'relief' ? ' 모인 돈만 피해국에 전달되었습니다.' : ' 낸 돈은 돌려받지 못합니다.'}`, 'bad');
  }
  addLog(room, now, 'project', `${def.name}: ${pr.joined.length}개국 참여(${who}) — ${pr.success ? '성공' : '실패'}`);
  room.projectResults[pr.id] = { joined: pr.joined.length, success: pr.success };
  room.project = null;
}

function resolveDispute(room: Room, now: number) {
  const d = room.dispute;
  if (!d || d.result) return;
  const [a, b] = d.parties;
  const sa = d.stances[a], sb = d.stances[b];
  const A = room.countries[a], B = room.countries[b];
  const med = d.mediators.length;
  if (!sa || !sb) {
    d.result = 'unresolved';
    for (const c of [A, B]) idx(c, 'trust', -5);
    d.resultText = '두 나라가 입장을 정하지 못해 분쟁이 해결되지 않았습니다. 양국 신뢰도 −5.';
    addNews(room, now, '미르강 분쟁 미해결', d.resultText, 'bad');
  } else if (sa !== 'unilateral' && sb !== 'unilateral') {
    d.result = 'peace';
    for (const c of [A, B]) idx(c, 'trust', 8);
    for (const c of [A, B]) c.prod.water += 2; // 강을 함께 관리해 두 나라 모두 물을 더 얻음
    if (med >= 2) for (const m of d.mediators) idx(room.countries[m], 'trust', 2);
    d.resultText = `평화적으로 해결되었습니다. 강을 함께 관리해 두 나라의 물 생산이 +2씩 늘어납니다. 양국 신뢰도 +8.${med >= 2 ? ` 중재국(${d.mediators.map(cname).join(', ')}) 신뢰도 +2 추가.` : ''}`;
    addAgreement(room, '미르강 공동 관리 협정', [a, b, ...d.mediators], d.resultText);
    addNews(room, now, '미르강 분쟁, 평화적 해결', d.resultText, 'good');
  } else if (sa === 'unilateral' && sb === 'unilateral') {
    d.result = 'both';
    for (const c of [A, B]) { idx(c, 'trust', -15); gain(c, 'water', -6); }
    d.resultText = '두 나라 모두 혼자 밀어붙여 갈등이 커졌습니다. 양국 신뢰도 −15, 물 −6.';
    addNews(room, now, '미르강 분쟁 격화', d.resultText, 'bad');
  } else {
    d.result = 'one';
    const [actor, victim] = sa === 'unilateral' ? [A, B] : [B, A];
    const loss = med >= 2 ? 3 : 6;
    gain(actor, 'water', 10); idx(actor, 'trust', -15);
    gain(victim, 'water', -loss); idx(victim, 'trust', 3);
    d.resultText = `${cname(actor.id)}가 혼자 밀어붙였습니다. ${cname(actor.id)} 물 +10·신뢰도 −15, ${cname(victim.id)} 물 −${loss}${med >= 2 ? ' (중재국들의 조정으로 피해 절반)' : ''}.`;
    addNews(room, now, '미르강 분쟁, 일방적 조치로 얼룩', d.resultText, 'bad');
  }
  addLog(room, now, 'dispute', d.resultText!);
}

function resolveTreaty(room: Room, now: number) {
  const t = room.treaty;
  if (!t || t.result) return;
  const tally = tallyTreaty(room);
  t.result = { adopted: tally.adopted, clauses: tally.clauses };
  if (!tally.adopted) {
    for (const id of aliveIds(room)) idx(room.countries[id], 'trust', -3);
    addNews(room, now, '세계 평화 협약 채택 무산', `합의된 조항이 ${tally.included}개뿐이어서 협약이 채택되지 못했습니다. 모든 나라 신뢰도 −3.`, 'bad');
    addLog(room, now, 'treaty', `세계 평화 협약 무산 (합의 조항 ${tally.included}개)`);
    return;
  }
  // 채택된 조항은 그 조항에 찬성한 나라에만 적용
  const on = (id: string) => (tally.clauses[id] ? tally.yes[id].map((c) => room.countries[c]) : []);
  for (const c of on('climate')) { gain(c, 'eco', -3); idx(c, 'env', 5); }
  for (const c of on('coop')) for (const k of VITALS) gain(c, k, 2);
  for (const c of on('peace')) idx(c, 'trust', 4);
  for (const c of on('sdg')) { gain(c, 'eco', -2); idx(c, 'env', 2); idx(c, 'trust', 2); }
  const sup = on('support');
  if (sup.length) {
    const donors = sup.filter((c) => c.id !== 'NOV' && c.id !== 'OCE').sort((x, y) => y.stock.eco - x.stock.eco).slice(0, 3);
    const rec = (['OCE', 'NOV'] as CountryId[]).filter((id) => isAlive(room, id));
    if (rec.length) {
      let pool = 0;
      for (const c of donors) { const v = Math.min(4, c.stock.eco); c.stock.eco -= v; pool += v; idx(c, 'trust', 2); }
      rec.forEach((id, i) => { room.countries[id].stock.eco += i === 0 ? Math.ceil(pool / rec.length) : Math.floor(pool / rec.length); });
    }
  }
  for (const cl of CLAUSES) if (tally.clauses[cl.id]) for (const id of tally.yes[cl.id]) idx(room.countries[id], 'trust', 2);
  const names = CLAUSES.filter((c) => tally.clauses[c.id]).map((c) => c.name).join(', ');
  const parties = aliveIds(room).filter((id) => CLAUSES.some((cl) => tally.clauses[cl.id] && tally.yes[cl.id].includes(id)));
  addAgreement(room, '세계 평화 협약', parties, `채택 조항 ${tally.included}개: ${names}`);
  addNews(room, now, '세계 평화 협약 채택!', `채택 조항 ${tally.included}개: ${names}`, 'good');
  addLog(room, now, 'treaty', `세계 평화 협약 채택 — ${names}`);
}

// ───────────────────────── 거래 처리 ─────────────────────────
function needy(c: CountryState, k: Res): boolean {
  return k === 'eco' ? c.stock.eco < 10 : c.stock[k] < c.need[k];
}

function executeTrade(room: Room, p: Proposal, now: number) {
  const from = room.countries[p.from], to = room.countries[p.to];
  need(from.diedRound === null && to.diedRound === null, '멸망한 나라와는 거래할 수 없습니다.');
  need(canPay(from, p.give), `${cname(p.from)}의 자원이 부족해 거래를 체결할 수 없습니다.`);
  need(canPay(to, p.take), `${cname(p.to)}의 자원이 부족해 거래를 체결할 수 없습니다.`);
  const gSum = bundleSum(p.give), tSum = bundleSum(p.take);
  const oneWay = gSum === 0 || tSum === 0;
  let aidUnits = 0;
  if (oneWay) {
    const [giver, rec, b] = gSum > 0 ? [from, to, p.give] : [to, from, p.take];
    for (const k of RES) if (b[k] && needy(rec, k)) aidUnits += b[k]!;
    const t = Math.min(6 - giver.roundTrust.aid, Math.ceil(aidUnits / 3));
    if (t > 0) { idx(giver, 'trust', t); giver.roundTrust.aid += t; }
  }
  pay(from, p.give); receive(to, p.give);
  pay(to, p.take); receive(from, p.take);
  from.trades += 1; to.trades += 1;
  if (!oneWay) {
    if (gSum + tSum >= 3) for (const c of [from, to]) if (c.roundTrust.trade < 3) { idx(c, 'trust', 1); c.roundTrust.trade += 1; }
    for (const c of [from, to]) if (c.id === 'OCE' && c.hubBonus < 4) { c.stock.eco += 1; c.hubBonus += 1; }
  }
  const text = oneWay
    ? gSum > 0 ? `${cname(p.from)} → ${cname(p.to)} 지원: ${fmtBundle(p.give)}` : `${cname(p.to)} → ${cname(p.from)} 지원(요청 수락): ${fmtBundle(p.take)}`
    : `${cname(p.from)} ⇄ ${cname(p.to)} 거래: ${fmtBundle(p.give)} ↔ ${fmtBundle(p.take)}`;
  addLog(room, now, 'trade', text + (aidUnits > 0 ? ' (인도적 지원 인정)' : ''));
  if (aidUnits >= 5) addNews(room, now, '인도적 지원 전달', text, 'good');
}

// ───────────────────────── 명령 ─────────────────────────
type Cmd = (room: Room, ctx: Ctx, a: Record<string, unknown>) => void;

export const commands: Record<string, Cmd> = {
  // ── 교사 ──
  start(room, ctx) {
    requireTeacher(ctx);
    need(room.phase === 'lobby', '이미 시작된 게임입니다.');
    beginRound(room, 1, ctx.now);
  },
  pause(room, ctx) {
    requireTeacher(ctx);
    need(room.phase === 'running', '진행 중일 때만 일시정지할 수 있습니다.');
    room.remainingMs = Math.max(0, (room.endsAt ?? ctx.now) - ctx.now);
    room.endsAt = null;
    room.phase = 'paused';
    addLog(room, ctx.now, 'teacher', '일시정지');
  },
  resume(room, ctx) {
    requireTeacher(ctx);
    need(room.phase === 'paused', '일시정지 상태가 아닙니다.');
    room.endsAt = ctx.now + (room.remainingMs ?? 0);
    room.remainingMs = null;
    room.phase = 'running';
    addLog(room, ctx.now, 'teacher', '재개');
  },
  endRound(room, ctx) {
    requireTeacher(ctx);
    need(room.phase === 'running' || room.phase === 'paused', '진행 중인 라운드가 없습니다.');
    endRound(room, ctx.now);
  },
  nextRound(room, ctx) {
    requireTeacher(ctx);
    need(room.phase === 'roundEnd', '라운드 결산 화면에서만 다음 라운드를 시작할 수 있습니다.');
    beginRound(room, room.round + 1, ctx.now);
  },
  addTime(room, ctx, a) {
    requireTeacher(ctx);
    const sec = Number(a.sec);
    need(Number.isFinite(sec) && Math.abs(sec) <= 3600, '시간 값이 올바르지 않습니다.');
    if (room.phase === 'running' && room.endsAt) room.endsAt = Math.max(ctx.now + 5000, room.endsAt + sec * 1000);
    else if (room.phase === 'paused') room.remainingMs = Math.max(5000, (room.remainingMs ?? 0) + sec * 1000);
    else fail('라운드 진행 중에만 시간을 조절할 수 있습니다.');
  },
  setDuration(room, ctx, a) {
    requireTeacher(ctx);
    const sec = Number(a.sec);
    need(Number.isInteger(sec) && sec >= 60 && sec <= 3600, '라운드 시간은 1~60분으로 설정하세요.');
    room.durationSec = sec;
  },
  triggerEvent(room, ctx, a) {
    requireTeacher(ctx);
    need(room.phase === 'running' || room.phase === 'paused', '라운드 진행 중에만 사건을 발동할 수 있습니다.');
    const ev = TEACHER_EVENTS.find((e) => e.id === a.id) ?? fail('알 수 없는 사건입니다.');
    const all = aliveIds(room).map((id) => room.countries[id]);
    if (ev.id === 'pandemic') for (const c of all) gain(c, 'eco', -4);
    if (ev.id === 'harvest') for (const c of all) gain(c, 'food', 4);
    if (ev.id === 'oilshock') for (const c of all) if (c.id !== 'SOL') gain(c, 'energy', -3);
    if (ev.id === 'devconf') { if (isAlive(room, 'NOV')) gain(room.countries.NOV, 'eco', 6); for (const c of all) idx(c, 'trust', 1); }
    if (ev.id === 'peaceday') for (const c of all) idx(c, 'trust', 2);
    addNews(room, ctx.now, `[국제 사건] ${ev.title}`, `${ev.body} (게임 속 가상 사건)`, ev.tone);
    addLog(room, ctx.now, 'event', `교사 발동 사건: ${ev.title}`);
    refreshPeace(room);
  },
  setDelegate(room, ctx, a) {
    requireTeacher(ctx);
    const p = room.players[String(a.pid)] ?? fail('참가자를 찾을 수 없습니다.');
    room.countries[p.country].delegate = p.id;
    addLog(room, ctx.now, 'teacher', `${cname(p.country)} 대표를 ${p.nick}(으)로 지정`, p.country);
  },
  removePlayer(room, ctx, a) {
    requireTeacher(ctx);
    const p = room.players[String(a.pid)] ?? fail('참가자를 찾을 수 없습니다.');
    delete room.players[p.id];
    for (const [tok, pid] of Object.entries(room.sessions)) if (pid === p.id) delete room.sessions[tok];
    const c = room.countries[p.country];
    if (c.delegate === p.id) c.delegate = Object.values(room.players).find((x) => x.country === p.country)?.id ?? null;
  },
  adjust(room, ctx, a) {
    requireTeacher(ctx);
    need(isCountry(a.country), '국가를 선택하세요.');
    const c = room.countries[a.country as CountryId];
    const key = String(a.key);
    const delta = Number(a.delta);
    need(Number.isInteger(delta) && Math.abs(delta) <= 100, '조정 값이 올바르지 않습니다.');
    if ((RES as string[]).includes(key)) gain(c, key as Res, delta);
    else if (['env', 'trust'].includes(key)) idx(c, key as 'env', delta);
    else if (key === 'lives') {
      c.lives = Math.max(0, Math.min(START_LIVES, c.lives + delta));
      if (c.lives > 0) c.diedRound = null; else if (c.diedRound === null) c.diedRound = Math.max(1, room.round);
    }
    else fail('조정할 항목이 올바르지 않습니다.');
    addLog(room, ctx.now, 'teacher', `교사 수동 조정: ${cname(c.id)} ${key} ${delta > 0 ? '+' : ''}${delta}`, c.id);
    refreshPeace(room);
  },
  reset(room, ctx) {
    requireTeacher(ctx);
    resetRoom(room, ctx.now);
  },

  // ── 학생: 대표 권한 ──
  claimDelegate(room, ctx) {
    need(ctx.pid && ctx.country, '참가자만 가능합니다.');
    const c = room.countries[ctx.country!];
    const cur = c.delegate ? room.players[c.delegate] : null;
    need(!cur || !cur.online, '현재 대표가 접속 중입니다. 대표가 권한을 넘겨주거나 선생님이 지정할 수 있습니다.');
    c.delegate = ctx.pid!;
    addLog(room, ctx.now, 'system', `${cname(c.id)} 대표 변경: ${room.players[ctx.pid!].nick}`, c.id);
  },
  passDelegate(room, ctx, a) {
    const c = requireDelegate(room, ctx);
    const p = room.players[String(a.pid)];
    need(p && p.country === c.id, '같은 국가의 참가자에게만 넘길 수 있습니다.');
    c.delegate = p.id;
    addLog(room, ctx.now, 'system', `${cname(c.id)} 대표 변경: ${p.nick}`, c.id);
  },

  // ── 학생: 정책 카드 (라운드마다 1장) ──
  policy(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireActive(room, ctx);
    const def = POLICIES.find((x) => x.id === a.id) ?? fail('알 수 없는 정책 카드입니다.');
    need(!c.policy, '이번 라운드의 정책 카드는 이미 골랐습니다. (라운드마다 1장)');
    const cost = policyCost(c.id, def);
    need(c.stock.eco >= cost, `돈이 부족합니다. (${cost} 필요)`);
    let pick: Vital | undefined;
    if (def.pick) pick = def.pick.find((k) => k === a.pick) ?? fail('대상 자원을 고르세요.');
    if (def.id === 'invest') { need(!c.invested.includes(pick!), `${RES_INFO[pick!].name}에는 이미 「생산 늘리기」를 썼습니다. (자원마다 한 번)`); c.invested.push(pick!); }
    c.stock.eco -= cost;
    c.policy = { id: def.id, pick };
    let result = '';
    switch (def.id) {
      case 'invest': {
        const v = investGain(c.id);
        c.prod[pick!] += v;
        idx(c, 'env', -3);
        result = `${RES_INFO[pick!].name} 생산 +${v}, 환경 −3`; break;
      }
      case 'green': idx(c, 'env', 8); result = '환경 +8'; break;
      case 'emergency': c.stock[pick!] += 2; result = `${RES_INFO[pick!].name} +2`; break;
    }
    addLog(room, ctx.now, 'action', `정책 「${def.name}」${pick ? `(${RES_INFO[pick].name})` : ''} — ${result}`, c.id);
    refreshPeace(room);
  },

  // ── 학생: 사건 카드 — 공동 대응 참여 (1·2·4라운드) ──
  joinProject(room, ctx) {
    requireRunning(room, ctx.now);
    const c = requireActive(room, ctx);
    const pr = room.project ?? fail('이번 라운드에는 공동 대응이 없습니다.');
    const def = ROUNDS[pr.round].project!;
    need(!def.victims?.includes(c.id), '피해를 입은 나라는 도움을 받는 쪽입니다.');
    need(!pr.joined.includes(c.id), '이미 참여했습니다.');
    need(c.stock.eco >= def.cost, `돈이 부족합니다. (${def.cost} 필요)`);
    c.stock.eco -= def.cost;
    pr.joined.push(c.id);
    idx(c, 'trust', pr.id === 'relief' ? 4 : 3);
    addLog(room, ctx.now, 'project', `${def.name} 참여 (돈 ${def.cost}) — ${pr.joined.length}/${projectInfo(room).need}개국`, c.id);
    refreshPeace(room);
  },

  // ── 학생: 외교 (자원 거래·지원) ──
  propose(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireActive(room, ctx);
    need(isCountry(a.to) && a.to !== c.id, '상대 국가를 선택하세요.');
    need(isAlive(room, a.to as CountryId), '멸망한 나라와는 거래할 수 없습니다.');
    need(room.proposals.filter((p) => p.from === c.id && p.status === 'pending').length < 5, '대기 중인 제안이 너무 많습니다. (최대 5건) 기존 제안을 취소하세요.');
    const memo = String(a.memo ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const give = cleanBundle(a.give), take = cleanBundle(a.take);
    need(bundleSum(give) + bundleSum(take) > 0, '주거나 받을 자원을 1 이상 입력하세요.');
    need(canPay(c, give), '제안한 만큼의 자원을 가지고 있지 않습니다.');
    room.proposals.push({ id: `p${++room.seq}`, from: c.id, to: a.to as CountryId, give, take, memo, status: 'pending', round: room.round, t: ctx.now });
    addLog(room, ctx.now, 'trade', `${cname(c.id)} → ${cname(a.to as CountryId)} 제안: 줌 [${fmtBundle(give)}] / 받음 [${fmtBundle(take)}]`, c.id);
    if (room.proposals.length > 300) room.proposals.splice(0, room.proposals.length - 300);
  },
  respond(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireActive(room, ctx);
    const p = room.proposals.find((x) => x.id === a.id) ?? fail('제안을 찾을 수 없습니다.');
    need(p.status === 'pending', '이미 처리된 제안입니다.');
    need(p.round === room.round, '지난 라운드의 제안입니다.');
    if (a.action === 'cancel') {
      need(p.from === c.id, '제안한 국가만 취소할 수 있습니다.');
      p.status = 'cancelled';
    } else if (a.action === 'reject') {
      need(p.to === c.id, '제안받은 국가만 거절할 수 있습니다.');
      p.status = 'rejected';
      addLog(room, ctx.now, 'trade', `${cname(c.id)}가 ${cname(p.from)}의 제안을 거절`, c.id);
    } else if (a.action === 'accept') {
      need(p.to === c.id, '제안받은 국가만 승인할 수 있습니다.');
      // 검증 실패 시 예외가 발생하며 어떤 자원도 이동하지 않음 (원자적 처리)
      executeTrade(room, p, ctx.now);
      p.status = 'accepted';
    } else fail('알 수 없는 응답입니다.');
    p.doneT = ctx.now;
    refreshPeace(room);
  },

  // ── 학생: 사건 카드 — 3라운드 분쟁 ──
  stance(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireActive(room, ctx);
    const d = room.dispute ?? fail('지금은 분쟁 상황이 아닙니다.');
    need(d.parties.includes(c.id), '분쟁 당사국만 입장을 정할 수 있습니다.');
    need(!d.stances[c.id], '이미 입장을 확정했습니다.');
    const s = String(a.stance) as Stance;
    need(['negotiate', 'mediate', 'unilateral'].includes(s), '입장을 선택하세요.');
    d.stances[c.id] = s;
    addLog(room, ctx.now, 'dispute', `${cname(c.id)} 입장 확정 (라운드 종료 시 공개)`, c.id);
  },
  mediate(room, ctx) {
    requireRunning(room, ctx.now);
    const c = requireActive(room, ctx);
    const d = room.dispute ?? fail('지금은 분쟁 상황이 아닙니다.');
    need(!d.parties.includes(c.id), '당사국은 중재국이 될 수 없습니다.');
    need(!d.mediators.includes(c.id), '이미 중재에 참여했습니다.');
    d.mediators.push(c.id);
    idx(c, 'trust', 3);
    addLog(room, ctx.now, 'dispute', `${cname(c.id)} 중재 참여 — 신뢰도 +3`, c.id);
    refreshPeace(room);
  },

  // ── 학생: 사건 카드 — 5라운드 협약 투표 ──
  treatyVote(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireActive(room, ctx);
    const t = room.treaty ?? fail('협약은 5라운드에 논의합니다.');
    need(CLAUSES.some((cl) => cl.id === a.clause), '조항을 찾을 수 없습니다.');
    need(typeof a.yes === 'boolean', '찬성 또는 반대를 선택하세요.');
    (t.votes[c.id] ??= {})[String(a.clause)] = a.yes as boolean;
  },

  // ── 멸망한 나라: 국제 구호단 — 라운드마다 살아 있는 한 나라에 자원 지원 ──
  relief(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireDelegate(room, ctx);
    need(c.diedRound !== null, '국제 구호단(멸망한 나라)만 할 수 있습니다.');
    need(!c.reliefDone, '이번 라운드의 구호 지원은 이미 보냈습니다. (라운드마다 한 번)');
    need(isCountry(a.to) && isAlive(room, a.to as CountryId), '살아 있는 나라를 고르세요.');
    const res = VITALS.find((k) => k === a.res) ?? fail('지원할 자원을 고르세요.');
    c.reliefDone = true;
    room.countries[a.to as CountryId].stock[res] += RELIEF_AMOUNT;
    addLog(room, ctx.now, 'relief', `국제 구호단(${cname(c.id)}) → ${cname(a.to as CountryId)}: ${RES_INFO[res].name} ${RELIEF_AMOUNT} 지원`, c.id);
    addNews(room, ctx.now, `국제 구호단, ${cname(a.to as CountryId)}에 ${RES_INFO[res].name} 지원`, `멸망한 ${cname(c.id)}의 대표단이 구호단으로서 ${RES_INFO[res].name} ${RELIEF_AMOUNT}을(를) 전달했습니다.`, 'good');
  },

  // ── 학생: 퀴즈 (모든 참가자) ──
  quiz(room, ctx, a) {
    need(ctx.pid && ctx.country, '참가자만 가능합니다.');
    need(room.round >= 1, '게임이 시작되면 풀 수 있습니다.');
    const rd = room.round;
    const ans = (room.quizAnswers[rd] ??= {});
    need(!(ctx.pid! in ans), '이미 답을 제출했습니다.');
    const choice = Number(a.choice);
    need(Number.isInteger(choice) && choice >= 0 && choice <= 3, '보기를 선택하세요.');
    ans[ctx.pid!] = choice;
    const st = (room.quizStats[rd] ??= { answered: 0, correct: 0 });
    st.answered++;
    if (choice === QUIZZES[rd]?.answer) {
      st.correct++;
      const c = room.countries[ctx.country!];
      if (!c.quizBonus.includes(rd) && room.phase === 'running' && c.diedRound === null) {
        c.quizBonus.push(rd);
        c.stock.eco += 3;
        addLog(room, ctx.now, 'system', `퀴즈 정답 보너스: 돈 +3`, c.id);
      }
    }
  },
};

/** 제한 시간이 지나면 서버가 자동으로 라운드를 종료 */
export function tick(room: Room, now: number): boolean {
  if (room.phase === 'running' && room.endsAt !== null && now >= room.endsAt) {
    endRound(room, now);
    return true;
  }
  return false;
}

export function joinRoom(room: Room, country: CountryId, pid: string, nick: string, now: number) {
  const members = Object.values(room.players).filter((p) => p.country === country);
  need(members.length < 12, '이 국가는 정원이 가득 찼습니다. 선생님께 문의하세요.');
  const clean = nick.replace(/\s+/g, ' ').trim().slice(0, 10) || `대표단 ${members.length + 1}`;
  room.players[pid] = { id: pid, nick: clean, country, online: false };
  const c = room.countries[country];
  if (!c.delegate || !room.players[c.delegate]) c.delegate = pid;
  addLog(room, now, 'system', `${cname(country)} 대표단 입장: ${clean}`, country);
}
