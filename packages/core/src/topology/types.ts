/**
 * 토폴로지가 쓰는 말.
 *
 * 세 모듈(그래프·링·배치)이 나눠 쓰므로 한 곳에 둔다 — 그래프가 링을 import 하고 링이
 * 그래프를 import 하면 서로를 부르게 된다.
 */

import type { Direction } from '../catalog/types.js';

export interface Point { x: number; y: number }

/** 마디 = **장비** 하나. 경로슬롯은 마디가 아니다 — 코어가 지나가는 자리일 뿐이다. */
export interface TopoNode {
  /** 장비 자산 id */
  id: string;
  name: string;
  /** 이 장비를 담은 설비 — 「광단말 A」는 송광치마다 하나씩 있다. */
  assemblyName: string | null;
  /** 어느 국의 장비인가 */
  substationName: string;
  /** 그 국에 층이 둘 이상일 때만 채운다. */
  floorName: string | null;
  /** 추적을 시작한 포트가 달린 장비인가 — 「여기」를 도드라지게 둔다. */
  isSeed: boolean;
}

/** 줄 = 장비와 장비를 잇는 **광 경로 한 구간**. 그 사이 슬롯·OPGW·통과 점퍼가 몇이든 한 줄이다. */
export interface TopoEdge {
  /** 양끝 포트 id 를 정렬해 붙인 것 — 같은 두 포트를 잇는 길은 하나다. */
  id: string;
  /** 장비 자산 id 둘 */
  source: string;
  target: string;
  /** 양끝 포트 이름 — 줄에 물으면 나온다(`광 1 ↔ 광 3`). */
  sourcePortName: string;
  targetPortName: string;
}

/**
 * 입력 — `POST /api/v2/reach` 응답이 그대로 맞는 모양이되, core 는 프론트 타입을 모른다.
 * 그래서 core 가 필요한 것만 여기서 선언한다.
 */
export interface TopologyInput {
  substations: { id: string; name: string }[];
  floors: { id: string; name: string; substationId: string }[];
  assets: {
    id: string; name: string; parentAssetId: string | null;
    substationId: string; floorId: string | null;
  }[];
  ports: {
    id: string; assetId: string; group: string; index: number;
    name: string; medium: string; direction: Direction; positions: number;
  }[];
  cables: { id: string; aPortId: string; bPortId: string }[];
}

/** 링 하나 — `detectRings` 가 낸다. */
export interface Ring {
  id: string;
  nodeIds: string[];
  edgeIds: string[];
  /** 0 = 소링(기본 순환), 1 = 대링(간선을 공유하는 소링들의 바깥 테두리) */
  level: 0 | 1;
  /** 대링이면 그 안의 소링 id 들. 소링이면 빈 배열. */
  childRingIds: string[];
}
