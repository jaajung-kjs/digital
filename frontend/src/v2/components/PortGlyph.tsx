/**
 * 포트 실루엣 — 종류마다 **실제 커넥터 규격의 모양**을 그린다.
 *
 * 왜 색만으로는 부족한가: 종류를 나눠 놓고 화면이 전부 같으면 나눈 의미가 없다. 케이블을
 * 꽂으려는 사람은 "무엇이 전원 포트인가" 를 판에서 바로 찾아야 하고, 들여다보는 사람도
 * 종류가 섞인 장비를 한눈에 읽을 수 있어야 한다.
 *
 * 모양은 지어내지 않았다 — 업계에서 쓰는 커넥터 규격 그대로다:
 *
 *   전원      IEC 60320 C13/C14 — 위 모서리 두 곳이 깎인 사각, 핀 3개
 *   네트워크  8P8C(RJ45)        — 사각 아래 가운데 걸림쇠 탭
 *   광        LC 듀플렉스        — 작은 사각 두 개 나란히
 *   제어      DE-9(DB9)         — D형 사다리꼴(이름부터 D-sub), 핀 9개
 *   접지      IEC 60417-5019    — 세로줄 + 아래로 짧아지는 가로줄 셋
 *
 * (NetBox 도 `DE-9`·`IEC 60320 C14`·`LC`·`8P8C` 를 커넥터 어휘로 쓰지만 모양은 그리지 않는다.
 *  "표준 포트 아이콘 세트" 라는 것은 없고, 표준은 커넥터 모양 그 자체다.)
 *
 * **구멍으로 그린다.** 실제 포트는 색 테두리로 그린 도형이 아니라 전면판에 뚫린 어두운
 * 구멍이다. 예전에는 원색 아웃라인 + 옅은 채움이라 스티커·클립아트처럼 보였다.
 *   - 비었으면 어두운 구멍만
 *   - 물렸으면 그 안에 **플러그가 꽂힌 것**처럼 종류 색이 차오른다
 *
 * 테두리와 채움이 모양을 따라가야 하므로 CSS `clip-path` 가 아니라 SVG 로 그린다
 * (clip-path 는 테두리를 잘라 내서 "비었다/찼다" 를 나타낼 수가 없다).
 */

/** 실루엣이 그려지는 좌표계 — 모든 모양이 같은 상자 안에 들어간다. */
const W = 40;
const H = 26;

/** 종류별 바깥 실루엣. 어휘에 없는 종류는 그냥 사각형. */
const OUTLINE: Record<string, string> = {
  // IEC 60320 — 위 모서리 두 곳이 깎인 사각(가전 전원 인렛의 그 모양).
  power: `M6 2 H34 L38 6 V22 Q38 24 36 24 H4 Q2 24 2 22 V6 Z`,
  // 8P8C — 사각 아래 가운데로 걸림쇠 탭이 내려온다.
  network: `M3 2 H37 Q38 2 38 3 V17 Q38 18 37 18 H26 V23 Q26 24 25 24 H15 Q14 24 14 23 V18 H3 Q2 18 2 17 V3 Q2 2 3 2 Z`,
  // DE-9 — 위가 넓은 D형 사다리꼴.
  control: `M5 4 H35 Q37 4 37.5 6 L36 20 Q35.5 22 33.5 22 H6.5 Q4.5 22 4 20 L2.5 6 Q3 4 5 4 Z`,
};

/** 실루엣 **안쪽**에 그리는 것들(핀·탭·기호). 종류를 더 확실히 갈라 준다. */
function Inner({ kind, color }: { kind: string; color: string }) {
  if (kind === 'power') {
    // 접지핀 하나 + 전원핀 둘 (IEC 인렛의 핀 배치)
    return (
      <g fill={color}>
        <rect x="18.5" y="7" width="3" height="4" rx="1" />
        <rect x="11" y="15" width="3" height="4" rx="1" />
        <rect x="26" y="15" width="3" height="4" rx="1" />
      </g>
    );
  }
  if (kind === 'network') {
    // 8핀 접점
    return (
      <g fill={color}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect key={i} x={7.5 + i * 3.2} y="5" width="1.6" height="5" rx="0.6" />
        ))}
      </g>
    );
  }
  if (kind === 'fiber') {
    // LC 듀플렉스 — 작은 사각 두 개
    return (
      <g fill="none" stroke={color} strokeWidth="1.6">
        <rect x="6" y="7" width="12" height="12" rx="1.5" />
        <rect x="22" y="7" width="12" height="12" rx="1.5" />
      </g>
    );
  }
  if (kind === 'control') {
    // DE-9 — 위 5핀, 아래 4핀
    return (
      <g fill={color}>
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={`t${i}`} cx={11 + i * 4.5} cy="10" r="1.3" />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <circle key={`b${i}`} cx={13.2 + i * 4.5} cy="16" r="1.3" />
        ))}
      </g>
    );
  }
  if (kind === 'ground') {
    // IEC 60417-5019 — 세로줄 + 아래로 짧아지는 가로줄 셋
    return (
      <g stroke={color} strokeWidth="1.8" strokeLinecap="round">
        <line x1="20" y1="4" x2="20" y2="12" />
        <line x1="12" y1="13" x2="28" y2="13" />
        <line x1="15" y1="17" x2="25" y2="17" />
        <line x1="18" y1="21" x2="22" y2="21" />
      </g>
    );
  }
  return null;
}

export interface PortGlyphProps {
  medium: string;
  /** 이 종류의 색(카탈로그 선언) — 꽂힌 플러그의 색. 없으면 중성 회색. */
  color: string | null;
  /** 물려 있으면 구멍 안이 차오른다 — "무엇인가"(모양)와 "찼는가"(채움)를 따로 읽게. */
  filled: boolean;
  /** 반만 물린 상태(내부 짝 중 한쪽만) — 테두리를 점선으로. */
  dashed?: boolean;
  className?: string;
}

export function PortGlyph({ medium, color, filled, dashed, className }: PortGlyphProps) {
  const plug = color ?? '#9aa3ad';
  const outline = OUTLINE[medium];
  // 빈 구멍은 판보다 어둡고, 꽂히면 플러그 색이 찬다.
  const fill = filled ? plug : 'var(--faceplate-hole)';
  const edge = filled ? plug : 'var(--faceplate-etch)';
  const shape = { fill, fillOpacity: filled ? 0.85 : 1, stroke: edge, strokeWidth: 1.2,
    strokeDasharray: dashed ? '3 2' : undefined };
  // 꽂힌 포트의 핀은 어둡게(플러그 위에 보이는 접점), 빈 구멍의 핀은 판 색으로 희미하게.
  const innerColor = filled ? 'var(--faceplate-hole)' : 'var(--faceplate-etch)';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden focusable="false">
      {outline ? (
        <path d={outline} {...shape} />
      ) : (
        // 접지·광처럼 바깥 실루엣이 따로 없는 것과, 어휘에 없는 종류는 공통 사각형.
        <rect x="2" y="2" width={W - 4} height={H - 4} rx="2.5" {...shape} />
      )}
      <Inner kind={medium} color={innerColor} />
    </svg>
  );
}
