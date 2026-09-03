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
import { endpointLabel, endpointLabelParts, type PeerInfo } from '../../peerResolve';

interface PeerCellProps {
  peer: PeerInfo | null;
  /**
   * 이 대국으로 **간다** — 그 장비를 열고 그 포트를 고른 상태로.
   *
   * 추적 마디는 눌러서 갈 수 있는데(`TraceNodeText`) 대장의 대국 칸은 글자였다. 「이 대국이
   * 대체 어느 장비지」 싶으면 도면으로 나가 이름으로 다시 찾아야 했다 — 이름은 여기 이미
   * 있는데. 어디서 장비 이름을 누르든 **같은 일**이 일어나게 둔다.
   */
  onSelect?: (assetId: string, portId: string) => void;
}

export function PeerCell({ peer, onSelect }: PeerCellProps) {
  if (!peer) return <span className="text-content-faint">{EMPTY}</span>;
  /**
   * 국 이름은 **붙이지 않는다** — 슬롯 이름이 이미 그것을 말한다.
   *
   * 한때 여기에 `춘천S/S · …` 를 앞세웠다. 두 국의 판이 둘 다 「슬롯 1」이라 제자리를
   * 가리키는 것처럼 읽혔기 때문인데, 그건 이름이 제구실을 못 한 탓이었다. 이제 선로가
   * 슬롯 이름을 짓는다(`서홍천S/S - 춘천S/S - 1`) — 같은 말을 두 번 적지 않는다.
   */
  const label = endpointLabel(peer);
  const full = peer.remote && peer.substationName ? `${label} (${peer.substationName})` : label;

  /* 앞자리와 번호를 가른다 — 앞은 그 줄들이 공유하는 자리, 뒤는 그 줄만의 번호다.
     경계는 이름을 지은 곳이 알려 준다(`#` 를 찾던 때는 코어 이름에서 갈리지 않았다). */
  const { prefix, tail } = endpointLabelParts(peer);
  const body = prefix ? (
    <>
      <span className="truncate text-content-muted">{prefix}</span>
      <span className="shrink-0 font-medium text-content">{tail}</span>
    </>
  ) : (
    <span className="truncate text-content">{label}</span>
  );

  /* 갈 자리가 없으면(상대 국·삭제된 끝점) 글자 그대로 둔다 — 눌리는 것처럼 보이는데 아무
     일도 안 일어나는 칸이 열마다 서면 그게 더 나쁘다. */
  if (!peer.assetId || !peer.portId || !onSelect) {
    return <span className="flex min-w-0 text-sm" title={full}>{body}</span>;
  }
  const { assetId, portId } = peer;
  return (
    <button
      type="button"
      /* 색은 그대로 둔다 — 대국 열이 통째로 파랗게 서면 표가 시끄러워지고, 정작 줄마다
         다른 것(뒤의 번호)이 안 도드라진다. 눌린다는 것은 밑줄과 커서가 말한다. */
      className="flex min-w-0 cursor-pointer text-left text-sm hover:underline"
      title={`${full} 으로 이동`}
      /* 줄 자신도 누르면 골라진다 — 여기서 멈추지 않으면 갈 곳과 고를 곳이 함께 일어난다. */
      onClick={(e) => { e.stopPropagation(); onSelect(assetId, portId); }}
    >
      {body}
    </button>
  );
}
