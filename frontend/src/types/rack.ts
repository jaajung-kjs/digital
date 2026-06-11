import type { PortType } from './enums';
export type { PortType };

// 포트 정보
export interface Port {
  id: string;
  assetId: string;
  name: string;
  portType: PortType;
  portNumber: number | null;
  label: string | null;
  speed: string | null;
  connectorType: string | null;
  description: string | null;
  sortOrder: number;
  isConnected: boolean;
  createdAt: string;
  updatedAt: string;
}

// 사용 가능한 U 슬롯 범위
export interface AvailableSlotRange {
  start: number;
  end: number;
}

// API 요청 타입 (legacy — rack module endpoints use RackModule / slotIndex / slotSpan)
export interface CreateEquipmentRequest {
  name: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  installDate?: string;
  manager?: string;
  description?: string;
  properties?: unknown;
  materialCategoryId?: string;
  specParams?: unknown;
}

export interface UpdateEquipmentRequest {
  name?: string;
  model?: string | null;
  manufacturer?: string | null;
  serialNumber?: string | null;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: unknown;
  materialCategoryId?: string | null;
  specParams?: unknown;
  sortOrder?: number;
}

export interface CreatePortRequest {
  name: string;
  portType: PortType;
  portNumber?: number;
  label?: string;
  speed?: string;
  connectorType?: string;
  description?: string;
}

export interface UpdatePortRequest {
  name?: string;
  portType?: PortType;
  portNumber?: number | null;
  label?: string | null;
  speed?: string | null;
  connectorType?: string | null;
  description?: string | null;
  sortOrder?: number;
}

// 포트 타입 정보
export const PORT_TYPES: { value: PortType; label: string; color: string }[] = [
  { value: 'AC', label: 'AC 전원', color: '#E74C3C' },
  { value: 'DC', label: 'DC 전원', color: '#E67E22' },
  { value: 'LAN', label: 'LAN', color: '#3498DB' },
  { value: 'FIBER', label: '광케이블', color: '#2ECC71' },
  { value: 'CONSOLE', label: '콘솔', color: '#9B59B6' },
  { value: 'USB', label: 'USB', color: '#1ABC9C' },
  { value: 'OTHER', label: '기타', color: '#95A5A6' },
];

// 포트 타입 색상 가져오기
export function getPortTypeColor(portType: PortType): string {
  return PORT_TYPES.find((p) => p.value === portType)?.color ?? '#95A5A6';
}
