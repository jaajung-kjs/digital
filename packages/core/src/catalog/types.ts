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
 * 종류를 가리지 않고 **모든 자산**이 갖는 속성.
 *
 * 예전에는 시드가 타입마다 같은 둘(`설치일`·`담당자`)을 복사해 넣었고, 카탈로그 관리자에도
 * 그대로 나와 새 타입을 만들 때마다 사용자가 같은 필드를 두 번 적어야 했다. 어차피 전부
 * 같으니 선언이 아니라 **기본**으로 둔다 — 자산마스터의 `필드 정의`는 그 타입만의 필드를
 * 뜻하게 된다.
 *
 * 값은 그대로 `Asset.fieldValues` 에 담긴다(스키마 변경 없음).
 */
export const COMMON_ASSET_FIELDS: readonly FieldDef[] = [
  { key: 'installDate', label: '설치일', type: 'date' },
  { key: 'manager', label: '담당자', type: 'text' },
] as const;

/** 타입이 선언한 필드 + 모든 자산이 갖는 공통 필드. 화면은 이것만 읽는다. */
export function assetFieldDefs(declared: readonly FieldDef[]): FieldDef[] {
  const extra = declared.filter((d) => !COMMON_ASSET_FIELDS.some((c) => c.key === d.key));
  return [...COMMON_ASSET_FIELDS, ...extra];
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
  /** 선로측 그룹 선언 — 선번장 meta(lengthM/lossDb/inspectedAt) 기록 대상. 타입당 최대 1개 그룹. */
  lineSide?: boolean;
}

export interface InternalLinkRule {
  fromGroup: string;
  toGroup: string;
  mapping: 'byIndex' | 'all';
}

export interface AssetTypeSpec {
  key: string;
  name: string;
  categoryKey: string;
  sortOrder: number;
  placement: PlacementSpec;
  labor: LaborRules;
  fields: FieldDef[];
  containers: ContainerSpec[];
  ports: PortTemplate[];
  links: InternalLinkRule[];
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
  fieldDefs: FieldDef[];
  containers: Array<{ key: string; name: string; slotCount: number | null; allowSpan: boolean; accepts: AcceptRule }>;
  ports: Array<{ group: string; count: number; direction: Direction; medium: string; namePattern: string; lineSide?: boolean }>;
  links: Array<{ fromGroup: string; toGroup: string; mapping: 'byIndex' | 'all' }>;
}

/**
 * 배치 판정 필드 목록의 유일 정의 — 백엔드 재검증 트리거와 프론트 이설 판정이 공유한다.
 */
export const PLACEMENT_FIELDS = [
  'floorId', 'x', 'y', 'width', 'height',
  'parentAssetId', 'containerKey', 'slotIndex', 'slotSpan',
] as const;

export type PlacementField = (typeof PLACEMENT_FIELDS)[number];
