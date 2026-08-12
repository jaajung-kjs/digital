import type { ReactNode } from 'react';
import { cn } from '../../../components/ui';
import type { V2Port } from '../../types';
import { PortGlyph, PORT_GLYPH_ASPECT } from './PortGlyph';

/**
 * 포트 점유 상태 — **케이블이 물렸는가, 아닌가.** 그 사이는 없다.
 *
 * 한때 `편도` 라는 세 번째 상태가 있었다. "내부 짝 중 한쪽만 물렸다" 는 뜻이었는데, 그건
 * 포트의 상태가 아니라 **회선의 상태**다. 피더 조명의 OUT 은 UPS 에 실제로 물려 있는데도
 * IN 이 비었다는 이유로 반쯤 물린 것처럼 그려졌다 — 그 포트에 대해 틀린 말이다.
 * 게다가 다심 인입 모델로 옮긴 뒤로는 정작 OFD 에서 걸리지 않고 피더에서만 걸렸다.
 *
 * 회선의 반대쪽이 비었다는 사실은 포트 상세의 `내부 통과` 가 말한다.
 */
export type PortState = 'empty' | 'full';

export const PORT_STATE_LABEL: Record<PortState, string> = {
  empty: '미연결',
  full: '연결',
};

/**
 * 한 줄에 놓이는 포트 수 — **6개로 고정**한다.
 *
 * 실제 판은 12구·24구처럼 6의 배수로 나오므로 6개씩 끊으면 2줄·4줄로 딱 맞아떨어진다.
 * 폭에 맡기면(`flex-wrap` 만) 패널 크기에 따라 7개가 들어갔다 5개가 들어갔다 해서 같은
 * 장비가 화면마다 다른 모양이 된다.
 *
 * 칸 폭은 **판 너비에서 나눠 갖되 상한이 있다.** 6칸이 좁은 판(상세 패널)을 정확히 채우고,
 * 넓은 판(관리 화면)에서는 상한에 걸려 더 커지지 않는다.
 *
 * 상한이 왜 필요한가: 폭을 나누기만 하면 같은 포트가 상세 패널에서 46px, 관리 화면에서
 * 85px 로 그려졌다(실측 1.85배). 두 곳이 같은 판을 보여 준다면서 크기가 다르면 미리보기가
 * 미리보기 노릇을 못 한다. 실제 커넥터는 화면 폭에 따라 커지지 않는다.
 *
 * `cqw`(컨테이너 너비의 1%)를 쓰는 이유: 칸은 **판** 너비를 기준으로 나뉘어야 하는데, 칸이
 * 속한 구획은 내용만큼만 넓다. `%` 로는 구획 너비가 기준이 되어 버린다.
 */
const PORT_GAP = 4; // px — 칸 사이
const PORTS_PER_ROW = 6;
/** 칸 하나의 최대 폭(px) — 384px 상세 패널에서 6칸이 갖는 크기다. 그 이상 커지지 않는다. */
const PORT_MAX_W = 46;
/** 한 칸 = min((판 너비 − 칸 사이 간격 전부) ÷ 6, 상한) */
const PORT_W = `min(calc((100cqw - ${(PORTS_PER_ROW - 1) * PORT_GAP}px) / ${PORTS_PER_ROW}), ${PORT_MAX_W}px)`;
/** 한 줄은 딱 6칸에서 끊는다 — 실제 판이 12구·24구라 2줄·4줄로 떨어진다. */
const ROW_MAX_W = `min(100cqw, ${PORTS_PER_ROW * PORT_MAX_W + (PORTS_PER_ROW - 1) * PORT_GAP}px)`;

export interface FaceplateSection {
  key: string;
  /**
   * 구획 이름 — 종류 어휘에서 나온다(`portGroupLabel`).
   *
   * `ReactNode` 인 이유: 종류 편집기는 이 자리에 **개수 칸**을 끼워 넣는다. 판이 곧
   * 편집기가 되면 「숫자 한 자리를 받으려고 세로로 일곱 줄」을 쓰지 않아도 된다.
   */
  label: ReactNode;
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
  isOpen,
  fill,
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
  /**
   * 이 포트의 회로가 끊겨 있는가 — 차단기가 열린 자리.
   *
   * **판은 상태를 보여 줄 뿐 조작하지 않는다.** 한때 커넥터 밑에 토글을 달았는데, 그 자리
   * 때문에 전원 포트만 키가 달라져 격자가 깨졌다. 여닫는 일은 포트를 눌렀을 때 아래에
   * 뜨는 상세가 맡는다 — 판은 지도이고 상세는 서식이다.
   */
  isOpen?: (port: V2Port) => boolean;
  /** 판이 부모가 주는 세로 자리를 다 쓴다 — 캔버스로 세울 때(관리 화면). */
  fill?: boolean;
}) {
  return (
    /* 구획을 세로로 쌓지 않고 **가로로 잇는다** — 1U 전면판이 그렇게 생겼다.
       예전에는 구획마다 한 줄을 통째로 써서 포트 6개짜리 장비가 333×287px 를 차지했다
       (포트가 실제로 쓰는 가로는 240px 뿐이라 한 줄에 다 들어간다). */
    <div
      className={cn('overflow-hidden rounded-md p-2 shadow-inner', fill && 'h-full')}
      style={{ backgroundColor: 'var(--faceplate)' }}
    >
      {/* 칸 폭의 기준이 되는 상자 — 안쪽 여백이 없어야 `100cqw` 가 곧 포트가 쓸 수 있는 너비다. */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3" style={{ containerType: 'inline-size' }}>
      {sections.map((section) => (
        /* 구분선을 두지 않는다 — 줄바꿈이 일어나면 그 선이 줄 **맨 앞**에 남아, 이미 줄이
           갈라 놓은 경계를 한 번 더 긋는 꼴이 된다. 경계는 간격과 구획 라벨이 말한다. */
        <div key={section.key} className="min-w-0">
          {/* 구획 라벨 — 색은 여기에만 쓴다. 띠 + 이름으로 무슨 구획인지 말한다. */}
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="h-3.5 w-1 rounded-sm"
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
              const open = isOpen?.(p) ?? false;
              /* 개방은 연결 여부와 다른 사실이라 함께 읽어야 한다 — "물려 있으나 끊겨 있다" */
              const stateText = `${count > 1 ? `${count}가닥` : PORT_STATE_LABEL[state]}${open ? ' · 개방' : ''}`;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  title={`${p.name} · ${stateText}`}
                  aria-label={`${labelPrefix ? `${labelPrefix} ` : ''}${p.name} ${stateText}`}
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
                  {/* 칸이 커지면 실루엣도 같이 커진다 — 높이를 못 박으면 칸만 넓어지고 그림은 그대로다. */}
                  <PortGlyph
                    medium={p.medium}
                    positions={p.positions}
                    state={state}
                    open={open}
                    className="block w-full"
                    style={{ aspectRatio: PORT_GLYPH_ASPECT }}
                  />
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
    </div>
  );
}

