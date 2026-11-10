import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Rules } from './components/Learn';
import { nav } from './lib/net';
import { Btn, ToastHost } from './lib/ui';
import Home from './pages/Home';
import Student from './pages/Student';

// 학생 기기는 교사·전자칠판 화면 코드를 내려받지 않음
const Board = lazy(() => import('./pages/Board'));
const Teacher = lazy(() => import('./pages/Teacher'));
const Loading = <div className="p-8 text-center text-slate-300">불러오는 중…</div>;

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const seg = path.split('/').filter(Boolean);
  if (seg[0] === 'play') return <Student />;
  if (seg[0] === 'teacher') return <Suspense fallback={Loading}><Teacher code={seg[1]?.toUpperCase()} /></Suspense>;
  if (seg[0] === 'board' && seg[1]) return <Suspense fallback={Loading}><Board code={seg[1].toUpperCase()} /></Suspense>;
  if (seg[0] === 'rules') {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <Btn small tone="ghost" onClick={() => nav('/')}>← 처음으로</Btn>
        <h1 className="text-2xl font-extrabold mt-3">WORLD 2050 게임 규칙</h1>
        <div className="panel p-4 mt-3"><Rules /></div>
      </div>
    );
  }
  return <Home />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><ToastHost><App /></ToastHost></StrictMode>);
