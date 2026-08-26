import { descendantCount } from './assetTree';
import { useV2WorkingCopy } from './store/workingCopyStore';
import type { V2Asset } from './types';

/**
 * **지우는 일도 문마다 다르면 안 된다** — 같은 것을 지우는데 묻는 말이 달랐다.
 *
 * 설비를 지우는 길은 둘(도면의 삭제 단추·Delete 키 / 상세 패널의 삭제)인데 각자 문구를
 * 적고 있었다: 「딸린 장비 2개가 함께 삭제됩니다.」 와 「딸린 장비 2개가 함께 삭제됩니다.
 * 계속하시겠습니까?」. 케이블은 더했다 — **도면에서는 묻지도 않고 지웠고**, 포트 탭에서는
 * 물었다. 같은 손짓에 다른 규칙이 붙으면 사람은 어느 쪽이 진짜인지 배울 수가 없다.
 *
 * 묻는 말과 지우는 일을 여기 한 번만 적는다. 지운 **뒤에** 할 일(선택 풀기·다시 그리기)은
 * 화면마다 다르므로 「지웠는가」만 돌려준다.
 */
export interface ConfirmOptions {
  title: string;
  target: string | null;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export type Confirm = (opts: ConfirmOptions) => Promise<boolean>;

/**
 * 설비(또는 그 안의 장비) 하나 — **딸린 것까지 함께** 걷어낸다.
 *
 * 되돌릴 수 있는 스테이지이지만 딸린 것이 함께 사라지므로 묻는다. 몇이 사라지는지는 세어서
 * 말한다 — 「2개가 함께」는 사람이 멈춰 서게 하지만 「하위 항목이 삭제됩니다」는 아니다.
 */
export async function deleteAssetWithConfirm(args: {
  asset: V2Asset;
  assets: readonly V2Asset[];
  confirm: Confirm;
}): Promise<boolean> {
  const n = descendantCount(args.assets, args.asset.id);
  const ok = await args.confirm({
    title: '설비 삭제',
    target: args.asset.name,
    message: n > 0 ? `딸린 장비 ${n}개가 함께 삭제됩니다.` : '이 설비를 삭제합니다.',
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return false;
  useV2WorkingCopy.getState().stageAssetDeleteCascade(args.asset.id);
  return true;
}

/** 케이블 한 가닥 — 지우면 그려 둔 경로점까지 사라지므로 어디서 지우든 묻는다. */
export async function deleteCableWithConfirm(args: {
  cableId: string;
  /** 무엇을 지우는지 — 「판암 광단말 A#1 으로 가는 케이블」처럼 상대를 적는다. */
  target: string;
  confirm: Confirm;
}): Promise<boolean> {
  const ok = await args.confirm({
    title: '케이블 삭제',
    target: args.target,
    message: '저장 전에는 되돌릴 수 있습니다.',
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return false;
  useV2WorkingCopy.getState().stageCableDelete(args.cableId);
  return true;
}
