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

/** 케이블 한 가닥에 기록하는 값 하나 — `Cable.specParams` 의 키가 된다. */
export interface CableFieldDef {
  key: string;
  label: string;
  type: 'number' | 'text' | 'date';
  /** 라벨 뒤에 붙는 단위 — `길이(m)` 처럼. */
  unit?: string;
}

/**
 * 종류를 가리지 않고 모든 케이블이 갖는 값.
 *
 * 길이는 **설계서 공량**의 근거다(품셈 × 길이). 그래서 어느 종류든 적을 수 있어야 한다.
 */
export const COMMON_CABLE_FIELDS: readonly CableFieldDef[] = [
  { key: 'lengthM', label: '길이', type: 'number', unit: 'm' },
] as const;

export interface PortKind {
  /** `CableGroup.key` 이자 `PortTemplate.medium` 값. */
  key: string;
  name: string;
  /** 이 종류의 포트가 붙을 수 있는 상대 종류. 지금은 모두 자기 자신뿐이다. */
  connectsTo: readonly string[];
  pairing: PortPairing;
  /** 한 포트에 물릴 수 있는 케이블 수. `null` = 제한 없음(접지 부스바). */
  maxCables: number | null;
  /** 이 종류의 케이블에만 있는 값. 공통 필드는 여기 되풀이하지 않는다. */
  cableFields: readonly CableFieldDef[];
  /**
   * **포트 하나**에 딸린 값 — 케이블이 아니라 심선마다 다른 것.
   *
   * 광 손실(dB)·점검일이 그렇다. 예전에는 케이블에 담았는데, 그러려면 OPGW 한 가닥을
   * 심선 수만큼 케이블로 복제해야 했고 그 탓에 설계서 공량이 그 배로 부풀었다
   * (40m 4심 → 160m). 값이 심선의 것이면 심선(포트)에 담는다.
   */
  portFields: readonly CableFieldDef[];
}

export const PORT_KINDS: readonly PortKind[] = [
  // 전원은 공급(OUT)과 소비(IN)가 갈린다 — 출력끼리 잇는 것은 물리적으로 불가능하다.
  {
    key: 'power', name: '전원', connectsTo: ['power'], pairing: 'opposite', maxCables: 1,
    cableFields: [{ key: 'voltage', label: '전압', type: 'text' }], portFields: [],
  },
  { key: 'network', name: '네트워크', connectsTo: ['network'], pairing: 'any', maxCables: 1, cableFields: [], portFields: [] },
  {
    key: 'fiber', name: '광', connectsTo: ['fiber'], pairing: 'any', maxCables: 1,
    cableFields: [],
    // 손실·점검일은 **심선마다** 다르다 — 케이블이 아니라 포트의 값이다.
    portFields: [
      { key: 'lossDb', label: '손실', type: 'number', unit: 'dB' },
      { key: 'inspectedAt', label: '점검일', type: 'date' },
    ],
  },
  // 제어는 널모뎀처럼 같은 쪽끼리 직결하는 배선이 실제로 있어 방향을 따지지 않는다.
  { key: 'control', name: '제어', connectsTo: ['control'], pairing: 'any', maxCables: 1, cableFields: [], portFields: [] },
  // 접지 부스바에는 여러 기기의 접지선이 한 단자로 모인다 — 여기만 다중 결선이다.
  { key: 'ground', name: '접지', connectsTo: ['ground'], pairing: 'any', maxCables: null, cableFields: [], portFields: [] },
] as const;

/**
 * 이 종류의 케이블에 적을 수 있는 값 — 공통 + 종류별.
 *
 * 예전에는 화면이 `lengthM`·`lossDb`·`inspectedAt`·`voltage` 라는 키를 직접 알고 있었다
 * (선번장 meta 3열, 계통 전압열, 설계서 공량). 그래서 값을 하나 늘리려면 그 키를 읽는 곳을
 * 전부 찾아 고쳐야 했고, 종류마다 무엇을 적을 수 있는지는 코드를 읽어야만 알 수 있었다.
 */
export function cableFieldsFor(medium: string): CableFieldDef[] {
  return [...COMMON_CABLE_FIELDS, ...(portKind(medium)?.cableFields ?? [])];
}

/** 이 종류의 **포트**에 적을 수 있는 값 — 심선마다 다른 것(광 손실·점검일). */
export function portFieldsFor(medium: string): CableFieldDef[] {
  return [...(portKind(medium)?.portFields ?? [])];
}

export function portKind(key: string): PortKind | null {
  return PORT_KINDS.find((k) => k.key === key) ?? null;
}

/** 자산 타입을 만들 때 "이 포트를 몇 개" 로 고를 수 있는 미리 정의된 묶음. */
export interface PortPreset {
  /** 버튼에 적히는 이름 — `전원 입력` 처럼 방향까지 담는다. */
  name: string;
  medium: string;
  direction: Direction;
  /** 타입 안에서 유일해야 하는 그룹 키의 후보. 이미 쓰이고 있으면 뒤에 번호를 붙인다. */
  groupKey: string;
  /** `{n}` 이 번호로 치환된다. */
  namePattern: string;
}

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
  return PORT_KINDS.flatMap((kind) => {
    if (kind.pairing !== 'opposite') {
      return [{ name: kind.name, medium: kind.key, direction: 'BI' as Direction, groupKey: kind.key.toUpperCase(), namePattern: `${kind.name} {n}` }];
    }
    return (['IN', 'OUT'] as const).map((direction) => {
      const label = `${kind.name} ${portDirectionLabel(direction)}`;
      return { name: label, medium: kind.key, direction, groupKey: `${kind.key.toUpperCase()}-${direction}`, namePattern: `${label} {n}` };
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
export function portGroupLabel(target: PortGroupRef, siblings: readonly PortGroupRef[]): string {
  const base = (g: PortGroupRef) => {
    const name = portKind(g.medium)?.name ?? g.medium;
    return portKind(g.medium)?.pairing === 'opposite' ? `${name} ${portDirectionLabel(g.direction)}` : name;
  };
  const mine = base(target);
  const ambiguous = siblings.filter((s) => base(s) === mine).length > 1;
  if (!ambiguous) return mine;
  // 가를 때는 포트 이름을 쓴다 — 키(`A`·`B`)는 식별자라 사람에게 뜻이 없다.
  return `${mine} ${nameBase(target.sampleName) ?? target.group}`;
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
 * 이 포트에 케이블을 더 물릴 수 있는가.
 *
 * 어휘에 없는 종류는 **막지 않는다** — 카탈로그에서 그룹 이름만 바꿨거나 데이터가 앞서 나간
 * 경우에 화면이 통째로 잠기는 편보다, 예전과 같은 1가닥 규칙으로 두는 편이 안전하다.
 */
export function portHasRoom(medium: string, currentCableCount: number): boolean {
  const kind = portKind(medium);
  // `?? 1` 로 줄여 쓰면 안 된다 — "제한 없음" 을 뜻하는 `null` 까지 기본값 1로 삼켜서
  // 접지 부스바가 1가닥으로 막힌다. "어휘에 없음" 과 "제한 없음" 은 다른 경우다.
  if (kind == null) return currentCableCount < 1;
  return kind.maxCables === null || currentCableCount < kind.maxCables;
}
