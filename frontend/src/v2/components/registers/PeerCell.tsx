/**
 * PeerCell — 선번장·계통 표의 대국 칸.
 *
 * 이름은 `endpointLabel` 하나가 짓는다(`설비 - 장비#번호`). 예전에는 칸마다 제 손으로
 * 이어 붙여서 「광단말 A · 광 1」·「광단말A-광1」처럼 화면마다 다른 말이 나왔고, 장비
 * 이름만으로는 어느 송광치의 광단말 A 인지 고를 수도 없었다.
 */
import { endpointLabel, type PeerInfo } from '../../peerResolve';

interface PeerCellProps {
  peer: PeerInfo | null;
}

export function PeerCell({ peer }: PeerCellProps) {
  if (!peer) return <span className="text-content-faint">—</span>;
  const label = endpointLabel(peer);
  /* 상대 변전소는 **배지로 달지 않는다** — 대국이 상대 국에 있다는 것은 OPGW 를 탔다는
     뜻이고 그건 그 줄이 이미 말한다. 좁은 칸에서 배지가 정작 장비 이름을 밀어냈다.
     정보 자체는 버리지 않고 툴팁에 남긴다. */
  const full = peer.remote && peer.substationName ? `${label} (${peer.substationName})` : label;
  return (
    <span className="min-w-0 truncate text-sm text-content" title={full}>
      {label}
    </span>
  );
}
