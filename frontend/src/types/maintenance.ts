export interface EquipmentPhoto {
  id: string;
  equipmentId: string;
  side: 'front' | 'rear';
  imageUrl: string;
  description?: string;
  takenAt?: string;
  createdAt: string;
}

import type { LogType, Severity, LogStatus } from './enums';
export type { LogType, Severity, LogStatus };

export interface MaintenanceLog {
  id: string;
  equipmentId: string;
  logType: LogType;
  title: string;
  description?: string;
  logDate?: string;
  severity?: Severity;
  status: LogStatus;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdByName?: string | null;
  updatedByName?: string | null;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  action: string;
  actionDetail?: string;
  changedFields: string[];
  hasSnapshot: boolean;
  userName?: string;
  createdAt: string;
}
