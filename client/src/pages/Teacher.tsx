// 교사용 관리자 대시보드
import { useCallback, useEffect, useState } from 'react';
import { COUNTRIES, COUNTRY_IDS, POLICIES, RES, RES_INFO, ROUNDS, TEACHER_EVENTS, VITALS } from '../../../shared/data';
import type { CountryId, PublicRoom, Reflection, Results, Room } from '../../../shared/types';
import { Rules } from '../components/Learn';
import { aliveIds, projectInfo } from '../../../shared/engine';
import { CountryReport, download, downloadCsv } from '../components/Report';
import { AgreementList, CountryTable, NewsFeed, PeaceGauge } from '../components/World';
import { api, fmtTime, nav, teacherAuth, useRemaining, useRoom } from '../lib/net';
import { Badge, Btn, ConnBadge, CountryTag, cx, Panel, phaseLabel, useAction, useToast } from '../lib/ui';
import { ProposalCard, ResultsPanel } from './Student';

interface Summary { code: string; className: string; phase: PublicRoom['phase']; round: number; peace: number; players: number; online: number; durationSec: number; results: Results | null; peaceHistory: PublicRoom['peaceHistory'] }

export default function Teacher({ code }: { code?: string }) {
  const [token, setToken] = useState(teacherAuth.get());
  const logout = useCallback(() => { teacherAuth.clear(); setToken(null); }, []);
  if (!token) return <Login onDone={(t) => { teacherAuth.set(t); setToken(t); }} />;
  return code ? <RoomDash code={code} token={token} logout={logout} /> : <RoomList token={token} logout={logout} />;
}

function Login({ onDone }: { onDone: (t: string) => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { onDone((await api<{ token: string }>('/teacher/login', { body: { password: pw } })).token); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <form onSubmit={submit} className="panel p-6 w-full max-w-sm">
        <p className="text-xs tracking-widest text-sky-300">WORLD 2050</p>
        <h1 className="text-xl font-extrabold mt-1">교사용 관리자 로그인</h1>
        <label htmlFor="pw" className="block text-sm text-slate-300 mt-4">관리자 비밀번호</label>
        <input id="pw" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1 w-full rounded-lg bg-ink-950/60 border border-line px-3 py-2.5" autoComplete="current-password" />
        {err && <p className="text-sm text-rose-300 mt-2">⚠ {err}</p>}
        <Btn type="submit" className="w-full mt-4" disabled={busy || !pw}>로그인</Btn>
        <button type="button" className="text-xs text-slate-400 underline mt-4" onClick={() => nav('/')}>← 학생 입장 화면으로</button>
      </form>
    </div>
  );
}

function RoomList({ token, logout }: { token: string; logout: () => void }) {
  const [rooms, setRooms] = useState<Summary[] | null>(null);
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(5);
  const toast = useToast();
  const load = useCallback(async () => {
    try { setRooms((await api<{ rooms: Summary[] }>('/teacher/rooms', { token })).rooms); }
    catch (e) { if ((e as { status?: number }).status === 401) logout(); else toast((e as Error).message, 'err'); }
  }, [token, logout, toast]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api('/teacher/rooms', { token, body: { className: name, minutes } }); setName(''); toast('게임방을 만들었습니다.'); load(); }
    catch (e) { toast((e as Error).message, 'err'); }
  };
  const remove = async (r: Summary) => {
    if (!confirm(`"${r.className}" 게임방을 삭제할까요?\n게임 기록과 학생 성찰이 모두 사라지며 되돌릴 수 없습니다.`)) return;
    try { await api(`/teacher/rooms/${r.code}`, { token, method: 'DELETE' }); load(); } catch (e) { toast((e as Error).message, 'err'); }
  };
  const done = rooms?.filter((r) => r.results) ?? [];
  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div><p className="text-xs tracking-widest text-sky-300">WORLD 2050 · 교사용</p><h1 className="text-2xl font-extrabold">학급 게임방 관리</h1></div>
        <Btn small tone="ghost" onClick={logout}>로그아웃</Btn>
      </header>

      <Panel title="➕ 새 게임방 만들기">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">학급 이름<input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="예: 2학년 3반" required className="block mt-1 rounded-lg bg-ink-950/60 border border-line px-3 py-2 w-48" /></label>
          <label className="text-sm">라운드당 시간
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="block mt-1 rounded-lg bg-ink-950/60 border border-line px-3 py-2">
              {[3, 4, 5, 6, 8, 10].map((m) => <option key={m} value={m}>{m}분 (전체 약 {m * 5 + 15}분)</option>)}
            </select>
          </label>
          <Btn type="submit">게임방 만들기</Btn>
        </form>
        <p className="text-xs text-slate-400 mt-2">학급마다 방을 하나씩 만드세요. 방끼리는 완전히 독립적으로 진행됩니다. 시간은 게임 중에도 바꿀 수 있습니다.</p>
      </Panel>

      <Panel title={`🏫 게임방 목록 (${rooms?.length ?? 0})`}>
        {!rooms ? <p className="text-sm text-slate-400">불러오는 중…</p> : rooms.length === 0 ? <p className="text-sm text-slate-400">아직 게임방이 없습니다. 위에서 학급 게임방을 만들어 보세요.</p> : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {rooms.map((r) => (
              <li key={r.code} className="rounded-xl border border-line bg-ink-950/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-bold text-lg">{r.className}</div><div className="text-xs text-slate-400">방 코드 <b className="text-sky-200 tracking-widest text-sm">{r.code}</b></div></div>
                  <Badge tone={r.phase === 'finished' ? 'good' : r.phase === 'lobby' ? 'mute' : 'warn'}>{phaseLabel(r as unknown as PublicRoom)}</Badge>
                </div>
                <div className="text-xs text-slate-300 mt-2">참가 {r.players}명 (접속 {r.online}명) · 라운드 {Math.round(r.durationSec / 60)}분</div>
                <div className="flex gap-2 mt-3">
                  <Btn small onClick={() => nav(`/teacher/${r.code}`)}>관리 화면 열기</Btn>
                  <Btn small tone="ghost" onClick={() => window.open(`/board/${r.code}`, '_blank')}>전자칠판 화면</Btn>
                  <Btn small tone="ghost" className="ml-auto !text-rose-300" onClick={() => remove(r)}>삭제</Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="📊 학급별 결과 비교">
        {done.length === 0 ? <p className="text-sm text-slate-400">게임을 마친 학급이 생기면 이곳에서 결과를 비교할 수 있습니다.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tnum min-w-[640px]">
              <thead><tr className="text-left text-slate-400 text-xs"><th className="py-1.5">학급</th><th>1위</th><th>살아남은 나라</th><th>멸망한 나라</th><th>공동 대응</th><th>분쟁</th><th>협약</th></tr></thead>
              <tbody>
                {done.map((r) => {
                  const w = r.results!.world;
                  return (
                    <tr key={r.code} className="border-t border-line/60">
                      <td className="py-2 font-semibold">{r.className}</td>
                      <td><CountryTag id={r.results!.ranking[0]} /></td>
                      <td>{w.survivors}/6</td><td>{COUNTRY_IDS.filter((id) => r.results!.countries[id].diedRound !== null).map((id) => `${COUNTRIES[id].short}(R${r.results!.countries[id].diedRound})`).join(', ') || '없음'}</td><td>{w.projects}/3</td><td>{{ peace: '평화적 해결', failed: '실패', none: '일어나지 않음' }[w.dispute]}</td>
                      <td>{w.treatyAdopted ? `채택 (${w.treatyClauses}조항)` : '무산'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-500 mt-2">※ 학급마다 어떤 나라가 왜 무너졌는지 비교하며 토의하는 자료로 활용하세요.</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

type TTab = 'status' | 'deals' | 'log' | 'events' | 'tools' | 'report' | 'guide';

function RoomDash({ code, token, logout }: { code: string; token: string; logout: () => void }) {
  const conn = useRoom('teacher', code, token);
  const { state, teacher, status, cmd } = conn;
  const remaining = useRemaining(state, conn.offset);
  const { run, busy } = useAction(cmd);
  const [tab, setTab] = useState<TTab>('status');
  useEffect(() => { if (status === 'denied') logout(); }, [status, logout]);
  if (status === 'gone') return <div className="p-8 text-center"><p>게임방을 찾을 수 없습니다.</p><Btn className="mt-3" onClick={() => nav('/teacher')}>목록으로</Btn></div>;
  if (!state) return <div className="p-8 text-center text-slate-300">연결 중…</div>;
  const players = Object.values(state.players);
  const def = ROUNDS[state.round];
  const next: { label: string; hint: string; go: () => void; tone?: 'good' | 'primary' } | null =
    state.phase === 'lobby' ? { label: '▶ 게임 시작 (ROUND 1)', hint: '모든 국가에 학생이 입장했는지 확인한 뒤 시작하세요.', go: () => run('start', {}, 'ROUND 1을 시작했습니다.'), tone: 'good' }
    : state.phase === 'roundEnd' ? { label: `▶ ROUND ${state.round + 1} 시작`, hint: '결산 내용을 함께 살펴본 뒤 다음 라운드를 시작하세요.', go: () => run('nextRound', {}, `ROUND ${state.round + 1}을 시작했습니다.`), tone: 'good' }
    : state.phase === 'paused' ? { label: '▶ 재개', hint: '일시정지 중입니다. 학생 화면의 모든 행동이 잠겨 있습니다.', go: () => run('resume', {}, '게임을 재개했습니다.'), tone: 'good' }
    : null;
  const tabs: [TTab, string][] = [['status', '국가 현황'], ['deals', '거래·약속'], ['log', '활동 기록'], ['events', '국제 사건'], ['tools', '복구·설정'], ['report', '결과·보고서'], ['guide', '규칙']];

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-4 space-y-3">
      <header className="no-print flex flex-wrap items-center gap-3">
        <button className="text-sm text-slate-300 underline" onClick={() => nav('/teacher')}>← 게임방 목록</button>
        <h1 className="text-xl font-extrabold flex-1 min-w-0 truncate">{state.className} <span className="text-sm font-normal text-slate-400">교사용 관리 화면</span></h1>
        <ConnBadge status={status} />
        <Btn small tone="ghost" onClick={() => window.open(`/board/${code}`, '_blank')}>🖥️ 전자칠판 화면 열기</Btn>
      </header>

      <section className="no-print panel p-4 grid md:grid-cols-[1fr_auto] gap-4 items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={state.phase === 'running' ? 'good' : state.phase === 'paused' ? 'warn' : 'info'}>{phaseLabel(state)}</Badge>
            {def && state.phase !== 'finished' && <span className="text-sm font-semibold">{def.title} — {def.crisis}</span>}
            <span className="flex gap-1 ml-auto md:ml-2" aria-label="라운드 진행">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={cx('w-7 h-2 rounded-full', n < state.round || state.phase === 'finished' ? 'bg-emerald-400' : n === state.round ? 'bg-sky-400' : 'bg-ink-600')} />)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {next && <Btn tone={next.tone} disabled={busy} onClick={next.go} className="!text-base !px-5">{next.label}</Btn>}
            {state.phase === 'running' && (
              <>
                <Btn tone="ghost" disabled={busy} onClick={() => run('pause', {}, '일시정지했습니다.')}>⏸ 일시정지</Btn>
                <Btn tone="ghost" disabled={busy} onClick={() => run('addTime', { sec: 60 }, '1분을 추가했습니다.')}>+1분</Btn>
                <Btn tone="ghost" disabled={busy} onClick={() => run('addTime', { sec: -60 }, '1분을 줄였습니다.')}>−1분</Btn>
              </>
            )}
            {(state.phase === 'running' || state.phase === 'paused') && (
              <Btn tone="danger" disabled={busy} onClick={() => { if (confirm(`ROUND ${state.round}을 지금 종료하고 결산할까요?`)) run('endRound', {}, `ROUND ${state.round}을 종료했습니다.`); }}>⏹ 라운드 종료·결산</Btn>
            )}
            {state.phase === 'finished' && <Btn onClick={() => setTab('report')}>📊 결과와 보고서 보기</Btn>}
          </div>
          <p className="text-xs text-slate-400 mt-2">{next?.hint ?? (state.phase === 'running' ? '제한 시간이 끝나면 자동으로 결산됩니다. 자원이 모자란 나라는 목숨을 잃습니다. 서로 찾아가 협상하도록 안내하세요.' : state.phase === 'finished' ? '게임이 끝났습니다. 전자칠판의 순위와 결과 분석으로 토의한 뒤, 학생들에게 성찰을 작성하도록 안내하세요.' : '')}</p>
        </div>
        <div className="flex items-center gap-5 justify-between">
          <div className="text-center"><div className="text-xs text-slate-400">남은 시간</div><div className={cx('text-4xl font-extrabold tnum', remaining !== null && remaining < 60000 && 'text-rose-300')}>{fmtTime(remaining)}</div></div>
          <div className="text-center"><div className="text-xs text-slate-400">살아남은 나라</div><div className="text-4xl font-extrabold tnum">{aliveIds(state).length}<span className="text-lg text-slate-400">/6</span></div></div>
          <div className="text-center"><div className="text-xs text-slate-400">접속</div><div className="text-4xl font-extrabold tnum">{players.filter((p) => p.online).length}<span className="text-lg text-slate-400">/{players.length}</span></div></div>
        </div>
      </section>

      <JoinInfo state={state} codes={teacher?.joinCodes} cmd={cmd} />

      <nav className="no-print flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(([id, l]) => <button key={id} onClick={() => setTab(id)} className={cx('px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2', tab === id ? 'border-sky-400 text-white' : 'border-transparent text-slate-400')}>{l}</button>)}
      </nav>

      {tab === 'status' && (
        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-3">
          <div className="space-y-3">
            <Panel title="📊 국가별 자원과 지표 (실시간)"><CountryTable state={state} /><CountryExtras state={state} /></Panel>
            {state.project && <Panel title={`🌐 공동 대응: ${ROUNDS[state.round].project!.name}`}><p className="text-sm">참여 <b className="tnum">{state.project.joined.length} / {projectInfo(state).need}개국</b> — {state.project.joined.map((id) => COUNTRIES[id].short).join(', ') || '아직 참여국 없음'}</p></Panel>}
            {state.dispute && <Panel title="⚖️ 미르강 분쟁"><p className="text-sm">입장 확정: {state.dispute.parties.map((id) => `${COUNTRIES[id].short} ${state.dispute!.stances[id] ? '✓' : '미정'}`).join(' · ')} / 중재국: {state.dispute.mediators.map((m) => COUNTRIES[m].short).join(', ') || '없음'}</p>{state.dispute.resultText && <p className="text-sm text-slate-300 mt-1">{state.dispute.resultText}</p>}</Panel>}
            {state.quizStats[state.round] && <Panel title="🧠 이번 라운드 퀴즈"><p className="text-sm">응답 {state.quizStats[state.round].answered}명 · 정답 {state.quizStats[state.round].correct}명</p></Panel>}
          </div>
          <div className="space-y-3">
            <Panel title="📰 국제 뉴스"><NewsFeed state={state} limit={5} /></Panel>
          </div>
        </div>
      )}
      {tab === 'deals' && (
        <div className="grid lg:grid-cols-2 gap-3">
          <Panel title={`💱 거래·지원 제안 내역 (${state.proposals.length})`}>
            {state.proposals.length === 0 ? <p className="text-sm text-slate-400">아직 제안이 없습니다.</p> : <ul className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">{state.proposals.slice().reverse().map((p) => <ProposalCard key={p.id} p={p} state={state} canAct={false} cmd={cmd} />)}</ul>}
          </Panel>
          <Panel title={`📜 함께 맺은 약속 (${state.agreements.length})`}><AgreementList state={state} /></Panel>
        </div>
      )}
      {tab === 'log' && <LogPanel state={state} />}
      {tab === 'events' && (
        <Panel title="🌪️ 국제 사건 발동">
          <p className="text-xs text-slate-400 mb-3">라운드의 기본 사건은 자동으로 발생합니다. 수업 흐름에 따라 아래 돌발 사건을 추가로 발동할 수 있습니다. (라운드 진행 중에만 가능)</p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {TEACHER_EVENTS.map((ev) => (
              <li key={ev.id} className="rounded-xl border border-line bg-ink-950/40 p-3">
                <div className="font-semibold text-sm">{ev.tone === 'bad' ? '🔴' : '🟢'} {ev.title}</div>
                <p className="text-xs text-slate-300 mt-0.5">{ev.body}</p>
                <Btn small tone="ghost" className="mt-2" disabled={busy || (state.phase !== 'running' && state.phase !== 'paused')} onClick={() => { if (confirm(`"${ev.title}" 사건을 발동할까요?`)) run('triggerEvent', { id: ev.id }, `${ev.title} 발동`); }}>발동하기</Btn>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {tab === 'tools' && <Tools state={state} code={code} token={token} snapshots={teacher?.snapshots ?? []} cmd={cmd} />}
      {tab === 'report' && <ReportTools state={state} code={code} token={token} />}
      {tab === 'guide' && <Panel title="📘 게임 규칙과 점수 계산 (학생에게도 공개됨)"><Rules /></Panel>}
    </div>
  );
}

function JoinInfo({ state, codes, cmd }: { state: PublicRoom; codes?: Record<CountryId, string>; cmd: (n: string, a?: Record<string, unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(state.phase === 'lobby');
  const { run } = useAction(cmd);
  const players = Object.values(state.players);
  return (
    <Panel title="🎟️ 입장 안내와 참가자" right={<Btn small tone="ghost" onClick={() => setOpen((v) => !v)}>{open ? '접기' : '펼치기'}</Btn>} className="no-print">
      {!open ? <p className="text-sm text-slate-400">방 코드 <b className="text-sky-200 tracking-widest">{state.code}</b> · 참가 {players.length}명</p> : (
        <>
          <p className="text-sm text-slate-300">학생들은 <b className="text-white">{location.host}</b> 에 접속해 <b>방 코드</b>와 자기 <b>국가 참가 코드</b>를 입력합니다. 국가 코드는 해당 모둠에만 알려 주세요.</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="rounded-xl bg-ink-950/60 border border-sky-500/50 px-5 py-3 text-center"><div className="text-xs text-slate-400">방 코드</div><div className="text-4xl font-extrabold tracking-[0.3em] text-sky-200">{state.code}</div></div>
            <p className="text-xs text-slate-400 max-w-xs">각 국가에 가장 먼저 입장한 학생이 <b>대표</b>가 됩니다. 아래에서 대표를 바꿀 수 있습니다. 학생은 닉네임만 입력하며 개인정보는 수집하지 않습니다.</p>
          </div>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
            {COUNTRY_IDS.map((id) => {
              const ms = players.filter((p) => p.country === id);
              return (
                <li key={id} className="rounded-xl border bg-ink-950/40 p-3" style={{ borderColor: `${COUNTRIES[id].color}88` }}>
                  <div className="flex items-center justify-between"><CountryTag id={id} full /><span className="text-xs text-slate-400">{ms.length}명</span></div>
                  <div className="text-2xl font-extrabold tracking-[0.25em] mt-1">{codes?.[id] ?? '····'}</div>
                  <ul className="mt-2 space-y-1">
                    {ms.length === 0 && <li className="text-xs text-rose-300">⚠ 아직 입장한 학생이 없습니다</li>}
                    {ms.map((m) => (
                      <li key={m.id} className="flex items-center gap-1.5 text-xs">
                        <span className={m.online ? 'text-emerald-400' : 'text-slate-500'}>{m.online ? '●' : '○'}</span><span className="truncate">{m.nick}</span>
                        {state.countries[id].delegate === m.id ? <Badge tone="warn">★ 대표</Badge> : <button className="text-sky-300 underline" onClick={() => run('setDelegate', { pid: m.id }, `${m.nick}을(를) 대표로 지정했습니다.`)}>대표 지정</button>}
                        <button className="ml-auto text-slate-500 hover:text-rose-300" title="내보내기" onClick={() => { if (confirm(`${m.nick}을(를) 내보낼까요?`)) run('removePlayer', { pid: m.id }); }}>✕</button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

function CountryExtras({ state }: { state: PublicRoom }) {
  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs tnum min-w-[520px]">
        <thead><tr className="text-left text-slate-400"><th className="py-1">국가</th><th>정책 카드</th><th>라운드당 생산 (💰/🌾/💧/⚡)</th><th>부족 예상</th><th>대표</th></tr></thead>
        <tbody>
          {COUNTRY_IDS.map((id) => {
            const c = state.countries[id];
            const lack = state.phase === 'running' || state.phase === 'paused' ? VITALS.filter((k) => c.stock[k] < c.need[k]) : [];
            const del = c.delegate ? state.players[c.delegate] : null;
            return (
              <tr key={id} className="border-t border-line/60">
                <td className="py-1.5"><CountryTag id={id} /></td><td>{c.diedRound !== null ? (c.reliefDone ? '구호 지원 완료' : '국제 구호단') : c.policy ? `✓ ${POLICIES.find((x) => x.id === c.policy!.id)?.name ?? ''}` : state.phase === 'running' ? <span className="text-amber-300">미선택</span> : '—'}</td><td>{RES.map((k) => c.prod[k]).join(' / ')}</td>
                <td className={lack.length ? 'text-rose-300' : 'text-slate-400'}>{lack.map((k) => `${RES_INFO[k].name} −${c.need[k] - c.stock[k]}`).join(', ') || '없음'}</td>
                <td>{del ? <span className={del.online ? '' : 'text-rose-300'}>{del.nick}{del.online ? '' : ' (접속 끊김)'}</span> : <span className="text-rose-300">없음</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LogPanel({ state }: { state: PublicRoom }) {
  const [f, setF] = useState<CountryId | 'ALL'>('ALL');
  const list = state.log.filter((l) => f === 'ALL' || l.country === f || l.text.includes(COUNTRIES[f].short)).slice().reverse();
  return (
    <Panel title={`🗒️ 활동 기록 (${list.length})`} right={
      <select value={f} onChange={(e) => setF(e.target.value as CountryId | 'ALL')} className="rounded-lg bg-ink-950/60 border border-line px-2 py-1 text-xs" aria-label="국가 필터">
        <option value="ALL">모든 국가</option>{COUNTRY_IDS.map((id) => <option key={id} value={id}>{COUNTRIES[id].short}</option>)}
      </select>}>
      <ul className="text-xs space-y-1 max-h-[70vh] overflow-y-auto">
        {list.map((l, i) => (
          <li key={i} className="flex gap-2 border-b border-line/40 pb-1">
            <span className="text-slate-500 tnum shrink-0">{new Date(l.t).toLocaleTimeString('ko-KR', { hour12: false })}</span>
            <span className="text-slate-400 shrink-0">R{l.round}</span>
            {l.country && <span className="shrink-0"><CountryTag id={l.country} /></span>}
            <span className="text-slate-200">{l.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Tools({ state, code, token, snapshots, cmd }: { state: PublicRoom; code: string; token: string; snapshots: number[]; cmd: (n: string, a?: Record<string, unknown>) => Promise<void> }) {
  const { run, busy } = useAction(cmd);
  const toast = useToast();
  const [country, setCountry] = useState<CountryId>('ARC');
  const [key, setKey] = useState('eco');
  const [delta, setDelta] = useState(5);
  const restore = async (n: number) => {
    if (!confirm(`ROUND ${n} 시작 시점으로 되돌릴까요?\n그 이후의 행동·거래 기록은 사라집니다. (참가자와 성찰은 유지, 일시정지 상태로 복구)`)) return;
    try { await api(`/teacher/rooms/${code}/restore`, { token, body: { round: n } }); toast(`ROUND ${n} 시작 시점으로 복구했습니다. "재개"를 눌러 진행하세요.`); } catch (e) { toast((e as Error).message, 'err'); }
  };
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Panel title="⏱ 라운드 제한 시간">
        <div className="flex flex-wrap gap-2">
          {[3, 4, 5, 6, 8, 10].map((m) => <Btn key={m} small tone={state.durationSec === m * 60 ? 'primary' : 'ghost'} disabled={busy} onClick={() => run('setDuration', { sec: m * 60 }, `다음 라운드부터 ${m}분으로 진행합니다.`)}>{m}분</Btn>)}
        </div>
        <p className="text-xs text-slate-400 mt-2">다음에 시작하는 라운드부터 적용됩니다. 진행 중인 라운드는 위쪽의 +1분 / −1분으로 조절하세요.</p>
      </Panel>
      <Panel title="🛟 오류 복구: 라운드 시작 시점으로 되돌리기">
        {snapshots.length === 0 ? <p className="text-sm text-slate-400">게임이 시작되면 라운드마다 복구 지점이 자동으로 저장됩니다.</p> : (
          <div className="flex flex-wrap gap-2">{snapshots.map((n) => <Btn key={n} small tone="ghost" onClick={() => restore(n)}>ROUND {n} 시작으로</Btn>)}</div>
        )}
        <p className="text-xs text-slate-400 mt-2">게임 상태는 변경될 때마다 서버에 자동 저장되므로, 서버가 재시작되어도 이어서 진행할 수 있습니다.</p>
      </Panel>
      <Panel title="🔧 수동 조정 (실수 보정용)">
        <div className="flex flex-wrap items-end gap-2">
          <select value={country} onChange={(e) => setCountry(e.target.value as CountryId)} className="rounded-lg bg-ink-950/60 border border-line px-2 py-2 text-sm" aria-label="국가">{COUNTRY_IDS.map((id) => <option key={id} value={id}>{COUNTRIES[id].short}</option>)}</select>
          <select value={key} onChange={(e) => setKey(e.target.value)} className="rounded-lg bg-ink-950/60 border border-line px-2 py-2 text-sm" aria-label="항목">
            {RES.map((k) => <option key={k} value={k}>{RES_INFO[k].name}</option>)}<option value="lives">목숨</option><option value="env">환경</option><option value="trust">신뢰도</option>
          </select>
          <input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} className="w-20 rounded-lg bg-ink-950/60 border border-line px-2 py-2 text-sm" aria-label="변화량" />
          <Btn small tone="ghost" disabled={busy} onClick={() => run('adjust', { country, key, delta: Math.round(delta) }, '조정했습니다. 활동 기록에 남습니다.')}>적용</Btn>
        </div>
        <p className="text-xs text-slate-400 mt-2">양수는 증가, 음수는 감소입니다. 모든 조정은 활동 기록에 남습니다.</p>
      </Panel>
      <Panel title="♻️ 게임 초기화">
        <p className="text-xs text-slate-300">같은 방에서 처음부터 다시 시작합니다. 참가자·참가 코드는 유지되고, 게임 기록과 성찰은 지워집니다.</p>
        <Btn small tone="danger" className="mt-2" disabled={busy} onClick={() => { if (confirm('게임을 처음 상태로 초기화할까요?\n지금까지의 게임 기록이 모두 사라집니다.') && confirm('정말 초기화합니다. 결과를 저장하려면 먼저 "결과·보고서"에서 내려받으세요.')) run('reset', {}, '게임을 초기화했습니다.'); }}>게임 초기화 및 재시작</Btn>
      </Panel>
    </div>
  );
}

function ReportTools({ state, code, token }: { state: PublicRoom; code: string; token: string }) {
  const toast = useToast();
  const [full, setFull] = useState<Room | null>(null);
  const [show, setShow] = useState<CountryId | 'ALL' | null>(null);
  const load = async () => {
    try { const r = (await api<{ room: Room }>(`/teacher/rooms/${code}/export`, { token })).room; setFull(r); return r; }
    catch (e) { toast((e as Error).message, 'err'); return null; }
  };
  useEffect(() => { load(); }, [state.phase, state.round]);
  const refl = (id: CountryId): Record<string, Reflection> => full?.reflections?.[id] ?? {};
  const count = COUNTRY_IDS.reduce((s, id) => s + Object.keys(refl(id)).length, 0);
  const ids = show === 'ALL' ? COUNTRY_IDS : show ? [show] : [];
  return (
    <div className="space-y-3">
      {state.results && <div className="no-print"><ResultsPanel state={state} /></div>}
      <Panel title="💾 결과 저장과 보고서 내보내기" className="no-print">
        <p className="text-xs text-slate-300">게임 결과는 서버에 자동 저장되며 "게임방 목록 → 학급별 결과 비교"에 표시됩니다. 제출된 학생 성찰: <b>{count}건</b></p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn small onClick={() => downloadCsv(state)}>📄 결과·활동 기록 CSV (엑셀)</Btn>
          <Btn small tone="ghost" onClick={async () => { const r = await load(); if (r) download(`WORLD2050_${state.className}_${code}.json`, JSON.stringify(r, null, 2), 'application/json'); }}>전체 데이터 JSON</Btn>
          <Btn small tone="ghost" onClick={async () => { await load(); setShow('ALL'); setTimeout(() => window.print(), 400); }}>🖨️ 6개국 보고서 인쇄 / PDF 저장</Btn>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-xs text-slate-400 self-center">국가별 보고서 보기:</span>
          {COUNTRY_IDS.map((id) => <Btn key={id} small tone={show === id ? 'primary' : 'ghost'} onClick={async () => { await load(); setShow(id); }}>{COUNTRIES[id].short}</Btn>)}
          {show && <Btn small tone="ghost" onClick={() => window.print()}>🖨️ 인쇄</Btn>}
        </div>
      </Panel>
      {ids.map((id, i) => (
        <div key={id} className={cx('panel p-5', i < ids.length - 1 && 'page-break')}><CountryReport state={state} id={id} reflections={refl(id)} /></div>
      ))}
    </div>
  );
}
