import { useEffect, useMemo, useState } from 'react';
import { useV2Catalog, useTypesById } from '../hooks';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import type { V2Asset } from '../types';
import { deriveDetailSections } from './detailSections';
import { AddAssetModal } from './AddAssetModal';
import { InfoTab, type AddModalContext } from './InfoTab';
import { RecordsTab } from './RecordsTab';
import { ConnectionsTab } from './ConnectionsTab';
import type { TraceResult } from '../traceSelectors';

// ── 탭 타입 ──────────────────────────────────────────────────────────────────
type Tab = 'info' | 'inspections' | 'logs' | 'connections';

// ── 메인 패널 ─────────────────────────────────────────────────────────────────
interface AssetDetailPanelProps {
  assetId: string;
  onSelectAsset: (id: string) => void;
  onTrace?: (result: TraceResult) => void;
  onClearTrace?: () => void;
  traceResult?: TraceResult | null;
}

export function AssetDetailPanel({ assetId, onSelectAsset, onTrace, onClearTrace, traceResult }: AssetDetailPanelProps) {
  const [tab, setTab] = useState<Tab>('info');
  const [addModalCtx, setAddModalCtx] = useState<AddModalContext | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  // 자산 전환 시 로컬 상태 리셋 (stale 자식 선택/모달 컨텍스트 방지)
  useEffect(() => {
    setSelectedChildId(null);
    setAddModalCtx(null);
  }, [assetId]);

  // ── 반응형 슬라이스 구독 (effectiveAssets() 함수 ref 구독 금지)
  const substationId = useV2WorkingCopy((s) => s.substationId) ?? '';
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  const effectiveAssets = useMemo(() => mergeEffective(saved.assets, overlays.assets), [saved, overlays]);
  const asset = useMemo(() => effectiveAssets.find((a) => a.id === assetId), [effectiveAssets, assetId]);

  const floorNameById = useMemo(() => new Map(saved.floors.map((f) => [f.id, f.name])), [saved.floors]);
  const assetNameById = useMemo(() => new Map(effectiveAssets.map((a) => [a.id, a.name])), [effectiveAssets]);

  const catalog = useV2Catalog();
  const typesById = useTypesById(catalog.data?.types);
  const type = asset ? typesById.get(asset.typeId) : undefined;
  const sections = useMemo(() => (type ? deriveDetailSections(type) : null), [type]);

  // 자식 자산 목록 (수용 섹션용)
  const childrenBySpecKey = useMemo(() => {
    const map = new Map<string, V2Asset[]>();
    for (const a of effectiveAssets) {
      if (a.parentAssetId === assetId && a.containerKey) {
        const list = map.get(a.containerKey) ?? [];
        list.push(a);
        map.set(a.containerKey, list);
      }
    }
    // 슬롯 인덱스 순 정렬
    for (const [, list] of map) {
      list.sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
    }
    return map;
  }, [effectiveAssets, assetId]);

  if (!asset) return null;

  // ── 탭 바 ──────────────────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: '정보' },
    { key: 'inspections', label: '점검' },
    { key: 'logs', label: '고장이력' },
    { key: 'connections', label: '연결' },
  ];

  return (
    <div className="flex h-full w-96 shrink-0 flex-col border-l border-line bg-surface">
      {/* 탭 바 */}
      <div className="flex shrink-0 border-b border-line z-sticky">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`px-4 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-b-2 border-primary font-medium text-primary'
                : 'text-content-muted hover:text-content'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === 'info' && (
          <InfoTab
            assetId={assetId}
            asset={asset}
            type={type}
            sections={sections}
            childrenBySpecKey={childrenBySpecKey}
            effectiveAssets={effectiveAssets}
            floorNameById={floorNameById}
            assetNameById={assetNameById}
            selectedChildId={selectedChildId}
            setSelectedChildId={setSelectedChildId}
            setAddModalCtx={setAddModalCtx}
            onSelectAsset={onSelectAsset}
          />
        )}

        {tab === 'inspections' && (
          <RecordsTab
            assetId={assetId}
            kind="inspections"
            dateField="inspectedAt"
            extraField="result"
            dateLabel="점검일"
            extraLabel="결과"
            emptyMessage="점검 기록이 없습니다"
          />
        )}

        {tab === 'logs' && (
          <RecordsTab
            assetId={assetId}
            kind="maintenance"
            dateField="occurredAt"
            extraField="action"
            dateLabel="발생일"
            extraLabel="조치"
            emptyMessage="고장이력이 없습니다"
          />
        )}

        {tab === 'connections' && (
          <ConnectionsTab
            assetId={assetId}
            onTrace={onTrace ?? (() => {})}
            onClearTrace={onClearTrace ?? (() => {})}
            traceResult={traceResult}
          />
        )}
      </div>

      {/* 자산 추가 모달 (수용 섹션 + 버튼에서 열림) */}
      {addModalCtx && (
        <AddAssetModal
          open={true}
          onClose={() => setAddModalCtx(null)}
          substationId={substationId}
          containerContext={addModalCtx}
        />
      )}
    </div>
  );
}
