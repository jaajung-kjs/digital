/**
 * SelectedPortCard — 고른 포트 하나. **어디랑 · 뭘로 · 추적** 셋만.
 *
 * 포트를 누르는 사람이 알고 싶은 것은 그 셋이다. 예전에는 매체·방향·상태 배지·내부 통과까지
 * 얹혀 있었는데, 매체와 방향은 판의 구획이 이미 말하고 상태는 대국이 적혀 있으면 자명하며
 * 내부 통과는 추적이 끝까지 보여 준다.
 *
 * `ConnectionsTab` 에서 뗐다. 이 카드가 쓰는 계산(대국·값·선로 대국·케이블 품목)도 함께
 * 왔다 — 쓰는 자리와 만드는 자리가 붙어 있어야 고칠 때 한 곳만 본다.
 *
 * **거동은 그대로다** — 옮기기만 했다.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { cableFieldsFor, internalLinkMap, isMultiCorePort, portFieldsFor, portValuesAt } from '@twin/core';
import {
  Button, DetailRow, EMPTY, InsetBox, ItemCard, SELECTABLE, Select, cn,
} from '../../../components/ui';
import { CableValueField } from '../CableValueField';
import { cableOwner, endpointLabel, indexCablesByPort, resolvePeer, type PortIndex } from '../../peerResolve';
import { resolveFiberFarEnd } from '../../fiberSelectors';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import { useV2Catalog } from '../../hooks';
import { useEffectiveCables } from '../../store/useWorkingCopy';
import type { TraceNodeLabel } from '../../traceLabels';
import type { TraceResult } from '../../traceSelectors';
import type { V2Asset, V2Cable, V2Port } from '../../types';
import { TraceNodeText, TraceResultView } from './TraceResultView';
import { PortValueControl } from './PortValueControl';

/** 대국 이름 — 국 이름은 붙이지 않는다(슬롯 이름이 이미 그것을 말한다). */
function farEndLabel(peer: { assemblyName: string | null; assetName: string; portName: string; portIndex: number }): string {
  return endpointLabel(peer);
}

export interface SelectedPortCardProps {
  port: V2Port;
  /** 그 포트를 가진 장비 — 판이 이미 이 짝으로 그려진다. */
  owner: V2Asset;
  localSubstationId: string;
  cablesByPortId: ReadonlyMap<string, { cableId: string; peerPortId: string; cable: V2Cable }[]>;
  portIndex: PortIndex;
  label: (portId: string) => TraceNodeLabel;
  onSelectAsset: (id: string, portId?: string | null) => void;
  onConnectPort?: (portId: string) => void;
  /** 추적을 건다 — 결과는 이 카드 안에 선다. */
  onTrace: (portId: string) => void;
  onDeleteCable: (peer: { cableId: string; label: string }) => void;
  /** 이 포트에서 건 추적 — 아니면 `null`. */
  traceResult: TraceResult | null;
  onTopology: () => void;
  onClearTrace: () => void;
  traceRef?: React.Ref<HTMLDivElement>;
}

export function SelectedPortCard({
  port, owner, localSubstationId, cablesByPortId, portIndex, label,
  onSelectAsset, onConnectPort, onTrace, onDeleteCable,
  traceResult, onTopology, onClearTrace, traceRef,
}: SelectedPortCardProps) {
  const navigate = useNavigate();
  const catalog = useV2Catalog();
  const effectiveCables = useEffectiveCables();
  /* 케이블 품목을 고치는 중인 가닥 — 읽는 줄이 기본이고, 고칠 때만 상자가 선다. */
  const [editingCableId, setEditingCableId] = useState<string | null>(null);


  /**
   * 고른 포트에 **적을 것들** — 종류 선언이 준다(전원이면 전압 · 용량 · 개폐).
   *
   * 예전에는 개폐(참/거짓) 하나만 여기 있었다. 그래서 전압을 포트의 값으로 옮기고 나니
   * 포트를 눌러 놓고도 그것을 적을 곳이 없었다 — 계통 표의 회로 줄에서만 적을 수 있었고,
   * 입력 포트의 전압은 아예 적을 길이 없었다.
   *
   * 갈래(교류·직류)까지 넘긴다 — 직류 회로에 교류 전압 목록이 뜨면 안 된다.
   * 주인 자산을 함께 들고 있어야 스테이지 대상이 정해진다(랙을 고르면 자식의 포트가
   * 판에 뜨므로 `asset` 이 곧 주인이 아니다).
   */
  const values = useMemo(() => {
    const fields = portFieldsFor(port.medium, port.positions, port.variant);
    if (fields.length === 0) return null;
    const values = portValuesAt(port, 1);
    return {
      owner,
      /* 계통 표와 같은 규칙: 안 적었을 때 뜻이 있는 것만 기본값으로 읽는다(개폐 = 투입).
         선언이 주는 값(전압)은 없으면 없는 것이다. */
      rows: fields.map((field) => ({
        field,
        value: values[field.key] ?? (field.readOnly ? null : field.defaultValue ?? null),
      })),
    };
  }, [port, owner]);

  /* 고른 포트에 물린 대국 — 부스바는 여럿이다. 하나만 보여 주면 나머지가 없는 것처럼 읽힌다. */
  const peers = useMemo(() => {
    const allCategories = catalog.data?.cableGroups.flatMap((g) => g.categories) ?? [];
    return (cablesByPortId.get(port.id) ?? []).flatMap((conn) => {
      const peer = resolvePeer(port, conn.cable, portIndex, localSubstationId);
      if (!peer) return [];
      const sub = peer.remote && peer.substationName ? ` (${peer.substationName})` : '';
      const lengthM = (conn.cable.specParams as Record<string, unknown> | null)?.lengthM;
      return [{
        cableId: conn.cableId,
        /* 남의 국 가닥이면 여기서는 **읽기만** 된다 — 누구의 것인지는 `peerResolve` 가 안다
           (끝점 접근은 그 파일 한 곳 규칙이다). */
        owner: cableOwner(conn.cable, localSubstationId),
        label: `${endpointLabel(peer)}${sub}`,
        categoryId: conn.cable.categoryId,
        categoryName: allCategories.find((c) => c.id === conn.cable.categoryId)?.name ?? null,
        lengthM: typeof lengthM === 'number' ? `${lengthM}m` : null,
        /* 그 케이블에 적힌 값 전부 — 무엇을 적는지는 종류 선언이 정한다(`cableFieldsFor`). */
        values: (conn.cable.specParams ?? {}) as Record<string, unknown>,
        entry: portIndex.get(conn.peerPortId),
        /* 건너편 **포트**까지 들고 간다 — 눌렀을 때 그 포트를 고른 상태로 가야 한다.
           자산만 가리키면 첫 탭이 열려서, 방금 본 그 포트를 판에서 다시 찾아야 한다. */
        peerPortId: conn.peerPortId,
      }];
    });
  }, [port, cablesByPortId, portIndex, localSubstationId, catalog.data]);

  /**
   * 이 포트가 **자산 안에서** 이어지는 포트들 — 케이블 말고 그 장비를 통과하는 길.
   *
   * 화면에 그 목록을 내놓지는 않는다(눌러 옮겨 다닐 것이 아니다). 이것은 **선로 반대편을
   * 푸는 디딤돌**이다: 앞면 어댑터 → 인입 → 그 코어의 대국 장비.
   *
   * 규칙은 포트 선언에서 저절로 나온다(`internalLinkMap` ← `derivedLinks`): 전원 입력은
   * 출력과 통하고, 다심 인입의 코어 i 는 앞면 i 번으로 나온다. 그래서 **「다심이면 특별히」
   * 같은 갈래가 없다** — 화면은 「이웃을 다 보여 준다」 한 문장이고, 나중에 다른 통과 선언이
   * 생겨도 여기는 그대로다.
   *
   * 이것이 있어야 슬롯의 광 포트에서 자국(앞면 → 장비)과 대국(인입 → 상대국)을 **한 판에서
   * 오갈 수 있다**. 예전에는 케이블 상대 한쪽만 보여 다른 쪽을 보려면 선번장으로 나가야 했다.
   */
  const internal = useMemo(() => {
    const map = internalLinkMap(owner.ports);
    return (map.get(port.id) ?? []).flatMap((id) => {
      const found = owner.ports.find((p) => p.id === id);
      return found ? [found] : [];
    });
  }, [port, owner]);

  /**
   * 이 포트가 **선로를 타고** 닿는 장비 — 대국.
   *
   * 앞면 어댑터를 골랐을 때 「내부 연결: OPGW」만 보이면 한 걸음이 모자란다. 실제로 알고
   * 싶은 것은 **그 OPGW 를 타고 넘어가 같은 코어 번호에 물린 장비**다.
   *
   * 그 계산은 선번장이 이미 갖고 있다(`resolveFiberFarEnd`) — 상대 국 자산은 이 워킹 카피에
   * 없으므로 서버가 코어별로 풀어 실어 준 것을 읽는다. 두 화면이 같은 함수를 쓰면 선번장의
   * 대국과 포트 상세의 대국이 갈릴 일이 없다.
   */
  const farEnd = useMemo(() => {
    /* 내부로 이어진 **다심 인입**이 있을 때만 선로가 있다 — 없으면 이 줄 자체가 서지 않는다.
       「다심인가」는 어휘가 판정한다(`isMultiCorePort`) — 여기서 `positions > 1` 을 다시 적으면
       그 규칙이 또 한 군데로 흩어진다(예전에 열세 군데였다). */
    const trunk = internal.find((p) => isMultiCorePort(p.positions));
    if (!trunk) return null;
    const trunkCable = (cablesByPortId.get(trunk.id) ?? [])[0]?.cable;
    if (!trunkCable) return null;
    const { cablesByAPortId: byA, cablesByBPortId: byB } = indexCablesByPort(effectiveCables);
    return resolveFiberFarEnd(trunk.id, trunkCable, port.index, portIndex, byA, byB, localSubstationId);
  }, [port, internal, cablesByPortId, effectiveCables, portIndex, localSubstationId]);

  /**
   * 이 포트에 물릴 수 있는 케이블 품목 — **그 포트의 매체 것만**.
   *
   * 매체 키는 곧 케이블 그룹의 키다(포트 종류 하나당 그룹 하나). 광 어댑터에 전력케이블을
   * 고를 수 있게 두면 저장할 때 서버가 튕기고, 그때는 왜 튕겼는지 화면에 남지 않는다.
   */
  const cableChoices = useMemo(
    () => catalog.data?.cableGroups.find((g) => g.key === port.medium)?.categories ?? [],
    [catalog.data, port],
  );

  return (
    <InsetBox className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
          {endpointLabel({ assemblyName: null, assetName: owner.name, portName: port.name, portIndex: port.index })}
        </span>
        {peers.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => onTrace(port.id)}>추적</Button>
        )}
      </div>

      {farEnd && (
        /* 선로 반대편 — 「OPGW 를 타고 넘어가 같은 코어에 물린 장비」다.
           원격이면 국 이름이 앞에 선다(두 국의 이름이 흔히 같기 때문). */
        <DetailRow label="대국 장비">
          <button
            type="button"
            className={cn('block w-full truncate rounded px-1 text-left text-sm', SELECTABLE)}
            disabled
            title={farEndLabel(farEnd)}
          >
            {farEndLabel(farEnd)}
          </button>
        </DetailRow>
      )}

      {peers.length === 0 ? (
        /* 빈 포트 — 「없다」로 끝내지 않고 **여기서 잇게** 한다. 예전에는 평면도로 건너가
           도구를 켜고 이 자산을 다시 찾아 이 포트를 다시 골라야 했다. */
        <DetailRow label="연결">
          <div className="flex items-center gap-2">
            <span className="text-sm text-content-faint">연결 없음</span>
            {onConnectPort && (
              <Button variant="secondary" size="sm" onClick={() => onConnectPort(port.id)}>
                케이블 연결
              </Button>
            )}
          </div>
        </DetailRow>
      ) : (
        /* 부스바는 여럿이 물린다 — 하나만 적으면 나머지가 없는 것처럼 읽힌다.
           **가닥 하나에 상자 하나**: 「어디로」와 「뭘로」가 라벨을 달고 줄을 나눠 선다.
           예전에는 라벨 없이 장비 이름과 드롭다운이 맨몸으로 놓여, 무엇을 말하는 자리인지도
           모른 채 편집기부터 눈에 들어왔다. */
        peers.map((peer) => (
          /* 남의 국 가닥은 **지우는 길도 없다** — 커밋이 `{ id, substationId }` 로 좁혀 지우므로
             (`commit.service.ts:651`) 여기서 지우면 422 로 **저장 전체가 깨진다**. 값만 잠그고
             삭제를 남겨 두면 잠근 뜻이 무색하다. */
          <ItemCard
            key={peer.cableId}
            title="연결"
            {...(peer.owner ? {} : { onDelete: () => onDeleteCable(peer) })}
          >
            <DetailRow label="연결 장비">
              {/* 추적 마디와 **같은 조각**을 쓴다 — 국을 넘는 경로슬롯은 이름이 길어 한 줄로는
                  말줄임에 잘린다(무엇에 닿았는지가 사라진다). */}
              <div className="flex min-w-0 flex-1 text-sm">
                <TraceNodeText
                  label={label(peer.peerPortId)}
                  {...(peer.entry
                    ? { onClick: () => onSelectAsset(peer.entry!.asset.id, peer.peerPortId), title: `${peer.entry.asset.name} 으로 이동` }
                    : {})}
                />
              </div>
            </DetailRow>
            {/* 케이블은 **읽는 줄이 기본**이다. 드롭다운을 늘 펼쳐 두면 조회하러 온 사람에게
                편집기부터 들이미는 꼴이고, 실수로 바꾸기도 쉽다. 고칠 때만 상자가 선다. */}
            <DetailRow label="케이블">
              {/* 남의 국 가닥은 **읽는 줄로 끝난다** — 누를 수 있는데 아무 일도 안 일어나는
                  칸을 만들지 않는다. 고쳐 봐도 이 국의 워킹카피에는 그 가닥이 없다. */}
              {peer.owner ? (
                <span className="flex items-center gap-1.5 px-1">
                  <span className="min-w-0 truncate text-sm text-content">{peer.categoryName ?? EMPTY}</span>
                  {peer.lengthM && (
                    <span className="shrink-0 text-xs tabular-nums text-content-muted">{peer.lengthM}</span>
                  )}
                </span>
              ) : editingCableId === peer.cableId ? (
                <Select
                  aria-label="케이블 품목"
                  size="sm"
                  autoFocus
                  value={peer.categoryId ?? ''}
                  onChange={(e) => {
                    useV2WorkingCopy.getState().stageCableUpdate(peer.cableId, { categoryId: e.currentTarget.value });
                    setEditingCableId(null);
                  }}
                  onBlur={() => setEditingCableId(null)}
                >
                  {cableChoices.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              ) : (
                <button
                  type="button"
                  className={cn('flex w-full items-center gap-1.5 rounded px-1 text-left', SELECTABLE)}
                  title="케이블 품목 바꾸기"
                  onClick={() => setEditingCableId(peer.cableId)}
                >
                  <span className="min-w-0 truncate text-sm text-content">{peer.categoryName ?? EMPTY}</span>
                  {peer.lengthM && (
                    <span className="shrink-0 text-xs tabular-nums text-content-muted">{peer.lengthM}</span>
                  )}
                  <Pencil size={12} className="ml-auto shrink-0 text-content-faint" />
                </button>
              )}
            </DetailRow>
            {/* 그 케이블에 적는 값들 — 길이 · 굵기. **여기가 적는 자리다.**
                계통 표는 회로 대장이라 케이블의 물량까지 세우지 않는데(열 하나가 10%다),
                산출은 길이로 물량을 센다(`computeReport`). 읽기만 되던 동안 전원 케이블의
                길이를 적을 곳은 계통 표뿐이었다.
                무엇을 적는지는 **종류 선언이 준다**(`cableFieldsFor`) — 화면이 키를 모른다. */}
            {cableFieldsFor(port.medium).map((field) => (
              <DetailRow key={field.key} label={field.label}>
                {peer.owner ? (
                  <span className="block px-1 text-sm text-content">
                    {peer.values[field.key] === null || peer.values[field.key] === undefined
                      ? EMPTY
                      : `${String(peer.values[field.key])}${field.unit ?? ''}`}
                  </span>
                ) : (
                  <CableValueField cableId={peer.cableId} field={field} value={peer.values[field.key]} />
                )}
              </DetailRow>
            ))}
            {/* 누구의 것인지 적고 그 국으로 가는 길을 둔다 — 절 안의 안내는 한 줄이다(§3.2). */}
            {peer.owner && (
              <p className="px-2.5 py-2 text-xs text-content-muted">
                <strong className="font-medium text-content">{peer.owner.substationName}</strong> 의 케이블 —
                값은 거기서 고칩니다.{' '}
                <button
                  type="button"
                  className="rounded text-primary hover:underline focus-ring"
                  onClick={() => navigate(`/n/${peer.owner!.substationId}?view=${encodeURIComponent('평면도')}`)}
                >
                  그 변전소로 가기
                </button>
              </p>
            )}
          </ItemCard>
        ))
      )}

      {/* 이 포트의 값들 — 전압 · 용량 · 개폐. 계통 표는 **출력** 포트만 다루므로, 입력측
          차단기와 인입 전압을 적을 곳은 여기뿐이다. */}
      {values?.rows.map(({ field, value }) => (
        <DetailRow key={field.key} label={field.label}>
          <PortValueControl assetId={values.owner.id} portId={port.id} field={field} value={value} />
        </DetailRow>
      ))}

      {/* 추적 결과 — **누른 자리 바로 아래**에 편다. 맨 위 카드에 띄우면 장비가 열둘일 때
          결과가 화면 밖으로 나가, 누르고도 아무 일이 없는 것처럼 보였다. */}
      {traceResult && (
        <TraceResultView
          result={traceResult}
          startPortId={port.id}
          startMedium={port.medium}
          label={label}
          assetOf={(portId) => portIndex.get(portId)?.asset ?? null}
          onSelectAsset={onSelectAsset}
          onTopology={onTopology}
          onClear={onClearTrace}
          boxRef={traceRef}
        />
      )}
    </InsetBox>
  );
}
