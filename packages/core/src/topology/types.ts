/**
 * 토폴로지가 쓰는 말.
 *
 * 세 모듈(그래프·링·배치)이 나눠 쓰므로 한 곳에 둔다 — 그래프가 링을 import 하고 링이
 * 그래프를 import 하면 서로를 부르게 된다.
 */

import type { Direction } from '../catalog/types.js';

export interface Point { x: number; y: number }

/**
 * 마디 = **함체** 하나. 함체에 안 든 장비는 제 자신이 마디다.
 *
 * 경로슬롯은 마디가 아니다 — 코어가 지나가는 자리일 뿐이다. 그래서 OFD 는 함체이면서도
 * 마디가 되지 않고, 한 OFD 의 여러 슬롯으로 제각각의 링이 지나도 섞이지 않는다.
 */
export interface TopoNode {
  /** 마디가 되는 자산 id — 함체이거나, 함체에 안 든 장비 */
  id: string;
  name: string;
  /** 어느 국의 장비인가 */
  substationName: string;
  /** 그 국에 층이 둘 이상일 때만 채운다. */
  floorName: string | null;
  /** 추적을 시작한 포트가 달린 장비인가 — 「여기」를 도드라지게 둔다. */
  isSeed: boolean;
}

/** 줄 = 마디와 마디를 잇는 **광 경로 한 구간**. 그 사이 슬롯·OPGW·통과 점퍼가 몇이든 한 줄이다. */
export interface TopoEdge {
  /** 양끝 포트 id 를 정렬해 붙인 것 — 같은 두 포트를 잇는 길은 하나다. */
  id: string;
  /** 마디 id 둘 */
  source: string;
  target: string;
  /**
   * 양끝 포트 이름 — 줄에 물으면 나온다(`광 1 ↔ 광 3`).
   *
   * 마디가 함체인 끝에는 **그 안 장비의 이름이 앞에 붙는다**(`ME228S #1 · 광 1`). 랙이
   * 한 마디라 포트 이름만으로는 어느 카드인지 가릴 수 없기 때문이다.
   */
  sourcePortName: string;
  targetPortName: string;
  /**
   * 이 길이 **패치로 지나간 국**들 — 장비를 안 거치고 성단끼리 물려 통과한 자리.
   *
   * 1번 국 광단말이 3번 국 광단말과 이어지면서 가운데 2번 국을 그냥 지나간다면, 2번은
   * 마디가 아니지만(장비를 안 거쳤다) 「이 길은 2번을 거쳐 간다」는 사실은 남아야 한다.
   * 줄에 작게 적는다. 지나간 국이 없으면 빈 배열이다.
   */
  viaSubstationNames: string[];
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
    /** 종류 안의 갈래(전원의 AC·DC) — 통과가 갈래를 넘는지 이 값이 가른다. */
    variant?: string | null;
  }[];
  cables: { id: string; aPortId: string; bPortId: string }[];
}
