import { useMemo, useState } from 'react';
import { PromptModal, type TabItem } from '../../../components/ui';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import type { V2Asset, V2Floor } from '../../types';
import { newId } from '../../newId';

/**
 * 층을 만들고·고치고·지우는 일 — **탭 줄이 곧 관리 지점**이다.
 *
 * 평면도 파일에서 떼어 낸다. 층은 워킹카피의 것이 되면서 서버 호출이 사라졌고, 남은 것은
 * 「무엇을 쌓을까」와 「무엇을 못 지우나」뿐이라 캔버스와 아무것도 나눠 갖지 않는다.
 *
 * 상자를 함께 돌려주는 어법은 `useConfirm` 과 같다 — 여는 일과 그리는 일이 한 몸이라
 * 부르는 쪽이 상태를 따로 들고 있을 이유가 없다.
 */
export function useFloorAdmin(args: {
  substationId: string;
  floors: readonly V2Floor[];
  /** 지금 화면의 자산 — 층이 비었는지 여기서 센다. */
  assets: readonly V2Asset[];
  confirm: (opts: {
    title: string; target: string | null; message: string; confirmLabel?: string; danger?: boolean;
  }) => Promise<boolean>;
  /** 새 층을 만들면 그 층으로 옮겨 간다. */
  onCreated: (floorId: string) => void;
}): { tabItems: TabItem<string>[]; startAdd: () => void; floorPrompt: React.ReactNode } {
  const { substationId, floors, assets, confirm, onCreated } = args;
  const [adding, setAdding] = useState(false);
  /* 같은 이름을 막았다는 말 — 층 이름은 변전소 안에서 하나뿐이다(서버도 같은 규칙). */
  const [error, setError] = useState<string | null>(null);

  /**
   * 이 층에 놓인 자산 수 — **지금 화면의 것**만 센다.
   *
   * 예전에는 저장된 것과 화면의 것을 따로 셌다. 층 삭제만 서버가 즉시 하는 일이라, 그 층의
   * 설비를 지워도 저장 전에는 서버가 막았기 때문이다 — 「저장한 뒤 지울 수 있습니다」.
   * 층도 워킹카피의 것이 되면서 그 갈림이 사라졌다: 같은 저장에 자산 삭제와 층 삭제가 함께
   * 나가고, 서버는 자산을 먼저 치운 뒤 층을 지운다.
   */
  const load = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assets) if (a.floorId) m.set(a.floorId, (m.get(a.floorId) ?? 0) + 1);
    return (floorId: string) => m.get(floorId) ?? 0;
  }, [assets]);

  /** 이 층을 못 지우는 이유 — 없으면 `null`. */
  const blockedReason = (floorId: string): string | null => {
    const onScreen = load(floorId);
    return onScreen > 0 ? `이 층에 놓인 설비가 ${onScreen}개 있어 지울 수 없습니다` : null;
  };

  /** 이름이 겹치면 `false` — 그 자리에서 말하고 상자를 닫지 않는다. */
  const nameIsFree = (name: string, exceptId?: string): boolean => {
    if (floors.some((f) => f.id !== exceptId && f.name === name)) {
      setError(`이미 있는 층 이름입니다: ${name}`);
      return false;
    }
    return true;
  };

  function add(name: string) {
    /* 저장 때 서버도 같은 규칙으로 막지만, 그때 알면 늦다. */
    if (!nameIsFree(name)) return;
    setAdding(false);
    setError(null);
    const id = newId();
    const sortOrder = Math.max(0, ...floors.map((f) => f.sortOrder)) + 1;
    useV2WorkingCopy.getState().stageFloorCreate({ id, name, sortOrder, substationId, updatedAt: '' });
    onCreated(id);
  }

  function rename(id: string, name: string) {
    if (!nameIsFree(name, id)) return;
    useV2WorkingCopy.getState().stageFloorUpdate(id, { name });
  }

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: '층 삭제',
      target: name,
      message: '이 층의 도면과 배경이 함께 사라집니다.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    useV2WorkingCopy.getState().stageFloorDelete(id);
  }

  /* 층은 **탭이 곧 관리 지점**이다 — 두 번 눌러 이름을 고치고, 열린 탭의 `⋯` 에서 지운다
     (시트 탭 어법: Excel·AutoCAD 배치·Figma 페이지). */
  const tabItems = floors.map((f) => {
    const blocked = blockedReason(f.id);
    return {
      key: f.id,
      label: f.name,
      onRename: (name: string) => rename(f.id, name),
      menu: [
        {
          label: '층 삭제',
          danger: true,
          /* 못 누르는 이유를 항목이 직접 말한다 — 트리의 분류 삭제와 같은 어법. */
          disabled: blocked !== null,
          disabledReason: blocked ?? undefined,
          onSelect: () => void remove(f.id, f.name),
        },
      ],
    };
  });

  /* 겹친 이름은 **상자를 닫지 않고** 그 자리에서 말한다 — 다시 열어 다시 적게 하지 않는다. */
  const floorPrompt = (
    <PromptModal
      open={adding}
      title="층 추가"
      label="층 이름"
      placeholder="예: 1층"
      error={error}
      onConfirm={add}
      onClose={() => { setAdding(false); setError(null); }}
    />
  );

  return { tabItems, startAdd: () => setAdding(true), floorPrompt };
}
