import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useCatalogStore, newCatalogId } from './catalogStore';
import { CommitBar } from '../../components/ui/CommitBar';
import { CatalogTable } from './CatalogTable';
import type { CatalogColumn, CatalogGroup } from './CatalogTable';
import { EditableField } from '../assets/components/EditableField';
import { Badge } from '../../components/ui';
import type { AssetType } from '../../types/asset';
import type { CableCategory } from '../../types/cableCategory';
import { useToastStore } from '../editor/stores/toastStore';

type Segment = 'asset' | 'cable';

/**
 * 자산관리 — 전역 마스터데이터(종류·분류) 관리 화면. 관리자 전용.
 * 카탈로그 워킹카피(스테이징 → 원자적 저장/취소). 변전소 워킹카피와 분리.
 * 세그먼트(설비/케이블) + CatalogTable 인라인 편집.
 */
export function AssetManagementPage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  // ── Store actions ────────────────────────────────────────────────────────────
  const load = useCatalogStore((s) => s.load);
  const discard = useCatalogStore((s) => s.discard);
  const commit = useCatalogStore((s) => s.commit);
  const stageCreateType = useCatalogStore((s) => s.stageCreateType);
  const stageUpdateType = useCatalogStore((s) => s.stageUpdateType);
  const stageDeleteType = useCatalogStore((s) => s.stageDeleteType);
  const stageCreateCategory = useCatalogStore((s) => s.stageCreateCategory);
  const stageUpdateCategory = useCatalogStore((s) => s.stageUpdateCategory);
  const stageDeleteCategory = useCatalogStore((s) => s.stageDeleteCategory);
  const stageCreateCableGroup = useCatalogStore((s) => s.stageCreateCableGroup);
  const stageUpdateCableGroup = useCatalogStore((s) => s.stageUpdateCableGroup);
  const stageDeleteCableGroup = useCatalogStore((s) => s.stageDeleteCableGroup);
  const stageCreateCableCategory = useCatalogStore((s) => s.stageCreateCableCategory);
  const stageUpdateCableCategory = useCatalogStore((s) => s.stageUpdateCableCategory);
  const stageDeleteCableCategory = useCatalogStore((s) => s.stageDeleteCableCategory);

  // ── Raw slices (for useMemo deps) ────────────────────────────────────────────
  const baseCategories = useCatalogStore((s) => s.baseCategories);
  const catOverlay = useCatalogStore((s) => s.catOverlay);
  const baseTypes = useCatalogStore((s) => s.baseTypes);
  const typeOverlay = useCatalogStore((s) => s.typeOverlay);
  const baseCableGroups = useCatalogStore((s) => s.baseCableGroups);
  const cgOverlay = useCatalogStore((s) => s.cgOverlay);
  const baseCableCategories = useCatalogStore((s) => s.baseCableCategories);
  const ccOverlay = useCatalogStore((s) => s.ccOverlay);

  // ── Dirty count (reactive) ────────────────────────────────────────────────────
  const dirty = useCatalogStore((s) => s.dirtyCount());

  // ── Local state ──────────────────────────────────────────────────────────────
  const [seg, setSeg] = useState<Segment>('asset');
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Effective derivations ─────────────────────────────────────────────────────
  const categories = useMemo(
    () => useCatalogStore.getState().effectiveCategories(),
    [baseCategories, catOverlay],
  );
  const types = useMemo(
    () => useCatalogStore.getState().effectiveTypes(),
    [baseTypes, typeOverlay],
  );
  const cableGroups = useMemo(
    () => useCatalogStore.getState().effectiveCableGroups(),
    [baseCableGroups, cgOverlay],
  );
  const cableCategories = useMemo(
    () => useCatalogStore.getState().effectiveCableCategories(),
    [baseCableCategories, ccOverlay],
  );

  // ── isNew helpers (checks overlay.creates — staged, not yet committed) ────────
  const isNewType = (id: string) => id in typeOverlay.creates;
  const isNewCat = (id: string) => id in catOverlay.creates;
  const isNewCg = (id: string) => id in cgOverlay.creates;
  const isNewCc = (id: string) => id in ccOverlay.creates;

  // ── Mount/unmount effect ──────────────────────────────────────────────────────
  useEffect(() => {
    load();
    return () => discard(); // 화면 이탈 시 미저장 스테이징 폐기
  }, [load, discard]);

  // ── ADMIN guard (ALL hooks must be above this) ────────────────────────────────
  if (!isAdmin) return <Navigate to="/" replace />;

  // ── Save handler ──────────────────────────────────────────────────────────────
  const onSave = async () => {
    setSaving(true);
    try {
      await commit();
      useToastStore.getState().showToast('저장되었습니다');
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e as { message?: string })?.message ??
        '저장에 실패했습니다';
      useToastStore.getState().showToast(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── 설비 segment ──────────────────────────────────────────────────────────────
  const catOptions = [
    { value: '', label: '— 미분류 —' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const assetColumns: CatalogColumn<AssetType>[] = [
    {
      label: '이름',
      cell: (t) => (
        <EditableField
          value={t.name}
          valueClickEdits
          ariaLabel="종류명"
          onCommit={(v) => { if (v.trim()) stageUpdateType(t.id, { name: v.trim() }); }}
        />
      ),
    },
    {
      label: '분류',
      cell: (t) => (
        <EditableField
          value={t.categoryId ?? ''}
          type="select"
          options={catOptions}
          ariaLabel="분류"
          display={(v) => catOptions.find((o) => o.value === v)?.label ?? '— 미분류 —'}
          onCommit={(v) => stageUpdateType(t.id, { categoryId: v || null })}
        />
      ),
    },
    {
      label: '역할',
      cell: (t) =>
        t.role !== 'device' ? (
          <Badge>시스템</Badge>
        ) : (
          <span className="text-sm text-content-faint">—</span>
        ),
    },
    {
      label: '설치',
      cell: (t) => (
        <EditableField
          value={String(t.installHoursPerUnit ?? '')}
          type="number"
          ariaLabel="설치"
          placeholder="—"
          onCommit={(v) => {
            if (v !== '' && Number.isNaN(Number(v))) return;
            stageUpdateType(t.id, { installHoursPerUnit: v === '' ? null : Number(v) });
          }}
        />
      ),
    },
    {
      label: '철거',
      cell: (t) => (
        <EditableField
          value={String(t.removeHoursPerUnit ?? '')}
          type="number"
          ariaLabel="철거"
          placeholder="—"
          onCommit={(v) => {
            if (v !== '' && Number.isNaN(Number(v))) return;
            stageUpdateType(t.id, { removeHoursPerUnit: v === '' ? null : Number(v) });
          }}
        />
      ),
    },
    {
      label: '이설',
      cell: (t) => (
        <EditableField
          value={String(t.relocateHoursPerUnit ?? '')}
          type="number"
          ariaLabel="이설"
          placeholder="—"
          onCommit={(v) => {
            if (v !== '' && Number.isNaN(Number(v))) return;
            stageUpdateType(t.id, { relocateHoursPerUnit: v === '' ? null : Number(v) });
          }}
        />
      ),
    },
    {
      label: '노무',
      cell: (t) => (
        <EditableField
          value={t.laborType ?? ''}
          type="text"
          ariaLabel="노무종류"
          placeholder="—"
          onCommit={(v) => stageUpdateType(t.id, { laborType: v.trim() || null })}
        />
      ),
    },
    {
      label: '',
      cell: (t) =>
        t.role === 'device' ? (
          <button
            type="button"
            className="text-xs text-danger hover:opacity-80"
            onClick={() => stageDeleteType(t.id, isNewType(t.id))}
          >
            삭제
          </button>
        ) : null,
    },
  ];

  const sentinelGroup: CatalogGroup<AssetType> = {
    id: '__none__',
    header: <span className="text-sm text-content-muted">미분류</span>,
    rows: types.filter((t) => t.categoryId == null),
    addLabel: '+ 종류',
    onAdd: () =>
      stageCreateType({
        id: newCatalogId(),
        name: '새 종류',
        role: 'device',
        categoryId: null,
        sortOrder: 0,
        laborType: null,
        installHoursPerUnit: null,
        removeHoursPerUnit: null,
        relocateHoursPerUnit: null,
      }),
    draggable: false,
  };

  const assetGroups: CatalogGroup<AssetType>[] = [
    ...categories.map((c) => {
      const catTypes = types.filter((t) => (t.categoryId ?? null) === c.id);
      return {
        id: c.id,
        header: (
          <EditableField
            value={c.name}
            valueClickEdits
            ariaLabel="분류명"
            onCommit={(v) => { if (v.trim()) stageUpdateCategory(c.id, { name: v.trim() }); }}
          />
        ),
        rows: catTypes,
        addLabel: '+ 종류',
        onAdd: () =>
          stageCreateType({
            id: newCatalogId(),
            name: '새 종류',
            role: 'device',
            categoryId: c.id,
            sortOrder: 0,
            laborType: null,
            installHoursPerUnit: null,
            removeHoursPerUnit: null,
            relocateHoursPerUnit: null,
          }),
        onDelete: catTypes.length === 0 ? () => stageDeleteCategory(c.id, isNewCat(c.id)) : undefined,
        draggable: true,
      } satisfies CatalogGroup<AssetType>;
    }),
    ...(types.some((t) => t.categoryId == null) ? [sentinelGroup] : []),
  ];

  // ── 케이블 segment ────────────────────────────────────────────────────────────
  const cableColumns: CatalogColumn<CableCategory>[] = [
    {
      label: '이름',
      cell: (c) => (
        <EditableField
          value={c.name}
          valueClickEdits
          ariaLabel="종류명"
          onCommit={(v) => { if (v.trim()) stageUpdateCableCategory(c.id, { name: v.trim() }); }}
        />
      ),
    },
    {
      label: '',
      cell: (c) => (
        <button
          type="button"
          className="text-xs text-danger hover:opacity-80"
          onClick={() => stageDeleteCableCategory(c.id, isNewCc(c.id))}
        >
          삭제
        </button>
      ),
    },
  ];

  const cableTableGroups: CatalogGroup<CableCategory>[] = cableGroups.map((g) => {
    const groupCats = cableCategories.filter((c) => c.groupId === g.id);
    return {
      id: g.id,
      header: (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="color"
            aria-label="그룹 색"
            value={g.color ?? '#000000'}
            onChange={(e) => stageUpdateCableGroup(g.id, { color: e.target.value })}
            className="w-5 h-5 rounded border border-line"
            style={{ backgroundColor: g.color ?? undefined }}
          />
          <EditableField
            value={g.name}
            valueClickEdits
            ariaLabel="그룹명"
            onCommit={(v) => { if (v.trim()) stageUpdateCableGroup(g.id, { name: v.trim() }); }}
          />
          <span className="flex items-center gap-1 text-xs text-content-muted">
            <span>설치</span>
            <EditableField
              value={String(g.installHoursPerMeter ?? '')}
              type="number"
              ariaLabel="설치(m)"
              placeholder="—"
              onCommit={(v) => {
                if (v !== '' && Number.isNaN(Number(v))) return;
                stageUpdateCableGroup(g.id, { installHoursPerMeter: v === '' ? null : Number(v) });
              }}
            />
            <span>철거</span>
            <EditableField
              value={String(g.removeHoursPerMeter ?? '')}
              type="number"
              ariaLabel="철거(m)"
              placeholder="—"
              onCommit={(v) => {
                if (v !== '' && Number.isNaN(Number(v))) return;
                stageUpdateCableGroup(g.id, { removeHoursPerMeter: v === '' ? null : Number(v) });
              }}
            />
            <span>이설</span>
            <EditableField
              value={String(g.relocateHoursPerMeter ?? '')}
              type="number"
              ariaLabel="이설(m)"
              placeholder="—"
              onCommit={(v) => {
                if (v !== '' && Number.isNaN(Number(v))) return;
                stageUpdateCableGroup(g.id, { relocateHoursPerMeter: v === '' ? null : Number(v) });
              }}
            />
            <span>노무</span>
            <EditableField
              value={g.laborType ?? ''}
              type="text"
              ariaLabel="노무종류(그룹)"
              placeholder="—"
              onCommit={(v) => stageUpdateCableGroup(g.id, { laborType: v.trim() || null })}
            />
          </span>
        </div>
      ),
      rows: groupCats,
      addLabel: '+ 종류',
      onAdd: () =>
        stageCreateCableCategory({
          id: newCatalogId(),
          name: '새 종류',
          groupId: g.id,
          sortOrder: 0,
          groupName: null,
          groupColor: null,
        }),
      onDelete: groupCats.length === 0 ? () => stageDeleteCableGroup(g.id, isNewCg(g.id)) : undefined,
      draggable: true,
    } satisfies CatalogGroup<CableCategory>;
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {dirty > 0 && (
        <CommitBar dirty={dirty} onCommit={onSave} onRevert={discard} busy={saving} />
      )}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-line">
        {(['asset', 'cable'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeg(s)}
            className={`px-3 py-1 text-sm rounded ${
              seg === s ? 'bg-info-bg text-primary font-medium' : 'text-content hover:bg-surface-2'
            }`}
          >
            {s === 'asset' ? '설비' : '케이블'}
          </button>
        ))}
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색"
          aria-label="검색"
          className="ml-2 text-sm px-2 py-1 rounded bg-surface border border-line focus:border-primary focus:outline-none"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {seg === 'asset' ? (
          <CatalogTable<AssetType>
            columns={assetColumns}
            groups={assetGroups}
            rowKey={(t) => t.id}
            rowMatch={(t, q) => t.name.toLowerCase().includes(q.toLowerCase())}
            query={q}
            onReorderGroups={(ids) => ids.forEach((id, i) => stageUpdateCategory(id, { sortOrder: i }))}
            onReorderRows={(_gid, ids) => ids.forEach((id, i) => stageUpdateType(id, { sortOrder: i }))}
            onAddGroup={() => stageCreateCategory({ id: newCatalogId(), name: '새 분류', sortOrder: 0 })}
            addGroupLabel="+ 분류"
          />
        ) : (
          <CatalogTable<CableCategory>
            columns={cableColumns}
            groups={cableTableGroups}
            rowKey={(c) => c.id}
            rowMatch={(c, q) => c.name.toLowerCase().includes(q.toLowerCase())}
            query={q}
            onReorderGroups={(ids) => ids.forEach((id, i) => stageUpdateCableGroup(id, { sortOrder: i }))}
            onReorderRows={(_gid, ids) => ids.forEach((id, i) => stageUpdateCableCategory(id, { sortOrder: i }))}
            onAddGroup={() =>
              stageCreateCableGroup({
                id: newCatalogId(),
                name: '새 그룹',
                sortOrder: 0,
                color: null,
                laborType: null,
                installHoursPerMeter: null,
                removeHoursPerMeter: null,
                relocateHoursPerMeter: null,
              })
            }
            addGroupLabel="+ 그룹"
          />
        )}
      </div>
    </div>
  );
}
