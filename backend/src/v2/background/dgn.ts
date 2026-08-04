/**
 * DGN v8 파서 — 커밋된 WASM 산출물을 감싼다.
 *
 * WASM 경계는 함수 하나이고 Rust 가 BackgroundDrawing 의 본체(bounds/layers/
 * paths/texts/filled)를 JSON 으로 만들어 준다. 여기서는 파일명·임포트 시각만
 * 얹는다 — 그건 Rust 가 알 수 없는 정보다.
 */
import { readFileSync } from 'node:fs';
import type { BackgroundDrawing } from '@twin/core';
import { HttpError } from '../errors.js';
import { dgn_to_background, initSync } from './wasm/dgn_background.js';

// 산출물은 wasm-pack `--target web`(ESM) 로 만든다. 백엔드가 `"type": "module"`
// 패키지라 `--target nodejs`(CommonJS) 글루는 Node 가 ESM 으로 파싱해 로드 자체가
// 실패한다. web 글루는 fetch 로 자동 로드하려 하므로 .wasm 바이트를 직접 읽어
// 동기 초기화한다 — 브라우저 API 에 의존하는 경로를 타지 않는다.
let started = false;

function ensureWasm(): void {
  if (started) return;
  initSync({ module: readFileSync(new URL('./wasm/dgn_background_bg.wasm', import.meta.url)) });
  started = true;
}

export async function parseDgn(buffer: Buffer, fileName: string): Promise<BackgroundDrawing> {
  // 초기화 실패(산출물 누락·손상)는 배포 결함이지 업로드한 파일의 잘못이 아니다.
  // try 밖에 두어 PARSE_FAILED(400) 로 잘못 귀속되지 않게 한다.
  ensureWasm();

  let json: string;
  try {
    json = dgn_to_background(buffer);
  } catch {
    // DWG 경로(dwg.ts)와 계약을 맞춘다: details 없이 던진다. ezdgn 내부 오류
    // 문자열(바이트 오프셋 등)을 클라이언트로 실어 보내지 않는다(M-4). DWG 경로도
    // 이 실패를 서버 로그로 남기지 않으므로 여기도 새 로깅 관례를 만들지 않는다.
    throw new HttpError(
      400,
      'PARSE_FAILED',
      '도면 파일을 읽을 수 없습니다. (지원되지 않는 형식이거나 손상된 파일)',
    );
  }
  const body = JSON.parse(json) as Omit<BackgroundDrawing, 'source'>;
  return {
    source: { fileName, importedAt: new Date().toISOString(), fileType: 'DGN' },
    ...body,
  };
}
