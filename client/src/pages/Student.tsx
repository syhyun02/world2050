// 학생용 게임 화면 (스마트폰 세로 화면 우선)
import { useEffect, useMemo, useState } from 'react';
import {
  ACTIONS, BASE_AP, CLAUSES, COUNTRIES, COUNTRY_IDS, IDX_INFO, PACTS, REFLECTION_QUESTIONS, RES, RES_INFO, ROUNDS, STANCES,
  SURVIVAL_HAPPY, TREATY_RULES, VITALS, WIN_PEACE, fmtBundle,
} from '../../../shared/data';
import { tallyTreaty } from '../../../shared/engine';
import type { ClauseLevel, CountryId, MeInfo, PactType, Proposal, PublicRoom, Res, ResBundle, Stance, Vital } from '../../../shared/types';
import { KnowledgeDock, QuizPanel, Rules } from '../components/Learn';
import { CountryReport, outcomeText } from '../components/Report';
import { AgreementList, BreakingBanner, CountryTable, NewsFeed, PeaceBreakdown, PeaceGauge, WorldMap } from '../components/World';
import { fmtTime, nav, session, useRemaining, useRoom } from '../lib/net';
import { Badge, Bar, Btn, BundleText, ConnBadge, CountryTag, cx, Panel, phaseLabel, ResPicker, useAction, useToast } from '../lib/ui';

type Cmd = (name: string, args?: Record<string, unknown>) => Promise<void>;
interface P { state: PublicRoom; me: MeInfo; cmd: Cmd; isDelegate: boolean; canAct: boolean }
type Tab = 'home' | 'act' | 'diplo' | 'world' | 'learn' | 'report';

export default function Student() {
  const sess = session.get();
  const conn = useRoom('student', sess?.room ?? '', sess?.token);
  const { state, me, status } = conn;
  const [tab, setTab] = useState<Tab>('home');
  const remaining = useRemaining(state, conn.offset);

  useEffect(() => { if (!sess) nav('/'); }, [sess]);
  useEffect(() => { if (state?.phase === 'finished') setTab('home'); }, [state?.phase]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  if (!sess) return null;
  if (status === 'denied' || status === 'gone') {
    return (
      <Center>
        <p className="text-lg font-bold">{status === 'gone' ? '게임방을 찾을 수 없습니다.' : '참가 정보가 만료되었습니다.'}</p>
        <p className="text-sm text-slate-300 mt-1">방 코드와 국가 참가 코드를 다시 입력해 주세요.</p>
        <Btn className="mt-4" onClick={() => { session.clear(); nav('/'); }}>처음 화면으로</Btn>
      </Center>
    );
  }
  if (!state || !me) return <Center><p className="text-slate-300">서버에 연결하는 중입니다…</p></Center>;

  const c = state.countries[me.country];
  const d = COUNTRIES[me.country];
  const isDelegate = c.delegate === me.pid;
  const canAct = state.phase === 'running' && isDelegate;
  const p: P = { state, me, cmd: conn.cmd, isDelegate, canAct };
  const incoming = state.proposals.filter((x) => x.to === me.country && x.status === 'pending').length;
  const quizOpen = state.round >= 1 && me.quiz[state.round] === undefined && state.phase !== 'finished';
  const tabs: [Tab, string, string, number?][] = [
    ['home', '🏛️', '우리 국가'], ['act', '⚙️', '행동'], ['diplo', '🤝', '외교', incoming], ['world', '🌐', '세계'], ['learn', '📚', '학습', quizOpen ? 1 : 0], ['report', '📝', '보고서'],
  ];
  const low = remaining !== null && remaining < 60_000 && state.phase === 'running';

  return (
    <div className="min-h-full pb-40">
      <header className="no-print sticky top-0 z-40 bg-ink-900/95 backdrop-blur border-b border-line">
        <div className="mx-auto max-w-3xl px-3 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>{d.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate leading-tight" style={{ color: d.color }}>{d.name}</div>
              <div className="text-[11px] text-slate-300 truncate">{phaseLabel(state)}{state.round >= 1 && state.phase !== 'finished' ? ` · ${ROUNDS[state.round].crisis}` : ''}</div>
            </div>
            <div className="text-right shrink-0">
              <div className={cx('tnum text-xl font-extrabold leading-none', low && 'text-rose-300 anim-breaking')} aria-label="남은 시간">⏱ {state.phase === 'paused' ? '일시정지' : fmtTime(remaining)}</div>
              <div className="mt-1 flex items-center justify-end gap-1.5">
                <span className="text-[11px] text-slate-300" title="행동 포인트">행동 <b className="text-amber-300 tnum">{'●'.repeat(c.ap)}{'○'.repeat(Math.max(0, BASE_AP - c.ap))}</b> {c.ap}</span>
                <ConnBadge status={status} />
              </div>
            </div>
          </div>
          <nav className="flex mt-2 -mx-1 overflow-x-auto" aria-label="화면 메뉴">
            {tabs.map(([id, icon, label, n]) => (
              <button key={id} onClick={() => setTab(id)} aria-current={tab === id}
                className={cx('relative flex-1 min-w-[3.6rem] px-1 py-2 text-xs font-semibold border-b-2 whitespace-nowrap', tab === id ? 'border-sky-400 text-white' : 'border-transparent text-slate-400')}>
                <span className="block text-base leading-none mb-0.5" aria-hidden>{icon}</span>{label}
                {!!n && <span className="absolute top-0.5 right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-4">{n}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-3 space-y-3">
        <BreakingBanner state={state} />
        {status !== 'online' && <div className="no-print rounded-xl bg-rose-950 border border-rose-500 px-4 py-2 text-sm">⚠ 서버와 연결이 끊겼습니다. 자동으로 다시 연결하는 중입니다. 게임 진행 상황은 서버에 저장되어 있습니다.</div>}
        {state.phase === 'paused' && <div className="no-print rounded-xl bg-amber-950 border border-amber-500 px-4 py-2 text-sm">⏸ 선생님이 게임을 잠시 멈췄습니다. 안내를 들어 주세요.</div>}
        {!isDelegate && state.phase !== 'finished' && tab !== 'learn' && tab !== 'report' && (
          <div className="no-print rounded-xl bg-ink-800 border border-line px-4 py-2 text-xs text-slate-300">
            👀 나는 <b>대표단원</b>입니다. 정책 실행·거래 승인·투표는 국가 대표만 할 수 있어요. 화면을 함께 보며 대표와 의논하고, 퀴즈와 성찰은 직접 참여하세요.
          </div>
        )}
        {tab === 'home' && <HomeTab {...p} go={setTab} />}
        {tab === 'act' && <ActTab {...p} />}
        {tab === 'diplo' && <DiploTab {...p} />}
        {tab === 'world' && <WorldTab {...p} />}
        {tab === 'learn' && <LearnTab {...p} />}
        {tab === 'report' && <ReportTab {...p} />}
      </main>
      {tab !== 'report' && <KnowledgeDock round={state.round} country={me.country} />}
    </div>
  );
}

const Center = ({ children }: { children: React.ReactNode }) => <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">{children}</div>;

// ───────────────────────── 우리 국가 ─────────────────────────
function HomeTab({ state, me, cmd, isDelegate, go }: P & { go: (t: Tab) => void }) {
  const c = state.countries[me.country], d = COUNTRIES[me.country];
  const { run } = useAction(cmd);
  const members = Object.values(state.players).filter((x) => x.country === me.country);
  const delegate = c.delegate ? state.players[c.delegate] : null;
  const def = ROUNDS[state.round];
  const prev = c.history[c.history.length - 1];

  return (
    <>
      {state.phase === 'lobby' && (
        <Panel title="🛬 대기실 — 곧 게임이 시작됩니다">
          <p className="text-sm text-slate-200">여러분은 2050년 <b style={{ color: d.color }}>{d.name}</b>의 대표단입니다. 선생님이 게임을 시작할 때까지 아래 내용을 읽어 보세요.</p>
          <ol className="mt-3 space-y-2 text-sm">
            {[
              ['🏛️ 우리 국가', '자원과 지표를 확인합니다. 식량·물·에너지는 매 라운드 필요량만큼 소비됩니다.'],
              ['⚙️ 행동', `라운드마다 행동 포인트 ${BASE_AP}점으로 정책을 실행합니다.`],
              ['🤝 외교', '다른 나라와 자원을 거래하고 협정을 맺습니다. 혼자서는 모든 문제를 풀 수 없습니다.'],
              ['🎯 목표', `모든 나라가 살아남고 세계 평화 지수가 ${WIN_PEACE} 이상이면 다 함께 승리!`],
            ].map(([t, s]) => <li key={t} className="rounded-lg bg-ink-950/50 px-3 py-2"><b>{t}</b><span className="text-slate-300"> — {s}</span></li>)}
          </ol>
        </Panel>
      )}

      {state.phase === 'finished' && state.results && <ResultsPanel state={state} me={me.country} />}
      {state.phase === 'finished' && <Btn className="w-full" onClick={() => go('report')}>📝 성찰 작성하고 보고서 만들기</Btn>}

      {state.phase === 'roundEnd' && (
        <Panel title={`📊 ROUND ${state.round} 결산`} className="anim-pop">
          <p className="text-sm">
            {c.shortages[state.round]?.length
              ? <span className="text-rose-300 font-semibold">⚠ {c.shortages[state.round].map((k) => RES_INFO[k].name).join('·')}이(가) 부족해 국민 행복도가 떨어졌습니다.</span>
              : <span className="text-emerald-300 font-semibold">✓ 필수 자원을 모두 확보했습니다.</span>}
          </p>
          <p className="text-sm text-slate-300 mt-1">행복도 {prev.happy} · 환경 {prev.env} · 신뢰도 {prev.trust} · 세계 평화 지수 {state.peace}</p>
          <p className="text-xs text-slate-400 mt-2">선생님이 다음 라운드를 시작할 때까지 결과를 살펴보고, 다음 협상 전략을 의논하세요.</p>
        </Panel>
      )}

      {def && state.phase !== 'finished' && (
        <Panel title={`🚨 ROUND ${def.n}. ${def.title}`} right={<Badge tone="bad">{def.crisis}</Badge>}>
          <p className="text-sm font-semibold">{def.headline}</p>
          <p className="text-sm text-slate-300 mt-1">{def.body}</p>
          <p className="text-sm mt-2 rounded-lg bg-sky-500/10 border border-sky-500/30 px-3 py-2">🎯 <b>이번 라운드 할 일</b>: {def.mission}</p>
        </Panel>
      )}

      <Panel title="📦 국가 자원" right={state.round >= 1 && state.phase !== 'finished' ? <span className="text-[11px] text-slate-400">라운드가 끝나면 필요량만큼 소비</span> : undefined}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {RES.map((k) => {
            const vital = (VITALS as string[]).includes(k);
            const need = vital ? c.need[k as Vital] : 0;
            const live = state.phase === 'running' || state.phase === 'paused';
            const lack = vital && live ? need - c.stock[k] : 0;
            return (
              <div key={k} className={cx('rounded-xl border p-3', lack > 0 ? 'border-rose-500/70 bg-rose-500/10' : 'border-line bg-ink-950/40')}>
                <div className="flex items-center justify-between text-xs text-slate-300"><span>{RES_INFO[k].icon} {RES_INFO[k].name}</span><span className="tnum text-slate-400">+{c.prod[k]}/R</span></div>
                <div className="text-3xl font-extrabold tnum mt-1">{c.stock[k]}</div>
                {vital ? (
                  <div className="text-[11px] mt-1">
                    <span className="text-slate-400">필요 {need} · </span>
                    {!live ? <span className="text-slate-400">{state.round === 0 ? '대기' : '소비 완료'}</span> : lack > 0 ? <b className="text-rose-300">⚠ {lack} 부족</b> : <b className="text-emerald-300">✓ 충분 (+{-lack})</b>}
                  </div>
                ) : <div className="text-[11px] mt-1 text-slate-400">{k === 'eco' ? '정책·거래에 쓰는 자금' : '전환·적응·협력에 사용'}</div>}
              </div>
            );
          })}
        </div>
        <div className="mt-3 space-y-2.5">
          {(['happy', 'env', 'trust'] as const).map((k) => (
            <div key={k}>
              <div className="flex justify-between text-xs mb-1">
                <span>{IDX_INFO[k].icon} {IDX_INFO[k].name}{k === 'happy' && <span className="text-slate-500"> · 생존 기준 {SURVIVAL_HAPPY}</span>}</span>
                <b className={cx('tnum', k === 'happy' && c.happy < SURVIVAL_HAPPY && 'text-rose-300')}>{c[k]} / 100{k === 'happy' && c.happy < SURVIVAL_HAPPY ? ' ⚠' : ''}</b>
              </div>
              <Bar value={c[k]} color={k === 'happy' ? (c.happy < SURVIVAL_HAPPY ? '#fb7185' : '#fbbf24') : k === 'env' ? '#34d399' : '#38bdf8'} mark={k === 'happy' ? SURVIVAL_HAPPY : undefined} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="👥 우리 대표단" right={isDelegate ? <Badge tone="good">★ 내가 대표</Badge> : <Badge tone="mute">대표단원</Badge>}>
        <ul className="flex flex-wrap gap-2">
          {members.map((m) => (
            <li key={m.id} className="rounded-lg bg-ink-950/50 border border-line px-2.5 py-1.5 text-sm flex items-center gap-1.5">
              <span className={m.online ? 'text-emerald-400' : 'text-slate-500'} title={m.online ? '접속 중' : '접속 끊김'}>{m.online ? '●' : '○'}</span>
              {m.nick}{m.id === me.pid && <span className="text-slate-400 text-xs">(나)</span>}
              {m.id === c.delegate && <Badge tone="warn">★ 대표</Badge>}
              {isDelegate && m.id !== me.pid && <button className="text-[11px] text-sky-300 underline" onClick={() => run('passDelegate', { pid: m.id }, `${m.nick}에게 대표 권한을 넘겼습니다.`)}>대표 넘기기</button>}
            </li>
          ))}
        </ul>
        {!isDelegate && (!delegate || !delegate.online) && (
          <div className="mt-3 flex items-center gap-3">
            <Btn small tone="good" onClick={() => run('claimDelegate', {}, '대표 권한을 받았습니다.')}>대표 권한 받기</Btn>
            <span className="text-xs text-slate-400">현재 대표가 접속해 있지 않아 권한을 받을 수 있습니다.</span>
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-2">정책·거래·투표는 대표 한 사람만 실행해 중복 실행을 막습니다. 결정은 대표단이 함께 의논하세요.</p>
      </Panel>

      <Panel title="🗂️ 국가 프로필">
        <dl className="text-sm grid grid-cols-[4.5rem_1fr] gap-y-1.5">
          <dt className="text-slate-400">강점</dt><dd>{d.strength}</dd>
          <dt className="text-slate-400">약점</dt><dd>{d.weakness}</dd>
          <dt className="text-slate-400">외교 목표</dt><dd>{d.goal}</dd>
          <dt className="text-slate-400">고유 능력</dt><dd className="text-amber-200">{d.perk}</dd>
          <dt className="text-slate-400">학습 주제</dt><dd>{d.topics}</dd>
        </dl>
      </Panel>
    </>
  );
}

export function ResultsPanel({ state, me }: { state: PublicRoom; me?: CountryId }) {
  const r = state.results!;
  const tone = r.outcome === 'win' ? 'border-emerald-400 bg-emerald-500/10' : r.outcome === 'partial' ? 'border-amber-400 bg-amber-500/10' : 'border-rose-400 bg-rose-500/10';
  return (
    <section className={cx('rounded-2xl border-2 p-4 anim-pop', tone)}>
      <p className="text-xs tracking-widest text-slate-300">최종 결과</p>
      <h2 className="text-2xl font-extrabold mt-0.5">{r.outcome === 'win' ? '🎉' : r.outcome === 'partial' ? '🌤️' : '⛈️'} {outcomeText[r.outcome]}</h2>
      <p className="text-sm text-slate-200 mt-1">
        {r.outcome === 'win' ? '모든 국가가 생존 조건을 달성했고 세계 평화 지수가 기준을 넘었습니다.' : `생존 조건 달성 ${r.world.survivors}/6개국, 세계 평화 지수 ${r.world.peace} (기준 ${WIN_PEACE}). 무엇이 부족했는지 함께 이야기해 보세요.`}
      </p>
      <h3 className="text-sm font-bold text-sky-200 mt-4 mb-1">세계 공동 성과</h3>
      <ul className="text-sm grid sm:grid-cols-2 gap-x-4 gap-y-1">
        <li>🕊️ 세계 평화 지수 <b className="tnum">{r.world.peaceStart} → {r.world.peace}</b></li>
        <li>⚖️ 행복도 격차 <b className="tnum">{r.world.gapStart} → {r.world.gapEnd}</b> {r.world.gapEnd <= r.world.gapStart ? '(감소)' : '(확대)'}</li>
        <li>🆘 재난 구호 달성률 <b className="tnum">{r.world.reliefPct}%</b></li>
        <li>📜 세계 평화 협약 <b>{r.world.treatyAdopted ? `채택 (${r.world.treatyClauses}개 조항)` : '미채택'}</b> · 협정 {r.world.agreements}건</li>
        <li>🛟 최소 생존 조건 달성 <b className="tnum">{r.world.survivors} / 6개국</b></li>
      </ul>
      <h3 className="text-sm font-bold text-sky-200 mt-4 mb-1">국가별 성과 (순위가 아니라 각국의 균형을 살펴보세요)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tnum min-w-[480px]">
          <thead><tr className="text-left text-slate-400"><th className="py-1">국가</th><th>생존 /25</th><th>행복 /20</th><th>환경 /20</th><th>신뢰 /20</th><th>기여 /15</th><th>합계</th><th>생존 조건</th></tr></thead>
          <tbody>
            {COUNTRY_IDS.map((id) => {
              const s = r.countries[id];
              return (
                <tr key={id} className={cx('border-t border-line/60', me === id && 'bg-sky-500/10')}>
                  <td className="py-1.5"><CountryTag id={id} /></td><td>{s.survival}</td><td>{s.happy}</td><td>{s.env}</td><td>{s.trust}</td><td>{s.contrib}</td>
                  <td className="font-bold text-sm">{s.total}</td><td>{s.survived ? <Badge tone="good">✓ 달성</Badge> : <Badge tone="bad">✕ 미달성</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 mt-3">※ 점수는 학습용 게임 지표이며 실제 국제사회의 복잡성을 정확하게 수치화한 것이 아닙니다.</p>
    </section>
  );
}

// ───────────────────────── 행동 ─────────────────────────
function ActTab(p: P) {
  const { state, me, cmd, canAct, isDelegate } = p;
  const c = state.countries[me.country];
  const { run, busy } = useAction(cmd);
  const [picks, setPicks] = useState<Record<string, Vital>>({});
  const why = (a: (typeof ACTIONS)[number]): string | null => {
    if (state.phase !== 'running') return '라운드 진행 중에만 가능';
    if (!isDelegate) return '대표만 실행 가능';
    if (a.rounds && (state.round < a.rounds[0] || state.round > a.rounds[1])) return `${a.rounds[0]}라운드부터 가능`;
    if (a.id === 'refugee' && me.country === 'OCE') return '재난 피해국은 실행 불가';
    if (c.used.includes(a.id)) return '이번 라운드에 실행함';
    if (a.once && c.usedOnce.includes(a.id)) return '이미 실행함 (게임 중 1회)';
    if (c.ap < a.ap) return '행동 포인트 부족';
    const lack = RES.find((k) => c.stock[k] < (a.cost[k] ?? 0));
    if (lack) return `${RES_INFO[lack].name} 부족`;
    if (a.id === 'carbon' && c.prod.eco < 3) return '경제 생산량이 너무 낮음';
    return null;
  };
  return (
    <>
      <Panel title="⚙️ 행동 포인트">
        <div className="flex items-center gap-3">
          <div className="text-3xl tnum font-extrabold text-amber-300">{c.ap}</div>
          <p className="text-xs text-slate-300">라운드마다 {BASE_AP}점이 주어집니다. 남은 포인트는 다음 라운드로 넘어가지 않아요. 자원 거래와 지원은 포인트가 들지 않습니다.</p>
        </div>
      </Panel>

      {state.project && <ProjectPanel {...p} />}
      {state.dispute && <DisputePanel {...p} />}
      {state.treaty && <TreatyPanel {...p} />}

      <Panel title="🏛️ 국가 정책">
        <ul className="space-y-2.5">
          {ACTIONS.map((a) => {
            const reason = why(a);
            const pick = picks[a.id] ?? a.pick?.[0];
            return (
              <li key={a.id} className={cx('rounded-xl border p-3', c.used.includes(a.id) ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-line bg-ink-950/40')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-[15px]">{a.icon} {a.name}</div>
                  <Badge tone="mute">{a.category}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5 text-xs">
                  <Badge tone="warn">행동 {a.ap}</Badge>
                  {RES.filter((k) => a.cost[k]).map((k) => <Badge key={k} tone={c.stock[k] >= a.cost[k]! ? 'info' : 'bad'}>{RES_INFO[k].icon} {RES_INFO[k].name} −{a.cost[k]}</Badge>)}
                  {!RES.some((k) => a.cost[k]) && <Badge tone="info">자원 비용 없음</Badge>}
                </div>
                <dl className="mt-2 text-xs grid grid-cols-[3.2rem_1fr] gap-y-0.5">
                  <dt className="text-emerald-300 font-semibold">효과</dt><dd className="text-slate-200">{a.effect}{a.id === 'rnd' && me.country === 'ARC' ? ' → 아르카디아는 +7' : ''}{a.id === 'invest' && me.country === 'IND' ? ' → 인더스트리아는 +4' : ''}{a.id === 'welfare' && me.country === 'NOV' ? ' + 노바리아는 경제 생산 +2' : ''}</dd>
                  <dt className="text-rose-300 font-semibold">부작용</dt><dd className="text-slate-300">{a.side}</dd>
                  <dt className="text-slate-400 font-semibold">조건</dt><dd className="text-slate-400">{a.cond}</dd>
                </dl>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {a.pick && !reason && (
                    <div className="flex gap-1" role="radiogroup" aria-label="대상 자원">
                      {a.pick.map((k) => (
                        <button key={k} role="radio" aria-checked={pick === k} onClick={() => setPicks((s) => ({ ...s, [a.id]: k }))}
                          className={cx('rounded-lg border px-2.5 py-1.5 text-xs font-semibold', pick === k ? 'border-sky-400 bg-sky-500/20 text-white' : 'border-line text-slate-300')}>
                          {RES_INFO[k].icon} {RES_INFO[k].name}
                        </button>
                      ))}
                    </div>
                  )}
                  <Btn small disabled={!!reason || busy || !canAct} onClick={() => run('act', { id: a.id, pick }, `${a.name}${a.pick ? `(${RES_INFO[pick!].name})` : ''} 실행 완료`)}>
                    {reason ? `✕ ${reason}` : '실행하기'}
                  </Btn>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}

function ProjectPanel({ state, me, cmd, canAct }: P) {
  const pr = state.project!;
  const def = ROUNDS[pr.round].project!;
  const c = state.countries[me.country];
  const [give, setGive] = useState<ResBundle>({});
  const { run, busy } = useAction(cmd);
  const sum = RES.reduce((s, k) => s + (give[k] ?? 0), 0);
  const first = !c.used.includes('project');
  return (
    <Panel title={`🌐 공동 대응: ${def.name}`} right={<Badge tone={pr.total >= pr.target ? 'good' : 'warn'}>{pr.total >= pr.target ? '✓ 목표 달성' : `${pr.total} / ${pr.target}`}</Badge>}>
      <p className="text-sm text-slate-300">{def.desc}</p>
      <p className="text-sm mt-1"><b className="text-emerald-300">목표 달성 시</b> {def.success}</p>
      <div className="mt-2"><Bar value={(pr.total / pr.target) * 100} color="#34d399" /></div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
        {COUNTRY_IDS.map((id) => {
          const b = pr.contributions[id];
          const n = b ? RES.reduce((s, k) => s + (b[k] ?? 0), 0) : 0;
          return <span key={id} className={n ? '' : 'opacity-50'}><CountryTag id={id} /> <b className="tnum">{n}</b></span>;
        })}
      </div>
      <div className="mt-3 rounded-lg bg-ink-950/50 p-3">
        <ResPicker value={give} onChange={setGive} keys={def.accepts} have={c.stock} />
        <div className="mt-2.5 flex items-center gap-3">
          <Btn small tone="good" disabled={!canAct || busy || sum === 0} onClick={async () => { if (await run('contribute', { give }, `${def.name}에 ${fmtBundle(give)} 기여`)) setGive({}); }}>기여하기</Btn>
          <span className="text-xs text-slate-400">{first ? '첫 기여 시 행동 포인트 1' : '추가 기여는 행동 포인트 없음'} · 3단위당 신뢰도 +1</span>
        </div>
      </div>
    </Panel>
  );
}

function DisputePanel({ state, me, cmd, canAct }: P) {
  const d = state.dispute!;
  const isParty = d.parties.includes(me.country);
  const mine = d.stances[me.country];
  const [sel, setSel] = useState<Stance>('negotiate');
  const { run, busy } = useAction(cmd);
  return (
    <Panel title="⚖️ 미르강 수자원 분쟁" right={d.result ? <Badge tone={d.result === 'peace' ? 'good' : 'bad'}>{d.result === 'peace' ? '평화적 해결' : '해결 실패'}</Badge> : <Badge tone="warn">진행 중</Badge>}>
      <p className="text-sm text-slate-300">상류의 <CountryTag id="GRN" />는 농업용수가, 하류의 <CountryTag id="SOL" />는 생활용수가 필요합니다. 양국의 입장은 라운드가 끝날 때 동시에 공개됩니다.</p>
      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        {d.parties.map((id) => (
          <div key={id} className="rounded-lg bg-ink-950/50 p-2.5">
            <CountryTag id={id} />
            <div className="text-xs mt-1">{d.result ? STANCES[d.stances[id] ?? 'negotiate'] && (d.stances[id] ? `${STANCES[d.stances[id]!].icon} ${STANCES[d.stances[id]!].name}` : '입장 없음') : d.stances[id] ? '🔒 입장 확정 (비공개)' : '⏳ 고민 중'}</div>
          </div>
        ))}
      </div>
      <p className="text-xs mt-2 text-slate-300">중재 참여국: {d.mediators.length ? d.mediators.map((m) => <span key={m} className="mr-2"><CountryTag id={m} /></span>) : '아직 없음'} <span className="text-slate-500">(2개국 이상이면 중재 효과 발생)</span></p>
      {d.resultText && <p className="mt-2 text-sm rounded-lg bg-ink-950/60 p-2.5">{d.resultText}</p>}
      {!d.result && isParty && (
        mine ? <p className="mt-3 text-sm text-emerald-300">✓ 우리 입장: {STANCES[mine].icon} {STANCES[mine].name} — 확정되었습니다. 상대국과 대화를 이어가세요.</p> : (
          <div className="mt-3 space-y-2">
            {(Object.keys(STANCES) as Stance[]).map((k) => (
              <button key={k} onClick={() => setSel(k)} role="radio" aria-checked={sel === k}
                className={cx('w-full text-left rounded-lg border px-3 py-2', sel === k ? (k === 'unilateral' ? 'border-rose-400 bg-rose-500/10' : 'border-sky-400 bg-sky-500/15') : 'border-line bg-ink-950/40')}>
                <div className="text-sm font-semibold">{STANCES[k].icon} {STANCES[k].name}</div>
                <div className="text-xs text-slate-300">{STANCES[k].desc}</div>
              </button>
            ))}
            <div className="flex items-center gap-3">
              <Btn small disabled={!canAct || busy} tone={sel === 'unilateral' ? 'danger' : 'primary'} onClick={() => run('stance', { stance: sel }, '입장을 확정했습니다.')}>이 입장으로 확정 (변경 불가)</Btn>
              <span className="text-xs text-slate-400">행동 포인트 없음</span>
            </div>
            <p className="text-xs text-slate-400">양국 모두 협상 또는 중재를 택하면 "공동 관리 협정"이 체결됩니다: 남은 라운드 동안 그린벨트는 물 4, 솔라니아는 에너지 4를 서로 제공, 양국 신뢰도 +8·행복도 +3.</p>
          </div>
        )
      )}
      {!d.result && !isParty && (
        <div className="mt-3 flex items-center gap-3">
          <Btn small tone="good" disabled={!canAct || busy || d.mediators.includes(me.country)} onClick={() => run('mediate', {}, '중재에 참여했습니다. 신뢰도 +3')}>
            {d.mediators.includes(me.country) ? '✓ 중재 참여 중' : '⚖️ 중재 참여 (행동 1)'}
          </Btn>
          <span className="text-xs text-slate-400">신뢰도 +3. 양국을 직접 만나 평화적 해결을 설득해 보세요.</span>
        </div>
      )}
    </Panel>
  );
}

function TreatyPanel({ state, me, cmd, canAct }: P) {
  const t = state.treaty!;
  const tally = tallyTreaty(state);
  const mine = t.choices[me.country] ?? {};
  const { run, busy } = useAction(cmd);
  const [note, setNote] = useState(t.notes[me.country] ?? '');
  const done = !!t.result;
  const levels: [ClauseLevel, string][] = [['none', '제외'], ['base', '기본안'], ['strong', '강화안']];
  return (
    <Panel title="📜 세계 평화 협약" right={done ? <Badge tone={t.result!.adopted ? 'good' : 'bad'}>{t.result!.adopted ? '채택' : '무산'}</Badge> : <Badge tone={tally.adopted ? 'good' : 'warn'}>{tally.adopted ? '현재: 채택 가능' : '현재: 채택 조건 미달'}</Badge>}>
      <p className="text-xs text-slate-300">
        <b>채택 조건</b>: 포함 조항 {TREATY_RULES.minClauses}개 이상(현재 {tally.included}개) + 비준 찬성 {TREATY_RULES.ratifyVotes}개국 이상(현재 {tally.yes.length}개국).
        조항은 {TREATY_RULES.clauseVotes}개국 이상이 고른 수준으로 포함됩니다. 라운드 종료 시 집계되며, 비준국에만 효력이 생깁니다.
      </p>
      <ul className="mt-3 space-y-2.5">
        {CLAUSES.map((cl) => {
          const cnt = tally.counts[cl.id], cur = mine[cl.id] ?? 'none', res = tally.clauses[cl.id];
          return (
            <li key={cl.id} className="rounded-xl border border-line bg-ink-950/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-sm">{cl.icon} {cl.name}</div>
                <Badge tone={res === 'none' ? 'mute' : 'good'}>{res === 'none' ? '미포함' : res === 'strong' ? '강화안 포함' : '기본안 포함'}</Badge>
              </div>
              <p className="text-xs text-slate-300 mt-1"><b className="text-sky-200">기본안</b> {cl.base}</p>
              <p className="text-xs text-slate-300"><b className="text-amber-200">강화안</b> {cl.strong}</p>
              <div className="flex items-center gap-1.5 mt-2" role="radiogroup" aria-label={`${cl.name} 우리 국가의 선택`}>
                {levels.map(([lv, label]) => (
                  <button key={lv} role="radio" aria-checked={cur === lv} disabled={!canAct || busy || done} onClick={() => run('treatyChoice', { clause: cl.id, level: lv })}
                    className={cx('flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold disabled:opacity-60', cur === lv ? 'border-sky-400 bg-sky-500/20 text-white' : 'border-line text-slate-300')}>
                    {cur === lv ? '● ' : ''}{label} <span className="text-slate-400 tnum">({lv === 'none' ? cnt.none : lv === 'base' ? cnt.base : cnt.strong})</span>
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3">
        <label className="text-xs text-slate-300" htmlFor="tnote">우리 국가의 수정·추가 제안 (협약문에 함께 기록, 120자)</label>
        <div className="flex gap-2 mt-1">
          <input id="tnote" value={note} maxLength={120} disabled={!canAct || done} onChange={(e) => setNote(e.target.value)} placeholder="예: 재난 피해국에 대한 지원을 정례화하자" className="flex-1 min-w-0 rounded-lg bg-ink-950/60 border border-line px-3 py-2 text-sm" />
          <Btn small tone="ghost" disabled={!canAct || busy || done} onClick={() => run('treatyNote', { text: note }, '제안 문구를 기록했습니다.')}>기록</Btn>
        </div>
        <ul className="mt-2 text-xs space-y-0.5">{COUNTRY_IDS.filter((id) => t.notes[id]).map((id) => <li key={id}><CountryTag id={id} />: {t.notes[id]}</li>)}</ul>
      </div>
      <div className="mt-3 rounded-lg bg-ink-950/50 p-3">
        <div className="text-sm font-semibold mb-2">최종 비준 투표</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mb-2.5">
          {COUNTRY_IDS.map((id) => <span key={id}><CountryTag id={id} /> {t.ratify[id] === 'yes' ? '✅ 찬성' : t.ratify[id] === 'no' ? '❌ 반대' : '⏳ 미정'}</span>)}
        </div>
        <div className="flex gap-2">
          <Btn small tone="good" disabled={!canAct || busy || done} onClick={() => run('treatyRatify', { vote: 'yes' }, '비준 찬성으로 투표했습니다.')}>{t.ratify[me.country] === 'yes' ? '● ' : ''}찬성</Btn>
          <Btn small tone="danger" disabled={!canAct || busy || done} onClick={() => run('treatyRatify', { vote: 'no' }, '비준 반대로 투표했습니다.')}>{t.ratify[me.country] === 'no' ? '● ' : ''}반대</Btn>
          <span className="text-xs text-slate-400 self-center">라운드 종료 전까지 바꿀 수 있습니다.</span>
        </div>
      </div>
    </Panel>
  );
}

// ───────────────────────── 외교 ─────────────────────────
function DiploTab({ state, me, cmd, canAct }: P) {
  const c = state.countries[me.country];
  const others = COUNTRY_IDS.filter((id) => id !== me.country);
  const [to, setTo] = useState<CountryId>(others[0]);
  const [mode, setMode] = useState<'trade' | 'pact'>('trade');
  const [give, setGive] = useState<ResBundle>({});
  const [take, setTake] = useState<ResBundle>({});
  const [pact, setPact] = useState<PactType>('friend');
  const [memo, setMemo] = useState('');
  const { run, busy } = useAction(cmd);
  const sum = (b: ResBundle) => RES.reduce((s, k) => s + (b[k] ?? 0), 0);
  const g = sum(give), t = sum(take);
  const label = g && t ? '자원 거래 제안' : g ? '지원 제안 (대가 없이 제공)' : t ? '원조 요청' : '주거나 받을 자원을 입력하세요';
  const incoming = state.proposals.filter((p) => p.to === me.country && p.status === 'pending');
  const outgoing = state.proposals.filter((p) => p.from === me.country && p.status === 'pending');
  const history = state.proposals.filter((p) => (p.to === me.country || p.from === me.country) && p.status !== 'pending').slice(-20).reverse();
  const tc = state.countries[to];
  const send = async () => {
    const ok = mode === 'pact'
      ? await run('propose', { to, kind: 'pact', pactType: pact, memo }, `${COUNTRIES[to].short}에 ${PACTS[pact].name}을(를) 제안했습니다.`)
      : await run('propose', { to, kind: 'trade', give, take, memo }, `${COUNTRIES[to].short}에 제안을 보냈습니다. 상대 대표의 승인을 기다립니다.`);
    if (ok) { setGive({}); setTake({}); setMemo(''); }
  };
  return (
    <>
      <Panel title={`📥 받은 제안 (${incoming.length})`}>
        {incoming.length === 0 ? <p className="text-sm text-slate-400">대기 중인 제안이 없습니다. 다른 나라 대표단과 직접 대화해 보세요.</p> : (
          <ul className="space-y-2">{incoming.map((p) => <ProposalCard key={p.id} p={p} state={state} me={me.country} canAct={canAct} cmd={cmd} />)}</ul>
        )}
      </Panel>

      <Panel title="✉️ 새 제안 보내기">
        <div className="text-xs text-slate-400 mb-1">1. 상대 국가</div>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="상대 국가">
          {others.map((id) => (
            <button key={id} role="radio" aria-checked={to === id} onClick={() => setTo(id)}
              className={cx('rounded-lg border px-1 py-2 text-[11px] font-semibold leading-tight', to === id ? 'bg-ink-600 text-white' : 'border-line text-slate-300')} style={to === id ? { borderColor: COUNTRIES[id].color } : undefined}>
              <span className="block text-lg" aria-hidden>{COUNTRIES[id].icon}</span>{COUNTRIES[id].short}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">{COUNTRIES[to].short} 보유: {RES.map((k) => `${RES_INFO[k].icon}${tc.stock[k]}`).join(' ')} · 강점: {COUNTRIES[to].strength}</p>

        <div className="text-xs text-slate-400 mt-3 mb-1">2. 제안 종류</div>
        <div className="grid grid-cols-2 gap-1.5">
          {([['trade', '💱 자원 거래 · 지원 · 원조 요청'], ['pact', '📜 외교 협정 · 공동 프로젝트']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={cx('rounded-lg border px-2 py-2 text-xs font-semibold', mode === k ? 'border-sky-400 bg-sky-500/20 text-white' : 'border-line text-slate-300')}>{l}</button>
          ))}
        </div>

        {mode === 'trade' ? (
          <div className="mt-3 space-y-3">
            <div className="rounded-lg bg-ink-950/50 p-3"><div className="text-xs font-semibold text-rose-200 mb-2">▲ 우리가 주는 것</div><ResPicker value={give} onChange={setGive} have={c.stock} /></div>
            <div className="rounded-lg bg-ink-950/50 p-3"><div className="text-xs font-semibold text-emerald-200 mb-2">▼ 우리가 받는 것</div><ResPicker value={take} onChange={setTake} have={tc.stock} /></div>
          </div>
        ) : (
          <div className="mt-3 space-y-1.5" role="radiogroup" aria-label="협정 종류">
            {(Object.keys(PACTS) as PactType[]).map((k) => (
              <button key={k} role="radio" aria-checked={pact === k} onClick={() => setPact(k)} className={cx('w-full text-left rounded-lg border px-3 py-2', pact === k ? 'border-sky-400 bg-sky-500/15' : 'border-line bg-ink-950/40')}>
                <div className="text-sm font-semibold">{PACTS[k].icon} {PACTS[k].name} <span className="text-xs font-normal text-amber-200">양국 행동 1{PACTS[k].cost.eco ? ` · 경제력 ${PACTS[k].cost.eco}` : ''}</span></div>
                <div className="text-xs text-slate-300">{PACTS[k].effect} <span className="text-slate-500">· {PACTS[k].cond}</span></div>
              </button>
            ))}
          </div>
        )}
        <input value={memo} maxLength={80} onChange={(e) => setMemo(e.target.value)} placeholder="한 줄 메시지 (선택, 80자) 예: 다음 라운드에도 계속 거래해요" aria-label="한 줄 메시지" className="mt-3 w-full rounded-lg bg-ink-950/60 border border-line px-3 py-2 text-sm" />
        <div className="mt-3 flex items-center gap-3">
          <Btn disabled={!canAct || busy || (mode === 'trade' && g + t === 0)} onClick={send}>{mode === 'pact' ? `${PACTS[pact].name} 제안` : '제안 보내기'}</Btn>
          <span className="text-xs text-slate-300">{mode === 'trade' ? label : '상대국이 승인하면 즉시 체결됩니다.'}</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">상대 대표가 승인하는 순간 서버가 양쪽 자원을 확인한 뒤 한 번에 교환합니다. 대기 중인 제안은 라운드가 끝나면 자동으로 만료됩니다.</p>
      </Panel>

      <Panel title={`📤 보낸 제안 (${outgoing.length})`}>
        {outgoing.length === 0 ? <p className="text-sm text-slate-400">응답을 기다리는 제안이 없습니다.</p> : <ul className="space-y-2">{outgoing.map((p) => <ProposalCard key={p.id} p={p} state={state} me={me.country} canAct={canAct} cmd={cmd} />)}</ul>}
      </Panel>

      <Panel title="🗒️ 협상 기록">
        {history.length === 0 ? <p className="text-sm text-slate-400">아직 기록이 없습니다.</p> : <ul className="space-y-2">{history.map((p) => <ProposalCard key={p.id} p={p} state={state} me={me.country} canAct={false} cmd={cmd} />)}</ul>}
      </Panel>
    </>
  );
}

const statusBadge: Record<Proposal['status'], [string, 'good' | 'bad' | 'mute' | 'warn']> = {
  pending: ['⏳ 대기 중', 'warn'], accepted: ['✓ 체결', 'good'], rejected: ['✕ 거절', 'bad'], cancelled: ['취소됨', 'mute'], expired: ['시간 만료', 'mute'],
};
export function ProposalCard({ p, state, me, canAct, cmd }: { p: Proposal; state: PublicRoom; me?: CountryId; canAct: boolean; cmd: Cmd }) {
  const { run, busy } = useAction(cmd);
  const inc = p.to === me;
  const from = state.countries[p.from], to = state.countries[p.to];
  const can = (c: typeof from, b: ResBundle) => RES.every((k) => c.stock[k] >= (b[k] ?? 0));
  const feasible = p.kind === 'pact' || (can(from, p.give) && can(to, p.take));
  const [label, tone] = statusBadge[p.status];
  return (
    <li className="rounded-xl border border-line bg-ink-950/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold"><CountryTag id={p.from} /> <span className="text-slate-400">→</span> <CountryTag id={p.to} /></div>
        <div className="flex items-center gap-1.5"><span className="text-[10px] text-slate-500">R{p.round}</span><Badge tone={tone}>{label}</Badge></div>
      </div>
      {p.kind === 'pact' ? (
        <p className="mt-1.5">{PACTS[p.pactType!].icon} <b>{PACTS[p.pactType!].name}</b> <span className="text-xs text-slate-300">— {PACTS[p.pactType!].effect} (양국 행동 1{PACTS[p.pactType!].cost.eco ? `, 경제력 ${PACTS[p.pactType!].cost.eco}` : ''})</span></p>
      ) : (
        <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[13px]">
          <span className="text-slate-400">{COUNTRIES[p.from].short} 제공</span><BundleText b={p.give} />
          <span className="text-slate-400">{COUNTRIES[p.to].short} 제공</span><BundleText b={p.take} />
        </div>
      )}
      {p.memo && <p className="mt-1.5 text-xs text-slate-300 italic">“{p.memo}”</p>}
      {p.status === 'pending' && !feasible && <p className="mt-1.5 text-xs text-rose-300">⚠ 현재 한쪽의 자원이 부족해 체결할 수 없습니다.</p>}
      {p.status === 'pending' && me && (
        <div className="mt-2.5 flex gap-2">
          {inc ? (
            <>
              <Btn small tone="good" disabled={!canAct || busy || !feasible} onClick={() => run('respond', { id: p.id, action: 'accept' }, '제안을 승인했습니다. 체결 완료!')}>승인</Btn>
              <Btn small tone="ghost" disabled={!canAct || busy} onClick={() => run('respond', { id: p.id, action: 'reject' }, '제안을 거절했습니다.')}>거절</Btn>
            </>
          ) : <Btn small tone="ghost" disabled={!canAct || busy} onClick={() => run('respond', { id: p.id, action: 'cancel' }, '제안을 취소했습니다.')}>제안 취소</Btn>}
        </div>
      )}
    </li>
  );
}

// ───────────────────────── 세계 ─────────────────────────
function WorldTab({ state, me }: P) {
  const [sel, setSel] = useState<CountryId | null>(null);
  const d = sel ? COUNTRIES[sel] : null;
  return (
    <>
      <Panel><PeaceGauge state={state} /><div className="mt-4"><PeaceBreakdown state={state} /></div></Panel>
      <Panel title="🗺️ 세계 지도" right={<span className="text-[11px] text-slate-400">국가를 누르면 상세 정보</span>}>
        <WorldMap state={state} me={me.country} onPick={setSel} />
        {d && sel && (
          <div className="anim-pop mt-3 rounded-xl border p-3 text-sm" style={{ borderColor: d.color }}>
            <div className="flex justify-between items-start"><b style={{ color: d.color }}>{d.icon} {d.name} · {d.tagline}</b><button className="text-slate-400 text-xs" onClick={() => setSel(null)}>닫기 ✕</button></div>
            <p className="text-xs text-slate-300 mt-1">강점: {d.strength} / 약점: {d.weakness}</p>
            <p className="text-xs text-slate-300">외교 목표: {d.goal}</p>
            <p className="text-xs mt-1.5 tnum">{RES.map((k) => `${RES_INFO[k].icon} ${state.countries[sel].stock[k]} (+${state.countries[sel].prod[k]})`).join('  ')}</p>
            <p className="text-xs text-slate-400 mt-0.5">필요량: 식량 {state.countries[sel].need.food} · 물 {state.countries[sel].need.water} · 에너지 {state.countries[sel].need.energy}</p>
          </div>
        )}
      </Panel>
      <Panel title="📊 국가별 현황"><CountryTable state={state} me={me.country} /></Panel>
      <Panel title="📰 국제 뉴스"><NewsFeed state={state} /></Panel>
      <Panel title="📜 체결된 국제 협정"><AgreementList state={state} /></Panel>
    </>
  );
}

// ───────────────────────── 학습 ─────────────────────────
function LearnTab({ state, me, cmd }: P) {
  const [open, setOpen] = useState(false);
  const def = ROUNDS[state.round];
  return (
    <>
      <QuizPanel state={state} me={me} cmd={cmd} />
      {def && <Panel title="🎓 이번 라운드 학습 주제"><div className="flex flex-wrap gap-1.5">{def.learn.map((l) => <Badge key={l}>{l}</Badge>)}</div><p className="text-xs text-slate-400 mt-2">화면 아래 "오늘의 세계 시민 지식" 카드에서 관련 개념과 실제 사례를 읽어 보세요.</p></Panel>}
      <Panel title="📘 게임 규칙과 점수 계산" right={<Btn small tone="ghost" onClick={() => setOpen((v) => !v)}>{open ? '접기' : '펼쳐 보기'}</Btn>}>
        {open ? <Rules /> : <p className="text-sm text-slate-400">행동의 비용과 효과, 협약 채택 조건, 평화 지수와 점수 계산 방식을 모두 공개합니다.</p>}
      </Panel>
    </>
  );
}

// ───────────────────────── 보고서 ─────────────────────────
function ReportTab({ state, me, cmd }: P) {
  const saved = me.reflections[me.pid];
  const [answers, setAnswers] = useState<string[]>(() => saved?.answers ?? ['', '', '', '']);
  const [dirty, setDirty] = useState(false);
  const toast = useToast();
  const { run, busy } = useAction(cmd);
  const savedKey = useMemo(() => JSON.stringify(saved?.answers ?? null), [saved]);
  useEffect(() => { if (saved && !dirty) setAnswers(saved.answers); }, [savedKey]);
  const save = async () => { if (await run('reflect', { answers }, '성찰을 저장했습니다.')) setDirty(false); };
  return (
    <>
      <Panel title="✍️ 성찰 작성" className="no-print" right={saved && !dirty ? <Badge tone="good">✓ 저장됨</Badge> : dirty ? <Badge tone="warn">저장 필요</Badge> : undefined}>
        <p className="text-xs text-slate-300 mb-3">직접 쓴 내용만 보고서에 실립니다. 게임 중에도 메모하듯 쓰고 저장할 수 있어요. 같은 국가 친구들의 성찰도 보고서에 함께 실립니다.</p>
        {REFLECTION_QUESTIONS.map((q, i) => (
          <div key={i} className="mb-3">
            <label htmlFor={`rq${i}`} className="text-sm font-semibold">Q{i + 1}. {q}</label>
            <textarea id={`rq${i}`} rows={3} maxLength={600} value={answers[i]} onChange={(e) => { setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v))); setDirty(true); }}
              className="mt-1 w-full rounded-lg bg-ink-950/60 border border-line px-3 py-2 text-sm leading-relaxed" placeholder="자유롭게 적어 보세요." />
            <div className="text-right text-[10px] text-slate-500 tnum">{answers[i].length}/600</div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Btn disabled={busy || !dirty} onClick={save}>성찰 저장</Btn>
          <Btn tone="ghost" onClick={() => { if (dirty) return toast('먼저 성찰을 저장하세요.', 'err'); window.print(); }}>🖨️ 보고서 인쇄 / PDF로 저장</Btn>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">인쇄 창에서 "PDF로 저장"을 선택하면 A4 보고서 파일로 내려받을 수 있습니다.</p>
      </Panel>
      <Panel><CountryReport state={state} id={me.country} reflections={me.reflections} /></Panel>
    </>
  );
}
