export interface AssetFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'month' | 'select';
  required?: boolean;
  options?: string[];
  group?: string;
  unit?: string;
}

export interface AssetType {
  id: string;
  code: string;
  name: string;
  group: string | null;
  isContainer: boolean;
  fieldTemplate: AssetFieldDef[] | null;
  requiredToCreate: string[] | null;
  iconName: string | null;
  displayColor: string | null;
  placementKind: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Asset {
  id: string;
  substationId: string;
  assetTypeId: string;
  assetType: {
    id: string;
    code: string;
    name: string;
    group: string | null;
    displayColor: string | null;
    fieldTemplate: AssetFieldDef[] | null;
    /**
     * 배치형 종류 식별자 — 백엔드 `/workingcopy` 응답에 포함.
     * DB 원시값은 'RACK' | 'OFD' | 'DIST' | 'GROUNDING' | 'HVAC' (DIST=분전반 약어).
     * 평면도 매핑 시 assetToEquipment 가 EquipmentKind('DISTRIBUTION') 로 정규화한다.
     * 현황 대장 등 비배치 사용처에서는 없을 수 있어 optional.
     */
    placementKind?: string | null;
  };
  name: string;
  parentAssetId: string | null;
  floorId: string | null;
  roomText: string | null;
  attributes: Record<string, unknown> | null;
  installDate: string | null;
  warrantyUntil: string | null;
  replaceDue: string | null;
  manager: string | null;
  description: string | null;
  status: string | null;
  sortOrder: number;
  updatedAt: string;

  // ── 배치(placement) 필드 — 평면도에 배치된 Asset 에만 채워진다 (SSOT-2b). ──
  // 현황 대장 등 비배치 사용처에서는 set 하지 않아도 컴파일되도록 optional.
  positionX?: number | null;
  positionY?: number | null;
  width2d?: number | null;
  height2d?: number | null;
  rotation?: number | null;
  /** RACK 설비의 슬롯 수. RACK 외에는 null. */
  totalU?: number | null;
  /** 랙 자식(모듈) 의 슬롯 위치/길이. */
  slotIndex?: number | null;
  slotSpan?: number | null;
}

export interface CreateAssetInput {
  substationId: string;
  assetTypeId: string;
  name: string;
  roomText?: string | null;
  attributes?: Record<string, unknown> | null;
}

export interface UpdateAssetInput {
  assetTypeId?: string;
  name?: string;
  roomText?: string | null;
  attributes?: Record<string, unknown> | null;
  installDate?: string | null;
  manager?: string | null;
  status?: string | null;
  warrantyUntil?: string | null;
  replaceDue?: string | null;
}
