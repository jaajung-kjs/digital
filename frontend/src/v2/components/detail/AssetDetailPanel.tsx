import { useEffect, useMemo, useState } from 'react';
import { useV2Catalog, useTypesById } from '../../hooks';
import { mergeEffective } from '../../store/overlay';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import type { V2Asset } from '../../types';
import { withDescendants } from '../../cableSelectors';
import { AddAssetModal } from '../AddAssetModal';
import { InfoTab, type AddModalContext } from './InfoTab';
import { PhotoCard } from './PhotoCard';
import { RecordsTab } from './RecordsTab';
import { ConnectionsTab } from './ConnectionsTab';
import type { TraceResult } from '../../traceSelectors';
import { Button, PanelHeader, Tabs, cn, SELECTABLE, type TabItem } from '../../../components/ui';

// ── 탭 타입 ──────────────────────────────────────────────────────────────────
type Tab = 'info' | 'photos' | 'inspections' | 'logs' | 'connections';

// ── 메인 패널 ─────────────────────────────────────────────────────────────────
interface AssetDetailPanelProps {
  assetId: string;
  onSelectAsset: (id: string) => void;
  onTrace?: (result: TraceResult) => void;
  onClearTrace?: () => void;
  traceResult?: TraceResult | null;
  /** 평면도 뷰로 전환한다 — 층 선택은 평면도가 선택된 자산을 따라간다. */
  onShowOnFloorPlan?: () => void;
  /**
   * 열자마자 골라 줄 포트 — 선번장처럼 **표의 한 줄이 포트 하나**인 화면에서 넘어온다.
   * 주어지면 포트 탭이 열린다(정보 탭에 떨어뜨려 두면 무엇을 골랐는지 안 보인다).
   */
  focusPortId?: string | null;
}

export function AssetDetailPanel({
  assetId,
  onSelectAsset,
  onTrace,
  onClearTrace,
  traceResult,
  onShowOnFloorPlan,
  focusPortId,
}: AssetDetailPanelProps) {
  const [tab, setTab] = useState<Tab>(focusPortId ? 'connections' : 'info');
  const [addModalCtx, setAddModalCtx] = useState<AddModalContext | null>(null);

  // 자산 전환 시 로컬 상태 리셋 (stale 자식 선택/모달 컨텍스트 방지)
  useEffect(() => {
    setAddModalCtx(null);
  }, [assetId]);

  /* 같은 자산 안에서 다른 포트로 옮겨 올 때도 포트 탭이 열려 있어야 한다
     (자산이 바뀌면 패널이 통째로 다시 뜨므로 초기값이 맡는다). */
  useEffect(() => {
    if (focusPortId) setTab('connections');
  }, [focusPortId]);


  // ── 반응형 슬라이스 구독 (effectiveAssets() 함수 ref 구독 금지)
  const substationId = useV2WorkingCopy((s) => s.substationId) ?? '';
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  const effectiveAssets = useMemo(() => mergeEffective(saved.assets, overlays.assets), [saved, overlays]);
  const asset = useMemo(() => effectiveAssets.find((a) => a.id === assetId), [effectiveAssets, assetId]);


  const catalog = useV2Catalog();
  const typesById = useTypesById(catalog.data?.types);
  /* 설비 종류으로 놓은 설비는 타입이 없다 — 그 분류는 설비 종류가다. */
  const type = asset?.typeId ? typesById.get(asset.typeId) : undefined;

  const assembliesById = useMemo(
    () => new Map((catalog.data?.assemblies ?? []).map((a) => [a.id, a])),
    [catalog.data],
  );

  /* 이 설비 안에 놓인 부품들 — 자리 순(격자가 행 우선이라 번호 순서와 같다). */
  const parts = useMemo(
    () =>
      effectiveAssets
        .filter((a) => a.parentAssetId === assetId)
        .sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || (a.col ?? 0) - (b.col ?? 0)),
    [effectiveAssets, assetId],
  );

  // 자신이 놓였거나, 놓인 상위가 있으면 평면도에서 찾아갈 수 있다.
  const placedAncestorExists = useMemo(() => {
    const byId = new Map(effectiveAssets.map((a) => [a.id, a]));
    let cur = byId.get(assetId);
    while (cur && cur.floorId == null && cur.parentAssetId != null) cur = byId.get(cur.parentAssetId);
    return cur?.floorId != null;
  }, [effectiveAssets, assetId]);

  /* 포트 수 = 이 자산 + **자손**의 포트. 랙·함체 자체에는 포트가 없고 안에 든 장비가
     갖는데, 자기 포트만 세면 랙에는 포트 탭이 아예 뜨지 않아 "안에 무엇이 어디에 물려
     있나" 를 보려면 장비마다 하나씩 들어가야 했다. */
  /* 담고 있는 상위 자산들 — 바깥부터 안쪽 순. 평면도에 놓인 조상(층)까지는 올라가지 않는다. */
  const ancestors = useMemo(() => {
    const byId = new Map(effectiveAssets.map((a) => [a.id, a]));
    const chain: V2Asset[] = [];
    let cur = byId.get(assetId)?.parentAssetId ?? null;
    while (cur != null) {
      const parent = byId.get(cur);
      if (!parent) break;
      chain.unshift(parent);
      cur = parent.parentAssetId;
    }
    return chain;
  }, [effectiveAssets, assetId]);

  const portCount = useMemo(
    () => withDescendants(effectiveAssets, assetId).reduce((n, a) => n + a.ports.length, 0),
    [effectiveAssets, assetId],
  );
  const hasPorts = portCount > 0;
  useEffect(() => {
    if (!hasPorts) setTab((t) => (t === 'connections' ? 'info' : t));
  }, [hasPorts]);

  /* 탭에 적을 개수 — 저장분과 스테이지된 변경을 합쳐 센다(화면에 보이는 것과 같게). */
  const inspectionCount = useMemo(
    () => mergeEffective(saved.inspectionLogs, overlays.inspections).filter((r) => r.assetId === assetId).length,
    [saved.inspectionLogs, overlays.inspections, assetId],
  );
  const logCount = useMemo(
    () => mergeEffective(saved.maintenanceLogs, overlays.maintenance).filter((r) => r.assetId === assetId).length,
    [saved.maintenanceLogs, overlays.maintenance, assetId],
  );
  const photoCount = useMemo(
    () => mergeEffective(saved.photos, overlays.photos).filter((r) => r.assetId === assetId).length,
    [saved.photos, overlays.photos, assetId],
  );

  if (!asset) return null;

  /* ── 탭 바 ──────────────────────────────────────────────────────────────────
   *
   * capability 가 UI 를 결정한다(재구축 스펙 §3) — 포트가 없는 타입에는 포트 탭이
   * 아예 생기지 않는다. 역할로 분기하는 것이 아니라 타입이 선언한 것만 비춘다.
   *
   * 탭 이름을 '연결' 이 아니라 '포트' 로 두는 이유: 거기 있는 것이 포트다. 이름이
   * '연결' 이면 이 자산이 어떤 포트를 갖는지 보려고 그 탭을 열 생각을 하지 못한다
   * (DCIM 표준인 NetBox 도 Interfaces / Power Ports 처럼 대상 이름을 그대로 쓴다).
   */
  const tabs: TabItem<Tab>[] = [
    { key: 'info', label: '정보' },
    /* 사진은 제 탭을 갖는다 — 예전에는 '정보' 탭 맨 아래 카드였다. 그러면 속성을 보러 온
       사람에게는 스크롤 끝의 군더더기이고, 사진을 보러 온 사람은 그것이 거기 있는 줄 모른다.
       점검·고장이력과 같은 성격(자산에 딸려 쌓이는 기록)이므로 같은 층위에 세운다. */
    { key: 'photos', label: '사진', count: photoCount },
    { key: 'inspections', label: '점검', count: inspectionCount },
    { key: 'logs', label: '고장이력', count: logCount },
    ...(hasPorts
      ? [{ key: 'connections' as const, label: '포트', count: portCount }]
      : []),
  ];

  return (
    <div className="flex h-full w-96 shrink-0 flex-col border-l border-line bg-surface">
      {/* 어느 자산을 보고 있는지는 탭 위에 고정한다.
          예전에는 자산 이름이 '정보' 탭 안의 카드에만 있어서, 점검·고장이력·연결 탭으로
          옮기면 패널만 봐서는 무엇의 기록인지 알 수 없었다. */}
      <PanelHeader
        title={
          <span className="flex min-w-0 items-center gap-1">
            {/* 담고 있는 상위 자산들을 앞에 붙인다 — 어느 랙·함체 안인지가 늘 보이고,
                눌러서 그리로 올라간다. 예전에는 '정보' 탭의 위치 행 안에만 있어서
                다른 탭에서는 맥락이 사라졌고, 있는 줄도 모르기 쉬웠다. */}
            {ancestors.map((a) => (
              <span key={a.id} className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  className={cn('min-w-0 max-w-28 truncate rounded px-1 text-sm font-normal text-primary', SELECTABLE)}
                  title={`${a.name} 으로 이동`}
                  onClick={() => onSelectAsset(a.id)}
                >
                  {a.name}
                </button>
                <span className="shrink-0 text-content-faint" aria-hidden>
                  ›
                </span>
              </span>
            ))}
            <span className="min-w-0 truncate">{asset.name}</span>
          </span>
        }
        className="shrink-0"
        actions={
          /* 도면 어디에 있는지 보러 가는 길이 없었다. 자산 자신이 놓여 있지 않아도
             (랙 안의 장비 등) 놓인 상위가 있으면 그 자리로 데려간다. */
          onShowOnFloorPlan && placedAncestorExists ? (
            <Button variant="secondary" size="sm" onClick={onShowOnFloorPlan}>
              평면도에서 보기
            </Button>
          ) : undefined
        }
      />
      <Tabs items={tabs} value={tab} onChange={setTab} className="shrink-0 border-b border-line z-sticky" />

      {/* 탭 컨텐츠 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === 'info' && (
          <InfoTab
            assetId={assetId}
            asset={asset}
            type={type}
            assembliesById={assembliesById}
            parts={parts}
            effectiveAssets={effectiveAssets}
            setAddModalCtx={setAddModalCtx}
            onSelectAsset={onSelectAsset}
          />
        )}

        {tab === 'photos' && <PhotoCard assetId={assetId} />}

        {tab === 'inspections' && (
          <RecordsTab
            assetId={assetId}
            kind="inspections"
            dateField="inspectedAt"
            extraField="result"
            dateLabel="점검일"
            extraLabel="결과"
            sectionTitle="점검 기록"
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
            sectionTitle="고장이력"
            emptyMessage="고장이력이 없습니다"
          />
        )}

        {tab === 'connections' && (
          <ConnectionsTab
            assetId={assetId}
            focusPortId={focusPortId}
            onSelectAsset={onSelectAsset}
            onTrace={onTrace ?? (() => {})}
            onClearTrace={onClearTrace ?? (() => {})}
            traceResult={traceResult}
          />
        )}
      </div>

      {/* 자산 추가 모달 (구성 격자의 빈 자리에서 열림) */}
      {addModalCtx && (
        <AddAssetModal
          open={true}
          onClose={() => setAddModalCtx(null)}
          substationId={substationId}
          gridContext={addModalCtx}
        />
      )}
    </div>
  );
}
