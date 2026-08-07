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

export interface PortKind {
  /** `CableGroup.key` 이자 `PortTemplate.medium` 값. */
  key: string;
  name: string;
  /** 이 종류의 포트가 붙을 수 있는 상대 종류. 지금은 모두 자기 자신뿐이다. */
  connectsTo: readonly string[];
  pairing: PortPairing;
  /** 한 포트에 물릴 수 있는 케이블 수. `null` = 제한 없음(접지 부스바). */
  maxCables: number | null;
}

export const PORT_KINDS: readonly PortKind[] = [
  // 전원은 공급(OUT)과 소비(IN)가 갈린다 — 출력끼리 잇는 것은 물리적으로 불가능하다.
  { key: 'power', name: '전원', connectsTo: ['power'], pairing: 'opposite', maxCables: 1 },
  { key: 'network', name: '네트워크', connectsTo: ['network'], pairing: 'any', maxCables: 1 },
  { key: 'fiber', name: '광', connectsTo: ['fiber'], pairing: 'any', maxCables: 1 },
  // 제어는 널모뎀처럼 같은 쪽끼리 직결하는 배선이 실제로 있어 방향을 따지지 않는다.
  { key: 'control', name: '제어', connectsTo: ['control'], pairing: 'any', maxCables: 1 },
  // 접지 부스바에는 여러 기기의 접지선이 한 단자로 모인다 — 여기만 다중 결선이다.
  { key: 'ground', name: '접지', connectsTo: ['ground'], pairing: 'any', maxCables: null },
] as const;

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
