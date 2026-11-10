// 교육 콘텐츠 화면: 오늘의 세계 시민 지식 패널, 퀴즈, 규칙 안내
import { useEffect, useState } from 'react';
import { cardsFor, QUIZZES, type Card } from '../../../shared/content';
import { CLAUSES, POLICIES, ROUNDS, SURVIVAL_HAPPY, TREATY_RULES, WIN_PEACE } from '../../../shared/data';
import type { CountryId, MeInfo, PublicRoom } from '../../../shared/types';
import { Badge, Btn, cx, Panel } from '../lib/ui';

const kindLabel = (c: Card) => (c.kind === 'case' ? '실제 국제사회 사례' : c.kind === 'country' ? '우리 국가 특별 지식' : '공통 지식');

export function CardView({ card, open, onToggle }: { card: Card; open: boolean; onToggle: () => void }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <Badge tone={card.kind === 'case' ? 'warn' : card.kind === 'country' ? 'good' : 'info'}>{kindLabel(card)}</Badge>
        <Badge tone="mute">실제 사실에 기반한 설명</Badge>
      </div>
      <h3 className="font-bold text-[15px] text-white">{card.title}</h3>
      <p className="text-sm text-slate-200 mt-1 leading-relaxed">{card.body}</p>
      <div className="flex flex-wrap gap-1.5 mt-2">{card.concepts.map((k) => <span key={k} className="rounded-md bg-sky-500/15 text-sky-200 text-xs px-2 py-0.5 font-medium"># {k}</span>)}</div>
      {open && <p className="anim-pop text-sm text-slate-300 mt-2 leading-relaxed border-l-2 border-sky-500/60 pl-3">{card.more}</p>}
      <button onClick={onToggle} className="text-xs text-sky-300 underline underline-offset-2 mt-2">{open ? '접기' : '더 알아보기'}</button>
    </div>
  );
}

/** 화면 하단에 고정되는 '오늘의 세계 시민 지식' 패널 */
export function KnowledgeDock({ round, country }: { round: number; country?: CountryId }) {
  const cards = cardsFor(round, country);
  const [i, setI] = useState(0);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 640);
  const [more, setMore] = useState(false);
  useEffect(() => { setI(0); setMore(false); }, [round]);
  if (!cards.length) return null;
  const card = cards[i % cards.length];
  const go = (d: number) => { setI((v) => (v + d + cards.length) % cards.length); setMore(false); };
  return (
    <aside className="no-print fixed bottom-0 inset-x-0 z-30 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none" aria-label="오늘의 세계 시민 지식">
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-sky-500/50 bg-ink-800/95 backdrop-blur shadow-[0_-8px_30px_#000a]">
        <button onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed} className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
          <span className="text-lg" aria-hidden>📖</span>
          <span className="font-bold text-sm text-sky-200 shrink-0">오늘의 세계 시민 지식</span>
          <span className="text-xs text-slate-300 truncate flex-1">{collapsed ? card.title : ''}</span>
          <span className="text-xs text-slate-400 shrink-0">{collapsed ? '펼치기 ▲' : '접기 ▼'}</span>
        </button>
        {!collapsed && (
          <div className="px-4 pb-3 max-h-[46vh] overflow-y-auto">
            <CardView card={card} open={more} onToggle={() => setMore((v) => !v)} />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-line/60">
              <Btn small tone="ghost" onClick={() => go(-1)}>◀ 이전</Btn>
              <span className="text-xs text-slate-400 tnum">{(i % cards.length) + 1} / {cards.length}</span>
              <Btn small tone="ghost" onClick={() => go(1)}>다음 ▶</Btn>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export function QuizPanel({ state, me, cmd }: { state: PublicRoom; me: MeInfo; cmd: (n: string, a?: Record<string, unknown>) => Promise<void> }) {
  const rd = Math.min(state.round, 5);
  const quiz = QUIZZES[rd];
  const [sel, setSel] = useState<number | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { setSel(null); setErr(''); }, [rd]);
  if (!quiz) return <Panel title="🧠 라운드 퀴즈"><p className="text-sm text-slate-400">게임이 시작되면 라운드마다 퀴즈 1문항이 열립니다.</p></Panel>;
  const mine = me.quiz[rd];
  const answered = mine !== undefined;
  const bonus = state.countries[me.country].quizBonus.includes(rd);
  return (
    <Panel title={`🧠 ROUND ${rd} 퀴즈`} right={answered ? <Badge tone={mine === quiz.answer ? 'good' : 'warn'}>{mine === quiz.answer ? '✓ 정답' : '△ 오답 (불이익 없음)'}</Badge> : <Badge tone="info">정답이면 우리 나라 돈 +3</Badge>}>
      <p className="font-semibold text-[15px] leading-relaxed">{quiz.q}</p>
      <div className="mt-3 space-y-2">
        {quiz.choices.map((c, i) => {
          const isAns = answered && i === quiz.answer;
          const isMine = answered ? mine === i : sel === i;
          return (
            <button key={i} disabled={answered} onClick={() => setSel(i)}
              className={cx('w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors', isAns ? 'border-emerald-400 bg-emerald-500/15' : isMine ? (answered ? 'border-amber-400 bg-amber-500/10' : 'border-sky-400 bg-sky-500/15') : 'border-line bg-ink-950/40 hover:bg-ink-700')}>
              <b className="mr-2">{'①②③④'[i]}</b>{c}{isAns && ' ✓'}{answered && isMine && !isAns && ' (내 선택)'}
            </button>
          );
        })}
      </div>
      {!answered && (
        <div className="mt-3 flex items-center gap-3">
          <Btn disabled={sel === null} onClick={() => cmd('quiz', { choice: sel }).catch((e) => setErr(e.message))}>답 제출</Btn>
          <span className="text-xs text-slate-400">각자 1번만 제출할 수 있어요. 틀려도 불이익은 없습니다.</span>
        </div>
      )}
      {err && <p className="text-xs text-rose-300 mt-2">{err}</p>}
      {answered && (
        <div className="anim-pop mt-3 rounded-lg bg-ink-950/60 p-3 text-sm leading-relaxed">
          <p><b className="text-sky-200">해설</b> {quiz.explain}</p>
          <p className="mt-2 text-amber-200">🎯 {quiz.link}</p>
          {bonus && <p className="mt-2 text-emerald-300 text-xs">우리 나라가 이번 라운드 퀴즈 보너스(돈 +3)를 받았습니다.</p>}
        </div>
      )}
    </Panel>
  );
}

export function Rules() {
  const H = ({ children }: { children: string }) => <h3 className="font-bold text-sky-200 mt-4 mb-1.5 text-sm">{children}</h3>;
  return (
    <div className="text-sm text-slate-200 leading-relaxed">
      <H>🎯 목표</H>
      <p>다른 나라를 이기는 게임이 아닙니다. <b>여섯 나라가 모두 살아남고</b> <b>세계 평화 지수가 {WIN_PEACE} 이상</b>이면 다 함께 승리합니다.</p>
      <p className="text-slate-300 mt-1">살아남는 조건: 마지막에 행복도 {SURVIVAL_HAPPY} 이상 + 마지막 라운드에 식량·물·에너지가 모자라지 않음.</p>

      <H>🔁 한 라운드에 할 일 (총 5라운드)</H>
      <ol className="list-decimal pl-5 space-y-1 text-slate-300">
        <li><b className="text-white">부족한 자원 채우기</b> — 라운드가 끝나면 식량·물·에너지를 필요한 만큼 씁니다. 모자라면 행복도가 떨어져요(1 모자랄 때마다 −1.5, 자원마다 최대 −12). 모두 충분하면 행복도 +1. 모자란 자원은 「협상」에서 다른 나라와 거래해 채웁니다.</li>
        <li><b className="text-white">정책 카드 1장 고르기</b> — 네 장 중 한 장만.</li>
        <li><b className="text-white">사건 카드에 답하기</b> — 그 라운드의 세계 사건에 참여할지 정합니다.</li>
      </ol>

      <H>🃏 정책 카드 (라운드마다 1장)</H>
      <ul className="space-y-1 text-slate-300">
        {POLICIES.map((a) => <li key={a.id}><b className="text-white">{a.icon} {a.name}</b> (돈 {a.cost}) — {a.good}{a.bad !== '당장 자원이 늘지는 않음' ? ` / ${a.bad}` : ''}</li>)}
      </ul>

      <H>🤝 협상</H>
      <ul className="list-disc pl-5 space-y-0.5 text-slate-300">
        <li>거래는 몇 번이든 할 수 있습니다. 상대 대표가 승인하면 자원이 한 번에 교환됩니다.</li>
        <li>거래가 성사되면 두 나라 신뢰도 +1 (라운드당 최대 +3).</li>
        <li>자원이 모자란 나라에 대가 없이 주면 3개당 신뢰도 +1 (라운드당 최대 +6).</li>
      </ul>

      <H>🌐 사건 카드</H>
      <ul className="list-disc pl-5 space-y-0.5 text-slate-300">
        {[1, 2, 4].map((n) => { const p = ROUNDS[n].project!; return <li key={n}><b className="text-white">R{n} {p.name}</b> — 돈 {p.cost}을 내고 참여(신뢰도 +{n === 4 ? 4 : 3}). {p.need}개국 이상 참여하면 {p.success}.</li>; })}
        <li><b className="text-white">R3 미르강 분쟁</b> — 그린벨트와 솔라니아가 각자 입장을 고릅니다. 둘 다 평화로운 방법을 고르면 두 나라 신뢰도 +8, 한쪽이라도 혼자 밀어붙이면 신뢰도 −15와 피해가 생깁니다. 다른 나라는 중재에 나설 수 있습니다(신뢰도 +3).</li>
        <li><b className="text-white">R5 세계 평화 협약</b> — 조항 {CLAUSES.length}개에 찬성·반대 투표. {TREATY_RULES.clauseVotes}개국 이상 찬성한 조항이 {TREATY_RULES.minClauses}개 이상이면 채택됩니다. 채택된 조항의 효과와 신뢰도 +2는 찬성한 나라에 적용됩니다. 무산되면 모든 나라 신뢰도 −3.</li>
      </ul>

      <H>🕊️ 세계 평화 지수</H>
      <p className="text-slate-300">여섯 나라의 평균 신뢰도 40% + 평균 행복도 30% + 평균 환경 15% + 나라 간 형평 15%. 형평은 가장 행복한 나라와 가장 어려운 나라의 차이가 작을수록 높습니다. 한 나라만 잘살아서는 오르지 않아요.</p>

      <H>📊 나라 점수 (100점)</H>
      <p className="text-slate-300">자원 확보 25점(모자랄 때마다 −5) + 행복도 25점 + 환경 25점 + 신뢰도 25점.</p>

      <p className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-100 text-xs p-3">
        ※ 이 점수와 지수는 학습을 위한 게임 지표입니다. 실제 국제사회의 복잡한 현실을 정확하게 수치로 나타낸 것이 아닙니다. 나라와 사건은 모두 가상이며, "세계 시민 지식" 카드의 설명만 실제 사실에 바탕을 둡니다.
      </p>
    </div>
  );
}
