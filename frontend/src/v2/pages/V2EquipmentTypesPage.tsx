/**
 * V2EquipmentTypesPage — 「설비 품목」 화면: 분야 · 설비 품목 · 랙 품목.
 *
 * 세 탭이 같은 편집 표(`CatalogTable`)를 쓴다 — 열만 다르다.
 */
import { useState } from 'react';
import { PageHeader, PageState, Tabs, useTabs } from '../../components/ui';
import { useCatalog } from '../model/hooks';
import { CatalogTable, type Column } from '../components/catalog/CatalogTable';

type Tab = 'categories' | 'equipment-types' | 'rack-types';

const ORDER: Column = { key: 'sortOrder', label: '순서', kind: 'number' };
const NAME: Column = { key: 'name', label: '이름', kind: 'text', required: true };
const LABOR: Column[] = [
  { key: 'laborCode', label: '노무유형', kind: 'labor' },
  { key: 'unitPrice', label: '자재단가', kind: 'number' },
  { key: 'installManDays', label: '신설 공량', kind: 'number' },
  { key: 'removeManDays', label: '철거 공량', kind: 'number' },
  { key: 'relocateManDays', label: '이설 공량', kind: 'number' },
];

export default function V2EquipmentTypesPage() {
  const catalog = useCatalog();
  const [tab, setTab] = useState<Tab>('equipment-types');
  const t = useTabs(tab);
  if (catalog.isLoading) return <PageState />;
  if (catalog.isError || catalog.data == null) return <PageState error="품목을 불러오지 못했습니다" />;
  const c = catalog.data;

  const items = [
    { key: 'categories' as const, label: '분야', count: c.categories.length },
    { key: 'equipment-types' as const, label: '설비 품목', count: c.equipmentTypes.length },
    { key: 'rack-types' as const, label: '랙 품목', count: c.rackTypes.length },
  ];
  const nextOrder = (rows: { sortOrder: number }[]) => rows.reduce((n, r) => Math.max(n, r.sortOrder), 0) + 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="설비 품목" />
      <Tabs {...t.list} items={items} onChange={setTab} />
      <div {...t.panel} className="flex min-h-0 flex-1 flex-col">
        {tab === 'categories' && (
          <CatalogTable kind="categories" title="분야" rows={c.categories} columns={[ORDER, NAME]} newRow={() => ({ sortOrder: nextOrder(c.categories) })} />
        )}
        {tab === 'equipment-types' && (
          <CatalogTable
            kind="equipment-types"
            title="설비 품목"
            rows={c.equipmentTypes}
            columns={[ORDER, NAME, { key: 'categoryId', label: '분야', kind: 'select', required: true, options: c.categories.map((x) => ({ value: x.id, label: x.name })) }, ...LABOR]}
            newRow={() => ({ sortOrder: nextOrder(c.equipmentTypes), categoryId: c.categories[0]?.id ?? '' })}
          />
        )}
        {tab === 'rack-types' && (
          <CatalogTable kind="rack-types" title="랙 품목" rows={c.rackTypes} columns={[ORDER, NAME, ...LABOR]} newRow={() => ({ sortOrder: nextOrder(c.rackTypes) })} />
        )}
      </div>
    </div>
  );
}
