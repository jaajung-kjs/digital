// 설비 카테고리
export type EquipmentCategory = 'SERVER' | 'NETWORK' | 'STORAGE' | 'POWER' | 'SECURITY' | 'OTHER';

// 포트 타입
export type PortType = 'AC' | 'DC' | 'LAN' | 'FIBER' | 'CONSOLE' | 'USB' | 'OTHER';

// 랙 상세 정보
export interface RackDetail {
  id: string;
  floorPlanId: string;
  name: string;
  code: string | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  totalU: number;
  frontImageUrl: string | null;
  rearImageUrl: string | null;
  description: string | null;
  sortOrder: number;
  equipmentCount: number;
  usedU: number;
  createdAt: string;
  updatedAt: string;
}

// 설비 정보
export interface Equipment {
  id: string;
  rackId: string;
  name: string;
  model: string | null;
  manufacturer: string | null;
  serialNumber: string | null;
  startU: number;
  heightU: number;
  category: EquipmentCategory;
  installDate: string | null;
  manager: string | null;
  description: string | null;
  properties: unknown;
  sortOrder: number;
  portCount: number;
  createdAt: string;
  updatedAt: string;
}

// 포트 정보
export interface Port {
  id: string;
  equipmentId: string;
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

// API 요청 타입
export interface CreateEquipmentRequest {
  name: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  startU: number;
  heightU?: number;
  category?: EquipmentCategory;
  installDate?: string;
  manager?: string;
  description?: string;
  properties?: unknown;
}

export interface UpdateEquipmentRequest {
  name?: string;
  model?: string | null;
  manufacturer?: string | null;
  serialNumber?: string | null;
  startU?: number;
  heightU?: number;
  category?: EquipmentCategory;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: unknown;
  sortOrder?: number;
}

export interface MoveEquipmentRequest {
  startU: number;
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

// 설비 카테고리 정보
export const EQUIPMENT_CATEGORIES: { value: EquipmentCategory; label: string; color: string }[] = [
  { value: 'SERVER', label: '서버', color: '#4A90D9' },
  { value: 'NETWORK', label: '네트워크', color: '#50C878' },
  { value: 'STORAGE', label: '스토리지', color: '#9B59B6' },
  { value: 'POWER', label: '전원', color: '#E67E22' },
  { value: 'SECURITY', label: '보안', color: '#E74C3C' },
  { value: 'OTHER', label: '기타', color: '#95A5A6' },
];

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

// 카테고리 색상 가져오기
export function getCategoryColor(category: EquipmentCategory): string {
  return EQUIPMENT_CATEGORIES.find((c) => c.value === category)?.color ?? '#95A5A6';
}

// 포트 타입 색상 가져오기
export function getPortTypeColor(portType: PortType): string {
  return PORT_TYPES.find((p) => p.value === portType)?.color ?? '#95A5A6';
}
