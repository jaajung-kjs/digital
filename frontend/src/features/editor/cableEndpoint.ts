/** 모든 케이블 엔드포인트(평면설비 / 랙모듈 / 피더 IN·분기 / 경로슬롯 포트)를 단일 표현. */
export interface EndpointRef {
  containerAssetId: string;            // 평면도에 배치된 anchor 설비
  position: { x: number; y: number };  // 컨테이너 중심(경로/프리뷰)
  innerAssetId?: string | null;        // 랙 모듈 / 피더(FEEDER) asset id
  slotId?: string | null;              // 경로슬롯(conduit) id
  coreNumber?: number | null;          // 광 코어 번호
  role?: 'IN' | 'OUT' | null;          // distributor 연결점 역할
  number?: number | null;              // 분기(CB) 번호 등
}

/** 케이블 endpoint assetId 해소 — slot > inner > container 우선순위. */
export function endpointAssetId(ref: EndpointRef): string {
  return ref.slotId ?? ref.innerAssetId ?? ref.containerAssetId;
}
