export type CableType = 'AC' | 'DC' | 'LAN' | 'FIBER' | 'GROUND';

export interface Cable {
  id: string;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  cableType: CableType;
  label?: string;
  length?: number;
  color?: string;
  pathPoints?: [number, number][];
  description?: string;
}

export interface EquipmentInfo {
  id: string;
  name: string;
  rackId: string | null;
  roomId: string | null;
}

export interface RoomConnection {
  cable: Cable;
  sourceEquipment: EquipmentInfo;
  targetEquipment: EquipmentInfo;
}
