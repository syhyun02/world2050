// 학생용 게임 화면 (스마트폰 세로 화면 우선)
// 한 라운드에 할 일은 세 가지: ① 부족한 자원 채우기(협상) ② 정책 카드 1장 ③ 사건 카드
import { useEffect, useState } from 'react';
import {
  CLAUSES, COUNTRIES, COUNTRY_IDS, IDX_INFO, POLICIES, RELIEF_AMOUNT, RES, RES_INFO, ROUNDS, STANCES,
  TREATY_RULES, VITALS, balanceOf,
} from '../../../shared/data';
import { aliveIds, countryScore, lacking, projectInfo, ranking, tallyTreaty } from '../../../shared/engine';
import { diagnose } from '../../../shared/lessons';
import type { CountryId, MeInfo, Proposal, PublicRoom, ResBundle, Stance, Vital } from '../../../shared/types';
import { KnowledgeDock, QuizPanel, Rules } from '../components/Learn';
import { AgreementList, BreakingBanner, CountryTable, NewsFeed, PeaceBreakdown, PeaceGauge, WorldMap } from '../components/World';
import { nav, session, useRoom } from '../lib/net';
import { Badge, Bar, Btn, BundleText, Clock, ConnBadge, CountryTag, cx, Hearts, Panel, phaseLabel, ResPicker, useAction } from '../lib/ui';

type Cmd = (name: string, args?: Record<string, unknown>) => Promise<void>;
interface Draft { to: CountryId; give: ResBundle; take: ResBundle }
interface P { state: PublicRoom; me: MeInfo; cmd: Cmd; isDelegate: boolean; canAct: boolean }
type Tab = 'home' | 'deal' | 'world';
type View = Tab | 'help';

export default function Student() {
  const sess = session.get();
  const conn = useRoom('student', sess?.room ?? '', sess?.token);
  const { state, me, status } = conn;
  const [view, setView] = useState<View>('home');
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => { if (!sess) nav('/'); }, [sess]);
  useEffect(() => { if (state?.phase === 'finished' || state?.phase === 'running') setView((v) => (v === 'help' ? v : 'home')); }, [state?.phase, state?.round]);
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
  const dead = c.diedRound !== null;
  const canAct = state.phase === 'running' && isDelegate;
  const p: P = { state, me, cmd: conn.cmd, isDelegate, canAct };
  const incoming = state.proposals.filter((x) => x.to === me.country && x.status === 'pending').length;
  const tabs: [Tab, string, string, number?][] = [['home', '🏛️', '우리 나라'], ['deal', '🤝', '협상', incoming], ['world', '🌐', '세계']];
  const askHelp = (k: Vital) => {
    // 그 자원이 가장 많이 남는 나라를 상대로, 부족한 만큼을 돈과 바꾸는 제안을 미리 채워 둠
    const lack = c.need[k] - c.stock[k];
    const best = aliveIds(state).filter((id) => id !== me.country).sort((a, b) => (state.countries[b].stock[k] - state.countries[b].need[k]) - (state.countries[a].stock[k] - state.countries[a].need[k]))[0];
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
              <div className="font-bold truncate leading-tight" style={{ color: d.color }}>{d.name} <span className="text-sm"><Hearts lives={c.lives} dead={dead} /></span></div>
              <div className="text-[11px] text-slate-300 truncate">{phaseLabel(state)}{state.round >= 1 && state.phase !== 'finished' ? ` · ${ROUNDS[state.round].crisis}` : ''}</div>
            </div>
            <div className="text-right shrink-0">
              <Clock state={state} offset={conn.offset} className="text-xl font-extrabold leading-none" prefix="⏱ " pausedLabel="일시정지" />
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
        {dead && state.phase !== 'finished' && view !== 'help' && (
          <div className="no-print rounded-xl bg-slate-800 border border-slate-500 px-4 py-2.5 text-sm">💀 우리 나라는 ROUND {c.diedRound}에 멸망했습니다. 이제 <b>국제 구호단</b>으로서 라운드마다 한 나라를 도울 수 있습니다.</div>
        )}
        {!isDelegate && state.phase !== 'finished' && (view === 'home' || view === 'deal') && (
          <div className="no-print rounded-xl bg-ink-800 border border-line px-4 py-2 text-xs text-slate-300">
            👀 나는 <b>대표단원</b>입니다. 버튼은 국가 대표만 누를 수 있어요. 화면을 함께 보며 대표와 의논하고, 퀴즈는 직접 풀어 보세요.
          </div>
        )}
        {view === 'home' && <HomeTab {...p} go={setView} askHelp={askHelp} incoming={incoming} />}
        {view === 'deal' && <DealTab {...p} draft={draft} clearDraft={() => setDraft(null)} askHelp={askHelp} />}
        {view === 'world' && <WorldTab {...p} />}
        {view === 'help' && <Panel title="📘 게임 규칙" right={<Btn small tone="ghost" onClick={() => setView('home')}>닫기 ✕</Btn>}><Rules /></Panel>}
      </main>
      {view !== 'help' && <KnowledgeDock round={state.round} country={me.country} />}
    </div>
  );
}

/** 우리 나라는 무엇이 남고 무엇이 모자란가 (평상시 라운드당) */
function BalanceLine({ id }: { id: CountryId }) {
  const b = balanceOf(id);
  const plus = VITALS.filter((k) => b[k] >= 4), minus = VITALS.filter((k) => b[k] <= -4);
  return (
    <p className="text-sm mt-3 rounded-lg bg-ink-950/50 border border-line px-3 py-2">
      <span className="text-slate-400">남는 것 </span><b className="text-emerald-300">{plus.length ? plus.map((k) => `${RES_INFO[k].icon} ${RES_INFO[k].name}`).join(', ') : '💰 돈'}</b>
      <span className="text-slate-400"> · 모자란 것 </span><b className="text-rose-300">{minus.map((k) => `${RES_INFO[k].icon} ${RES_INFO[k].name}`).join(', ')}</b>
      <span className="block text-xs text-slate-400 mt-0.5">남는 것을 팔아 모자란 것을 사세요. 거래하지 않으면 3라운드쯤 멸망합니다.</span>
    </p>
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
  const dead = c.diedRound !== null;
  const live = (state.phase === 'running' || state.phase === 'paused') && !dead;
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
          <p className="text-sm mt-2 rounded-lg bg-sky-500/10 border border-sky-500/30 px-3 py-2">🎯 <b>목표</b>: 끝까지 살아남아 1위 하기! 여섯 나라가 순위를 겨룹니다.</p>
          <p className="text-sm mt-2 rounded-lg bg-rose-500/10 border border-rose-500/40 px-3 py-2">❤️❤️ <b>목숨은 2개</b>. 라운드가 끝날 때 식량·물·에너지 중 하나라도 모자라면 목숨을 하나 잃고, 다 잃으면 나라가 멸망합니다.</p>
          <p className="text-sm font-semibold mt-3">라운드마다 할 일은 세 가지뿐이에요.</p>
          <ol className="mt-1.5 space-y-1.5 text-sm">
            {[['①', '부족한 자원 채우기', '모자란 자원은 다른 나라와 거래해서 구합니다. 팔지 말지는 상대 마음!'], ['②', '정책 카드 1장 고르기', '세 장 가운데 우리 나라에 필요한 한 장.'], ['③', '사건 카드에 답하기', '그 라운드의 세계 사건에 참여할지 정합니다.']].map(([n, t, s]) => (
              <li key={n} className="rounded-lg bg-ink-950/50 px-3 py-2"><b className="text-amber-300 mr-1.5">{n}</b><b>{t}</b><span className="text-slate-300"> — {s}</span></li>
            ))}
          </ol>
          <BalanceLine id={me.country} />
        </Panel>
      )}

      {state.phase === 'finished' && state.results && <ResultsPanel state={state} me={me.country} />}

      {state.phase === 'roundEnd' && (
        <Panel title={`📊 ROUND ${state.round} 결산`} className="anim-pop">
          <p className="text-sm">
            {c.shortages[state.round]?.length
              ? <span className="text-rose-300 font-semibold">{dead ? '💀' : '💔'} {c.shortages[state.round].map((k) => RES_INFO[k].name).join('·')}이(가) 모자라 {dead ? '마지막 목숨을 잃고 멸망했습니다.' : '목숨을 하나 잃었습니다. 한 번 더 모자라면 멸망합니다!'}</span>
              : dead ? <span className="text-slate-300">국제 구호단으로 활동 중입니다.</span> : <span className="text-emerald-300 font-semibold">✓ 필요한 자원을 모두 확보했습니다. 목숨을 지켰어요.</span>}
          </p>
          <p className="text-sm text-slate-300 mt-1">목숨 <Hearts lives={c.lives} dead={dead} /> · 환경 {prev.env} · 신뢰도 {prev.trust} · 현재 {ranking(state).indexOf(me.country) + 1}위</p>
          <p className="text-xs text-slate-400 mt-2">선생님이 다음 라운드를 시작할 때까지, 다음에 누구와 무엇을 거래할지 의논하세요.</p>
        </Panel>
      )}

      {dead && state.phase !== 'finished' && state.phase !== 'lobby' && <ReliefPanel {...p} />}

      {def && live && (
        <>
          <Panel title={`🚨 ROUND ${def.n}. ${def.crisis}`}>
            <p className="text-sm text-slate-200">{def.body}</p>
          </Panel>

          <Panel title="✅ 이번 라운드 할 일">
            <ol className="space-y-2">
              <Step n="1" done={lack.length === 0} title={lack.length ? '부족한 자원 채우기 — 못 채우면 💔 목숨 −1' : '부족한 자원 채우기'}
                sub={lack.length ? <span className="text-rose-200">{lack.map((k) => `${RES_INFO[k].name} ${c.need[k] - c.stock[k]}`).join(', ')} 부족{incoming ? ` · 받은 제안 ${incoming}건` : ''}</span> : incoming ? `모두 충분 · 받은 제안 ${incoming}건` : '식량·물·에너지 모두 충분'}
                action={<Btn small tone={lack.length || incoming ? 'primary' : 'ghost'} onClick={() => go('deal')}>협상하기</Btn>} />
              <Step n="2" done={!!c.policy} title="정책 카드 1장 고르기" sub={chosen ? `${chosen.icon} ${chosen.name}${c.policy!.pick ? ` (${RES_INFO[c.policy!.pick].name})` : ''} 선택 완료` : '아래 세 장 중 하나'} />
              {ev && <Step n="3" done={ev.done} title={`사건 카드: ${ev.label}`} sub={ev.text} />}
            </ol>
            <p className="text-[11px] text-slate-400 mt-2">순서는 상관없어요. 시간이 끝나면 식량·물·에너지를 필요한 만큼 소비하고, 하나라도 모자라면 목숨을 잃습니다.{!quizDone && ' 아래 퀴즈도 풀어 보세요 (정답이면 돈 +3).'}</p>
          </Panel>
        </>
      )}

      {!dead && <Panel title="📦 우리 나라 자원" right={<span className="text-base"><Hearts lives={c.lives} /></span>}>
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
          {(['env', 'trust'] as const).map((k) => (
            <div key={k}>
              <div className="flex justify-between text-xs mb-1">
                <span>{IDX_INFO[k].icon} {IDX_INFO[k].name}<span className="text-slate-500"> · {k === 'env' ? '낮으면 세계 재난 피해가 커짐' : '거래·지원·참여하면 올라감'}</span></span>
                <b className="tnum">{c[k]}</b>
              </div>
              <Bar value={c[k]} color={k === 'env' ? '#34d399' : '#38bdf8'} />
            </div>
          ))}
          <p className="text-[11px] text-slate-400">목숨이 같으면 나라 점수로 순위를 정합니다. 지금 <b className="text-slate-200">{countryScore(c)}점</b> (신뢰도 40% + 환경 40% + 돈 최대 20점)</p>
        </div>
      </Panel>}

      {live && <PolicyPanel {...p} />}
      {live && state.project && <ProjectPanel {...p} />}
      {live && state.dispute && <DisputePanel {...p} />}
      {live && state.treaty && <TreatyPanel {...p} />}
      {state.round >= 1 && state.phase !== 'finished' && <QuizPanel state={state} me={me} cmd={cmd} dead={dead} />}

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
        {state.phase !== 'lobby' && <BalanceLine id={me.country} />}
      </Panel>

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
      <ul className="grid sm:grid-cols-3 gap-2">
        {POLICIES.map((a) => {
          const pick = picks[a.id] ?? (a.pick ? (lack.find((k) => a.pick!.includes(k)) ?? a.pick[0]) : undefined);
          const poor = c.stock.eco < a.cost;
          return (
            <li key={a.id} className="rounded-xl border border-line bg-ink-950/40 p-3 flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-[15px]">{a.icon} {a.name}</div>
                <Badge tone={poor ? 'bad' : 'info'}>💰 돈 {a.cost}</Badge>
              </div>
              <p className="text-sm mt-1.5"><span className="text-emerald-300 font-semibold">👍 </span>{a.good}{a.id === 'invest' && me.country === 'IND' ? ' (우리는 +3)' : ''}</p>
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
  const info = projectInfo(state);
  const ok = pr.joined.length >= info.need;
  return (
    <Panel title={`🌐 사건 카드: ${def.name}`} right={<Badge tone={ok ? 'good' : 'warn'}>{ok ? '✓ 성공 조건 달성' : `${pr.joined.length} / ${info.need}개국`}</Badge>}>
      <p className="text-sm text-slate-200">{def.desc}</p>
      <p className="text-sm mt-1"><b className="text-emerald-300">{info.need}개국 이상 참여하면</b> {def.success}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
        {info.eligible.map((id) => <span key={id} className={pr.joined.includes(id) ? '' : 'opacity-40'}>{pr.joined.includes(id) ? '✅' : '⬜'} <CountryTag id={id} /></span>)}
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
            <p className="text-xs text-slate-400">두 나라 모두 평화로운 방법(위 두 가지)을 고르면: 남은 라운드 동안 그린벨트는 물 4, 솔라니아는 에너지 4를 서로 주고, 양국 신뢰도 +8. 한쪽이라도 혼자 밀어붙이면 상대는 물을 잃습니다.</p>
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
      <p className="text-xs text-slate-300">조항마다 찬성·반대를 고르세요. <b>{tally.needVotes}개국 이상 찬성</b>한 조항이 <b>{TREATY_RULES.minClauses}개 이상</b>이면 협약이 채택됩니다. 채택된 조항의 효과는 <b>찬성한 나라</b>에 적용되고 신뢰도 +2를 얻습니다. 라운드가 끝나기 전까지 바꿀 수 있어요.</p>
      <ul className="mt-3 space-y-2">
        {CLAUSES.map((cl) => {
          const n = tally.yes[cl.id].length, v = mine[cl.id];
          return (
            <li key={cl.id} className={cx('rounded-xl border p-3', tally.clauses[cl.id] ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-line bg-ink-950/40')}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-sm">{cl.icon} {cl.name}</div>
                <Badge tone={tally.clauses[cl.id] ? 'good' : 'mute'}>찬성 {n} / {tally.voters}</Badge>
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

/** 멸망한 나라의 화면: 국제 구호단으로 라운드마다 한 나라에 자원 지원 */
function ReliefPanel({ state, me, cmd, canAct }: P) {
  const c = state.countries[me.country];
  const alive = aliveIds(state);
  const [to, setTo] = useState<CountryId | null>(null);
  const [res, setRes] = useState<Vital>('food');
  const { run, busy } = useAction(cmd);
  const live = state.phase === 'running' || state.phase === 'paused';
  return (
    <Panel title="🚑 국제 구호단" right={c.reliefDone ? <Badge tone="good">✓ 이번 라운드 지원 완료</Badge> : <Badge tone="warn">라운드마다 한 번</Badge>}>
      <p className="text-sm text-slate-200">살아 있는 나라 하나를 골라 자원 {RELIEF_AMOUNT}을(를) 보낼 수 있습니다. 누구를 도울지는 구호단이 정합니다. 여러 나라의 이야기를 들어 보세요.</p>
      {!live ? <p className="text-sm text-slate-400 mt-2">다음 라운드가 시작되면 지원할 수 있습니다.</p>
        : c.reliefDone ? <p className="text-sm text-emerald-300 font-semibold mt-2">이번 라운드의 지원을 보냈습니다. 다음 라운드에 다시 도울 수 있어요.</p> : (
          <>
            <div className="text-xs font-semibold text-slate-300 mt-3 mb-1">① 어느 나라를 도울까요?</div>
            <div className="grid grid-cols-3 gap-1.5">
              {alive.map((id) => {
                const lack = lacking(state, id);
                return (
                  <button key={id} onClick={() => { setTo(id); if (lack[0]) setRes(lack[0]); }} aria-pressed={to === id}
                    className={cx('rounded-lg border px-1 py-2 text-xs font-semibold leading-tight', to === id ? 'bg-ink-600 text-white' : 'border-line text-slate-300')} style={to === id ? { borderColor: COUNTRIES[id].color } : undefined}>
                    <span className="block text-lg" aria-hidden>{COUNTRIES[id].icon}</span>{COUNTRIES[id].short}
                    <span className="block mt-0.5"><Hearts lives={state.countries[id].lives} /></span>
                    <span className={cx('block text-[10px] mt-0.5', lack.length ? 'text-rose-300' : 'text-slate-500')}>{lack.length ? `${lack.map((k) => RES_INFO[k].name).join('·')} 부족` : '부족 없음'}</span>
                  </button>
                );
              })}
            </div>
            <div className="text-xs font-semibold text-slate-300 mt-3 mb-1">② 무엇을 보낼까요?</div>
            <div className="flex gap-1.5">
              {VITALS.map((k) => <button key={k} onClick={() => setRes(k)} aria-pressed={res === k} className={cx('flex-1 rounded-lg border px-1 py-2 text-sm font-semibold', res === k ? 'border-sky-400 bg-sky-500/20 text-white' : 'border-line text-slate-300')}>{RES_INFO[k].icon} {RES_INFO[k].name} {RELIEF_AMOUNT}</button>)}
            </div>
            <Btn tone="good" className="mt-3 w-full" disabled={!canAct || busy || !to} onClick={() => run('relief', { to, res }, `${COUNTRIES[to!].short}에 ${RES_INFO[res].name} ${RELIEF_AMOUNT}을(를) 지원했습니다.`)}>{!to ? '도울 나라를 고르세요' : !canAct ? '대표만 보낼 수 있어요' : `${COUNTRIES[to].short}에 ${RES_INFO[res].name} 보내기`}</Btn>
          </>
        )}
    </Panel>
  );
}

/** 최종 결과: 순위 + 나라별 결과 분석(현실의 교훈) */
export function ResultsPanel({ state, me }: { state: PublicRoom; me?: CountryId }) {
  const r = state.results!;
  const [sel, setSel] = useState<CountryId>(me ?? r.ranking[r.ranking.length - 1]);
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <section className="rounded-2xl border-2 border-amber-400/70 bg-amber-500/5 p-4 anim-pop">
      <p className="text-xs tracking-widest text-slate-300">최종 결과</p>
      <h2 className="text-2xl font-extrabold mt-0.5">🏆 1위 <span style={{ color: COUNTRIES[r.ranking[0]].color }}>{COUNTRIES[r.ranking[0]].name}</span></h2>
      <p className="text-sm text-slate-300 mt-1">살아남은 나라 {r.world.survivors} / 6 · 순위는 오래 살아남은 순 → 남은 목숨 → 나라 점수로 정합니다.</p>
      <ol className="mt-3 space-y-1.5">
        {r.ranking.map((id, i) => {
          const c = r.countries[id];
          return (
            <li key={id}>
              <button onClick={() => setSel(id)} aria-pressed={sel === id} className={cx('w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-left', sel === id ? 'border-sky-400 bg-sky-500/15' : 'border-line bg-ink-950/40', me === id && 'ring-1 ring-white/50')}>
                <span className="w-8 text-center text-lg font-extrabold tnum">{medal[i] ?? `${i + 1}`}</span>
                <span className="flex-1 min-w-0 truncate"><CountryTag id={id} />{me === id && <span className="text-xs text-slate-400"> (우리)</span>}</span>
                <span className="text-sm">{c.diedRound !== null ? <span className="text-slate-400 whitespace-nowrap">💀 R{c.diedRound} 멸망</span> : <Hearts lives={c.lives} />}</span>
                <span className="w-14 text-right text-sm tnum text-slate-300">{c.score}점</span>
              </button>
            </li>
          );
        })}
      </ol>

      <h3 className="text-sm font-bold text-sky-200 mt-4 mb-2">🔎 왜 이런 결과가 나왔을까? — {COUNTRIES[sel].icon} {COUNTRIES[sel].short} <span className="font-normal text-slate-400">(위에서 나라를 누르면 바뀝니다)</span></h3>
      <ul className="space-y-2">
        {diagnose(state, sel).map((f, i) => (
          <li key={i} className={cx('rounded-xl border-l-4 bg-ink-950/50 px-3 py-2.5', f.tone === 'bad' ? 'border-rose-400' : 'border-emerald-400')}>
            <div className="font-bold text-sm">{f.tone === 'bad' ? '⚠' : '✓'} {f.title}</div>
            <div className="text-xs text-slate-300 mt-0.5">{f.fact}</div>
            <div className="text-sm text-amber-100 mt-1.5 leading-relaxed">🌍 {f.lesson}</div>
          </li>
        ))}
      </ul>

      <h3 className="text-sm font-bold text-sky-200 mt-4 mb-1">세계에 일어난 일</h3>
      <ul className="text-sm grid sm:grid-cols-2 gap-x-4 gap-y-1">
        <li>🌐 성공한 공동 대응 <b className="tnum">{r.world.projects} / 3</b></li>
        <li>⚖️ 미르강 분쟁 <b>{{ peace: '평화적 해결', failed: '평화적 해결 실패', none: '일어나지 않음' }[r.world.dispute]}</b></li>
        <li>📜 세계 평화 협약 <b>{r.world.treatyAdopted ? `채택 (${r.world.treatyClauses}개 조항)` : '무산'}</b></li>
        <li>🕊️ 세계 평화 지수 <b className="tnum">{r.world.peaceStart} → {r.world.peace}</b></li>
      </ul>
      <p className="text-[11px] text-slate-400 mt-3">※ 순위와 점수는 학습용 게임 지표입니다. 나라와 사건은 가상이며, 🌍 표시의 설명만 실제 사실에 바탕을 둡니다. 진 나라가 "못했다"기보다 어떤 구조에 놓였는지 살펴보세요.</p>
    </section>
  );
}

// ───────────────────────── 협상 ─────────────────────────
function DealTab({ state, me, cmd, canAct, draft, clearDraft, askHelp }: P & { draft: Draft | null; clearDraft: () => void; askHelp: (k: Vital) => void }) {
  const c = state.countries[me.country];
  const others = aliveIds(state).filter((id) => id !== me.country);
  const [to, setTo] = useState<CountryId>(draft?.to ?? others[0] ?? me.country);
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
  useEffect(() => { if (!others.includes(to) && others[0]) setTo(others[0]); }, [others.join()]);
  const spare = (id: CountryId) => VITALS.filter((k) => state.countries[id].stock[k] - state.countries[id].need[k] >= 3);
  const send = async () => {
    if (await run('propose', { to, give, take, memo }, `${COUNTRIES[to].short}에 제안을 보냈습니다. 상대 대표가 승인하면 체결됩니다.`)) { setGive({}); setTake({}); setMemo(''); }
  };
  if (c.diedRound !== null) return <Panel title="🤝 협상"><p className="text-sm text-slate-300">멸망한 나라는 거래할 수 없습니다. 「우리 나라」 화면에서 국제 구호단으로 다른 나라를 도와주세요.</p></Panel>;
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
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="상대 국가">{others.length === 0 && <p className="col-span-5 text-sm text-slate-400">거래할 수 있는 나라가 없습니다.</p>}
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
        <p className="text-[11px] text-slate-500 mt-2">상대 대표가 승인하면 자원이 한 번에 교환됩니다. 팔지 말지, 얼마에 팔지는 각 나라의 자유입니다. 답이 없는 제안은 라운드가 끝나면 사라집니다. 부족한 나라를 대가 없이 도우면 신뢰도가 오릅니다.</p>
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
