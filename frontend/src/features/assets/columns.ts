import type { AssetType } from '../../types/asset';

export interface GridColumn {
  key: string;
  label: string;
  kind: 'name' | 'attr';
}

/** 표시할 종류들의 fieldTemplate 을 합쳐 그리드 컬럼을 만든다. 이름 컬럼이 항상 맨 앞. */
export function buildColumns(types: AssetType[]): GridColumn[] {
  const cols: GridColumn[] = [{ key: 'name', label: '이름', kind: 'name' }];
  const seen = new Set<string>();
  for (const t of types) {
    for (const f of t.fieldTemplate ?? []) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      cols.push({ key: f.key, label: f.label, kind: 'attr' });
    }
  }
  return cols;
}

/** attributes 에서 key 의 표시 문자열을 읽는다. */
export function attrValue(attributes: Record<string, unknown> | null, key: string): string {
  const v = attributes?.[key];
  return v === null || v === undefined ? '' : String(v);
}
