import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button, DetailRow, MessageStrip, Modal, Select } from '../../components/ui';
import type { PendingConnect } from '../connectSession';

interface CableGroup {
  key: string;
  name: string;
  categories: readonly { id: string; name: string }[];
}

/**
 * 두 끝점을 골랐다 — **무엇으로 이을지 확인받는다.**
 *
 * 케이블 종류를 묻는 자리가 여기인 까닭: 진입점마다 달랐고, 없는 곳도 있었다. 도면은 도구바
 * 드롭다운, 포트 탭은 **아예 없어서 매체 그룹의 첫 품목을 말없이 집었다**(광이면 「OPGW」가
 * 되는데 정작 이으려던 것이 광점퍼코드여도 그랬다). 그 뒤에는 오버레이로 모았지만 **고르기
 * 전에** 물으니, 안 고른 채 포트를 누르면 튕기면서 고른 포트가 버려졌다.
 *
 * 이제 순서가 하나다: 출발 → 포트를 고른다 → **이 상자가 뜬다** → 종류를 고르고 잇는다.
 * 묻는 시점이 「고른 직후」라서 무엇에 이으려는지가 글자로 함께 보이고, 접으면 고른 포트만
 * 버려지고 연결 모드는 그대로 남는다.
 *
 * 목록은 **출발 매체의 것만**이다 — 케이블의 매체는 출발 포트의 매체와 같아야 한다
 * (`validation/connection.ts`). 거르는 것이 규칙이 이미 말하는 사실이다.
 */
export function ConnectCategoryDialog({
  pending, groups, lastCategoryId, error, onConfirm, onCancel,
}: {
  pending: PendingConnect;
  groups: readonly CableGroup[];
  /** 그 매체에 직전에 쓴 종류 — 고른 채로 떠 있으니 숨은 값이 아니다. */
  lastCategoryId?: string | null;
  /** 못 이은 까닭 — 상자는 열린 채로 두고 여기 적는다(고른 포트를 버리지 않는다). */
  error?: string | null;
  onConfirm: (categoryId: string) => void;
  onCancel: () => void;
}) {
  const cats = groups.find((g) => g.key === pending.from.medium)?.categories ?? [];
  /*
   * 하나뿐이면 그것을 고른 채로 뜬다 — 그래도 누르는 걸음은 남는다(확인받는 자리다).
   *
   * 물려 오는 값은 **지금 목록에 있을 때만** 쓴다: 그 품목이 기준정보에서 사라졌으면 상자는
   * 빈칸처럼 보이는데 값은 남아 있어 「연결」이 눌리고, 없는 종류로 케이블이 선다.
   */
  const [categoryId, setCategoryId] = useState(() => {
    if (lastCategoryId && cats.some((c) => c.id === lastCategoryId)) return lastCategoryId;
    return cats.length === 1 ? cats[0]!.id : '';
  });

  return (
    <Modal
      open
      onClose={onCancel}
      title="케이블 종류"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>취소</Button>
          <Button disabled={!categoryId} onClick={() => categoryId && onConfirm(categoryId)}>연결</Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* 무엇과 무엇을 잇는지 — 고른 것을 글자로 되짚는다(도면에서는 점 둘이라 헷갈린다). */}
        <div className="flex items-center gap-2 rounded border border-line bg-surface-2 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-content">{pending.from.label}</span>
          <ArrowRight size={14} className="shrink-0 text-content-faint" />
          <span className="min-w-0 flex-1 truncate text-content">{pending.toLabel}</span>
        </div>

        {cats.length === 0 ? (
          /* 어휘에 그 매체의 케이블 종류가 없다 — 잇는 대신 어디로 가야 하는지 적는다. */
          <MessageStrip tone="warning">
            이 매체({pending.from.medium})로 쓸 케이블 종류가 없습니다 — 기준정보에서 먼저 만드세요.
          </MessageStrip>
        ) : (
          <DetailRow label="종류" required>
            <Select
              aria-label="케이블 종류"
              autoFocus
              value={categoryId}
              onChange={(e) => setCategoryId(e.currentTarget.value)}
            >
              {/* 비어 있으면 못 잇는다 — 짐작해 채우지 않는다. */}
              <option value="">— 고르세요 —</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </DetailRow>
        )}

        {error && <MessageStrip tone="danger">{error}</MessageStrip>}
      </div>
    </Modal>
  );
}
