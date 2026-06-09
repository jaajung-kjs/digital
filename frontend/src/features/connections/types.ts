export interface CableEndpointDTO {
  equipmentId: string | null;
  moduleId: string | null;
  name: string;
  floorId?: string | null;
}

export interface CableDetailDTO {
  id: string;
  source: CableEndpointDTO;
  target: CableEndpointDTO;
  cableType: string;
  label: string | null;
  length: number | null;
}
