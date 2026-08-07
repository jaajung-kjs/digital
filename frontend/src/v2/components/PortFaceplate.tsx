import { cn } from '../../components/ui';
import type { V2Port } from '../types';
import { PortGlyph } from './PortGlyph';

/**
 * 포트 점유 상태.
 *
 * 내부 통과 규칙(성단 N ↔ 선로 N 등)이 있는 포트는 **짝과 함께 하나의 회선**을 이룬다.
 * 그래서 3단계가 나온다 — 광 전용 개념이 아니라 내부 짝이 있는 모든 포트에 해당한다.
 */
export type PortState = 'empty' | 'half' | 'full';

export const PORT_STATE_LABEL: Record<PortState, string> = {
  empty: '미연결',
  half: '편도',
  full: '양측',
};

/**
 * 한 줄에 놓이는 포트 수 — **6개로 고정**한다.
 *
 * 실제 판은 12구·24구처럼 6의 배수로 나오므로 6개씩 끊으면 2줄·4줄로 딱 맞아떨어진다.
 * 폭에 맡기면(`flex-wrap` 만) 패널 크기에 따라 7개가 들어갔다 5개가 들어갔다 해서 같은
 * 장비가 화면마다 다른 모양이 된다.
 *
 * 칸 폭·간격은 클래스가 아니라 **이 숫자에서** 나온다. 최대 폭(6칸)을 이 둘로 계산하는데
 * 클래스에도 따로 적혀 있으면 한쪽만 바꿨을 때 줄이 조용히 7개가 된다.
 */
const PORT_W = 40; // px — 타일 한 칸
const PORT_GAP = 4; // px — 칸 사이
const PORTS_PER_ROW = 6;
const ROW_MAX_W = PORTS_PER_ROW * PORT_W + (PORTS_PER_ROW - 1) * PORT_GAP;

export interface FaceplateSection {
  key: string;
  /** 구획 이름 — 종류 어휘에서 나온다(`portGroupLabel`). */
  label: string;
  /** 이 구획의 종류 색(카탈로그 선언). 없으면 중성 회색. */
  accent: string | null;
  ports: readonly V2Port[];
}

/**
 * 장비 전면판 — 포트 판은 "웹 카드" 가 아니라 **설비 그 자체**로 보여야 한다.
 *
 * 예전에는 그룹마다 밝은 라운드 박스를 하나씩 두고 그 안에 원색 아웃라인 도형을 띄엄띄엄
 * 놓았다. 그러면 아무리 커넥터 모양을 정확히 그려도 "아이콘 넉 장을 카드 넉 장에 나눠 담은
 * 것" 으로 읽힌다 — 실제 장비는 **전면판 한 장**에 구멍이 뚫려 있는 것이다.
 *
 * 그래서 바꾼 것:
 * - 장비 하나에 판 **한 장**. 구획은 박스가 아니라 판 위의 구분선 + 실크스크린 라벨.
 * - 판은 **밝은** 회색, 포트는 어두운 구멍. 물리감은 이 **대비**에서 나오지 판을 검게
 *   만드는 데서 나오지 않는다 — 밝은 상세 패널 안의 검은 덩어리는 그냥 튄다(한 번 그렇게
 *   만들어 보고 되돌렸다).
 * - **채움 = 연결 여부.** 비면 얕게 파인 빈 자리, 물리면 테마색으로 꽉 찬다. 한때 LED 점
 *   하나로만 구분했는데 색으로 한눈에 읽히지 않았다 — 판을 훑는 눈은 점보다 면을 먼저 본다.
 *   종류를 가르는 일은 **모양**이 한다.
 * - 종류 색은 **구획 띠**에만 — 2px. 평면도의 선 색을 면에 칠하면 판마다 조합이 제각각이
 *   되고, 회색 종류는 아예 묻힌다.
 * - 포트는 촘촘히 붙인다. 실제 페이스플레이트가 그렇다.
 * - 번호는 작고 흐리게 — 실크스크린이지 본문 글자가 아니다.
 */
export function PortFaceplate({
  sections,
  stateOf,
  cableCountOf,
  selectedPortId,
  onSelect,
  labelPrefix,
  disabledPortIds,
}: {
  sections: readonly FaceplateSection[];
  stateOf: (port: V2Port) => PortState;
  cableCountOf?: (port: V2Port) => number;
  selectedPortId: string | null;
  onSelect: (portId: string) => void;
  /**
   * 읽어 주는 이름 앞에 붙일 말 — 보통 그 포트를 가진 장비 이름.
   * 한 화면에 여러 장비의 판이 함께 뜨면(랙을 눌렀을 때) "포트 1" 만으로는
   * 어느 장비인지 알 수 없다.
   */
  labelPrefix?: string;
  /** 고를 수 없는 포트(피커에서 가득 찬 자리) — 자리는 지키되 누를 수 없다. */
  disabledPortIds?: ReadonlySet<string>;
}) {
  return (
    /* 구획을 세로로 쌓지 않고 **가로로 잇는다** — 1U 전면판이 그렇게 생겼다.
       예전에는 구획마다 한 줄을 통째로 써서 포트 6개짜리 장비가 333×287px 를 차지했다
       (포트가 실제로 쓰는 가로는 240px 뿐이라 한 줄에 다 들어간다). */
    <div
      className="flex flex-wrap items-start gap-x-6 gap-y-3 overflow-hidden rounded-md p-2 shadow-inner"
      style={{ backgroundColor: 'var(--faceplate)' }}
    >
      {sections.map((section) => (
        /* 구분선을 두지 않는다 — 줄바꿈이 일어나면 그 선이 줄 **맨 앞**에 남아, 이미 줄이
           갈라 놓은 경계를 한 번 더 긋는 꼴이 된다. 경계는 간격과 구획 라벨이 말한다. */
        <div key={section.key} className="min-w-0">
          {/* 구획 라벨 — 색은 여기에만 쓴다. 띠 + 이름으로 무슨 구획인지 말한다. */}
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="h-3 w-0.5 rounded-full"
              style={{ backgroundColor: section.accent ?? 'var(--faceplate-silk)' }}
              aria-hidden
            />
            <span className="text-xs" style={{ color: 'var(--faceplate-silk)' }}>
              {section.label}
            </span>
          </div>

          {/* 포트는 촘촘히 — 실제 전면판이 그렇다. 한 줄 6개에서 끊는다(포트가 6개 미만인
              구획은 그만큼만 차지하므로 옆 구획이 바로 이어 붙는다). */}
          <div
            className="flex flex-wrap"
            style={{ maxWidth: ROW_MAX_W, columnGap: PORT_GAP, rowGap: PORT_GAP + 2 }}
          >
            {section.ports.map((p) => {
              const state = stateOf(p);
              const selected = p.id === selectedPortId;
              const count = cableCountOf?.(p) ?? 0;
              const disabled = disabledPortIds?.has(p.id) ?? false;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  title={count > 1 ? `${p.name} · ${count}가닥` : `${p.name} · ${PORT_STATE_LABEL[state]}`}
                  aria-label={`${labelPrefix ? `${labelPrefix} ` : ''}${p.name} ${count > 1 ? `${count}가닥` : PORT_STATE_LABEL[state]}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(p.id)}
                  style={{ width: PORT_W }}
                  className={cn(
                    'relative flex flex-col items-center gap-0.5 rounded-sm p-0.5 transition-colors',
                    disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:brightness-95',
                    selected && 'ring-2 ring-inset ring-primary',
                  )}
                >
                  {/* 채움이 곧 연결 표시다 — 점 하나보다 면이 먼저 읽힌다. */}
                  <PortGlyph medium={p.medium} state={state} className="block h-5 w-full" />
                  {/* 실크스크린 번호 — 작고 흐리게. 포트보다 시선을 끌면 안 된다. */}
                  <span
                    className="text-[0.5625rem] leading-none tabular-nums"
                    style={{ color: 'var(--faceplate-silk)' }}
                  >
                    {p.index}
                  </span>
                  {count > 1 && (
                    <span
                      className="absolute -right-1 -top-1 rounded-full px-1 text-[0.5625rem] font-medium leading-tight text-white"
                      style={{ backgroundColor: 'var(--faceplate-led)' }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

