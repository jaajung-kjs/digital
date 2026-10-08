/**
 * V2CatalogPage — 「품목 관리」: 품목을 정의하는 한 화면.
 *
 * 왼쪽에서 설비 품목 · 랙 품목 · 케이블 품목 · 분야를 고르면 오른쪽에 같은 편집 표(`CatalogTable`)가
 * 선다 — 열만 다르다. 고른 것은 주소(`?kind=`)에 남아 새로 고쳐도 같은 자리다.
 */
import { useSearchParams } from 'react-router-dom';
import { CABLE_MEDIA } from '@twin/core';
import { ListHeading, ListRow, PageState, SELECTED } from '../../components/ui';
import { useCatalog } from '../model/hooks';
import { CatalogTable, type Column } from '../components/catalog/CatalogTable';

type Kind = 'equipment' | 'rack' | 'cable' | 'category';
const KINDS: readonly Kind[] = ['equipment', 'rack', 'cable', 'category'];

/** 순서는 두세 자리 수 — 폭을 못 박는다(무게로 나누면 두 열짜리 분야 표에서 30% 를 먹었다). */
const ORDER: Column = { key: 'sortOrder', label: '순서', kind: 'number', width: '6' };
const NAME: Column = { key: 'name', label: '이름', kind: 'text', required: true };
const LABOR: Column[] = [
  { key: 'laborCode', label: '노무유형', kind: 'labor' },
  { key: 'unitPrice', label: '자재단가', kind: 'number', unit: '원' },
  { key: 'installManDays', label: '신설 공량', kind: 'number', unit: '인' },
  { key: 'removeManDays', label: '철거 공량', kind: 'number', unit: '인' },
  { key: 'relocateManDays', label: '이설 공량', kind: 'number', unit: '인' },
];
const nextOrder = (rows: readonly { sortOrder: number }[]) => rows.reduce((n, r) => Math.max(n, r.sortOrder), 0) + 1;

export default function V2CatalogPage() {
  const catalog = useCatalog();
  const [params, setParams] = useSearchParams();
  const raw = params.get('kind');
  const kind: Kind = KINDS.includes(raw as Kind) ? (raw as Kind) : 'equipment';
  if (catalog.isLoading) return <PageState />;
  if (catalog.isError || catalog.data == null) return <PageState error="품목을 불러오지 못했습니다" />;
  const c = catalog.data;

  const list: { kind: Kind; label: string; count: number }[] = [
    { kind: 'equipment', label: '설비 품목', count: c.equipmentTypes.length },
    { kind: 'rack', label: '랙 품목', count: c.rackTypes.length },
    { kind: 'cable', label: '케이블 품목', count: c.cableTypes.length },
    { kind: 'category', label: '분야', count: c.categories.length },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-line bg-sidebar p-2">
          <ListHeading>품목</ListHeading>
          {list.map((x) => (
            <ListRow
              key={x.kind}
              aria-current={kind === x.kind ? 'true' : undefined}
              className={kind === x.kind ? SELECTED : undefined}
              trailing={x.count}
              onClick={() => setParams({ kind: x.kind }, { replace: true })}
            >
              {x.label}
            </ListRow>
          ))}
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {kind === 'category' && (
            <CatalogTable key={kind} kind="categories" title="분야" rows={c.categories} columns={[ORDER, NAME]} newRow={() => ({ sortOrder: nextOrder(c.categories) })} />
          )}
          {kind === 'equipment' && (
            <CatalogTable
              key={kind}
              kind="equipment-types"
              title="설비 품목"
              rows={c.equipmentTypes}
              columns={[ORDER, NAME, { key: 'categoryId', label: '분야', kind: 'select', required: true, options: c.categories.map((x) => ({ value: x.id, label: x.name })) }, ...LABOR]}
              newRow={() => ({ sortOrder: nextOrder(c.equipmentTypes), categoryId: c.categories[0]?.id ?? '' })}
            />
          )}
          {kind === 'rack' && (
            <CatalogTable key={kind} kind="rack-types" title="랙 품목" rows={c.rackTypes} columns={[ORDER, NAME, ...LABOR]} newRow={() => ({ sortOrder: nextOrder(c.rackTypes) })} />
          )}
          {kind === 'cable' && (
            <CatalogTable
              key={kind}
              kind="cable-types"
              title="케이블 품목"
              rows={c.cableTypes}
              columns={[
                ORDER,
                NAME,
                { key: 'medium', label: '매체', kind: 'select', required: true, options: CABLE_MEDIA.map((m) => ({ value: m.key, label: m.name })) },
                { key: 'laborCode', label: '노무유형', kind: 'labor' },
                { key: 'unitPrice', label: '자재단가', kind: 'number', unit: '원/m' },
                { key: 'installManDays', label: '신설 공량', kind: 'number', unit: '인/m' },
                { key: 'removeManDays', label: '철거 공량', kind: 'number', unit: '인/m' },
              ]}
              newRow={() => ({ sortOrder: nextOrder(c.cableTypes), medium: CABLE_MEDIA[0].key })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
