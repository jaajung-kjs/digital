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
   * 고를 수 있는 값 — 있으면 화면은 **목록으로** 낸다.
   *
   * 전압·차단기 용량·전선 굵기처럼 현장에서 쓰는 값이 사실상 정해져 있는 칸이 있다(강릉
   * 대장 전체에서 굵기는 열넷, 용량은 아홉, 전압은 넷뿐이었다). 손으로 치게 두면 같은 값이
   * 「AC220V」·「AC 220V」·「220v」로 갈려 세거나 거를 수가 없다.
   *
   * **닫아 걸지는 않는다.** 목록에 없는 값이 실제로 나온다(강릉에 110V 회로가 하나 있다).
   * 목록은 표준을 권하는 것이지 사실을 막는 것이 아니다 — 화면이 「직접 입력」을 함께 낸다.
   */
  options?: readonly (string | number)[];
  /**
   * 표에서 **읽는 차례** — 작을수록 앞.
   *
   * 값이 케이블의 것인지 포트의 것인지는 저장의 사정이고, 읽는 사람은 한 줄로 읽는다:
   * 「길이 · 전압 · 용량 · 굵기」. 전압(V) 옆에 용량(A)이 있어야 회로의 크기가 한눈에 잡힌다.
   * 화면이 키를 나열해 차례를 정하면 어휘가 늘 때마다 화면을 고쳐야 한다.
   */
  order?: number;
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
  /**
   * 참·거짓을 **현장 말로** 뭐라 부르는가 — 개폐는 「투입」·「개방」이다.
   *
   * 없으면 화면이 `ON`·`OFF` 로 쓴다. 여기 적어 두면 표와 상세 카드가 같은 말을 쓴다 —
   * 예전에는 표가 `ON`, 카드가 「투입」이라 같은 값이 두 이름으로 불렸다.
   */
  trueLabel?: string;
  falseLabel?: string;
}

/**
 * 종류를 가리지 않고 모든 케이블이 갖는 값.
 *
 * 길이는 **설계서 공량**의 근거다(품셈 × 길이). 그래서 어느 종류든 적을 수 있어야 한다.
 */
export const COMMON_CABLE_FIELDS: readonly ValueDef[] = [
  { key: 'lengthM', label: '길이', type: 'number', unit: 'm', order: 10 },
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

/**
 * 한 종류 안에서 **서로 못 잇는 갈래** — 지금은 전원의 교류·직류뿐이다.
 *
 * 매체를 아예 둘로 나누는 길도 있었지만(`power-ac`·`power-dc`), 매체 키는 곧 케이블 그룹
 * 키라 그렇게 하면 케이블 품목까지 갈라진다 — 현장은 같은 F-CV 를 교류에도 직류에도 쓴다.
 * 갈래는 **포트가 들고**, 케이블 어휘는 하나로 둔다.
 */
export interface PortVariant {
  key: string;
  /** 화면에 붙는 말 — 「전원 입력(AC)」의 괄호 안. */
  name: string;
  /** 이 갈래에서 고를 수 있는 전압. 없으면 그 종류의 전체 목록. */
  voltages?: readonly string[];
  /** 적힌 값이 없을 때의 전압 — 현장에서 가장 흔한 것. */
  defaultVoltage?: string;
  /**
   * 이 갈래에서 고를 수 있는 **상·선식**. **없으면 그 갈래에는 이 칸이 아예 없다.**
   *
   * 직류에는 상이 없다. 칸을 종류에만 두면 직류 회로마다 빈 칸이 남고 「DC 48V 3상4선」 같은
   * 있을 수 없는 조합이 표현된다 — 갈래가 칸을 갖게 하면 그럴 자리가 생기지 않는다.
   */
  wirings?: readonly string[];
  /** 적힌 값이 없을 때의 상·선식 — 분기 회로는 거의 단상이다. */
  defaultWiring?: string;
}

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
  /**
   * 방향 없는 자리(모선 단자)에서 추적할 때 **두 답을 부르는 이름**.
   *
   * 축전지 단자처럼 방향이 없는 자리는 물음이 둘이라 답도 둘이다(`traceFlows`). 그 둘을
   * 「나에게 오는 쪽」·「내가 가는 쪽」처럼 화면이 지어 부르면, 방향이 뜻을 갖는 종류가
   * 하나 더 생겼을 때(신호의 송·수신 같은 것) 전원의 말이 그대로 쓰인다. 종류가 제 말을
   * 갖는다 — 전원은 **전원 측·부하 측**이 업계 표준이다.
   *
   * 방향을 따지지 않는 종류(`pairing: 'any'`)에는 답이 하나뿐이라 이 이름이 필요 없다.
   */
  flowLabels?: { upstream: string; downstream: string };
  /** 한 포트에 물릴 수 있는 케이블 수. `null` = 제한 없음(접지 부스바). */
  maxCables: number | null;
  /**
   * 이 종류의 갈래 — 있으면 포트가 그중 하나를 들고, **다른 갈래끼리는 잇지 못한다**.
   *
   * 전원이 그렇다: 교류 출력에 직류 입력을 물리면 장비가 망가지는데, 매체만 보던 검증은
   * 그것을 통과시켰다(전압은 케이블에 적는 사후 기록이라 규칙이 아니었다).
   */
  variants?: readonly PortVariant[];
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
 * 현장에서 쓰는 **전원 계통 값들** — 강원본부 자료(분전반 수용내역 · 전원계통도 · 현황표)
 * 전체를 훑어 **실제로 적혀 있던 값**이다. 표준 계열이라며 넓게 잡지 않는다.
 *
 * 한때 KS/IEC 계열을 통째로 실어 240sq·600A 까지 늘어놓았는데, 그런 굵기의 전선이나 그런
 * 정격의 차단기는 이 자료 어디에도 없다. 목록이 사실보다 넓으면 고르는 일이 오히려 느려지고
 * (스무 줄에서 다섯 줄을 찾는다), 「목록에 있으니 맞는 값이겠지」라는 잘못된 안심을 준다.
 * 목록에 없는 값은 「직접 입력」으로 적는다 — 그 문은 언제나 열려 있다.
 */
/**
 * 교류 전압 — **전압만.** 상·선식은 아래 `AC_WIRINGS` 가 따로 든다.
 *
 * 한때 위상까지 한 값으로 적었다(「AC 220V 3φ」). 대장 표기가 그랬고, 따로 두면 직류 회로마다
 * 빈 칸이 남고 「DC 48V 3φ」 같은 있을 수 없는 조합이 표현된다는 것이 까닭이었다. 그 걱정은
 * **갈래가 칸을 갖게 하면** 사라진다(`PortVariant.wirings`) — 직류에는 그 칸이 아예 없다.
 *
 * 한 값으로 묶어 두는 동안 두 가지를 적을 수 없었다. **선식**(3φ 가 3상3선인지 3상4선인지)과,
 * 현장에서 가장 흔한 **3상4선 380/220V**(선간 380 · 상전압 220 을 한 값으로 못 쓴다). 실제
 * 분전반 조서는 이 둘을 따로 적는다 — 「용량 200A · 규격 3상4선」.
 */
export const AC_VOLTAGES = ['AC 380/220V', 'AC 380V', 'AC 220V', 'AC 110V'] as const;

/**
 * 상·선식 — 현장 조서의 「규격」 칸이다(`3상4선` · `1상2선`).
 *
 * **회로마다 다르다.** 한 반에서 메인 인입은 3상4선인데 분기는 전부 1상2선인 것이 예사다
 * (SCADA 분전반 조서가 그렇다). 그래서 반의 성질이 아니라 회로(포트)의 값이다.
 */
export const AC_WIRINGS = ['3상4선', '3상3선', '1상2선'] as const;

/**
 * 극수 — **상·선식이 정한다.** 따로 적게 두지 않는다.
 *
 * 도면은 차단기를 「NFB#1 2P 100A」로 부른다. 그 `2P` 는 몇 가닥을 함께 끊느냐이고, 상·선식과
 * 하나로 묶여 있다. 두 칸으로 두면 「1상2선인데 4P」 같은 어긋남이 생긴다 — 유도하면 그럴 수가
 * 없다.
 */
export function polesOf(wiring: unknown): string | null {
  return wiring === '3상4선' ? '4P' : wiring === '3상3선' ? '3P' : wiring === '1상2선' ? '2P' : null;
}

/**
 * 차단기 종류 — 조서의 「Type」 칸.
 *
 * NFB(배선용차단기)와 MCCB 는 같은 것을 현장이 달리 부르는 말이라 둘 다 낸다(도면은 NFB,
 * 조서는 MCCB 로 적혀 있었다). ELB 는 누전차단기, ABS 는 개폐기다.
 */
export const BREAKER_TYPES = ['NFB', 'MCCB', 'ELB', 'ABS'] as const;
/**
 * 직류 전압 — 위상이 없다.
 *
 * 우리 자료(강원본부)에 적혀 있던 것은 **48V 뿐**(27건)이지만, 그건 자료가 통신설비 쪽이라
 * 그렇다. 변전소의 직류는 **쓰임에 따라 계통이 갈린다**:
 *   - **48V** — 통신·전송장비(ETSI/Telcordia 계열의 -48V). 우리 설비의 예사값이다.
 *   - **125V** — 차단기 트립·클로즈, 보호계전기 등 **제어전원**. 북미 유틸리티 표준이고
 *     국내 변전소 축전지반도 이 계열이다.
 *   - **110V** — 유럽·일부 레거시 계열의 제어전원.
 *   - **24V** — RTU·일부 계전기 보조 전원(산업용 제어 계열).
 * 250V 는 1940~50년대 계열이라 신설에는 쓰지 않는다 — 넣지 않는다. 220V DC 는 영국·대형
 * 송전 변전소 쪽이라 우리 범위에서 빠진다. 목록에 없는 값은 「직접 입력」으로 적는다.
 */
export const DC_VOLTAGES = ['DC 125V', 'DC 110V', 'DC 48V', 'DC 24V'] as const;
/** 둘을 합친 것 — 갈래를 모르는 자리(케이블만 보고 있을 때)가 쓴다. */
export const POWER_VOLTAGES = [...AC_VOLTAGES, ...DC_VOLTAGES] as const;

/**
 * 전선 규격(공칭 단면적, sq=mm²) — 자료에 나온 것 그대로.
 *
 * 5.5sq(101회) · 6sq(85) · 38sq(40) 이 압도적이고, 두 계열이 섞여 쓰인다(2·3.5·5.5·8·14·
 * 22·38·60 은 예전 JIS, 2.5·4·6·10·16·25·35 는 KS/IEC). 하나로 고를 수 없으니 둘 다 낸다.
 */
export const WIRE_SIZES_SQ = [
  2, 2.5, 3.5, 4, 5.5, 6, 8, 10, 14, 16, 22, 25, 35, 38, 60,
] as const;

/** 차단기 정격(A) — 자료에 나온 것 그대로. 30A(37) · 100A(24) · 50A(17) · 60A(14) 순으로 흔하다. */
export const BREAKER_AMPERES = [15, 30, 50, 60, 75, 100, 150, 225, 400] as const;

/**
 * `satisfies` 로 적는다 — 주석(`: readonly PortKind[]`)을 달면 `key` 가 `string` 으로
 * 넓어져 아래 `PortKindKey` 가 뜻을 잃는다. 시드의 품셈 표가 이 키로 **빠짐없이** 열거되게
 * 하려면 리터럴 타입이 살아 있어야 한다.
 */
export const PORT_KINDS = [
  // 전원은 공급(OUT)과 소비(IN)가 갈린다 — 출력끼리 잇는 것은 물리적으로 불가능하다.
  {
    key: 'power', name: '전원', connectsTo: ['power'], pairing: 'opposite', maxCables: 1,
    /* 전원 측(電源側)·부하 측(負荷側) — 배전 도면과 대장이 쓰는 말 그대로다. */
    flowLabels: { upstream: '전원 측', downstream: '부하 측' },
    /* 교류와 직류는 잇지 않는다 — 충전기가 교류를 받아 직류를 내보내는 것이 그 경계다. */
    variants: [
      { key: 'AC', name: 'AC', voltages: AC_VOLTAGES, defaultVoltage: 'AC 220V', wirings: AC_WIRINGS, defaultWiring: '1상2선' },
      /* 직류에는 상·선식이 없다 — `wirings` 를 안 주면 그 칸이 서지 않는다. */
      { key: 'DC', name: 'DC', voltages: DC_VOLTAGES, defaultVoltage: 'DC 48V' },
    ],
    /* 굵기는 **전원케이블 대장의 절반**이다 — 현장 대장은 「FR-5.5sq」처럼 종류와 굵기를
       붙여 적는다. 종류는 우리 케이블 품목이 이미 알고, 굵기는 적을 곳이 없었다. */
    cableFields: [
      /**
       * 도체의 **공칭 단면적**(5.5sq = 5.5mm²) — 대장은 「전원케이블 FR-5.5sq」로 적는다.
       *
       * 열 이름은 「굵기」다. 조서의 **「규격」 칸은 상·선식**(3상4선·1상2선)이라, 여기에도 그
       * 이름을 쓰면 한 표에 같은 이름의 열이 둘 선다.
       *
       * 말로는 「전선 굵기」라고도 하지만 문서에 적힐 때는 규격이다. 광의 「심선」과는 다른
       * 말이고(그건 유리섬유 가닥 수), 케이블 안에 도체가 몇 가닥인지는 「심수」(3C·4C)로
       * 또 다른 값이다 — 대장은 심수를 적지 않는다(단상 2C·삼상 4C 가 관행이라 위상에서 따라온다).
       */
      { key: 'sizeSq', label: '굵기', type: 'number', unit: 'sq', options: WIRE_SIZES_SQ, order: 40 },
    ],
    /* 차단기의 개폐 — 예전에는 피더 **자산**의 필드였는데, 개폐는 자산이 아니라
       그 회로의 상태다. 출력이 여럿인 기기(콘센트 13구 분배반)는 회로마다 따로 끊긴다.
       입력도 마찬가지다 — 배전반 주차단기, UPS·정류기의 입력 MCCB 가 다 입력 쪽에 있다.
       상대의 출력 차단기와 내 입력 차단기는 서로 다른 둘이라, 한쪽으로 대신할 수 없다. */
    /* 차단기 **용량**도 그 회로의 것이다 — 같은 판에서도 회로마다 20A·30A·50A 로 다르고
       (강릉 대장이 그렇다), 입력에도 있다(「200A AC MAIN」). 자산 필드로 두면 열세 회로가
       한 값을 나눠 갖게 된다. */
    portFields: [
      /**
       * 전압은 **포트의 것**이다 — 케이블의 것이 아니다.
       *
       * 같은 F-CV 한 가닥이 220V 회로에도 380V 회로에도 쓰인다. 전압을 정하는 것은 그 회로,
       * 곧 포트다(장비의 입력은 「DC 48V 입력」으로 고정돼 있고, 분전반의 출력은 회로마다
       * 다를 수 있다). 케이블에 적어 두었더니 한 가닥을 두 줄이 나눠 볼 때만 값이 맞아
       * 보였을 뿐, 「이 포트가 몇 V 인가」는 어디에도 없었다.
       *
       * **상·선식은 여기 없다** — 제 칸이 따로 있다(`wiring`). 한때 한 값으로 묶어 두었는데
       * (「AC 220V 3φ」), 그러면 3상3선과 3상4선을 못 가르고 3상4선 380/220V 를 적을 수가
       * 없었다. 직류에 빈 칸이 남는 걱정은 **갈래가 칸을 갖게** 해서 없앴다.
       * 고를 수 있는 값과 기본값은 갈래가 정한다(`PortVariant.voltages`·`defaultVoltage`).
       *
       * **적는 자리는 계통 표**다 — 회로 대장의 그 열이다.
       *
       * 한때 품목의 포트 선언에 못 박아 두었다(「이 장비의 전원 입력은 DC 48V」). 기기의 입력은
       * 실제로 그렇지만, **분배 회로는 그렇지 않다**: 380/220V 3상4선 반은 한 반에서 380V 3상과
       * 220V 단상을 함께 내보낸다. 선언에 못 박으면 그 흔한 반을 표현할 수가 없다.
       *
       * 그래서 **품목은 갈래(AC·DC)만** 정하고 — 그건 물리적으로 못 섞이니 품목의 성질이 맞다 —
       * 몇 V 인지는 회로마다 적는다. 포트가 생길 때는 그 갈래의 예사값이 실린다
       * (`PortVariant.defaultVoltage`) — 대개 맞고, 다르면 계통 표에서 고친다.
       */
      { key: 'voltage', label: '전압', type: 'text', options: POWER_VOLTAGES, order: 10 },
      { key: 'ampere', label: '용량', type: 'number', unit: 'A', options: BREAKER_AMPERES, order: 20 },
      /* 차례는 **현장 조서 그대로**다 — 번호 · 용량 · 규격 · Type · 부하. */
      { key: 'wiring', label: '규격', type: 'text', options: AC_WIRINGS, order: 25 },
      { key: 'breaker', label: '차단기', type: 'text', options: BREAKER_TYPES, order: 27 },
      { key: 'closed', label: '개폐', type: 'boolean', defaultValue: true, trueLabel: '투입', falseLabel: '개방' },
    ],
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
  /* 접지선도 굵기로 부른다(「IV 22sq」) — 전원과 같은 사실이라 같은 칸을 쓴다. */
  { key: 'ground', name: '접지', connectsTo: ['ground'], pairing: 'any', maxCables: null,
    cableFields: [{ key: 'sizeSq', label: '굵기', type: 'number', unit: 'sq', options: WIRE_SIZES_SQ, order: 40 }], portFields: [] },
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
export function cableFieldsFor(
  medium: string,
  opts?: { managesFiberLine?: boolean; variant?: string | null },
): ValueDef[] {
  const kind = portKind(medium);
  /* 갈래를 알면 **그 갈래가 고를 수 있는 값**만 낸다 — 직류 회로에 「AC 220V 3φ」가 뜨면
     고르는 사람이 그 목록을 믿지 않게 된다. 갈래를 모르는 자리(케이블만 보고 있을 때)는
     종류 전체 목록 그대로. */
  const variant = opts?.variant ? kind?.variants?.find((v) => v.key === opts.variant) : undefined;
  const narrow = (f: ValueDef): ValueDef =>
    variant?.voltages && f.key === 'voltage' ? { ...f, options: variant.voltages } : f;
  return [
    ...COMMON_CABLE_FIELDS,
    ...(kind?.cableFields ?? []).map(narrow),
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
export function portFieldsFor(medium: string, positions?: number | null, variantKey?: string | null): ValueDef[] {
  const kind = portKind(medium);
  if (!kind) return [];
  const fields = isMultiCorePort(positions) ? [...kind.portFields, ...(kind.coreFields ?? [])] : [...kind.portFields];
  /* 갈래를 알면 **그 갈래의 값**만 낸다 — 직류 포트에 「AC 220V 3φ」가 뜨면 목록을 믿지 않게 된다. */
  const variant = variantKey ? kind.variants?.find((v) => v.key === variantKey) : undefined;
  if (!variant) return fields;
  return fields.flatMap((f) => {
    if (f.key === 'voltage') return [{ ...f, options: variant.voltages ?? f.options, defaultValue: variant.defaultVoltage ?? f.defaultValue }];
    /* 상·선식은 **그 갈래가 가진 것만** — 직류에는 이 칸이 서지 않는다(`PortVariant.wirings`). */
    if (f.key === 'wiring') {
      return variant.wirings ? [{ ...f, options: variant.wirings, defaultValue: variant.defaultWiring ?? f.defaultValue }] : [];
    }
    return [f];
  });
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

/**
 * 몇 가닥부터 다심인가 — **질의에 쓰라고 내놓은 숫자**다.
 *
 * 판정은 `isMultiCorePort` 가 한다. 다만 DB 에 물을 때는 함수를 넣을 수 없어 숫자를 적어야
 * 하는데, 그 숫자가 서버 여기저기 흩어져 있으면 판정이 둘로 갈린다(화면은 다심이라 하고
 * 질의는 아니라 하는 자리가 생긴다). 같은 값을 나눠 쓴다.
 */
export const MULTI_CORE_MIN_POSITIONS = 2;

/** 이 포트가 심선을 여러 가닥 나르는가. `positions` 이 없거나 1이면 보통 포트다. */
export function isMultiCorePort(positions: number | null | undefined): boolean {
  return coreCount(positions) >= MULTI_CORE_MIN_POSITIONS;
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
  /** 종류 안의 갈래(전원의 AC·DC). 갈래가 없는 종류는 없다. */
  variant?: string;
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
            /* 이름은 **현장에서 부르는 그대로** — 「광 다심」은 우리끼리 쓰는 말이고,
               판에도 자료에도 적히는 이름은 OPGW 다(그 이름 패턴이 이미 그렇다). */
            name: 'OPGW', medium: kind.key, direction: 'BI' as Direction,
            groupKey: `${kind.key.toUpperCase()}-TRUNK`, namePattern: 'OPGW', positions: DEFAULT_CORE_COUNT,
          }]
        : [single];
    }
    /* `BI` 도 낸다 — **방향 없는 자리**(모선 단자)가 실제로 있다: 축전지는 단자 한 쌍으로
       충전도 방전도 오간다. 이게 없으면 그 자리를 만드는 길이 「입력을 만든 뒤 방향을
       바꾼다」는 두 걸음짜리 우회뿐이고, 그러면 묶음 키가 `POWER-IN-DC-2` 로 어긋난다.
       화면에서 고를 수 있는 것이 곧 어휘다. */
    return (['IN', 'OUT', 'BI'] as const).flatMap((direction) => {
      const label = `${kind.name} ${portDirectionLabel(direction)}`;
      // 방향이 뜻을 갖는 종류(전원)에는 다심이 없다 — 1심 고정.
      const base = { medium: kind.key, direction, positions: 1 };
      /* 갈래가 있으면 **갈래마다 하나씩** 낸다 — 「전원 입력(AC)」·「전원 입력(DC)」.
         화면에서 고를 수 있는 것이 곧 어휘이므로, 갈래도 여기서 갈라져야 만들 수 있다. */
      if (!kind.variants) {
        return [{ ...base, name: label, groupKey: `${kind.key.toUpperCase()}-${direction}`, namePattern: `${label} {n}` }];
      }
      return kind.variants.map((v) => ({
        ...base,
        name: `${label}(${v.name})`,
        groupKey: `${kind.key.toUpperCase()}-${direction}-${v.key}`,
        namePattern: `${label} {n}`,
        variant: v.key,
      }));
    });
  });
}

/** 그룹 하나를 사람 말로 부르기 위해 필요한 최소 정보. */
export interface PortGroupRef {
  group: string;
  medium: string;
  direction: Direction;
  /** 종류 안의 갈래(전원의 AC·DC) — 있으면 이름에 붙는다. */
  variant?: string | null;
  /**
   * 그 그룹 포트 하나의 이름(예: `장비 1`). 같은 종류·방향이 둘 이상일 때 이걸로 가른다.
   * 그룹 키(`A`·`B`)는 영문만 허용되는 **식별자**라 사람에게 보여 줄 이름이 못 된다.
   */
  sampleName?: string;
  /** 심선 수 — 같은 매체 안에서 성단(다심)을 앞에 세우는 데 쓴다. */
  positions?: number | null;
}

/**
 * 포트 하나 → 그 구획의 참조. **네 화면이 손으로 채우던 것**을 여기 모은다.
 *
 * 실제로 세 곳이 `variant` 를 빠뜨려, 교류 판과 직류 판이 같은 이름이 되어 이름 대신 그룹
 * 키(`POWER-IN-AC`)가 튀어나왔다. 칸이 늘면 여기만 고친다.
 */
export function groupRefOf(port: {
  group: string; medium: string; direction: Direction; name: string;
  positions?: number | null; variant?: string | null;
}): PortGroupRef {
  return {
    group: port.group, medium: port.medium, direction: port.direction,
    sampleName: port.name, positions: port.positions, variant: port.variant,
  };
}

/** 선언(포트 템플릿) → 구획 참조. 아직 포트가 없을 때(품목 편집·미리보기) 쓴다. */
export function groupRefOfTemplate(tpl: {
  group: string; medium: string; direction: Direction; namePattern: string;
  positions?: number | null; variant?: string | null;
}): PortGroupRef {
  /* 선언은 **갈래까지만** 안다 — 몇 V 인지는 놓인 회로가 안다(계통 표). 그래서 품목 화면의
     구획 이름은 「전원 출력(AC)」이고, 자산 화면에서는 「전원 출력(AC 220V 1φ)」가 된다. */
  return groupRefOf({ ...tpl, name: tpl.namePattern.replace('{n}', '1'), positions: coreCount(tpl.positions) });
}

/** 포트 이름에서 번호를 떼어 그룹 이름을 얻는다 — `장비 1` → `장비`. */
function nameBase(sample: string | undefined): string | null {
  if (!sample) return null;
  const base = sample.replace(/\s*\d+\s*$/, '').trim();
  return base.length > 0 ? base : null;
}

/**
 * 방향 없는 자리(모선 단자)에서 갈라 물은 **두 답을 부르는 이름**.
 *
 * 이름은 종류가 갖는다(`PortKind.flowLabels`) — 화면이 지어 부르면 방향이 뜻을 갖는 종류가
 * 하나 더 생겼을 때 전원의 말이 그대로 쓰인다.
 */
export function portFlowLabel(medium: string, flow: 'upstream' | 'downstream'): string {
  return portKind(medium)?.flowLabels?.[flow] ?? (flow === 'upstream' ? '들어오는 쪽' : '나가는 쪽');
}

/**
 * 포트 구획을 화면에 뭐라고 부를 것인가 — **그 포트의 이름이 먼저다.**
 *
 * 예전에는 어휘로 지어냈다: 매체 이름 + 방향(+갈래). 그래서 실제로 「UTP」·「관리」·「OPGW」
 * 라고 이름 붙인 포트들이 화면에서는 전부 「네트워크」·「광」으로 덮여, **판에 적힌 이름과
 * 화면이 부르는 이름이 달랐다.** 이름은 자료가 갖고 있는데 화면이 그것을 버린 셈이다.
 *
 * 그래서 **번호를 뗀 그 포트의 이름**을 쓴다(「광 포트 1」 → 「광 포트」). 이름이 아예 없을
 * 때만 어휘로 물러선다 — 그때는 매체 이름과, 방향이 뜻을 갖는 종류면 방향까지 붙인다.
 *
 * 괄호 안은 **갈래**다(AC·DC) — 못 잇는 것끼리 갈라 보이라고 두는 자리다. 값(전압)은 넣지
 * 않는다: 한 구획의 열 회로가 220V·380V 로 갈릴 수 있어 이름이 거짓말이 된다.
 *
 * 이름이 같은 구획이 둘이면 그때만 **순번**을 붙인다 — 그룹 키(`NETWORK-2`)는 타입 안에서
 * 유일하기만 하면 되는 식별자라 사람에게 아무 뜻이 없다.
 */
export function portGroupLabel(
  target: PortGroupRef,
  siblings: readonly PortGroupRef[],
  /**
   * 매체 키 → 현장이 쓰는 이름. **카탈로그(케이블 그룹)가 준다.**
   *
   * 포트에 이름이 없을 때만 쓰인다. 어휘의 기본 이름을 여기서 직접 읽지 않는 까닭은 그
   * 이름이 설비관리대장에서 고쳐지기 때문이다 — 판 구획은 「OPGW」, 매체 고르는 칸은
   * 「광 인입」처럼 화면마다 다른 말이 나왔다.
   */
  mediumName?: (medium: string) => string,
): string {
  const base = (g: PortGroupRef) => {
    const kind = portKind(g.medium);
    /* 이름은 **그 포트의 것**이다 — 번호만 뗀다(「광 포트 1」 → 「광 포트」). */
    const own = nameBase(g.sampleName);
    const fromVocabulary = () => {
      const name = mediumName?.(g.medium) ?? kind?.name ?? g.medium;
      /* 방향이 뜻을 갖는 종류(전원)는 입력과 출력이 다른 물건이라 방향까지 불러야 갈린다. */
      return kind?.pairing === 'opposite' ? `${name} ${portDirectionLabel(g.direction)}` : name;
    };
    const name = own ?? fromVocabulary();
    /* 괄호는 **갈래**뿐이다 — 「전원 입력(AC)」·「전원 입력(DC)」. 값(전압)은 회로마다
       다르므로 이름에 싣지 않는다: 한 구획의 열 회로가 220V·380V 로 갈리면 그 이름은
       거짓말이 된다. 몇 V 인지는 계통 표가 회로마다 말한다. */
    const variant = kind?.variants?.find((v) => v.key === g.variant);
    return `${name}${variant ? `(${variant.name})` : ''}`;
  };

  const mine = base(target);
  const tied = siblings.filter((s) => base(s) === mine);
  if (tied.length <= 1) return mine;

  /**
   * 이름이 같은 구획이 둘 이상이면 **순번**을 붙인다.
   *
   * 예전에는 그룹 키를 붙였다 — 「전원 출력(AC) POWER-OUT-AC-2」. 키는 타입 안에서 유일하기만
   * 하면 되는 식별자라 사람에게 아무 뜻이 없고, 자동으로 붙는 `-2` 는 더 그렇다.
   * 차례는 키 순서라 화면을 다시 그려도 흔들리지 않는다.
   */
  const rank = tied.map((s) => s.group).sort().indexOf(target.group) + 1;
  return `${mine} ${rank}`;
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
