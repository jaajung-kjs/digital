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
 *   광        SC 심플렉스        — 사각 하우징 + 가운데 페룰(심선 **하나**)
 *   제어      DE-9(DB9)         — D형 사다리꼴(이름부터 D-sub), 핀 9개
 *   접지      IEC 60417-5019    — 세로줄 + 아래로 짧아지는 가로줄 셋
 *
 * (NetBox 도 `DE-9`·`IEC 60320 C14`·`LC`·`8P8C` 를 커넥터 어휘로 쓰지만 모양은 그리지 않는다.
 *  "표준 포트 아이콘 세트" 라는 것은 없고, 표준은 커넥터 모양 그 자체다.)
 *
 * **모양이 종류를, 채움이 연결을 말한다.**
 *
 * 종류를 가르는 일은 **모양**이 한다 — IEC·RJ45·DE-9 는 헷갈릴 수 없다. 처음에는 평면도의
 * 선 색을 포트 채움으로 옮겼는데, 선으로 고른 채도를 면에 칠하니 판마다 조합이 제각각이
 * 됐고 회색 종류는 아예 묻혔다. 종류 색은 구획 띠로 물러났다.
 *
 * 그래서 **채움은 오롯이 연결 여부**를 뜻한다. 비면 얕게 파인 빈 자리, 물리면 테마색으로
 * 꽉 찬다. 한때 채움을 거의 같게 두고 작은 LED 점 하나로만 구분했는데, 색으로 한눈에
 * 읽히지 않았다 — 판을 훑는 눈이 먼저 보는 것은 점이 아니라 면이다.
 *
 * 모든 실루엣은 **같은 상자**(x 2..38, y 3..23)를 채운다. 실제 커넥터는 크기가 저마다 다르지만
 * 판 위에 늘어놓으면 "제각각" 으로 읽힌다 — 실제로 제어(DE-9)만 세로가 18% 작고 위로
 * 치우쳐 있었다.
 *
 * 테두리와 채움이 모양을 따라가야 하므로 CSS `clip-path` 가 아니라 SVG 로 그린다
 * (clip-path 는 테두리를 잘라 내서 "비었다/찼다" 를 나타낼 수가 없다).
 */

/** 실루엣이 그려지는 좌표계 — 모든 모양이 같은 상자 안에 들어간다. */
const W = 40;
const H = 26;

/** 커넥터 실루엣의 가로:세로. 칸이 커지면 실루엣도 같이 커져야 하므로 호출부가 이 비율을 쓴다. */
export const PORT_GLYPH_ASPECT = `${W} / ${H}`;

/** 종류별 바깥 실루엣 — 모두 x 2..38, y 3..23 을 채운다. 어휘에 없는 종류는 사각형. */
const OUTLINE: Record<string, string> = {
  // IEC 60320 — 위 모서리 두 곳이 깎인 사각(가전 전원 인렛의 그 모양).
  power: `M8 3 H32 L38 9 V21 Q38 23 36 23 H4 Q2 23 2 21 V9 L8 3 Z`,
  // 8P8C — 사각 아래 가운데로 걸림쇠 탭이 내려온다.
  network: `M3 3 H37 Q38 3 38 4 V16 Q38 17 37 17 H26 V22 Q26 23 25 23 H15 Q14 23 14 22 V17 H3 Q2 17 2 16 V4 Q2 3 3 3 Z`,
  // DE-9 — 위가 넓은 D형 사다리꼴.
  control: `M5 3 H35 Q37.6 3 38 5 L35.8 21 Q35.4 23 33.4 23 H6.6 Q4.6 23 4.2 21 L2 5 Q2.4 3 5 3 Z`,
};

/** 실루엣 **안쪽**에 그리는 것들(핀·탭·기호). 종류를 더 확실히 갈라 준다. */
function Inner({ kind, color }: { kind: string; color: string }) {
  if (kind === 'power') {
    // 접지핀 하나 + 전원핀 둘 (IEC 인렛의 핀 배치)
    return (
      <g fill={color}>
        <rect x="18.5" y="7.5" width="3" height="4" rx="1" />
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
          <rect key={i} x={7.5 + i * 3.2} y="6" width="1.6" height="5" rx="0.6" />
        ))}
      </g>
    );
  }
  if (kind === 'fiber') {
    /* SC 심플렉스 — 사각 하우징 안에 페룰(원)이 하나.
       처음에는 LC 듀플렉스(작은 사각 둘)로 그렸는데, 그건 **심선 두 가닥**이 한 어댑터에
       들어간 모양이다. 우리 광 포트는 성단·선로 각각이 **심선 하나**이고 선번장 한 행이
       코어 하나이므로, 한 가닥짜리 커넥터로 그려야 뜻이 맞는다.
       (ODF 는 `SC-SX`·`LC-DX` 둘 다 나오지만 심선 단위로 관리하는 쪽은 심플렉스다.) */
    return (
      <g fill="none" stroke={color} strokeWidth="1.6">
        <rect x="13" y="6.5" width="14" height="13" rx="1.5" />
        <circle cx="20" cy="13" r="3" />
      </g>
    );
  }
  if (kind === 'control') {
    // DE-9 — 위 5핀, 아래 4핀
    return (
      <g fill={color}>
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={`t${i}`} cx={11 + i * 4.5} cy="10.5" r="1.3" />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <circle key={`b${i}`} cx={13.2 + i * 4.5} cy="16.5" r="1.3" />
        ))}
      </g>
    );
  }
  if (kind === 'ground') {
    // IEC 60417-5019 — 세로줄 + 아래로 짧아지는 가로줄 셋
    return (
      <g stroke={color} strokeWidth="1.8" strokeLinecap="round">
        <line x1="20" y1="5" x2="20" y2="12" />
        <line x1="12" y1="13.5" x2="28" y2="13.5" />
        <line x1="15" y1="17" x2="25" y2="17" />
        <line x1="18" y1="20.5" x2="22" y2="20.5" />
      </g>
    );
  }
  return null;
}

export interface PortGlyphProps {
  medium: string;
  /** 물려 있는가 — `'half'` 는 내부 짝 중 한쪽만 물린 상태. */
  state?: 'empty' | 'half' | 'full';
  className?: string;
  style?: React.CSSProperties;
}

export function PortGlyph({ medium, state = 'empty', className, style }: PortGlyphProps) {
  const outline = OUTLINE[medium];
  const filled = state !== 'empty';
  const shape = {
    // 빈 자리는 판보다 살짝 어두운 얕은 홈, 물린 자리는 테마색으로 꽉 찬다.
    fill: filled ? 'var(--primary)' : 'var(--faceplate-etch)',
    fillOpacity: state === 'half' ? 0.5 : 1,
    stroke: filled ? 'var(--primary)' : 'var(--faceplate-hole)',
    strokeWidth: 1,
    // 편도는 반만 물린 것 — 테두리를 끊어 "아직 한쪽" 임을 알린다.
    strokeDasharray: state === 'half' ? '3 2' : undefined,
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} style={style} aria-hidden focusable="false">
      {outline ? (
        <path d={outline} {...shape} />
      ) : (
        // 접지·광처럼 바깥 실루엣이 따로 없는 것과, 어휘에 없는 종류는 공통 사각형.
        <rect x="2" y="3" width={W - 4} height="20" rx="2.5" {...shape} />
      )}
      {/* 핀·기호는 판 색으로 — 채움 위에서 파인 것처럼 보이게. */}
      <Inner kind={medium} color="var(--faceplate)" />
    </svg>
  );
}
