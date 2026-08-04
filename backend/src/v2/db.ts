import { Prisma, PrismaClient } from '../generated/next-client/index.js';

/** v2 전용 next-client 싱글턴 (digital_next). */
export const nextDb = new PrismaClient();

/**
 * Prisma known-request-error 코드 판별 — 이 판단의 유일 지점.
 *
 * 이전에는 같은 검사가 세 파일에 두 가지 철자로 흩어져 있었다(catalog·background 의
 * 덕타이핑 지역 헬퍼, commit.service 의 인라인 instanceof). Prisma 를 소유한 이
 * 모듈에 두면 소비처가 이미 import 하고 있어 새 의존 간선 없이 가장 강한 형태
 * (instanceof)를 공유할 수 있다.
 *
 * 주요 코드: P2002 = unique 위반, P2025 = 대상 레코드 없음.
 */
export function isPrismaError(e: unknown, code: string): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;
}
