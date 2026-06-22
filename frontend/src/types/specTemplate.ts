/**
 * Shared spec template / spec params shape.
 *
 * Used by CableCategory, BomMaterial, and (legacy) MaterialCategory.
 * Backed by the Prisma JSON column — kept loose to match what the API returns.
 */

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
  /** e.g. "{shield} CAT.{cat} {pairs}P" */
  format: string;
}
