/**
 * 포트 종류 어휘 — 케이블 그룹 하나당 포트 종류 하나.
 *
 * **왜 코드에 고정하는가**: 케이블 그룹(전원·네트워크·광·제어·접지)은 이미 고정이다
 * (백엔드에 `cableGroup` 의 create/delete 가 없다 — 이름·색·품셈만 고칠 수 있다).
 * 사용자가 늘리는 것은 그 아래 *종류*(F-CV 전력케이블·UTP·OPGW …)뿐이다.
 * 그런데 그 고정성을 **쓰지 않아서**, `medium` 은 그냥 꼬리표였고 모든 포트가 똑같이
 * 행동했다. 그 결과 전원 OUT 과 OUT 을 이어도 통과했고, 접지 단자에는 두 번째 가닥을
 * 물릴 수 없었다.
 *
 * **업계 표준의 자리**: NetBox(DCIM)는 포트를 클래스로 나누고(Interface·ConsolePort·
 * PowerPort·PowerOutlet·RearPort …) 무엇이 무엇에 붙는지를 정적 표 하나
 * (`COMPATIBLE_TERMINATION_TYPES`)로 끝낸다. 거기서 연결을 강제하는 것은 **케이블이
 * 아니라 포트**다 — 케이블의 종류는 설명일 뿐이다. 이 표가 그 자리에 해당한다.
 *
 * **왜 클래스가 아니라 표인가**: 종류마다 코드 분기(`if (medium === 'power')`)를 두면
 * 종류가 늘 때마다 손댈 곳이 흩어진다. 규칙을 데이터로 적어 두고 판정은 한 곳에서 한다 —
 * `ASSET_STATUSES`·`PORT_DIRECTIONS` 와 같은 급의 고정 어휘다.
 */

import { portDirectionLabel, type Direction } from './types.js';

/** 두 포트의 방향이 어떻게 맞아야 하는가. */
export type PortPairing =
  /** 아무 방향끼리나 — 통신선처럼 양끝이 대등한 경우. */
  | 'any'
  /** 반대 방향끼리만 — 전원처럼 공급과 소비가 갈리는 경우. `BI`(양방향)는 어느 쪽과도 맞는다. */
  | 'opposite';

/** 케이블 한 가닥 또는 포트 하나에 기록하는 값. `Cable.specParams` · `Port.fieldValues` 의 키가 된다. */
export interface ValueDef {
  key: string;
  label: string;
  type: 'number' | 'text' | 'date' | 'boolean';
  /** 라벨 뒤에 붙는 단위 — `길이(m)` 처럼. */
  unit?: string;
  /**
   * 사람이 적는 칸이 아니다 — **다른 값에서 따라오는 것**(측정일이 그렇다).
   *
   * 화면은 읽는 줄로만 세운다. 적게 두면 값과 날짜가 어긋난다.
   */
  readOnly?: boolean;
  /**
   * 적힌 값이 없을 때의 뜻.
   *
   * 개폐가 그렇다 — 살아 있는 계통에서 **투입이 예사이고 개방이 사건**이다. 없는 값을
   * 개방으로 읽으면 아직 아무도 손대지 않은 판이 통째로 죽은 것처럼 보인다. 판 조서(panel
   * schedule)가 OFF·SPARE 만 적어 두는 것과 같은 이유다.
   */
  defaultValue?: unknown;
}

/**
 * 종류를 가리지 않고 모든 케이블이 갖는 값.
 *
 * 길이는 **설계서 공량**의 근거다(품셈 × 길이). 그래서 어느 종류든 적을 수 있어야 한다.
 */
export const COMMON_CABLE_FIELDS: readonly ValueDef[] = [
  { key: 'lengthM', label: '길이', type: 'number', unit: 'm' },
] as const;

/**
 * **광 선로**의 대장 값 — 송전선로를 타고 오는 다심 인입(OPGW 등)에만 선다.
 *
 * 도면과 연결이 아는 것은 여기 없다: 대국·용도·경로·길이는 이미 다른 데서 나온다. 이 셋은
 * **밖에서 받아 적는 수밖에 없는 것**이다(송전 대장의 번호와 이름, 현장에서 센 접속개소).
 *
 * 광 매체 전체가 아니라 **종류가 선언할 때만** 붙는다(`CableCategory.managesFiberLine`) —
 * 같은 광이라도 점퍼코드에 선로 번호를 적을 일은 없다.
 */
export const FIBER_LINE_FIELDS: readonly ValueDef[] = [
  { key: 'lineName', label: '선로명', type: 'text' },
  { key: 'spliceCount', label: '접속개소', type: 'number' },
] as const;

export interface PortKind {
  /** `CableGroup.key` 이자 `PortTemplate.medium` 값. */
  key: string;
  name: string;
  /**
   * 코어 값을 고치면 **그날이 찍히는 칸**의 키 — 없으면 찍지 않는다.
   *
   * 「언제 쟀나」를 사람이 다시 적게 하면 값과 날짜가 어긋난다(고치고 날짜는 안 고친다).
   */
  stampKey?: string;
  /** 이 종류의 포트가 붙을 수 있는 상대 종류. 지금은 모두 자기 자신뿐이다. */
  connectsTo: readonly string[];
  pairing: PortPairing;
  /** 한 포트에 물릴 수 있는 케이블 수. `null` = 제한 없음(접지 부스바). */
  maxCables: number | null;
  /** 이 종류의 케이블에만 있는 값. 공통 필드는 여기 되풀이하지 않는다. */
  cableFields: readonly ValueDef[];
  /**
   * **포트 하나**에 딸린 값 — 케이블이 아니라 심선마다 다른 것.
   *
   * 광 손실(dB)·점검일이 그렇다. 예전에는 케이블에 담았는데, 그러려면 OPGW 한 가닥을
   * 심선 수만큼 케이블로 복제해야 했고 그 탓에 설계서 공량이 그 배로 부풀었다
   * (40m 4심 → 160m). 값이 심선의 것이면 심선(포트)에 담는다.
   *
   * **다심 포트(`positions > 1`)에서는 코어마다 한 벌씩** 담긴다 — `portValuesAt` 참고.
   */
  portFields: readonly ValueDef[];
  /**
   * 이 종류의 포트는 심선을 여러 가닥 나를 **수 있다** — 케이블 1본에 코어 N개.
   *
   * 실제로 몇 심인지는 포트마다 다르다(`positions`). 이 깃발은 「이 종류에는 다심이라는
   * 것이 있다」는 뜻이고, 그래서 포트를 놓을 때 다심 프리셋이 하나 더 생긴다.
   */
  multiCore?: boolean;
  /**
   * 붙을 상대를 **심선 수로** 가른다 — 다심은 다심끼리, 단심은 단심끼리.
   *
   * 광이 그렇다. 24심 성단을 1심 어댑터에 물릴 수는 없다. 이 규칙이 없으면 같은 매체
   * 안에서 아무 포트끼리나 붙는다(네트워크·접지가 그렇다 — 거기엔 다심이 없다).
   *
   * 다심 포트가 함체 **안에서** 펼쳐지는 규칙도 여기서 나온다: 코어 i → 같은 자산의
   * 단심 i 번(`derivedLinks`). 성단 판의 생김새이지 설정이 아니다.
   */
  pairsByCoreCount?: boolean;
  /**
   * **코어마다** 한 벌씩 적는 값 — 다심 포트에만 있다.
   *
   * 광 손실·점검일이 그렇다. 단심 어댑터에는 잴 것이 없으므로 `portFields` 가 아니라
   * 여기 둔다. 저장 형상은 코어 번호를 키로 한 한 겹 중첩이다(`portValuesAt`).
   */
  coreFields?: readonly ValueDef[];
}

/**
 * `satisfies` 로 적는다 — 주석(`: readonly PortKind[]`)을 달면 `key` 가 `string` 으로
 * 넓어져 아래 `PortKindKey` 가 뜻을 잃는다. 시드의 품셈 표가 이 키로 **빠짐없이** 열거되게
 * 하려면 리터럴 타입이 살아 있어야 한다.
 */
export const PORT_KINDS = [
  // 전원은 공급(OUT)과 소비(IN)가 갈린다 — 출력끼리 잇는 것은 물리적으로 불가능하다.
  {
    key: 'power', name: '전원', connectsTo: ['power'], pairing: 'opposite', maxCables: 1,
    cableFields: [{ key: 'voltage', label: '전압', type: 'text' }],
    /* 차단기의 개폐 — 예전에는 피더 **자산**의 필드였는데, 개폐는 자산이 아니라
       그 회로의 상태다. 출력이 여럿인 기기(콘센트 13구 분배반)는 회로마다 따로 끊긴다.
       입력도 마찬가지다 — 배전반 주차단기, UPS·정류기의 입력 MCCB 가 다 입력 쪽에 있다.
       상대의 출력 차단기와 내 입력 차단기는 서로 다른 둘이라, 한쪽으로 대신할 수 없다. */
    portFields: [{ key: 'closed', label: '개폐', type: 'boolean', defaultValue: true }],
  },
  { key: 'network', name: '네트워크', connectsTo: ['network'], pairing: 'any', maxCables: 1, cableFields: [], portFields: [] },
  /*
   * 광 — 점퍼코드 한 가닥(1심)부터 OPGW 한 가닥(24심)까지 **한 종류**다.
   *
   * 예전에는 `fiber` 와 `fiber-trunk` 로 갈라 두었다. 그런데 그 둘을 가르던 것은 결국
   * **심선 수**였고, 심선 수는 이미 포트가 `positions` 로 들고 있다 — 케이블에는 심선 수
   * 필드가 아예 없다. 같은 사실을 매체 키가 한 번 더 나르고 있었던 셈이라, 화면에는 뜻이
   * 겹치는 「광」과 「OPGW」 두 그룹이 나란히 섰다.
   *
   * 그래서 가르는 일은 `positions` 에 맡긴다:
   *   - 붙을 상대     : 다심은 다심끼리, 단심은 단심끼리(`pairsByCoreCount`).
   *                     24심 성단을 1심 어댑터에 물릴 수는 없다.
   *   - 코어별 값     : 손실·점검일은 **다심 포트에만** 있다(`coreFields`).
   *                     장비쪽 어댑터에는 OTDR 로 잴 것이 없다.
   *   - 함체 안 통과  : 다심 포트의 코어 i 는 같은 자산의 **단심** i 번으로 나온다.
   */
  {
    key: 'fiber', name: '광', connectsTo: ['fiber'], pairing: 'any', maxCables: 1,
    multiCore: true, pairsByCoreCount: true,
    cableFields: [],
    portFields: [],
    // 코어마다 한 벌 — 24심이면 손실 24개·점검일 24개가 그 포트 하나에 담긴다.
    /**
     * OTDR 로 재는 값들 — 코어마다, 그리고 **파장마다** 다르다.
     *
     * 한 칸(「손실」)으로는 모자란다. 현장 선번장은 `1310㎛` 와 `1550㎛` 아래 각각 **손실과
     * 측정거리 두 칸**을 둔다 — OTDR 은 파장마다 따로 쏘므로 잰 거리도 따로 나오고, 두
     * 파장의 거리가 어긋나는 것 자체가 읽을거리다(접속점·굽힘 손실의 신호).
     */
    coreFields: [
      { key: 'loss1310', label: '1310 손실', type: 'number', unit: 'dB' },
      { key: 'distance1310', label: '1310 거리', type: 'number', unit: 'km' },
      { key: 'loss1550', label: '1550 손실', type: 'number', unit: 'dB' },
      { key: 'distance1550', label: '1550 거리', type: 'number', unit: 'km' },
      /* 언제 쟀는가는 **적는 것이 아니라 찍히는 것**이다 — 값을 고치면 그때가 된다. */
      { key: 'measuredAt', label: '측정일', type: 'date', readOnly: true },
    ],
    /** 코어 값을 고치면 이 칸에 그날을 찍는다 — 화면이 키를 알지 않게 선언으로 준다. */
    stampKey: 'measuredAt',
  },
  // 제어는 널모뎀처럼 같은 쪽끼리 직결하는 배선이 실제로 있어 방향을 따지지 않는다.
  { key: 'control', name: '제어', connectsTo: ['control'], pairing: 'any', maxCables: 1, cableFields: [], portFields: [] },
  // 접지 부스바에는 여러 기기의 접지선이 한 단자로 모인다 — 여기만 다중 결선이다.
  { key: 'ground', name: '접지', connectsTo: ['ground'], pairing: 'any', maxCables: null, cableFields: [], portFields: [] },
] as const satisfies readonly PortKind[];

/** 이 어휘가 아는 매체 키 — 시드·검증이 이걸로 빠짐을 컴파일 때 잡는다. */
export type PortKindKey = (typeof PORT_KINDS)[number]['key'];

/**
 * 이 종류의 케이블에 적을 수 있는 값 — 공통 + 종류별.
 *
 * 예전에는 화면이 `lengthM`·`lossDb`·`inspectedAt`·`voltage` 라는 키를 직접 알고 있었다
 * (선번장 meta 3열, 계통 전압열, 설계서 공량). 그래서 값을 하나 늘리려면 그 키를 읽는 곳을
 * 전부 찾아 고쳐야 했고, 종류마다 무엇을 적을 수 있는지는 코드를 읽어야만 알 수 있었다.
 */
export function cableFieldsFor(medium: string, opts?: { managesFiberLine?: boolean }): ValueDef[] {
  return [
    ...COMMON_CABLE_FIELDS,
    ...(portKind(medium)?.cableFields ?? []),
    /* 선로 값은 **종류의 선언**이 부른다 — 매체가 아니라(같은 광이어도 점퍼코드는 아니다). */
    ...(opts?.managesFiberLine ? FIBER_LINE_FIELDS : []),
  ];
}

/**
 * 이 **포트**에 적을 수 있는 값 — 회로마다 다른 것(개폐), 코어마다 다른 것(광 손실·점검일).
 *
 * 심선 수를 함께 묻는다: 코어별 값(`coreFields`)은 다심 포트에만 있다. 장비쪽 광 어댑터에는
 * OTDR 로 잴 것이 없는데, 예전에는 매체가 갈려 있어 그 사실이 매체 키로 표현됐다.
 */
export function portFieldsFor(medium: string, positions?: number | null): ValueDef[] {
  const kind = portKind(medium);
  if (!kind) return [];
  return isMultiCorePort(positions) ? [...kind.portFields, ...(kind.coreFields ?? [])] : [...kind.portFields];
}

/**
 * 이 포트가 나르는 **심선 수** — 안 적었으면 한 가닥이다.
 *
 * 이 한 줄이 열세 군데에 흩어져 있었다(`positions ?? 1`). 자산을 놓을 때·판을 그릴 때·
 * 명세를 읽을 때·서버가 저장할 때가 저마다 같은 기본값을 다시 적었는데, 기본값이 규칙인 이상
 * 적는 자리는 하나여야 한다 — 한 곳이 어긋나면 같은 포트가 화면에서는 1심, 저장에서는 24심이
 * 된다.
 */
export function coreCount(positions: number | null | undefined): number {
  return positions ?? 1;
}

/** 이 포트가 심선을 여러 가닥 나르는가. `positions` 이 없거나 1이면 보통 포트다. */
export function isMultiCorePort(positions: number | null | undefined): boolean {
  return coreCount(positions) > 1;
}

/**
 * 이 포트(다심이면 그 코어 하나)에 적힌 값 — **선언된 기본값까지 얹어서**.
 *
 * 저장 형상은 다심일 때 코어 번호를 키로 한 한 겹 중첩이다
 * (`{ "1": { lossDb: 0.6 }, "2": {…} }`). 보통 포트는 중첩 없이 통째로 쓴다.
 *
 * 적힌 값이 **없다는 것**과 값이 **없다는 것**은 다르다 — 개폐는 아무도 손대지 않았어도
 * 투입이다. 한때 기본값을 얹는 문(`portValue`)과 안 얹는 문(`portValuesAt`)이 따로 있었고,
 * 선번장만 안 얹는 쪽을 써서 같은 값을 화면마다 다르게 읽을 수 있었다. 문은 하나다.
 */
export function portValuesAt(
  port: { medium: string; positions?: number | null; fieldValues?: Record<string, unknown> | null },
  position: number,
): Record<string, unknown> {
  const stored = storedValuesAt(port, position);
  const defaults: Record<string, unknown> = {};
  for (const f of portFieldsFor(port.medium, port.positions)) {
    if (f.defaultValue !== undefined && !(f.key in stored)) defaults[f.key] = f.defaultValue;
  }
  return Object.keys(defaults).length > 0 ? { ...defaults, ...stored } : stored;
}

/**
 * **적힌 그대로** — 기본값을 얹지 않는다.
 *
 * 쓰기가 `portValuesAt` 을 거치면 값 하나를 고칠 때마다 선언된 기본값이 통째로 저장에
 * 눌러앉는다("아무도 손대지 않음" 과 "투입이라고 적음" 이 구분되지 않게 된다).
 */
function storedValuesAt(
  port: { positions?: number | null; fieldValues?: Record<string, unknown> | null },
  position: number,
): Record<string, unknown> {
  const all = port.fieldValues ?? {};
  if (!isMultiCorePort(port.positions)) return all;
  const at = all[String(position)];
  return at != null && typeof at === 'object' ? (at as Record<string, unknown>) : {};
}

/** `portValuesAt` 의 짝 — 코어 하나의 값 하나를 바꾼 **새** `fieldValues` 를 돌려준다. */
export function setPortValueAt(
  port: { positions?: number | null; fieldValues?: Record<string, unknown> | null },
  position: number,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const all = { ...(port.fieldValues ?? {}) };
  if (!isMultiCorePort(port.positions)) {
    all[key] = value;
    return all;
  }
  all[String(position)] = { ...storedValuesAt(port, position), [key]: value };
  return all;
}

/**
 * 이 종류의 코어 값을 고치면 **그날이 찍히는 칸** — 없으면 찍지 않는다.
 *
 * 화면이 `'measuredAt'` 이라는 키를 알지 않게 한다. 종류가 바뀌면 찍히는 칸도 따라 바뀐다.
 */
export function stampKeyFor(medium: string): string | null {
  return portKind(medium)?.stampKey ?? null;
}

export function portKind(key: string): PortKind | null {
  return PORT_KINDS.find((k) => k.key === key) ?? null;
}

/** 장비 품목을 만들 때 "이 포트를 몇 개" 로 고를 수 있는 미리 정의된 묶음. */
export interface PortPreset {
  /** 버튼에 적히는 이름 — `전원 입력` 처럼 방향까지 담는다. */
  name: string;
  medium: string;
  direction: Direction;
  /** 타입 안에서 유일해야 하는 그룹 키의 후보. 이미 쓰이고 있으면 뒤에 번호를 붙인다. */
  groupKey: string;
  /** `{n}` 이 번호로 치환된다. */
  namePattern: string;
  /** 다심 포트 프리셋의 기본 코어 수. 보통 포트는 1. */
  positions: number;
}

/** 다심 포트를 처음 놓을 때의 코어 수 — OPGW 는 24심이 가장 흔하다. */
export const DEFAULT_CORE_COUNT = 24;

/**
 * 포트 프리셋 — 어휘에서 **파생**된다. 따로 적어 두는 목록이 아니다.
 *
 * 예전에는 포트를 하나 넣을 때마다 그룹 키·수량·방향·매체·이름 패턴·선로측 여섯 칸을
 * 빈칸에서 채워야 했다. 그룹 키와 이름 패턴은 사용자가 **지어내야** 하는 값이라
 * "네트워크 24구 스위치" 하나 정의하는 데도 규칙을 알아야 했다.
 *
 * 방향이 뜻을 갖는 종류(`opposite`)는 입력·출력이 서로 다른 물건이므로 둘로 나눈다 —
 * "전원 입력 1개, 출력 2개" 가 그대로 두 번의 클릭이 된다.
 * 방향을 따지지 않는 종류는 하나면 된다.
 */
export function portPresets(): PortPreset[] {
  /* `kind: PortKind` 로 넓혀 받는다 — `as const` 배열은 선언하지 않은 선택 속성
     (`multiCore`)이 그 항목의 타입에서 아예 사라져 읽을 수가 없다. */
  return PORT_KINDS.flatMap((kind: PortKind) => {
    if (kind.pairing !== 'opposite') {
      const single = { name: kind.name, medium: kind.key, direction: 'BI' as Direction, groupKey: kind.key.toUpperCase(), namePattern: `${kind.name} {n}`, positions: 1 };
      /* 다심이 있는 종류는 **둘로 내놓는다** — 「광」(어댑터 1심)과 「광 다심」(성단 N심).
         하나로 두면 24심 인입을 놓을 방법이 없거나, 반대로 어댑터가 24심이 된다. */
      return kind.multiCore
        ? [single, {
            name: `${kind.name} 다심`, medium: kind.key, direction: 'BI' as Direction,
            groupKey: `${kind.key.toUpperCase()}-TRUNK`, namePattern: 'OPGW', positions: DEFAULT_CORE_COUNT,
          }]
        : [single];
    }
    return (['IN', 'OUT'] as const).map((direction) => {
      const label = `${kind.name} ${portDirectionLabel(direction)}`;
      // 방향이 뜻을 갖는 종류(전원)에는 다심이 없다 — 1심 고정.
      return { name: label, medium: kind.key, direction, groupKey: `${kind.key.toUpperCase()}-${direction}`, namePattern: `${label} {n}`, positions: 1 };
    });
  });
}

/** 그룹 하나를 사람 말로 부르기 위해 필요한 최소 정보. */
export interface PortGroupRef {
  group: string;
  medium: string;
  direction: Direction;
  /**
   * 그 그룹 포트 하나의 이름(예: `장비 1`). 같은 종류·방향이 둘 이상일 때 이걸로 가른다.
   * 그룹 키(`A`·`B`)는 영문만 허용되는 **식별자**라 사람에게 보여 줄 이름이 못 된다.
   */
  sampleName?: string;
  /** 심선 수 — 같은 매체 안에서 성단(다심)을 앞에 세우는 데 쓴다. */
  positions?: number | null;
}

/** 포트 이름에서 번호를 떼어 그룹 이름을 얻는다 — `장비 1` → `장비`. */
function nameBase(sample: string | undefined): string | null {
  if (!sample) return null;
  const base = sample.replace(/\s*\d+\s*$/, '').trim();
  return base.length > 0 ? base : null;
}

/**
 * 포트 그룹을 화면에 뭐라고 부를 것인가.
 *
 * 그룹 키(`P`·`GND`·`PWR-IN`·`COM`)는 **타입 안에서 유일해야 하는 식별자**이지 이름이 아니다.
 * 그런데 화면이 `GND 그룹`·`PWR-IN 그룹` 이라고 그대로 적고 있었다 — 쓰는 사람에게는 아무
 * 뜻이 없는 글자다(`BI`·`network` 를 그대로 보여 주던 것과 같은 계열).
 *
 * 그래서 **종류 이름**으로 부른다. 방향이 뜻을 갖는 종류(전원)는 방향까지 붙여야 입력과
 * 출력이 갈린다. 같은 이름이 둘 이상 나오면 그때만 키를 덧붙인다 — 광슬롯의 `A`·`B` 처럼
 * 키 자체가 유일한 이름인 경우가 그렇다. 구분이 필요할 때까지 이름을 길게 만들지 않는다.
 */
export function portGroupLabel(
  target: PortGroupRef,
  siblings: readonly PortGroupRef[],
  /**
   * 매체 키 → 현장이 쓰는 이름. **카탈로그(케이블 그룹)가 준다.**
   *
   * 없으면 어휘의 기본 이름으로 떨어진다. 예전에는 여기서 늘 어휘 이름을 읽었는데, 그
   * 이름은 설비관리대장에서 고칠 수 있어(`CableGroup.name`) 화면마다 다른 말이 나왔다 —
   * 판 구획은 「OPGW」, 자산 만들 때 매체 고르는 칸은 「광 인입」. 표시는 한 곳에서 나온다.
   */
  mediumName?: (medium: string) => string,
): string {
  const base = (g: PortGroupRef) => {
    const name = mediumName?.(g.medium) ?? portKind(g.medium)?.name ?? g.medium;
    return portKind(g.medium)?.pairing === 'opposite' ? `${name} ${portDirectionLabel(g.direction)}` : name;
  };
  const mine = base(target);
  const ambiguous = siblings.filter((s) => base(s) === mine).length > 1;
  if (!ambiguous) return mine;
  /* 가를 때는 **포트 이름을 그대로** 쓴다 — 매체 이름을 앞에 덧붙이지 않는다.
     성단 구획이 「광 OPGW」가 되던 자리다. OPGW 는 그 자체로 광이라 「광」이 군더더기고,
     맞은편도 「광 광 포트」가 될 판이었다. 이름이 이미 무엇인지 말하고 있으면 그것으로 족하다.
     키(`A`·`B`)는 식별자라 사람에게 뜻이 없으므로 이름이 없을 때만 쓴다. */
  return nameBase(target.sampleName) ?? `${mine} ${target.group}`;
}

/**
 * 판에서 구획이 서는 차례 — **어휘 순서 → 다심 먼저 → 키**.
 *
 * 어휘 순서(전원 → 네트워크 → 광 → 제어 → 접지)가 첫째다. 같은 매체 안에서는 **성단(다심)이
 * 앞**이다: 판을 읽는 사람은 「밖에서 무엇이 들어오는가」를 먼저 보고 그것이 어디로 갈렸는지를
 * 뒤에 본다.
 *
 * 이 규칙이 두 곳에 복제돼 있으면 **미리보기와 실물이 다른 차례로 선다** — 그러면 미리 볼
 * 뜻이 없다. 실제로 그렇게 돼 있었다.
 */
export function comparePortGroups(a: PortGroupRef, b: PortGroupRef): number {
  const kindOrder = (medium: string) => {
    const i = PORT_KINDS.findIndex((k) => k.key === medium);
    return i < 0 ? PORT_KINDS.length : i; // 어휘에 없는 것은 뒤로
  };
  const trunkFirst = (r: PortGroupRef) => (isMultiCorePort(r.positions) ? 0 : 1);
  return kindOrder(a.medium) - kindOrder(b.medium) || trunkFirst(a) - trunkFirst(b) || a.group.localeCompare(b.group);
}

/** 이미 쓰이고 있는 그룹 키를 피해서 고른다 — 그룹 키는 타입 안에서 유일해야 한다. */
export function uniqueGroupKey(candidate: string, taken: readonly string[]): string {
  if (!taken.includes(candidate)) return candidate;
  for (let n = 2; ; n++) {
    const next = `${candidate}-${n}`;
    if (!taken.includes(next)) return next;
  }
}

/**
 * 두 포트의 **심선 수가 맞는가** — 다심은 다심끼리, 단심은 단심끼리.
 *
 * 예전에는 이 사실을 매체 키가 날랐다(`fiber` vs `fiber-trunk`). 그런데 심선 수는 이미
 * 포트가 들고 있으므로, 같은 것을 두 곳에 적어 두면 어긋날 자리만 생긴다. 물어야 할 것을
 * 직접 묻는다: 24심 성단을 1심 어댑터에 물릴 수는 없다.
 */
/**
 * 이 포트에 케이블을 더 물릴 수 있는가.
 *
 * 어휘에 없는 종류는 **막지 않는다** — 카탈로그에서 그룹 이름만 바꿨거나 데이터가 앞서 나간
 * 경우에 화면이 통째로 잠기는 편보다, 예전과 같은 1가닥 규칙으로 두는 편이 안전하다.
 */
export function coreCountsMatch(
  a: { medium: string; positions?: number | null },
  b: { positions?: number | null },
): boolean {
  if (!portKind(a.medium)?.pairsByCoreCount) return true;
  return isMultiCorePort(a.positions) === isMultiCorePort(b.positions);
}

export function portHasRoom(medium: string, currentCableCount: number): boolean {
  const kind = portKind(medium);
  // `?? 1` 로 줄여 쓰면 안 된다 — "제한 없음" 을 뜻하는 `null` 까지 기본값 1로 삼켜서
  // 접지 부스바가 1가닥으로 막힌다. "어휘에 없음" 과 "제한 없음" 은 다른 경우다.
  if (kind == null) return currentCableCount < 1;
  return kind.maxCables === null || currentCableCount < kind.maxCables;
}

/**
 * 선로가 물린 **경로슬롯의 이름** — 「제 국 - 상대 국 - 순번」.
 *
 * 이름을 사람이 짓게 두면 두 국이 서로 다른 말을 적는다(한쪽은 「슬롯 1」, 다른 쪽은
 * 「춘천행」). 그런데 그 판이 무엇인지는 **연결이 이미 말하고 있다** — 어느 국에서 어느
 * 국으로 가는 몇 번째 선로인가. 그러니 연결이 이름을 짓는다.
 *
 * 대상을 고르는 것도 이름이 아니라 선언이다: **다심 인입 포트를 가진 자산**(`isMultiCorePort`).
 * 「OPGW 면」·「이름이 슬롯이면」으로 가르지 않는다.
 */
export function linkedSlotName(ownStation: string, peerStation: string, seq: number): string {
  return `${ownStation} - ${peerStation} - ${seq}`;
}
