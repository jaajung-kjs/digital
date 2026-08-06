import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, DetailRow } from '../../components/ui';
import { useV2Catalog } from '../hooks';
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
    siblings: { slotIndex: number | null; slotSpan: number | null }[];
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
  const [selectedTypeId, setSelectedTypeId] = useState(preselectedTypeId ?? '');
  const [name, setName] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  // preselectedTypeId 가 변경되면 선택 동기화
  useEffect(() => {
    if (preselectedTypeId !== undefined) setSelectedTypeId(preselectedTypeId);
  }, [preselectedTypeId]);

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

  const hasFixedSlots = containerContext != null && containerContext.spec.slotCount != null;

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
      const slotIndex = hasFixedSlots
        ? (selectedSlot !== '' ? parseInt(selectedSlot, 10) : null)
        : null;
      placement = {
        kind: 'container',
        parentAssetId: containerContext.parentAssetId,
        containerKey: containerContext.spec.key,
        slotIndex,
        slotSpan: 1,
      };
    }

    const asset = makeNewAsset({ type, name: name.trim(), substationId, placement });
    useV2WorkingCopy.getState().stageAssetCreate(asset);
    handleClose();
  }

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
              <p className="text-xs text-content-faint">빈 슬롯 없음</p>
            ) : (
              <Select
                aria-label="슬롯"
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.currentTarget.value)}
              >
                <option value="">— 슬롯 선택 —</option>
                {free.map((idx) => (
                  <option key={idx} value={String(idx)}>
                    슬롯 {idx + 1}
                  </option>
                ))}
              </Select>
            )}
          </DetailRow>
        )}
      </div>
    </Modal>
  );
}
