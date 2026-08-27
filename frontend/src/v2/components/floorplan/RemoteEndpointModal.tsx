/**
 * RemoteEndpointModal — **이 도면 밖의 끝점**을 찾아 고르는 상자.
 *
 * 케이블은 도면을 눌러 잇지만 반대쪽이 이 도면에 없으면 누를 것이 없다. 다른 변전소로 나가는
 * OPGW 가 그렇고, **같은 국의 다른 층**도 그렇다 — 층을 옮기면 고르던 끝점이 따라가 버려서
 * 층 넘는 케이블은 아예 만들 수가 없었다.
 *
 * **찾기가 아니라 둘러보기다.** 예전에는 검색칸 하나뿐이었다 — 다른 국의 설비 이름을 외우고
 * 있는 사람만 쓸 수 있는 문이었다(「뭐 어떻게 찾으라는 거냐」). 이제 세 걸음으로 내려간다:
 *
 *   변전소 → 그 국의 **설비**(층별로 묶어) → 그 설비 안의 **장비** → 포트
 *
 * 도면에서 하는 일과 같은 순서다: 놓인 설비를 짚고, 그 안의 장비를 짚고, 그 포트를 짚는다.
 * 한 걸음마다 그 자리의 것이 **다 보이고**, 검색은 목록을 좁히는 보조 수단일 뿐이다.
 *
 * 상자의 **키는 걸음마다 바뀌지 않는다** — 목록이 길든 짧든 같은 자리에 서야 눈이 따라간다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { comparePortGroups, portGroupLabel } from '@twin/core';
import { Button, EmptyState, Input, Modal, SELECTABLE, cn } from '../../../components/ui';
import { browseAssets, fetchAssetPorts } from '../../api';
import { canPickPort } from '../../cableSelectors';
import type { AssetSearchResult } from '../../api';
import { useMediumColor, useMediumLabel, useV2OrgTree } from '../../hooks';
import { PortFaceplate } from '../detail/PortFaceplate';
import { flattenTree } from '../../orgTreeSelectors';
import type { V2Port } from '../../types';

/** 층이 없는 것(미배치)은 맨 뒤에 모은다 — 있는 자리부터 보여 준다. */
const UNPLACED = '미배치';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 연결할 medium 필터 (undefined 이면 전체 허용) */
  mediumFilter?: string;
  /** 이미 선택된 첫 끝점 포트 ID — 결과에서 제외 */
  excludePortId?: string;
  /** 포트별 케이블 수 — 가득 찼는지는 종류가 정한다(접지 부스바는 여러 가닥). */
  cableCountByPortId: ReadonlyMap<string, number>;
  /** 포트 선택 완료 콜백 (모달은 자동으로 닫히지 않음 — 호출자가 닫는다) */
  onSelectPort: (port: V2Port, asset: AssetSearchResult) => void;
  /** 검증 실패 등 에러 메시지 — 포트 리스트 위에 표시 */
  errorText?: string | null;
}

export function RemoteEndpointModal({
  open,
  onClose,
  mediumFilter,
  excludePortId,
  cableCountByPortId,
  onSelectPort,
  errorText,
}: Props) {
  const { data: tree } = useV2OrgTree();
  const mediumLabel = useMediumLabel();
  const mediumColor = useMediumColor();
  const [query, setQuery] = useState('');
  const [substation, setSubstation] = useState<{ id: string; name: string } | null>(null);
  const [assets, setAssets] = useState<AssetSearchResult[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assembly, setAssembly] = useState<AssetSearchResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetSearchResult | null>(null);
  /* 서버가 「이미 물렸나」를 함께 준다 — 이 국의 판은 워킹 카피에서 세지만 저쪽은 서버가 안다. */
  const [ports, setPorts] = useState<(V2Port & { occupied: boolean })[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(false);
  const fetchSeqRef = useRef(0);

  // 모달 닫힐 때 상태 초기화
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSubstation(null);
      setAssets([]);
      setAssembly(null);
      setSelectedAsset(null);
      setPorts([]);
      fetchSeqRef.current++; // 레이스 토큰 리셋 — close 후 도착하는 응답 무시
    }
  }, [open]);

  /** 고를 수 있는 변전소 — **조직 트리 순서 그대로**(본부·지사 아래에 매달린 차례). */
  const substations = useMemo(() => {
    const nodes = tree ? flattenTree(tree) : [];
    const parents = new Map(nodes.map((n) => [n.id, n]));
    return nodes
      .filter((n) => n.kind === 'substation')
      .map((n) => {
        const branch = n.parentId ? parents.get(n.parentId) : null;
        const hq = branch?.parentId ? parents.get(branch.parentId) : null;
        return { id: n.id, name: n.name, place: [hq?.name, branch?.name].filter(Boolean).join(' · ') };
      });
  }, [tree]);

  const shownSubstations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return substations;
    return substations.filter((s) => `${s.name} ${s.place}`.toLowerCase().includes(q));
  }, [substations, query]);

  /** 그 국의 **설비** — 층별로 묶어(도면에 놓인 것이 설비다). */
  const byFloor = useMemo(() => {
    const q = query.trim().toLowerCase();
    const placed = assets.filter((a) => a.isAssembly);
    const shown = q ? placed.filter((a) => `${a.name} ${a.typeName}`.toLowerCase().includes(q)) : placed;
    const groups = new Map<string, AssetSearchResult[]>();
    for (const a of shown) {
      const key = a.floorName ?? UNPLACED;
      const list = groups.get(key);
      if (list) list.push(a);
      else groups.set(key, [a]);
    }
    return [...groups.entries()].sort(([a], [b]) =>
      a === UNPLACED ? 1 : b === UNPLACED ? -1 : a.localeCompare(b, 'ko'),
    );
  }, [assets, query]);

  /** 이 설비 안의 장비 — 포트는 장비가 갖는다. */
  const parts = useMemo(() => {
    if (!assembly) return [];
    const q = query.trim().toLowerCase();
    const children = assets.filter((a) => a.parentAssetId === assembly.id);
    return q ? children.filter((a) => `${a.name} ${a.typeName}`.toLowerCase().includes(q)) : children;
  }, [assets, assembly, query]);

  async function openSubstation(s: { id: string; name: string }) {
    const seq = ++fetchSeqRef.current;
    setSubstation(s);
    setAssembly(null);
    setQuery('');
    setAssets([]);
    setLoadingAssets(true);
    try {
      const data = await browseAssets(s.id);
      if (seq !== fetchSeqRef.current) return;
      setAssets(data);
    } catch {
      if (seq === fetchSeqRef.current) setAssets([]);
    } finally {
      if (seq === fetchSeqRef.current) setLoadingAssets(false);
    }
  }

  // 자산 선택 → 포트 목록 로드 (레이스 토큰: 응답 도착 시 현재 선택 자산과 불일치면 무시)
  async function handleSelectAsset(asset: AssetSearchResult) {
    const seq = ++fetchSeqRef.current;
    setSelectedAsset(asset);
    setPorts([]);
    setLoadingPorts(true);
    try {
      const data = await fetchAssetPorts(asset.id);
      if (seq !== fetchSeqRef.current) return;
      /* 판은 **자리를 지킨다** — 못 고르는 포트도 그려야 「몇 번 자리가 찼는지」가 보인다.
         고를 수 있냐 없냐는 `canPick` 이 가르고, 판이 그것을 색과 눌림으로 말한다. */
      setPorts(data);
    } catch {
      if (seq !== fetchSeqRef.current) return;
      setPorts([]);
    } finally {
      if (seq === fetchSeqRef.current) setLoadingPorts(false);
    }
  }

  /** 이을 수 있는 포트 — 규칙은 이 국의 판과 **같은 함수**가 쥔다(`canPickPort`). */
  const canPick = useMemo(() => {
    const ok = new Set<string>();
    for (const p of ports) {
      /* 서버가 셈해 준 「이미 물렸다」도 함께 본다 — 다른 국의 케이블은 이 워킹 카피에 없다. */
      if (p.occupied) continue;
      if (canPickPort(p, { cableCount: cableCountByPortId.get(p.id) ?? 0, medium: mediumFilter, excludePortId })) ok.add(p.id);
    }
    return ok;
  }, [ports, cableCountByPortId, excludePortId, mediumFilter]);

  const disabledPortIds = useMemo(
    () => new Set(ports.filter((p) => !canPick.has(p.id)).map((p) => p.id)),
    [ports, canPick],
  );

  /** 판의 구획 — 차례도 이름도 **어휘가 정한다**(이 국의 판과 같은 함수). */
  const sections = useMemo(() => {
    const byGroup = new Map<string, V2Port[]>();
    for (const p of ports) {
      const list = byGroup.get(p.group);
      if (list) list.push(p);
      else byGroup.set(p.group, [p]);
    }
    for (const [, list] of byGroup) list.sort((a, b) => a.index - b.index);
    const refs = [...byGroup.entries()].map(([group, list]) => ({
      group, medium: list[0]!.medium, direction: list[0]!.direction, sampleName: list[0]!.name, positions: list[0]!.positions,
    }));
    return refs
      .slice()
      .sort(comparePortGroups)
      .map((ref) => ({
        key: ref.group,
        label: portGroupLabel(ref, refs, mediumLabel),
        accent: mediumColor(ref.medium),
        ports: byGroup.get(ref.group)!,
      }));
  }, [ports, mediumLabel, mediumColor]);

  /** 한 걸음 뒤로 — 포트 → 장비 → 설비 → 변전소. */
  function back() {
    fetchSeqRef.current++; // 도착하는 응답 무시
    setQuery('');
    if (selectedAsset) {
      setSelectedAsset(null);
      setPorts([]);
      return;
    }
    if (assembly) {
      setAssembly(null);
      return;
    }
    setSubstation(null);
    setAssets([]);
  }

  const row = 'w-full rounded px-2 py-1.5 text-left';
  /** 지금 어느 걸음인가 — 되짚는 줄과 본문이 같은 것을 본다. */
  const trail = [substation?.name, assembly?.name, selectedAsset?.name].filter(Boolean).join(' · ');

  return (
    <Modal open={open} onClose={onClose} title="다른 층·변전소에서 포트 선택" size="md">
      {/* **키를 못 박는다** — 걸음마다 목록 길이가 달라도 상자가 커졌다 작아졌다 하지 않는다.
          안이 넘치면 그 안에서만 구른다(바깥 상자는 그대로). */}
      <div className="flex h-96 flex-col gap-3">
        {/* 어디까지 내려왔는지 — 걸음마다 되짚어 올라갈 수 있다. */}
        {trail && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={back}>
              ← 뒤로
            </Button>
            <p className="min-w-0 truncate text-xs text-content-muted">{trail}</p>
          </div>
        )}

        {errorText && <p className="shrink-0 text-xs text-danger">{errorText}</p>}

        {/* 검색은 **목록을 좁히는 보조**다 — 포트 고르기에는 없다(그 자리에서 셀 만큼 적다). */}
        {!selectedAsset && (
          <Input
            autoFocus
            aria-label="검색"
            placeholder="검색"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            className="shrink-0"
          />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!substation ? (
            /* ① 변전소 — 조직 트리 순서대로 **전부** 선다. */
            shownSubstations.length === 0 ? (
              <EmptyState title="맞는 변전소가 없습니다" />
            ) : (
              <ul className="divide-y divide-line">
                {shownSubstations.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={cn(row, SELECTABLE)} onClick={() => void openSubstation(s)}>
                      <span className="block text-sm text-content">{s.name}</span>
                      {s.place && <span className="block text-xs text-content-muted">{s.place}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : !assembly ? (
            /* ② 그 국의 **설비** — 층별로 묶어(도면에 놓인 것이 설비다). */
            loadingAssets ? (
              <p className="py-2 text-xs text-content-faint">불러오는 중…</p>
            ) : byFloor.length === 0 ? (
              <EmptyState title="이 변전소에는 놓인 설비가 없습니다" />
            ) : (
              byFloor.map(([floor, list]) => (
                <section key={floor} className="mb-2">
                  {/* 층 이름은 **본문의 한 줄**이다 — 머리글 옷을 입히지 않는다(표와 같은 규칙). */}
                  <h4 className="border-t border-line px-2 py-1 text-xs font-semibold text-content">{floor}</h4>
                  <ul className="divide-y divide-line">
                    {list.map((a) => (
                      <li key={a.id}>
                        <button type="button" className={cn(row, SELECTABLE)} onClick={() => { setAssembly(a); setQuery(''); }}>
                          <span className="block text-sm text-content">{a.name}</span>
                          <span className="block text-xs text-content-muted">{a.typeName}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )
          ) : !selectedAsset ? (
            /* ③ 그 설비 안의 **장비** — 포트는 장비가 갖는다. 없으면 설비 자신의 포트로 간다. */
            parts.length === 0 ? (
              <EmptyState
                title="이 설비 안에 장비가 없습니다"
                description="설비 자신의 포트를 보려면 아래를 누르세요."
              />
            ) : (
              <ul className="divide-y divide-line">
                {parts.map((a) => (
                  <li key={a.id}>
                    <button type="button" className={cn(row, SELECTABLE)} onClick={() => void handleSelectAsset(a)}>
                      <span className="block text-sm text-content">{a.name}</span>
                      <span className="block text-xs text-content-muted">{a.typeName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : /* ④ 포트 — **이 국에서 고를 때와 같은 판**이다(`PortFaceplate`).
                 여기만 목록으로 두면 같은 일(포트 고르기)을 화면마다 다시 익혀야 한다.
                 다른 것은 그 판에 닿기까지의 걸음(변전소·설비·장비)뿐이다. */
          loadingPorts ? (
            <p className="py-2 text-xs text-content-faint">포트 불러오는 중…</p>
          ) : sections.length === 0 ? (
            <EmptyState title="이을 수 있는 포트가 없습니다" description="모두 차 있거나 종류가 맞지 않습니다." />
          ) : (
            <PortFaceplate
              labelPrefix={selectedAsset.name}
              sections={sections}
              stateOf={(port) => (canPick.has(port.id) ? 'empty' : 'full')}
              disabledPortIds={disabledPortIds}
              selectedPortId={null}
              onSelect={(id) => {
                const port = ports.find((p) => p.id === id);
                if (port) onSelectPort(port, selectedAsset);
              }}
            />
          )}
        </div>

        {/* 장비가 없는 설비 — 그 설비 자신의 포트를 본다(단품으로 놓은 것). */}
        {assembly && !selectedAsset && parts.length === 0 && (
          <Button variant="secondary" size="sm" className="shrink-0" onClick={() => void handleSelectAsset(assembly)}>
            {assembly.name} 의 포트 보기
          </Button>
        )}
      </div>
    </Modal>
  );
}
