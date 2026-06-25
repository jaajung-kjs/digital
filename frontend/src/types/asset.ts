export interface AssetFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'month' | 'select';
  required?: boolean;
  options?: string[];
  group?: string;
  unit?: string;
}

/** 자산 구조 역할 — 분류 단일 소스. 직접 비교(=== 'ofd')로 분류한다. */
export type AssetRole = 'rack' | 'ofd' | 'panel' | 'slot' | 'feeder' | 'standalone' | 'device';

export interface AssetType {
  id: string;
  code: string;
  name: string;
  role: AssetRole;
  categoryId: string | null;
  isContainer: boolean;
  fieldTemplate: AssetFieldDef[] | null;
  requiredToCreate: string[] | null;
  iconName: string | null;
  displayColor: string | null;
  sortOrder: number;
  isActive: boolean;
  laborType: string | null;
  installHoursPerUnit: number | null;
  removeHoursPerUnit: number | null;
  relocateHoursPerUnit: number | null;
}

export interface Asset {
  id: string;
  substationId: string;
  assetTypeId: string;
  assetType: {
    id: string;
    code: string;
    name: string;
    displayColor: string | null;
    fieldTemplate: AssetFieldDef[] | null;
    /** 시스템 구조 역할 — 분류 단일 소스(P2~). */
    role?: AssetRole | null;
  };
  name: string;
  parentAssetId: string | null;
  floorId: string | null;
  roomText: string | null;
  /**
   * 이 자산(랙)이 어떤 프리셋에서 생성됐는지 추적하는 전용 컬럼.
   * 구 `attributes.sourcePresetId` 를 대체(#7). 랙 외에는 null.
   */
  sourcePresetId: string | null;
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
