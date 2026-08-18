import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, DetailRow } from '../../components/ui';
import { useV2Catalog } from '../hooks';
import { ASSEMBLY_GRID, cellLabel, freeCells } from '@twin/core';
import { makeNewAsset } from '../newAsset';
import { useV2WorkingCopy } from '../store/workingCopyStore';

interface AddAssetModalProps {
  open: boolean;
  onClose: () => void;
  substationId: string;
  /** 격자 컨텍스트: 설비 구성의 빈 자리에서 열릴 때 지정 */
  /**
   * 어느 설비의 어느 자리에 넣는가 — **항상 있다**.
   *
   * 예전에는 없을 수도 있었다(현황 도구바의 「자산 추가」가 어디에도 안 놓인 자산을
   * 만들었다). 도면에도 설비 안에도 없는 자산은 현황표에만 존재하는 유령이라, 그 길을
   * 없앴다. 만드는 일은 **설비를 도면에 놓는 것**과 **설비 안에 부품을 넣는 것** 둘뿐이다.
   */
  gridContext: {
    parentAssetId: string;
    /** 그 설비의 격자 — 설비 종류가 정한 자리다. */
    /** 현재 형제들 — 빈 자리 계산용 */
    siblings: { col: number | null; row: number | null; colSpan: number | null; rowSpan: number | null }[];
    /** 빈 자리를 눌러 열었으면 그 칸 — 사용자가 방금 고른 것을 다시 묻지 않는다. */
    cell?: { col: number; row: number };
  };
}

export function AddAssetModal({ open, onClose, substationId, gridContext }: AddAssetModalProps) {
  const effectiveAssets = useV2WorkingCopy((st) => st.saved.assets);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [name, setName] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  // 빈 자리를 눌러 열었으면 그 칸을 미리 고른 상태로 연다.
  const presetCell = gridContext?.cell;
  const presetKey = presetCell ? `${presetCell.col},${presetCell.row}` : undefined;
  useEffect(() => {
    if (presetKey !== undefined) setSelectedSlot(presetKey);
  }, [presetKey]);

  const catalog = useV2Catalog();

  // 카테고리 id → name 맵 (optgroup 레이블용)
  const categoryNameById = useMemo(
    () => new Map((catalog.data?.categories ?? []).map((c) => [c.id, c.name])),
    [catalog.data],
  );

  const allActiveTypes = useMemo(
    () => catalog.data?.types ?? [],
    [catalog.data],
  );

  /* 격자 안에는 **무엇이든** 넣는다 — 무엇을 담을지는 설비 종류를 짜는 사람이 정하지,
     자리가 정하지 않는다(수용 규칙은 걷었다). */
  const availableTypes = allActiveTypes;

  const free = useMemo(
    () => freeCells(ASSEMBLY_GRID, gridContext.siblings),
    [gridContext],
  );

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

    /* 고른 자리는 격자 칸이다 — `열,행` 으로 실어 보낸다(번호는 저장하지 않는다). */
    const cell = selectedSlot !== '' ? selectedSlot.split(',').map(Number) : null;
    const placement: Parameters<typeof makeNewAsset>[0]['placement'] = {
      kind: 'grid',
      parentAssetId: gridContext.parentAssetId,
      col: cell ? cell[0]! : null,
      row: cell ? cell[1]! : null,
      colSpan: 1,
      rowSpan: 1,
    };

    const asset = makeNewAsset({ type, name: name.trim(), substationId, placement });
    useV2WorkingCopy.getState().stageAssetCreate(asset);
    handleClose();
  }

  /* 어디에 추가되는지 — 모달만 보고는 어느 설비의 빈 자리를 눌렀는지 알 수 없었다. */
  const destination = useMemo(
    () => effectiveAssets.find((a) => a.id === gridContext.parentAssetId)?.name ?? null,
    [gridContext, effectiveAssets],
  );

  const canConfirm =
    selectedTypeId !== '' &&
    name.trim() !== '' &&
    selectedSlot !== '';

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

        {/* 자리 선택 (설비 격자에 넣는 경우) */}
        {(
          <DetailRow label="자리">
            {free.length === 0 ? (
              <p className="text-xs text-content-faint">빈 자리 없음</p>
            ) : (
              <Select
                aria-label="자리"
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.currentTarget.value)}
              >
                <option value="">— 자리 선택 —</option>
                {free.map((cell) => {
                  const key = `${cell.col},${cell.row}`;
                  return (
                    <option key={key} value={key}>
                      {cellLabel(cell.col, cell.row)}
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
