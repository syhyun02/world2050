// WORLD 2050 — 게임 규칙 데이터 (국가, 행동, 사건, 협약). 수치를 바꾸면 게임 균형이 바뀝니다.
import type { CountryId, PactType, Res, ResBundle, ResMap, Vital } from './types';

export const COUNTRY_IDS: CountryId[] = ['ARC', 'SOL', 'GRN', 'OCE', 'IND', 'NOV'];
export const RES: Res[] = ['eco', 'food', 'water', 'energy', 'tech'];
export const VITALS: Vital[] = ['food', 'water', 'energy'];
export const TOTAL_ROUNDS = 5;
export const BASE_AP = 3;
export const SURVIVAL_HAPPY = 40;
export const WIN_PEACE = 65;

export const RES_INFO: Record<Res, { name: string; icon: string; unit: string }> = {
  eco: { name: '경제력', icon: '💰', unit: '자금' },
  food: { name: '식량', icon: '🌾', unit: '' },
  water: { name: '물', icon: '💧', unit: '' },
  energy: { name: '에너지', icon: '⚡', unit: '' },
  tech: { name: '기술력', icon: '🔬', unit: '' },
};
export const IDX_INFO = {
  happy: { name: '국민 행복도', icon: '😊' },
  env: { name: '환경 지속가능성', icon: '🌱' },
  trust: { name: '국제 신뢰도', icon: '🤝' },
} as const;

export interface CountryDef {
  id: CountryId;
  name: string;
  short: string;
  icon: string;
  color: string;
  tagline: string;
  strength: string;
  weakness: string;
  goal: string;
  topics: string;
  perk: string;
  stock: ResMap;
  prod: ResMap;
  need: Record<Vital, number>;
  happy: number;
  env: number;
  trust: number;
  /** 라운드마다 자연 변화하는 환경 지수 (산업 구조에 따른 배출) */
  envDrift: number;
  /** 국제 기여 점수 보정 계수 (국가 여건 반영) */
  capacity: number;
  map: { x: number; y: number };
}

const r = (eco: number, food: number, water: number, energy: number, tech: number): ResMap => ({ eco, food, water, energy, tech });

export const COUNTRIES: Record<CountryId, CountryDef> = {
  ARC: {
    id: 'ARC', name: '아르카디아 공화국', short: '아르카디아', icon: '🛰️', color: '#60a5fa',
    tagline: '첨단기술 강국',
    strength: '기술력 · 자본 · 연구 능력', weakness: '에너지 수입 의존',
    goal: '안정적인 에너지 공급망 확보', topics: '기술 격차, 에너지 안보',
    perk: '연구 강국: 연구개발 시 기술력 +7 (다른 국가는 +5)',
    stock: r(40, 14, 14, 10, 20), prod: r(16, 8, 10, 6, 8), need: { food: 10, water: 10, energy: 14 },
    happy: 65, env: 55, trust: 55, envDrift: -1, capacity: 1.3, map: { x: 215, y: 150 },
  },
  SOL: {
    id: 'SOL', name: '솔라니아 연방', short: '솔라니아', icon: '☀️', color: '#fbbf24',
    tagline: '에너지 자원 강국',
    strength: '풍부한 에너지 자원', weakness: '물 부족',
    goal: '안정적인 수자원 확보', topics: '자원 외교, 자원의 저주',
    perk: '에너지 부국: 매 라운드 에너지 생산량이 가장 많음',
    stock: r(30, 12, 8, 30, 6), prod: r(12, 8, 5, 26, 2), need: { food: 10, water: 12, energy: 8 },
    happy: 60, env: 45, trust: 50, envDrift: -2, capacity: 1.1, map: { x: 520, y: 330 },
  },
  GRN: {
    id: 'GRN', name: '그린벨트 왕국', short: '그린벨트', icon: '🌾', color: '#4ade80',
    tagline: '식량 생산 강국',
    strength: '농업 생산력', weakness: '기후변화에 따른 식량 생산 불안정',
    goal: '농업기술과 기후 대응 지원 확보', topics: '식량 안보, 지속가능한 농업',
    perk: '세계의 곡창: 매 라운드 식량 생산량이 가장 많음',
    stock: r(20, 28, 18, 10, 6), prod: r(8, 24, 14, 6, 2), need: { food: 8, water: 12, energy: 8 },
    happy: 65, env: 70, trust: 55, envDrift: 0, capacity: 1.0, map: { x: 470, y: 160 },
  },
  OCE: {
    id: 'OCE', name: '오세아나 공화국', short: '오세아나', icon: '🏝️', color: '#22d3ee',
    tagline: '해양 도서 국가',
    strength: '해양자원 · 국제 해상 교역', weakness: '해수면 상승과 자연재해',
    goal: '기후 적응 지원과 국가 생존', topics: '기후정의, 인도적 지원',
    perk: '해상 교역 허브: 거래가 성사될 때마다 경제력 +1 (라운드당 최대 +4)',
    stock: r(26, 14, 14, 10, 8), prod: r(12, 12, 14, 6, 3), need: { food: 8, water: 8, energy: 8 },
    happy: 60, env: 70, trust: 60, envDrift: 0, capacity: 0.9, map: { x: 800, y: 370 },
  },
  IND: {
    id: 'IND', name: '인더스트리아 연합', short: '인더스트리아', icon: '🏭', color: '#f87171',
    tagline: '산업 제조 강국',
    strength: '제조업 · 산업 생산력', weakness: '높은 탄소배출량과 에너지 소비',
    goal: '산업 성장과 탄소 감축의 균형', topics: '탄소중립, 환경 협약',
    perk: '제조 강국: 생산 투자 시 생산량 +4 (다른 국가는 +3)',
    stock: r(34, 12, 14, 14, 12), prod: r(14, 8, 12, 10, 5), need: { food: 12, water: 12, energy: 16 },
    happy: 60, env: 30, trust: 50, envDrift: -4, capacity: 1.2, map: { x: 770, y: 150 },
  },
  NOV: {
    id: 'NOV', name: '노바리아 공화국', short: '노바리아', icon: '🌱', color: '#c084fc',
    tagline: '개발도상국',
    strength: '인적자원 · 성장 잠재력', weakness: '부족한 자본과 사회기반시설',
    goal: '개발 협력과 기반시설 확충', topics: '국제 원조, 개발 격차, 교육 불평등',
    perk: '성장 잠재력: 복지·교육 투자 시 경제 생산 +2 추가, 공동 프로젝트 상대국과 함께 경제 생산 +1',
    stock: r(12, 12, 12, 10, 3), prod: r(5, 10, 14, 8, 1), need: { food: 12, water: 10, energy: 8 },
    happy: 50, env: 60, trust: 55, envDrift: 0, capacity: 0.6, map: { x: 250, y: 370 },
  },
};

// ───────────────────────── 국가 행동 ─────────────────────────
export interface ActionDef {
  id: string;
  name: string;
  icon: string;
  ap: number;
  cost: ResBundle;
  /** 선택해야 하는 대상 자원 (있을 때만) */
  pick?: Vital[];
  effect: string;
  side: string;
  cond: string;
  /** 사용 가능한 라운드 범위 */
  rounds?: [number, number];
  /** 게임 전체에서 1회만 가능 */
  once?: boolean;
  category: '경제' | '기술' | '환경' | '사회' | '위기';
}

export const ACTIONS: ActionDef[] = [
  {
    id: 'invest', name: '자원 생산 투자', icon: '🏗️', ap: 1, cost: { eco: 8 }, pick: ['food', 'water', 'energy'], category: '경제',
    effect: '선택한 자원의 라운드당 생산량 +3 (다음 라운드부터 계속)',
    side: '환경 지속가능성 −2 (에너지 투자는 −3)', cond: '라운드당 1회',
  },
  {
    id: 'rnd', name: '연구개발', icon: '🔬', ap: 1, cost: { eco: 8 }, category: '기술',
    effect: '기술력 +5 — 재생에너지 전환·기후 적응·기술 협력의 밑거름',
    side: '당장의 생활 개선 효과는 없음', cond: '라운드당 1회',
  },
  {
    id: 'renew', name: '재생에너지 전환', icon: '🌬️', ap: 1, cost: { eco: 6, tech: 4 }, category: '환경',
    effect: '환경 지속가능성 +6, 에너지 생산 +2',
    side: '기술력을 소모함', cond: '라운드당 1회',
  },
  {
    id: 'carbon', name: '탄소 감축 규제', icon: '♻️', ap: 1, cost: {}, category: '환경',
    effect: '환경 지속가능성 +8 (인더스트리아는 +10)',
    side: '경제 생산량 −1 (계속 유지됨)', cond: '라운드당 1회, 경제 생산량이 3 이상일 때',
  },
  {
    id: 'welfare', name: '복지·교육 투자', icon: '🎓', ap: 1, cost: { eco: 6 }, category: '사회',
    effect: '국민 행복도 +4',
    side: '경제력을 소모함', cond: '라운드당 1회',
  },
  {
    id: 'emergency', name: '긴급 위기 대응', icon: '🚨', ap: 1, cost: { eco: 6 }, pick: ['food', 'water', 'energy'], category: '위기',
    effect: '선택한 자원 +5 즉시 확보 (긴급 조달)',
    side: '다른 나라와 거래하는 것보다 비쌈', cond: '라운드당 1회',
  },
  {
    id: 'adapt', name: '기후 적응 인프라', icon: '🛡️', ap: 1, cost: { eco: 6, tech: 5 }, once: true, category: '환경',
    effect: '재난 피해 절반으로 감소, 국민 행복도 +1',
    side: '재난이 오기 전에는 효과가 보이지 않음', cond: '게임 중 1회',
  },
  {
    id: 'refugee', name: '기후 이주민 수용', icon: '🏠', ap: 1, cost: { eco: 4 }, once: true, rounds: [4, 5], category: '위기',
    effect: '국제 신뢰도 +6, 재난 피해국(오세아나·노바리아) 행복도 +2',
    side: '국민 행복도 −1 (단기적 부담)', cond: '4라운드부터, 게임 중 1회 (오세아나 제외)',
  },
];

export const PACTS: Record<PactType, { name: string; icon: string; cost: ResBundle; effect: string; cond: string }> = {
  friend: { name: '우호 협력 협정', icon: '🕊️', cost: {}, effect: '양국 국제 신뢰도 +4, 세계 협력도 상승', cond: '국가 쌍마다 게임 중 1회' },
  research: { name: '공동 연구 프로젝트', icon: '🧪', cost: { eco: 5 }, effect: '양국 기술력 +4', cond: '국가별 라운드당 공동 프로젝트 1건' },
  waterdev: { name: '공동 수자원 개발', icon: '🚰', cost: { eco: 5 }, effect: '양국 물 생산 +2', cond: '국가별 라운드당 공동 프로젝트 1건' },
  renew: { name: '공동 재생에너지 단지', icon: '🔋', cost: { eco: 5 }, effect: '양국 에너지 생산 +2, 환경 +2', cond: '국가별 라운드당 공동 프로젝트 1건' },
};

// ───────────────────────── 라운드 사건 ─────────────────────────
export interface RoundDef {
  n: number;
  title: string;
  crisis: string;
  headline: string;
  body: string;
  mission: string;
  prodMult: Partial<Record<Res, number>>;
  learn: string[];
  project?: { id: string; name: string; desc: string; target: number; accepts: Res[]; success: string };
}

export const ROUNDS: Record<number, RoundDef> = {
  1: {
    n: 1, title: '국가의 생존', crisis: '세계 물 부족 위기',
    headline: '[속보] 사상 최악의 가뭄… 전 세계 수자원·식량 공급 급감',
    body: '세계적인 가뭄으로 이번 라운드 모든 국가의 물 생산이 40%, 식량 생산이 20% 줄었습니다. (게임 속 가상 사건)',
    mission: '부족한 자원을 확인하고, 다른 나라와 거래하거나 공동 대응 기금에 참여하세요.',
    prodMult: { water: 0.6, food: 0.8 },
    learn: ['물 부족과 수자원 갈등', '식량 안보', '국가 간 상호의존성'],
    project: { id: 'water', name: '국제 물 협력 기금', desc: '공동 담수화·관개 시설을 지어 가뭄에 대비합니다.', target: 30, accepts: ['eco', 'tech'], success: '모든 국가 물 생산 +2 (계속)' },
  },
  2: {
    n: 2, title: '자원 확보 경쟁', crisis: '세계 에너지 위기',
    headline: '[속보] 에너지 수출 제한 확산… 국제 에너지 가격 급등',
    body: '공급망이 흔들리며 이번 라운드 모든 국가의 에너지 생산이 35% 줄었습니다. 에너지를 가진 나라와 필요한 나라의 협상이 중요해졌습니다. (게임 속 가상 사건)',
    mission: '에너지 교역, 재생에너지 전환, 외교 협정 중 우리 국가에 맞는 길을 선택하세요.',
    prodMult: { energy: 0.65 },
    learn: ['에너지 안보', '무역과 공급망', '자원 외교'],
    project: { id: 'energy', name: '재생에너지 공동 연구', desc: '여러 나라가 자금과 기술을 모아 대체에너지를 개발합니다.', target: 36, accepts: ['eco', 'tech'], success: '모든 국가 에너지 생산 +2, 환경 +3' },
  },
  3: {
    n: 3, title: '국제 갈등', crisis: '접경 지역의 수자원 분쟁',
    headline: '[속보] 미르강 물 이용 놓고 그린벨트–솔라니아 긴장 고조',
    body: '두 나라가 함께 쓰는 가상의 강 "미르강"의 물 이용을 둘러싸고 상류의 그린벨트와 하류의 솔라니아가 대립합니다. 다른 나라는 중재에 참여할 수 있습니다. (게임 속 가상 사건)',
    mission: '당사국은 입장을 정하고, 다른 국가는 중재 참여 여부를 결정하세요.',
    prodMult: {},
    learn: ['평화적 분쟁 해결', '국제 협상과 중재', '유엔의 역할'],
  },
  4: {
    n: 4, title: '세계적 재난', crisis: '기후위기와 인도적 지원',
    headline: '[속보] 초대형 태풍·해일, 오세아나 강타… 노바리아에도 대홍수',
    body: '오세아나와 노바리아가 큰 피해를 입고 기후 이주민이 발생했습니다. 그동안 세계 환경 지수가 낮았다면 피해가 더 커집니다. (게임 속 가상 사건)',
    mission: '재난 구호 기금, 인도적 지원, 이주민 수용 여부를 결정하세요.',
    prodMult: {},
    learn: ['기후정의', '이주민의 인권', '국제 인도적 지원'],
    project: { id: 'relief', name: '국제 재난 구호 기금', desc: '모인 자원은 라운드 종료 시 오세아나(60%)와 노바리아(40%)에 전달됩니다.', target: 40, accepts: ['eco', 'food', 'water'], success: '피해국 행복도 +6, 세계 협력도 상승' },
  },
  5: {
    n: 5, title: '세계 평화 정상회의', crisis: '세계 평화 협약',
    headline: '[속보] 6개국 정상, 세계 평화 협약 논의 위해 한자리에',
    body: '모든 국가가 협약 조항을 고르고 수정한 뒤 최종 비준 투표를 합니다. 협약은 이번 라운드가 끝날 때 집계됩니다.',
    mission: '조항별 수준을 선택하고, 다른 나라를 설득해 협약을 채택하세요.',
    prodMult: {},
    learn: ['국제 협약', '지속가능발전목표(SDGs)', '공동의 그러나 차별화된 책임'],
  },
};

export const DISPUTE_PARTIES: [CountryId, CountryId] = ['GRN', 'SOL'];
export const STANCES = {
  negotiate: { name: '직접 협상 (공동 관리 제안)', icon: '🤝', desc: '상대국과 강을 함께 관리하는 협정을 제안합니다.' },
  mediate: { name: '국제 중재 요청', icon: '⚖️', desc: '제3국·국제기구의 중재안을 따르겠다고 선언합니다.' },
  unilateral: { name: '일방적 조치 (댐·취수 강행)', icon: '🚧', desc: '물 +10을 즉시 확보하지만 신뢰도 −15, 상대국에 피해를 줍니다.' },
} as const;

// ───────────────────────── 세계 평화 협약 ─────────────────────────
export interface ClauseDef {
  id: string;
  name: string;
  icon: string;
  base: string;
  strong: string;
}
export const CLAUSES: ClauseDef[] = [
  { id: 'climate', name: '기후위기 공동 대응', icon: '🌍', base: '모든 비준국 경제력 −2, 환경 +3', strong: '환경 +6. 비용은 차등 부담: 아르카디아·인더스트리아·솔라니아 경제력 −5, 그 외 −2' },
  { id: 'tech', name: '자원 및 기술 협력', icon: '🔗', base: '모든 비준국 기술력 +2 (연구 교류)', strong: '아르카디아·인더스트리아가 기술 4씩 이전 → 노바리아·오세아나·그린벨트 기술력 +3, 모든 비준국 신뢰도 +3' },
  { id: 'peace', name: '평화적 분쟁 해결', icon: '🕊️', base: '모든 비준국 신뢰도 +3', strong: '상설 중재 기구 설치: 신뢰도 +5, 경제력 −2' },
  { id: 'support', name: '취약 국가 지원', icon: '🫶', base: '경제력 상위 3개 비준국이 3씩 → 노바리아·오세아나에 전달', strong: '상위 3개국이 6씩 전달, 노바리아·오세아나 행복도 +4, 지원국 신뢰도 +4' },
  { id: 'sdg', name: '지속가능한 발전', icon: '🎯', base: '모든 비준국 행복도 +2', strong: '경제력 −3, 행복도 +3, 환경 +3' },
];
export const TREATY_RULES = {
  clauseVotes: 4,
  ratifyVotes: 5,
  minClauses: 3,
};

// ───────────────────────── 교사 발동 사건 ─────────────────────────
export interface TeacherEvent {
  id: string;
  title: string;
  body: string;
  tone: 'bad' | 'good' | 'info';
}
export const TEACHER_EVENTS: TeacherEvent[] = [
  { id: 'pandemic', title: '신종 감염병 확산', body: '모든 국가 행복도 −3, 경제력 −3. 보건 협력의 필요성이 커집니다.', tone: 'bad' },
  { id: 'harvest', title: '세계적 풍년', body: '모든 국가 식량 +4.', tone: 'good' },
  { id: 'oilshock', title: '국제 에너지 가격 급등', body: '에너지 수입국(솔라니아 제외) 에너지 −3.', tone: 'bad' },
  { id: 'cyber', title: '국제 통신망 장애', body: '모든 국가 기술력 −2. 디지털 인프라 협력이 논의됩니다.', tone: 'bad' },
  { id: 'devconf', title: '국제 개발 협력 회의', body: '노바리아 경제력 +6, 모든 국가 신뢰도 +1.', tone: 'good' },
  { id: 'peaceday', title: '세계 평화의 날 공동 선언', body: '모든 국가 신뢰도 +2.', tone: 'good' },
];

export const REFLECTION_QUESTIONS = [
  '우리 국가가 직면한 가장 큰 문제는 무엇이었는가?',
  '국가의 이익과 국제사회의 이익이 충돌한 사례는 무엇인가?',
  '다른 국가와 협력하면서 배운 점은 무엇인가?',
  '실제 국제사회에서 평화를 유지하기 위해 필요한 것은 무엇이라고 생각하는가?',
];

export const fmtBundle = (b: ResBundle): string =>
  RES.filter((k) => (b[k] ?? 0) > 0).map((k) => `${RES_INFO[k].name} ${b[k]}`).join(', ') || '없음';
