// 국가별 활동 보고서 (인쇄 → PDF 저장). 서버에 기록된 사실과 학생이 직접 쓴 성찰만 담습니다.
import { learnedCards } from '../../../shared/content';
import { COUNTRIES, COUNTRY_IDS, REFLECTION_QUESTIONS, RES, RES_INFO, ROUNDS } from '../../../shared/data';
import { diagnose } from '../../../shared/lessons';
import { calcResults } from '../../../shared/engine';
import type { CountryId, PublicRoom, Reflection, Room } from '../../../shared/types';

const lifeText = (lives: number, died: number | null) => (died !== null ? `멸망(R${died})` : `목숨 ${lives}개`);

export function CountryReport({ state, id, reflections }: { state: PublicRoom; id: CountryId; reflections: Record<string, Reflection> }) {
  const d = COUNTRIES[id], c = state.countries[id];
  const init = c.history[0];
  const res = state.results ?? calcResults(state as Room);
  const my = res.countries[id];
  const mine = (t: string[]) => state.log.filter((l) => t.includes(l.type) && (l.country === id || l.text.includes(d.short)));
  const actions = state.log.filter((l) => l.type === 'action' && l.country === id);
  const deals = mine(['trade']).filter((l) => l.text.includes('⇄') || l.text.includes('지원') || l.text.includes('체결'));
  const crisis = mine(['project', 'dispute', 'treaty', 'relief']);
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
        <p className="text-sm mt-1">시작 자원 — {RES.map((k) => `${RES_INFO[k].name} ${init.stock[k]}`).join(', ')} · 목숨 {init.lives}개 · 환경 {init.env} · 신뢰도 {init.trust}</p>
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
          <thead><tr className="text-left"><th className="py-1">시점</th>{RES.map((k) => <th key={k}>{RES_INFO[k].name}</th>)}<th>목숨</th><th>환경</th><th>신뢰도</th><th>부족</th></tr></thead>
          <tbody>
            {c.history.map((h) => (
              <tr key={h.round} className="border-t border-slate-600">
                <td className="py-1">{h.round === 0 ? '시작' : `R${h.round} 종료`}</td>{RES.map((k) => <td key={k}>{h.stock[k]}</td>)}
                <td>{h.lives}</td><td>{h.env}</td><td>{h.trust}</td><td>{h.shortages.map((k) => RES_INFO[k].name).join('·') || '없음'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm mt-2">{state.phase === 'finished' ? <>최종 <b>{my.rank}위</b> · </> : null}{lifeText(c.lives, c.diedRound)} · 나라 점수 {my.score}점 (신뢰도 40% + 환경 40% + 돈 최대 20점)</p>
      </Sec>

      <Sec t="6. 최종 순위와 세계에 일어난 일">
        <p className="text-sm">{state.phase === 'finished' ? `순위: ${res.ranking.map((x, i) => `${i + 1}위 ${COUNTRIES[x].short}(${lifeText(res.countries[x].lives, res.countries[x].diedRound)})`).join(' · ')}` : '순위는 게임이 끝나면 확정됩니다.'}</p>
        <p className="text-sm">살아남은 나라 {res.world.survivors}/6 · 성공한 공동 대응 {res.world.projects}/3 (재난 구호 {res.world.reliefSuccess ? '성공' : '실패'}) · 미르강 분쟁 {{ peace: '평화적 해결', failed: '평화적 해결 실패', none: '일어나지 않음' }[res.world.dispute]} · 세계 평화 협약 {res.world.treatyAdopted ? `채택 (${res.world.treatyClauses}개 조항)` : '무산'}</p>
      </Sec>

      <Sec t="7. 학습한 세계 시민 교육 개념"><p className="text-sm">{concepts.join(' · ')}</p></Sec>

      <Sec t="8. 결과 분석과 현실의 교훈 (기록에 근거한 자동 분석)">
        <p className="text-sm mb-1">성사된 거래·지원 {deals.length}건 · 함께한 국제 약속 {agreements.length}건 · 필수 자원 부족: {shortRounds.length ? shortRounds.join(', ') : '없음'} · 신뢰도 {init.trust} → {c.trust} · 환경 {init.env} → {c.env}</p>
        {diagnose(state, id).map((f, i) => (
          <div key={i} className="mt-1.5 text-sm"><p className="font-semibold">{f.tone === 'bad' ? '▲' : '●'} {f.title} — {f.fact}</p><p className="pl-3">{f.lesson}</p></div>
        ))}
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
  const rows: (string | number)[][] = [['학급', '순위', '국가', '목숨', '멸망 라운드', '나라 점수', '부족 횟수', '돈', '식량', '물', '에너지', '환경', '신뢰도', '결과 분석']];
  for (const id of res.ranking) {
    const c = room.countries[id], r = res.countries[id];
    rows.push([room.className, r.rank, COUNTRIES[id].name, c.lives, c.diedRound ?? '', r.score, r.shortageCount, ...RES.map((k) => c.stock[k]), c.env, c.trust, diagnose(room, id).map((f) => f.title).join(' / ')]);
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
