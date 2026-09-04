/**
 * TraceGutter — 추적 두 그림이 **함께 쓰는 조각.**
 *
 * 거슬러 오르는 길은 레인 그래프로, 내려가는 길은 들여쓰기 트리로 그린다. 폭을 먹는 축이
 * 반대라 그림은 갈리지만(레인은 갈래에, 트리는 깊이에 약하다), **점·선·눈높이는 하나여야
 * 한다** — 안 그러면 같은 화면에 두 어법이 선다.
 *
 * 예전에는 트리를 `└`·`├` **글자**로 그렸다. 글자 이음선은 줄 사이(line-height)에서 끊겨
 * 실선이 점선처럼 보이고, 굵기와 색도 그린 선과 달랐다. 여기서는 둘 다 1px 테두리로 긋는다.
 */
import { cn } from '../../../components/ui';

/** 레인 한 칸의 폭. 좁을수록 이름 칸이 넓다 — 점과 꺾임이 보이는 최소가 이 값이다. */
export const LANE = 14;

/**
 * 마디(점)가 줄 안에서 서는 **높이**.
 *
 * 줄 한가운데가 아니라 **첫 줄(장비 이름)의 눈높이**다. 마디는 두 줄짜리라(장비/포트)
 * 가운데에 두면 점이 두 글줄 사이에 떠서 어느 줄의 것인지 안 읽힌다. 꺾이는 가로선도
 * 같은 높이에 그어야 점에 닿는다.
 */
export const NODE_Y = 11;

/**
 * 선의 색 — 트리의 옛 안내선(`border-line`)보다 **한 단 진하다.**
 *
 * 이 선들은 장식이 아니라 **구조**다: 어디서 갈라지고 어디서 합쳐지는지가 선 하나에
 * 달렸으므로, 옅으면 그림이 아무 말도 안 한다.
 */
const STROKE = 'bg-content-faint/50';

/** 마디(점)와 글씨 사이. */
const TEXT_GAP = 8;

/**
 * 거터 한 칸 — 어느 켜에 무엇이 서는가.
 *
 * 두 그림이 같은 칸으로 말한다. 합류(레인)와 갈래(트리)는 **같은 모양**이다 — 세로선이
 * 위에서 내려와 마디 켜 쪽으로 꺾인다. 다른 것은 꺾이는 쪽뿐이고, 그건 `lane` 이 마디보다
 * 오른쪽이냐 왼쪽이냐가 이미 말한다.
 */
export interface GutterCell {
  lane: number;
  /** 세로선이 위에서 내려온다. */
  fromAbove?: boolean;
  /** 세로선이 아래로 이어진다. */
  toBelow?: boolean;
  /** 마디 켜 쪽으로 가로선을 긋는다(합류·갈래). */
  toNode?: boolean;
  /** 이 칸이 마디다. */
  node?: boolean;
}

/**
 * 줄 하나 — 왼쪽에 거터, 오른쪽에 이름.
 *
 * 줄 사이에 틈을 두지 않는다(`space-y` 금지) — 2px 만 벌어져도 세로선이 끊긴다.
 * 숨통은 글자 쪽 `pb` 가 낸다.
 */
export function TraceGutterRow({
  cells, width, root, children,
}: {
  cells: readonly GutterCell[];
  /** 거터 폭 — 한 그림 안의 모든 줄이 같아야 켜가 맞는다. */
  width: number;
  /** 이 줄이 추적을 건 자리인가 — 마디를 겹동그라미로 찍는다. */
  root?: boolean;
  children: React.ReactNode;
}) {
  const nodeLane = cells.find((c) => c.node)?.lane ?? 0;
  const x = (lane: number) => lane * LANE + LANE / 2;
  /* 글씨는 이 줄이 **실제로 선을 긋는 가장 오른쪽 켜** 뒤에서 시작한다. 마디 켜만 보면
     합류하는 가로선이 글씨 밑으로 들어간다(합류는 오른쪽에서 온다). */
  const textFrom = Math.max(nodeLane, ...cells.filter((c) => c.toNode).map((c) => c.lane));
  return (
    <div className="relative flex items-start">
      {/* 거터는 줄 **위에 겹쳐** 그린다 — 글씨를 밀어내지 않아야 켜마다 다른 자리에서
          시작할 수 있다. 폭을 차지하는 칸으로 두면 모든 줄의 글씨가 같은 자리에 서서
          그림의 켜가 글씨에는 안 나타난다. */}
      <div aria-hidden className="absolute inset-y-0 left-0" style={{ width: width * LANE }}>
        {cells.map((c) => {
          const dot = c.node ? (root ? 4 : 2.5) : 0;
          return (
            <span key={c.lane}>
              {c.fromAbove && (
                <span className={cn('absolute top-0 w-px', STROKE)} style={{ left: x(c.lane), height: NODE_Y }} />
              )}
              {c.toBelow && (
                <span className={cn('absolute bottom-0 w-px', STROKE)} style={{ left: x(c.lane), top: NODE_Y }} />
              )}
              {c.toNode && (
                <span
                  className={cn('absolute h-px', STROKE)}
                  style={{
                    left: Math.min(x(c.lane), x(nodeLane)),
                    width: Math.abs(x(c.lane) - x(nodeLane)),
                    top: NODE_Y,
                  }}
                />
              )}
              {c.node && (
                /* 뿌리(나)만 겹동그라미다 — 두 그림이 같은 기호를 쓴다. */
                <span
                  className={cn('absolute rounded-full', root ? 'border-[3px] border-content-faint bg-surface' : 'bg-content-faint')}
                  style={{ left: x(c.lane) - dot, top: NODE_Y - dot, width: dot * 2, height: dot * 2 }}
                />
              )}
            </span>
          );
        })}
      </div>
      {/* 글씨는 **제 점 바로 뒤**에서 시작한다 — 켜가 깊을수록 오른쪽이라, 그림의 켜가
          글줄에도 그대로 나타난다. */}
      <div className="min-w-0 flex-1 pb-1.5 text-sm" style={{ paddingLeft: x(textFrom) + TEXT_GAP }}>
        {children}
      </div>
    </div>
  );
}
