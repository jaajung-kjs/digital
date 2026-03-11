export type CableType = 'AC' | 'DC' | 'LAN' | 'FIBER' | 'GROUND';

export interface EquipmentInfo {
  id: string;
  name: string;
  rackId: string | null;
  roomId: string | null;
}

/** API 응답 구조 (flat) */
export interface RoomConnection {
  id: string;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  cableType: CableType;
  label?: string;
  length?: number;
  color?: string;
  pathPoints?: [number, number][];
  description?: string;
  sourceEquipment: EquipmentInfo;
  targetEquipment: EquipmentInfo;
}
