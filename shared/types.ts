// WORLD 2050 — 서버와 클라이언트가 공유하는 타입 정의

export type CountryId = 'ARC' | 'SOL' | 'GRN' | 'OCE' | 'IND' | 'NOV';
export type Res = 'eco' | 'food' | 'water' | 'energy';
export type Vital = 'food' | 'water' | 'energy';
export type Phase = 'lobby' | 'running' | 'paused' | 'roundEnd' | 'finished';
export type ResMap = Record<Res, number>;
export type ResBundle = Partial<Record<Res, number>>;

export interface Snapshot {
  round: number;
  stock: ResMap;
  happy: number;
  env: number;
  trust: number;
  shortages: Vital[];
}

export interface CountryState {
  id: CountryId;
  stock: ResMap;
  prod: ResMap;
  need: Record<Vital, number>;
  happy: number;
  env: number;
  trust: number;
  /** 이번 라운드에 고른 정책 카드 (라운드마다 1장) */
  policy: { id: string; pick?: Vital } | null;
  /** 라운드별 부족 자원 기록 */
  shortages: Record<number, Vital[]>;
  /** 이번 라운드에 얻은 신뢰도 보너스 (상한 관리용) */
  roundTrust: { trade: number; aid: number };
  hubBonus: number;
  quizBonus: number[];
  delegate: string | null;
  history: Snapshot[];
}

export interface Player {
  id: string;
  nick: string;
  country: CountryId;
  online: boolean;
}

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

export interface Proposal {
  id: string;
  from: CountryId;
  to: CountryId;
  /** 제안국(from)이 주는 자원 */
  give: ResBundle;
  /** 제안국(from)이 받는 자원 */
  take: ResBundle;
  memo: string;
  status: ProposalStatus;
  round: number;
  t: number;
  doneT?: number;
}

export interface Agreement {
  id: string;
  round: number;
  title: string;
  parties: CountryId[];
  text: string;
}

export interface News {
  id: string;
  t: number;
  round: number;
  title: string;
  body: string;
  tone: 'bad' | 'good' | 'info';
}

export interface LogEntry {
  t: number;
  round: number;
  type: 'system' | 'action' | 'trade' | 'project' | 'event' | 'treaty' | 'dispute' | 'teacher';
  country?: CountryId;
  text: string;
}

/** 라운드 공동 대응: 나라마다 참여/불참만 정함 */
export interface Project {
  round: number;
  id: string;
  joined: CountryId[];
  success?: boolean;
}

export type Stance = 'negotiate' | 'mediate' | 'unilateral';
export interface Dispute {
  parties: [CountryId, CountryId];
  stances: Partial<Record<CountryId, Stance>>;
  mediators: CountryId[];
  result?: 'peace' | 'one' | 'both' | 'unresolved';
  resultText?: string;
}

export interface Treaty {
  /** 나라별 조항 찬반 (true = 찬성) */
  votes: Partial<Record<CountryId, Record<string, boolean>>>;
  result?: { adopted: boolean; clauses: Record<string, boolean> };
}

export interface Recurring {
  from: CountryId;
  to: CountryId;
  res: Res;
  amt: number;
  until: number;
  label: string;
}

export interface CountryResult {
  survival: number;
  happy: number;
  env: number;
  trust: number;
  total: number;
  survived: boolean;
  shortageCount: number;
}

export interface Results {
  countries: Record<CountryId, CountryResult>;
  world: {
    peace: number;
    peaceStart: number;
    gapStart: number;
    gapEnd: number;
    /** 성공한 공동 대응 수 (물 기금·에너지 연구·재난 구호) */
    projects: number;
    reliefSuccess: boolean;
    disputePeace: boolean;
    treatyAdopted: boolean;
    treatyClauses: number;
    survivors: number;
  };
  outcome: 'win' | 'partial' | 'crisis';
}

export interface Reflection {
  nick: string;
  answers: string[];
  t: number;
}

/** 서버에 저장되는 방 전체 상태 */
export interface Room {
  /** 저장 형식 버전 (규칙이 바뀌면 올림) */
  v: 2;
  code: string;
  className: string;
  createdAt: number;
  phase: Phase;
  round: number;
  durationSec: number;
  endsAt: number | null;
  remainingMs: number | null;
  countries: Record<CountryId, CountryState>;
  players: Record<string, Player>;
  proposals: Proposal[];
  agreements: Agreement[];
  recurring: Recurring[];
  news: News[];
  log: LogEntry[];
  project: Project | null;
  projectResults: Record<string, { joined: number; success: boolean }>;
  dispute: Dispute | null;
  treaty: Treaty | null;
  peace: number;
  peaceHistory: { round: number; label: string; value: number }[];
  severity: number;
  results: Results | null;
  quizStats: Record<number, { answered: number; correct: number }>;
  seq: number;
  // ── 비공개 영역 (publicView에서 제거) ──
  joinCodes: Record<CountryId, string>;
  sessions: Record<string, string>;
  quizAnswers: Record<number, Record<string, number>>;
  reflections: Partial<Record<CountryId, Record<string, Reflection>>>;
}

export type PublicRoom = Omit<Room, 'joinCodes' | 'sessions' | 'quizAnswers' | 'reflections'>;

export interface MeInfo {
  pid: string;
  country: CountryId;
  quiz: Record<number, number>;
  reflections: Record<string, Reflection>;
}

export interface Ctx {
  now: number;
  teacher?: boolean;
  pid?: string;
  country?: CountryId;
}

export class GameError extends Error {}
