import { useMemo, useState } from 'react';
import { Button, Input, MessageStrip, Modal, Select, DetailRow } from '../../components/ui';
import { useV2Catalog } from '../hooks';
import { makeNewAsset } from '../newAsset';
import { useV2WorkingCopy } from '../store/workingCopyStore';

interface AddAssetModalProps {
  open: boolean;
  onClose: () => void;
  substationId: string;
  /**
   * 어느 설비의 어느 자리에 넣는가 — **항상 있다**.
   *
   * 예전에는 없을 수도 있었다(현황 도구바의 「자산 추가」가 어디에도 안 놓인 자산을
   * 만들었다). 도면에도 설비 안에도 없는 자산은 현황표에만 존재하는 유령이라, 그 길을
   * 없앴다. 만드는 일은 **설비를 도면에 놓는 것**과 **설비 안에 부품을 넣는 것** 둘뿐이다.
   */
  gridContext: {
    parentAssetId: string;
    /**
     * 눌러(또는 끌어) 잡은 **자리와 크기**.
     *
     * 여기서 자리를 다시 묻지 않는다: 이 상자는 그 칸을 눌러야 열리고, 뒤의 판에는 그 네모가
     * 물든 채 남아 있다(`AssemblyGrid pending`). 한때 「몇 행 몇 열」 드롭다운이 있었는데,
     * 방금 손으로 고른 것을 글자로 한 번 더 고르게 하는 칸이었다 — 자리를 옮기고 싶으면
     * 취소하고 그 칸을 누르는 편이 짧다.
     */
    cell: { col: number; row: number; colSpan?: number; rowSpan?: number };
  };
}

export function AddAssetModal({ open, onClose, substationId, gridContext }: AddAssetModalProps) {
  const effectiveAssets = useV2WorkingCopy((st) => st.saved.assets);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [name, setName] = useState('');
  const [showMissing, setShowMissing] = useState(false);

  const catalog = useV2Catalog();

  // 카테고리 id → name 맵 (optgroup 레이블용)
  const categoryNameById = useMemo(
    () => new Map((catalog.data?.categories ?? []).map((c) => [c.id, c.name])),
    [catalog.data],
  );

  /* 격자 안에는 **무엇이든** 넣는다 — 무엇을 담을지는 설비 종류를 짜는 사람이 정하지,
     자리가 정하지 않는다(수용 규칙은 걷었다). */
  const availableTypes = useMemo(() => catalog.data?.types ?? [], [catalog.data]);

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

  /**
   * 아직 비어 있는 칸 — 누르면 **무엇이 막고 있는지**를 이 목록이 말한다.
   *
   * 예전에는 다 채워질 때까지 「추가」를 꺼 두었다. 회색 단추는 왜 안 눌리는지 말해 주지
   * 못해 막다른 길이 된다 — 이 앱의 대장 화면들이 이미 그러지 않기로 했다(`useEditorGate`).
   * 같은 규칙을 모달에도 쓴다: 누를 수 있게 두고, 누르면 빠진 것을 짚어 준다.
   */
  const missing = [
    selectedTypeId === '' && '자산 유형',
    name.trim() === '' && '이름',
  ].filter((v): v is string => typeof v === 'string');

  function handleClose() {
    setSelectedTypeId('');
    setName('');
    setShowMissing(false);
    onClose();
  }

  function handleConfirm() {
    if (missing.length > 0) {
      setShowMissing(true);
      return;
    }
    const type = availableTypes.find((t) => t.id === selectedTypeId);
    if (!type) return;

    const { cell } = gridContext;
    const asset = makeNewAsset({
      type,
      name: name.trim(),
      substationId,
      placement: {
        kind: 'grid',
        parentAssetId: gridContext.parentAssetId,
        col: cell.col,
        row: cell.row,
        /* 끌어서 잡은 크기 그대로 — 자리를 되묻지 않으므로 크기가 바뀔 일도 없다. */
        colSpan: cell.colSpan ?? 1,
        rowSpan: cell.rowSpan ?? 1,
      },
    });
    useV2WorkingCopy.getState().stageAssetCreate(asset);
    handleClose();
  }

  /* 어디에 추가되는지 — 모달만 보고는 어느 설비의 빈 자리를 눌렀는지 알 수 없었다. */
  const destination = useMemo(
    () => effectiveAssets.find((a) => a.id === gridContext.parentAssetId)?.name ?? null,
    [gridContext, effectiveAssets],
  );

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
          <Button size="sm" onClick={handleConfirm}>
            추가
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* 누른 뒤에만 뜬다 — 열자마자 경고가 서면 아직 아무것도 안 한 사람을 나무라는 꼴이다.
            조사는 붙이지 않는다: 마지막 칸이 무엇이냐에 따라 「을/를」이 갈린다(이름을·유형을). */}
        {showMissing && missing.length > 0 && (
          <MessageStrip tone="warning">빠진 칸: {missing.join(' · ')}</MessageStrip>
        )}
        {destination && <DetailRow label="위치">{destination}</DetailRow>}

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

        <DetailRow label="이름">
          <Input
            aria-label="이름"
            placeholder="자산 이름 입력"
            value={name}
            autoFocus
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
            }}
          />
        </DetailRow>
      </div>
    </Modal>
  );
}
