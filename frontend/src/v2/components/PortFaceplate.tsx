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
 * - 판은 짙은 회색 금속, 포트는 그보다 더 어두운 구멍. 밝은 앱 안에서 장비 그래픽만 어둡게
 *   두는 것은 장비 관리 UI 의 관례이고, "이건 설비다" 라는 신호가 가장 강하다.
 * - 색은 포트 테두리가 아니라 **구획 띠**와 꽂힌 플러그에만. 원색 아웃라인이 스티커처럼
 *   보이던 원인이 그것이었다.
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
    <div className="overflow-hidden rounded-md p-2 shadow-inner" style={{ backgroundColor: 'var(--faceplate)' }}>
      {sections.map((section, i) => (
        <div
          key={section.key}
          className={cn(i > 0 && 'mt-2 border-t pt-2')}
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
                    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:brightness-125',
                    selected && 'ring-2 ring-inset ring-primary',
                  )}
                >
                  <PortGlyph
                    medium={p.medium}
                    color={section.accent}
                    filled={state !== 'empty'}
                    dashed={state === 'half'}
                    className="h-5 w-full"
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
                      className="absolute -right-0.5 -top-0.5 rounded-full px-1 text-[0.5625rem] font-medium leading-tight text-white"
                      style={{ backgroundColor: section.accent ?? 'var(--faceplate-silk)' }}
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
 * 색은 **종류**를 뜻하고 그 이름은 구획 라벨에 적혀 있으므로, 범례는 나머지 축인
 * **채움(물려 있는가)** 만 설명하면 된다. 판마다 종류가 다르므로 특정 커넥터 모양 대신
 * 중립 사각을 쓴다 — 그러지 않으면 그 종류만 뜻하는 것처럼 읽힌다.
 */
export function PortLegend({ states, accent }: { states: readonly PortState[]; accent?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      {states.map((s) => (
        <span key={s} className="flex items-center gap-1 text-xs text-content-muted">
          <span className="rounded-sm p-0.5" style={{ backgroundColor: 'var(--faceplate)' }} aria-hidden>
            <PortGlyph medium="" color={accent ?? null} filled={s !== 'empty'} dashed={s === 'half'} className="h-3 w-5" />
          </span>
          {PORT_STATE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}
