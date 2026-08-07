import { cn } from '../../components/ui';
import { PortGlyph } from './PortGlyph';
import type { V2Port } from '../types';

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
 * 타일이 읽히는 두 축.
 *
 * - **모양 + 색 = 무슨 종류인가**. 모양은 실제 커넥터 규격(`PortGlyph` 참고), 색은 카탈로그가
 *   선언한 케이블 그룹 색이다 — 평면도가 그 색으로 선을 그리므로 **꽂는 케이블의 색이 곧
 *   포트의 색**이 된다.
 * - **채움 = 물려 있는가**. 비었으면 실루엣만, 물렸으면 그 안을 채운다.
 *
 * 예전에는 색이 점유만 뜻해서 종류가 달라도 판이 전부 똑같아 보였다. 전원 포트를 찾으려면
 * 그룹 머리말을 읽어야 했고, 종류가 섞인 장비는 한눈에 파악할 수가 없었다.
 */

/**
 * 포트 매트릭스 — 패치패널 판을 그대로 본뜬 타일 배치.
 *
 * 왜 목록이 아니라 타일인가: 포트는 `namePattern` 의 `{n}` 로 만들어지는 **번호 붙은 것**이라
 * 라벨이 짧다(반대로 컨테이너 슬롯은 사용자가 이름 지은 자산을 담으므로 행이 맞다).
 * 24개, 96개가 되면 "어디가 비었나" 를 한눈에 보는 것이 목록으로는 불가능하다.
 *
 * 열 수는 **아무도 선언하지 않는다** — `auto-fill` 이 패널 폭에 맞춰 정한다.
 * 타입마다 열 수를 적게 하면 정의하는 사람에게 짐이 되고, 패널 폭이 바뀌면 어차피 틀린다.
 */
export function PortMatrix({
  ports,
  stateOf,
  selectedPortId,
  onSelect,
  labelPrefix,
  cableCountOf,
  accent,
}: {
  ports: readonly V2Port[];
  stateOf: (port: V2Port) => PortState;
  selectedPortId: string | null;
  onSelect: (portId: string) => void;
  /**
   * 이 포트에 몇 가닥이 물려 있나 — 2 이상이면 타일에 적는다.
   *
   * 접지 부스바처럼 한 단자에 여러 가닥이 모이는 곳은 "연결됨" 만으로는 부족하다.
   * 7가닥이 모인 단자가 1가닥짜리와 똑같이 보이면 판을 봐도 아무것도 알 수 없다.
   */
  cableCountOf?: (port: V2Port) => number;
  /** 이 판의 종류 색 — 카탈로그가 선언한 케이블 그룹 색. 없으면 점유만 나타낸다. */
  accent?: string | null;
  /**
   * 읽어 주는 이름 앞에 붙일 말 — 보통 그 포트를 가진 장비 이름.
   * 한 화면에 여러 장비의 판이 함께 뜨면(랙을 눌렀을 때) "포트 1" 만으로는
   * 어느 장비인지 알 수 없다.
   */
  labelPrefix?: string;
}) {
  return (
    // 백플레인 — 안으로 들어간 판 위에 포트가 붙어 있는 모양
    <div className="rounded border border-line bg-surface-2 p-1.5 shadow-inner">
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(2.75rem, 1fr))' }}>
        {ports.map((p) => {
          const state = stateOf(p);
          const selected = p.id === selectedPortId;
          const count = cableCountOf?.(p) ?? 0;
          return (
            <button
              key={p.id}
              type="button"
              title={count > 1 ? `${p.name} · ${count}가닥` : `${p.name} · ${PORT_STATE_LABEL[state]}`}
              aria-label={`${labelPrefix ? `${labelPrefix} ` : ''}${p.name} ${count > 1 ? `${count}가닥` : PORT_STATE_LABEL[state]}`}
              aria-pressed={selected}
              onClick={() => onSelect(p.id)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 rounded py-1 tabular-nums transition-colors',
                'hover:bg-surface-3',
                // 링을 **안쪽**에 그린다 — 바깥으로 그리면(`ring-offset-1`) 타일 간격(4px)보다
                // 두꺼워져 이웃 타일을 침범했다.
                selected && 'ring-2 ring-inset ring-primary',
              )}
            >
              {/* 실루엣이 곧 포트다 — 종류(모양·색)와 점유(채움)를 함께 나타낸다.
                  번호는 실루엣 **아래**에 둔다 — 안에 겹치면 핀·기호와 뒤엉켜 둘 다 못 읽는다
                  (실제 페이스플레이트도 커넥터 옆·아래에 번호를 적는다). */}
              <PortGlyph
                medium={p.medium}
                color={accent ?? null}
                filled={state !== 'empty'}
                dashed={state === 'half'}
                className="h-5 w-full"
              />
              <span
                className={cn(
                  'text-[0.625rem] leading-none',
                  state === 'empty' ? 'text-content-faint' : 'font-medium text-content',
                )}
              >
                {p.index}
              </span>
              {/* 여러 가닥이 모이면 개수가 곧 정보다 — 점 하나로는 1가닥과 구분되지 않는다. */}
              {count > 1 && (
                <span
                  className="absolute -right-0.5 -top-0.5 rounded-full px-1 text-[0.625rem] font-medium leading-tight text-white"
                  style={{ backgroundColor: accent ?? undefined }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 채움이 무엇을 뜻하는지.
 *
 * 색은 **종류**를 뜻하고 그 이름은 판 머리말에 적혀 있으므로, 범례는 나머지 축인
 * **채움(물려 있는가)** 만 설명하면 된다. 색까지 여기서 되풀이하면 판마다 같은 줄이 붙는다.
 * 예시는 실제 판 색으로 그려야 눈이 이어진다.
 */
export function PortLegend({ states, accent }: { states: readonly PortState[]; accent?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      {states.map((s) => (
        <span key={s} className="flex items-center gap-1 text-xs text-content-muted">
          {/* 중립 사각 — 판마다 종류가 다르므로 특정 커넥터 모양을 쓰면 그 종류만 뜻하는 것처럼 읽힌다. */}
          <PortGlyph medium="" color={accent ?? null} filled={s !== 'empty'} dashed={s === 'half'} className="h-4 w-6" />
          {PORT_STATE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}
