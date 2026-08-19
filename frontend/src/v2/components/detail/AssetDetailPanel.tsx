import { useEffect, useMemo, useState } from 'react';
import { useV2Catalog, useTypesById } from '../../hooks';
import { mergeEffective } from '../../store/overlay';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import type { V2Asset } from '../../types';
import { withDescendants } from '../../cableSelectors';
import { assetsById, floorAnchorOf } from '../../assetTree';
import { InfoTab, LayoutTab } from './InfoTab';
import { PhotoCard } from './PhotoCard';
import { RecordsTab } from './RecordsTab';
import { ConnectionsTab } from './ConnectionsTab';
import type { CablePickRequest } from '../../cablePick';
import type { TraceResult } from '../../traceSelectors';
import { X } from 'lucide-react';
import { Button, IconButton, PanelHeader, Tabs, cn, SELECTABLE, useTabs, type TabItem } from '../../../components/ui';

// ── 탭 타입 ──────────────────────────────────────────────────────────────────
type Tab = 'layout' | 'info' | 'photos' | 'records' | 'connections';

// ── 메인 패널 ─────────────────────────────────────────────────────────────────
interface AssetDetailPanelProps {
  assetId: string;
  onSelectAsset: (id: string | null) => void;
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
  /**
   * 밖에서 지목해 온 **부품** — 현황표에서 부품 행을 눌렀을 때.
   *
   * 부품은 제 패널을 갖지 않는다: 설비 패널을 열고 그 부품을 구성 격자에서 고른 상태로 둔다.
   */
  focusPartId?: string | null;
  /** 빈 포트에서 케이블을 잇기 시작한다 — 평면도로 넘어가 그 포트를 첫 끝점으로 무장한다. */
  onConnectPort?: (portId: string) => void;
  /** 평면도가 「포트를 골라 달라」고 보낸 요청 — 포트 탭이 고르는 모드로 돌아간다. */
  cablePick?: CablePickRequest | null;
}

export function AssetDetailPanel({
  assetId,
  onSelectAsset,
  onTrace,
  onClearTrace,
  traceResult,
  onShowOnFloorPlan,
  focusPortId,
  focusPartId,
  onConnectPort,
  cablePick,
}: AssetDetailPanelProps) {
  /* 설비를 열면 **그 안이 먼저** 보인다 — 현장에서 랙 문을 열면 안이 보이는 것과 같다.
     포트를 지목해 온 경우에만 포트 탭으로 연다(그때는 무엇을 보라는 것인지가 분명하다). */
  const [tab, setTab] = useState<Tab>(focusPortId ? 'connections' : 'layout');

  /* 같은 자산 안에서 다른 포트로 옮겨 올 때도 포트 탭이 열려 있어야 한다
     (자산이 바뀌면 패널이 통째로 다시 뜨므로 초기값이 맡는다). */
  useEffect(() => {
    if (focusPortId) setTab('connections');
  }, [focusPortId]);
  /* 고르라는 요청이 오면 판이 있는 탭으로 — 정보 탭에 떨어뜨려 두면 무엇을 고르라는 건지
     화면에 보이지 않는다(하단 안내만 뜬 채 아무 판도 없는 꼴이 된다). */
  useEffect(() => {
    if (cablePick) setTab('connections');
  }, [cablePick]);


  // ── 반응형 슬라이스 구독 (effectiveAssets() 함수 ref 구독 금지)
  const substationId = useV2WorkingCopy((s) => s.substationId) ?? '';
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  const effectiveAssets = useMemo(() => mergeEffective(saved.assets, overlays.assets), [saved, overlays]);
  const asset = useMemo(() => effectiveAssets.find((a) => a.id === assetId), [effectiveAssets, assetId]);


  const catalog = useV2Catalog();
  const typesById = useTypesById(catalog.data?.types);
  /* 설비 종류로 놓은 설비는 타입이 없다 — 그 분류는 설비 종류다. */
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
  const placedAncestorExists = useMemo(
    () => floorAnchorOf(assetId, assetsById(effectiveAssets)) != null,
    [effectiveAssets, assetId],
  );

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
  /* 격자가 없는 자산에는 「구성」 탭이 없다 — 그때는 정보로 물러선다. */
  const effectiveTab: Tab = tab === 'layout' && !asset.assemblyId ? 'info' : tab;
  /* 탭 줄과 그 아래 내용이 같은 이름표를 나눠 갖는다 — 스크린리더가 둘을 잇는다. */
  const tabStrip = useTabs(effectiveTab);

  const tabs: TabItem<Tab>[] = [
    /* 설비를 고른 사람이 가장 먼저 보고 싶은 것은 **그 안**이다 — 랙을 들여다보듯.
       부품이 없는 자산(설비 아닌 것)에는 격자가 없으므로 이 탭도 없다. */
    ...(asset.assemblyId ? [{ key: 'layout' as const, label: '구성' }] : []),
    { key: 'info', label: '정보' },
    /* 사진은 제 탭을 갖는다 — 예전에는 '정보' 탭 맨 아래 카드였다. 그러면 속성을 보러 온
       사람에게는 스크롤 끝의 군더더기이고, 사진을 보러 온 사람은 그것이 거기 있는 줄 모른다.
       점검·고장이력과 같은 성격(자산에 딸려 쌓이는 기록)이므로 같은 층위에 세운다. */
    { key: 'photos', label: '사진', count: photoCount },
    /* 점검과 고장이력은 둘 다 「이 자산에 언제 무슨 일이 있었나」다 — 한 탭에 두 섹션으로
       세운다. 탭 바는 383px 이고 다섯 개가 이미 366px 을 쓰므로, 「구성」을 넣으려면
       합치는 것이 선택이 아니라 조건이다. */
    { key: 'records', label: '이력', count: inspectionCount + logCount },
    ...(hasPorts
      ? [{ key: 'connections' as const, label: '포트', count: portCount }]
      : []),
  ];

  return (
    /* 폭·테두리는 **화면이** 정한다(워크스페이스의 상세 레일) — 이 패널이 스스로 자리를
       만들면 비었을 때 그 자리가 사라져 옆 표가 넓어졌다 좁아졌다 한다. */
    <div className="flex h-full min-h-0 flex-1 flex-col">
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
          <>
            {/* 도면 어디에 있는지 보러 가는 길이 없었다. 자산 자신이 놓여 있지 않아도
                (랙 안의 장비 등) 놓인 상위가 있으면 그 자리로 데려간다. */}
            {onShowOnFloorPlan && placedAncestorExists && (
              <Button variant="secondary" size="sm" onClick={onShowOnFloorPlan}>
                평면도에서 보기
              </Button>
            )}
            {/* 닫는 길이 아예 없었다 — 한 번 열면 다른 것을 고르는 수밖에 없었다.
                패널·서랍에는 닫기가 있어야 한다. */}
            <IconButton aria-label="상세 닫기" onClick={() => onSelectAsset(null)}>
              <X size={14} />
            </IconButton>
          </>
        }
      />
      <Tabs {...tabStrip.list} items={tabs} onChange={setTab} className="shrink-0 border-b border-line z-sticky" />

      {/* 탭 컨텐츠 */}
      {/* 구성 탭은 **스크롤이 생기면 안 된다** — 격자가 남는 높이를 채우고 부품을 고르면
          그만큼 줄어든다. 나머지 탭은 내용만큼 길어지므로 이 상자가 스크롤을 맡는다. */}
      <div
        {...tabStrip.panel}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-3 p-3',
          effectiveTab === 'layout' ? 'overflow-hidden' : 'overflow-y-auto',
        )}
      >
        {effectiveTab === 'layout' && (
          <LayoutTab
            assetId={assetId}
            asset={asset}
            assembliesById={assembliesById}
            parts={parts}
            focusPartId={focusPartId}
            /* 부품 상자 안에 앉을 포트 판 — **포트 탭이 쓰는 것과 같은 것**이다.
               판이 하는 일 가운데 **화면 뒤를 바꾸는 둘**(대국 자산으로 옮겨가기, 평면도의
               케이블 도구 무장)은 상자를 먼저 닫는다 — 그 앞을 가린 채로 뒤가 바뀌면
               무엇이 일어났는지 보이지 않는다.
               `cablePick` 은 넘기지 않는다: 포트를 「고르는」 판은 하나여야 하고(포트 탭),
               그 요청은 평면도가 보낸다. */
            renderPortBoard={(partId, close) => (
              <ConnectionsTab
                assetId={partId}
                /* 이 판은 이미 그 부품의 상자 안이다 — 머리줄이 이름을 두 번 말하지 않게. */
                ownerHeadings={false}
                onSelectAsset={(id) => { close(); onSelectAsset(id); }}
                onTrace={onTrace ?? (() => {})}
                onClearTrace={onClearTrace ?? (() => {})}
                traceResult={traceResult}
                onConnectPort={onConnectPort && ((portId) => { close(); onConnectPort(portId); })}
              />
            )}
            substationId={substationId}
            types={catalog.data?.types ?? []}
          />
        )}

        {effectiveTab === 'info' && (
          <InfoTab
            assetId={assetId}
            asset={asset}
            type={type}
            assembliesById={assembliesById}
            effectiveAssets={effectiveAssets}
          />
        )}

        {effectiveTab === 'photos' && <PhotoCard assetId={assetId} />}

        {effectiveTab === 'records' && (
          <>
          <RecordsTab
            assetId={assetId}
            kind="inspections"
            dateField="inspectedAt"
            extraField="result"
            dateLabel="점검일"
            extraLabel="결과"
            /* 카드 머리는 탭 이름과 같다 — 「점검」 탭을 눌렀는데 「점검 기록」이 서면
               다른 것으로 읽힌다. */
            sectionTitle="점검"
            emptyMessage="점검 기록이 없습니다"
          />
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
          </>
        )}

        {effectiveTab === 'connections' && (
          <ConnectionsTab
            assetId={assetId}
            focusPortId={focusPortId}
            onSelectAsset={onSelectAsset}
            onTrace={onTrace ?? (() => {})}
            onClearTrace={onClearTrace ?? (() => {})}
            traceResult={traceResult}
            onConnectPort={onConnectPort}
            cablePick={cablePick}
          />
        )}
      </div>

    </div>
  );
}
