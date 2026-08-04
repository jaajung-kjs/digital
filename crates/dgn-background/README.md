# dgn-background

DGN v8 → `BackgroundDrawing` JSON 변환기. `ezdgn-core`(Rust)를 WASM 으로 감싼다.

## 재빌드

산출물(`backend/src/v2/background/wasm/`)은 **저장소에 커밋되어 있다.** 컨테이너
빌드는 Rust 툴체인도 네트워크도 필요 없다. 이 크레이트나 ezdgn rev 를 바꿨을 때만
아래를 실행하고 산출물을 함께 커밋한다.

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
cd crates/dgn-background
wasm-pack build --release --target web --out-dir ../../backend/src/v2/background/wasm
cd ../..
rm -f backend/src/v2/background/wasm/{package.json,.gitignore,README.md}
```

`package.json` 은 반드시 지운다 — 남기면 npm 워크스페이스가 유령 패키지로 인식한다.
`.gitignore` 도 지운다 — 산출물을 커밋해야 한다.
`README.md` 는 wasm-pack 이 **이 파일을 out-dir 로 복사한 것**이다(크레이트 README).
백엔드 트리에 Rust 크레이트 문서가 섞이고 프로덕션 이미지까지 따라가므로 지운다.

산출물은 정확히 이 4개여야 한다:
`dgn_background.js` · `dgn_background.d.ts` · `dgn_background_bg.wasm` · `dgn_background_bg.wasm.d.ts`

## 왜 `--target web` 인가

백엔드는 `"type": "module"` 패키지다. `--target nodejs` 글루는 CommonJS
(`exports.x = ...` / `require('fs')` / `__dirname`)라 Node 가 이를 ESM 으로 파싱해
`does not provide an export named 'dgn_to_background'` 로 로드 자체가 실패한다
(out-dir 의 `package.json` 을 지우면 CJS 로 되돌릴 방법도 없다).
`--target web` 글루는 순수 ESM 이고, `initSync({ module })` 로 `.wasm` 바이트를
직접 넘기면 `fetch` 같은 브라우저 API 경로를 타지 않는다 —
`backend/src/v2/background/dgn.ts` 가 그렇게 초기화한다.

## 산출물이 `dist` 로 복사되는 경로

`tsc` 는 `.wasm`·글루 `.js` 를 emit 하지 않는다. `backend/package.json` 의 `build`
스크립트가 `cp -R src/v2/background/wasm dist/v2/background/wasm` 로 복사한다
(`src/generated` 와 같은 방식). 산출물 파일 구성을 바꾸면 이 스크립트도 확인한다.

## ezdgn 고정

`Cargo.toml` 이 git rev 를 핀으로 고정한다(`ezdgn-core` 는 crates.io 에 없다).
`Cargo.lock` 도 커밋해 전이 의존성까지 재현 가능하게 둔다.
rev 를 올릴 때는 `backend/src/v2/__tests__/background.dgn.test.ts` 가 통과하는지 확인한다.
