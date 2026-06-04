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
  };
  name: string;
  parentAssetId: string | null;
  roomText: string | null;
  attributes: Record<string, unknown> | null;
  installDate: string | null;
  manager: string | null;
  description: string | null;
  status: string | null;
  sortOrder: number;
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
}
