import { PrismaClient } from '../generated/next-client/index.js';

/** v2 전용 next-client 싱글턴 (digital_next). */
export const nextDb = new PrismaClient();
