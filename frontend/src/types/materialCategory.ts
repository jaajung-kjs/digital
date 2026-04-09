export interface SpecParam {
  key: string;
  label: string;
  inputType: 'select' | 'number' | 'text';
  options?: (string | number)[];
  unit?: string;
  required?: boolean;
  min?: number;
  max?: number;
}

export interface SpecTemplate {
  params: SpecParam[];
  format: string;
}

export interface MaterialCategoryAlias {
  id: string;
  aliasName: string;
  source: string | null;
}

export interface MaterialCategory {
  id: string;
  code: string;
  name: string;
  categoryType: 'CABLE' | 'EQUIPMENT' | 'ACCESSORY';
  parentId: string | null;
  displayColor: string | null;
  iconName: string | null;
  unit: string | null;
  specTemplate: SpecTemplate | null;
  sortOrder: number;
  isActive: boolean;
  children?: MaterialCategory[];
  aliases?: MaterialCategoryAlias[];
}
