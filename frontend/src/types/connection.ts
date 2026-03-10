export type CableType = 'AC' | 'DC' | 'LAN' | 'FIBER' | 'GROUND';

export interface Cable {
  id: string;
  sourcePortId: string;
  targetPortId: string;
  cableType: CableType;
  label?: string;
  length?: number;
  color?: string;
  pathPoints?: [number, number][];
  description?: string;
}

export interface PortInfo {
  id: string;
  name: string;
  portType: string;
  equipmentId: string;
  equipmentName: string;
}

export interface RoomConnection {
  cable: Cable;
  sourcePort: PortInfo;
  targetPort: PortInfo;
}
