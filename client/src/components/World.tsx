// 세계 현황 공용 컴포넌트: 가상 세계 지도(직접 제작 SVG), 평화 지수, 뉴스, 국가 표
import { useEffect, useRef, useState } from 'react';
import { COUNTRIES, COUNTRY_IDS, RES, RES_INFO, START_LIVES, VITALS } from '../../../shared/data';
import { calcPeace, lacking } from '../../../shared/engine';
import type { CountryId, PublicRoom } from '../../../shared/types';
import { aliveIds } from '../../../shared/engine';
import { Badge, Bar, CountUp, CountryTag, cx, Hearts, peaceTone, useDelta } from '../lib/ui';

// 대륙 모양은 중심점과 반지름 목록으로 직접 그린 가상의 지형입니다. (실제 지도 아님)
const SHAPES: Record<CountryId, number[]> = {
  ARC: [78, 92, 70, 84, 96, 74, 66, 88, 80, 70],
  GRN: [84, 70, 90, 76, 68, 86, 94, 72, 80, 88],
  IND: [90, 78, 84, 96, 72, 80, 70, 92, 76, 84],
  NOV: [72, 86, 92, 70, 80, 90, 74, 66, 84, 78],
  SOL: [88, 74, 80, 92, 84, 70, 90, 78, 72, 86],
  OCE: [52, 60, 46, 56, 62, 48, 54, 44, 58, 50],
};
function blob(cx0: number, cy0: number, radii: number[], sx = 1.25, sy = 0.8): string {
  const pts = radii.map((r, i) => {
    const a = (i / radii.length) * Math.PI * 2;
    return [cx0 + Math.cos(a) * r * sx, cy0 + Math.sin(a) * r * sy];
  });
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = '';
  pts.forEach((p, i) => {
    const m = mid(p, pts[(i + 1) % pts.length]);
    d += i === 0 ? `M${mid(pts[pts.length - 1], p).map((v) => v.toFixed(1)).join(',')} ` : '';
    d += `Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${m[0].toFixed(1)},${m[1].toFixed(1)} `;
  });
  return d + 'Z';
}
const ISLETS: [number, number, number][] = [[870, 300, 14], [740, 420, 18], [860, 440, 12], [700, 350, 9], [905, 380, 10]];

export function WorldMap({ state, me, onPick, big }: { state: PublicRoom; me?: CountryId; onPick?: (id: CountryId) => void; big?: boolean }) {
  const links = state.agreements.filter((a) => a.parties.length === 2).slice(-12);
  return (
    <svg viewBox="0 0 1000 520" className="w-full h-auto rounded-xl" role="img" aria-label="가상 세계 지도: 6개 국가의 위치와 상태">
      <defs>
        <radialGradient id="sea" cx="50%" cy="40%" r="80%"><stop offset="0%" stopColor="#12305c" /><stop offset="100%" stopColor="#081326" /></radialGradient>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#2a4a80" strokeWidth="0.6" opacity="0.5" /></pattern>
      </defs>
      <rect width="1000" height="520" fill="url(#sea)" />
      <rect width="1000" height="520" fill="url(#grid)" />
      {[130, 260, 390].map((y) => <path key={y} d={`M0 ${y} Q500 ${y - 26} 1000 ${y}`} fill="none" stroke="#38bdf8" strokeWidth="0.6" strokeDasharray="3 9" opacity="0.35" />)}
      {/* 미르강 (3라운드 가상 분쟁 지역) */}
      <path d="M470 205 Q500 250 492 285 Q486 310 515 330" fill="none" stroke="#7dd3fc" strokeWidth={state.dispute && !state.dispute.result ? 5 : 2.5} strokeLinecap="round" opacity="0.8" className={state.dispute && !state.dispute.result ? 'anim-breaking' : ''} />
      <text x="508" y="262" fill="#bae6fd" fontSize="13" fontStyle="italic">미르강</text>
      {links.map((a) => {
        const p = COUNTRIES[a.parties[0]].map, q = COUNTRIES[a.parties[1]].map;
        return <path key={a.id} d={`M${p.x} ${p.y} Q${(p.x + q.x) / 2} ${(p.y + q.y) / 2 - 50} ${q.x} ${q.y}`} fill="none" stroke="#fde68a" strokeWidth="1.6" strokeDasharray="6 5" opacity="0.7" />;
      })}
      {COUNTRY_IDS.map((id) => {
        const d = COUNTRIES[id], c = state.countries[id];
        const lack = lacking(state, id);
        const dead = c.diedRound !== null;
        const danger = !dead && (c.lives < START_LIVES || lack.length > 0);
        const mine = me === id;
        return (
          <g key={id} onClick={onPick ? () => onPick(id) : undefined} style={{ cursor: onPick ? 'pointer' : 'default' }}>
            {id === 'OCE' && ISLETS.map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx={r * 1.3} ry={r} fill={d.color} fillOpacity="0.3" stroke={d.color} strokeWidth="1.5" />)}
            <path d={blob(d.map.x, d.map.y, SHAPES[id])} fill={dead ? '#64748b' : d.color} fillOpacity={dead ? 0.15 : mine ? 0.42 : 0.24} stroke={dead ? '#64748b' : d.color} strokeWidth={mine ? 4 : 2} strokeLinejoin="round" />
            {danger && <circle cx={d.map.x + 70} cy={d.map.y - 48} r="6" fill="#fb7185" className="anim-dot" />}
            <text x={d.map.x} y={d.map.y - 30} textAnchor="middle" fontSize={big ? 30 : 28}>{d.icon}</text>
            <text x={d.map.x} y={d.map.y - 4} textAnchor="middle" fill="#fff" fontSize={big ? 21 : 19} fontWeight="700" stroke="#081326" strokeWidth="4" paintOrder="stroke">{d.short}</text>
            <text x={d.map.x} y={d.map.y + 18} textAnchor="middle" fill="#dbeafe" fontSize="14" stroke="#081326" strokeWidth="3" paintOrder="stroke">{dead ? '💀 멸망 · 국제 구호단' : `${'❤️'.repeat(c.lives)}${'🖤'.repeat(START_LIVES - c.lives)} · 🌱 ${c.env} · 🤝 ${c.trust}`}</text>
            <text x={d.map.x} y={d.map.y + 38} textAnchor="middle" fill={lack.length ? '#fda4af' : '#a7f3d0'} fontSize="13.5" fontWeight="600" stroke="#081326" strokeWidth="3" paintOrder="stroke">
              {state.round === 0 ? d.tagline : dead ? '' : lack.length ? `⚠ ${lack.map((k) => RES_INFO[k].name).join('·')} 부족` : '✓ 필수 자원 확보'}
            </text>
            {mine && <text x={d.map.x} y={d.map.y + 58} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700" stroke="#081326" strokeWidth="3" paintOrder="stroke">▲ 우리 나라</text>}
          </g>
        );
      })}
      <text x="14" y="508" fill="#7b93bd" fontSize="11">※ 게임을 위해 직접 제작한 가상의 세계 지도입니다.</text>
    </svg>
  );
}

export function PeaceGauge({ state, big }: { state: PublicRoom; big?: boolean }) {
  const v = state.peace;
  const delta = useDelta(v, 4000);
  const tone = peaceTone(v);
  const R = 54, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <div className={cx('relative rounded-full shrink-0', delta !== 0 && 'anim-ring')} style={{ ['--ring' as string]: delta > 0 ? '#34d399aa' : '#fb7185aa', width: big ? 200 : 132, height: big ? 200 : 132 }}>
        <svg viewBox="0 0 132 132" className="w-full h-full -rotate-90">
          <circle cx="66" cy="66" r={R} fill="none" stroke="#0a1428" strokeWidth="12" />
          <circle cx="66" cy="66" r={R} fill="none" stroke={tone.color} strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} style={{ transition: 'stroke-dashoffset 1s ease, stroke 1s' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <CountUp value={v} className={cx('font-extrabold leading-none', big ? 'text-6xl' : 'text-4xl')} />
          <span className={cx('font-semibold mt-1', big ? 'text-base' : 'text-xs')} style={{ color: tone.color }}>{tone.label}</span>
        </div>
        {delta !== 0 && (
          <div key={v} className={cx('anim-rise absolute left-1/2 -translate-x-1/2 -top-2 font-extrabold whitespace-nowrap', big ? 'text-3xl' : 'text-lg', delta > 0 ? 'text-emerald-300' : 'text-rose-300')}>
            {delta > 0 ? `▲ +${delta}` : `▼ ${delta}`}
          </div>
        )}
      </div>
      <div className={cx('min-w-0', big ? 'text-base' : 'text-xs')}>
        <div className={cx('font-bold text-sky-200', big ? 'text-xl' : 'text-sm')}>세계 평화 지수</div>
        <div className="text-slate-300 mt-1">살아남은 나라 <b className="text-white">{aliveIds(state).length} / 6</b></div>
        <div className="flex items-end gap-1 mt-2 h-8" aria-label="라운드별 평화 지수 변화">
          {state.peaceHistory.map((h, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5" title={`${h.label}: ${h.value}`}>
              <div className="w-4 rounded-sm" style={{ height: `${Math.max(3, h.value * 0.26)}px`, background: peaceTone(h.value).color }} />
            </div>
          ))}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">{state.peaceHistory.map((h) => `${h.label} ${h.value}`).join(' → ')}</div>
      </div>
    </div>
  );
}

export function PeaceBreakdown({ state }: { state: PublicRoom }) {
  const p = calcPeace(state);
  const rows: [string, number, string][] = [
    ['여섯 나라의 평균 신뢰도', p.trust, '50%'], ['평균 환경', p.env, '25%'], ['남은 목숨 비율', p.life, '25%'],
  ];
  return (
    <div className="space-y-2">
      {rows.map(([name, v, w]) => (
        <div key={name}>
          <div className="flex justify-between text-xs mb-1"><span className="text-slate-300">{name} <span className="text-slate-500">· 반영 {w}</span></span><b className="tnum">{v}</b></div>
          <Bar value={v} color={peaceTone(v).color} />
        </div>
      ))}
    </div>
  );
}

export function NewsFeed({ state, limit = 8 }: { state: PublicRoom; limit?: number }) {
  const list = state.news.slice(-limit).reverse();
  if (!list.length) return <p className="text-sm text-slate-400">아직 뉴스가 없습니다.</p>;
  return (
    <ul className="space-y-2">
      {list.map((n) => (
        <li key={n.id} className={cx('rounded-lg border-l-4 bg-ink-950/50 px-3 py-2', n.tone === 'bad' ? 'border-rose-400' : n.tone === 'good' ? 'border-emerald-400' : 'border-sky-400')}>
          <div className="text-sm font-semibold">{n.tone === 'bad' ? '🔴' : n.tone === 'good' ? '🟢' : '🔵'} {n.title}</div>
          <div className="text-xs text-slate-300 mt-0.5">{n.body}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">ROUND {n.round}</div>
        </li>
      ))}
    </ul>
  );
}

/** 새 뉴스가 오면 화면 위에 잠깐 뜨는 속보 띠 */
export function BreakingBanner({ state }: { state: PublicRoom }) {
  const last = state.news[state.news.length - 1];
  const seen = useRef<string | null>(null);
  const [show, setShow] = useState<typeof last | null>(null);
  useEffect(() => {
    if (!last) return;
    if (seen.current === null) { seen.current = last.id; return; }
    if (seen.current === last.id) return;
    seen.current = last.id;
    setShow(last);
    const t = setTimeout(() => setShow(null), 7000);
    return () => clearTimeout(t);
  }, [last?.id]);
  if (!show) return null;
  return (
    <button onClick={() => setShow(null)} className={cx('no-print anim-pop w-full text-left rounded-xl px-4 py-2.5 border', show.tone === 'bad' ? 'bg-rose-950/90 border-rose-500' : show.tone === 'good' ? 'bg-emerald-950/90 border-emerald-500' : 'bg-sky-950/90 border-sky-500')}>
      <div className="flex items-center gap-2 text-sm font-bold"><span className="anim-breaking rounded bg-white/15 px-1.5 py-0.5 text-[10px] tracking-widest">뉴스 속보</span><span className="truncate">{show.title}</span></div>
      <div className="text-xs text-slate-200 mt-0.5">{show.body}</div>
    </button>
  );
}

export function CountryTable({ state, me }: { state: PublicRoom; me?: CountryId }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs tnum min-w-[560px]">
        <thead>
          <tr className="text-slate-400 text-left">
            <th className="py-1.5 px-1 font-medium">국가</th>
            {RES.map((k) => <th key={k} className="px-1 font-medium text-right" title={RES_INFO[k].name}>{RES_INFO[k].icon}<span className="hidden sm:inline"> {RES_INFO[k].name}</span></th>)}
            <th className="px-1 font-medium text-right">목숨</th><th className="px-1 font-medium text-right">🌱</th><th className="px-1 font-medium text-right">🤝</th>
            <th className="px-1 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          {COUNTRY_IDS.map((id) => {
            const c = state.countries[id];
            const lack = lacking(state, id);
            const live = state.phase === 'running' || state.phase === 'paused';
            return (
              <tr key={id} className={cx('border-t border-line/60', me === id && 'bg-sky-500/10')}>
                <td className="py-1.5 px-1"><CountryTag id={id} /></td>
                {RES.map((k) => {
                  const short = (VITALS as string[]).includes(k) && lack.includes(k as never);
                  return <td key={k} className={cx('px-1 text-right', short && 'text-rose-300 font-bold')}>{c.stock[k]}{live && (VITALS as string[]).includes(k) && <span className="text-slate-500">/{c.need[k as 'food']}</span>}</td>;
                })}
                <td className="px-1 text-right"><Hearts lives={c.lives} dead={c.diedRound !== null} text={false} /></td>
                <td className="px-1 text-right">{c.env}</td><td className="px-1 text-right">{c.trust}</td>
                <td className="px-1">{state.round === 0 ? <Badge tone="mute">대기</Badge> : c.diedRound !== null ? <Badge tone="mute">💀 R{c.diedRound} 멸망</Badge> : lack.length ? <Badge tone="bad">⚠ 부족</Badge> : <Badge tone="good">✓ 안정</Badge>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-500 mt-1.5 px-1">식량·물·에너지는 라운드 진행 중 "보유량/이번 라운드 필요량"으로 표시됩니다. 붉은 숫자는 부족을 뜻합니다.</p>
    </div>
  );
}

export function AgreementList({ state, limit }: { state: PublicRoom; limit?: number }) {
  const list = (limit ? state.agreements.slice(-limit) : state.agreements).slice().reverse();
  if (!list.length) return <p className="text-sm text-slate-400">아직 체결된 협정이 없습니다.</p>;
  return (
    <ul className="space-y-2">
      {list.map((a) => (
        <li key={a.id} className="rounded-lg bg-ink-950/50 px-3 py-2 text-xs">
          <div className="font-semibold text-sm text-amber-200">📜 {a.title} <span className="text-slate-500 font-normal">· R{a.round}</span></div>
          <div className="flex flex-wrap gap-x-2 mt-0.5">{a.parties.map((p) => <CountryTag key={p} id={p} />)}</div>
          <div className="text-slate-300 mt-0.5">{a.text}</div>
        </li>
      ))}
    </ul>
  );
}
