/**
 * 토폴로지가 쓰는 말.
 *
 * 세 모듈(그래프·링·배치)이 나눠 쓰므로 한 곳에 둔다 — 그래프가 링을 import 하고 링이
 * 그래프를 import 하면 서로를 부르게 된다.
 */

export interface Point { x: number; y: number }

/** 마디 박스 안에 서는 장비 하나. */
export interface TopoMember {
  assetId: string;
  /** 이 장비를 담고 있는 설비 — `설비 - 장비` 로 부를 때 앞에 붙는다. */
  assemblyName: string | null;
  assetName: string;
  /** 그 국에 층이 둘 이상일 때만 채운다 — 평면도가 못 그리는 「층을 넘는 줄」이 여기서 보인다. */
  floorName: string | null;
}

export interface TopoNode {
  /** 변전소 id */
  id: string;
  name: string;
  /**
   * **내 코어의 길이 이 국에서 지나간 장비들**, 지나간 차례로.
   *
   * 「이 망에 걸린 장비 전부」가 아니다. 링의 다른 국은 케이블로는 이어져 있어도 내 코어와
   * 무관하므로 비어 있다(국 이름만 선다). 추적이 답한 것은 마디 안, 그 다음은 줄 — 그 규칙이
   * 목록의 내용과 차례를 둘 다 정한다.
   */
  members: TopoMember[];
}

export interface TopoEdge {
  /** 케이블 id */
  id: string;
  /** 변전소 id 둘 */
  source: string;
  target: string;
  /** 양끝 다심 포트가 달린 자산(경로슬롯)의 이름 — 줄에 마우스를 대면 이것이 뜬다. */
  sourceSlotName: string;
  targetSlotName: string;
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
  ports: { id: string; assetId: string; name: string; medium: string; positions: number }[];
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
