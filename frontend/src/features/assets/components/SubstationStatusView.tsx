import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelection } from '../../workspace/SelectionContext';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useSubstationStatusRows } from '../useSubstationStatusRows';
import { NodeStatusView } from './NodeStatusView';

// ──────────────────────────────────────────────────────────────────────────
// SSOT-2c Task 4 — 현황을 통합 store(useSubstationWorkingCopy)로.
//
// 리스트+인스펙터는 NodeStatusView(자가 완결: 리스트 flex-1 + 우측 인스펙터)가
// 담당한다. 변전소는 편집 가능:
// - rows: useSubstationStatusRows(useNodeAssets + store overlay 라이브 머지).
// - resolveAsset: effective(스테이징 반영)에서 선택 자산을 찾는다 — 리스트와 동일 소스.
// - onPatch: stageAssetUpdate 로 store 에 스테이지 → 편집이 인스펙터·리스트 양쪽에 즉시 반영.
// 선택은 NodeStatusView 가 공유 SelectionContext(에디터 선택 브리지)를 사용한다.
// 커밋은 워크스페이스의 WorkingCopyCommitBar(T2)가 담당한다.
// ──────────────────────────────────────────────────────────────────────────

export function SubstationStatusView({ substationId }: { substationId: string }) {
  const rows = useSubstationStatusRows(substationId);
  const effective = useEffectiveAssets();
  const sel = useSelection();

  const [searchParams, setSearchParams] = useSearchParams();
  // ?assetId= 딥링크 소비 — 자산 로드 후 공유 선택에 반영, 파라미터 제거.
  useEffect(() => {
    const assetId = searchParams.get('assetId');
    if (!assetId) return;
    if (!effective.find((a) => a.id === assetId)) return; // 아직 로드 안 됨 → 다음 렌더에 재시도
    sel?.setSelectedAssetId(assetId);
    setSearchParams((p) => { p.delete('assetId'); return p; }, { replace: true });
    // deps: effective(자산 로드 대기)+searchParams 만. set* 는 안정 식별자라 의도적 생략.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective, searchParams]);

  return (
    <NodeStatusView
      nodeType="substation"
      nodeId={substationId}
      rows={rows}
      resolveAsset={(id) => effective.find((a) => a.id === id)}
      onPatch={(id, patch) => useSubstationWorkingCopy.getState().stageAssetUpdate(id, patch)}
    />
  );
}
