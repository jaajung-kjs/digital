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

/**
 * 공량·단가 — **`LaborSpec` 이 유일한 선언**이다(`catalog/laborSpec.ts`).
 *
 * 여기서 다시 적지 않는다: 세 담체(자산·설비·케이블)가 같은 다섯 칸을 쓰고, 칸이 늘거나
 * 줄면 그 파일 하나만 고친다.
 */
export type LaborRules = import('./laborSpec.js').LaborSpec;

/**
 * 격자 칸의 자리 번호 — 행 우선(row-major), 1부터.
 *
 * 분전반이 2열이면 1·2가 첫 행, 3·4가 둘째 행이 된다 — 실제 패널 조서의 홀수 왼쪽·짝수
 * 오른쪽과 같은 순서다. 1열짜리 랙에서는 그대로 U 번호가 된다.
 */
export function slotNumber(cols: number, col: number, row: number): number {
  return row * Math.max(cols, 1) + col + 1;
}

/** `slotNumber` 의 짝 — 번호에서 격자 칸을 되찾는다. 화면이 번호로 자리를 가리킬 때 쓴다. */
export function slotCell(cols: number, number: number): { col: number; row: number } {
  const n = Math.max(number, 1) - 1;
  const c = Math.max(cols, 1);
  return { col: n % c, row: Math.floor(n / c) };
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

/**
 * 장비 품목 = **설비 안에 들어가는 것** 하나의 명세.
 *
 * 예전에는 종류가 자리(컨테이너)를 선언했고 「평면도에 배치 가능」 이라는 딱지도 달았다.
 * 그래서 담기 위한 랙이라는 자산이 따로 있어야 했고, 도면에 놓이는 길이 둘(단품 종류 /
 * 조립된 설비)로 갈렸다.
 *
 * 이제 자리는 **설비 품목의 격자**가 갖고, **도면에 놓이는 것은 설비 하나뿐**이다 —
 * 접지함체처럼 단품인 것도 1칸짜리 설비 품목으로 만들어 놓는다. 장비 품목은 무엇을 어떻게
 * 잇는가(포트)와 얼마나 품이 드는가(공량)만 말한다.
 */
export interface AssetTypeSpec {
  key: string;
  name: string;
  categoryKey: string;
  sortOrder: number;
  labor: LaborRules;
  ports: PortTemplate[];
}

/** ---- 인스턴스 참조 형상 (DB 행이 이 형상으로 매핑되어 순수 함수에 들어온다) ---- */

export interface AssetRef {
  id: string;
  typeKey: string;
  name: string;
  parentAssetId?: string | null;
  /** 설비 격자에서의 자리(0-based). */
  col?: number | null;
  row?: number | null;
  colSpan?: number | null;
  rowSpan?: number | null;
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
  /** 새로 만들 때는 비워 둔다 — 서버가 붙인다(현장에서 쓰는 값이 아니라 참조용 식별자다). */
  key?: string;
  name: string;
  categoryId: string;
  sortOrder: number;
  laborCode: string | null;
  /** 자재단가(원/대) — 설계서 재료비의 근거. 비우면 재료비 0. */
  unitPrice: number | null;
  /** 공량(인/대) — null = 「안 적었다」, 0 = 「품이 안 든다」(`LaborSpec`). */
  installManDays: number | null;
  removeManDays: number | null;
  relocateManDays: number | null;
  ports: Array<{ group: string; count: number; direction: Direction; medium: string; namePattern: string; positions?: number }>;
}

/**
 * 배치 판정 필드 목록의 유일 정의 — 백엔드 재검증 트리거와 프론트 이설 판정이 공유한다.
 */
export const PLACEMENT_FIELDS = [
  'floorId', 'x', 'y', 'width', 'height',
  'parentAssetId', 'col', 'row', 'colSpan', 'rowSpan',
] as const;

export type PlacementField = (typeof PLACEMENT_FIELDS)[number];
