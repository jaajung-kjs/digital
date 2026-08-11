/**
 * PeerCell — 선번장·계통 표의 대국 칸.
 *
 * **장비 이름만 적는다.** 포트 이름은 행이 이미 말하고 있다 — 선번장의 한 줄은 코어 하나이고
 * 그 번호가 첫 칸에 있으므로, 칸마다 「광단말 A · 광 1」로 적으면 「1」을 세 번 말하는 셈이다.
 * 실제로 그렇게 되어 있었고, 384px 표에서 정작 어느 장비인지가 잘렸다.
 *
 * 포트가 행 번호와 다를 수 있는 자리(계통의 대국처럼)에서는 `showPort` 로 켠다.
 */
import { Badge } from '../../../components/ui';
import type { PeerInfo } from '../../peerResolve';

interface PeerCellProps {
  peer: PeerInfo | null;
  /** 포트 이름까지 적는다 — 행 번호가 그 포트를 가리키지 않을 때만. */
  showPort?: boolean;
}

export function PeerCell({ peer, showPort = false }: PeerCellProps) {
  if (!peer) return <span className="text-content-faint">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="min-w-0 truncate text-sm text-content" title={`${peer.assetName} · ${peer.portName}`}>
        {showPort ? `${peer.assetName} · ${peer.portName}` : peer.assetName}
      </span>
      {peer.remote && peer.substationName && <Badge status="info">{peer.substationName}</Badge>}
    </span>
  );
}
