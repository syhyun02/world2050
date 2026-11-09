// WORLD 2050 — 게임 엔진. 모든 규칙은 이 파일에서 서버가 검증·실행합니다.
// 클라이언트는 같은 파일의 순수 계산 함수(평화 지수, 협약 집계 등)만 화면 표시용으로 사용합니다.
import {
  ACTIONS, BASE_AP, CLAUSES, COUNTRIES, COUNTRY_IDS, DISPUTE_PARTIES, PACTS, RES, RES_INFO, ROUNDS,
  SURVIVAL_HAPPY, TEACHER_EVENTS, TOTAL_ROUNDS, TREATY_RULES, VITALS, WIN_PEACE, fmtBundle,
} from './data';
import { QUIZZES } from './content';
import {
  GameError, type ClauseLevel, type CountryId, type CountryState, type Ctx, type LogEntry, type MeInfo, type News,
  type PactType, type Proposal, type PublicRoom, type Res, type ResBundle, type Results, type Room, type Stance, type Vital,
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
    happy: d.happy, env: d.env, trust: d.trust, ap: 0, used: [], usedOnce: [], adapted: false,
    shortages: {}, contrib: 0, roundTrust: { trade: 0, aid: 0, project: 0 }, hubBonus: 0, quizBonus: [],
    delegate: null,
    history: [{ round: 0, stock: { ...d.stock }, happy: d.happy, env: d.env, trust: d.trust, shortages: [] }],
  };
}

export function newRoom(code: string, className: string, durationSec: number, joinCodes: Record<CountryId, string>, now: number): Room {
  const countries = {} as Record<CountryId, CountryState>;
  for (const id of COUNTRY_IDS) countries[id] = newCountry(id);
  const room: Room = {
    code, className, createdAt: now, phase: 'lobby', round: 0, durationSec, endsAt: null, remainingMs: null,
    countries, players: {}, proposals: [], agreements: [], pactKeys: [], recurring: [], news: [], log: [],
    project: null, pastProjects: [], dispute: null, treaty: null, coop: 30, coopRound: { trade: 0, aid: 0, pact: 0 },
    peace: 0, peaceHistory: [], severity: 1, reliefPct: 0, results: null, quizStats: {}, seq: 0,
    joinCodes, sessions: {}, quizAnswers: {}, reflections: {},
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

export function publicView(room: Room): PublicRoom {
  const { joinCodes, sessions, quizAnswers, reflections, ...pub } = room;
  return pub;
}

export function meView(room: Room, pid: string): MeInfo | null {
  const p = room.players[pid];
  if (!p) return null;
  const quiz: Record<number, number> = {};
  for (const [rd, ans] of Object.entries(room.quizAnswers)) if (pid in ans) quiz[Number(rd)] = ans[pid];
  return { pid, country: p.country, quiz, reflections: room.reflections[p.country] ?? {} };
}

// ───────────────────────── 공용 계산 ─────────────────────────
export function calcPeace(room: Pick<Room, 'countries' | 'coop'>) {
  const cs = COUNTRY_IDS.map((id) => room.countries[id]);
  const avg = (f: (c: CountryState) => number) => cs.reduce((s, c) => s + f(c), 0) / cs.length;
  const trust = avg((c) => c.trust);
  const happy = avg((c) => c.happy);
  const env = avg((c) => c.env);
  const hs = cs.map((c) => c.happy);
  const gap = Math.max(...hs) - Math.min(...hs);
  const equity = clamp(100 - 2 * gap);
  const coop = clamp(room.coop);
  const value = clamp(0.3 * trust + 0.25 * happy + 0.15 * env + 0.15 * equity + 0.15 * coop);
  return { value, trust: Math.round(trust), happy: Math.round(happy), env: Math.round(env), equity, coop, gap };
}

/** 지금 부족한(진행 중) 또는 이번 라운드에 부족했던(결산 후) 필수 자원 */
export function lacking(room: Pick<Room, 'countries' | 'phase' | 'round'>, id: CountryId): Vital[] {
  const c = room.countries[id];
  if (room.phase === 'running' || room.phase === 'paused') return VITALS.filter((k) => c.stock[k] < c.need[k]);
  return c.shortages[room.round] ?? [];
}

export function avgEnv(room: Pick<Room, 'countries'>): number {
  return COUNTRY_IDS.reduce((s, id) => s + room.countries[id].env, 0) / COUNTRY_IDS.length;
}

/** 협약 조항별 채택 수준과 비준 현황을 집계 (진행 중에도 잠정 결과 표시용으로 사용) */
export function tallyTreaty(room: Pick<Room, 'treaty'>) {
  const t = room.treaty;
  const clauses: Record<string, ClauseLevel> = {};
  const counts: Record<string, { strong: number; base: number; none: number }> = {};
  for (const cl of CLAUSES) {
    let strong = 0, base = 0;
    for (const id of COUNTRY_IDS) {
      const lv = t?.choices[id]?.[cl.id] ?? 'none';
      if (lv === 'strong') strong++; else if (lv === 'base') base++;
    }
    counts[cl.id] = { strong, base, none: 6 - strong - base };
    clauses[cl.id] = strong >= TREATY_RULES.clauseVotes ? 'strong' : strong + base >= TREATY_RULES.clauseVotes ? 'base' : 'none';
  }
  const yes = COUNTRY_IDS.filter((id) => t?.ratify[id] === 'yes');
  const no = COUNTRY_IDS.filter((id) => t?.ratify[id] === 'no');
  const included = Object.values(clauses).filter((l) => l !== 'none').length;
  const adopted = yes.length >= TREATY_RULES.ratifyVotes && included >= TREATY_RULES.minClauses;
  return { clauses, counts, yes, no, included, adopted };
}

export function isSurviving(c: CountryState, finalRound = TOTAL_ROUNDS): boolean {
  return c.happy >= SURVIVAL_HAPPY && (c.shortages[finalRound]?.length ?? 0) === 0;
}

export function calcResults(room: Room): Results {
  const countries = {} as Results['countries'];
  for (const id of COUNTRY_IDS) {
    const c = room.countries[id];
    const d = COUNTRIES[id];
    const shortageCount = Object.values(c.shortages).reduce((s, a) => s + a.length, 0);
    const ecoBase = d.stock.eco + 3 * d.prod.eco;
    const ecoNow = c.stock.eco + 3 * c.prod.eco;
    const survival = Math.max(0, 15 - 3 * shortageCount) + Math.min(10, Math.round((ecoNow / ecoBase) * 7));
    const happy = Math.round(c.happy * 0.2);
    const env = Math.round(c.env * 0.2);
    const trust = Math.round(c.trust * 0.2);
    const contrib = Math.min(15, Math.round(c.contrib / (3 * d.capacity)));
    countries[id] = { survival, happy, env, trust, contrib, total: survival + happy + env + trust + contrib, survived: isSurviving(c), shortageCount };
  }
  const p = calcPeace(room);
  const hs0 = COUNTRY_IDS.map((id) => COUNTRIES[id].happy);
  const survivors = COUNTRY_IDS.filter((id) => countries[id].survived).length;
  const tr = room.treaty?.result;
  const outcome: Results['outcome'] = survivors === 6 && p.value >= WIN_PEACE ? 'win' : survivors >= 4 && p.value >= 50 ? 'partial' : 'crisis';
  return {
    countries,
    world: {
      peace: p.value, peaceStart: room.peaceHistory[0]?.value ?? p.value,
      gapStart: Math.max(...hs0) - Math.min(...hs0), gapEnd: p.gap, reliefPct: room.reliefPct,
      treatyAdopted: !!tr?.adopted, treatyClauses: tr?.adopted ? Object.values(tr.clauses).filter((l) => l !== 'none').length : 0,
      agreements: room.agreements.length, survivors,
    },
    outcome,
  };
}

// ───────────────────────── 내부 도우미 ─────────────────────────
function addLog(room: Room, t: number, type: LogEntry['type'], text: string, country?: CountryId) {
  room.log.push({ t, round: room.round, type, text, country });
  if (room.log.length > 600) room.log.splice(0, room.log.length - 600);
}
function addNews(room: Room, t: number, title: string, body: string, tone: News['tone'] = 'info') {
  room.news.push({ id: `n${++room.seq}`, t, round: room.round, title, body, tone });
  if (room.news.length > 80) room.news.splice(0, room.news.length - 80);
}
function addAgreement(room: Room, title: string, parties: CountryId[], text: string) {
  room.agreements.push({ id: `a${++room.seq}`, round: room.round, title, parties, text });
}
function refreshPeace(room: Room) { room.peace = calcPeace(room).value; }
function addCoop(room: Room, v: number) { room.coop = clamp(room.coop + v); }
function idx(c: CountryState, k: 'happy' | 'env' | 'trust', v: number) { c[k] = clamp(c[k] + v); }
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
function requireTeacher(ctx: Ctx) { need(ctx.teacher, '교사 권한이 필요합니다.'); }

// ───────────────────────── 라운드 진행 ─────────────────────────
function beginRound(room: Room, n: number, now: number) {
  const def = ROUNDS[n];
  room.round = n;
  room.phase = 'running';
  room.endsAt = now + room.durationSec * 1000;
  room.remainingMs = null;
  room.coopRound = { trade: 0, aid: 0, pact: 0 };
  room.project = null;
  room.dispute = null;
  for (const id of COUNTRY_IDS) {
    const c = room.countries[id];
    c.ap = BASE_AP;
    c.used = [];
    c.roundTrust = { trade: 0, aid: 0, project: 0 };
    c.hubBonus = 0;
    for (const k of RES) c.stock[k] += Math.round(c.prod[k] * (def.prodMult[k] ?? 1));
  }
  addNews(room, now, def.headline, def.body, n === 5 ? 'info' : 'bad');
  addLog(room, now, 'event', `ROUND ${n} 시작 — ${def.crisis}`);

  // 정기 이행 협정 (예: 미르강 공동 관리 협정)
  for (const rc of room.recurring.filter((x) => x.until >= n)) {
    const from = room.countries[rc.from], to = room.countries[rc.to];
    const amt = Math.min(rc.amt, from.stock[rc.res]);
    from.stock[rc.res] -= amt;
    to.stock[rc.res] += amt;
    addLog(room, now, 'pact', `${rc.label}: ${cname(rc.from)} → ${cname(rc.to)} ${RES_INFO[rc.res].name} ${amt}`);
  }

  if (def.project) room.project = { round: n, id: def.project.id, target: def.project.target, contributions: {}, total: 0 };
  if (n === 3) room.dispute = { parties: DISPUTE_PARTIES, stances: {}, mediators: [] };
  if (n === 4) applyDisaster(room, now);
  if (n === 5) room.treaty = { choices: {}, ratify: {}, notes: {} };
  refreshPeace(room);
}

function applyDisaster(room: Room, now: number) {
  const e = avgEnv(room);
  const sev = e < 45 ? 1.3 : e >= 60 ? 0.8 : 1;
  room.severity = sev;
  const hit = (id: CountryId, d: { food: number; water: number; eco: number; happy: number }) => {
    const c = room.countries[id];
    const m = sev * (c.adapted ? 0.5 : 1);
    gain(c, 'food', -d.food * m); gain(c, 'water', -d.water * m); gain(c, 'eco', -d.eco * m);
    idx(c, 'happy', -d.happy * m);
    addLog(room, now, 'event', `${cname(id)} 재난 피해 (피해 배율 ×${m.toFixed(2)}${c.adapted ? ', 기후 적응 인프라로 절반 감소' : ''})`, id);
  };
  hit('OCE', { food: 8, water: 6, eco: 8, happy: 10 });
  hit('NOV', { food: 5, water: 0, eco: 4, happy: 5 });
  const g = room.countries.GRN;
  gain(g, 'food', -4 * sev * (g.adapted ? 0.5 : 1));
  const txt = sev > 1 ? '세계 환경 지수가 낮아 재난 피해가 30% 커졌습니다.' : sev < 1 ? '각국의 환경 정책 덕분에 재난 피해가 20% 줄었습니다.' : '세계 환경 지수가 보통 수준이어서 피해 규모는 예측대로였습니다.';
  addNews(room, now, '재난 피해 규모 발표', txt, sev > 1 ? 'bad' : 'info');
}

function endRound(room: Room, now: number) {
  const n = room.round;
  for (const p of room.proposals) if (p.status === 'pending') { p.status = 'expired'; p.doneT = now; }
  resolveProject(room, now);
  if (n === 3) resolveDispute(room, now);
  if (n === 5) resolveTreaty(room, now);

  // 소비와 부족 판정
  for (const id of COUNTRY_IDS) {
    const c = room.countries[id];
    const short: Vital[] = [];
    for (const k of VITALS) {
      if (c.stock[k] >= c.need[k]) c.stock[k] -= c.need[k];
      else {
        const lack = c.need[k] - c.stock[k];
        c.stock[k] = 0;
        short.push(k);
        idx(c, 'happy', -Math.min(12, Math.ceil(lack * 1.5)));
      }
    }
    c.shortages[n] = short;
    if (short.length === 0) idx(c, 'happy', 1);
    else addLog(room, now, 'system', `${cname(id)}: ${short.map((k) => RES_INFO[k].name).join('·')} 부족으로 국민 행복도 하락`, id);
    idx(c, 'env', COUNTRIES[id].envDrift);
    if (c.env < 30) idx(c, 'happy', -3);
  }
  if (avgEnv(room) < 45) {
    for (const id of COUNTRY_IDS) idx(room.countries[id], 'happy', -2);
    addNews(room, now, '기후 악화 경고', '세계 평균 환경 지수가 45 아래로 떨어져 모든 국가의 행복도가 2 하락했습니다.', 'bad');
  }
  const shortList = COUNTRY_IDS.filter((id) => room.countries[id].shortages[n].length > 0);
  if (shortList.length) addNews(room, now, `ROUND ${n} 결산: ${shortList.length}개국 자원 부족`, `${shortList.map(cname).join(', ')}에서 필수 자원이 부족했습니다.`, 'bad');
  else { addNews(room, now, `ROUND ${n} 결산: 모든 국가 필수 자원 확보`, '어떤 나라도 식량·물·에너지가 부족하지 않았습니다.', 'good'); addCoop(room, 4); }

  for (const id of COUNTRY_IDS) {
    const c = room.countries[id];
    c.ap = 0;
    c.history.push({ round: n, stock: { ...c.stock }, happy: c.happy, env: c.env, trust: c.trust, shortages: c.shortages[n] });
  }
  refreshPeace(room);
  room.peaceHistory.push({ round: n, label: `R${n}`, value: room.peace });
  room.endsAt = null;
  room.remainingMs = null;
  addLog(room, now, 'system', `ROUND ${n} 종료 — 세계 평화 지수 ${room.peace}`);
  if (n >= TOTAL_ROUNDS) {
    room.phase = 'finished';
    room.results = calcResults(room);
    const o = room.results.outcome;
    addNews(room, now, o === 'win' ? '세계 공동 승리!' : o === 'partial' ? '절반의 성공' : '위기는 계속된다',
      o === 'win' ? '모든 국가가 생존 조건을 달성했고 세계 평화 지수가 기준을 넘었습니다.' : '결과 화면에서 무엇이 부족했는지 함께 살펴보세요.', o === 'win' ? 'good' : 'info');
  } else room.phase = 'roundEnd';
}

function resolveProject(room: Room, now: number) {
  const pr = room.project;
  if (!pr) return;
  const def = ROUNDS[pr.round].project!;
  pr.success = pr.total >= pr.target;
  if (pr.id === 'relief') {
    // 모인 자원은 목표 달성 여부와 관계없이 피해국에 전달
    const pool: ResBundle = {};
    for (const b of Object.values(pr.contributions)) for (const k of RES) if (b?.[k]) pool[k] = (pool[k] ?? 0) + b[k]!;
    for (const k of RES) {
      const v = pool[k] ?? 0;
      const toOce = Math.round(v * 0.6);
      room.countries.OCE.stock[k] += toOce;
      room.countries.NOV.stock[k] += v - toOce;
    }
    room.reliefPct = Math.min(100, Math.round((pr.total / pr.target) * 100));
    if (pr.success) { idx(room.countries.OCE, 'happy', 6); idx(room.countries.NOV, 'happy', 6); }
  }
  if (pr.success) {
    if (pr.id === 'water') for (const id of COUNTRY_IDS) room.countries[id].prod.water += 2;
    if (pr.id === 'energy') for (const id of COUNTRY_IDS) { room.countries[id].prod.energy += 2; idx(room.countries[id], 'env', 3); }
    addCoop(room, 10);
    addNews(room, now, `${def.name} 목표 달성!`, `${def.success}. 참여국: ${Object.keys(pr.contributions).map((id) => cname(id as CountryId)).join(', ')}`, 'good');
    addAgreement(room, def.name, Object.keys(pr.contributions) as CountryId[], `공동 대응 성공 (${pr.total}/${pr.target}) — ${def.success}`);
  } else {
    addNews(room, now, `${def.name} 목표 미달`, `모금 ${pr.total}/${pr.target}. ${pr.id === 'relief' ? '모인 자원만 피해국에 전달되었습니다.' : '공동 대응의 효과를 얻지 못했습니다.'}`, 'bad');
  }
  addLog(room, now, 'project', `${def.name}: ${pr.total}/${pr.target} — ${pr.success ? '성공' : '미달'}`);
  room.pastProjects.push(pr);
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
    for (const c of [A, B]) { idx(c, 'trust', -5); idx(c, 'happy', -3); }
    d.resultText = '당사국이 입장을 정하지 못해 분쟁이 해결되지 않았습니다. 양국 신뢰도 −5, 행복도 −3.';
    addNews(room, now, '미르강 분쟁 미해결', d.resultText, 'bad');
  } else if (sa !== 'unilateral' && sb !== 'unilateral') {
    d.result = 'peace';
    for (const c of [A, B]) { idx(c, 'trust', 8); idx(c, 'happy', 3); }
    room.recurring.push({ from: 'GRN', to: 'SOL', res: 'water', amt: 4, until: 5, label: '미르강 공동 관리 협정' });
    room.recurring.push({ from: 'SOL', to: 'GRN', res: 'energy', amt: 4, until: 5, label: '미르강 공동 관리 협정' });
    addCoop(room, 10 + (med >= 2 ? 4 : 0));
    if (med >= 2) for (const m of d.mediators) idx(room.countries[m], 'trust', 2);
    d.resultText = `평화적으로 해결되었습니다. 남은 라운드 동안 그린벨트는 물 4, 솔라니아는 에너지 4를 매 라운드 서로 제공합니다. 양국 신뢰도 +8.${med >= 2 ? ` 중재국(${d.mediators.map(cname).join(', ')}) 신뢰도 +2 추가.` : ''}`;
    addAgreement(room, '미르강 공동 관리 협정', [a, b, ...d.mediators], d.resultText);
    addNews(room, now, '미르강 분쟁, 평화적 해결', d.resultText, 'good');
  } else if (sa === 'unilateral' && sb === 'unilateral') {
    d.result = 'both';
    for (const c of [A, B]) { idx(c, 'trust', -15); idx(c, 'happy', -5); gain(c, 'water', -4); }
    addCoop(room, -15);
    d.resultText = '양국 모두 일방적 조치를 강행해 갈등이 격화되었습니다. 양국 신뢰도 −15, 행복도 −5, 물 −4.';
    addNews(room, now, '미르강 분쟁 격화', d.resultText, 'bad');
  } else {
    d.result = 'one';
    const [actor, victim] = sa === 'unilateral' ? [A, B] : [B, A];
    const soften = med >= 2 ? 0.5 : 1;
    gain(actor, 'water', 10); idx(actor, 'trust', -15);
    idx(victim, 'happy', -6 * soften); gain(victim, 'water', -6 * soften); idx(victim, 'trust', 3);
    addCoop(room, -10);
    d.resultText = `${cname(actor.id)}가 일방적 조치를 강행했습니다. ${cname(actor.id)} 물 +10·신뢰도 −15, ${cname(victim.id)} 행복도·물 피해${med >= 2 ? ' (중재국들의 긴급 조정으로 피해 절반)' : ''}.`;
    addNews(room, now, '미르강 분쟁, 일방적 조치로 얼룩', d.resultText, 'bad');
  }
  addLog(room, now, 'dispute', d.resultText!);
}

function resolveTreaty(room: Room, now: number) {
  const t = room.treaty;
  if (!t || t.result) return;
  const tally = tallyTreaty(room);
  t.result = { adopted: tally.adopted, clauses: tally.clauses, yes: tally.yes, no: tally.no };
  if (!tally.adopted) {
    for (const id of COUNTRY_IDS) idx(room.countries[id], 'trust', -3);
    const why = tally.included < TREATY_RULES.minClauses ? `합의된 조항이 ${tally.included}개뿐` : `비준 찬성이 ${tally.yes.length}개국뿐`;
    addNews(room, now, '세계 평화 협약 채택 무산', `${why}이어서 협약이 채택되지 못했습니다. 모든 국가 신뢰도 −3.`, 'bad');
    addLog(room, now, 'treaty', `세계 평화 협약 부결 (${why})`);
    return;
  }
  const R = tally.yes.map((id) => room.countries[id]);
  const has = (id: CountryId) => tally.yes.includes(id);
  const lv = tally.clauses;
  if (lv.climate === 'base') for (const c of R) { gain(c, 'eco', -2); idx(c, 'env', 3); }
  if (lv.climate === 'strong') for (const c of R) { gain(c, 'eco', ['ARC', 'IND', 'SOL'].includes(c.id) ? -5 : -2); idx(c, 'env', 6); }
  if (lv.tech === 'base') for (const c of R) gain(c, 'tech', 2);
  if (lv.tech === 'strong') {
    for (const id of ['ARC', 'IND'] as CountryId[]) if (has(id)) gain(room.countries[id], 'tech', -4);
    for (const id of ['NOV', 'OCE', 'GRN'] as CountryId[]) if (has(id)) gain(room.countries[id], 'tech', 3);
    for (const c of R) idx(c, 'trust', 3);
  }
  if (lv.peace === 'base') for (const c of R) idx(c, 'trust', 3);
  if (lv.peace === 'strong') for (const c of R) { idx(c, 'trust', 5); gain(c, 'eco', -2); }
  if (lv.support !== 'none') {
    const strong = lv.support === 'strong';
    const donors = R.filter((c) => c.id !== 'NOV' && c.id !== 'OCE').sort((x, y) => y.stock.eco - x.stock.eco).slice(0, 3);
    let pool = 0;
    for (const c of donors) { const v = Math.min(strong ? 6 : 3, c.stock.eco); c.stock.eco -= v; pool += v; c.contrib += v; idx(c, 'trust', strong ? 4 : 2); }
    const rec = (['NOV', 'OCE'] as CountryId[]).filter(has).map((id) => room.countries[id]);
    rec.forEach((c, i) => { c.stock.eco += i === 0 ? Math.ceil(pool / rec.length) : Math.floor(pool / rec.length); if (strong) idx(c, 'happy', 4); });
  }
  if (lv.sdg === 'base') for (const c of R) idx(c, 'happy', 2);
  if (lv.sdg === 'strong') for (const c of R) { gain(c, 'eco', -3); idx(c, 'happy', 3); idx(c, 'env', 3); }
  for (const id of tally.no.concat(COUNTRY_IDS.filter((i) => !t.ratify[i]))) idx(room.countries[id], 'trust', -6);
  const strongN = Object.values(lv).filter((l) => l === 'strong').length;
  addCoop(room, 10 + 2 * tally.included + strongN);
  const text = CLAUSES.filter((c) => lv[c.id] !== 'none').map((c) => `${c.name}(${lv[c.id] === 'strong' ? '강화안' : '기본안'})`).join(', ');
  addAgreement(room, '세계 평화 협약', tally.yes, `채택 조항: ${text}`);
  addNews(room, now, '세계 평화 협약 채택!', `${tally.yes.length}개국 비준. ${text}`, 'good');
  addLog(room, now, 'treaty', `세계 평화 협약 채택 — ${text}`);
}

// ───────────────────────── 거래·협정 처리 ─────────────────────────
function needy(c: CountryState, k: Res): boolean {
  if (k === 'eco') return c.stock.eco < 10;
  if (k === 'tech') return c.stock.tech < 8;
  return c.stock[k] < c.need[k];
}

function executeTrade(room: Room, p: Proposal, now: number) {
  const from = room.countries[p.from], to = room.countries[p.to];
  need(canPay(from, p.give), `${cname(p.from)}의 자원이 부족해 거래를 체결할 수 없습니다.`);
  need(canPay(to, p.take), `${cname(p.to)}의 자원이 부족해 거래를 체결할 수 없습니다.`);
  const gSum = bundleSum(p.give), tSum = bundleSum(p.take);
  const oneWay = gSum === 0 || tSum === 0;
  let aidUnits = 0;
  if (oneWay) {
    const [giver, rec, b] = gSum > 0 ? [from, to, p.give] : [to, from, p.take];
    for (const k of RES) if (b[k] && needy(rec, k)) aidUnits += b[k]!;
    giver.contrib += aidUnits;
    if (aidUnits > 0) {
      const t = Math.min(8 - giver.roundTrust.aid, Math.ceil(aidUnits / 3));
      if (t > 0) { idx(giver, 'trust', t); giver.roundTrust.aid += t; }
      if (room.coopRound.aid < 9) { addCoop(room, 3); room.coopRound.aid += 3; }
    }
  }
  pay(from, p.give); receive(to, p.give);
  pay(to, p.take); receive(from, p.take);
  if (!oneWay && gSum + tSum >= 3) {
    for (const c of [from, to]) if (c.roundTrust.trade < 3) { idx(c, 'trust', 1); c.roundTrust.trade += 1; }
    if (room.coopRound.trade < 8) { addCoop(room, 2); room.coopRound.trade += 2; }
  }
  if (!oneWay) for (const c of [from, to]) if (c.id === 'OCE' && c.hubBonus < 4) { c.stock.eco += 1; c.hubBonus += 1; }
  const text = oneWay
    ? gSum > 0 ? `${cname(p.from)} → ${cname(p.to)} 지원: ${fmtBundle(p.give)}` : `${cname(p.to)} → ${cname(p.from)} 지원(요청 수락): ${fmtBundle(p.take)}`
    : `${cname(p.from)} ⇄ ${cname(p.to)} 거래: ${fmtBundle(p.give)} ↔ ${fmtBundle(p.take)}`;
  addLog(room, now, 'trade', text + (aidUnits > 0 ? ' (인도적 지원 인정)' : ''));
  if (aidUnits >= 5) addNews(room, now, '인도적 지원 전달', text, 'good');
}

function executePact(room: Room, p: Proposal, now: number) {
  const from = room.countries[p.from], to = room.countries[p.to];
  const type = p.pactType!;
  const def = PACTS[type];
  need(from.ap >= 1 && to.ap >= 1, '양국 모두 행동 포인트가 1 이상 있어야 협정을 체결할 수 있습니다.');
  const key = `${type === 'friend' ? 'friend' : 'joint'}:${[p.from, p.to].sort().join('-')}`;
  if (type === 'friend') need(!room.pactKeys.includes(key), '두 나라는 이미 우호 협력 협정을 맺었습니다.');
  else {
    need(!from.used.includes('joint') && !to.used.includes('joint'), '공동 프로젝트는 국가별로 라운드당 1건만 가능합니다.');
    need(canPay(from, def.cost) && canPay(to, def.cost), '양국 모두 경제력 5가 있어야 합니다.');
  }
  for (const c of [from, to]) {
    c.ap -= 1; pay(c, def.cost);
    if (type === 'friend') idx(c, 'trust', 4);
    else {
      c.used.push('joint');
      if (type === 'research') c.stock.tech += 4;
      if (type === 'waterdev') c.prod.water += 2;
      if (type === 'renew') { c.prod.energy += 2; idx(c, 'env', 2); }
      if (p.from === 'NOV' || p.to === 'NOV') c.prod.eco += 1;
      idx(c, 'trust', 1);
    }
  }
  if (type === 'friend') room.pactKeys.push(key);
  if (room.coopRound.pact < 12) { addCoop(room, 4); room.coopRound.pact += 4; }
  addAgreement(room, def.name, [p.from, p.to], `${cname(p.from)}–${cname(p.to)}: ${def.effect}`);
  addLog(room, now, 'pact', `${cname(p.from)}–${cname(p.to)} ${def.name} 체결`);
  addNews(room, now, `${cname(p.from)}–${cname(p.to)}, ${def.name} 체결`, def.effect, 'good');
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
    const all = COUNTRY_IDS.map((id) => room.countries[id]);
    if (ev.id === 'pandemic') for (const c of all) { idx(c, 'happy', -3); gain(c, 'eco', -3); }
    if (ev.id === 'harvest') for (const c of all) gain(c, 'food', 4);
    if (ev.id === 'oilshock') for (const c of all) if (c.id !== 'SOL') gain(c, 'energy', -3);
    if (ev.id === 'cyber') for (const c of all) gain(c, 'tech', -2);
    if (ev.id === 'devconf') { gain(room.countries.NOV, 'eco', 6); for (const c of all) idx(c, 'trust', 1); }
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
    else if (['happy', 'env', 'trust'].includes(key)) idx(c, key as 'happy', delta);
    else if (key === 'ap') c.ap = Math.max(0, Math.min(9, c.ap + delta));
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

  // ── 학생: 국가 행동 ──
  act(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireDelegate(room, ctx);
    const def = ACTIONS.find((x) => x.id === a.id) ?? fail('알 수 없는 행동입니다.');
    need(!def.rounds || (room.round >= def.rounds[0] && room.round <= def.rounds[1]), '이번 라운드에는 사용할 수 없는 행동입니다.');
    need(!c.used.includes(def.id), '이 행동은 이번 라운드에 이미 실행했습니다.');
    need(!def.once || !c.usedOnce.includes(def.id), '이 행동은 게임 중 한 번만 실행할 수 있습니다.');
    need(c.ap >= def.ap, '행동 포인트가 부족합니다.');
    need(canPay(c, def.cost), '비용으로 낼 자원이 부족합니다.');
    let pick: Vital | undefined;
    if (def.pick) { pick = def.pick.find((k) => k === a.pick) ?? fail('대상 자원을 선택하세요.'); }
    if (def.id === 'carbon') need(c.prod.eco >= 3, '경제 생산량이 너무 낮아 더 이상 규제할 수 없습니다.');
    if (def.id === 'refugee') need(c.id !== 'OCE', '재난 피해국은 이주민 수용 정책을 실행할 수 없습니다.');
    c.ap -= def.ap;
    pay(c, def.cost);
    c.used.push(def.id);
    if (def.once) c.usedOnce.push(def.id);
    let result = '';
    switch (def.id) {
      case 'invest': {
        const v = c.id === 'IND' ? 4 : 3;
        c.prod[pick!] += v; idx(c, 'env', pick === 'energy' ? -3 : -2);
        result = `${RES_INFO[pick!].name} 생산 +${v}`; break;
      }
      case 'rnd': { const v = c.id === 'ARC' ? 7 : 5; c.stock.tech += v; result = `기술력 +${v}`; break; }
      case 'renew': c.prod.energy += 2; idx(c, 'env', 6); result = '환경 +6, 에너지 생산 +2'; break;
      case 'carbon': { const v = c.id === 'IND' ? 10 : 8; c.prod.eco -= 1; idx(c, 'env', v); result = `환경 +${v}, 경제 생산 −1`; break; }
      case 'welfare':
        idx(c, 'happy', 4); result = '행복도 +4';
        if (c.id === 'NOV') { c.prod.eco += 2; result += ', 경제 생산 +2'; }
        break;
      case 'emergency': c.stock[pick!] += 5; result = `${RES_INFO[pick!].name} +5`; break;
      case 'adapt': c.adapted = true; idx(c, 'happy', 1); result = '재난 피해 절반, 행복도 +1'; break;
      case 'refugee':
        idx(c, 'trust', 6); idx(c, 'happy', -1); c.contrib += 5;
        idx(room.countries.OCE, 'happy', 2); if (c.id !== 'NOV') idx(room.countries.NOV, 'happy', 2);
        addCoop(room, 3); result = '신뢰도 +6';
        addNews(room, ctx.now, `${cname(c.id)}, 기후 이주민 수용 결정`, '재난으로 삶의 터전을 잃은 이주민을 받아들이기로 했습니다.', 'good');
        break;
    }
    addLog(room, ctx.now, 'action', `${def.name}${pick ? `(${RES_INFO[pick].name})` : ''} — ${result}`, c.id);
    refreshPeace(room);
  },

  contribute(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireDelegate(room, ctx);
    const pr = room.project ?? fail('이번 라운드에는 공동 대응 프로젝트가 없습니다.');
    const def = ROUNDS[pr.round].project!;
    const b = cleanBundle(a.give);
    const sum = bundleSum(b);
    need(sum > 0, '기여할 자원을 입력하세요.');
    need(RES.every((k) => !b[k] || def.accepts.includes(k)), '이 프로젝트에 낼 수 없는 자원이 포함되어 있습니다.');
    need(canPay(c, b), '보유 자원이 부족합니다.');
    const first = !c.used.includes('project');
    if (first) { need(c.ap >= 1, '행동 포인트가 부족합니다. (첫 기여 시 1 필요)'); c.ap -= 1; c.used.push('project'); }
    pay(c, b);
    const mine = (pr.contributions[c.id] ??= {});
    for (const k of RES) if (b[k]) mine[k] = (mine[k] ?? 0) + b[k]!;
    pr.total += sum;
    c.contrib += sum;
    const t = Math.min(6 - c.roundTrust.project, Math.floor((bundleSum(mine) / 3)) - c.roundTrust.project);
    if (t > 0) { idx(c, 'trust', t); c.roundTrust.project += t; }
    addLog(room, ctx.now, 'project', `${def.name}에 기여: ${fmtBundle(b)} (누계 ${pr.total}/${pr.target})`, c.id);
    refreshPeace(room);
  },

  // ── 학생: 외교 ──
  propose(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireDelegate(room, ctx);
    need(isCountry(a.to) && a.to !== c.id, '상대 국가를 선택하세요.');
    need(room.proposals.filter((p) => p.from === c.id && p.status === 'pending').length < 5, '대기 중인 제안이 너무 많습니다. (최대 5건) 기존 제안을 취소하세요.');
    const memo = String(a.memo ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const base = { id: `p${++room.seq}`, from: c.id, to: a.to as CountryId, memo, status: 'pending' as const, round: room.round, t: ctx.now };
    if (a.kind === 'pact') {
      const type = String(a.pactType) as PactType;
      need(type in PACTS, '협정 종류를 선택하세요.');
      if (type === 'friend') need(!room.pactKeys.includes(`friend:${[c.id, a.to].sort().join('-')}`), '두 나라는 이미 우호 협력 협정을 맺었습니다.');
      room.proposals.push({ ...base, kind: 'pact', pactType: type, give: {}, take: {} });
      addLog(room, ctx.now, 'pact', `${cname(c.id)} → ${cname(base.to)} ${PACTS[type].name} 제안`, c.id);
    } else {
      const give = cleanBundle(a.give), take = cleanBundle(a.take);
      need(bundleSum(give) + bundleSum(take) > 0, '주거나 받을 자원을 1 이상 입력하세요.');
      need(canPay(c, give), '제안한 만큼의 자원을 보유하고 있지 않습니다.');
      room.proposals.push({ ...base, kind: 'trade', give, take });
      addLog(room, ctx.now, 'trade', `${cname(c.id)} → ${cname(base.to)} 제안: 줌 [${fmtBundle(give)}] / 받음 [${fmtBundle(take)}]`, c.id);
    }
    if (room.proposals.length > 400) room.proposals.splice(0, room.proposals.length - 400);
  },
  respond(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireDelegate(room, ctx);
    const p = room.proposals.find((x) => x.id === a.id) ?? fail('제안을 찾을 수 없습니다.');
    need(p.status === 'pending', '이미 처리된 제안입니다.');
    need(p.round === room.round, '지난 라운드의 제안입니다.');
    if (a.action === 'cancel') {
      need(p.from === c.id, '제안한 국가만 취소할 수 있습니다.');
      p.status = 'cancelled';
    } else if (a.action === 'reject') {
      need(p.to === c.id, '제안받은 국가만 거절할 수 있습니다.');
      p.status = 'rejected';
      addLog(room, ctx.now, p.kind === 'pact' ? 'pact' : 'trade', `${cname(c.id)}가 ${cname(p.from)}의 제안을 거절`, c.id);
    } else if (a.action === 'accept') {
      need(p.to === c.id, '제안받은 국가만 승인할 수 있습니다.');
      // 검증 실패 시 예외가 발생하며 어떤 자원도 이동하지 않음 (원자적 처리)
      if (p.kind === 'pact') executePact(room, p, ctx.now); else executeTrade(room, p, ctx.now);
      p.status = 'accepted';
    } else fail('알 수 없는 응답입니다.');
    p.doneT = ctx.now;
    refreshPeace(room);
  },

  // ── 학생: 3라운드 분쟁 ──
  stance(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireDelegate(room, ctx);
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
    const c = requireDelegate(room, ctx);
    const d = room.dispute ?? fail('지금은 분쟁 상황이 아닙니다.');
    need(!d.parties.includes(c.id), '당사국은 중재국이 될 수 없습니다.');
    need(!d.mediators.includes(c.id), '이미 중재에 참여했습니다.');
    need(c.ap >= 1, '행동 포인트가 부족합니다.');
    c.ap -= 1;
    d.mediators.push(c.id);
    idx(c, 'trust', 3);
    c.contrib += 5;
    addLog(room, ctx.now, 'dispute', `${cname(c.id)} 중재 참여 — 신뢰도 +3`, c.id);
    refreshPeace(room);
  },

  // ── 학생: 5라운드 협약 ──
  treatyChoice(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireDelegate(room, ctx);
    const t = room.treaty ?? fail('협약은 5라운드에 논의합니다.');
    need(CLAUSES.some((cl) => cl.id === a.clause), '조항을 찾을 수 없습니다.');
    need(['none', 'base', 'strong'].includes(String(a.level)), '수준을 선택하세요.');
    (t.choices[c.id] ??= {})[String(a.clause)] = a.level as ClauseLevel;
  },
  treatyNote(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireDelegate(room, ctx);
    const t = room.treaty ?? fail('협약은 5라운드에 논의합니다.');
    t.notes[c.id] = String(a.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  },
  treatyRatify(room, ctx, a) {
    requireRunning(room, ctx.now);
    const c = requireDelegate(room, ctx);
    const t = room.treaty ?? fail('협약은 5라운드에 논의합니다.');
    need(a.vote === 'yes' || a.vote === 'no', '찬성 또는 반대를 선택하세요.');
    t.ratify[c.id] = a.vote as 'yes' | 'no';
    addLog(room, ctx.now, 'treaty', `${cname(c.id)} 비준 투표: ${a.vote === 'yes' ? '찬성' : '반대'}`, c.id);
  },

  // ── 학생: 퀴즈·성찰 (모든 참가자) ──
  quiz(room, ctx, a) {
    need(ctx.pid && ctx.country, '참가자만 가능합니다.');
    need(room.round >= 1, '게임이 시작되면 풀 수 있습니다.');
    const rd = room.round;
    const ans = (room.quizAnswers[rd] ??= {});
    need(!(ctx.pid! in ans), '이미 답을 제출했습니다.');
    const choice = Number(a.choice);
    need(Number.isInteger(choice) && choice >= 0 && choice <= 3, '보기를 선택하세요.');
    ans[ctx.pid!] = choice;
    const correct = choice === QUIZZES[rd]?.answer;
    const st = (room.quizStats[rd] ??= { answered: 0, correct: 0 });
    st.answered++;
    if (correct) {
      st.correct++;
      const c = room.countries[ctx.country!];
      if (!c.quizBonus.includes(rd) && room.phase === 'running') {
        c.quizBonus.push(rd);
        c.ap += 1;
        addLog(room, ctx.now, 'system', `퀴즈 정답 보너스: 행동 포인트 +1`, c.id);
      }
    }
  },
  reflect(room, ctx, a) {
    need(ctx.pid && ctx.country, '참가자만 가능합니다.');
    need(Array.isArray(a.answers) && a.answers.length === 4, '성찰 문항 형식이 올바르지 않습니다.');
    const answers = (a.answers as unknown[]).map((x) => String(x ?? '').slice(0, 600));
    (room.reflections[ctx.country!] ??= {})[ctx.pid!] = { nick: room.players[ctx.pid!].nick, answers, t: ctx.now };
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
