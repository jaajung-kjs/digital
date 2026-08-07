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
 * - **포트에는 색을 칠하지 않는다.** 실제 장비의 포트는 종류와 무관하게 전부 같은 어두운
 *   구멍이고, 연결 상태는 포트 옆 **LED** 로 본다. 종류를 가르는 일은 모양이 한다.
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
      className="flex flex-wrap items-start gap-x-3 gap-y-2 overflow-hidden rounded-md p-2 shadow-inner"
      style={{ backgroundColor: 'var(--faceplate)' }}
    >
      {sections.map((section, i) => (
        <div
          key={section.key}
          className={cn('min-w-0', i > 0 && 'border-l pl-3')}
          style={i > 0 ? { borderColor: 'var(--faceplate-etch)' } : undefined}
        >
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

          {/* 포트는 촘촘히 — 실제 전면판이 그렇다. */}
          <div className="flex flex-wrap gap-x-1 gap-y-1.5">
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
                  className={cn(
                    'relative flex w-10 flex-col items-center gap-0.5 rounded-sm p-0.5 transition-colors',
                    disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:brightness-95',
                    selected && 'ring-2 ring-inset ring-primary',
                  )}
                >
                  <span className="relative w-full">
                    <PortGlyph medium={p.medium} filled={state !== 'empty'} className="block h-5 w-full" />
                    {/* LED — 실제 장비가 연결 상태를 알리는 방식. 종류 색과 섞이지 않게 따로 쓴다. */}
                    {state !== 'empty' && (
                      <span
                        className="absolute right-0 top-0 size-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            state === 'half' ? 'var(--faceplate-led-half)' : 'var(--faceplate-led)',
                        }}
                        aria-hidden
                      />
                    )}
                  </span>
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

/**
 * 채움이 무엇을 뜻하는지.
 *
 * 종류는 **모양**과 구획 라벨이 말하므로, 범례는 나머지 축인 **연결 상태(LED)** 만 설명한다.
 * 판마다 종류가 다르므로 특정 커넥터 모양 대신 중립 사각을 쓴다 — 그러지 않으면 그 종류만
 * 뜻하는 것처럼 읽힌다.
 */
export function PortLegend({ states }: { states: readonly PortState[] }) {
  return (
    <div className="flex items-center gap-3">
      {states.map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-xs text-content-muted">
          {/* 타일과 **같은 비율**로 그린다 — 다른 상자에 넣으면 실루엣이 찌그러져 범례가 딴 모양이 된다. */}
          <span className="relative block rounded-sm p-0.5" style={{ backgroundColor: 'var(--faceplate)' }} aria-hidden>
            <PortGlyph medium="" filled={s !== 'empty'} className="block h-[0.9rem] w-[1.6rem]" />
            {s !== 'empty' && (
              <span
                className="absolute right-0.5 top-0.5 size-1 rounded-full"
                style={{ backgroundColor: s === 'half' ? 'var(--faceplate-led-half)' : 'var(--faceplate-led)' }}
              />
            )}
          </span>
          {PORT_STATE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}
