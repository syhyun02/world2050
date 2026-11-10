// 서버 통신: HTTP API + 자동 재접속 WebSocket
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CountryId, MeInfo, PublicRoom } from '../../../shared/types';

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? '요청에 실패했습니다.'), { status: res.status });
  return data as T;
}

export interface Session { room: string; token: string; country: CountryId; pid: string }
const SKEY = 'w2050.session';
const TKEY = 'w2050.teacher';
export const session = {
  get(): Session | null { try { return JSON.parse(localStorage.getItem(SKEY) ?? 'null'); } catch { return null; } },
  set(s: Session) { localStorage.setItem(SKEY, JSON.stringify(s)); },
  clear() { localStorage.removeItem(SKEY); },
};
export const teacherAuth = {
  get(): string | null {
    const t = localStorage.getItem(TKEY);
    if (!t || Number(t.split('.')[0]) < Date.now()) return null;
    return t;
  },
  set(t: string) { localStorage.setItem(TKEY, t); },
  clear() { localStorage.removeItem(TKEY); },
};

export type ConnStatus = 'connecting' | 'online' | 'offline' | 'denied' | 'gone';
export interface TeacherInfo { joinCodes: Record<CountryId, string>; snapshots: number[] }
export interface RoomConn {
  state: PublicRoom | null;
  me: MeInfo | null;
  teacher: TeacherInfo | null;
  status: ConnStatus;
  /** 서버 시각 − 내 기기 시각 (타이머 보정용) */
  offset: number;
  cmd: (name: string, args?: Record<string, unknown>) => Promise<void>;
}

export function useRoom(role: 'student' | 'teacher' | 'board', room: string, token?: string | null): RoomConn {
  const [state, setState] = useState<PublicRoom | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [teacher, setTeacher] = useState<TeacherInfo | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [offset, setOffset] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const pending = useRef(new Map<string, { resolve: () => void; reject: (e: Error) => void }>());

  useEffect(() => {
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      if (closed) return;
      setStatus((s) => (s === 'online' ? 'offline' : s === 'offline' ? 'offline' : 'connecting'));
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', role, room, token }));
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.t === 'state') { retry = 0; setState(m.s); setOffset(m.now - Date.now()); setStatus('online'); }
        else if (m.t === 'me') setMe(m.me);
        else if (m.t === 'teacher') setTeacher({ joinCodes: m.joinCodes, snapshots: m.snapshots });
        else if (m.t === 'ack') {
          const p = pending.current.get(m.id);
          if (p) { pending.current.delete(m.id); m.ok ? p.resolve() : p.reject(new Error(m.error ?? '실패했습니다.')); }
        }
      };
      ws.onclose = (ev) => {
        for (const p of pending.current.values()) p.reject(new Error('연결이 끊겨 요청을 확인하지 못했습니다. 화면을 확인한 뒤 다시 시도하세요.'));
        pending.current.clear();
        if (closed) return;
        if (ev.code === 4003) return setStatus('denied');
        if (ev.code === 4004) return setStatus('gone');
        setStatus('offline');
        timer = setTimeout(connect, Math.min(5000, 500 * 2 ** retry++) + Math.random() * 300);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    // 화면을 다시 켰을 때(모바일 절전 복귀) 바로 재접속
    const onVis = () => { if (document.visibilityState === 'visible' && wsRef.current?.readyState === WebSocket.CLOSED) { clearTimeout(timer); retry = 0; connect(); } };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onVis);
    return () => { closed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onVis); wsRef.current?.close(); };
  }, [role, room, token]);

  const cmd = useCallback((name: string, args: Record<string, unknown> = {}) => new Promise<void>((resolve, reject) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error('서버와 연결이 끊겼습니다. 잠시 뒤 다시 시도하세요.'));
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    pending.current.set(id, { resolve, reject });
    ws.send(JSON.stringify({ t: 'cmd', id, name, args }));
    setTimeout(() => { if (pending.current.delete(id)) reject(new Error('응답이 늦어지고 있습니다. 화면을 확인한 뒤 다시 시도하세요.')); }, 8000);
  }), []);

  return { state, me, teacher, status, offset, cmd };
}

/** 남은 시간(ms). 일시정지 중이면 고정 값 */
export function useRemaining(state: PublicRoom | null, offset: number): number | null {
  const [, force] = useState(0);
  const ticking = state?.phase === 'running';
  useEffect(() => { if (!ticking) return; const t = setInterval(() => force((n) => n + 1), 500); return () => clearInterval(t); }, [ticking]);
  if (!state) return null;
  if (state.phase === 'paused') return state.remainingMs;
  if (state.phase === 'running' && state.endsAt) return Math.max(0, state.endsAt - (Date.now() + offset));
  return null;
}
export const fmtTime = (ms: number | null) => {
  if (ms === null) return '--:--';
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export function nav(path: string) { history.pushState(null, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }
