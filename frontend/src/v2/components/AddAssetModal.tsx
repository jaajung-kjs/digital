import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, DetailRow } from '../../components/ui';
import { useV2Catalog } from '../hooks';
import { slotNumber } from '@twin/core';
import { makeNewAsset, acceptedTypes, freeSlots } from '../newAsset';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import type { V2ContainerSpec } from '../types';

interface AddAssetModalProps {
  open: boolean;
  onClose: () => void;
  substationId: string;
  /** 컨테이너 컨텍스트: 수용 섹션의 + 버튼에서 열릴 때 지정 */
  containerContext?: {
    parentAssetId: string;
    spec: V2ContainerSpec;
    /** 현재 형제들 — freeSlots 계산용 */
    siblings: { col: number | null; row: number | null; colSpan: number | null; rowSpan: number | null }[];
    /** 빈 자리를 눌러 열었으면 그 칸 — 사용자가 방금 고른 것을 다시 묻지 않는다. */
    cell?: { col: number; row: number };
  };
  /** 평면도 배치 컨텍스트: 팔레트 drag-to-draw 후 열릴 때 지정 */
  floorContext?: {
    floorId: string;
    rect: { x: number; y: number; width: number; height: number };
  };
  /** 미리 선택할 타입 ID (팔레트 armed 상태에서 전달) */
  preselectedTypeId?: string;
}

export function AddAssetModal({ open, onClose, substationId, containerContext, floorContext, preselectedTypeId }: AddAssetModalProps) {
  const savedFloors = useV2WorkingCopy((st) => st.saved.floors);
  const effectiveAssets = useV2WorkingCopy((st) => st.saved.assets);
  const [selectedTypeId, setSelectedTypeId] = useState(preselectedTypeId ?? '');
  const [name, setName] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  // preselectedTypeId 가 변경되면 선택 동기화
  useEffect(() => {
    if (preselectedTypeId !== undefined) setSelectedTypeId(preselectedTypeId);
  }, [preselectedTypeId]);

  // 빈 자리를 눌러 열었으면 그 칸을 미리 고른 상태로 연다.
  const presetCell = containerContext?.cell;
  const presetKey = presetCell ? `${presetCell.col},${presetCell.row}` : undefined;
  useEffect(() => {
    if (presetKey !== undefined) setSelectedSlot(presetKey);
  }, [presetKey]);

  const catalog = useV2Catalog();

  // 카테고리 id → key 맵
  const categoryKeyById = useMemo(
    () => new Map((catalog.data?.categories ?? []).map((c) => [c.id, c.key])),
    [catalog.data],
  );

  // 카테고리 id → name 맵 (optgroup 레이블용)
  const categoryNameById = useMemo(
    () => new Map((catalog.data?.categories ?? []).map((c) => [c.id, c.name])),
    [catalog.data],
  );

  const allActiveTypes = useMemo(
    () => (catalog.data?.types ?? []).filter((t) => t.isActive),
    [catalog.data],
  );

  // 타입 필터: floorContext → placeable 만, containerContext → acceptedTypes, 둘 다 없으면 전체
  const availableTypes = useMemo(() => {
    if (floorContext) return allActiveTypes.filter((t) => t.placeable);
    if (containerContext) return acceptedTypes(containerContext.spec, allActiveTypes, categoryKeyById);
    return allActiveTypes;
  }, [floorContext, containerContext, allActiveTypes, categoryKeyById]);

  // 자유형 슬롯 목록
  const free = useMemo(() => {
    if (!containerContext) return [];
    return freeSlots(containerContext.spec, containerContext.siblings);
  }, [containerContext]);

  const hasFixedSlots = containerContext != null && containerContext.spec.rows != null;

  // 카테고리별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, typeof availableTypes>();
    for (const t of availableTypes) {
      const list = map.get(t.categoryId) ?? [];
      list.push(t);
      map.set(t.categoryId, list);
    }
    return map;
  }, [availableTypes]);

  function handleClose() {
    setSelectedTypeId('');
    setName('');
    setSelectedSlot('');
    onClose();
  }

  function handleConfirm() {
    const type = availableTypes.find((t) => t.id === selectedTypeId);
    if (!type || !name.trim()) return;

    let placement: Parameters<typeof makeNewAsset>[0]['placement'];
    if (floorContext) {
      placement = {
        kind: 'floor',
        floorId: floorContext.floorId,
        x: floorContext.rect.x,
        y: floorContext.rect.y,
        width: floorContext.rect.width,
        height: floorContext.rect.height,
      };
    } else if (containerContext) {
      /* 고른 자리는 격자 칸이다 — `열,행` 으로 실어 보낸다(번호는 저장하지 않는다). */
      const cell = hasFixedSlots && selectedSlot !== '' ? selectedSlot.split(',').map(Number) : null;
      placement = {
        kind: 'container',
        parentAssetId: containerContext.parentAssetId,
        containerKey: containerContext.spec.key,
        col: cell ? cell[0]! : null,
        row: cell ? cell[1]! : null,
        colSpan: 1,
        rowSpan: 1,
      };
    }

    const asset = makeNewAsset({ type, name: name.trim(), substationId, placement });
    useV2WorkingCopy.getState().stageAssetCreate(asset);
    handleClose();
  }

  /* 어디에 추가되는지 — 예전에는 모달만 보고는 알 수 없었다(평면도에서 드래그해 열었는지,
     어느 랙의 + 를 눌렀는지). 층 이름 또는 "상위 자산 · 컨테이너" 로 밝힌다. */
  const destination = useMemo(() => {
    if (floorContext) return savedFloors.find((f) => f.id === floorContext.floorId)?.name ?? null;
    if (containerContext) {
      const parent = effectiveAssets.find((a) => a.id === containerContext.parentAssetId);
      if (!parent) return null;
      return `${parent.name} · ${containerContext.spec.name}`;
    }
    return null;
  }, [floorContext, containerContext, savedFloors, effectiveAssets]);

  const canConfirm =
    selectedTypeId !== '' &&
    name.trim() !== '' &&
    (!hasFixedSlots || selectedSlot !== '');

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="자산 추가"
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleClose}>
            취소
          </Button>
          <Button size="sm" disabled={!canConfirm} onClick={handleConfirm}>
            추가
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {destination && <DetailRow label="위치">{destination}</DetailRow>}

        {/* 타입 선택 */}
        <DetailRow label="자산 유형">
          <Select
            aria-label="자산 유형"
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.currentTarget.value)}
          >
            <option value="">— 유형 선택 —</option>
            {Array.from(grouped.entries()).map(([catId, types]) => (
              <optgroup key={catId} label={categoryNameById.get(catId) ?? catId}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </DetailRow>

        {/* 이름 입력 */}
        <DetailRow label="이름">
          <Input
            aria-label="이름"
            placeholder="자산 이름 입력"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canConfirm) handleConfirm();
            }}
          />
        </DetailRow>

        {/* 슬롯 선택 (고정 슬롯 컨테이너에 추가하는 경우) */}
        {hasFixedSlots && (
          <DetailRow label="슬롯">
            {free.length === 0 ? (
              <p className="text-xs text-content-faint">빈 자리 없음</p>
            ) : (
              <Select
                aria-label="슬롯"
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.currentTarget.value)}
              >
                <option value="">— 자리 선택 —</option>
                {free.map((cell) => {
                  const key = `${cell.col},${cell.row}`;
                  return (
                    <option key={key} value={key}>
                      {containerContext!.spec.name} {slotNumber(containerContext!.spec.cols, cell.col, cell.row)}
                    </option>
                  );
                })}
              </Select>
            )}
          </DetailRow>
        )}
      </div>
    </Modal>
  );
}
