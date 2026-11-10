// 국가별 활동 보고서 (인쇄 → PDF 저장). 서버에 기록된 사실과 학생이 직접 쓴 성찰만 담습니다.
import { learnedCards } from '../../../shared/content';
import { COUNTRIES, COUNTRY_IDS, IDX_INFO, REFLECTION_QUESTIONS, RES, RES_INFO, ROUNDS, SURVIVAL_HAPPY, WIN_PEACE } from '../../../shared/data';
import { calcResults } from '../../../shared/engine';
import type { CountryId, PublicRoom, Reflection, Room } from '../../../shared/types';

const outcomeText = { win: '세계 공동 승리', partial: '부분 성공', crisis: '위기 지속' } as const;

export function CountryReport({ state, id, reflections }: { state: PublicRoom; id: CountryId; reflections: Record<string, Reflection> }) {
  const d = COUNTRIES[id], c = state.countries[id];
  const init = c.history[0];
  const res = state.results ?? calcResults(state as Room);
  const my = res.countries[id];
  const mine = (t: string[]) => state.log.filter((l) => t.includes(l.type) && (l.country === id || l.text.includes(d.short)));
  const actions = state.log.filter((l) => l.type === 'action' && l.country === id);
  const deals = mine(['trade']).filter((l) => l.text.includes('⇄') || l.text.includes('지원') || l.text.includes('체결'));
  const crisis = mine(['project', 'dispute', 'treaty']);
  const agreements = state.agreements.filter((a) => a.parties.includes(id));
  const concepts = [...new Set(learnedCards(state.round, id).flatMap((k) => k.concepts))];
  const shortRounds = Object.entries(c.shortages).filter(([, v]) => v.length).map(([r, v]) => `R${r}(${v.map((k) => RES_INFO[k].name).join('·')})`);
  const members = Object.values(state.players).filter((p) => p.country === id);
  const Sec = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <section className="mt-5"><h3 className="font-bold text-base border-b border-slate-500 pb-1 mb-2">{t}</h3>{children}</section>
  );
  const List = ({ items, empty }: { items: string[]; empty: string }) =>
    items.length ? <ul className="list-disc pl-5 text-sm space-y-0.5">{items.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <article className="report text-slate-100 leading-relaxed">
      <header className="border-b-2 border-slate-400 pb-3">
        <p className="text-xs tracking-widest text-slate-400">WORLD 2050 · 세계 평화 협상 시뮬레이터 · 활동 보고서</p>
        <h2 className="text-2xl font-extrabold mt-1">{d.icon} {d.name} <span className="text-base font-medium text-slate-300">({d.tagline})</span></h2>
        <p className="text-sm mt-1">학급: {state.className} · 대표단: {members.map((m) => m.nick).join(', ') || '—'} · 진행: ROUND {state.round}/5 {state.phase === 'finished' ? '(종료)' : '(진행 중 작성)'}</p>
      </header>

      <Sec t="1. 초기 국가 상황">
        <p className="text-sm">강점: {d.strength} / 약점: {d.weakness} / 외교 목표: {d.goal}</p>
        <p className="text-sm mt-1">시작 자원 — {RES.map((k) => `${RES_INFO[k].name} ${init.stock[k]}`).join(', ')} · 행복도 {init.happy} · 환경 {init.env} · 신뢰도 {init.trust}</p>
      </Sec>

      <Sec t="2. 주요 정책 결정"><List items={actions.map((l) => `R${l.round}: ${l.text}`)} empty="기록된 정책 결정이 없습니다." /></Sec>
      <Sec t="3. 체결한 거래와 국제 협정">
        <List items={[...deals.map((l) => `R${l.round}: ${l.text}`), ...agreements.map((a) => `R${a.round} 협정: ${a.title} — ${a.text}`)]} empty="체결된 거래나 협정이 없습니다." />
      </Sec>
      <Sec t="4. 국제 위기 대응 과정">
        <List items={crisis.map((l) => `R${l.round} ${ROUNDS[l.round]?.crisis ?? ''}: ${l.text}`)} empty="기록된 위기 대응 활동이 없습니다." />
      </Sec>

      <Sec t="5. 최종 국가 지표">
        <table className="w-full text-sm tnum">
          <thead><tr className="text-left"><th className="py-1">시점</th>{RES.map((k) => <th key={k}>{RES_INFO[k].name}</th>)}<th>{IDX_INFO.happy.name}</th><th>환경</th><th>신뢰도</th><th>부족</th></tr></thead>
          <tbody>
            {c.history.map((h) => (
              <tr key={h.round} className="border-t border-slate-600">
                <td className="py-1">{h.round === 0 ? '시작' : `R${h.round} 종료`}</td>{RES.map((k) => <td key={k}>{h.stock[k]}</td>)}
                <td>{h.happy}</td><td>{h.env}</td><td>{h.trust}</td><td>{h.shortages.map((k) => RES_INFO[k].name).join('·') || '없음'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm mt-2">나라 점수 <b>{my.total}점</b> = 자원 확보 {my.survival}/25 + 행복도 {my.happy}/25 + 환경 {my.env}/25 + 신뢰도 {my.trust}/25</p>
      </Sec>

      <Sec t="6. 세계 공동 성과">
        <p className="text-sm">세계 평화 지수: {state.peaceHistory.map((h) => `${h.label} ${h.value}`).join(' → ')} (공동 승리 기준 {WIN_PEACE})</p>
        <p className="text-sm">생존 조건 달성 국가 {res.world.survivors}/6 · 행복도 격차 {res.world.gapStart} → {res.world.gapEnd} · 성공한 공동 대응 {res.world.projects}/3 (재난 구호 {res.world.reliefSuccess ? '성공' : '실패'}) · 미르강 분쟁 {res.world.disputePeace ? '평화적 해결' : '해결 실패'} · 세계 평화 협약 {res.world.treatyAdopted ? `채택 (${res.world.treatyClauses}개 조항)` : '무산'}</p>
        {state.phase === 'finished' && <p className="text-sm font-bold mt-1">최종 결과: {outcomeText[res.outcome]}</p>}
      </Sec>

      <Sec t="7. 학습한 세계 시민 교육 개념"><p className="text-sm">{concepts.join(' · ')}</p></Sec>

      <Sec t="8. 협상 과정의 성과와 한계 (기록에 근거한 사실)">
        <ul className="list-disc pl-5 text-sm space-y-0.5">
          <li>성사된 거래·지원 {deals.length}건, 함께한 국제 약속 {agreements.length}건</li>
          <li>필수 자원 부족: {shortRounds.length ? shortRounds.join(', ') : '없음'}</li>
          <li>최소 생존 조건(행복도 {SURVIVAL_HAPPY} 이상, 최종 라운드 부족 없음): {state.phase === 'finished' ? (my.survived ? '달성' : '미달성') : '게임 종료 후 판정'}</li>
          <li>신뢰도 변화 {init.trust} → {c.trust}, 환경 지속가능성 변화 {init.env} → {c.env}</li>
        </ul>
      </Sec>

      <Sec t="9. 성찰 (학생 직접 작성)">
        {Object.values(reflections).length === 0 && <p className="text-sm text-slate-400">작성된 성찰이 없습니다.</p>}
        {Object.values(reflections).map((r, i) => (
          <div key={i} className="mb-3">
            <p className="text-sm font-semibold">작성자: {r.nick}</p>
            {REFLECTION_QUESTIONS.map((q, j) => (
              <div key={j} className="mt-1.5 text-sm"><p className="font-medium">Q{j + 1}. {q}</p><p className="whitespace-pre-wrap pl-3 min-h-5">{r.answers[j] || '(작성하지 않음)'}</p></div>
            ))}
          </div>
        ))}
      </Sec>
      <p className="text-xs text-slate-400 mt-5 border-t border-slate-600 pt-2">※ 이 보고서는 게임 서버에 기록된 행동과 학생이 직접 작성한 성찰만으로 만들어졌습니다. 점수와 지수는 학습용 게임 지표이며 실제 국제사회를 정확히 수치화한 것이 아닙니다.</p>
    </article>
  );
}

/** 교사용: CSV 내보내기 (엑셀에서 한글이 깨지지 않도록 BOM 포함) */
export function downloadCsv(room: PublicRoom) {
  const res = room.results ?? calcResults(room as Room);
  const rows: (string | number)[][] = [['학급', '국가', '나라 점수', '자원 확보 점수', '행복도 점수', '환경 점수', '신뢰도 점수', '생존 조건', '부족 횟수', '돈', '식량', '물', '에너지', '행복도', '환경', '신뢰도', '세계 평화 지수', '공동 결과']];
  for (const id of COUNTRY_IDS) {
    const c = room.countries[id], r = res.countries[id];
    rows.push([room.className, COUNTRIES[id].name, r.total, r.survival, r.happy, r.env, r.trust, r.survived ? '달성' : '미달성', r.shortageCount, ...RES.map((k) => c.stock[k]), c.happy, c.env, c.trust, room.peace, outcomeText[res.outcome]]);
  }
  rows.push([], ['시각', '라운드', '종류', '국가', '내용']);
  for (const l of room.log) rows.push([new Date(l.t).toLocaleTimeString('ko-KR'), l.round, l.type, l.country ? COUNTRIES[l.country].short : '', l.text]);
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(`WORLD2050_${room.className}_${room.code}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}
export function download(name: string, data: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export { outcomeText };
