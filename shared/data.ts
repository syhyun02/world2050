// WORLD 2050 — 게임 규칙 데이터 (국가, 행동, 사건, 협약). 수치를 바꾸면 게임 균형이 바뀝니다.
import type { CountryId, Res, ResBundle, ResMap, Vital } from './types';

export const COUNTRY_IDS: CountryId[] = ['ARC', 'SOL', 'GRN', 'OCE', 'IND', 'NOV'];
export const RES: Res[] = ['eco', 'food', 'water', 'energy'];
export const VITALS: Vital[] = ['food', 'water', 'energy'];
export const TOTAL_ROUNDS = 5;
export const START_LIVES = 2;
/** 정책 카드를 한 장 더 고를 때 추가로 내는 돈 */
export const EXTRA_CARD_COST = 10;
/** 멸망한 나라(국제 구호단)가 라운드마다 한 나라에 지원하는 자원 양 */
export const RELIEF_AMOUNT = 3;

export const RES_INFO: Record<Res, { name: string; icon: string; unit: string }> = {
  eco: { name: '돈', icon: '💰', unit: '' },
  food: { name: '식량', icon: '🌾', unit: '' },
  water: { name: '물', icon: '💧', unit: '' },
  energy: { name: '에너지', icon: '⚡', unit: '' },
};
export const IDX_INFO = {
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
  env: number;
  trust: number;
  /** 라운드마다 저절로 늘어나는 돈 수입 (성장세) */
  growth: number;
  /** 라운드마다 자연 변화하는 환경 지수 (산업 구조에 따른 배출) */
  envDrift: number;
  map: { x: number; y: number };
}

const r = (eco: number, food: number, water: number, energy: number): ResMap => ({ eco, food, water, energy });

export const COUNTRIES: Record<CountryId, CountryDef> = {
  ARC: {
    id: 'ARC', name: '아르카디아 공화국', short: '아르카디아', icon: '🛰️', color: '#60a5fa',
    tagline: '첨단기술 강국',
    strength: '기술력 · 자본 · 연구 능력', weakness: '에너지 수입 의존',
    goal: '안정적인 에너지 공급망 확보', topics: '기술 격차, 에너지 안보',
    perk: '첨단 기술: 「긴급 구입」을 반값(돈 3)에 쓸 수 있음',
    stock: r(28, 2, 4, 6), prod: r(13, 8, 8, 6), need: { food: 8, water: 8, energy: 12 },
    env: 55, trust: 55, growth: 0, envDrift: 0, map: { x: 215, y: 150 },
  },
  SOL: {
    id: 'SOL', name: '솔라니아 연방', short: '솔라니아', icon: '☀️', color: '#fbbf24',
    tagline: '에너지 자원 강국',
    strength: '풍부한 에너지 자원', weakness: '물 부족',
    goal: '안정적인 수자원 확보', topics: '자원 외교, 자원의 저주',
    perk: '에너지 부국: 에너지가 크게 남지만 물이 모자람',
    stock: r(18, 2, 8, 8), prod: r(7, 8, 3, 22), need: { food: 8, water: 10, energy: 8 },
    env: 45, trust: 50, growth: 0, envDrift: 0, map: { x: 520, y: 330 },
  },
  GRN: {
    id: 'GRN', name: '그린벨트 왕국', short: '그린벨트', icon: '🌾', color: '#4ade80',
    tagline: '식량 생산 강국',
    strength: '농업 생산력', weakness: '기후변화에 따른 식량 생산 불안정',
    goal: '농업기술과 기후 대응 지원 확보', topics: '식량 안보, 지속가능한 농업',
    perk: '세계의 곡창: 식량이 크게 남지만 에너지가 모자람',
    stock: r(20, 2, 4, 5), prod: r(10, 15, 8, 5), need: { food: 8, water: 8, energy: 10 },
    env: 70, trust: 55, growth: 0, envDrift: 0, map: { x: 470, y: 160 },
  },
  OCE: {
    id: 'OCE', name: '오세아나 공화국', short: '오세아나', icon: '🏝️', color: '#22d3ee',
    tagline: '해양 도서 국가',
    strength: '해양자원 · 국제 해상 교역', weakness: '해수면 상승과 자연재해',
    goal: '기후 적응 지원과 국가 생존', topics: '기후정의, 인도적 지원',
    perk: '해상 교역 허브: 거래가 성사될 때마다 돈 +1 (라운드당 최대 +4)',
    stock: r(18, 6, 3, 1), prod: r(9, 5, 11, 8), need: { food: 10, water: 8, energy: 8 },
    env: 70, trust: 60, growth: 0, envDrift: 0, map: { x: 800, y: 370 },
  },
  IND: {
    id: 'IND', name: '인더스트리아 연합', short: '인더스트리아', icon: '🏭', color: '#f87171',
    tagline: '산업 제조 강국',
    strength: '제조업 · 산업 생산력', weakness: '높은 탄소배출량과 에너지 소비',
    goal: '산업 성장과 탄소 감축의 균형', topics: '탄소중립, 환경 협약',
    perk: '제조 강국: 「생산 늘리기」 효과가 +4이고 환경도 나빠지지 않음 (다른 나라는 +3, 환경 −3)',
    stock: r(28, 2, 4, 6), prod: r(13, 10, 8, 6), need: { food: 10, water: 8, energy: 12 },
    env: 30, trust: 50, growth: 0, envDrift: 0, map: { x: 770, y: 150 },
  },
  NOV: {
    id: 'NOV', name: '노바리아 공화국', short: '노바리아', icon: '🌱', color: '#c084fc',
    tagline: '개발도상국',
    strength: '인적자원 · 성장 잠재력', weakness: '부족한 자본과 사회기반시설',
    goal: '개발 협력과 기반시설 확충', topics: '국제 원조, 개발 격차, 교육 불평등',
    perk: '성장 잠재력: 라운드가 지날 때마다 버는 돈이 +2씩 늘어남 (처음엔 가난하지만 갈수록 부유해짐)',
    stock: r(18, 6, 3, 1), prod: r(7, 5, 9, 8), need: { food: 10, water: 8, energy: 8 },
    env: 60, trust: 55, growth: 2, envDrift: 0, map: { x: 250, y: 370 },
  },
};

// ───────────────────────── 정책 카드 (라운드마다 1장) ─────────────────────────
export interface PolicyDef {
  id: 'invest' | 'green' | 'emergency';
  name: string;
  icon: string;
  cost: number;
  /** 대상 자원을 골라야 하는 카드 */
  pick?: Vital[];
  good: string;
  bad: string;
  when: string;
}

export const POLICIES: PolicyDef[] = [
  { id: 'invest', name: '생산 늘리기', icon: '🏗️', cost: 8, pick: ['food', 'water', 'energy'], good: '고른 자원을 매 라운드 +3씩 더 생산', bad: '환경 −3. 자원마다 한 번만 가능', when: '계속 모자라는 자원의 부족을 절반으로 줄이고 싶을 때' },
  { id: 'green', name: '환경 지키기', icon: '🌱', cost: 5, good: '환경 +8', bad: '당장 자원이 늘지는 않음', when: '자원이 넉넉할 때 (나라 점수가 오르고 세계 재난 피해도 줄어듦)' },
  { id: 'emergency', name: '긴급 구입', icon: '🚨', cost: 6, pick: ['food', 'water', 'energy'], good: '고른 자원 +2 즉시 확보', bad: '거래보다 훨씬 비쌈 (조금 모자랄 때만)', when: '거래로 못 채워 목숨이 위험할 때' },
];

// ───────────────────────── 라운드 사건 ─────────────────────────
export interface ProjectDef {
  id: 'water' | 'energy' | 'relief';
  name: string;
  desc: string;
  cost: number;
  /** 성공에 필요한 참여국 수 */
  need: number;
  success: string;
  /** 참여하지 않는(도움을 받는) 나라 */
  victims?: CountryId[];
}
export interface RoundDef {
  n: number;
  title: string;
  crisis: string;
  headline: string;
  body: string;
  mission: string;
  prodMult: Partial<Record<Res, number>>;
  /** 나라별로 다르게 적용되는 사건의 영향 (생산 배율, 즉시 증감, 이유) */
  impact?: Partial<Record<CountryId, { mult?: Partial<Record<Res, number>>; add?: Partial<Record<Res, number>>; why: string }>>;
  learn: string[];
  project?: ProjectDef;
}

export const ROUNDS: Record<number, RoundDef> = {
  1: {
    n: 1, title: '국가의 생존', crisis: '세계 물 부족 위기',
    headline: '[속보] 사상 최악의 가뭄… 전 세계 수자원·식량 공급 급감',
    body: '세계적인 가뭄으로 이번 라운드 물과 식량 생산이 줄었습니다. 피해 크기는 나라마다 다릅니다. (게임 속 가상 사건)',
    mission: '부족한 자원을 다른 나라와 거래해서 채워 보세요. 못 채우면 목숨을 잃습니다.',
    prodMult: {},
    impact: {
      ARC: { mult: { water: 0.7, food: 0.85 }, why: '물 재활용 기술 덕분에 피해가 비교적 작습니다.' },
      SOL: { mult: { water: 0.5, food: 0.8 }, why: '원래 건조한 땅이라 물 피해가 가장 큽니다.' },
      GRN: { mult: { water: 0.6, food: 0.7 }, why: '농업 국가라 흉작 피해가 큽니다.' },
      OCE: { mult: { water: 0.7, food: 0.85 }, why: '바닷물을 민물로 바꾸는 시설이 있어 물 피해가 작습니다.' },
      IND: { mult: { water: 0.6, food: 0.8 }, why: '공장에 쓸 물이 모자랍니다.' },
      NOV: { mult: { water: 0.5, food: 0.8 }, why: '물을 모아 둘 시설이 부족해 피해가 큽니다.' },
    },
    learn: ['물 부족과 수자원 갈등', '식량 안보', '국가 간 상호의존성'],
    project: { id: 'water', name: '국제 물 협력 기금', desc: '여러 나라가 돈을 모아 물 시설을 함께 짓습니다.', cost: 4, need: 4, success: '모든 나라의 물 생산 +1 (계속)' },
  },
  2: {
    n: 2, title: '자원 확보 경쟁', crisis: '세계 에너지 위기',
    headline: '[속보] 에너지 수출 제한 확산… 국제 에너지 가격 급등',
    body: '에너지 공급이 흔들리고 가격이 뛰었습니다. 에너지를 사 오는 나라는 타격을 입고, 파는 나라는 돈을 법니다. (게임 속 가상 사건)',
    mission: '에너지가 남는 나라를 찾아 협상하세요.',
    prodMult: {},
    impact: {
      ARC: { mult: { energy: 0.7 }, why: '에너지를 수입에 의존해 타격이 큽니다.' },
      SOL: { add: { eco: 3 }, why: '에너지 가격이 올라 수출로 돈을 더 법니다.' },
      GRN: { mult: { energy: 0.8 }, why: '농기계와 운송에 쓸 에너지가 줄었습니다.' },
      OCE: { mult: { energy: 0.9 }, why: '에너지를 적게 써서 타격이 작습니다.' },
      IND: { mult: { energy: 0.7 }, why: '공장을 돌리는 데 에너지가 많이 필요해 타격이 큽니다.' },
      NOV: { mult: { energy: 0.9 }, why: '에너지를 적게 써서 타격이 작습니다.' },
    },
    learn: ['에너지 안보', '무역과 공급망', '자원 외교'],
    project: { id: 'energy', name: '재생에너지 공동 연구', desc: '여러 나라가 돈을 모아 깨끗한 에너지를 함께 개발합니다.', cost: 5, need: 4, success: '모든 나라의 에너지 생산 +1, 환경 +3' },
  },
  3: {
    n: 3, title: '국제 갈등', crisis: '접경 지역의 수자원 분쟁',
    headline: '[속보] 미르강 물 이용 놓고 그린벨트–솔라니아 긴장 고조',
    body: '두 나라가 함께 쓰는 가상의 강 "미르강"을 두고 상류의 그린벨트와 하류의 솔라니아가 대립합니다. 다른 나라는 중재에 나설 수 있습니다. (게임 속 가상 사건)',
    mission: '두 나라가 평화롭게 해결하도록 대화하고 설득하세요.',
    prodMult: {},
    impact: {
      GRN: { mult: { water: 0.75 }, why: '미르강을 둘러싼 긴장으로 강물을 마음껏 쓰지 못합니다.' },
      SOL: { mult: { water: 0.75 }, why: '미르강을 둘러싼 긴장으로 강물을 마음껏 쓰지 못합니다.' },
      ARC: { add: { eco: -2 }, why: '분쟁 지역을 지나는 무역로가 불안해져 운송비가 늘었습니다.' },
      OCE: { add: { eco: 3 }, why: '배들이 분쟁 지역을 피해 오세아나 항구로 몰려 수입이 늘었습니다.' },
      IND: { add: { eco: -2 }, why: '분쟁 지역을 지나는 무역로가 불안해져 운송비가 늘었습니다.' },
      NOV: { why: '직접 피해는 없습니다. 중재에 나서면 신뢰를 얻을 수 있습니다.' },
    },
    learn: ['평화적 분쟁 해결', '국제 협상과 중재', '유엔의 역할'],
  },
  4: {
    n: 4, title: '세계적 재난', crisis: '기후위기와 인도적 지원',
    headline: '[속보] 초대형 태풍·해일, 오세아나 강타… 노바리아에도 대홍수',
    body: '오세아나와 노바리아가 식량·물·돈을 크게 잃었습니다. 그동안 세계 환경 지수가 낮았다면 피해가 더 커집니다. (게임 속 가상 사건)',
    mission: '피해를 입은 나라를 도울지 결정하세요.',
    prodMult: {},
    impact: {
      ARC: { add: { eco: -3 }, why: '재난으로 바닷길이 막혀 무역에서 손해를 봤습니다.' },
      SOL: { add: { eco: -3 }, why: '재난으로 바닷길이 막혀 에너지 수출이 줄었습니다.' },
      GRN: { mult: { food: 0.85 }, why: '이상 기후로 수확이 줄었습니다.' },
      IND: { add: { eco: -3 }, why: '재난으로 바닷길이 막혀 부품을 들여오지 못했습니다.' },
    },
    learn: ['기후정의', '이주민의 인권', '국제 인도적 지원'],
    project: { id: 'relief', name: '국제 재난 구호', desc: '낸 돈은 라운드가 끝날 때 오세아나(60%)와 노바리아(40%)에 전달됩니다.', cost: 6, need: 3, success: '피해국에 식량·물 +4씩 추가 전달', victims: ['OCE', 'NOV'] },
  },
  5: {
    n: 5, title: '세계 평화 정상회의', crisis: '세계 평화 협약',
    headline: '[속보] 6개국 정상, 세계 평화 협약 논의 위해 한자리에',
    body: '모든 나라가 협약의 다섯 조항에 찬성 또는 반대로 투표합니다. 라운드가 끝날 때 집계됩니다.',
    mission: '조항마다 찬성·반대를 정하고, 다른 나라를 설득하세요.',
    prodMult: {},
    learn: ['국제 협약', '지속가능발전목표(SDGs)', '공동의 그러나 차별화된 책임'],
  },
};

export const DISPUTE_PARTIES: [CountryId, CountryId] = ['GRN', 'SOL'];
export const STANCES = {
  negotiate: { name: '함께 관리하자고 제안', icon: '🤝', desc: '상대국과 강을 같이 관리하는 협정을 제안합니다.' },
  mediate: { name: '국제 중재에 맡기기', icon: '⚖️', desc: '다른 나라들의 중재안을 따르겠다고 선언합니다.' },
  unilateral: { name: '혼자 밀어붙이기', icon: '🚧', desc: '물 +10을 바로 얻지만 신뢰도 −15, 상대국은 물을 잃습니다.' },
} as const;

// ───────────────────────── 세계 평화 협약 ─────────────────────────
export interface ClauseDef { id: string; name: string; icon: string; effect: string }
export const CLAUSES: ClauseDef[] = [
  { id: 'climate', name: '기후위기 공동 대응', icon: '🌍', effect: '돈 −3, 환경 +5' },
  { id: 'coop', name: '자원 및 기술 협력', icon: '🔗', effect: '식량·물·에너지 +2씩' },
  { id: 'peace', name: '평화적 분쟁 해결', icon: '🕊️', effect: '신뢰도 +4' },
  { id: 'support', name: '취약 국가 지원', icon: '🫶', effect: '찬성국 중 돈이 많은 3개국이 4씩 내서 노바리아·오세아나에 전달 (낸 나라 신뢰도 +2)' },
  { id: 'sdg', name: '지속가능한 발전', icon: '🎯', effect: '돈 −2, 환경 +2, 신뢰도 +2' },
];
export const TREATY_RULES = { minClauses: 3 };

// ───────────────────────── 교사 발동 사건 ─────────────────────────
export interface TeacherEvent {
  id: string;
  title: string;
  body: string;
  tone: 'bad' | 'good' | 'info';
}
export const TEACHER_EVENTS: TeacherEvent[] = [
  { id: 'pandemic', title: '신종 감염병 확산', body: '모든 국가 돈 −4. 보건 협력의 필요성이 커집니다.', tone: 'bad' },
  { id: 'harvest', title: '세계적 풍년', body: '모든 국가 식량 +4.', tone: 'good' },
  { id: 'oilshock', title: '국제 에너지 가격 급등', body: '에너지 수입국(솔라니아 제외) 에너지 −3.', tone: 'bad' },
  { id: 'devconf', title: '국제 개발 협력 회의', body: '노바리아 돈 +6, 모든 국가 신뢰도 +1.', tone: 'good' },
  { id: 'peaceday', title: '세계 평화의 날 공동 선언', body: '모든 국가 신뢰도 +2.', tone: 'good' },
];

/** 나라별 정책 카드 값 (아르카디아는 긴급 구입 반값) */
export const policyCost = (id: CountryId, p: PolicyDef): number => (id === 'ARC' && p.id === 'emergency' ? 3 : p.cost);
/** 나라별 생산 늘리기 효과 */
export const investGain = (id: CountryId): number => (id === 'IND' ? 4 : 3);

/** 라운드마다 남는(+) / 모자라는(−) 양. 평상시 생산량 − 필요량 */
export const balanceOf = (id: CountryId): Record<Vital, number> => {
  const d = COUNTRIES[id];
  return { food: d.prod.food - d.need.food, water: d.prod.water - d.need.water, energy: d.prod.energy - d.need.energy };
};

export const fmtBundle = (b: ResBundle): string =>
  RES.filter((k) => (b[k] ?? 0) > 0).map((k) => `${RES_INFO[k].name} ${b[k]}`).join(', ') || '없음';
