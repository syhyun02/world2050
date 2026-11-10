// 전자칠판용 세계 현황판 (전체 화면)
import { COUNTRIES, COUNTRY_IDS, RES, RES_INFO, ROUNDS } from '../../../shared/data';
import { lacking, projectInfo } from '../../../shared/engine';
import { AgreementList, PeaceGauge, WorldMap } from '../components/World';
import { ResultsPanel } from './Student';
import { useRoom } from '../lib/net';
import { Badge, Clock, ConnBadge, cx, Hearts, phaseLabel } from '../lib/ui';

export default function Board({ code }: { code: string }) {
  const conn = useRoom('board', code);
  const { state, status } = conn;
  if (status === 'gone') return <div className="h-full flex items-center justify-center text-2xl">게임방을 찾을 수 없습니다. 방 코드를 확인하세요.</div>;
  if (!state) return <div className="h-full flex items-center justify-center text-2xl text-slate-300">세계 현황판 연결 중…</div>;
  const def = ROUNDS[state.round];
  const news = state.news.slice(-6).reverse();
  const latest = news[0];
  const players = Object.values(state.players);
  const fs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());

  return (
    <div className="min-h-full flex flex-col p-3 lg:p-5 gap-3 grid-bg">
      <header className="flex items-center gap-4">
        <div>
          <p className="text-xs lg:text-sm tracking-[0.3em] text-sky-300">WORLD 2050 · 세계 현황판</p>
          <h1 className="text-2xl lg:text-4xl font-extrabold">{state.className} <span className="text-sky-200">{phaseLabel(state)}</span></h1>
        </div>
        <div className="flex-1 hidden md:block">
          {def && state.phase !== 'finished' && <p className="text-lg lg:text-2xl font-semibold text-amber-200">{def.title} — {def.crisis}</p>}
          <div className="flex gap-1.5 mt-1.5" aria-label="라운드 진행 상황">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className={cx('flex-1 max-w-28 rounded-md px-2 py-1 text-xs lg:text-sm font-semibold border', n < state.round || state.phase === 'finished' ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200' : n === state.round ? 'bg-sky-500/25 border-sky-400 text-white' : 'bg-ink-800 border-line text-slate-500')}>
                {n < state.round || state.phase === 'finished' ? '✓ ' : n === state.round ? '▶ ' : ''}R{n} {ROUNDS[n].title}
              </div>
            ))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs lg:text-sm text-slate-300">남은 협상 시간</div>
          <Clock state={state} offset={conn.offset} className="text-5xl lg:text-7xl font-extrabold leading-none" pausedPrefix="⏸ " />
        </div>
        <div className="flex flex-col items-end gap-1 no-print">
          <ConnBadge status={status} />
          <button onClick={fs} className="text-xs text-slate-400 underline">전체 화면</button>
        </div>
      </header>

      {latest && (
        <div key={latest.id} className={cx('anim-pop rounded-xl border px-4 py-2.5 flex items-center gap-3 overflow-hidden', latest.tone === 'bad' ? 'bg-rose-950/80 border-rose-500' : latest.tone === 'good' ? 'bg-emerald-950/80 border-emerald-500' : 'bg-sky-950/80 border-sky-500')}>
          <span className="anim-breaking shrink-0 rounded bg-white text-ink-950 px-2 py-0.5 text-sm lg:text-base font-extrabold">뉴스 속보</span>
          <div className="min-w-0"><div className="text-lg lg:text-2xl font-bold truncate">{latest.title}</div><div className="text-sm lg:text-base text-slate-200 truncate">{latest.body}</div></div>
        </div>
      )}

      <div className="flex-1 grid lg:grid-cols-[1.9fr_1fr] gap-3 min-h-0">
        <div className="panel p-3 flex flex-col gap-3 overflow-y-auto">
          {state.phase === 'finished' && state.results ? <ResultsPanel state={state} /> : <WorldMap state={state} big />}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            {COUNTRY_IDS.map((id) => {
              const c = state.countries[id], d = COUNTRIES[id];
              const lack = lacking(state, id);
              return (
                <div key={id} className="rounded-xl bg-ink-950/60 border p-2.5" style={{ borderColor: `${d.color}99` }}>
                  <div className="font-bold text-sm lg:text-base truncate" style={{ color: d.color }}>{d.icon} {d.short}</div>
                  <div className="grid grid-cols-4 gap-0.5 mt-1.5 text-center tnum">
                    {RES.map((k) => <div key={k} className={cx('rounded bg-ink-800 py-0.5', lack.includes(k as never) && 'bg-rose-500/30 text-rose-200')}><div className="text-[11px]" title={RES_INFO[k].name}>{RES_INFO[k].icon}</div><div className="text-sm lg:text-base font-bold">{c.stock[k]}</div></div>)}
                  </div>
                  <div className="text-[11px] lg:text-sm mt-1.5 text-slate-300 tnum"><Hearts lives={c.lives} dead={c.diedRound !== null} /> · 🌱 {c.env} 🤝 {c.trust}</div>
                  <div className="mt-1">{state.round === 0 ? <Badge tone="mute">{players.filter((p) => p.country === id).length}명 입장</Badge> : c.diedRound !== null ? <Badge tone="mute">국제 구호단</Badge> : lack.length ? <Badge tone="bad">⚠ {lack.map((k) => RES_INFO[k].name).join('·')} 부족</Badge> : <Badge tone="good">✓ 안정</Badge>}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 min-h-0">
          <div className="panel p-4"><PeaceGauge state={state} big /></div>
          {state.phase === 'lobby' && (
            <div className="panel p-4 text-center">
              <div className="text-sm text-slate-300">접속 주소 <b className="text-white">{location.host}</b></div>
              <div className="text-sm text-slate-400 mt-2">방 코드</div>
              <div className="text-6xl font-extrabold tracking-[0.25em] text-sky-200">{state.code}</div>
              <div className="text-sm text-slate-300 mt-2">국가 참가 코드는 선생님께 받으세요 · 현재 {players.length}명 입장</div>
            </div>
          )}
          {state.project && (
            <div className="panel p-4">
              <div className="font-bold text-sky-200">🌐 {ROUNDS[state.round].project!.name}</div>
              <div className="text-3xl font-extrabold tnum mt-1">{state.project.joined.length} <span className="text-lg text-slate-400">/ {projectInfo(state).need}개국 참여</span></div>
              <div className="text-sm text-slate-300">{state.project.joined.map((id) => COUNTRIES[id].short).join(' · ') || '아직 참여한 나라가 없습니다'}</div>
              <div className="h-3 rounded-full bg-ink-950 mt-2 overflow-hidden"><div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${Math.min(100, (state.project.joined.length / projectInfo(state).need) * 100)}%` }} /></div>
            </div>
          )}
          <div className="panel p-4 flex-1 min-h-40 overflow-y-auto">
            <div className="font-bold text-sky-200 mb-2">📜 체결된 국제 협정 ({state.agreements.length})</div>
            <AgreementList state={state} limit={6} />
          </div>
        </div>
      </div>

      <footer className="rounded-xl bg-ink-950/80 border border-line overflow-hidden whitespace-nowrap py-2">
        <div className="inline-block anim-ticker text-sm lg:text-lg">
          {[0, 1].map((k) => <span key={k}>{(news.length ? news : [{ id: 'x', title: '2050년, 세계는 협력을 기다리고 있습니다', body: '' }]).map((n) => <span key={n.id + k} className="mx-8">📰 {n.title}</span>)}</span>)}
        </div>
      </footer>
    </div>
  );
}
