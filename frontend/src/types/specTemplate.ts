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

/**
 * Build a specification string from a `specTemplate.format` and `specParams`.
 *
 *   format = "{shield} CAT.{cat} {pairs}P", params = {shield:"UTP",cat:"6",pairs:4}
 *   → "UTP CAT.6 4P"
 */
export function buildSpecificationString(
  format: string,
  params: Record<string, unknown>,
): string {
  return format.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key];
    return val != null ? String(val) : '';
  }).trim();
}
