// WORLD 2050 — 서버와 클라이언트가 공유하는 타입 정의

export type CountryId = 'ARC' | 'SOL' | 'GRN' | 'OCE' | 'IND' | 'NOV';
export type Res = 'eco' | 'food' | 'water' | 'energy' | 'tech';
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
  ap: number;
  /** 이번 라운드에 이미 사용한 행동 id */
  used: string[];
  /** 게임 전체에서 한 번만 가능한 행동 중 사용한 것 */
  usedOnce: string[];
  adapted: boolean;
  /** 라운드별 부족 자원 기록 */
  shortages: Record<number, Vital[]>;
  /** 국제사회 기여 포인트 (지원·공동 대응·중재 등) */
  contrib: number;
  /** 이번 라운드에 얻은 신뢰도 보너스 (상한 관리용) */
  roundTrust: { trade: number; aid: number; project: number };
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

export type ProposalKind = 'trade' | 'pact';
export type PactType = 'friend' | 'research' | 'waterdev' | 'renew';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

export interface Proposal {
  id: string;
  kind: ProposalKind;
  pactType?: PactType;
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
  type: 'system' | 'action' | 'trade' | 'pact' | 'project' | 'event' | 'treaty' | 'dispute' | 'teacher';
  country?: CountryId;
  text: string;
}

export interface Project {
  round: number;
  id: string;
  target: number;
  contributions: Partial<Record<CountryId, ResBundle>>;
  total: number;
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

export type ClauseLevel = 'none' | 'base' | 'strong';
export interface Treaty {
  choices: Partial<Record<CountryId, Record<string, ClauseLevel>>>;
  ratify: Partial<Record<CountryId, 'yes' | 'no'>>;
  notes: Partial<Record<CountryId, string>>;
  result?: { adopted: boolean; clauses: Record<string, ClauseLevel>; yes: CountryId[]; no: CountryId[] };
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
  contrib: number;
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
    reliefPct: number;
    treatyAdopted: boolean;
    treatyClauses: number;
    agreements: number;
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
  pactKeys: string[];
  recurring: Recurring[];
  news: News[];
  log: LogEntry[];
  project: Project | null;
  pastProjects: Project[];
  dispute: Dispute | null;
  treaty: Treaty | null;
  coop: number;
  coopRound: { trade: number; aid: number; pact: number };
  peace: number;
  peaceHistory: { round: number; label: string; value: number }[];
  severity: number;
  reliefPct: number;
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
