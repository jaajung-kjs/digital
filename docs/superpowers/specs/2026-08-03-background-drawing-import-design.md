# 배경 도면 임포트 설계 (이월 기능 ②)

날짜: 2026-08-03
상태: 초안

## 1. 배경

Stage 7(구코드 제거)에서 DWG 임포트 서비스를 삭제했다. **렌더링 절반은 이미 v2에 존재한다** — `frontend/src/v2/canvas/backgroundRenderer.ts`의 `renderBackgroundDrawing()`을 `FloorPlanView.tsx:400-407`이 이미 호출하고 있고, `Floor.backgroundDrawing Json?` · `backgroundOpacity Float @default(0.5)` 컬럼도 스키마에 남아 있다. **없는 것은 파서·엔드포인트·UI 트리거뿐이다.**

**조사 결과**

- 구 파서 `backend/src/services/dwgImport.service.ts`(1,119줄)는 커밋 `0fc01c63`에서 삭제됨. `git show 0fc01c63~1:...`로 복구 가능
- 구 파서의 출력 타입은 현 `backgroundTypes.ts`와 **동일**(v2가 그 형상을 포팅해 왔음). 구 코드 의존은 `config/prisma`·`utils/errors` 둘뿐이고 나머지는 WASM + 순수 기하/색상 변환
- WASM 의존 `@mlightcad/libredwg-web`은 2차 감사 정리 때 package.json에서 제거됨 — 재추가 필요
- 층은 **조직(org) 엔티티**다. `orgRouter`가 `POST /org/floors`·`PATCH /org/floors/:id`·`DELETE /org/floors/:id`를 제공하며 **즉시 쓰기**다(워킹카피 커밋 채널이 아님)
- `backgroundOpacity`는 렌더러가 읽지만(`?? 0.4`) v2에 쓰는 경로가 없다
- 로컬 `plan/*.dwg` 5개는 전부 AC1018(AutoCAD 2004) — LibreDWG가 가장 안정적으로 읽는 버전

## 2. 포맷 지원 범위와 근거

### 네이티브 지원: DWG · DXF · DGN v8

DGN 지원은 **스파이크로 실증한 뒤** 범위에 넣었다. 검증 내용:

| 검증 항목 | 결과 |
|---|---|
| ezdgn V8 해독 정확도 (GDAL autotest 샘플 + ODA 생성 정답 CSV, 34개 엔티티 전수) | 개수·순서 1:1, `level`·`color_index`·`line_weight`·`line_style` **34/34 완전 일치**, 문자 4/4 일치(비ASCII 포함) |
| `ezdgn-core` → `wasm32-unknown-unknown` 컴파일 | 성공 |
| Node에서 실제 V8 파일 구동 | rc=0, instantiate 1.7ms / parse 5.8ms / 메모리 1.3MB |
| 산출물 크기 | 780KB (gzip 198KB) |
| 유일한 결손 | 공유 셀 이름 1건 (upstream 문서화된 미지원 항목) |

### 기각한 대안

| 대안 | 기각 사유 |
|---|---|
| Aspose.CAD 상용 | $799~. API가 "CAD → PNG/PDF/SVG 렌더링"이라 벡터 엔티티 그래프를 주지 않아 SVG 재파싱이 필요하고 그 과정에서 레이어·선종류가 손실된다. 62MB WASM. **돈을 써도 품질이 더 낮다** |
| GDAL(gdal3.js) | 무료 DGN 드라이버는 **v7 전용**. v8 드라이버는 비공개 ODA Teigha 필수. 출력이 GIS 피처라 색·선굵기·문자 정렬이 손실 |
| 레이어 선택 UI (구 시스템의 `advanced` 모드) | 배경 도면은 "설비 배치의 밑그림"이라 빠른 반영이 중요하다. 레이어 정리가 필요하면 CAD 쪽에서 하는 편이 정확하다. 파싱 결과 임시 보관/재파싱과 선택 UI가 통째로 사라진다 |
| 구 `ImportOptions.scaleMmPerUnit` | 구 코드가 이미 "1 canvas unit = 1 cm 관례하에 무시됨, 프론트가 안 보내면 제거"라고 표시해 둔 죽은 필드 |

### 미지원 포맷 처리

`.dwg`·`.dxf`·`.dgn` 외 확장자는 **400과 함께 구체적 대안을 안내**한다. 막연한 "지원하지 않는 형식"이 아니라 `"{ext}는 지원하지 않습니다. CAD 프로그램에서 DXF로 내보낸 뒤 올려주세요"` 형태로 다음 행동을 알려준다. DXF는 CAD 업계 공용 교환 포맷이라 이 안내만으로 사실상 모든 CAD 도구가 커버된다.

## 3. 아키텍처

### 파서 계약 — 단일 판단 지점

```ts
// backend/src/v2/background/parse.ts
export async function parseBackground(
  buffer: Buffer,
  fileName: string,
): Promise<BackgroundDrawing>
```

확장자 판정과 파서 선택이 **여기 한 곳에서만** 일어난다(§6 서약: 판단 지점 1개). 파서 모듈은 이 계약 뒤에 숨고, 포맷이 늘어도 이 파일의 분기 하나와 모듈 하나만 추가된다.

각 파서는 **DB를 모르는 순수 함수**다. 저장은 라우트가 한다 — 구 파서가 prisma를 직접 import 하던 구조를 답습하지 않는다.

### 타입의 집

`BackgroundDrawing` 계열 타입은 현재 `frontend/src/v2/canvas/backgroundTypes.ts`에만 있다. 백엔드가 같은 타입을 필요로 하므로 **`@twin/core`로 옮긴다**(공유 순수 패키지의 존재 이유가 이것이다). 프론트는 `@twin/core`에서 import 하고, `frontend/src/v2/types.ts:27`의 인라인 import 경로도 함께 바꾼다. 타입을 백엔드에 복제하지 않는다.

### 파일 구조

| 경로 | 책임 |
|---|---|
| `packages/core/src/backgroundTypes.ts` | `BackgroundDrawing`·`BgLayer`·`BgPath`·`BgText`·`BgFilled` (이동) |
| `backend/src/v2/background.routes.ts` | 업로드·삭제 엔드포인트 |
| `backend/src/v2/background/parse.ts` | 확장자 → 파서 디스패치 |
| `backend/src/v2/background/dwg.ts` | LibreDWG 경로 (구 파서 이식) |
| `backend/src/v2/background/dgn.ts` | ezdgn WASM 로더 + 호출 |
| `crates/dgn-background/` | Rust 크레이트 (저장소 루트) |
| `backend/src/v2/background/wasm/` | 빌드 산출물 커밋 (`.wasm` + glue) |

`org.routes.ts`(180줄)는 4종 조직의 일반 CRUD 스켈레톤이다. 여기에 multipart 파싱 엔드포인트를 끼워 넣으면 그 대칭이 깨지므로 별도 라우터를 쓴다.

## 4. 백엔드

### 엔드포인트

**`POST /api/v2/floors/:id/background`** — `authenticate` + `adminOnly`, multer 단일 파일 필드 `file`

- 허용 확장자 `.dwg` · `.dxf` · `.dgn` (대소문자 무시)
- 크기 상한 **50MB** (도면은 사진보다 크다)
- 층 존재 검증 → 파싱 → `floor.backgroundDrawing` 저장 → **갱신된 floor 행 반환**
- 파싱 실패 400 `PARSE_FAILED`, 미지원 확장자 400 `UNSUPPORTED_FORMAT`(위 안내 문구 포함), 초과 413 `FILE_TOO_LARGE`, 층 없음 404
- **원본 파일은 저장하지 않는다.** 파싱 결과 JSON만 보관한다 — 원본을 남길 이유(재파싱·다운로드)가 현재 없고, 남기면 uploads 볼륨 관리 대상이 하나 늘어난다

**`DELETE /api/v2/floors/:id/background`** — `authenticate` + `adminOnly`

- `backgroundDrawing`을 `null`로 설정, 갱신된 floor 반환

### 저장 시점: 즉시 쓰기

층은 조직 엔티티이고 조직 편집은 이미 즉시 반영이다. **사진과 달리 워킹카피 커밋 채널을 쓰지 않는다** — 사진은 자산에 속한 레코드라 자산 편집 세션과 함께 움직여야 했지만, 배경 도면은 층의 속성이고 자산 편집과 무관하다. 커밋 채널에 넣으면 조직 편집과 자산 편집의 경계가 흐려진다.

프론트는 성공 후 워킹카피 쿼리를 무효화해 갱신된 `floors`를 받는다.

### 좌표·단위 변환 (두 파서 공통)

- **1 canvas unit = 1 cm** (기존 관례). DWG는 mm ÷ 10, DGN은 모델 메타데이터의 master unit에서 cm로 환산
- **Y축 뒤집기** — CAD는 Y가 위, canvas는 아래
- `bounds`는 방출한 좌표에서 누적 계산
- `lineweight`·`dashArray`·문자 `size`는 전부 **cm** 단위로 방출(렌더러가 zoom으로 px 환산)

### DGN 파서 (`dgn.ts` + Rust 크레이트)

WASM 경계는 **함수 하나**다:

```rust
#[wasm_bindgen]
pub fn dgn_to_background(bytes: &[u8]) -> Result<String, JsValue>
```

파싱·엔티티 순회·원호 테셀레이션·색상 매핑·Y축 뒤집기·bounds 계산을 전부 Rust 안에서 끝내고 `BackgroundDrawing` JSON 문자열 하나를 반환한다. JS는 `JSON.parse` 한 줄이다. 객체 그래프를 경계 밖으로 넘기지 않으므로 바인딩 코드가 사실상 없고, 우리 `BackgroundDrawing`이 이미 평평한 배열 구조(`points: number[]`)라 직렬화에 잘 맞는다.

**의존성**: `ezdgn-core`는 crates.io에 없으므로 git rev 핀(`a7ca903d383dfb88b5b62c1535a38f21e093d848`)으로 가져온다. 빌드는 개발 머신에서만 일어나고 산출물을 커밋하므로 **폐쇄망 배포에 영향이 없다**.

**빌드와 산출물 커밋**

```bash
# 개발 머신에서 1회 (네트워크 필요)
cd crates/dgn-background
wasm-pack build --release --target web --out-dir ../../backend/src/v2/background/wasm
```

`--target nodejs`가 아니라 `--target web`이다 — 백엔드는 `"type": "module"` 패키지라
`nodejs` 타깃의 CJS 글루(`exports.x = ...` / `require('fs')` / `__dirname`)를 Node가
ESM으로 파싱해 로드 자체가 실패한다. `web` 타깃 글루는 순수 ESM이고
`initSync({ module })`로 `.wasm` 바이트를 직접 넘겨 `fetch` 같은 브라우저 API 경로를
타지 않는다(`crates/dgn-background/README.md` §"왜 --target web 인가" 참조).

`wasm-pack`이 `.wasm` · `.js` 글루 · `.d.ts`를 out-dir에 생성하며 **이 산출물을 저장소에 커밋한다.** 컨테이너 빌드는 Rust 툴체인도 네트워크도 필요 없다. 재빌드가 필요한 경우(크레이트 수정, ezdgn rev 갱신)를 위해 위 명령을 `crates/dgn-background/README.md`에 기록한다. `wasm-pack`이 생성하는 `package.json`은 out-dir에 남기지 않는다 — 백엔드 워크스페이스에 유령 패키지가 잡힌다.

스파이크에서 확인했듯 `cfb` → `web-time` → `js-sys` 경로 때문에 wasm-bindgen 자리표시자 import가 생기는데(CFB 타임스탬프용, 읽기 경로에서 미호출), wasm-bindgen 글루를 정식 생성하면 이 자리표시자가 치환되어 사라진다. **스텁으로 우회하지 않는다** — 스파이크에서 스텁이 동작한 것은 검증 편의였을 뿐, 미호출 가정이 깨지는 순간 조용히 잘못된 값을 반환한다.

**엔티티 매핑**

| ezdgn V8 | BackgroundDrawing |
|---|---|
| `Line`·`LineString` | `BgPath` |
| `Shape` | `BgPath { closed: true }` |
| `Arc`·`Ellipse` | 테셀레이션 → `BgPath`. **분할 수는 구 DWG 파서와 동일하게 맞춘다 — 부분 원호 12분할, 전체 원/타원 24분할.** 두 포맷의 곡선 밀도가 달라 보이면 안 된다 |
| `Text` | `BgText` (원점·회전·정렬·높이) |
| `Cell`·`ComplexChain`·`ComplexShape` | 자식 순회하여 위 규칙 적용 |
| `Curve`·`BSplineCurve` | 제어점 폴리라인 근사 → `BgPath` |
| `Dimension`·`PointString`·`SharedCellInstance` | 생략 |

**심볼로지 매핑**

- `common.level` → 레이어. **DGN v8 level name table은 미해석**이므로 이름은 `Level {n}`으로 합성한다
- `color_index` → MicroStation 기본 256색 팔레트로 RGB 변환. 팔레트는 **Rust 크레이트에 정적 배열로 내장**한다(구 DWG 파서가 ACI 팔레트를 상수 테이블로 가진 것과 같은 형태). `256`은 BYLEVEL 관례인데 level 색상표가 없으므로 **기본 색 `#404040`으로 대체**한다
- `line_weight` → cm, `line_style` → dashArray (표준 스타일 표)

### DWG/DXF 파서 (`dwg.ts`)

구 파서를 이식한다. 변경점만:

- `prisma` import 제거 — 순수 함수로 만든다
- `NotFoundError`·`ValidationError` → v2 `HttpError`
- `ImportOptions`(`mode`·`layers`·`includeOutline`·`includeLabels`·`scaleMmPerUnit`) **전부 제거** — 단일 임포트로 확정했으므로 죽은 옵션이다
- **WASM 경로 해석 주석은 반드시 함께 옮긴다.** 구 코드가 `createRequire`로 패키지 main 엔트리를 통해 WASM 디렉터리를 찾은 것은 (a) dist/src 경로 차이로 고정 상대경로가 컨테이너에서 `/`로 해석되는 문제 (b) libredwg-web의 `exports` 허용목록이 `./package.json` 직접 resolve를 막는 문제 — 둘 다 실제로 겪은 배포 함정이다

`@mlightcad/libredwg-web`을 백엔드 의존성에 재추가한다.

### 동기 파싱의 이벤트 루프 점유

WASM 파싱은 동기라 파싱 동안 Node 이벤트 루프를 막는다. 27KB 샘플은 5.8ms지만 수 MB 실무 도면은 수 초가 될 수 있다.

**v1은 이를 수용하고 문서화한다.** 근거: 관리자 전용이고 층당 한 번 있는 드문 조작이며, 구 시스템도 인라인 파싱이었다. **먼저 실측한다** — 실제 도면에서 문제가 되면 그때 `worker_threads`로 옮긴다. 측정 없이 워커를 먼저 만드는 것은 YAGNI 위반이다.

## 5. 프론트엔드

- `frontend/src/v2/api.ts`에 `uploadBackground(floorId, file)` · `deleteBackground(floorId)` 추가. multipart는 기존 `uploadPhoto`와 동일한 `Content-Type: undefined` 관례를 따른다(주석의 이유도 동일하게 적용됨)
- **트리거 위치는 `FloorPlanView`의 층 탭 바**(`FloorPlanView.tsx:1007-1012). 활성 층에 대해 동작하므로 층 선택 UI 옆이 자연스럽다
  - 관리자에게만 노출
  - `<input type="file" accept=".dwg,.dxf,.dgn">` + 버튼 (사진 업로드와 동일한 숨김 input 패턴, 비동기 이전 `e.currentTarget` 선취 관례 포함)
  - 업로드 중 버튼 비활성 + "임포트 중…" 표시
  - 성공 시 워킹카피 쿼리 무효화 → 캔버스 자동 재렌더(렌더 경로는 이미 존재하므로 추가 배선 없음)
  - 활성 층에 배경이 있을 때만 "배경 제거" 노출
- 에러는 `apiErrorMessage`(단일 번역 지점) 경유
- **UI 작업 전 `frontend/src/components/ui/CONVENTIONS.md`를 읽고 공용 컴포넌트(`Button`·`IconButton`)를 재사용한다.** 일회용 `<div className>` 카드/버튼을 만들지 않는다

## 6. 테스트

**픽스처**

- DWG: 기존 `plan/A08평면도B1.dwg`(AC1018, 0.2MB) 중 하나를 테스트 픽스처로 커밋
- DGN v8: GDAL autotest의 `test_dgnv8.dgn`(27,648 bytes, SHA-256 `8f32f87c…`). GDAL은 MIT 계열 라이선스이며 **출처 커밋과 SHA를 픽스처 README에 기록**한다

**백엔드**

- 디스패치: `.dwg`·`.dxf`·`.dgn`이 각 파서로 가고, `.pdf` 등은 400 `UNSUPPORTED_FORMAT` + 안내 문구 포함
- DWG 픽스처 파싱 → `layers`·`paths` 비어 있지 않음, `bounds`가 유한값, 좌표가 cm 규모
- DGN 픽스처 파싱 → 엔티티가 `paths`/`texts`로 방출되고 문자에 `myTéxt` 포함(비ASCII 왕복 검증), 레이어 이름이 `Level 64` 형태
- 권한: 비관리자 403, 미인증 401
- 층 없음 404, 크기 초과 413
- `DELETE` → `backgroundDrawing`이 `null`이 되고 갱신된 행 반환
- 픽스처는 공유 `sweepTestFixtures` 규약을 따른다

**프론트엔드**

- 관리자에게 임포트 버튼 노출, 비관리자에게 미노출
- 파일 선택 → API 호출 → 성공 시 워킹카피 무효화
- 실패 시 `apiErrorMessage` 문구 표시
- 배경이 있는 층에서만 제거 버튼 노출, 클릭 시 삭제 API 호출

## 7. 비목표

- **DGN level name table 해석** — 레이어 이름은 `Level {n}`
- **채움(해치)** — DGN 경로에서 `BgFilled` 미방출 (DWG 경로는 구 파서의 기존 지원 유지)
- **B-spline 정밀 곡선** — 제어점 폴리라인 근사
- **공유 셀(shared cell)** — upstream 미지원
- **레이어 선택 UI** — §2에서 기각
- **`backgroundOpacity` 조절 UI** — 스키마 기본값(0.5)·렌더러 fallback(0.4)만 사용. 별건
- **DGN 쓰기·원본 파일 보관·재파싱**
- **DGN v7** — 실무 파일이 v8이라는 전제. v7이 나오면 ezdgn이 이미 읽으므로 분기 하나로 추가 가능

## 8. 남은 위험

| 위험 | 완화 |
|---|---|
| **실제 대형 도면 미검증.** 스파이크 샘플은 27KB 합성본이다. 실무 평면도(수 MB)에서의 성능·미지원 엔티티 비율은 미지수 | 실제 DGN 파일을 확보하는 즉시 측정한다. 상한(50MB)과 ezdgn의 내장 리소스 상한이 폭주를 막는다 |
| **ezdgn 성숙도** — v0.2.1, 채택 사례 적음 | ODA 정답 대조로 34/34 검증했고, upstream이 퍼징·CI·리소스 상한을 갖췄다. 실패해도 400으로 처리되며 다른 포맷 경로에 영향이 없다 |
| **동기 파싱의 이벤트 루프 점유** | §4에 기술. 실측 후 필요시 `worker_threads` |
