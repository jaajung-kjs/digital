import { useMemo } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { floorAnchor } from '../../workingCopy/floorAnchor';
import { toMapById } from '../../../utils/byId';
import { useSelectionStore } from '../../workspace/selectionStore';
import { useCableDrawing } from '../stores/interactionStore';
import { useEditorStore } from '../stores/editorStore';
import { resolveAssetDetailKind } from '../../assets/components/detail/panels/resolveAssetDetailKind';
import { resolveSpatialSection } from '../../assets/components/detail/panels/resolveSpatialSection';
import type { Asset } from '../../../types/asset';

interface Crumb {
  id: string;
  name: string;
}

/**
 * 컨테이너(floor anchor) → 현재 노드까지의 브레드크럼 체인.
 * nodeId 에서 parentAssetId 로 거슬러 올라가며 anchor 까지 모은 뒤 뒤집는다.
 * (anchor 자신을 포함, 그 위 조상은 제외 — 컨테이너 내부 드릴다운만 보여준다.)
 */
function buildEndpointTrail(nodeId: string | null, assets: Asset[]): Crumb[] {
  if (!nodeId) return [];
  const byId = toMapById(assets);
  const anchor = floorAnchor(nodeId, byId);
  const anchorId = anchor?.id ?? null;
  const trail: Crumb[] = [];
  const seen = new Set<string>();
  let cur: Asset | undefined = byId.get(nodeId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    trail.unshift({ id: cur.id, name: cur.name });
    if (cur.id === anchorId) break; // anchor 가 루트 — 그 위는 자르기
    cur = cur.parentAssetId ? byId.get(cur.parentAssetId) : undefined;
  }
  return trail;
}

/**
 * 케이블 그리기 중 출발/도착 연결점을 고르는 다이얼로그.
 *
 * 기존엔 컨테이너(랙/OFD/분전반) 클릭 시 우측 상세 패널을 열어 그 안에서 endpoint 를
 * picking 했으나("뭘 눌러야 할지 모르겠다"는 혼란) → 자산 내부뷰를 중앙 다이얼로그로
 * 노출한다. 내부뷰는 평면도/현황/대장과 동일한 resolveSpatialSection 레지스트리를 재사용.
 *
 * 현재 노드는 selectionStore.selectedAssetId (캔버스 핸들러가 컨테이너 클릭 시 설정).
 * 드릴다운(분전반→피더, OFD→슬롯)은 내부뷰가 setSelectedAssetId 로 노드를 바꾸면
 * 이 다이얼로그가 새 노드로 다시 렌더되며 자연히 동작한다.
 */
export function CableEndpointDialog() {
  const phase = useCableDrawing()?.phase;
  const open = phase === 'pickingSourceEndpoint' || phase === 'pickingTargetEndpoint';

  const nodeId = useSelectionStore((s) => s.selectedAssetId);
  const setSelectedAssetId = useSelectionStore((s) => s.setSelectedAssetId);
  const assets = useEffectiveAssets();

  const asset = useMemo(
    () => assets.find((a) => a.id === nodeId) ?? null,
    [assets, nodeId],
  );

  // 에디터 상세 패널과 동일하게 detailKind 를 해석(SSOT) — assetType.role 단일 소스.
  const kind = useMemo(
    () => resolveAssetDetailKind(asset),
    [asset],
  );

  const section = useMemo(
    () => (kind && nodeId ? resolveSpatialSection(kind, nodeId) : null),
    [kind, nodeId],
  );

  const trail = useMemo(() => buildEndpointTrail(nodeId, assets), [nodeId, assets]);

  if (!open) return null;

  const title = phase === 'pickingSourceEndpoint' ? '출발지 선택' : '도착지 선택';

  return (
    <Modal
      open={open}
      onClose={() => useEditorStore.getState().cancelCableDrawing()}
      title={title}
      className="max-w-lg"
    >
      <p className="mb-3 text-xs text-content-faint">연결할 지점을 클릭하세요</p>

      {/* 브레드크럼은 실제 드릴다운(분전반›피더, OFD›슬롯)이 있을 때만 — 단일 컨테이너(랙 등)
          에선 컨테이너 이름 하나만 덜렁 떠 노이즈가 되므로 감춘다. */}
      {trail.length > 1 && (
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-content-muted">
          {trail.map((c, i) => {
            const isLast = i === trail.length - 1;
            return (
              <span key={c.id} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span className="text-content-faint">›</span>}
                {isLast ? (
                  <span className="text-content truncate">{c.name}</span>
                ) : (
                  <button
                    className="hover:underline truncate"
                    onClick={() => setSelectedAssetId(c.id)}
                  >
                    {c.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      )}

      {section?.node ?? (
        <p className="text-sm text-content-faint">
          이 자산에는 선택할 연결점이 없습니다.
        </p>
      )}
    </Modal>
  );
}
