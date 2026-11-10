// 학생용 게임 화면 (스마트폰 세로 화면 우선)
// 한 라운드에 할 일은 세 가지: ① 부족한 자원 채우기(협상) ② 정책 카드 1장 ③ 사건 카드
import { useEffect, useMemo, useState } from 'react';
import {
  CLAUSES, COUNTRIES, COUNTRY_IDS, IDX_INFO, POLICIES, REFLECTION_QUESTIONS, RES, RES_INFO, ROUNDS, STANCES,
  SURVIVAL_HAPPY, TREATY_RULES, VITALS, WIN_PEACE,
} from '../../../shared/data';
import { lacking, tallyTreaty } from '../../../shared/engine';
import type { CountryId, MeInfo, Proposal, PublicRoom, ResBundle, Stance, Vital } from '../../../shared/types';
import { KnowledgeDock, QuizPanel, Rules } from '../components/Learn';
import { CountryReport, outcomeText } from '../components/Report';
import { AgreementList, BreakingBanner, CountryTable, NewsFeed, PeaceBreakdown, PeaceGauge, WorldMap } from '../components/World';
import { fmtTime, nav, session, useRemaining, useRoom } from '../lib/net';
import { Badge, Bar, Btn, BundleText, ConnBadge, CountryTag, cx, Panel, phaseLabel, ResPicker, useAction, useToast } from '../lib/ui';

type Cmd = (name: string, args?: Record<string, unknown>) => Promise<void>;
interface Draft { to: CountryId; give: ResBundle; take: ResBundle }
interface P { state: PublicRoom; me: MeInfo; cmd: Cmd; isDelegate: boolean; canAct: boolean }
type Tab = 'home' | 'deal' | 'world';
type View = Tab | 'report' | 'help';

export default function Student() {
  const sess = session.get();
  const conn = useRoom('student', sess?.room ?? '', sess?.token);
  const { state, me, status } = conn;
  const [view, setView] = useState<View>('home');
  const [draft, setDraft] = useState<Draft | null>(null);
  const remaining = useRemaining(state, conn.offset);

  useEffect(() => { if (!sess) nav('/'); }, [sess]);
  useEffect(() => { if (state?.phase === 'finished' || state?.phase === 'running') setView((v) => (v === 'report' || v === 'help' ? v : 'home')); }, [state?.phase, state?.round]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

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
  const tabs: [Tab, string, string, number?][] = [['home', '🏛️', '우리 나라'], ['deal', '🤝', '협상', incoming], ['world', '🌐', '세계']];
  const low = remaining !== null && remaining < 60_000 && state.phase === 'running';
  const askHelp = (k: Vital) => {
    // 그 자원이 가장 많이 남는 나라를 상대로, 부족한 만큼을 돈과 바꾸는 제안을 미리 채워 둠
    const lack = c.need[k] - c.stock[k];
    const best = COUNTRY_IDS.filter((id) => id !== me.country).sort((a, b) => (state.countries[b].stock[k] - state.countries[b].need[k]) - (state.countries[a].stock[k] - state.countries[a].need[k]))[0];
    setDraft({ to: best, give: { eco: Math.min(c.stock.eco, lack) }, take: { [k]: lack } });
    setView('deal');
  };

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
                <button className="text-[11px] text-sky-300 underline" onClick={() => setView(view === 'help' ? 'home' : 'help')}>❓ 규칙</button>
                <ConnBadge status={status} />
              </div>
            </div>
          </div>
          <nav className="flex mt-2" aria-label="화면 메뉴">
            {tabs.map(([id, icon, label, n]) => (
              <button key={id} onClick={() => setView(id)} aria-current={view === id}
                className={cx('relative flex-1 px-1 py-2 text-sm font-semibold border-b-2 whitespace-nowrap', view === id ? 'border-sky-400 text-white' : 'border-transparent text-slate-400')}>
                <span className="mr-1" aria-hidden>{icon}</span>{label}
                {!!n && <span className="ml-1.5 inline-block min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] leading-5 align-middle">{n}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-3 space-y-3">
        <BreakingBanner state={state} />
        {status !== 'online' && <div className="no-print rounded-xl bg-rose-950 border border-rose-500 px-4 py-2 text-sm">⚠ 서버와 연결이 끊겼습니다. 자동으로 다시 연결하는 중입니다. 게임 진행 상황은 서버에 저장되어 있습니다.</div>}
        {state.phase === 'paused' && <div className="no-print rounded-xl bg-amber-950 border border-amber-500 px-4 py-2 text-sm">⏸ 선생님이 게임을 잠시 멈췄습니다. 안내를 들어 주세요.</div>}
        {!isDelegate && state.phase !== 'finished' && (view === 'home' || view === 'deal') && (
          <div className="no-print rounded-xl bg-ink-800 border border-line px-4 py-2 text-xs text-slate-300">
            👀 나는 <b>대표단원</b>입니다. 버튼은 국가 대표만 누를 수 있어요. 화면을 함께 보며 대표와 의논하고, 퀴즈는 직접 풀어 보세요.
          </div>
        )}
        {view === 'home' && <HomeTab {...p} go={setView} askHelp={askHelp} incoming={incoming} />}
        {view === 'deal' && <DealTab {...p} draft={draft} clearDraft={() => setDraft(null)} askHelp={askHelp} />}
        {view === 'world' && <WorldTab {...p} />}
        {view === 'report' && <ReportView {...p} back={() => setView('home')} />}
        {view === 'help' && <Panel title="📘 게임 규칙" right={<Btn small tone="ghost" onClick={() => setView('home')}>닫기 ✕</Btn>}><Rules /></Panel>}
      </main>
      {view !== 'report' && view !== 'help' && <KnowledgeDock round={state.round} country={me.country} />}
    </div>
  );
}

const Center = ({ children }: { children: React.ReactNode }) => <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">{children}</div>;

/** 이번 라운드 사건 카드에 우리 나라가 응답했는지 */
function eventStatus(state: PublicRoom, id: CountryId): { label: string; done: boolean; text: string } | null {
  if (state.project) {
    const def = ROUNDS[state.round].project!;
    if (def.victims?.includes(id)) return { label: def.name, done: true, text: '우리는 도움을 받는 나라입니다' };
    const joined = state.project.joined.includes(id);
    return { label: def.name, done: joined, text: joined ? '참여함' : '참여할지 정하기' };
  }
  if (state.dispute) {
    const party = state.dispute.parties.includes(id);
    const done = party ? !!state.dispute.stances[id] : state.dispute.mediators.includes(id);
    return { label: '미르강 분쟁', done, text: party ? (done ? '입장 확정' : '우리 입장 정하기') : done ? '중재 참여 중' : '중재에 나설지 정하기' };
  }
  if (state.treaty) {
    const n = Object.keys(state.treaty.votes[id] ?? {}).length;
    return { label: '세계 평화 협약', done: n === CLAUSES.length, text: `조항 투표 ${n}/${CLAUSES.length}` };
  }
  return null;
}

// ───────────────────────── 우리 나라 ─────────────────────────
function HomeTab(p: P & { go: (v: View) => void; askHelp: (k: Vital) => void; incoming: number }) {
  const { state, me, cmd, isDelegate, canAct, go, askHelp, incoming } = p;
  const c = state.countries[me.country], d = COUNTRIES[me.country];
  const { run } = useAction(cmd);
  const members = Object.values(state.players).filter((x) => x.country === me.country);
  const delegate = c.delegate ? state.players[c.delegate] : null;
  const def = ROUNDS[state.round];
  const prev = c.history[c.history.length - 1];
  const live = state.phase === 'running' || state.phase === 'paused';
  const lack = live ? lacking(state, me.country) : [];
  const ev = eventStatus(state, me.country);
  const chosen = c.policy ? POLICIES.find((x) => x.id === c.policy!.id) : null;
  const quizDone = me.quiz[state.round] !== undefined;
  const Step = ({ n, done, title, sub, action }: { n: string; done: boolean; title: string; sub: React.ReactNode; action?: React.ReactNode }) => (
    <li className={cx('flex items-center gap-3 rounded-xl border px-3 py-2.5', done ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-amber-400/60 bg-amber-500/10')}>
      <span className={cx('shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-extrabold', done ? 'bg-emerald-500 text-ink-950' : 'bg-amber-400 text-ink-950')}>{done ? '✓' : n}</span>
      <div className="min-w-0 flex-1"><div className="font-bold text-sm">{title}</div><div className="text-xs text-slate-200">{sub}</div></div>
      {action}
    </li>
  );

  return (
    <>
      {state.phase === 'lobby' && (
        <Panel title="🛬 대기실 — 곧 게임이 시작됩니다">
          <p className="text-sm text-slate-200">여러분은 2050년 <b style={{ color: d.color }}>{d.name}</b>의 대표단입니다.</p>
          <p className="text-sm mt-2 rounded-lg bg-sky-500/10 border border-sky-500/30 px-3 py-2">🎯 <b>목표</b>: 여섯 나라가 모두 살아남고, 세계 평화 지수를 {WIN_PEACE} 이상으로! 다 함께 이기는 게임입니다.</p>
          <p className="text-sm font-semibold mt-3">라운드마다 할 일은 세 가지뿐이에요.</p>
          <ol className="mt-1.5 space-y-1.5 text-sm">
            {[['①', '부족한 자원 채우기', '식량·물·에너지가 모자라면 다른 나라와 거래합니다.'], ['②', '정책 카드 1장 고르기', '네 장 가운데 우리 나라에 필요한 한 장.'], ['③', '사건 카드에 답하기', '그 라운드의 세계 사건에 참여할지 정합니다.']].map(([n, t, s]) => (
              <li key={n} className="rounded-lg bg-ink-950/50 px-3 py-2"><b className="text-amber-300 mr-1.5">{n}</b><b>{t}</b><span className="text-slate-300"> — {s}</span></li>
            ))}
          </ol>
          <p className="text-xs text-slate-400 mt-3">우리 나라의 강점: <b className="text-slate-200">{d.strength}</b> / 약점: <b className="text-slate-200">{d.weakness}</b></p>
        </Panel>
      )}

      {state.phase === 'finished' && state.results && <ResultsPanel state={state} me={me.country} />}
      {state.phase === 'finished' && <Btn className="w-full" onClick={() => go('report')}>📝 성찰 작성하고 보고서 만들기</Btn>}

      {state.phase === 'roundEnd' && (
        <Panel title={`📊 ROUND ${state.round} 결산`} className="anim-pop">
          <p className="text-sm">
            {c.shortages[state.round]?.length
              ? <span className="text-rose-300 font-semibold">⚠ {c.shortages[state.round].map((k) => RES_INFO[k].name).join('·')}이(가) 부족해 국민 행복도가 떨어졌습니다.</span>
              : <span className="text-emerald-300 font-semibold">✓ 필요한 자원을 모두 확보했습니다.</span>}
          </p>
          <p className="text-sm text-slate-300 mt-1">행복도 {prev.happy} · 환경 {prev.env} · 신뢰도 {prev.trust} · 세계 평화 지수 {state.peace}</p>
          <p className="text-xs text-slate-400 mt-2">선생님이 다음 라운드를 시작할 때까지, 다음에 누구와 무엇을 거래할지 의논하세요.</p>
        </Panel>
      )}

      {def && live && (
        <>
          <Panel title={`🚨 ROUND ${def.n}. ${def.crisis}`}>
            <p className="text-sm text-slate-200">{def.body}</p>
          </Panel>

          <Panel title="✅ 이번 라운드 할 일">
            <ol className="space-y-2">
              <Step n="1" done={lack.length === 0} title="부족한 자원 채우기"
                sub={lack.length ? <span className="text-rose-200">{lack.map((k) => `${RES_INFO[k].name} ${c.need[k] - c.stock[k]}`).join(', ')} 부족{incoming ? ` · 받은 제안 ${incoming}건` : ''}</span> : incoming ? `모두 충분 · 받은 제안 ${incoming}건` : '식량·물·에너지 모두 충분'}
                action={<Btn small tone={lack.length || incoming ? 'primary' : 'ghost'} onClick={() => go('deal')}>협상하기</Btn>} />
              <Step n="2" done={!!c.policy} title="정책 카드 1장 고르기" sub={chosen ? `${chosen.icon} ${chosen.name}${c.policy!.pick ? ` (${RES_INFO[c.policy!.pick].name})` : ''} 선택 완료` : '아래 네 장 중 하나'} />
              {ev && <Step n="3" done={ev.done} title={`사건 카드: ${ev.label}`} sub={ev.text} />}
            </ol>
            <p className="text-[11px] text-slate-400 mt-2">순서는 상관없어요. 시간이 끝나면 식량·물·에너지를 필요한 만큼 소비합니다.{!quizDone && ' 아래 퀴즈도 풀어 보세요 (정답이면 돈 +3).'}</p>
          </Panel>
        </>
      )}

      <Panel title="📦 우리 나라 자원">
        <div className="grid grid-cols-2 gap-2">
          {RES.map((k) => {
            const vital = (VITALS as string[]).includes(k);
            const needN = vital ? c.need[k as Vital] : 0;
            const short = vital && live ? needN - c.stock[k] : 0;
            return (
              <div key={k} className={cx('rounded-xl border p-3', short > 0 ? 'border-rose-500/70 bg-rose-500/10' : 'border-line bg-ink-950/40')}>
                <div className="flex items-center justify-between text-xs text-slate-300"><span>{RES_INFO[k].icon} {RES_INFO[k].name}</span><span className="tnum text-slate-400">매 라운드 +{c.prod[k]}</span></div>
                <div className="text-3xl font-extrabold tnum mt-1">{c.stock[k]}</div>
                {!vital ? <div className="text-[11px] mt-1 text-slate-400">정책·거래·참여에 사용</div>
                  : !live ? <div className="text-[11px] mt-1 text-slate-400">라운드마다 {needN} 필요</div>
                  : short > 0 ? (
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <b className="text-[11px] text-rose-300">⚠ {needN} 필요 · {short} 부족</b>
                      <button className="text-[11px] font-bold rounded-md bg-rose-500 text-white px-2 py-1 whitespace-nowrap" onClick={() => askHelp(k as Vital)}>요청하기</button>
                    </div>
                  ) : <div className="text-[11px] mt-1"><b className="text-emerald-300">✓ {needN} 필요 · 충분</b>{-short > 0 && <span className="text-slate-400"> (남는 양 {-short})</span>}</div>}
              </div>
            );
          })}
        </div>
        <div className="mt-3 space-y-2.5">
          {(['happy', 'env', 'trust'] as const).map((k) => (
            <div key={k}>
              <div className="flex justify-between text-xs mb-1">
                <span>{IDX_INFO[k].icon} {IDX_INFO[k].name}<span className="text-slate-500"> · {k === 'happy' ? `${SURVIVAL_HAPPY} 아래면 생존 실패` : k === 'env' ? '낮으면 재난 피해가 커짐' : '협력하면 올라감'}</span></span>
                <b className={cx('tnum', k === 'happy' && c.happy < SURVIVAL_HAPPY && 'text-rose-300')}>{c[k]}{k === 'happy' && c.happy < SURVIVAL_HAPPY ? ' ⚠' : ''}</b>
              </div>
              <Bar value={c[k]} color={k === 'happy' ? (c.happy < SURVIVAL_HAPPY ? '#fb7185' : '#fbbf24') : k === 'env' ? '#34d399' : '#38bdf8'} mark={k === 'happy' ? SURVIVAL_HAPPY : undefined} />
            </div>
          ))}
        </div>
      </Panel>

      {live && <PolicyPanel {...p} />}
      {live && state.project && <ProjectPanel {...p} />}
      {live && state.dispute && <DisputePanel {...p} />}
      {live && state.treaty && <TreatyPanel {...p} />}
      {state.round >= 1 && state.phase !== 'finished' && <QuizPanel state={state} me={me} cmd={cmd} />}

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
            <span className="text-xs text-slate-400">지금 대표가 접속해 있지 않습니다.</span>
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-2">버튼은 대표 한 사람만 눌러요. 결정은 다 같이 의논하세요. · 고유 능력: <span className="text-amber-200">{d.perk}</span></p>
      </Panel>

      {state.round >= 1 && state.phase !== 'finished' && <button className="no-print w-full text-xs text-slate-400 underline py-1" onClick={() => go('report')}>📝 성찰 메모·보고서 미리 보기</button>}
    </>
  );
}

function PolicyPanel({ state, me, cmd, canAct }: P) {
  const c = state.countries[me.country];
  const { run, busy } = useAction(cmd);
  const [picks, setPicks] = useState<Record<string, Vital>>({});
  if (c.policy) {
    const def = POLICIES.find((x) => x.id === c.policy!.id)!;
    return (
      <Panel title="🃏 정책 카드" right={<Badge tone="good">✓ 이번 라운드 선택 완료</Badge>}>
        <p className="text-sm"><b>{def.icon} {def.name}{c.policy.pick ? ` (${RES_INFO[c.policy.pick].name})` : ''}</b> — {def.good}</p>
        <p className="text-xs text-slate-400 mt-1">다음 라운드에 다시 한 장을 고를 수 있습니다.</p>
      </Panel>
    );
  }
  const lack = lacking(state, me.country);
  return (
    <Panel title="🃏 정책 카드 — 한 장만 고르세요" right={<Badge tone="warn">라운드마다 1장</Badge>}>
      <ul className="grid sm:grid-cols-2 gap-2">
        {POLICIES.map((a) => {
          const pick = picks[a.id] ?? (a.pick ? (lack.find((k) => a.pick!.includes(k)) ?? a.pick[0]) : undefined);
          const poor = c.stock.eco < a.cost;
          return (
            <li key={a.id} className="rounded-xl border border-line bg-ink-950/40 p-3 flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-[15px]">{a.icon} {a.name}</div>
                <Badge tone={poor ? 'bad' : 'info'}>💰 돈 {a.cost}</Badge>
              </div>
              <p className="text-sm mt-1.5"><span className="text-emerald-300 font-semibold">👍 </span>{a.good}{a.id === 'invest' && me.country === 'IND' ? ' (우리는 +4)' : ''}{a.id === 'welfare' && me.country === 'NOV' ? ', 매 라운드 돈 +2' : ''}</p>
              <p className="text-sm text-slate-300"><span className="text-rose-300 font-semibold">👎 </span>{a.id === 'invest' && me.country === 'ARC' ? '없음 (첨단 기술 덕분)' : a.bad}</p>
              <p className="text-[11px] text-slate-400 mt-1 flex-1">이럴 때: {a.when}</p>
              {a.pick && (
                <div className="flex gap-1 mt-2" role="radiogroup" aria-label="대상 자원">
                  {a.pick.map((k) => (
                    <button key={k} role="radio" aria-checked={pick === k} onClick={() => setPicks((s) => ({ ...s, [a.id]: k }))}
                      className={cx('flex-1 rounded-lg border px-1 py-1.5 text-xs font-semibold', pick === k ? 'border-sky-400 bg-sky-500/20 text-white' : 'border-line text-slate-300')}>
                      {RES_INFO[k].icon} {RES_INFO[k].name}
                    </button>
                  ))}
                </div>
              )}
              <Btn small className="mt-2 w-full" disabled={!canAct || busy || poor} onClick={() => run('policy', { id: a.id, pick }, `정책 「${a.name}」을(를) 골랐습니다.`)}>
                {poor ? '✕ 돈이 부족해요' : !canAct ? '대표만 고를 수 있어요' : '이 카드 고르기'}
              </Btn>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// ───────────────────────── 사건 카드 ─────────────────────────
function ProjectPanel({ state, me, cmd, canAct }: P) {
  const pr = state.project!;
  const def = ROUNDS[pr.round].project!;
  const c = state.countries[me.country];
  const { run, busy } = useAction(cmd);
  const victim = def.victims?.includes(me.country);
  const joined = pr.joined.includes(me.country);
  const ok = pr.joined.length >= def.need;
  return (
    <Panel title={`🌐 사건 카드: ${def.name}`} right={<Badge tone={ok ? 'good' : 'warn'}>{ok ? '✓ 성공 조건 달성' : `${pr.joined.length} / ${def.need}개국`}</Badge>}>
      <p className="text-sm text-slate-200">{def.desc}</p>
      <p className="text-sm mt-1"><b className="text-emerald-300">{def.need}개국 이상 참여하면</b> {def.success}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
        {COUNTRY_IDS.filter((id) => !def.victims?.includes(id)).map((id) => <span key={id} className={pr.joined.includes(id) ? '' : 'opacity-40'}>{pr.joined.includes(id) ? '✅' : '⬜'} <CountryTag id={id} /></span>)}
      </div>
      <div className="mt-3">
        {victim ? <p className="text-sm text-sky-200">우리 나라는 이번 재난의 피해국입니다. 다른 나라에 참여를 부탁해 보세요.</p>
          : joined ? <p className="text-sm text-emerald-300 font-semibold">✓ 참여했습니다. 다른 나라도 참여하도록 설득해 보세요.</p> : (
            <div className="flex flex-wrap items-center gap-3">
              <Btn tone="good" disabled={!canAct || busy || c.stock.eco < def.cost} onClick={() => run('joinProject', {}, `${def.name}에 참여했습니다.`)}>{c.stock.eco < def.cost ? '✕ 돈이 부족해요' : `참여하기 (돈 ${def.cost})`}</Btn>
              <span className="text-xs text-slate-400">신뢰도 +{pr.id === 'relief' ? 4 : 3}. 참여하지 않아도 불이익은 없지만, 나라 수가 모자라면 실패합니다.</span>
            </div>
          )}
      </div>
    </Panel>
  );
}

function DisputePanel({ state, me, cmd, canAct }: P) {
  const d = state.dispute!;
  const isParty = d.parties.includes(me.country);
  const mine = d.stances[me.country];
  const { run, busy } = useAction(cmd);
  return (
    <Panel title="⚖️ 사건 카드: 미르강 분쟁" right={<Badge tone="warn">결과는 라운드 종료 시 공개</Badge>}>
      <p className="text-sm text-slate-200">상류의 <CountryTag id="GRN" />는 농사에, 하류의 <CountryTag id="SOL" />는 생활에 강물이 필요합니다.</p>
      <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
        {d.parties.map((id) => <div key={id} className="rounded-lg bg-ink-950/50 p-2.5"><CountryTag id={id} /><div className="text-xs mt-1">{d.stances[id] ? '🔒 입장 확정 (비공개)' : '⏳ 고민 중'}</div></div>)}
      </div>
      <p className="text-xs mt-2 text-slate-300">중재에 나선 나라: {d.mediators.length ? d.mediators.map((m) => <span key={m} className="mr-2"><CountryTag id={m} /></span>) : '아직 없음'}</p>
      {isParty ? (
        mine ? <p className="mt-3 text-sm text-emerald-300 font-semibold">✓ 우리 입장: {STANCES[mine].icon} {STANCES[mine].name}</p> : (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold">우리 나라의 입장을 하나 고르세요. (바꿀 수 없어요)</p>
            {(Object.keys(STANCES) as Stance[]).map((k) => (
              <button key={k} disabled={!canAct || busy} onClick={() => { if (confirm(`「${STANCES[k].name}」(으)로 확정할까요? 바꿀 수 없습니다.`)) run('stance', { stance: k }, '입장을 확정했습니다.'); }}
                className={cx('w-full text-left rounded-lg border px-3 py-2.5 disabled:opacity-50', k === 'unilateral' ? 'border-rose-500/60 bg-rose-500/10' : 'border-sky-500/60 bg-sky-500/10')}>
                <div className="text-sm font-bold">{STANCES[k].icon} {STANCES[k].name}</div>
                <div className="text-xs text-slate-200">{STANCES[k].desc}</div>
              </button>
            ))}
            <p className="text-xs text-slate-400">두 나라 모두 평화로운 방법(위 두 가지)을 고르면: 남은 라운드 동안 그린벨트는 물 4, 솔라니아는 에너지 4를 서로 주고, 양국 신뢰도 +8·행복도 +3.</p>
          </div>
        )
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Btn tone="good" disabled={!canAct || busy || d.mediators.includes(me.country)} onClick={() => run('mediate', {}, '중재에 참여했습니다. 신뢰도 +3')}>{d.mediators.includes(me.country) ? '✓ 중재 참여 중' : '⚖️ 중재에 나서기 (무료)'}</Btn>
          <span className="text-xs text-slate-400">신뢰도 +3. 두 나라를 직접 찾아가 평화로운 해결을 설득해 보세요.</span>
        </div>
      )}
    </Panel>
  );
}

function TreatyPanel({ state, me, cmd, canAct }: P) {
  const t = state.treaty!;
  const tally = tallyTreaty(state);
  const mine = t.votes[me.country] ?? {};
  const { run, busy } = useAction(cmd);
  return (
    <Panel title="📜 사건 카드: 세계 평화 협약" right={<Badge tone={tally.adopted ? 'good' : 'warn'}>{tally.adopted ? `✓ 채택 가능 (${tally.included}개 조항)` : `합의 조항 ${tally.included} / ${TREATY_RULES.minClauses}`}</Badge>}>
      <p className="text-xs text-slate-300">조항마다 찬성·반대를 고르세요. <b>{TREATY_RULES.clauseVotes}개국 이상 찬성</b>한 조항이 <b>{TREATY_RULES.minClauses}개 이상</b>이면 협약이 채택됩니다. 채택된 조항의 효과는 <b>찬성한 나라</b>에 적용되고 신뢰도 +2를 얻습니다. 라운드가 끝나기 전까지 바꿀 수 있어요.</p>
      <ul className="mt-3 space-y-2">
        {CLAUSES.map((cl) => {
          const n = tally.yes[cl.id].length, v = mine[cl.id];
          return (
            <li key={cl.id} className={cx('rounded-xl border p-3', tally.clauses[cl.id] ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-line bg-ink-950/40')}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-sm">{cl.icon} {cl.name}</div>
                <Badge tone={tally.clauses[cl.id] ? 'good' : 'mute'}>찬성 {n} / 6</Badge>
              </div>
              <p className="text-xs text-slate-300 mt-1">{cl.effect}</p>
              <div className="flex gap-2 mt-2">
                {([[true, '👍 찬성'], [false, '👎 반대']] as const).map(([yes, label]) => (
                  <button key={label} disabled={!canAct || busy} aria-pressed={v === yes} onClick={() => run('treatyVote', { clause: cl.id, yes })}
                    className={cx('flex-1 rounded-lg border px-2 py-2 text-sm font-semibold disabled:opacity-60', v === yes ? (yes ? 'border-emerald-400 bg-emerald-500/25 text-white' : 'border-rose-400 bg-rose-500/25 text-white') : 'border-line text-slate-300')}>
                    {v === yes ? '● ' : ''}{label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
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
        {r.outcome === 'win' ? '모든 나라가 살아남았고 세계 평화 지수가 기준을 넘었습니다.' : `살아남은 나라 ${r.world.survivors}/6, 세계 평화 지수 ${r.world.peace} (기준 ${WIN_PEACE}). 무엇이 부족했는지 함께 이야기해 보세요.`}
      </p>
      <h3 className="text-sm font-bold text-sky-200 mt-4 mb-1">세계가 함께 이룬 것</h3>
      <ul className="text-sm grid sm:grid-cols-2 gap-x-4 gap-y-1">
        <li>🕊️ 세계 평화 지수 <b className="tnum">{r.world.peaceStart} → {r.world.peace}</b></li>
        <li>🛟 살아남은 나라 <b className="tnum">{r.world.survivors} / 6</b></li>
        <li>⚖️ 나라 간 행복도 격차 <b className="tnum">{r.world.gapStart} → {r.world.gapEnd}</b> {r.world.gapEnd <= r.world.gapStart ? '(줄어듦)' : '(커짐)'}</li>
        <li>🌐 성공한 공동 대응 <b className="tnum">{r.world.projects} / 3</b> · 재난 구호 {r.world.reliefSuccess ? '성공' : '실패'}</li>
        <li>⚖️ 미르강 분쟁 <b>{r.world.disputePeace ? '평화적 해결' : '해결 실패'}</b></li>
        <li>📜 세계 평화 협약 <b>{r.world.treatyAdopted ? `채택 (${r.world.treatyClauses}개 조항)` : '무산'}</b></li>
      </ul>
      <h3 className="text-sm font-bold text-sky-200 mt-4 mb-1">나라별 점수 (각 25점, 순위보다 균형을 보세요)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tnum min-w-[420px]">
          <thead><tr className="text-left text-slate-400"><th className="py-1">나라</th><th>자원 확보</th><th>행복</th><th>환경</th><th>신뢰</th><th>합계</th><th>생존</th></tr></thead>
          <tbody>
            {COUNTRY_IDS.map((id) => {
              const s = r.countries[id];
              return (
                <tr key={id} className={cx('border-t border-line/60', me === id && 'bg-sky-500/10')}>
                  <td className="py-1.5"><CountryTag id={id} /></td><td>{s.survival}</td><td>{s.happy}</td><td>{s.env}</td><td>{s.trust}</td>
                  <td className="font-bold text-sm">{s.total}</td><td>{s.survived ? <Badge tone="good">✓ 생존</Badge> : <Badge tone="bad">✕ 위기</Badge>}</td>
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

// ───────────────────────── 협상 ─────────────────────────
function DealTab({ state, me, cmd, canAct, draft, clearDraft, askHelp }: P & { draft: Draft | null; clearDraft: () => void; askHelp: (k: Vital) => void }) {
  const c = state.countries[me.country];
  const others = COUNTRY_IDS.filter((id) => id !== me.country);
  const [to, setTo] = useState<CountryId>(draft?.to ?? others[0]);
  const [give, setGive] = useState<ResBundle>(draft?.give ?? {});
  const [take, setTake] = useState<ResBundle>(draft?.take ?? {});
  const [memo, setMemo] = useState('');
  const { run, busy } = useAction(cmd);
  useEffect(() => { if (draft) { setTo(draft.to); setGive(draft.give); setTake(draft.take); clearDraft(); } }, [draft]);
  const sum = (b: ResBundle) => RES.reduce((s, k) => s + (b[k] ?? 0), 0);
  const g = sum(give), t = sum(take);
  const kind = g && t ? '거래 제안' : g ? '지원 (대가 없이 주기)' : t ? '도움 요청 (대가 없이 받기)' : '';
  const incoming = state.proposals.filter((p) => p.to === me.country && p.status === 'pending');
  const outgoing = state.proposals.filter((p) => p.from === me.country && p.status === 'pending');
  const history = state.proposals.filter((p) => (p.to === me.country || p.from === me.country) && p.status !== 'pending').slice(-20).reverse();
  const tc = state.countries[to];
  const lack = state.phase === 'running' ? lacking(state, me.country) : [];
  const spare = (id: CountryId) => VITALS.filter((k) => state.countries[id].stock[k] - state.countries[id].need[k] >= 3);
  const send = async () => {
    if (await run('propose', { to, give, take, memo }, `${COUNTRIES[to].short}에 제안을 보냈습니다. 상대 대표가 승인하면 체결됩니다.`)) { setGive({}); setTake({}); setMemo(''); }
  };
  return (
    <>
      <Panel title={`📥 받은 제안 (${incoming.length})`}>
        {incoming.length === 0 ? <p className="text-sm text-slate-400">아직 받은 제안이 없습니다. 다른 나라 대표단을 직접 찾아가 말을 걸어 보세요.</p> : (
          <ul className="space-y-2">{incoming.map((p) => <ProposalCard key={p.id} p={p} state={state} me={me.country} canAct={canAct} cmd={cmd} />)}</ul>
        )}
      </Panel>

      <Panel title="✉️ 제안 보내기">
        {lack.length > 0 && (
          <div className="mb-3 rounded-lg bg-rose-500/10 border border-rose-500/40 p-2.5">
            <div className="text-xs font-semibold text-rose-200 mb-1.5">⚡ 빠른 요청 — 누르면 아래 칸이 자동으로 채워져요</div>
            <div className="flex flex-wrap gap-1.5">
              {lack.map((k) => <Btn key={k} small tone="danger" onClick={() => askHelp(k)}>{RES_INFO[k].icon} {RES_INFO[k].name} {c.need[k] - c.stock[k]} 요청</Btn>)}
            </div>
          </div>
        )}
        <div className="text-xs font-semibold text-slate-300 mb-1">① 어느 나라에?</div>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="상대 국가">
          {others.map((id) => (
            <button key={id} role="radio" aria-checked={to === id} onClick={() => setTo(id)}
              className={cx('rounded-lg border px-1 py-2 text-[11px] font-semibold leading-tight', to === id ? 'bg-ink-600 text-white' : 'border-line text-slate-300')} style={to === id ? { borderColor: COUNTRIES[id].color } : undefined}>
              <span className="block text-lg" aria-hidden>{COUNTRIES[id].icon}</span>{COUNTRIES[id].short}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-300 mt-1.5">
          {COUNTRIES[to].short}: {spare(to).length ? <>남는 것 <b className="text-emerald-300">{spare(to).map((k) => RES_INFO[k].name).join('·')}</b></> : '남는 자원이 거의 없음'}
          {state.phase === 'running' && lacking(state, to).length > 0 && <> · 부족한 것 <b className="text-rose-300">{lacking(state, to).map((k) => RES_INFO[k].name).join('·')}</b></>}
        </p>
        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          <div className="rounded-lg bg-ink-950/50 p-3"><div className="text-xs font-semibold text-rose-200 mb-2">② 우리가 줄 것</div><ResPicker value={give} onChange={setGive} have={c.stock} cols={1} /></div>
          <div className="rounded-lg bg-ink-950/50 p-3"><div className="text-xs font-semibold text-emerald-200 mb-2">③ 우리가 받을 것</div><ResPicker value={take} onChange={setTake} have={tc.stock} cols={1} /></div>
        </div>
        <input value={memo} maxLength={80} onChange={(e) => setMemo(e.target.value)} placeholder="한 줄 메시지 (선택) 예: 다음 라운드에도 거래해요" aria-label="한 줄 메시지" className="mt-3 w-full rounded-lg bg-ink-950/60 border border-line px-3 py-2 text-sm" />
        <div className="mt-3 flex items-center gap-3">
          <Btn disabled={!canAct || busy || g + t === 0} onClick={send}>제안 보내기</Btn>
          <span className="text-xs text-slate-300">{kind || '줄 것이나 받을 것을 입력하세요'}</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">상대 대표가 승인하면 자원이 한 번에 교환됩니다. 거래는 몇 번이든 할 수 있고, 답이 없는 제안은 라운드가 끝나면 사라집니다. 부족한 나라를 대가 없이 도우면 신뢰도가 오릅니다.</p>
      </Panel>

      {outgoing.length > 0 && <Panel title={`📤 보낸 제안 (${outgoing.length})`}><ul className="space-y-2">{outgoing.map((p) => <ProposalCard key={p.id} p={p} state={state} me={me.country} canAct={canAct} cmd={cmd} />)}</ul></Panel>}
      {history.length > 0 && <Panel title="🗒️ 지난 협상 기록"><ul className="space-y-2">{history.map((p) => <ProposalCard key={p.id} p={p} state={state} me={me.country} canAct={false} cmd={cmd} />)}</ul></Panel>}
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
  const feasible = can(from, p.give) && can(to, p.take);
  const [label, tone] = statusBadge[p.status];
  return (
    <li className="rounded-xl border border-line bg-ink-950/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold"><CountryTag id={p.from} /> <span className="text-slate-400">→</span> <CountryTag id={p.to} /></div>
        <div className="flex items-center gap-1.5"><span className="text-[10px] text-slate-500">R{p.round}</span><Badge tone={tone}>{label}</Badge></div>
      </div>
      <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[13px]">
        <span className="text-slate-400">{COUNTRIES[p.from].short}가 줌</span><BundleText b={p.give} />
        <span className="text-slate-400">{COUNTRIES[p.to].short}가 줌</span><BundleText b={p.take} />
      </div>
      {p.memo && <p className="mt-1.5 text-xs text-slate-300 italic">“{p.memo}”</p>}
      {p.status === 'pending' && !feasible && <p className="mt-1.5 text-xs text-rose-300">⚠ 지금은 한쪽의 자원이 모자라 체결할 수 없습니다.</p>}
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
  const [detail, setDetail] = useState(false);
  const d = sel ? COUNTRIES[sel] : null;
  return (
    <>
      <Panel>
        <PeaceGauge state={state} />
        <button className="text-xs text-sky-300 underline mt-3" onClick={() => setDetail((v) => !v)}>{detail ? '계산 방법 접기' : '평화 지수는 어떻게 계산되나요?'}</button>
        {detail && <div className="mt-3"><PeaceBreakdown state={state} /></div>}
      </Panel>
      <Panel title="🗺️ 세계 지도" right={<span className="text-[11px] text-slate-400">나라를 누르면 정보</span>}>
        <WorldMap state={state} me={me.country} onPick={setSel} />
        {d && sel && (
          <div className="anim-pop mt-3 rounded-xl border p-3 text-sm" style={{ borderColor: d.color }}>
            <div className="flex justify-between items-start"><b style={{ color: d.color }}>{d.icon} {d.name} · {d.tagline}</b><button className="text-slate-400 text-xs" onClick={() => setSel(null)}>닫기 ✕</button></div>
            <p className="text-xs text-slate-300 mt-1">강점: {d.strength} / 약점: {d.weakness}</p>
            <p className="text-xs mt-1.5 tnum">{RES.map((k) => `${RES_INFO[k].icon} ${state.countries[sel].stock[k]}`).join('   ')}</p>
            <p className="text-xs text-slate-400 mt-0.5">라운드마다 필요: 식량 {state.countries[sel].need.food} · 물 {state.countries[sel].need.water} · 에너지 {state.countries[sel].need.energy}</p>
          </div>
        )}
      </Panel>
      <Panel title="📊 나라별 현황"><CountryTable state={state} me={me.country} /></Panel>
      <Panel title="📰 국제 뉴스"><NewsFeed state={state} limit={6} /></Panel>
      <Panel title="📜 함께 맺은 약속"><AgreementList state={state} /></Panel>
    </>
  );
}

// ───────────────────────── 성찰·보고서 ─────────────────────────
function ReportView({ state, me, cmd, back }: P & { back: () => void }) {
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
      <Panel title="✍️ 성찰 작성" className="no-print" right={<Btn small tone="ghost" onClick={back}>← 게임 화면</Btn>}>
        <p className="text-xs text-slate-300 mb-3">직접 쓴 내용만 보고서에 실립니다. {saved && !dirty ? <b className="text-emerald-300">✓ 저장됨</b> : dirty ? <b className="text-amber-300">저장이 필요합니다</b> : ''}</p>
        {REFLECTION_QUESTIONS.map((q, i) => (
          <div key={i} className="mb-3">
            <label htmlFor={`rq${i}`} className="text-sm font-semibold">Q{i + 1}. {q}</label>
            <textarea id={`rq${i}`} rows={3} maxLength={600} value={answers[i]} onChange={(e) => { setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v))); setDirty(true); }}
              className="mt-1 w-full rounded-lg bg-ink-950/60 border border-line px-3 py-2 text-sm leading-relaxed" placeholder="자유롭게 적어 보세요." />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Btn disabled={busy || !dirty} onClick={save}>성찰 저장</Btn>
          <Btn tone="ghost" onClick={() => { if (dirty) return toast('먼저 성찰을 저장하세요.', 'err'); window.print(); }}>🖨️ 보고서 인쇄 / PDF로 저장</Btn>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">인쇄 창에서 "PDF로 저장"을 고르면 A4 보고서 파일로 내려받을 수 있습니다.</p>
      </Panel>
      <Panel><CountryReport state={state} id={me.country} reflections={me.reflections} /></Panel>
    </>
  );
}
