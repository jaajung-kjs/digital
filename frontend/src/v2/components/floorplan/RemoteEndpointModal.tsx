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
 *   변전소(조직 트리 순서, 이름으로 거르기) → 그 국의 설비(층별로 묶어) → 포트
 *
 * 한 걸음마다 그 자리의 것이 **다 보이고**, 검색은 목록을 좁히는 보조 수단일 뿐이다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { portHasRoom } from '@twin/core';
import { Button, EmptyState, Input, Modal, SELECTABLE, cn } from '../../../components/ui';
import { browseAssets, fetchAssetPorts } from '../../api';
import type { AssetSearchResult } from '../../api';
import { useV2OrgTree } from '../../hooks';
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
  const [query, setQuery] = useState('');
  const [substation, setSubstation] = useState<{ id: string; name: string } | null>(null);
  const [assets, setAssets] = useState<AssetSearchResult[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetSearchResult | null>(null);
  const [ports, setPorts] = useState<V2Port[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(false);
  const fetchSeqRef = useRef(0);

  // 모달 닫힐 때 상태 초기화
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSubstation(null);
      setAssets([]);
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

  /** 그 국의 것 — **층별로 묶어** 보여 준다(도면에서 찾던 그 순서). */
  const byFloor = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = q ? assets.filter((a) => `${a.name} ${a.typeName}`.toLowerCase().includes(q)) : assets;
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

  async function openSubstation(s: { id: string; name: string }) {
    const seq = ++fetchSeqRef.current;
    setSubstation(s);
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
      // 가득 찬 포트 제외 + medium 필터 + 첫 끝점 제외
      setPorts(
        data.filter((p) => {
          if (p.occupied) return false;
          if (!portHasRoom(p.medium, cableCountByPortId.get(p.id) ?? 0)) return false;
          if (p.id === excludePortId) return false;
          if (mediumFilter && p.medium !== mediumFilter) return false;
          return true;
        }),
      );
    } catch {
      if (seq !== fetchSeqRef.current) return;
      setPorts([]);
    } finally {
      if (seq === fetchSeqRef.current) setLoadingPorts(false);
    }
  }

  /** 한 걸음 뒤로 — 포트 → 설비 → 변전소. */
  function back() {
    fetchSeqRef.current++; // 도착하는 응답 무시
    if (selectedAsset) {
      setSelectedAsset(null);
      setPorts([]);
      return;
    }
    setSubstation(null);
    setAssets([]);
    setQuery('');
  }

  const row = 'w-full rounded px-2 py-1.5 text-left';

  return (
    <Modal open={open} onClose={onClose} title="다른 층·변전소에서 포트 선택" size="md">
      <div className="space-y-3">
        {/* 어디까지 내려왔는지 — 걸음마다 되짚어 올라갈 수 있다. */}
        {(substation || selectedAsset) && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={back}>
              ← 뒤로
            </Button>
            <p className="min-w-0 truncate text-xs text-content-muted">
              {substation?.name}
              {selectedAsset ? ` · ${selectedAsset.name}` : ''}
            </p>
          </div>
        )}

        {errorText && <p className="text-xs text-danger">{errorText}</p>}

        {!substation ? (
          /* ① 변전소 — 조직 트리 순서대로 **전부** 선다. 검색은 좁히는 데만 쓴다. */
          <>
            <Input
              autoFocus
              aria-label="변전소 검색"
              placeholder="변전소 이름으로 좁히기"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
            {shownSubstations.length === 0 ? (
              <EmptyState title="맞는 변전소가 없습니다" />
            ) : (
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {shownSubstations.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={cn(row, SELECTABLE)} onClick={() => void openSubstation(s)}>
                      <span className="block text-sm text-content">{s.name}</span>
                      {s.place && <span className="block text-xs text-content-muted">{s.place}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : !selectedAsset ? (
          /* ② 그 국의 설비 — **층별로 묶어** 전부. 이름으로 좁힐 수도 있다. */
          <>
            <Input
              autoFocus
              aria-label="설비 이름으로 좁히기"
              placeholder="설비 이름으로 좁히기"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
            {loadingAssets ? (
              <p className="py-2 text-xs text-content-faint">불러오는 중…</p>
            ) : byFloor.length === 0 ? (
              <EmptyState title="이 변전소에는 놓인 설비가 없습니다" />
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {byFloor.map(([floor, list]) => (
                  <section key={floor} className="mb-2">
                    {/* 층 이름은 **본문의 한 줄**이다 — 머리글 옷을 입히지 않는다(표와 같은 규칙). */}
                    <h4 className="border-t border-line px-2 py-1 text-xs font-semibold text-content">{floor}</h4>
                    <ul className="divide-y divide-line">
                      {list.map((a) => (
                        <li key={a.id}>
                          <button type="button" className={cn(row, SELECTABLE)} onClick={() => void handleSelectAsset(a)}>
                            <span className="block text-sm text-content">{a.name}</span>
                            <span className="block text-xs text-content-muted">{a.typeName}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        ) : (
          /* ③ 포트 — 이을 수 있는 것만. */
          <>
            {loadingPorts ? (
              <p className="py-2 text-xs text-content-faint">포트 불러오는 중…</p>
            ) : ports.length === 0 ? (
              <EmptyState title="이을 수 있는 포트가 없습니다" description="모두 차 있거나 종류가 맞지 않습니다." />
            ) : (
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {ports.map((port) => (
                  <li key={port.id}>
                    <button
                      type="button"
                      className={cn(row, 'flex items-center gap-2', SELECTABLE)}
                      onClick={() => onSelectPort(port, selectedAsset)}
                    >
                      <span className="text-sm text-content">{port.name}</span>
                      <span className="ml-auto text-xs text-content-faint">{port.group}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
