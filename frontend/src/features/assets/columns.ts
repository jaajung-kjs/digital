import type { AssetType } from '../../types/asset';

export interface GridColumn {
  key: string;
  label: string;
  kind: 'name';
}

/**
 * 대장 그리드 컬럼. #7 에서 Asset.attributes 제거 — 더 이상 fieldTemplate 기반 속성
 * 컬럼을 만들지 않는다. 이름 컬럼만 남고 종류/메타는 그리드가 직접 그린다.
 * (types 인자는 호출부 호환을 위해 유지하나 더 이상 컬럼 생성에 쓰지 않는다.)
 */
export function buildColumns(_types: AssetType[]): GridColumn[] {
  return [{ key: 'name', label: '이름', kind: 'name' }];
}
