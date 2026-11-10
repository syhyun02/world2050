// 첫 화면: 학생 입장
import { useState } from 'react';
import { COUNTRIES, COUNTRY_IDS } from '../../../shared/data';
import { api, nav, session, type Session } from '../lib/net';
import { Btn } from '../lib/ui';

export default function Home() {
  const saved = session.get();
  const [room, setRoom] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [code, setCode] = useState('');
  const [nick, setNick] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (s: string, n: number) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { session.set(await api<Session>('/join', { body: { room, code, nick } })); nav('/play'); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-4 grid-bg">
      <div className="w-full max-w-md">
        <div className="text-center mb-5">
          <p className="text-xs tracking-[0.35em] text-sky-300">세계 평화 협상 시뮬레이터</p>
          <h1 className="text-5xl font-extrabold tracking-tight mt-1">WORLD <span className="text-sky-400">2050</span></h1>
          <p className="text-sm text-slate-300 mt-2">2050년, 여섯 나라가 살아남기를 겨룹니다. 목숨은 단 2개!</p>
          <div className="flex justify-center gap-2 mt-3 text-2xl" aria-hidden>{COUNTRY_IDS.map((id) => <span key={id} title={COUNTRIES[id].name}>{COUNTRIES[id].icon}</span>)}</div>
        </div>

        {saved && (
          <div className="panel p-4 mb-3 flex items-center gap-3">
            <div className="flex-1 text-sm">진행 중인 게임이 있습니다: <b style={{ color: COUNTRIES[saved.country].color }}>{COUNTRIES[saved.country].name}</b> (방 {saved.room})</div>
            <Btn small tone="good" onClick={() => nav('/play')}>이어서 하기</Btn>
          </div>
        )}

        <form onSubmit={submit} className="panel p-5 space-y-3">
          <h2 className="font-bold text-lg">학생 입장</h2>
          <label className="block text-sm text-slate-300">방 코드 (선생님 화면에 표시)
            <input value={room} onChange={(e) => setRoom(up(e.target.value, 8))} required autoCapitalize="characters" autoComplete="off" placeholder="예: K7M2Q" className="mt-1 block w-full rounded-lg bg-ink-950/60 border border-line px-3 py-3 text-2xl font-bold tracking-[0.3em] text-center" />
          </label>
          <label className="block text-sm text-slate-300">국가 참가 코드 (우리 모둠 코드)
            <input value={code} onChange={(e) => setCode(up(e.target.value, 6))} required autoCapitalize="characters" autoComplete="off" placeholder="예: X4PA" className="mt-1 block w-full rounded-lg bg-ink-950/60 border border-line px-3 py-3 text-2xl font-bold tracking-[0.3em] text-center" />
          </label>
          <label className="block text-sm text-slate-300">닉네임 (선택, 10자 이내)
            <input value={nick} onChange={(e) => setNick(e.target.value.slice(0, 10))} placeholder="비워 두면 '대표단 1'처럼 자동 지정" className="mt-1 block w-full rounded-lg bg-ink-950/60 border border-line px-3 py-2.5" />
          </label>
          {err && <p className="text-sm text-rose-300" role="alert">⚠ {err}</p>}
          <Btn type="submit" className="w-full !py-3 !text-base" disabled={busy || !room || !code}>{busy ? '입장 중…' : '게임 입장'}</Btn>
          <p className="text-[11px] text-slate-500 leading-relaxed">회원가입이 필요 없습니다. 닉네임 외의 개인정보는 수집하지 않으며, 닉네임에는 실명 대신 별명을 써도 됩니다. 같은 기기에서 새로고침하거나 다시 접속해도 게임이 이어집니다.</p>
        </form>

        <div className="flex justify-between mt-4 text-xs text-slate-400">
          <button className="underline" onClick={() => nav('/rules')}>📘 게임 규칙 보기</button>
          <button className="underline" onClick={() => nav('/teacher')}>교사용 관리 화면 →</button>
        </div>
      </div>
    </div>
  );
}
