import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Asset } from '../../../types/asset';
import { useAssetTypes } from '../hooks/useAssetTypes';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEffectiveAssets, useWorkingCopyLoader } from '../../workingCopy/hooks';
import { generateTempId } from '../../../utils/idHelpers';
import { buildColumns } from '../columns';
import { AssetGridRow } from './AssetGridRow';
import { AssetDetailPanel } from './AssetDetailPanel';
import { assetAlert } from '../alerts';
import { buildCsv, downloadCsv } from '../exportCsv';
import { useSelection } from '../../workspace/SelectionContext';

interface Props { substationId: string }

// ──────────────────────────────────────────────────────────────────────────
// SSOT — 대장 그리드도 통합 working copy(useSubstationWorkingCopy)로 staging.
//
// 과거 registerStore(별도 overlay)를 제거하고 현황/에디터와 동일한 단일 overlay 를
// 사용한다. 읽기=useEffectiveAssets(saved+overlay 머지), 쓰기=stageAsset*. 로드는
// useWorkingCopyLoader(온디맨드), 커밋은 페이지의 WorkingCopyCommitBar 가 담당한다.
// ──────────────────────────────────────────────────────────────────────────

export function SubstationAssetGrid({ substationId }: Props) {
  const { data: types = [] } = useAssetTypes();

  // 통합 working copy 온디맨드 로드 + effective 읽기.
  useWorkingCopyLoader(substationId);
  const effective = useEffectiveAssets();
  const stageAssetCreate = useSubstationWorkingCopy((s) => s.stageAssetCreate);
  const stageAssetUpdate = useSubstationWorkingCopy((s) => s.stageAssetUpdate);
  const stageAssetDelete = useSubstationWorkingCopy((s) => s.stageAssetDelete);
  const loaded = useSubstationWorkingCopy((s) => s.substationId === substationId);

  const [filterTypeId, setFilterTypeId] = useState<string>('');
  const [newTypeId, setNewTypeId] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const sel = useSelection();
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const selectedId = sel ? sel.selectedAssetId : localSelected;
  const setSelectedId = sel ? sel.setSelectedAssetId : setLocalSelected;
  const [alertOnly, setAlertOnly] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  // ?assetId= 딥링크 소비 — 자산 로드 후 자동 선택, 파라미터 제거.
  useEffect(() => {
    const assetId = searchParams.get('assetId');
    if (!assetId) return;
    if (!effective.find((a) => a.id === assetId)) return;  // 아직 로드 안 됨 → 다음 렌더에 재시도
    setSelectedId(assetId);
    setSearchParams((p) => { p.delete('assetId'); return p; }, { replace: true });
    // deps: effective(자산 로드 대기)+searchParams 만. set* 는 안정 식별자라 의도적 생략.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective, searchParams]);

  const today = useMemo(() => new Date(), []);

  const visible = useMemo(
    () => (filterTypeId ? effective.filter((a) => a.assetTypeId === filterTypeId) : effective),
    [effective, filterTypeId],
  );

  const shown = useMemo(
    () => (alertOnly ? visible.filter((a) => assetAlert(a, today)) : visible),
    [visible, alertOnly, today],
  );

  const columns = useMemo(() => {
    const usedTypeIds = new Set(visible.map((a) => a.assetTypeId));
    const usedTypes = types.filter((t) => usedTypeIds.has(t.id));
    return buildColumns(usedTypes.length ? usedTypes : []);
  }, [visible, types]);

  const handleAdd = () => {
    if (!newTypeId || !newName.trim()) return;
    const type = types.find((t) => t.id === newTypeId);
    if (!type) return;
    const newId = generateTempId();
    const newAsset: Asset = {
      id: newId,
      substationId,
      assetTypeId: newTypeId,
      assetType: {
        id: type.id,
        code: type.code,
        name: type.name,
        group: type.group,
        displayColor: type.displayColor,
        fieldTemplate: type.fieldTemplate,
        placementKind: type.placementKind,
      },
      name: newName.trim(),
      parentAssetId: null,
      floorId: null,
      roomText: null,
      attributes: {},
      installDate: null,
      warrantyUntil: null,
      replaceDue: null,
      manager: null,
      description: null,
      status: null,
      sortOrder: 0,
      updatedAt: '',
    };
    stageAssetCreate(newAsset);
    setNewName('');
  };

  const handleDuplicate = (id: string) => {
    const src = effective.find((a) => a.id === id);
    if (!src) return;
    const newId = generateTempId();
    const dup: Asset = {
      ...src,
      id: newId,
      name: `${src.name} (복제)`,
      updatedAt: '',
      sortOrder: 0,
    };
    stageAssetCreate(dup);
  };

  const selectedAsset = effective.find((a) => a.id === selectedId);

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center gap-2 mb-3">
        <select
          className="text-sm border border-gray-200 rounded px-2 py-1"
          value={filterTypeId}
          onChange={(e) => setFilterTypeId(e.target.value)}
        >
          <option value="">전체 종류</option>
          {types.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
        <button
          onClick={() => setAlertOnly((v) => !v)}
          className={`text-sm px-2 py-1 rounded ${alertOnly ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}
        >임박만</button>
        <button
          onClick={() => downloadCsv(`장비대장_${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(shown, columns))}
          className="text-sm px-2 py-1 rounded bg-gray-100 text-gray-700"
        >내보내기</button>
        <div className="flex-1" />
        <select
          className="text-sm border border-gray-200 rounded px-2 py-1"
          value={newTypeId}
          onChange={(e) => setNewTypeId(e.target.value)}
        >
          <option value="">종류 선택</option>
          {types.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
        <input
          className="text-sm border border-gray-200 rounded px-2 py-1"
          placeholder="이름"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button
          onClick={handleAdd}
          disabled={!newTypeId || !newName.trim()}
          className="text-sm px-3 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300"
        >+ 추가</button>
      </div>

      {!loaded ? (
        <p className="text-sm text-gray-400">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-400">아직 등록된 자산이 없습니다. 위에서 종류를 고르고 이름을 입력해 추가하세요.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-left bg-surface-2">
              <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-content-muted">종류</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-content-muted">{c.label}</th>
              ))}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <AssetGridRow
                key={a.id}
                asset={a}
                columns={columns}
                alert={assetAlert(a, today)}
                onSelect={() => setSelectedId(a.id)}
                onCommit={(id, patch) => stageAssetUpdate(id, patch)}
                onDuplicate={(id) => handleDuplicate(id)}
                onDelete={(id) => { if (confirm('이 자산을 삭제할까요?')) stageAssetDelete(id); }}
              />
            ))}
          </tbody>
        </table>
      )}
      </div>
      {selectedAsset && (
        <AssetDetailPanel
          key={selectedAsset.id}
          asset={selectedAsset}
          onClose={() => setSelectedId(null)}
          onPatch={(id, patch) => stageAssetUpdate(id, patch)}
        />
      )}
    </div>
  );
}
