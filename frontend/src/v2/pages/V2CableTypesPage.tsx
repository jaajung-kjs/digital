/**
 * V2CableTypesPage — 「케이블 품목」 화면.
 *
 * 매체는 고정 어휘(`CABLE_MEDIA`)에서 고르고, 공량은 m 당이다.
 */
import { CABLE_MEDIA } from '@twin/core';
import { PageHeader, PageState } from '../../components/ui';
import { useCatalog } from '../model/hooks';
import { CatalogTable, type Column } from '../components/catalog/CatalogTable';

const COLUMNS: Column[] = [
  { key: 'sortOrder', label: '순서', kind: 'number' },
  { key: 'name', label: '이름', kind: 'text', required: true },
  { key: 'medium', label: '매체', kind: 'select', required: true, options: CABLE_MEDIA.map((m) => ({ value: m.key, label: m.name })) },
  { key: 'laborCode', label: '노무유형', kind: 'labor' },
  { key: 'unitPrice', label: '자재단가(원/m)', kind: 'number' },
  { key: 'installManDays', label: '신설 공량(m당)', kind: 'number' },
  { key: 'removeManDays', label: '철거 공량(m당)', kind: 'number' },
];

export default function V2CableTypesPage() {
  const catalog = useCatalog();
  if (catalog.isLoading) return <PageState />;
  if (catalog.isError || catalog.data == null) return <PageState error="품목을 불러오지 못했습니다" />;
  const rows = catalog.data.cableTypes;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="케이블 품목" />
      <CatalogTable
        kind="cable-types"
        title="케이블 품목"
        rows={rows}
        columns={COLUMNS}
        newRow={() => ({ sortOrder: rows.reduce((n, r) => Math.max(n, r.sortOrder), 0) + 1, medium: CABLE_MEDIA[0].key })}
      />
    </div>
  );
}
