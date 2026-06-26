/**
 * Prisma 스키마와 1:1 동기화되는 enum 정의.
 * 변경 시 backend/prisma/schema.prisma와 반드시 일치시킬 것.
 */

// schema.prisma: enum UserRole
export type UserRole = 'ADMIN' | 'VIEWER';

// NOTE: AssetCategory enum was removed. Asset grouping/identity now
// derives from MaterialCategory.code (e.g. 'EQP-OFD', 'EQP-RACK'). See
// frontend/src/types/material.ts for category metadata.

// MaintenanceLog string fields (not Prisma enums, but validated by backend Zod schemas)
export type LogType = 'MAINTENANCE' | 'FAILURE' | 'REPAIR';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type LogStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
