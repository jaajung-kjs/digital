import { cn } from '../../components/ui';
import type { V2Port } from '../types';

/**
 * 포트 점유 상태.
 *
 * 내부 통과 규칙(성단 N ↔ 선로 N 등)이 있는 포트는 **짝과 함께 하나의 회선**을 이룬다.
 * 그래서 3단계가 나온다 — 광 전용 개념이 아니라 내부 짝이 있는 모든 포트에 해당한다.
 */
export type PortState = 'empty' | 'half' | 'full';

const TILE: Record<PortState, string> = {
  empty: 'border-line bg-surface text-content-faint',
  half: 'border-warning/40 bg-warning-bg text-warning',
  full: 'border-success/50 bg-success-bg text-success',
};

const LED: Record<PortState, string> = { empty: '', half: 'bg-warning', full: 'bg-success' };

export const PORT_STATE_LABEL: Record<PortState, string> = {
  empty: '미연결',
  half: '편도',
  full: '양측',
};

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
}: {
  ports: readonly V2Port[];
  stateOf: (port: V2Port) => PortState;
  selectedPortId: string | null;
  onSelect: (portId: string) => void;
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
          return (
            <button
              key={p.id}
              type="button"
              title={`${p.name} · ${PORT_STATE_LABEL[state]}`}
              aria-label={`${labelPrefix ? `${labelPrefix} ` : ''}${p.name} ${PORT_STATE_LABEL[state]}`}
              aria-pressed={selected}
              onClick={() => onSelect(p.id)}
              className={cn(
                'relative flex h-8 items-center justify-center rounded border text-xs tabular-nums transition-colors',
                TILE[state],
                // 링을 **안쪽**에 그린다 — 바깥으로 그리면(`ring-offset-1`) 타일 간격(4px)보다
                // 두꺼워져 이웃 타일을 침범했다. 점유 상태 색은 가운데에 그대로 남는다.
                selected && 'ring-2 ring-inset ring-primary font-medium',
              )}
            >
              {p.index}
              {state !== 'empty' && (
                <span className={cn('absolute right-1 top-1 size-1 rounded-full', LED[state])} aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 색이 무엇을 뜻하는지 — 색만 있고 설명이 없으면 읽을 수 없다. */
export function PortLegend({ states }: { states: readonly PortState[] }) {
  return (
    <div className="flex items-center gap-3">
      {states.map((s) => (
        <span key={s} className="flex items-center gap-1 text-xs text-content-muted">
          <span className={cn('size-2.5 rounded-sm border', TILE[s])} aria-hidden />
          {PORT_STATE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}
