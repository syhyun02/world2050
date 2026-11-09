import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Rules } from './components/Learn';
import { nav } from './lib/net';
import { Btn, ToastHost } from './lib/ui';
import Board from './pages/Board';
import Home from './pages/Home';
import Student from './pages/Student';
import Teacher from './pages/Teacher';

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const seg = path.split('/').filter(Boolean);
  if (seg[0] === 'play') return <Student />;
  if (seg[0] === 'teacher') return <Teacher code={seg[1]?.toUpperCase()} />;
  if (seg[0] === 'board' && seg[1]) return <Board code={seg[1].toUpperCase()} />;
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
