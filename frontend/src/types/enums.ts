/**
 * Prisma 스키마와 1:1 동기화되는 enum 정의.
 * 변경 시 backend/prisma/schema.prisma와 반드시 일치시킬 것.
 */

// schema.prisma: enum UserRole
export type UserRole = 'ADMIN' | 'VIEWER';

// schema.prisma: enum EquipmentCategory
export type EquipmentCategory =
  | 'SERVER'
  | 'NETWORK'
  | 'STORAGE'
  | 'CHARGER'
  | 'UPS'
  | 'SECURITY'
  | 'OTHER'
  | 'DISTRIBUTION_BOARD'
  | 'OFD';

// schema.prisma: enum PortType
export type PortType = 'AC' | 'DC' | 'LAN' | 'FIBER' | 'CONSOLE' | 'USB' | 'OTHER';

// schema.prisma: enum CableType
export type CableType = 'AC' | 'DC' | 'LAN' | 'FIBER' | 'GROUND';

// MaintenanceLog string fields (not Prisma enums, but validated by backend Zod schemas)
export type LogType = 'MAINTENANCE' | 'FAILURE' | 'REPAIR';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type LogStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
