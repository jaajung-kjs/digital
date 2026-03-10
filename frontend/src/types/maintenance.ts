export interface EquipmentPhoto {
  id: string;
  equipmentId: string;
  side: 'front' | 'rear';
  imageUrl: string;
  description?: string;
  takenAt?: string;
  createdAt: string;
}

export type LogType = 'MAINTENANCE' | 'FAILURE' | 'REPAIR' | 'INSPECTION';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type LogStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface MaintenanceLog {
  id: string;
  equipmentId: string;
  logType: LogType;
  title: string;
  description?: string;
  severity?: Severity;
  status: LogStatus;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}
