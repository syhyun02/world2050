// 교사용 결과 내려받기 (엑셀에서 한글이 깨지지 않도록 BOM 포함)
import { COUNTRIES, RES } from '../../../shared/data';
import { calcResults } from '../../../shared/engine';
import { diagnose } from '../../../shared/lessons';
import type { PublicRoom, Room } from '../../../shared/types';

export function download(name: string, data: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadCsv(room: PublicRoom) {
  const res = room.results ?? calcResults(room as Room);
  const rows: (string | number)[][] = [['학급', '순위', '국가', '목숨', '멸망 라운드', '나라 점수', '부족 횟수', '거래 횟수', '돈', '식량', '물', '에너지', '환경', '신뢰도', '결과 분석']];
  for (const id of res.ranking) {
    const c = room.countries[id], r = res.countries[id];
    rows.push([room.className, r.rank, COUNTRIES[id].name, c.lives, c.diedRound ?? '', r.score, r.shortageCount, c.trades, ...RES.map((k) => c.stock[k]), c.env, c.trust, diagnose(room, id).map((f) => f.title).join(' / ')]);
  }
  rows.push([], ['시각', '라운드', '종류', '국가', '내용']);
  for (const l of room.log) rows.push([new Date(l.t).toLocaleTimeString('ko-KR'), l.round, l.type, l.country ? COUNTRIES[l.country].short : '', l.text]);
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(`WORLD2050_${room.className}_${room.code}.csv`, '\ufeff' + csv, 'text/csv;charset=utf-8');
}
