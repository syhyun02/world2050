// WORLD 2050 — 결과 분석: 각 나라가 왜 그런 결과를 얻었는지 게임 기록으로 진단하고, 현실의 교훈과 연결합니다.
// 진단은 서버에 기록된 사실(부족했던 자원, 거래 횟수, 지수)만 근거로 삼습니다.
import { COUNTRIES, RES_INFO } from './data';
import type { CountryId, PublicRoom, Vital } from './types';

export interface Finding {
  tone: 'bad' | 'good';
  /** 게임에서 일어난 일 */
  title: string;
  fact: string;
  /** 현실의 교훈 (실제 사실에 기반) */
  lesson: string;
}

const SHORT_LESSON: Record<Vital, { title: string; lesson: string }> = {
  energy: {
    title: '에너지를 구하지 못했다',
    lesson: '현실에서는: 1973년 석유 파동 때 석유를 수입에 의존하던 나라들은 공급이 줄자 큰 혼란을 겪었습니다. 그 뒤 여러 나라가 수입처를 나누고 비축을 늘리는 등 에너지 안보에 힘쓰게 되었습니다.',
  },
  water: {
    title: '물을 구하지 못했다',
    lesson: '현실에서는: 강과 지하수는 국경을 넘어 이어져 있어 물은 혼자 해결하기 어려운 자원입니다. 나일강 유역의 나라들이 오랫동안 물 이용을 협의해 온 것도 이 때문입니다.',
  },
  food: {
    title: '식량을 구하지 못했다',
    lesson: '현실에서는: 세계 전체의 식량이 충분해도 살 돈이 없거나 공급이 막히면 굶주림이 생깁니다. 식량 안보는 생산량만이 아니라 "구할 수 있는 능력"의 문제입니다.',
  },
};

export function diagnose(room: PublicRoom, id: CountryId): Finding[] {
  const c = room.countries[id];
  const d = COUNTRIES[id];
  const out: Finding[] = [];
  const lostRounds = Object.entries(c.shortages).filter(([, v]) => v.length).map(([r, v]) => ({ round: Number(r), res: v }));
  const trades = room.proposals.filter((p) => p.status === 'accepted' && (p.from === id || p.to === id)).length;

  // 1) 목숨을 잃은 직접 원인: 어떤 자원이 모자랐나
  const byRes = new Map<Vital, number[]>();
  for (const l of lostRounds) for (const k of l.res) byRes.set(k, [...(byRes.get(k) ?? []), l.round]);
  for (const [k, rounds] of byRes) {
    out.push({
      tone: 'bad', title: SHORT_LESSON[k].title,
      fact: `${rounds.map((r) => `ROUND ${r}`).join(', ')}에서 ${RES_INFO[k].name} 부족으로 목숨을 잃었습니다.`,
      lesson: SHORT_LESSON[k].lesson,
    });
  }

  // 2) 그 뒤에 있는 구조적 원인
  if (lostRounds.length && trades <= 1) {
    out.push({
      tone: 'bad', title: '다른 나라와 거의 거래하지 않았다',
      fact: `게임 내내 성사된 거래·지원이 ${trades}건뿐이었습니다.`,
      lesson: '현실에서는: 어떤 나라도 필요한 것을 모두 스스로 만들 수 없습니다. 나라들이 무역으로 서로에게 기대어 사는 관계를 상호의존이라고 하며, 고립된 나라는 위기에 특히 약합니다.',
    });
  }
  const brokeWhenLost = lostRounds.some((l) => (c.history.find((h) => h.round === l.round)?.stock.eco ?? 99) < 6);
  if (brokeWhenLost) {
    out.push({
      tone: 'bad', title: '자원을 살 돈이 없었다',
      fact: '목숨을 잃은 라운드에 남은 돈이 거의 없었습니다.',
      lesson: `현실에서는: 출발 조건이 불리한 나라는 같은 위기에도 더 크게 흔들립니다.${d.growth > 0 ? ' 성장하는 개발도상국도 성장의 결실을 얻기 전에 위기를 맞으면 버티기 어렵습니다.' : ''} 유엔의 지속가능발전목표(SDGs)가 "누구도 소외되지 않게"를 내세우고 개발 협력을 강조하는 이유입니다.`,
    });
  } else if (lostRounds.length && c.stock.eco >= 25) {
    out.push({
      tone: 'bad', title: '돈은 있었지만 자원을 사지 못했다',
      fact: `게임이 끝났을 때 돈이 ${c.stock.eco}이나 남아 있었습니다.`,
      lesson: '현실에서는: 돈이 많아도 팔려는 나라가 없으면 자원을 구할 수 없습니다. 그래서 나라들은 평소에 여러 공급처와 신뢰 관계를 쌓아 공급망을 안정시키려 합니다.',
    });
  }
  if (c.trust < 45) {
    out.push({
      tone: 'bad', title: '국제사회의 신뢰를 잃었다',
      fact: `신뢰도가 ${COUNTRIES[id].trust}에서 ${c.trust}(으)로 떨어졌습니다.${room.dispute?.stances[id] === 'unilateral' ? ' 미르강 분쟁에서 혼자 밀어붙이는 길을 골랐습니다.' : ''}`,
      lesson: '현실에서는: 신뢰를 잃은 나라는 거래와 협력의 기회가 줄어듭니다. 유엔 헌장이 분쟁을 평화적 수단으로 해결하도록 정한 것처럼, 약속과 규칙을 지키는 일은 그 나라의 이익이기도 합니다.',
    });
  }
  if (c.env < 35) {
    out.push({
      tone: 'bad', title: '환경을 돌보지 않았다',
      fact: `환경 지수가 ${COUNTRIES[id].env}에서 ${c.env}(으)로 내려갔습니다.`,
      lesson: '현실에서는: 환경을 돌보지 않은 비용은 재난과 자원 부족으로 돌아오고, 그 피해는 국경을 가리지 않습니다. 2015년 파리협정은 이 문제를 세계가 함께 풀기 위한 약속입니다.',
    });
  }

  // 3) 잘한 점
  if (lostRounds.length === 0 && c.diedRound === null) {
    out.push({
      tone: 'good', title: '한 번도 자원이 모자라지 않았다',
      fact: `다섯 라운드 내내 식량·물·에너지를 모두 확보했습니다. 성사된 거래·지원 ${trades}건.`,
      lesson: '현실에서는: 필요한 자원을 꾸준히 확보하려면 스스로 생산하는 힘과 믿을 수 있는 거래 상대가 모두 필요합니다. 이것을 자원 안보라고 합니다.',
    });
  }
  if (c.trust >= 70) {
    out.push({
      tone: 'good', title: '높은 신뢰를 쌓았다',
      fact: `신뢰도가 ${COUNTRIES[id].trust}에서 ${c.trust}(으)로 올랐습니다.`,
      lesson: '현실에서는: 경제력이나 군사력이 크지 않아도 신뢰와 연대는 국제 무대에서 큰 힘이 됩니다. 작은 섬나라들이 힘을 모아 기후 협상에서 목소리를 내 온 것이 한 예입니다.',
    });
  }
  if (c.env >= 70) {
    out.push({
      tone: 'good', title: '환경을 지켰다',
      fact: `환경 지수 ${c.env}.`,
      lesson: '현실에서는: 지속가능한 발전은 미래 세대가 쓸 몫을 해치지 않으면서 지금의 필요를 채우는 발전을 말합니다.',
    });
  }
  if (!out.length) {
    out.push({ tone: 'good', title: '큰 위기 없이 버텼다', fact: '눈에 띄는 약점 없이 게임을 마쳤습니다.', lesson: '현실에서도 위기를 넘기는 나라는 대개 한 가지에 의존하지 않고 균형을 지킨 나라입니다.' });
  }
  return out;
}
