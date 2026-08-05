import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * 구조화 로그 — 운영에서 "무슨 일이 있었는지" 볼 수 있게 하는 단일 지점.
 *
 * 이 시스템은 사내망 컨테이너로 배포된다. 컨테이너 로그는 stdout 을 모으므로 파일이나
 * 외부 수집기가 필요 없다 — 한 줄에 JSON 하나(JSON Lines)면 `docker logs | jq` 로 바로
 * 걸러진다. 그래서 로깅 라이브러리를 새로 들이지 않는다(§6 YAGNI).
 *
 * 왜 필요한가: 지금까지는 500 이 나면 `console.error('[500]', err)` 한 줄뿐이라
 * **어느 요청이었는지, 누가 했는지, 무엇을 보냈는지** 알 수 없었다. 장애 신고를 받아도
 * 재현할 단서가 없다.
 *
 * 절대 싣지 않는 것: 요청 본문, 토큰, 비밀번호. 경로·상태·소요시간·사용자 id 까지만.
 */

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, event: string, fields: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields: Record<string, unknown> = {}) => emit('info', event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) => emit('warn', event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) => emit('error', event, fields),
};

/** 에러를 로그에 실을 수 있는 형태로 — 스택은 남기되 순환 참조는 피한다. */
export function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { errName: err.name, errMessage: err.message, stack: err.stack?.split('\n').slice(0, 8).join('\n') };
  }
  return { errMessage: String(err) };
}

declare global {
  namespace Express {
    interface Request {
      /** 요청 로그와 에러 로그를 잇는 열쇠 — 신고받은 시각의 요청을 찾을 때 쓴다. */
      requestId?: string;
    }
  }
}

/**
 * 요청 1건 = 로그 1줄. 응답이 끝난 뒤에 찍어야 상태코드와 소요시간을 알 수 있다.
 *
 * `/health` 는 제외한다 — 헬스체크가 몇 초마다 들어오면 로그가 그것만으로 채워져
 * 정작 봐야 할 줄이 묻힌다.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/health') return next();
  const startedAt = process.hrtime.bigint();
  req.requestId = randomUUID();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const fields = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0], // 쿼리는 토큰이 실릴 수 있어 버린다
      status: res.statusCode,
      ms: Math.round(ms),
      userId: req.user?.userId ?? null,
    };
    if (res.statusCode >= 500) log.error('request', fields);
    else if (res.statusCode >= 400) log.warn('request', fields);
    else log.info('request', fields);
  });
  next();
}
