//! DGN v8 → BackgroundDrawing JSON.
//!
//! WASM 경계는 함수 하나다. 파싱·엔티티 순회·좌표 변환·bounds 계산·직렬화를
//! 전부 여기서 끝내고 JSON 문자열 하나만 반환한다 — 객체 그래프를 경계 밖으로
//! 넘기지 않으므로 바인딩 코드가 사실상 없다.
//!
//! 관례(스펙 §4): 1 canvas unit = 1 cm, Y축 뒤집기, BYLEVEL 대체색 #404040.
//! 좌표계는 DWG 임포터(`backend/src/v2/background/dwg.ts` 의 `normalize()`)와 같다 —
//! Y 를 뒤집은 뒤 원점을 (0,0) 으로 평행이동한다. 두 포맷이 같은 캔버스에 같은
//! 렌더러로 그려지므로 원점 관례가 달라선 안 된다.

use ezdgn_core::{read_v8, V8Document, V8ElementData, V8Point};
use std::collections::BTreeSet;
use std::f64::consts::TAU;
use wasm_bindgen::prelude::*;

/// 곡선 테셀레이션 분할 수. DWG 파서와 같은 값이라 두 포맷의 곡선 밀도가 같다.
const ARC_SEGMENTS: usize = 12; // 부분 원호
const CIRCLE_SEGMENTS: usize = 24; // 전체 원/타원

/// 레벨 색상표를 해석하지 않으므로 모든 레벨은 이 색을 기본값으로 갖는다(스펙 §4).
const LEVEL_COLOR: &str = "#404040";

/// 선굵기 하한 (cm). DWG 파서 `lineweightToCm()` 과 **같은 값**이다
/// (`dwg.ts`: 음수·0·null 을 전부 0.025 로 올린다 ≈ 0.25 mm).
/// 같은 캔버스에 그려지는 두 포맷의 "가장 얇은 선"이 달라 보이면 안 된다.
const LINEWEIGHT_MIN_CM: f64 = 0.025;

/// 레벨 기본 선굵기 (cm). DWG 가 레이어 fallback 에 쓰는 값과 같다(`dwg.ts:281`).
const LEVEL_LINEWEIGHT_CM: f64 = LINEWEIGHT_MIN_CM;

/// override 로 볼 최소 굵기 차이 (cm). DWG `resolveOverride()` 와 같은 0.005 cm.
const LINEWEIGHT_EPS_CM: f64 = 0.005;

/// MicroStation 기본 색상표(index 0..255) → RGB.
///
/// **출처:** ezdgn `src/ezdgn/entities.py::_microstation_v7_default_colors()`
/// (핀 고정된 rev `a7ca903`, PyPI `ezdgn` 0.2.1 과 동일)가 만드는 256색 표를
/// 그대로 덤프했다. 지어낸 값은 하나도 없다.
///
/// DGN 파일은 자체 색상표를 가질 수 있지만 우리 리더는 v8 level/color table 을
/// 해석하지 않으므로 기본 표를 쓴다. 배경 도면 용도에서는 충분하다.
#[rustfmt::skip]
const MS_PALETTE: [[u8; 3]; 256] = [
    [255, 255, 255], [0, 0, 255], [0, 255, 0], [255, 0, 0],
    [255, 255, 0], [255, 0, 255], [255, 127, 0], [0, 255, 255],
    [64, 64, 64], [192, 192, 192], [254, 0, 96], [160, 224, 0],
    [0, 254, 160], [128, 0, 160], [176, 176, 176], [0, 240, 240],
    [240, 240, 240], [0, 0, 240], [0, 240, 0], [240, 0, 0],
    [240, 240, 0], [240, 0, 240], [240, 122, 0], [0, 240, 240],
    [240, 240, 240], [0, 0, 240], [0, 240, 0], [240, 0, 0],
    [240, 240, 0], [240, 0, 240], [240, 122, 0], [0, 225, 225],
    [225, 225, 225], [0, 0, 225], [0, 225, 0], [225, 0, 0],
    [225, 225, 0], [225, 0, 225], [225, 117, 0], [0, 225, 225],
    [225, 225, 225], [0, 0, 225], [0, 225, 0], [225, 0, 0],
    [225, 225, 0], [225, 0, 225], [225, 117, 0], [0, 210, 210],
    [210, 210, 210], [0, 0, 210], [0, 210, 0], [210, 0, 0],
    [210, 210, 0], [210, 0, 210], [210, 112, 0], [0, 210, 210],
    [210, 210, 210], [0, 0, 210], [0, 210, 0], [210, 0, 0],
    [210, 210, 0], [210, 0, 210], [210, 112, 0], [0, 195, 195],
    [195, 195, 195], [0, 0, 195], [0, 195, 0], [195, 0, 0],
    [195, 195, 0], [195, 0, 195], [195, 107, 0], [0, 195, 195],
    [195, 195, 195], [0, 0, 195], [0, 195, 0], [195, 0, 0],
    [195, 195, 0], [195, 0, 195], [195, 107, 0], [0, 180, 180],
    [180, 180, 180], [0, 0, 180], [0, 180, 0], [180, 0, 0],
    [180, 180, 0], [180, 0, 180], [180, 102, 0], [0, 180, 180],
    [180, 180, 180], [0, 0, 180], [0, 180, 0], [180, 0, 0],
    [180, 180, 0], [180, 0, 180], [180, 102, 0], [0, 165, 165],
    [165, 165, 165], [0, 0, 165], [0, 165, 0], [165, 0, 0],
    [165, 165, 0], [165, 0, 165], [165, 97, 0], [0, 165, 165],
    [165, 165, 165], [0, 0, 165], [0, 165, 0], [165, 0, 0],
    [165, 165, 0], [165, 0, 165], [165, 97, 0], [0, 150, 150],
    [150, 150, 150], [0, 0, 150], [0, 150, 0], [150, 0, 0],
    [150, 150, 0], [150, 0, 150], [150, 92, 0], [0, 150, 150],
    [150, 150, 150], [0, 0, 150], [0, 150, 0], [150, 0, 0],
    [150, 150, 0], [150, 0, 150], [150, 92, 0], [0, 135, 135],
    [135, 135, 135], [0, 0, 135], [0, 135, 0], [135, 0, 0],
    [135, 135, 0], [135, 0, 135], [135, 87, 0], [0, 135, 135],
    [135, 135, 135], [0, 0, 135], [0, 135, 0], [135, 0, 0],
    [135, 135, 0], [135, 0, 135], [135, 87, 0], [0, 120, 120],
    [120, 120, 120], [0, 0, 120], [0, 120, 0], [120, 0, 0],
    [120, 120, 0], [120, 0, 120], [120, 82, 0], [0, 120, 120],
    [120, 120, 120], [0, 0, 120], [0, 120, 0], [120, 0, 0],
    [120, 120, 0], [120, 0, 120], [120, 82, 0], [0, 105, 105],
    [105, 105, 105], [0, 0, 105], [0, 105, 0], [105, 0, 0],
    [105, 105, 0], [105, 0, 105], [105, 77, 0], [0, 105, 105],
    [105, 105, 105], [0, 0, 105], [0, 105, 0], [105, 0, 0],
    [105, 105, 0], [105, 0, 105], [105, 77, 0], [0, 90, 90],
    [90, 90, 90], [0, 0, 90], [0, 90, 0], [90, 0, 0],
    [90, 90, 0], [90, 0, 90], [90, 72, 0], [0, 90, 90],
    [90, 90, 90], [0, 0, 90], [0, 90, 0], [90, 0, 0],
    [90, 90, 0], [90, 0, 90], [90, 72, 0], [0, 75, 75],
    [75, 75, 75], [0, 0, 75], [0, 75, 0], [75, 0, 0],
    [75, 75, 0], [75, 0, 75], [75, 67, 0], [0, 75, 75],
    [75, 75, 75], [0, 0, 75], [0, 75, 0], [75, 0, 0],
    [75, 75, 0], [75, 0, 75], [75, 67, 0], [0, 60, 60],
    [60, 60, 60], [0, 0, 60], [0, 60, 0], [60, 0, 0],
    [60, 60, 0], [60, 0, 60], [60, 62, 0], [0, 60, 60],
    [60, 60, 60], [0, 0, 60], [0, 60, 0], [60, 0, 0],
    [60, 60, 0], [60, 0, 60], [60, 62, 0], [0, 45, 45],
    [45, 45, 45], [0, 0, 45], [0, 45, 0], [45, 0, 0],
    [45, 45, 0], [45, 0, 45], [45, 57, 0], [0, 45, 45],
    [45, 45, 45], [0, 0, 45], [0, 45, 0], [45, 0, 0],
    [45, 45, 0], [45, 0, 45], [45, 57, 0], [0, 30, 30],
    [30, 30, 30], [0, 0, 30], [0, 30, 0], [30, 0, 0],
    [30, 30, 0], [30, 0, 30], [30, 52, 0], [0, 30, 30],
    [30, 30, 30], [0, 0, 30], [0, 30, 0], [30, 0, 0],
    [30, 30, 0], [30, 0, 30], [192, 192, 192], [28, 0, 100],
];

/// 색상 override 를 계산한다 — 레벨 기본색과 **다를 때만** `Some`.
/// `BgPath.color`/`BgText.color` 는 BYLAYER override 슬롯이라(`backgroundTypes.ts`)
/// 레벨과 같은 색을 실으면 레벨 기본값이 죽은 데이터가 된다. DWG 도 같은 규칙이다.
///
/// `index` 는 V8 공통헤더의 `color_index` 다.
///   - 256 = BYLEVEL → 레벨 색 상속(= `None`)
///   - 257 이상 = 우리가 해석하지 않는 인코딩 → 상속
fn color_override(index: u32) -> Option<String> {
    if index > 255 {
        return None; // BYLEVEL(256) 및 미해석 인코딩
    }
    let hex = if index == 0 {
        // index 0 은 기본 색상표에서 (255,255,255) 흰색이다. MicroStation 의 기본
        // 뷰 배경이 검정이라 "전경색" 슬롯으로 쓰이는데, 이 캔버스는 밝은 배경이라
        // 흰 선은 보이지 않는다(플롯 시 MicroStation 도 검정으로 낸다).
        // 구 DWG 파서가 ACI 7 에서 같은 문제를 이미 이렇게 처리한다 —
        // `dwg.ts` `ACI_FIXED[7] = '#000000'`, 주석 "black on light bg".
        // 팔레트 표 자체는 손대지 않고 이 한 인덱스만 예외로 둔다.
        "#000000".to_string()
    } else {
        let c = MS_PALETTE[index as usize];
        format!("#{:02X}{:02X}{:02X}", c[0], c[1], c[2])
    };
    if hex.eq_ignore_ascii_case(LEVEL_COLOR) {
        None
    } else {
        Some(hex)
    }
}

/// master unit → cm 배율. ezdgn 이 master 단위로 좌표를 주므로
/// 모델 메타데이터의 단위명을 보고 cm 로 환산한다.
fn master_to_cm(unit: &str) -> f64 {
    match unit.trim().to_ascii_lowercase().as_str() {
        "m" | "meter" | "metre" | "meters" | "metres" => 100.0,
        "cm" | "centimeter" | "centimetre" => 1.0,
        "mm" | "millimeter" | "millimetre" => 0.1,
        "km" => 100_000.0,
        "in" | "inch" | "inches" => 2.54,
        "ft" | "foot" | "feet" => 30.48,
        _ => 100.0, // 미지 단위·미기재는 m 로 간주한다(DGN 기본 master unit).
    }
}

/// DGN `line_weight`(0..31) → cm.
///
/// **물리 단위 매핑의 확실한 근거는 찾지 못했다.** DGN v8 의 weight 는 표시
/// 속성(0 = 가장 얇음)일 뿐이고 실제 두께는 출력 시 펜 테이블/플롯 설정이
/// 정한다 — 파일 안에 mm·cm 환산이 들어있지 않다. 아래 계단 폭 0.0025 cm
/// (= 0.025 mm/단계, Task 5 부터 쓰던 값)는 **근사**이고 근거 있는 상수가 아니다.
/// weight 31 이 0.0775 cm(≈0.8 mm)가 되어 실무 굵기 상한 근처에 떨어진다는
/// 것 외에 이 값을 지지하는 자료는 없다.
///
/// 확실한 부분은 하한뿐이다: DWG 파서가 0 이하를 전부 0.025 cm 로 올리므로
/// (`dwg.ts` `lineweightToCm`) 같은 하한을 적용해야 두 포맷의 가장 얇은 선이
/// 같은 굵기로 그려진다. weight 0 은 실무에서 압도적 다수다.
fn weight_to_cm(w: u32) -> f64 {
    let approx = f64::from(w.min(31)) * 0.0025;
    approx.max(LINEWEIGHT_MIN_CM)
}

/// 선굵기 override — 레벨 기본값과 유의미하게 다를 때만 `Some`. DWG 와 같은 규칙.
fn lineweight_override(w: u32) -> Option<f64> {
    let cm = weight_to_cm(w);
    if (cm - LEVEL_LINEWEIGHT_CM).abs() > LINEWEIGHT_EPS_CM {
        Some(cm)
    } else {
        None
    }
}

/// 훑는 각도가 한 바퀴인가. **분할 수와 `closed` 를 같은 판정으로 묶는다** —
/// 둘이 어긋나면 24분할해 놓고 열린 경로로 내보내는 모순이 생긴다.
fn is_full_sweep(a0: f64, a1: f64) -> bool {
    ((a1 - a0).abs() - TAU).abs() < 1e-6
}

/// 타원/원호를 폴리라인으로 근사한다(master 좌표계). 한 바퀴면 24분할, 아니면 12분할.
fn tessellate(cx: f64, cy: f64, rx: f64, ry: f64, rot: f64, a0: f64, a1: f64) -> Vec<(f64, f64)> {
    let segs = if is_full_sweep(a0, a1) {
        CIRCLE_SEGMENTS
    } else {
        ARC_SEGMENTS
    };
    let (cr, sr) = (rot.cos(), rot.sin());
    (0..=segs)
        .map(|i| {
            let t = i as f64 / segs as f64;
            let a = a0 + (a1 - a0) * t;
            let (lx, ly) = (rx * a.cos(), ry * a.sin());
            (cx + lx * cr - ly * sr, cy + lx * sr + ly * cr)
        })
        .collect()
}

/// JSON 문자열 이스케이프. 도면의 문자에는 따옴표·역슬래시·제어문자가 들어올 수 있다.
fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn num(v: f64) -> String {
    if !v.is_finite() {
        return "0".to_string();
    }
    let s = format!("{:.4}", v);
    // Y 뒤집기는 0 을 -0 으로 만든다(반올림으로도 생긴다). 산술상 0 과 같지만
    // JSON.parse 가 -0 을 돌려주어 비교에서 잡음이 되므로 여기서 정규화한다.
    if s == "-0.0000" {
        "0.0000".to_string()
    } else {
        s
    }
}

/// 방출 대기 중인 경로 — 좌표는 canvas 계(cm, Y 뒤집힘)지만 아직 원점 정규화 전이다.
struct PathOut {
    level: u32,
    pts: Vec<(f64, f64)>,
    closed: bool,
    color: Option<String>,
    lineweight: Option<f64>,
}

/// 방출 대기 중인 문자 — 위와 같다.
struct TextOut {
    level: u32,
    x: f64,
    y: f64,
    text: String,
    size: f64,
    rotation: f64,
    color: Option<String>,
}

/// 좌표 누적기 — bounds 를 방출 좌표에서 계산한다.
struct Bounds {
    min_x: f64,
    min_y: f64,
    max_x: f64,
    max_y: f64,
}

impl Bounds {
    fn new() -> Self {
        Bounds {
            min_x: f64::INFINITY,
            min_y: f64::INFINITY,
            max_x: f64::NEG_INFINITY,
            max_y: f64::NEG_INFINITY,
        }
    }
    fn add(&mut self, x: f64, y: f64) {
        if x < self.min_x {
            self.min_x = x;
        }
        if y < self.min_y {
            self.min_y = y;
        }
        if x > self.max_x {
            self.max_x = x;
        }
        if y > self.max_y {
            self.max_y = y;
        }
    }
    /// 원점 이동량 `(dx, dy)` 와 이동을 **적용한** bounds.
    /// 방출되는 bounds 는 여기서 실제로 계산한 값이다 — 0 을 상수로 박지 않는다.
    /// 그래야 이동을 빠뜨렸을 때 bounds 에도 그대로 드러난다.
    /// 도형이 하나도 없으면 전부 0.
    fn normalize(&self) -> (f64, f64, Bounds) {
        if self.min_x > self.max_x {
            return (
                0.0,
                0.0,
                Bounds {
                    min_x: 0.0,
                    min_y: 0.0,
                    max_x: 0.0,
                    max_y: 0.0,
                },
            );
        }
        let (dx, dy) = (-self.min_x, -self.min_y);
        (
            dx,
            dy,
            Bounds {
                min_x: self.min_x + dx,
                min_y: self.min_y + dy,
                max_x: self.max_x + dx,
                max_y: self.max_y + dy,
            },
        )
    }
}

/// master 좌표 → canvas 좌표 (cm, Y 뒤집기). 원점 정규화는 나중에 일괄 적용한다.
fn to_canvas(p: &V8Point, scale: f64) -> (f64, f64) {
    (p.master.x * scale, -p.master.y * scale)
}

fn vertices_to_canvas(vs: &[V8Point], scale: f64) -> Vec<(f64, f64)> {
    vs.iter().map(|v| to_canvas(v, scale)).collect()
}

/// 서로 다른 점이 2개 이상인가. 임계값이 아니라 정의다 — 한 점뿐이면 선이 아니다.
fn has_two_distinct(pts: &[(f64, f64)]) -> bool {
    match pts.first() {
        Some(first) => pts.iter().any(|p| p != first),
        None => false,
    }
}

#[wasm_bindgen]
pub fn dgn_to_background(bytes: &[u8]) -> Result<String, JsValue> {
    let doc: V8Document =
        read_v8(bytes, Default::default()).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let mut bounds = Bounds::new();
    let mut levels: BTreeSet<u32> = BTreeSet::new();
    let mut paths: Vec<PathOut> = Vec::new();
    let mut texts: Vec<TextOut> = Vec::new();

    for model in &doc.models {
        // master_unit 은 파일이 기재하지 않을 수 있다(Option) — 미기재는 m 로 본다.
        let scale = master_to_cm(model.metadata.master_unit.as_deref().unwrap_or(""));

        // `model.elements` 를 전수 순회한다. 이 목록에는 Cell·ComplexChain·
        // ComplexShape·TextNode·BSplineCurve 의 **자식이 이미 들어 있으므로**
        // 컨테이너 헤더는 아무 도형도 방출하지 않고 건너뛴다. 헤더에서 다시
        // 자식을 순회하면 같은 도형이 두 번 방출된다.
        // (`model.entities()` 는 반대로 복합체 내부를 전부 버려 기하가 소실된다.)
        for e in &model.elements {
            let level = e.common.level;
            let (canvas_pts, closed) = match &e.data {
                V8ElementData::Line { start, end } => {
                    (vec![to_canvas(start, scale), to_canvas(end, scale)], false)
                }
                V8ElementData::LineString { vertices } | V8ElementData::Curve { vertices } => {
                    // Curve 는 제어점을 그대로 이은 폴리라인으로 근사한다.
                    (vertices_to_canvas(vertices, scale), false)
                }
                V8ElementData::BSplinePole { vertices } => {
                    // BSplineCurve 헤더는 좌표를 갖지 않는다 — 극점(pole)이 자식
                    // BSplinePole 로 들어온다. 제어 폴리곤을 그대로 근사로 쓴다.
                    (vertices_to_canvas(vertices, scale), false)
                }
                V8ElementData::Shape { vertices } => (vertices_to_canvas(vertices, scale), true),
                V8ElementData::Ellipse {
                    primary_axis_master,
                    secondary_axis_master,
                    rotation_radians,
                    center,
                    ..
                } => {
                    let pts = tessellate(
                        center.master.x,
                        center.master.y,
                        *primary_axis_master,
                        *secondary_axis_master,
                        rotation_radians.unwrap_or(0.0),
                        0.0,
                        TAU,
                    );
                    // Ellipse 는 항상 한 바퀴를 훑으므로 닫힌 경로다.
                    // DWG 도 CIRCLE·전체 ELLIPSE 를 `closed: true` 로 낸다
                    // (`dwg.ts:375`, `dwg.ts:403`) — 같은 소비자로 들어가므로 맞춘다.
                    (
                        pts.iter().map(|(x, y)| (x * scale, -y * scale)).collect(),
                        true,
                    )
                }
                V8ElementData::Arc {
                    start_angle_radians,
                    sweep_angle_radians,
                    primary_axis_master,
                    secondary_axis_master,
                    rotation_radians,
                    center,
                    ..
                } => {
                    let a0 = *start_angle_radians;
                    let a1 = start_angle_radians + sweep_angle_radians;
                    let pts = tessellate(
                        center.master.x,
                        center.master.y,
                        *primary_axis_master,
                        *secondary_axis_master,
                        rotation_radians.unwrap_or(0.0),
                        a0,
                        a1,
                    );
                    // 한 바퀴를 훑는 Arc 는 원이므로 닫힌 경로다. 분할 수와 같은
                    // 판정을 쓴다(DWG `dwg.ts:403` 의 전체 sweep 판정과 같은 규칙).
                    (
                        pts.iter().map(|(x, y)| (x * scale, -y * scale)).collect(),
                        is_full_sweep(a0, a1),
                    )
                }
                V8ElementData::Text {
                    origin,
                    text,
                    height_master,
                    rotation_radians,
                    ..
                } => {
                    levels.insert(level);
                    // 빈 문자열은 문자가 아니다 — 방출하면 bounds 만 부풀린다.
                    if text.is_empty() {
                        continue;
                    }
                    let (x, y) = to_canvas(origin, scale);
                    bounds.add(x, y);
                    texts.push(TextOut {
                        level,
                        x,
                        y,
                        text: text.clone(),
                        size: height_master * scale,
                        // Y 를 뒤집으면 회전 부호가 반전된다.
                        rotation: -rotation_radians.unwrap_or(0.0),
                        color: color_override(e.common.color_index),
                    });
                    continue;
                }
                // 컨테이너 헤더(Cell·ComplexChain·ComplexShape·TextNode·BSplineCurve)와
                // 미지원 엔티티(PointString·Dimension·SharedCellInstance·Unknown).
                _ => continue,
            };

            // **우리가 매핑하는 엔티티가 참조한** 레벨만 레이어가 된다. 위의
            // `_ => continue` 로 빠진 엔티티(컨테이너 헤더·미지원)의 레벨은 들어오지
            // 않는다 — v8 level table 을 해석하지 않으므로 파일의 레벨 전체는 알 수 없다.
            // 도형이 축퇴여서 방출되지 않더라도 레벨은 선언한다(그 레벨을 쓰는 엔티티는
            // 실재하므로). 그래서 path 가 0개인 레이어가 나올 수 있다.
            levels.insert(level);
            if !has_two_distinct(&canvas_pts) {
                continue;
            }
            for (x, y) in &canvas_pts {
                bounds.add(*x, *y);
            }
            paths.push(PathOut {
                level,
                pts: canvas_pts,
                closed,
                color: color_override(e.common.color_index),
                lineweight: lineweight_override(e.common.line_weight),
            });
        }
    }

    // 원점 정규화 — Y 뒤집기 이후 전체를 평행이동해 minX/minY 를 0 으로 만든다.
    // DWG 임포터의 `normalize()` 와 같은 관례라, 같은 도면을 어느 포맷으로 넣어도
    // 배경이 같은 자리에 놓인다.
    let (dx, dy, out_bounds) = bounds.normalize();

    let layers: Vec<String> = levels
        .iter()
        .map(|l| {
            format!(
                "{{\"name\":\"Level {}\",\"color\":\"{}\",\"lineweight\":{},\"linetype\":\"solid\",\"isVisible\":true}}",
                l, LEVEL_COLOR, LEVEL_LINEWEIGHT_CM
            )
        })
        .collect();

    let path_json: Vec<String> = paths
        .iter()
        .map(|p| {
            let mut flat: Vec<String> = Vec::with_capacity(p.pts.len() * 2);
            for (x, y) in &p.pts {
                flat.push(num(x + dx));
                flat.push(num(y + dy));
            }
            let mut s = format!(
                "{{\"layer\":\"Level {}\",\"points\":[{}]",
                p.level,
                flat.join(",")
            );
            if p.closed {
                s.push_str(",\"closed\":true");
            }
            if let Some(c) = &p.color {
                s.push_str(&format!(",\"color\":\"{}\"", c));
            }
            if let Some(w) = p.lineweight {
                s.push_str(&format!(",\"lineweight\":{}", num(w)));
            }
            s.push('}');
            s
        })
        .collect();

    let text_json: Vec<String> = texts
        .iter()
        .map(|t| {
            let mut s = format!(
                "{{\"layer\":\"Level {}\",\"x\":{},\"y\":{},\"text\":\"{}\",\"size\":{}",
                t.level,
                num(t.x + dx),
                num(t.y + dy),
                esc(&t.text),
                num(t.size)
            );
            if t.rotation != 0.0 {
                s.push_str(&format!(",\"rotation\":{}", num(t.rotation)));
            }
            // hAlign/vAlign 은 방출하지 않는다. MicroStation `justification`(u16) 의
            // 격자 해석을 확인할 자료를 찾지 못했다 — 틀린 정렬은 없는 정렬보다
            // 나쁘므로 렌더러 기본값(left/alphabetic)에 맡긴다.
            if let Some(c) = &t.color {
                s.push_str(&format!(",\"color\":\"{}\"", c));
            }
            s.push('}');
            s
        })
        .collect();

    Ok(format!(
        "{{\"bounds\":{{\"minX\":{},\"minY\":{},\"maxX\":{},\"maxY\":{}}},\
          \"layers\":[{}],\"paths\":[{}],\"texts\":[{}],\"filled\":[]}}",
        num(out_bounds.min_x),
        num(out_bounds.min_y),
        num(out_bounds.max_x),
        num(out_bounds.max_y),
        layers.join(","),
        path_json.join(","),
        text_json.join(",")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 팔레트 256개를 손으로 붙여넣었으므로 전사 오류를 막는 앵커를 둔다.
    /// 값의 출처는 ezdgn `_microstation_v7_default_colors()` 다(MS_PALETTE 문서 참조).
    #[test]
    fn palette_anchors_match_ezdgn() {
        assert_eq!(MS_PALETTE[0], [255, 255, 255]);
        assert_eq!(MS_PALETTE[1], [0, 0, 255]);
        assert_eq!(MS_PALETTE[3], [255, 0, 0]);
        assert_eq!(MS_PALETTE[6], [255, 127, 0]); // 표 앞부분의 고정 15색 구간
        assert_eq!(MS_PALETTE[8], [64, 64, 64]);
        assert_eq!(MS_PALETTE[14], [176, 176, 176]);
        assert_eq!(MS_PALETTE[15], [0, 240, 240]); // 밴드(intensity 240) 시작
        assert_eq!(MS_PALETTE[254], [192, 192, 192]); // 특수 슬롯 2개
        assert_eq!(MS_PALETTE[255], [28, 0, 100]);
    }

    #[test]
    fn color_override_inherits_level_color() {
        assert_eq!(color_override(256), None); // BYLEVEL
        assert_eq!(color_override(999), None); // 미해석 인코딩
        assert_eq!(color_override(8), None); // 팔레트 값이 레벨색(#404040)과 같다
    }

    #[test]
    fn color_override_emits_palette_hex() {
        assert_eq!(color_override(3), Some("#FF0000".to_string()));
        assert_eq!(color_override(9), Some("#C0C0C0".to_string()));
        // index 0 만 예외 — 밝은 배경에서 보이지 않는 흰색 대신 검정(dwg.ts ACI 7 관례).
        assert_eq!(color_override(0), Some("#000000".to_string()));
    }

    #[test]
    fn lineweight_floor_matches_dwg_and_suppresses_equal_override() {
        assert_eq!(weight_to_cm(0), LINEWEIGHT_MIN_CM);
        assert_eq!(weight_to_cm(5), LINEWEIGHT_MIN_CM); // 0.0125 < 하한
        assert_eq!(lineweight_override(0), None); // 레벨 기본값과 같다
        assert_eq!(lineweight_override(31), Some(0.0775));
    }

    #[test]
    fn tessellation_segment_counts() {
        assert_eq!(tessellate(0.0, 0.0, 1.0, 1.0, 0.0, 0.0, TAU).len(), 25);
        let half = tessellate(0.0, 0.0, 1.0, 1.0, 0.0, 0.0, std::f64::consts::PI);
        assert_eq!(half.len(), 13);
    }

    /// 분할 수와 `closed` 는 같은 판정을 써야 한다 — 24분할인데 열린 경로가 나오면 모순이다.
    #[test]
    fn full_sweep_drives_both_segment_count_and_closed() {
        assert!(is_full_sweep(0.0, TAU));
        assert!(is_full_sweep(1.0, 1.0 - TAU)); // 음수 sweep 도 한 바퀴다
        assert!(!is_full_sweep(0.0, std::f64::consts::PI));
        for (a0, a1) in [(0.0, TAU), (1.0, 1.0 - TAU), (0.0, std::f64::consts::PI)] {
            let expected = if is_full_sweep(a0, a1) {
                CIRCLE_SEGMENTS
            } else {
                ARC_SEGMENTS
            };
            assert_eq!(
                tessellate(0.0, 0.0, 1.0, 1.0, 0.0, a0, a1).len(),
                expected + 1
            );
        }
    }

    #[test]
    fn degenerate_needs_two_distinct_points() {
        assert!(!has_two_distinct(&[]));
        assert!(!has_two_distinct(&[(1.0, 2.0)]));
        assert!(!has_two_distinct(&[(1.0, 2.0), (1.0, 2.0)]));
        assert!(has_two_distinct(&[(1.0, 2.0), (1.0, 2.5)]));
    }

    #[test]
    fn esc_escapes_json_metacharacters_and_keeps_unicode() {
        assert_eq!(esc("a\"b\\c\nd\u{1}"), "a\\\"b\\\\c\\nd\\u0001");
        assert_eq!(esc("myTéxt"), "myTéxt");
    }
}
