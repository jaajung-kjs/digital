/**
 * PeerCell — 선번장·계통 표의 대국 칸.
 *
 * **선번장에서는 설비 이름만 적는다**(`compact`). 한 슬롯의 스물네 줄이 같은 설비를
 * 가리키므로 `송광치 - 광단말 A#1` 처럼 적으면 앞 글자가 스물네 번 반복되고, 정작 읽을
 * 것(측정값)이 오른쪽으로 밀린다. 어느 장비의 몇 번 포트인지는 그 줄을 누르면 상세가
 * 말한다 — 표는 「어디로 가는가」만 말하면 된다.
 *
 * 이름을 짓는 규칙 자체는 `endpointLabel` 하나가 갖는다(계통·추적은 그 긴 이름을 쓴다).
 */
import { EMPTY } from '../../../components/ui';
import { endpointLabel, type PeerInfo } from '../../peerResolve';

interface PeerCellProps {
  peer: PeerInfo | null;
  /** 설비 이름만 — 표가 좁은 자리(선번장). */
  compact?: boolean;
}

export function PeerCell({ peer, compact }: PeerCellProps) {
  if (!peer) return <span className="text-content-faint">{EMPTY}</span>;
  const label = endpointLabel(peer);
  /* 상대 변전소는 **배지로 달지 않는다** — 대국이 상대 국에 있다는 것은 OPGW 를 탔다는
     뜻이고 그건 그 줄이 이미 말한다. 좁은 칸에서 배지가 정작 장비 이름을 밀어냈다.
     정보 자체는 버리지 않고 툴팁에 남긴다. */
  const full = peer.remote && peer.substationName ? `${label} (${peer.substationName})` : label;

  if (compact) {
    /* 설비가 있으면 설비 이름, 없으면(설비 자신이 끝점) 그 이름. */
    const short = peer.assemblyName ?? peer.assetName;
    return (
      <span className="flex min-w-0 text-sm" title={full}>
        <span className="truncate text-content">{short}</span>
      </span>
    );
  }

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
