import path from 'node:path';
import type { BackgroundDrawing } from '@twin/core';
import { HttpError } from '../errors.js';
import { parseDwg } from './dwg.js';

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
    default:
      throw new HttpError(
        400,
        'UNSUPPORTED_FORMAT',
        `${ext || '알 수 없는 형식'} 는 지원하지 않습니다. CAD 프로그램에서 DXF로 내보낸 뒤 올려주세요`,
      );
  }
}
