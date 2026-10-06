import type { Category, EquipmentType, RackType } from '../../model/types';

/** 설비 품목 고르기 목록 — 분야별 `optgroup`. 부모 `Select` 안에 놓는다. */
export function EquipmentTypeOptions({ categories, types }: { categories: Category[]; types: EquipmentType[] }) {
  const cats = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const known = new Set(cats.map((c) => c.id));
  const sorted = [...types].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <>
      {cats.map((c) => {
        const list = sorted.filter((t) => t.categoryId === c.id);
        return list.length === 0 ? null : (
          <optgroup key={c.id} label={c.name}>
            {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        );
      })}
      {sorted.filter((t) => !known.has(t.categoryId)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </>
  );
}

/** 랙 품목 고르기 목록. */
export function RackTypeOptions({ types }: { types: RackType[] }) {
  return <>{[...types].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</>;
}
