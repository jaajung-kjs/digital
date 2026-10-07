import path from 'node:path';
import type { BackgroundDrawing } from '@twin/core';
import { HttpError } from '../errors.js';
import { parseDwg } from './dwg.js';
import { parseDgn } from './dgn.js';

/**
 * 확장자 → 파서 디스패치. **확장자를 판정하는 유일한 지점**이다.
 * 포맷이 늘어도 여기 분기 하나와 파서 모듈 하나만 추가된다.
 */
export async function parseBackground(
  buffer: Buffer,
  fileName: string,
): Promise<BackgroundDrawing> {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.dwg':
      return parseDwg(buffer, 'DWG', fileName);
    case '.dxf':
      return parseDwg(buffer, 'DXF', fileName);
    case '.dgn':
      return parseDgn(buffer, fileName);
    default:
      throw new HttpError(
        400,
        'UNSUPPORTED_FORMAT',
        ext
          ? `${ext} 파일은 지원하지 않습니다. CAD 프로그램에서 DXF로 내보낸 후 업로드하세요`
          : `지원하지 않는 파일 형식입니다. CAD 프로그램에서 DXF로 내보낸 후 업로드하세요`,
      );
  }
}
