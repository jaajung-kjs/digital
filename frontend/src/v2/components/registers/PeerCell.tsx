/**
 * PeerCell — 선번장·계통 표의 대국 칸.
 *
 * 이름은 `endpointLabel` 하나가 짓는다(`설비 - 장비#번호`). 예전에는 칸마다 제 손으로
 * 이어 붙여서 「광단말 A · 광 1」·「광단말A-광1」처럼 화면마다 다른 말이 나왔고, 장비
 * 이름만으로는 어느 송광치의 광단말 A 인지 고를 수도 없었다.
 *
 * **줄마다 다른 것만 진하다.** 한 슬롯의 열두 줄은 앞이 다 같고(`판암 송광치 - 광단말 A`)
 * 뒤의 번호만 다르다 — 열두 번 같은 굵기로 반복되면 눈이 매번 그 글자를 다시 읽고 나서야
 * 번호에 닿는다. 앞은 한 단 흐리게, 번호는 진하게 둔다. 값은 그대로 다 남긴다(줄을 지우면
 * 정렬·검색·복사에서 그 줄만 비어 버린다).
 */
import { EMPTY } from '../../../components/ui';
import { endpointLabel, type PeerInfo } from '../../peerResolve';

interface PeerCellProps {
  peer: PeerInfo | null;
}

export function PeerCell({ peer }: PeerCellProps) {
  if (!peer) return <span className="text-content-faint">{EMPTY}</span>;
  const label = endpointLabel(peer);
  /* 상대 변전소는 **배지로 달지 않는다** — 대국이 상대 국에 있다는 것은 OPGW 를 탔다는
     뜻이고 그건 그 줄이 이미 말한다. 좁은 칸에서 배지가 정작 장비 이름을 밀어냈다.
     정보 자체는 버리지 않고 툴팁에 남긴다. */
  const full = peer.remote && peer.substationName ? `${label} (${peer.substationName})` : label;

  /* `#` 앞뒤로 가른다 — 앞은 그 줄들이 공유하는 자리, 뒤는 그 줄만의 번호다. */
  const cut = label.lastIndexOf('#');
  return (
    <span className="flex min-w-0 text-sm" title={full}>
      {cut > 0 ? (
        <>
          <span className="truncate text-content-muted">{label.slice(0, cut)}</span>
          <span className="shrink-0 font-medium text-content">{label.slice(cut)}</span>
        </>
      ) : (
        <span className="truncate text-content">{label}</span>
      )}
    </span>
  );
}
