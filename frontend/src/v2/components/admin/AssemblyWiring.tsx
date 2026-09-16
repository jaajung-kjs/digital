/**
 * AssemblyWiring — 구성 편집에서 **장비끼리 잇는다.**
 *
 * 랙 한 대짜리 설비의 안쪽 배선은 어느 국에 놓든 같다(정류기 출력이 모선에 물리는 자리는
 * 설비의 생김새이지 그 국의 사정이 아니다). 그런데 여기서 이을 길이 없어서, 같은 결선을
 * **설비를 놓을 때마다 손으로 다시** 이어야 했다.
 *
 * **어법은 케이블 연결과 같다.** 포트를 누르면 「이을 상대를 고르세요」가 되고, 이을 수 있는
 * 자리만 또렷해진다. 다른 장비의 포트를 고르려면 격자에서 그 장비를 누르면 된다 — 고르는
 * 중이라는 사실은 판 위에 남아 있는다.
 *
 * 판정은 이 화면이 하지 않는다. `linkTargets` 가 `validateConnection` 을 그대로 부른다 —
 * 여기서 규칙을 다시 쓰면 화면에서는 이어지는데 저장할 때 튕기는 짝을 만들 수 있다.
 */
import { useMemo } from 'react';
import { linkPortKey } from '@twin/core';
import {
  Button, DetailCard, DetailCardHeader, EmptyState, MessageStrip, cn,
} from '../../../components/ui';
import { Unlink } from 'lucide-react';
import { useMediumColor, useMediumLabel } from '../../hooks';
import { PortFaceplate, type PortState } from '../detail/PortFaceplate';
import { portSections } from './portSections';
import {
  draftItemPorts, linkAt, linkPeer, linkTargets,
  type AssemblyDraft, type AssemblyDraftItem, type AssemblyDraftLink,
} from '../../assemblyDraft';
import type { V2AssetType } from '../../types';

/** 고르는 중인 자리 — 격자에서 장비를 옮겨 다녀도 남아 있어야 해서 부모가 든다. */
export interface WiringPick {
  key: string;
  /** 사람이 읽는 이름 — 「배전부 · 전원 출력 1」. */
  label: string;
}

export function AssemblyWiring({
  draft, item, types, pick, onPick, onLink, onUnlink, selectedPortKey, onSelectPort,
}: {
  draft: AssemblyDraft;
  item: AssemblyDraftItem;
  types: readonly V2AssetType[];
  pick: WiringPick | null;
  onPick: (pick: WiringPick | null) => void;
  onLink: (fromKey: string, toKey: string) => void;
  onUnlink: (link: AssemblyDraftLink) => void;
  selectedPortKey: string | null;
  onSelectPort: (key: string | null) => void;
}) {
  const mediumColor = useMediumColor();
  const mediumLabel = useMediumLabel();
  const templates = types.find((t) => t.id === item.typeId)?.portTemplates ?? [];

  /* 판의 포트 id 가 곧 **구성의 자리**다 — 누른 것을 되짚을 수 있어야 이을 수 있다. */
  const sections = useMemo(
    () => portSections(templates, mediumLabel, mediumColor, (group, index) =>
      linkPortKey({ itemId: item.id, group, index }))
      .filter((s) => s.ports.length > 0),
    [templates, mediumLabel, mediumColor, item.id],
  );

  /** 고르는 중이면 **이을 수 있는 자리**만 살린다. */
  const targets = useMemo(
    () => (pick ? linkTargets(draft, types, pick.key) : null),
    [pick, draft, types],
  );
  const disabled = useMemo(() => {
    if (!targets) return undefined;
    const off = new Set<string>();
    for (const s of sections) for (const p of s.ports) if (!targets.has(p.id)) off.add(p.id);
    return off;
  }, [targets, sections]);

  /** 항목 id → 이름. 배선의 반대쪽을 사람 말로 부르려고. */
  const itemName = useMemo(
    () => new Map(draft.items.map((i) => [i.id, i.name || '이름 없는 장비'])),
    [draft.items],
  );
  /** 그 자리의 포트 이름 — 구성의 다른 장비 것도 부른다. */
  const portName = (itemId: string, group: string, index: number) => {
    const owner = draft.items.find((i) => i.id === itemId);
    if (!owner) return `${group} ${index}`;
    return draftItemPorts(owner, types).find((p) => p.group === group && p.index === index)?.name
      ?? `${group} ${index}`;
  };
  const endLabel = (itemId: string, group: string, index: number) =>
    `${itemName.get(itemId) ?? ''} · ${portName(itemId, group, index)}`;

  const selectedLink = selectedPortKey ? linkAt(draft.links, selectedPortKey) : null;
  const selectedPort = selectedPortKey
    ? draftItemPorts(item, types).find((p) => p.key === selectedPortKey) ?? null
    : null;

  const onSelect = (portId: string) => {
    /* 고르는 중이면 **잇는다** — 못 이을 자리는 애초에 눌리지 않는다(`disabled`). */
    if (pick && pick.key !== portId) { onLink(pick.key, portId); return; }
    if (pick && pick.key === portId) { onPick(null); return; }
    onSelectPort(portId === selectedPortKey ? null : portId);
  };

  return (
    <DetailCard className="flex min-h-0 flex-1 flex-col">
      <DetailCardHeader
        title="포트"
        badge={`배선 ${draft.links.length}`}
        badgeStatus={draft.links.length > 0 ? 'success' : 'neutral'}
      />

      {/* 고르는 중이라는 사실은 **판 위에** 남는다 — 장비를 옮겨 다녀도 보인다. */}
      {pick && (
        <MessageStrip tone="info" className="mb-2">
          <span className="flex items-center justify-between gap-2">
            <span>「{pick.label}」과 이을 포트를 고르세요 — 다른 장비는 왼쪽 격자에서 누릅니다</span>
            <Button variant="ghost" size="sm" onClick={() => onPick(null)}>취소</Button>
          </span>
        </MessageStrip>
      )}

      {sections.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            title="포트가 없습니다"
            description="이 장비 품목에는 포트가 선언돼 있지 않습니다."
            className="py-6"
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PortFaceplate
            fill
            sections={sections}
            labelPrefix={item.name}
            selectedPortId={selectedPortKey}
            onSelect={onSelect}
            disabledPortIds={disabled}
            /* 이미 물린 자리는 찬 것으로 그린다 — 판만 봐도 어디가 남았는지 알 수 있다. */
            stateOf={(port): PortState => (linkAt(draft.links, port.id) ? 'full' : 'empty')}
          />
        </div>
      )}

      {/* 고른 포트의 사정 — 판은 지도이고 여기는 서식이다(상세 패널과 같은 규칙). */}
      {selectedPort && !pick && (
        <div className={cn('mt-2 flex items-center justify-between gap-2 rounded border border-line px-2.5 py-1.5')}>
          <span className="min-w-0 truncate text-sm text-content">
            {selectedPort.name}
            {selectedLink ? (
              <>
                {' → '}
                <span className="text-content-muted">
                  {(() => {
                    const peer = linkPeer(selectedLink, selectedPort.key);
                    return endLabel(peer.itemId, peer.group, peer.index);
                  })()}
                </span>
              </>
            ) : (
              <span className="ml-1 text-xs text-content-faint">미연결</span>
            )}
          </span>
          {selectedLink ? (
            <Button variant="ghost" size="sm" onClick={() => onUnlink(selectedLink)}>
              <Unlink size={13} /> 끊기
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onPick({ key: selectedPort.key, label: `${item.name} · ${selectedPort.name}` })}
            >
              배선 잇기
            </Button>
          )}
        </div>
      )}
    </DetailCard>
  );
}
