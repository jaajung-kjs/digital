/**
 * 포트 방향 어휘 — 값·라벨을 적는 **유일한 곳**.
 *
 * 예전에는 같은 목록이 네 군데에 따로 적혀 있었다(타입 선언·검증 Set·zod enum·관리자 선택지).
 * 그 바람에 라벨까지 갈라져, 카탈로그 관리자는 `BI (양방향)` 이라 쓰고 자산 패널은 `양방향`
 * 이라 썼다. 타입·검증·스키마·선택지를 전부 여기서 파생한다.
 */
export const PORT_DIRECTIONS = [
  { value: 'IN', label: '입력' },
  { value: 'OUT', label: '출력' },
  { value: 'BI', label: '양방향' },
] as const;

/** 포트 방향. BI = 양방향(일반 통신 포트). */
export type Direction = (typeof PORT_DIRECTIONS)[number]['value'];

export const DIRECTION_VALUES = PORT_DIRECTIONS.map((d) => d.value) as unknown as [Direction, ...Direction[]];

export function portDirectionLabel(value: string): string {
  return PORT_DIRECTIONS.find((d) => d.value === value)?.label ?? value;
}

/**
 * 자산이 갖는 속성 — **종류를 가리지 않고 이 둘뿐**이다.
 *
 * 예전에는 타입마다 필드를 따로 선언할 수 있었다. 그런데 실제로 쓰인 것은 피더의
 * `차단기 번호`(자산 이름과 겹쳤다)와 `개폐 상태` 둘뿐이었고, 개폐는 자산이 아니라
 * **그 회로의 상태**라 전원 출력 포트로 옮겼다(`PORT_KINDS.power.portFields`).
 * 남은 것은 어느 자산에나 똑같이 있는 설치일·담당자이므로 선언이 아니라 기본으로 둔다.
 *
 * 값은 그대로 `Asset.fieldValues` 에 담긴다.
 */
export const COMMON_ASSET_FIELDS: readonly FieldDef[] = [
  { key: 'installDate', label: '설치일', type: 'date' },
  { key: 'manager', label: '담당자', type: 'text' },
] as const;

/** 자산이 갖는 속성 — 종류를 가리지 않고 같다. 화면은 이것만 읽는다. */
export function assetFieldDefs(): FieldDef[] {
  return [...COMMON_ASSET_FIELDS];
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  unit?: string;
  options?: string[];
}

export interface PlacementSpec {
  placeable: boolean;
  defaultWidth?: number;
  defaultHeight?: number;
}

export interface LaborRules {
  laborType: string | null;
  installHours: number;
  removeHours: number;
  relocateHours: number;
}

/** 빈 객체({}) = 모두 수용. 둘 다 있으면 OR. */
export interface AcceptRule {
  categoryKeys?: string[];
  typeKeys?: string[];
}

export interface ContainerSpec {
  key: string; // 타입 내 유일 (예: 'main')
  name: string; // 표시명 (예: '슬롯')
  slotCount: number | null; // null = 자유형(순서 리스트, 위치 검증 없음)
  allowSpan: boolean;
  accepts: AcceptRule;
}

export interface PortTemplate {
  group: string; // 타입 내 유일 (예: 'A', 'IN')
  count: number; // 기본 수량 — 인스턴스에서 오버라이드 가능(12C/24C 광슬롯)
  direction: Direction;
  medium: string; // CableGroup.key 와 대응하는 안정 키 (e.g. 'fiber' | 'power' | 'network' | 'control' | 'ground')
  namePattern: string; // '{n}' 치환 (예: '코어 {n}')
  /**
   * 이 포트 하나가 나르는 심선 수. 1 = 보통 포트, N = **다심 포트**.
   *
   * OPGW 한 가닥은 케이블 한 본인데 그 안에 24심이 들어 있다. 예전에는 그 24심을
   * 포트 24개 + 케이블 24본으로 폈고, 그래서 설계서 공량이 심선 수만큼 부풀었다
   * (40m 한 가닥 → 160m). 이제 케이블은 1본이 인입 포트 하나에 물리고, 그 안의
   * 코어는 `positions` 으로 센다 — NetBox 의 RearPort(positions)/FrontPort 와 같다.
   */
  positions?: number;
}

/**
 * 내부 통과의 짝짓기 방식. 규칙은 사용자가 적는 것이 아니라 **포트 선언에서 유도된다**
 * (`derivedLinks`) — 이 타입은 그 유도 결과를 담는 그릇이다.
 */
export type LinkMapping =
  /** 모두 서로 통한다 — 전원 입력 아무거나 ↔ 출력 아무거나. */
  | 'all'
  /** 다심 포트의 i번 **코어** ↔ 상대 그룹 i번 포트. 경로슬롯의 인입↔심선이 이것이다. */
  | 'byPosition';

export interface InternalLinkRule {
  fromGroup: string;
  toGroup: string;
  mapping: LinkMapping;
}

export interface AssetTypeSpec {
  key: string;
  name: string;
  categoryKey: string;
  sortOrder: number;
  placement: PlacementSpec;
  labor: LaborRules;
  containers: ContainerSpec[];
  ports: PortTemplate[];
}

/** ---- 인스턴스 참조 형상 (DB 행이 이 형상으로 매핑되어 순수 함수에 들어온다) ---- */

export interface AssetRef {
  id: string;
  typeKey: string;
  name: string;
  parentAssetId?: string | null;
  containerKey?: string | null;
  slotIndex?: number | null;
  slotSpan?: number | null;
}

export interface PortRef {
  id: string;
  assetId: string;
  group: string;
  index: number; // 1-based
  name: string;
  direction: Direction;
  medium: string;
  /** 이 포트가 나르는 심선 수. 없거나 1이면 보통 포트. @see PortTemplate.positions */
  positions?: number;
}

export interface CableRef {
  id: string;
  aPortId: string;
  bPortId: string;
  categoryKey?: string | null;
}

/**
 * POST /v2/catalog/types, PUT /v2/catalog/types/:id 요청 바디 — 정본 1곳.
 * (백/프론트 각 소비자가 재선언하지 않고 이 타입을 import 한다. HTTP 형상 검증은
 * 각 소비자의 zod 스키마가 담당 — 코어는 타입만 소유한다.)
 */
export interface TypeUpsertBody {
  key: string;
  name: string;
  categoryId: string;
  sortOrder: number;
  isActive: boolean;
  placeable: boolean;
  defaultWidth: number | null;
  defaultHeight: number | null;
  laborType: string | null;
  installHours: number;
  removeHours: number;
  relocateHours: number;
  containers: Array<{ key: string; name: string; slotCount: number | null; allowSpan: boolean; accepts: AcceptRule }>;
  ports: Array<{ group: string; count: number; direction: Direction; medium: string; namePattern: string; positions?: number }>;
}

/**
 * 배치 판정 필드 목록의 유일 정의 — 백엔드 재검증 트리거와 프론트 이설 판정이 공유한다.
 */
export const PLACEMENT_FIELDS = [
  'floorId', 'x', 'y', 'width', 'height',
  'parentAssetId', 'containerKey', 'slotIndex', 'slotSpan',
] as const;

export type PlacementField = (typeof PLACEMENT_FIELDS)[number];
