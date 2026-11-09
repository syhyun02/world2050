// 교육 콘텐츠 화면: 오늘의 세계 시민 지식 패널, 퀴즈, 규칙 안내
import { useEffect, useState } from 'react';
import { cardsFor, QUIZZES, type Card } from '../../../shared/content';
import { ACTIONS, BASE_AP, CLAUSES, PACTS, RES_INFO, RES, SURVIVAL_HAPPY, TREATY_RULES, WIN_PEACE } from '../../../shared/data';
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
    <Panel title={`🧠 ROUND ${rd} 퀴즈`} right={answered ? <Badge tone={mine === quiz.answer ? 'good' : 'warn'}>{mine === quiz.answer ? '✓ 정답' : '△ 오답 (불이익 없음)'}</Badge> : <Badge tone="info">정답 시 우리 국가 행동 포인트 +1</Badge>}>
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
          {bonus && <p className="mt-2 text-emerald-300 text-xs">우리 국가가 이번 라운드 퀴즈 보너스(행동 포인트 +1)를 받았습니다.</p>}
        </div>
      )}
    </Panel>
  );
}

export function Rules() {
  const H = ({ children }: { children: string }) => <h3 className="font-bold text-sky-200 mt-4 mb-1.5 text-sm">{children}</h3>;
  return (
    <div className="text-sm text-slate-200 leading-relaxed">
      <H>1. 목표</H>
      <p>다른 나라를 이기는 게임이 아닙니다. <b>모든 국가가 최소 생존 조건을 달성</b>하고 <b>세계 평화 지수 {WIN_PEACE} 이상</b>이면 전 세계가 함께 승리합니다.</p>
      <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-300">
        <li>최소 생존 조건: 최종 국민 행복도 {SURVIVAL_HAPPY} 이상 + 마지막 라운드에 식량·물·에너지 부족 없음</li>
      </ul>
      <H>2. 라운드 진행 (총 5라운드)</H>
      <ol className="list-decimal pl-5 space-y-0.5 text-slate-300">
        <li>라운드 시작: 각국이 자원을 생산하고 세계 사건이 발생합니다.</li>
        <li>협상 시간: 행동 포인트 {BASE_AP}점으로 정책을 실행하고, 다른 나라와 거래·협정을 맺습니다.</li>
        <li>라운드 종료: 식량·물·에너지를 필요량만큼 소비합니다. 모자라면 부족 1당 행복도 −1.5 (자원별 최대 −12), 모두 충분하면 행복도 +1.</li>
      </ol>
      <H>3. 행동 (대표가 실행, 각 행동은 라운드당 1회)</H>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[520px]">
          <thead><tr className="text-left text-slate-400"><th className="py-1 pr-2">행동</th><th className="pr-2">비용</th><th className="pr-2">효과</th><th>부작용</th></tr></thead>
          <tbody>
            {ACTIONS.map((a) => (
              <tr key={a.id} className="border-t border-line/50 align-top">
                <td className="py-1.5 pr-2 font-semibold whitespace-nowrap">{a.icon} {a.name}</td>
                <td className="pr-2 whitespace-nowrap">AP {a.ap}{RES.filter((k) => a.cost[k]).map((k) => `, ${RES_INFO[k].name} ${a.cost[k]}`).join('')}</td>
                <td className="pr-2">{a.effect}</td><td className="text-slate-400">{a.side}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <H>4. 외교</H>
      <ul className="list-disc pl-5 space-y-0.5 text-slate-300">
        <li><b>자원 거래·지원</b>: 행동 포인트가 들지 않습니다. 상대국 대표가 승인하는 순간 서버가 양쪽 자원을 확인하고 한 번에 교환합니다.</li>
        <li>거래가 성사되면 양국 신뢰도 +1 (라운드당 최대 +3). 자원이 <b>부족한 나라</b>를 대가 없이 도우면 인도적 지원으로 인정되어 3단위당 신뢰도 +1 (라운드당 최대 +8).</li>
        {Object.values(PACTS).map((p) => <li key={p.name}><b>{p.icon} {p.name}</b> (양국 AP 1{p.cost.eco ? `, 경제력 ${p.cost.eco}` : ''}): {p.effect} — {p.cond}</li>)}
        <li><b>공동 대응 프로젝트</b>: 첫 기여 시 AP 1. 기여 3단위당 신뢰도 +1 (라운드당 최대 +6). 목표를 달성하면 모든 나라가 혜택을 받습니다.</li>
      </ul>
      <H>5. 세계 평화 협약 (5라운드)</H>
      <ul className="list-disc pl-5 space-y-0.5 text-slate-300">
        <li>조항은 {CLAUSES.length}개이며, 나라마다 조항별로 <b>제외 / 기본안 / 강화안</b>을 고릅니다.</li>
        <li>강화안을 {TREATY_RULES.clauseVotes}개국 이상이 고르면 강화안, 기본안+강화안이 {TREATY_RULES.clauseVotes}개국 이상이면 기본안으로 조항이 포함됩니다.</li>
        <li><b>채택 조건</b>: 포함된 조항 {TREATY_RULES.minClauses}개 이상 + 비준 찬성 {TREATY_RULES.ratifyVotes}개국 이상. 라운드가 끝날 때 집계합니다.</li>
        <li><b>효력</b>: 비준한 나라에만 조항의 비용과 혜택이 적용됩니다. 비준하지 않은 나라는 신뢰도 −6. 협약이 무산되면 모든 나라 신뢰도 −3.</li>
      </ul>
      <H>6. 세계 평화 지수 계산</H>
      <p className="text-slate-300">평균 신뢰도 30% + 평균 행복도 25% + 평균 환경 15% + 국가 간 형평 15% + 국제 협력도 15%. 형평은 가장 행복한 나라와 가장 어려운 나라의 차이가 작을수록 높습니다. 협력도는 거래·지원·협정·공동 대응이 성사될 때 오르고, 일방적 조치가 있으면 내려갑니다.</p>
      <H>7. 국가별 성과 점수 (100점)</H>
      <ul className="list-disc pl-5 space-y-0.5 text-slate-300">
        <li>경제와 생존 안정성 25점: 자원 부족이 없을수록(15점), 경제 기반이 유지될수록(10점)</li>
        <li>국민 행복도 20점 · 환경 지속가능성 20점 · 국제 신뢰도 20점: 각 지수 × 0.2</li>
        <li>국제사회 기여 15점: 지원·공동 대응·중재·이주민 수용 실적 (국가 여건을 반영해 보정)</li>
      </ul>
      <p className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-100 text-xs p-3">
        ※ 이 점수와 지수는 학습을 위한 게임 지표입니다. 실제 국제사회의 복잡한 현실을 정확하게 수치로 나타낸 것이 아닙니다. 국가와 사건은 모두 가상이며, "세계 시민 지식" 카드의 설명만 실제 사실에 바탕을 둡니다.
      </p>
    </div>
  );
}
