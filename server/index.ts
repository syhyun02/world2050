// WORLD 2050 — 실시간 게임 서버
// 하나의 Node 프로세스가 모든 방의 상태를 메모리에 보관하고(서버 권위), 명령을 한 번에 하나씩 처리합니다.
// 따라서 거래 승인 등 모든 상태 변경은 원자적이며, 변경 사항은 디스크에 자동 저장됩니다.
import express from 'express';
import { createServer } from 'node:http';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { WebSocketServer, type WebSocket } from 'ws';
import { COUNTRY_IDS } from '../shared/data';
import { commands, joinRoom, meView, newRoom, publicView, tick } from '../shared/engine';
import { GameError, type CountryId, type Ctx, type Room } from '../shared/types';

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const ROOM_DIR = path.join(DATA_DIR, 'rooms');
const SNAP_DIR = path.join(DATA_DIR, 'snapshots');
fs.mkdirSync(ROOM_DIR, { recursive: true });
fs.mkdirSync(SNAP_DIR, { recursive: true });

// ───────────────────────── 비밀값 ─────────────────────────
let TEACHER_PASSWORD = process.env.TEACHER_PASSWORD ?? '';
if (!TEACHER_PASSWORD) {
  TEACHER_PASSWORD = randomBytes(6).toString('base64url');
  console.log(`\n[주의] TEACHER_PASSWORD 환경변수가 없어 임시 교사 비밀번호를 만들었습니다: ${TEACHER_PASSWORD}\n`);
}
let SECRET = process.env.SESSION_SECRET ?? '';
if (!SECRET) {
  const f = path.join(DATA_DIR, '.secret');
  if (fs.existsSync(f)) SECRET = fs.readFileSync(f, 'utf8');
  else { SECRET = randomBytes(32).toString('hex'); fs.writeFileSync(f, SECRET, { mode: 0o600 }); }
}
const sign = (v: string) => createHmac('sha256', SECRET).update(v).digest('base64url');
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
function teacherToken(): string { const exp = Date.now() + 12 * 3600_000; return `${exp}.${sign(`teacher:${exp}`)}`; }
function isTeacher(tok: unknown): boolean {
  if (typeof tok !== 'string') return false;
  const [exp, sig] = tok.split('.');
  return !!exp && !!sig && Number(exp) > Date.now() && safeEq(sig, sign(`teacher:${exp}`));
}

// ───────────────────────── 방 저장소 ─────────────────────────
const rooms = new Map<string, Room>();
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 글자(0,O,1,I) 제외
const code = (n: number) => Array.from({ length: n }, () => ALPHA[randomInt(ALPHA.length)]).join('');
const validCode = (s: unknown): s is string => typeof s === 'string' && /^[A-Z0-9]{4,8}$/.test(s);

for (const f of fs.readdirSync(ROOM_DIR)) {
  if (!f.endsWith('.json')) continue;
  try {
    const room = JSON.parse(fs.readFileSync(path.join(ROOM_DIR, f), 'utf8')) as Room;
    if (room.v !== 6) { console.log('이전 규칙으로 저장된 방은 건너뜁니다:', room.code); continue; }
    for (const p of Object.values(room.players)) p.online = false;
    rooms.set(room.code, room);
  } catch (e) { console.error('방 데이터를 읽지 못했습니다:', f, e); }
}
console.log(`저장된 게임방 ${rooms.size}개를 불러왔습니다.`);

const saveTimers = new Map<string, NodeJS.Timeout>();
function writeAtomic(file: string, data: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
function saveNow(room: Room) {
  try { writeAtomic(path.join(ROOM_DIR, `${room.code}.json`), JSON.stringify(room)); }
  catch (e) { console.error('저장 실패:', room.code, e); }
}
function scheduleSave(room: Room) {
  if (saveTimers.has(room.code)) return;
  saveTimers.set(room.code, setTimeout(() => { saveTimers.delete(room.code); if (rooms.has(room.code)) saveNow(room); }, 1000));
}
/** 라운드 시작 시점의 상태를 복구용으로 보관 */
function snapshot(room: Room) {
  try { writeAtomic(path.join(SNAP_DIR, `${room.code}.r${room.round}.json`), JSON.stringify(room)); } catch (e) { console.error(e); }
}
function listSnapshots(c: string): number[] {
  return [1, 2, 3, 4, 5].filter((n) => fs.existsSync(path.join(SNAP_DIR, `${c}.r${n}.json`)));
}
function removeRoomFiles(c: string) {
  fs.rmSync(path.join(ROOM_DIR, `${c}.json`), { force: true });
  for (const n of [1, 2, 3, 4, 5]) fs.rmSync(path.join(SNAP_DIR, `${c}.r${n}.json`), { force: true });
}

// ───────────────────────── 연결 관리 ─────────────────────────
interface Conn { ws: WebSocket; role: 'student' | 'teacher' | 'board'; room: string; pid?: string; country?: CountryId; cmds: number[]; alive: boolean }
const conns = new Map<string, Set<Conn>>();
const bcast = new Map<string, NodeJS.Timeout>();
const seenCmd = new Map<string, Set<string>>();

function send(c: Conn, msg: unknown) { if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function broadcast(room: Room) {
  if (bcast.has(room.code)) return;
  bcast.set(room.code, setTimeout(() => {
    bcast.delete(room.code);
    const set = conns.get(room.code);
    if (!set?.size) return;
    // 학생·전자칠판에는 가벼운 상태를, 교사에게만 전체 기록을 보냄. 문자열은 종류별로 한 번만 만듦
    const now = Date.now();
    let lite: string | null = null, full: string | null = null;
    for (const c of set) {
      if (c.role === 'teacher') send(c, (full ??= JSON.stringify({ t: 'state', now, s: publicView(room, true) })));
      else send(c, (lite ??= JSON.stringify({ t: 'state', now, s: publicView(room, false) })));
    }
  }, 40));
}
function sendMe(room: Room, pid: string) {
  const me = meView(room, pid);
  for (const c of conns.get(room.code) ?? []) if (c.pid === pid) send(c, { t: 'me', me });
}
function setOnline(room: Room, pid: string) {
  const p = room.players[pid];
  if (!p) return;
  const on = [...(conns.get(room.code) ?? [])].some((c) => c.pid === pid);
  if (p.online !== on) { p.online = on; broadcast(room); }
}
function changed(room: Room) { broadcast(room); scheduleSave(room); }

function runCommand(room: Room, ctx: Ctx, name: string, args: Record<string, unknown>) {
  const fn = Object.hasOwn(commands, name) ? commands[name] : null;
  if (!fn) throw new GameError('알 수 없는 명령입니다.');
  const beforeRound = room.round, beforePhase = room.phase;
  // 실패 시 부분 변경이 남지 않도록 실행 전 상태를 보관했다가 되돌림
  const backup = JSON.stringify(room);
  try { fn(room, ctx, args); }
  catch (e) { Object.assign(room, JSON.parse(backup)); throw e; }
  if (room.phase === 'running' && (room.round !== beforeRound || beforePhase === 'lobby')) snapshot(room);
  changed(room);
}

// ───────────────────────── HTTP API ─────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));

const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 600_000)) hits.delete(k); }, 60_000).unref();

const auth: express.RequestHandler = (req, res, next) => {
  if (!isTeacher(req.headers.authorization?.replace(/^Bearer /, ''))) return void res.status(401).json({ error: '교사 로그인이 필요합니다.' });
  next();
};
const summary = (r: Room) => ({
  code: r.code, className: r.className, createdAt: r.createdAt, phase: r.phase, round: r.round, peace: r.peace,
  players: Object.keys(r.players).length, online: Object.values(r.players).filter((p) => p.online).length,
  durationSec: r.durationSec, results: r.results, peaceHistory: r.peaceHistory,
});

app.get('/api/health', (_q, res) => res.json({ ok: true, rooms: rooms.size, connections: [...conns.values()].reduce((s, x) => s + x.size, 0) }));

app.post('/api/teacher/login', (req, res) => {
  if (limited(`login:${req.ip}`, 10, 60_000)) return void res.status(429).json({ error: '시도가 너무 많습니다. 1분 뒤 다시 시도하세요.' });
  const pw = String(req.body?.password ?? '');
  if (!safeEq(sign(`pw:${pw}`), sign(`pw:${TEACHER_PASSWORD}`))) return void res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  res.json({ token: teacherToken() });
});
app.get('/api/teacher/rooms', auth, (_q, res) => res.json({ rooms: [...rooms.values()].sort((a, b) => a.createdAt - b.createdAt).map(summary) }));
app.post('/api/teacher/rooms', auth, (req, res) => {
  if (rooms.size >= 60) return void res.status(400).json({ error: '게임방이 너무 많습니다. 사용하지 않는 방을 삭제하세요.' });
  const className = String(req.body?.className ?? '').trim().slice(0, 20) || '이름 없는 학급';
  const min = Math.min(60, Math.max(1, Number(req.body?.minutes) || 5));
  let c = code(5);
  while (rooms.has(c)) c = code(5);
  const joinCodes = {} as Record<CountryId, string>;
  const used = new Set<string>();
  for (const id of COUNTRY_IDS) { let j = code(4); while (used.has(j)) j = code(4); used.add(j); joinCodes[id] = j; }
  const room = newRoom(c, className, Math.round(min * 60), joinCodes, Date.now());
  rooms.set(c, room);
  saveNow(room);
  res.json({ room: summary(room) });
});
app.delete('/api/teacher/rooms/:code', auth, (req, res) => {
  const c = req.params.code;
  if (!rooms.has(c)) return void res.status(404).json({ error: '방을 찾을 수 없습니다.' });
  rooms.delete(c);
  removeRoomFiles(c);
  for (const cn of conns.get(c) ?? []) cn.ws.close(4004, 'room deleted');
  conns.delete(c);
  res.json({ ok: true });
});
/** 교사용 전체 데이터 (참가 코드, 성찰 포함) — 보고서 내보내기용 */
app.get('/api/teacher/rooms/:code/export', auth, (req, res) => {
  const room = rooms.get(req.params.code);
  if (!room) return void res.status(404).json({ error: '방을 찾을 수 없습니다.' });
  const { sessions, ...rest } = room;
  res.json({ room: rest, snapshots: listSnapshots(room.code) });
});
app.post('/api/teacher/rooms/:code/restore', auth, (req, res) => {
  const room = rooms.get(req.params.code);
  const n = Number(req.body?.round);
  const file = path.join(SNAP_DIR, `${req.params.code}.r${n}.json`);
  if (!room || !Number.isInteger(n) || !fs.existsSync(file)) return void res.status(404).json({ error: '복구 지점을 찾을 수 없습니다.' });
  const snap = JSON.parse(fs.readFileSync(file, 'utf8')) as Room;
  // 참가자·세션·성찰은 현재 것을 유지하고 게임 상태만 되돌림. 타이머는 일시정지 상태로 복구.
  snap.players = room.players; snap.sessions = room.sessions;
  for (const id of COUNTRY_IDS) snap.countries[id].delegate = room.countries[id].delegate;
  snap.phase = 'paused'; snap.remainingMs = snap.durationSec * 1000; snap.endsAt = null;
  snap.seq = room.seq + 1000;
  snap.log.push({ t: Date.now(), round: n, type: 'teacher', text: `교사가 ROUND ${n} 시작 시점으로 복구했습니다. (일시정지 상태)` });
  rooms.set(room.code, snap);
  for (const k of [1, 2, 3, 4, 5]) if (k > n) fs.rmSync(path.join(SNAP_DIR, `${room.code}.r${k}.json`), { force: true });
  changed(snap);
  for (const c of conns.get(room.code) ?? []) if (c.pid) send(c, { t: 'me', me: meView(snap, c.pid) });
  res.json({ ok: true });
});

app.post('/api/join', (req, res) => {
  if (limited(`join:${req.ip}`, 1200, 60_000)) return void res.status(429).json({ error: '시도가 너무 많습니다. 잠시 뒤 다시 시도하세요.' });
  const rc = String(req.body?.room ?? '').toUpperCase().trim();
  const jc = String(req.body?.code ?? '').toUpperCase().trim();
  const room = validCode(rc) ? rooms.get(rc) : undefined;
  if (!room) return void res.status(404).json({ error: '방 코드를 다시 확인하세요.' });
  if (limited(`joinfail:${req.ip}:${rc}`, 120, 60_000)) return void res.status(429).json({ error: '시도가 너무 많습니다. 잠시 뒤 다시 시도하세요.' });
  const country = COUNTRY_IDS.find((id) => room.joinCodes[id] === jc);
  if (!country) return void res.status(403).json({ error: '국가 참가 코드를 다시 확인하세요.' });
  if (Object.keys(room.players).length >= 80) return void res.status(400).json({ error: '방 정원이 가득 찼습니다.' });
  const pid = `u${randomBytes(6).toString('hex')}`;
  const token = randomBytes(24).toString('base64url');
  try { joinRoom(room, country, pid, String(req.body?.nick ?? ''), Date.now()); }
  catch (e) { return void res.status(400).json({ error: e instanceof GameError ? e.message : '입장에 실패했습니다.' }); }
  room.sessions[token] = pid;
  changed(room);
  res.json({ room: room.code, token, country, pid });
});
app.get('/api/rooms/:code', (req, res) => {
  const room = rooms.get(String(req.params.code).toUpperCase());
  if (!room) return void res.status(404).json({ error: '방을 찾을 수 없습니다.' });
  res.json({ code: room.code, className: room.className, phase: room.phase });
});

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = [path.join(here, 'client'), path.join(here, '../dist/client')].find((d) => fs.existsSync(path.join(d, 'index.html')));
if (clientDir) {
  // JS·CSS는 서버를 켤 때 한 번만 압축해 두고, 요청마다 다시 압축하지 않음 (학생 수백 명이 동시에 접속해도 CPU를 거의 쓰지 않음)
  const gz = new Map<string, { body: Buffer; type: string }>();
  const assetDir = path.join(clientDir, 'assets');
  if (fs.existsSync(assetDir)) for (const f of fs.readdirSync(assetDir)) {
    const type = f.endsWith('.js') ? 'text/javascript; charset=utf-8' : f.endsWith('.css') ? 'text/css; charset=utf-8' : '';
    if (type) gz.set(`/assets/${f}`, { body: gzipSync(fs.readFileSync(path.join(assetDir, f)), { level: 9 }), type });
  }
  app.use((req, res, next) => {
    const hit = req.method === 'GET' ? gz.get(req.path) : undefined;
    if (!hit || !String(req.headers['accept-encoding'] ?? '').includes('gzip')) return next();
    res.set({ 'Content-Type': hit.type, 'Content-Encoding': 'gzip', 'Cache-Control': 'public, max-age=31536000, immutable', Vary: 'Accept-Encoding' }).send(hit.body);
  });
  // 파일 이름에 해시가 붙는 자산은 1년 캐시(재방문 시 다시 받지 않음), index.html은 항상 새로 확인
  app.use(express.static(clientDir, { setHeaders: (res, p) => res.setHeader('Cache-Control', p.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache') }));
  app.get(/^\/(?!api|ws).*/, (_q, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

// ───────────────────────── WebSocket ─────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  let conn: Conn | null = null;
  const helloTimer = setTimeout(() => { if (!conn) ws.close(4001, 'hello timeout'); }, 10_000);

  ws.on('message', (raw) => {
    let m: Record<string, unknown>;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'hello') {
      if (conn) return;
      const room = validCode(m.room) ? rooms.get(m.room) : undefined;
      if (!room) return void ws.close(4004, 'no room');
      const c: Conn = { ws, role: 'board', room: room.code, cmds: [], alive: true };
      if (m.role === 'teacher') {
        if (!isTeacher(m.token)) return void ws.close(4003, 'unauthorized');
        c.role = 'teacher';
      } else if (m.role === 'student') {
        const pid = typeof m.token === 'string' && Object.hasOwn(room.sessions, m.token) ? room.sessions[m.token] : undefined;
        const p = pid ? room.players[pid] : undefined;
        if (!p) return void ws.close(4003, 'unauthorized');
        c.role = 'student'; c.pid = p.id; c.country = p.country;
      }
      conn = c;
      clearTimeout(helloTimer);
      if (!conns.has(room.code)) conns.set(room.code, new Set());
      conns.get(room.code)!.add(c);
      send(c, { t: 'state', now: Date.now(), s: publicView(room, c.role === 'teacher') });
      if (c.role === 'teacher') send(c, { t: 'teacher', joinCodes: room.joinCodes, snapshots: listSnapshots(room.code) });
      if (c.pid) { send(c, { t: 'me', me: meView(room, c.pid) }); setOnline(room, c.pid); }
      return;
    }

    if (m.t === 'cmd' && conn) {
      const id = String(m.id ?? '');
      const reply = (ok: boolean, error?: string) => send(conn!, { t: 'ack', id, ok, error });
      const room = rooms.get(conn.room);
      if (!room) return reply(false, '방이 삭제되었습니다.');
      const now = Date.now();
      conn.cmds = conn.cmds.filter((t) => now - t < 10_000);
      if (conn.cmds.length >= 40) return reply(false, '요청이 너무 빠릅니다. 잠시 뒤 다시 시도하세요.');
      conn.cmds.push(now);
      // 같은 요청이 두 번 도착해도(더블 클릭·재전송) 한 번만 실행
      const seen = seenCmd.get(room.code) ?? new Set<string>();
      seenCmd.set(room.code, seen);
      const key = `${conn.pid ?? conn.role}:${id}`;
      if (seen.has(key)) return reply(true);
      if (seen.size > 5000) seen.clear();
      seen.add(key);
      if (conn.pid && !room.players[conn.pid]) return reply(false, '참가 정보가 없습니다. 다시 입장하세요.');
      const ctx: Ctx = { now, teacher: conn.role === 'teacher', pid: conn.pid, country: conn.country };
      const name = String(m.name ?? '');
      const args = m.args && typeof m.args === 'object' ? (m.args as Record<string, unknown>) : {};
      try {
        runCommand(room, ctx, name, args);
        reply(true);
        if (conn.pid && name === 'quiz') sendMe(room, conn.pid);
        if (conn.role === 'teacher') send(conn, { t: 'teacher', joinCodes: room.joinCodes, snapshots: listSnapshots(room.code) });
      } catch (e) {
        if (!(e instanceof GameError)) console.error('명령 처리 오류:', name, e);
        reply(false, e instanceof GameError ? e.message : '서버 오류가 발생했습니다. 다시 시도하세요.');
      }
    }
  });

  ws.on('pong', () => { if (conn) conn.alive = true; });
  ws.on('close', () => {
    clearTimeout(helloTimer);
    if (!conn) return;
    conns.get(conn.room)?.delete(conn);
    const room = rooms.get(conn.room);
    if (room && conn.pid) { setOnline(room, conn.pid); scheduleSave(room); }
  });
  ws.on('error', () => ws.close());
});

// 죽은 연결 정리 + 라운드 타이머
setInterval(() => {
  for (const set of conns.values()) for (const c of set) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    c.ws.ping();
  }
}, 25_000).unref();
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) if (tick(room, now)) changed(room);
}, 500);

function shutdown() {
  for (const room of rooms.values()) saveNow(room);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => console.log(`WORLD 2050 서버 실행 중: http://localhost:${PORT}`));
