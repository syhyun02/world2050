// 공용 UI 조각
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { COUNTRIES, RES, RES_INFO } from '../../../shared/data';
import type { CountryId, PublicRoom, Res, ResBundle } from '../../../shared/types';
import type { ConnStatus } from './net';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

// ── 알림(토스트) ──
type Toast = { id: number; text: string; tone: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, text, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[min(92vw,26rem)] pointer-events-none" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={cx('anim-pop rounded-xl px-4 py-3 text-sm font-medium shadow-xl border', t.tone === 'ok' ? 'bg-emerald-950 border-emerald-500/60 text-emerald-100' : 'bg-rose-950 border-rose-500/60 text-rose-100')}>
            {t.tone === 'ok' ? '✅ ' : '⚠️ '}{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** 명령 실행 + 결과 알림 + 중복 클릭 방지 */
export function useAction(cmd: (name: string, args?: Record<string, unknown>) => Promise<void>) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const run = useCallback(async (name: string, args: Record<string, unknown> = {}, okMsg?: string) => {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    try { await cmd(name, args); if (okMsg) toast(okMsg); return true; }
    catch (e) { toast((e as Error).message, 'err'); return false; }
    finally { lock.current = false; setBusy(false); }
  }, [cmd, toast]);
  return { run, busy };
}

export function Btn({ children, onClick, disabled, tone = 'primary', small, className, title, type }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'primary' | 'ghost' | 'danger' | 'good'; small?: boolean; className?: string; title?: string; type?: 'submit' | 'button';
}) {
  const tones = {
    primary: 'bg-sky-500 hover:bg-sky-400 text-ink-950 font-semibold',
    good: 'bg-emerald-500 hover:bg-emerald-400 text-ink-950 font-semibold',
    ghost: 'bg-ink-700 hover:bg-ink-600 text-slate-100 border border-line',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white font-semibold',
  };
  return (
    <button type={type ?? 'button'} title={title} onClick={onClick} disabled={disabled}
      className={cx('rounded-lg whitespace-nowrap transition-colors disabled:opacity-40 disabled:hover:bg-inherit', small ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm', tones[tone], className)}>
      {children}
    </button>
  );
}

export function Panel({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('panel p-4', className)}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold tracking-wide text-sky-200">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Bar({ value, color = '#38bdf8', mark }: { value: number; color?: string; mark?: number }) {
  return (
    <div className="relative h-2 rounded-full bg-ink-950/80 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      {mark !== undefined && <div className="absolute top-0 bottom-0 w-0.5 bg-white/70" style={{ left: `${mark}%` }} />}
    </div>
  );
}

export function Badge({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'good' | 'bad' | 'warn' | 'mute' }) {
  const t = { info: 'bg-sky-500/15 text-sky-200 border-sky-500/40', good: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40', bad: 'bg-rose-500/15 text-rose-200 border-rose-500/40', warn: 'bg-amber-500/15 text-amber-200 border-amber-500/40', mute: 'bg-slate-500/15 text-slate-300 border-slate-500/40' }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', t)}>{children}</span>;
}

export function CountryTag({ id, full }: { id: CountryId; full?: boolean }) {
  const d = COUNTRIES[id];
  return (
    <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap" style={{ color: d.color }}>
      <span aria-hidden>{d.icon}</span>{full ? d.name : d.short}
    </span>
  );
}

export function ConnBadge({ status }: { status: ConnStatus }) {
  if (status === 'online') return <Badge tone="good">● 연결됨</Badge>;
  if (status === 'connecting') return <Badge tone="warn">◌ 연결 중</Badge>;
  return <Badge tone="bad">✕ 재연결 중</Badge>;
}

export function BundleText({ b }: { b: ResBundle }) {
  const keys = RES.filter((k) => (b[k] ?? 0) > 0);
  if (!keys.length) return <span className="text-slate-400">없음</span>;
  return <span>{keys.map((k) => <span key={k} className="inline-block mr-2 whitespace-nowrap">{RES_INFO[k].icon} {RES_INFO[k].name} <b className="tnum">{b[k]}</b></span>)}</span>;
}

export function Stepper({ value, onChange, max = 999 }: { value: number; onChange: (v: number) => void; max?: number }) {
  const set = (v: number) => onChange(Math.max(0, Math.min(max, Math.round(v) || 0)));
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-ink-950/60 overflow-hidden">
      <button type="button" aria-label="줄이기" className="w-8 h-9 text-lg text-slate-300 hover:bg-ink-700" onClick={() => set(value - 1)}>−</button>
      <input inputMode="numeric" aria-label="수량" className="w-10 h-9 bg-transparent text-center tnum text-sm outline-none" value={value} onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')))} />
      <button type="button" aria-label="늘리기" className="w-8 h-9 text-lg text-slate-300 hover:bg-ink-700" onClick={() => set(value + 1)}>+</button>
    </div>
  );
}

export function ResPicker({ value, onChange, keys = RES, have, cols = 2 }: { value: ResBundle; onChange: (b: ResBundle) => void; keys?: Res[]; have?: Record<Res, number>; cols?: 1 | 2 }) {
  return (
    <div className={cx('grid grid-cols-1 gap-x-4 gap-y-1.5', cols === 2 && 'sm:grid-cols-2')}>
      {keys.map((k) => (
        <div key={k} className="flex items-center justify-between gap-2">
          <span className="text-sm">{RES_INFO[k].icon} {RES_INFO[k].name}{have && <span className="text-xs text-slate-400 tnum"> (보유 {have[k]})</span>}</span>
          <Stepper value={value[k] ?? 0} onChange={(v) => onChange({ ...value, [k]: v })} />
        </div>
      ))}
    </div>
  );
}

/** 숫자가 바뀌면 부드럽게 세어 올라가는 표시 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current, t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      const v = Math.round(start + (value - start) * (1 - (1 - p) ** 3));
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value]);
  return <span className={cx('tnum', className)}>{shown}</span>;
}

/** 값이 바뀐 직후 잠깐 변화량(▲/▼)을 돌려줌 */
export function useDelta(value: number, holdMs = 2600): number {
  const prev = useRef(value);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    if (value === prev.current) return;
    setDelta(value - prev.current);
    prev.current = value;
    const t = setTimeout(() => setDelta(0), holdMs);
    return () => clearTimeout(t);
  }, [value, holdMs]);
  return delta;
}

export const phaseLabel = (s: PublicRoom) =>
  s.phase === 'lobby' ? '대기실' : s.phase === 'finished' ? '게임 종료' : s.phase === 'roundEnd' ? `ROUND ${s.round} 결산` : s.phase === 'paused' ? `ROUND ${s.round} 일시정지` : `ROUND ${s.round} 진행 중`;

export const peaceTone = (v: number) => (v >= 65 ? { color: '#34d399', label: '안정' } : v >= 50 ? { color: '#fbbf24', label: '불안' } : { color: '#f87171', label: '위기' });
