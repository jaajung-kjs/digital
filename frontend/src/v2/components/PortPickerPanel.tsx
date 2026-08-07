import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  DetailCard,
  DetailCardHeader,
  EmptyState,
  ErrorStrip,
  IconButton,
  Input,
  PanelHeader,
} from '../../components/ui';
import { portGroupLabel } from '@twin/core';
import { useMediumColor } from '../hooks';
import { PortMatrix, PortLegend } from './PortMatrix';
import type { V2Asset, V2Port } from '../types';

export interface PickerPortGroup {
  asset: V2Asset;
  /** 매체가 맞는 포트 전부 — 점유된 것도 자리를 지킨다(번호가 건너뛰면 판이 아니다). */
  ports: { port: V2Port; occupied: boolean }[];
}

interface Props {
  /** 캔버스에서 누른 자산 — 이 자산과 자손의 포트를 고른다. */
  rootAsset: V2Asset;
  groups: PickerPortGroup[];
  /** 아직 저장되지 않은 자산은 서버 포트가 없어 연결할 수 없다. */
  isUnsaved: boolean;
  /** 첫 끝점으로 이미 고른 포트 — 자기 자신과는 잇지 못한다. */
  excludePortId?: string;
  validationError?: string | null;
  onSelectPort: (port: V2Port) => void;
  onClose: () => void;
  /** 다른 변전소 자산을 대국으로 찾는다. */
  onSearchRemote?: () => void;
}

/**
 * 케이블 연결용 포트 선택 — 우측 패널.
 *
 * 예전에는 클릭 지점에 240px 팝오버가 떴는데, 랙·함체를 누르면 **자손 장비의 포트까지**
 * 함께 나온다. 실측: 광슬롯 4개를 담은 OFD 하나가 96개, 12개를 채우면 288개 —
 * 한 번에 9개씩 보이고 검색도 없어서 원하는 코어까지 열 번 넘게 스크롤해야 했다.
 * 그 사이 그룹 머리줄이 위로 사라져 지금 몇 번 슬롯인지도 잃는다.
 *
 * 넓은 패널에 판(매트릭스)으로 펼치면 "어디가 비었나" 가 한눈에 들어오고, 검색으로
 * 장비·포트 이름을 좁힐 수 있다. 판 자체는 상세 화면과 같은 `PortMatrix` 를 쓴다.
 */
export function PortPickerPanel({
  rootAsset,
  groups,
  isUnsaved,
  excludePortId,
  validationError,
  onSelectPort,
  onClose,
  onSearchRemote,
}: Props) {
  const [query, setQuery] = useState('');
  const mediumColor = useMediumColor();

  // 다른 자산을 누르면 이전 검색어가 남지 않게 한다.
  useEffect(() => setQuery(''), [rootAsset.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        ports: g.ports.filter(
          ({ port }) =>
            port.id !== excludePortId &&
            (q === '' ||
              port.name.toLowerCase().includes(q) ||
              g.asset.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((g) => g.ports.length > 0);
  }, [groups, query, excludePortId]);

  const totalFree = filtered.reduce((n, g) => n + g.ports.filter((p) => !p.occupied).length, 0);

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l border-line bg-surface">
      <PanelHeader
        title={rootAsset.name}
        className="shrink-0"
        actions={
          <IconButton aria-label="포트 선택 닫기" size="sm" onClick={onClose}>
            <X size={14} />
          </IconButton>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <ErrorStrip message={validationError} />

        {isUnsaved ? (
          <EmptyState title="저장 후 연결할 수 있습니다" description="새로 놓은 자산은 저장해야 포트가 만들어집니다." />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Input
                size="sm"
                autoFocus
                aria-label="포트 검색"
                placeholder="장비 · 포트 이름 검색"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
              <span className="shrink-0 text-xs text-content-muted">빈 포트 {totalFree}</span>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title={query.trim() ? '검색 결과가 없습니다' : '연결 가능한 포트가 없습니다'}
                description={
                  query.trim() ? undefined : '이 자산과 그 안의 장비에 같은 매체의 포트가 없습니다.'
                }
              />
            ) : (
              filtered.map((g) => (
                <DetailCard key={g.asset.id}>
                  <DetailCardHeader
                    title={g.asset.name}
                    badge={`빈 ${g.ports.filter((p) => !p.occupied).length}/${g.ports.length}`}
                    badgeStatus="neutral"
                  />
                  {[...groupByPortGroup(g.ports)].map(([groupKey, items]) => (
                    <div key={groupKey} className="space-y-1">
                      {items.length > 0 && groupKeyVisible(g.ports) && (
                        <p className="text-xs text-content-muted">{groupLabelOf(groupKey, g.ports)}</p>
                      )}
                      <PortMatrix
                        labelPrefix={g.asset.name}
                        accent={mediumColor(items[0]?.port.medium ?? '')}
                        ports={items.map((i) => i.port)}
                        stateOf={(p) =>
                          items.find((i) => i.port.id === p.id)?.occupied ? 'full' : 'empty'
                        }
                        selectedPortId={null}
                        onSelect={(portId) => {
                          const item = items.find((i) => i.port.id === portId);
                          // 점유된 자리는 자리만 지킨다 — 고를 수는 없다.
                          if (!item || item.occupied) return;
                          onSelectPort(item.port);
                        }}
                      />
                    </div>
                  ))}
                  <PortLegend
                    states={['empty', 'full']}
                    accent={mediumColor(g.ports[0]?.port.medium ?? '')}
                  />
                </DetailCard>
              ))
            )}
          </>
        )}
      </div>

      {onSearchRemote && (
        <div className="shrink-0 border-t border-line p-3">
          <button
            type="button"
            className="w-full rounded border border-line px-2 py-1.5 text-sm text-content hover:bg-surface-2"
            onClick={onSearchRemote}
          >
            다른 변전소에서 찾기
          </button>
        </div>
      )}
    </aside>
  );
}

/** 포트를 선언된 그룹(A/B, IN/OUT)별로 나눈다 — 판을 그룹 단위로 그려야 자리 감각이 산다. */
function groupByPortGroup(items: { port: V2Port; occupied: boolean }[]) {
  const map = new Map<string, { port: V2Port; occupied: boolean }[]>();
  for (const it of items) {
    const list = map.get(it.port.group);
    if (list) list.push(it);
    else map.set(it.port.group, [it]);
  }
  for (const [, list] of map) list.sort((a, b) => a.port.index - b.port.index);
  return map;
}

/**
 * 그룹 머리줄에 적을 이름 — 종류 어휘에서 나온다.
 *
 * 예전에는 `GND 그룹`·`PWR-IN 그룹` 처럼 **내부 키를 그대로** 적었다. 그룹 키는 타입 안에서
 * 유일해야 하는 식별자이지 이름이 아니라, 쓰는 사람에게는 아무 뜻이 없는 글자다.
 */
function groupLabelOf(groupKey: string, all: readonly { port: V2Port }[]): string {
  const refs = [...new Map(all.map((i) => [i.port.group, i.port])).values()].map((p) => ({
    group: p.group, medium: p.medium, direction: p.direction,
  }));
  const mine = refs.find((r) => r.group === groupKey);
  return mine ? portGroupLabel(mine, refs) : groupKey;
}

/** 그룹이 하나뿐이면 머리줄이 정보를 더하지 않는다. */
function groupKeyVisible(items: { port: V2Port }[]) {
  return new Set(items.map((i) => i.port.group)).size > 1;
}
