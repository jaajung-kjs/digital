//! DGN v8 → BackgroundDrawing JSON.
//!
//! WASM 경계는 함수 하나다. 파싱·엔티티 순회·좌표 변환·bounds 계산·직렬화를
//! 전부 여기서 끝내고 JSON 문자열 하나만 반환한다 — 객체 그래프를 경계 밖으로
//! 넘기지 않으므로 바인딩 코드가 사실상 없다.
//!
//! 관례(스펙 §4): 1 canvas unit = 1 cm, Y축 뒤집기, BYLEVEL 대체색 #404040.

use ezdgn_core::{read_v8, V8Document, V8ElementData};
use std::collections::BTreeSet;
use wasm_bindgen::prelude::*;

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

/// DGN line_weight(0..31) → cm. 구 DWG 파서의 환산과 같은 규모를 쓴다.
fn weight_to_cm(w: u32) -> f64 {
    // 0 = 가장 얇은 선. 1 단계당 0.0025 cm(=0.025 mm).
    (w.min(31) as f64) * 0.0025
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
    fn finish(&self) -> (f64, f64, f64, f64) {
        if self.min_x > self.max_x {
            (0.0, 0.0, 0.0, 0.0) // 도형이 하나도 없을 때
        } else {
            (self.min_x, self.min_y, self.max_x, self.max_y)
        }
    }
}

fn num(v: f64) -> String {
    if v.is_finite() {
        format!("{:.4}", v)
    } else {
        "0".to_string()
    }
}

#[wasm_bindgen]
pub fn dgn_to_background(bytes: &[u8]) -> Result<String, JsValue> {
    let doc: V8Document =
        read_v8(bytes, Default::default()).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let mut bounds = Bounds::new();
    let mut levels: BTreeSet<u32> = BTreeSet::new();
    let mut paths: Vec<String> = Vec::new();

    for model in &doc.models {
        // master_unit 은 파일이 기재하지 않을 수 있다(Option) — 미기재는 m 로 본다.
        let scale = master_to_cm(model.metadata.master_unit.as_deref().unwrap_or(""));
        for e in &model.elements {
            let level = e.common.level;
            // 좌표: master → cm, Y 뒤집기.
            let mut pts: Vec<(f64, f64)> = Vec::new();
            if let V8ElementData::Line { start, end } = &e.data {
                pts.push((start.master.x * scale, -start.master.y * scale));
                pts.push((end.master.x * scale, -end.master.y * scale));
            }
            if pts.len() < 2 {
                continue;
            }
            levels.insert(level);
            let mut flat: Vec<String> = Vec::with_capacity(pts.len() * 2);
            for (x, y) in &pts {
                bounds.add(*x, *y);
                flat.push(num(*x));
                flat.push(num(*y));
            }
            paths.push(format!(
                "{{\"layer\":\"Level {}\",\"points\":[{}],\"lineweight\":{}}}",
                level,
                flat.join(","),
                num(weight_to_cm(e.common.line_weight))
            ));
        }
    }

    let layers: Vec<String> = levels
        .iter()
        .map(|l| {
            format!(
                "{{\"name\":\"Level {}\",\"color\":\"#404040\",\"lineweight\":0.02,\"linetype\":\"solid\",\"isVisible\":true}}",
                l
            )
        })
        .collect();

    let (min_x, min_y, max_x, max_y) = bounds.finish();
    Ok(format!(
        "{{\"bounds\":{{\"minX\":{},\"minY\":{},\"maxX\":{},\"maxY\":{}}},\
          \"layers\":[{}],\"paths\":[{}],\"texts\":[],\"filled\":[]}}",
        num(min_x),
        num(min_y),
        num(max_x),
        num(max_y),
        layers.join(","),
        paths.join(",")
    ))
}
