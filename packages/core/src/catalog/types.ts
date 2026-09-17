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
  /**
   * **정면이 어디를 보는가** — 도면에서 굵은 변으로 그린다.
   *
   * 반과 랙에는 앞이 있다. 앞이 벽을 보고 있으면 문을 열 수 없어서, 배치 검토에서 가장
   * 먼저 보는 것이 이것이다. 설비 도면은 이것을 문 열림 호나 굵은 변으로 반드시 적는다.
   *
   * 방위(북·동·남·서)가 아니라 **도면 기준**(위·아래·왼쪽·오른쪽)이다 — 층마다 방위
   * 기준이 아직 없고, 있더라도 사람이 보는 것은 화면 위의 방향이다.
   *
   * 비워 둘 수 있다. 정면이 뜻 없는 물건(축전지 선반·경로슬롯)이 있고, 모르는 것을
   * 기본값으로 박으면 도면이 없는 사실을 말하게 된다.
   *
   * **정하는 자리는 도면이다**(`inForm: false`) — 평면도 도구바의 회전 단추가 90°씩 돌린다.
   * 폼에서 「위·아래·왼쪽·오른쪽」을 고르는 것은 도면을 보지 않고 방향을 정하는 일이라,
   * 고를 때마다 도면과 눈으로 대조해야 했다. 값이 사는 자리는 그대로 `fieldValues.facing` 이다.
   */
  { key: 'facing', label: '정면', type: 'select', options: ['위', '아래', '왼쪽', '오른쪽'], inTable: false, inForm: false },
] as const;

/** 정면 값 — 도면 기준 방향. 렌더러와 화면이 같은 어휘를 쓴다. */
export type Facing = '위' | '아래' | '왼쪽' | '오른쪽';

/**
 * **도면에 놓는 설비의 기본 정면** — 아래(사람이 서는 쪽).
 *
 * 반과 랙은 문이 통로를 보게 놓는다. 도면에서 통로는 대개 아래쪽이므로, 놓는 순간
 * 아무것도 안 정해져 있는 것보다 「아래」로 서 있는 편이 실물에 가깝다. 틀리면 도구바의
 * 회전 한 번으로 돌린다.
 *
 * **도면에 놓이는 것에만 준다.** 설비 격자 안의 장비(카드·슬롯)와 경로슬롯에는 정면이
 * 뜻이 없어서, 거기까지 기본값을 박으면 도면이 없는 사실을 말하게 된다.
 */
export const DEFAULT_FACING: Facing = '아래';

/**
 * 정면을 90°씩 돌린 다음 값 — 도구바의 회전이 쓴다.
 *
 * 네 방향을 돈다. 「없음」으로는 돌아가지 않는다: 도면에 놓인 설비는 놓는 순간부터 정면을
 * 가지므로(`DEFAULT_FACING`), 한 바퀴에 「없음」을 끼우면 **돌리다가 굵은 변이 사라지는**
 * 칸이 하나 생긴다. 아직 정면이 없는 옛 자산은 첫 번째 누름이 기본값을 준다.
 */
export function nextFacing(current: string | null | undefined): Facing {
  const order: readonly Facing[] = ['아래', '왼쪽', '위', '오른쪽'];
  const at = order.indexOf(current as Facing);
  return at < 0 ? DEFAULT_FACING : order[(at + 1) % order.length]!;
}

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
  /**
   * **표의 열로도 서는가** — 안 적으면 선다.
   *
   * 도면에서만 뜻을 갖는 속성(정면)이 현황 표의 열로 올라오면 스무 줄 가운데 두세 줄만
   * 채워진 칸이 하나 더 생긴다.
   */
  inTable?: boolean;
  /**
   * **상세 폼의 줄로도 서는가** — 안 적으면 선다.
   *
   * 그리는 자리에서 정하는 것이 옳은 값이 있다. 정면이 그렇다: 폼에서 「위·아래」를 고르면
   * 도면을 안 보고 방향을 정하는 꼴이라 매번 눈으로 대조해야 했고, 좁은 상세 패널에서
   * 한 줄을 늘 차지했다. 그런 값은 도면이 쥔다(평면도 도구바의 회전).
   */
  inForm?: boolean;
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
  /**
   * 종류 안의 **갈래** — 전원의 교류·직류(`PortKind.variants`). 없으면 갈래가 없는 종류다.
   *
   * 갈래가 다른 포트끼리는 잇지 못한다(`validateConnection`). 매체를 나누지 않고 여기 둔
   * 까닭은 매체 키가 곧 케이블 그룹 키라, 나누면 같은 F-CV 를 두 번 등록해야 하기 때문이다.
   */
  variant?: string | null;
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
  /**
   * 이 종류가 **계통에 서는 반(盤)**인가 — 전원을 나눠 주는 판.
   *
   * 켜면 계통 탭이 그 자산을 한 장으로 세우고 출력 포트를 회로로 편다. 안 켜면 계통에
   * 아예 안 나온다 — 그 자리를 지나는 전원은 반의 머리줄에 「거쳐 온 것」으로 남는다.
   *
   * **출력 수로 알아맞히지 않는다.** 한때 「함체 밖으로 나가는 출력이 둘 이상이면 반」으로
   * 셌는데, 랙 안의 −48V 분배반(PDP-C3)이 분기 일곱이라 변전소 계통 표에 끼어들었다.
   * 나누는 판인지 아닌지는 물건의 성질이지 포트 수의 성질이 아니다 — 선언이 정한다.
   * (케이블 종류의 `managesFiberLine` 과 같은 결이다.)
   */
  managesPowerCircuits?: boolean;
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
  /**
   * 이 포트가 나르는 심선 수. 1 = 보통 포트. @see PortTemplate.positions
   *
   * **선택 칸이 아니다** — 아래 `variant` 와 함께 그 까닭을 적는다.
   */
  positions: number;
  /**
   * 종류 안의 갈래(전원의 교류·직류). 갈래가 없는 종류는 `null`. @see PortTemplate.variant
   *
   * **이 둘은 선택 칸이면 안 된다.** 한때 둘 다 `?` 였고, 둘 다 같은 사고를 냈다:
   * 포트를 이 형상으로 옮겨 담는 자리(화면·서버·토폴로지)가 **조용히 빠뜨렸고**, core 는
   * 빠진 것을 「없는 것」으로 읽어 틀린 그림 위에서 판단했다.
   *   - `positions` 를 빠뜨리자 다심 인입이 1심으로 보여 2번 이후 심선의 추적이 끊겼다.
   *   - `variant` 를 빠뜨리자 교류·직류를 함께 나르는 판이 「교류를 직류로 바꾼다」고
   *     유도되어, 추적이 정류기를 건너뛰고 형제 정류기로 되쏟아졌다.
   *
   * 필수로 두면 **컴파일러가 막는다.** 옮겨 담는 자리가 새로 생겨도 빠뜨릴 수가 없다 —
   * 글자를 훑는 가드레일과 달리 빠져나갈 구멍이 없다.
   */
  variant: string | null;
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
  /** 계통에 서는 반인가 — `AssetTypeSpec.managesPowerCircuits`. */
  managesPowerCircuits?: boolean;
  ports: Array<{ group: string; count: number; direction: Direction; medium: string; namePattern: string; positions?: number; variant?: string | null }>;
}

/**
 * 배치 판정 필드 목록의 유일 정의 — 백엔드 재검증 트리거와 프론트 이설 판정이 공유한다.
 */
export const PLACEMENT_FIELDS = [
  'floorId', 'x', 'y', 'width', 'height',
  'parentAssetId', 'col', 'row', 'colSpan', 'rowSpan',
] as const;

export type PlacementField = (typeof PLACEMENT_FIELDS)[number];
