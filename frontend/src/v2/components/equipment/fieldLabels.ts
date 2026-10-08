/**
 * 설비 상세의 **칸 이름** — 칸을 그리는 곳(설비 정보·차단기·연결·기록)과 변경 이력이 같은 말을 읽는다.
 * 이력에서만 다른 말을 쓰면 「상태」를 고친 기록이 다른 이름으로 남는다.
 */

/** 설비 정보 카드의 칸. 차단기 수·슬롯 수는 카드 칸이 아니라 단추·슬롯 카드가 고친다. */
export const EQUIPMENT_FIELD_LABELS: Record<string, string> = {
  name: '이름', typeId: '설비 품목', status: '상태', rackId: '랙',
  model: '모델명', maker: '제조사', madeOn: '제조년월', serial: 'S/N', installDate: '설치일', manager: '담당자', note: '비고',
  circuitCount: '차단기 수', panelCount: '슬롯 수',
};

/** 차단기 한 줄의 칸(`CircuitCell`). */
export const CIRCUIT_FIELD_LABELS = {
  label: '표기', current: '교류/직류', voltage: '전압', capacity: '용량', phase: '상', switch: '개폐', purpose: '용도',
} as const;

/** 연결의 칸(`ConnectDialog`) — 포트는 이 설비 쪽, 상대 포트는 다른 끝. */
export const LINK_FIELD_LABELS: Record<string, string> = {
  cableTypeId: '케이블 품목', lengthM: '길이', spec: '규격', note: '비고', label: '포트', peerLabel: '상대 포트',
};

/** 점검 기록·고장 이력·사진의 칸(`RecordsTab`·`PhotoCard`). */
export const RECORD_FIELD_LABELS = {
  inspectedAt: '점검일', result: '결과', occurredAt: '발생일', action: '조치', content: '내용', caption: '설명',
} as const;
