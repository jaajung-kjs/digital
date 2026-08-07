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
 *   광        SC 심플렉스        — 키 홈이 팬 사각 어댑터 + 가운데 페룰(심선 **하나**)
 *   광 인입   다심 케이블 단면    — 원형 인입구 + 그 안의 코어 여럿
 *   제어      DE-9(DB9)         — D형 사다리꼴(이름부터 D-sub), 핀 9개
 *   접지      나사 단자          — 육각 볼트 머리 + 가운데 구멍
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
 * 모든 실루엣은 **같은 높이**(y 3..23)를 채우고 세로 가운데가 맞는다. 실제로 제어(DE-9)만
 * 세로가 18% 작고 위로 치우쳐 "제각각" 으로 읽혔다. 가로 폭은 커넥터마다 다를 수 있다 —
 * 실제 전면판이 그렇고, 높이와 중심만 맞으면 나란히 놓았을 때 흐트러지지 않는다.
 *
 * **바깥 실루엣이 곧 커넥터 단면이다.** 일반 사각형을 두르고 그 안에 그림을 넣으면 안 된다 —
 * 그 사각형은 실물에 없는 것이라 테두리가 두 겹으로 보이고(광), 아이콘을 상자에 담아 놓은
 * 모양이 된다(접지). 실제로 그 둘만 그렇게 그려져 있었다.
 *
 * 테두리와 채움이 모양을 따라가야 하므로 CSS `clip-path` 가 아니라 SVG 로 그린다
 * (clip-path 는 테두리를 잘라 내서 "비었다/찼다" 를 나타낼 수가 없다).
 */

/** 실루엣이 그려지는 좌표계 — 모든 모양이 같은 상자 안에 들어간다. */
const W = 40;
const H = 26;

/** 커넥터 실루엣의 가로:세로. 칸이 커지면 실루엣도 같이 커져야 하므로 호출부가 이 비율을 쓴다. */
export const PORT_GLYPH_ASPECT = `${W} / ${H}`;

/** 종류별 바깥 실루엣 — 모두 y 3..23 을 채우고 세로 가운데가 맞는다. 어휘에 없는 종류는 사각형. */
const OUTLINE: Record<string, string> = {
  // IEC 60320 — 위 모서리 두 곳이 깎인 사각(가전 전원 인렛의 그 모양).
  power: `M8 3 H32 L38 9 V21 Q38 23 36 23 H4 Q2 23 2 21 V9 L8 3 Z`,
  // 8P8C — 사각 아래 가운데로 걸림쇠 탭이 내려온다.
  network: `M3 3 H37 Q38 3 38 4 V16 Q38 17 37 17 H26 V22 Q26 23 25 23 H15 Q14 23 14 22 V17 H3 Q2 17 2 16 V4 Q2 3 3 3 Z`,
  // DE-9 — 위가 넓은 D형 사다리꼴.
  control: `M5 3 H35 Q37.6 3 38 5 L35.8 21 Q35.4 23 33.4 23 H6.6 Q4.6 23 4.2 21 L2 5 Q2.4 3 5 3 Z`,
  // SC 어댑터 — 위쪽 가운데가 키 홈으로 파인 사각. 이 사각이 곧 커넥터다(안에 또 두르지 않는다).
  fiber: `M11 3 H17 V6 H23 V3 H29 Q31 3 31 5 V21 Q31 23 29 23 H11 Q9 23 9 21 V5 Q9 3 11 3 Z`,
  /* 다심 인입 — 케이블이 통째로 들어오는 원형 인입구. 어댑터(사각)가 아니라 **구멍**이라
     동그랗다. 안에 코어가 여럿 보이는 것이 단심 광(SC, 페룰 하나)과 갈리는 지점이다. */
  'fiber-trunk': `M30 13 A10 10 0 1 1 10 13 A10 10 0 1 1 30 13 Z`,
  // 접지 나사 단자 — 육각 볼트 머리. 데이터 포트가 아니므로 사각이 아니다.
  ground: `M31.5 13 L25.8 23 H14.2 L8.5 13 L14.2 3 H25.8 Z`,
};

/** 다심 인입 안에 보이는 코어 — 실제 광케이블 단면의 그 배치(가운데 하나 + 둘레 여섯). */
const TRUNK_CORES: readonly [number, number][] = [
  [20, 13], [25.2, 13], [22.6, 17.5], [17.4, 17.5], [14.8, 13], [17.4, 8.5], [22.6, 8.5],
];

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
    /* 어댑터 안으로 들여다보이는 페룰(원). 하우징은 바깥 실루엣이 이미 그리고 있다.
       처음에는 LC 듀플렉스(작은 사각 둘)로 그렸는데, 그건 **심선 두 가닥**이 한 어댑터에
       들어간 모양이다. 우리 광 포트는 장비·선로 각각이 **심선 하나**다. */
    return <circle cx="20" cy="13" r="4" fill="none" stroke={color} strokeWidth="1.8" />;
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
  if (kind === 'fiber-trunk') {
    // 코어 일곱은 실제 심선 수가 아니라 "여러 가닥" 이라는 표시다 — 24개를 그리면 뭉개진다.
    return (
      <g fill={color}>
        {TRUNK_CORES.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="1.5" />
        ))}
      </g>
    );
  }
  if (kind === 'ground') {
    // 볼트 가운데의 나사 구멍. 접지 기호(IEC 60417-5019)는 상자에 담아 놓은 아이콘이 되므로
    // 쓰지 않는다 — 무엇인지는 구획 라벨과 색 띠가 말한다.
    return <circle cx="20" cy="13" r="4" fill="none" stroke={color} strokeWidth="1.8" />;
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
