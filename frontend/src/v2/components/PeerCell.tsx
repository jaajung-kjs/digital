/**
 * PeerCell — 선번장·계통 테이블 공용 피어 셀 표시 컴포넌트 (M-2 중복 제거)
 *
 * FiberRegisterView / PowerRegisterView 양쪽에서 완전 동일한 PeerCell이
 * 복제되어 있었으므로 공용 추출.
 */
import { Badge } from '../../components/ui/Badge';
import type { PeerInfo } from '../peerResolve';

interface PeerCellProps {
  peer: PeerInfo | null;
}

export function PeerCell({ peer }: PeerCellProps) {
  if (!peer) return <span className="text-content-faint">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="text-sm text-content">
        {peer.assetName} · {peer.portName}
      </span>
      {peer.remote && peer.substationName && (
        <Badge status="info">{peer.substationName}</Badge>
      )}
    </span>
  );
}
