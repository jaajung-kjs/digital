/**
 * PhotoCard — 상세 패널 사진 카드 (레코드의 세 번째 종류)
 *
 * 업로드(파일 선택 → 워킹카피에 담기)·판 너비를 다 쓰는 목록·캡션
 * 인라인 편집(InlineEditCell)·삭제·클릭 확대(Modal). 표시 대상 계산은
 * RecordsTab.tsx 와 같은 형태(워킹카피가 보여 주는 것을 그대로 읽는다) —
 * 스토어에 함수참조 셀렉터를 새로 추가하지 않는다(maintenance/inspections 의
 * effective*For 는 RecordsTab 이 실제로 쓰지 않는 죽은 셀렉터라 그 형태를
 * 새로 반복하지 않는다).
 */
import { useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { DetailCardHeader, Button, DetailCard, IconButton, Modal } from '../../../components/ui';
import { photoUrl } from '../../api';
import { effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import { deleteLeafRow } from '../../model/store/deleteActions';
import { holdPhotoFile, pendingPhotoUrl } from '../../store/pendingPhotos';
import type { EquipmentPhoto } from '../../model/types';
import { InlineEditCell } from '../InlineEditCell';
import { newId } from '../../newId';

/**
 * 이 사진을 어디서 보나 — 저장 전이면 브라우저가 들고 있는 것, 저장됐으면 서버의 것.
 *
 * 한 줄로 적어 **두 자리(격자·확대)가 갈리지 않게** 한다.
 */
function srcOf(p: EquipmentPhoto): string {
  return pendingPhotoUrl(p.id) ?? photoUrl(p.filePath);
}

interface PhotoCardProps {
  equipmentId: string;
}

export function PhotoCard({ equipmentId }: PhotoCardProps) {
  const saved = useWorkingCopy((st) => st.saved);
  const overlays = useWorkingCopy((st) => st.overlays);
  const photos = useMemo(
    () => effectiveRows({ saved, overlays }, 'photos').filter((p) => p.equipmentId === equipmentId),
    [saved, overlays, equipmentId],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [enlargedId, setEnlargedId] = useState<string | null>(null);
  const enlarged = enlargedId != null ? photos.find((p) => p.id === enlargedId) ?? null : null;

  /**
   * 고른 사진은 **워킹 카피에 담긴다** — 자산을 놓거나 칸을 고치는 것과 같다.
   *
   * 파일은 브라우저가 들고 있다가(`holdPhotoFile`) 저장할 때 함께 간다. 예전에는 여기서
   * 바로 올렸는데, 그러면 저장하지 않고 떠난 사람의 파일이 서버에 남았다 — 화면에는
   * 아무 흔적도 없이. 경로는 서버가 짓는다(빈 칸으로 담고, 저장이 채워 준다).
   */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    const id = newId();
    holdPhotoFile(id, file);
    workingCopyStore.getState().create('photos', { id, equipmentId, filePath: '', caption: null, updatedAt: '' });
  }

  function handleCaptionCommit(photo: EquipmentPhoto, value: string) {
    const trimmed = value.trim();
    const nextCaption = trimmed || null;
    if (nextCaption === photo.caption) return;
    workingCopyStore.getState().update('photos', photo.id, { caption: nextCaption });
  }

  function handleDelete(id: string) {
    deleteLeafRow('photos', id);
    if (enlargedId === id) setEnlargedId(null);
  }

  return (
    <DetailCard>
      {/* 머리줄은 **카드의 바로 자식**이어야 한다 — `<div>` 로 한 번 감싸면 카드가 그것을
          「줄도 머리도 아닌 것」으로 보고 여백을 둘러, 띠가 안으로 밀려 들어가 다른 절보다
          두꺼워 보인다(사진 탭만 그랬다). 숨은 파일 입력은 자리를 차지하지 않으므로 머리와
          묶을 까닭이 없다. */}
      <DetailCardHeader
        title="사진"
        actions={
          /* 같은 패널의 점검·고장이력과 **같은 동작**이다(목록에 한 줄을 더한다) —
             한 동작에 한 단어. 「업로드」는 그 일을 하는 **방법**이지 하려는 일이 아니다. */
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            추가
          </Button>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="photo-upload-input"
        onChange={handleFileChange}
      />

      {photos.length === 0 ? (
        <p className="text-xs text-content-faint">등록된 사진이 없습니다</p>
      ) : (
        /* **판 너비를 다 쓴다.** 예전에는 80px 짜리 썸네일이 세 줄로 섰는데, 그 크기로는
           무엇을 찍은 사진인지도 분간이 안 돼 **누를 때마다 상자를 열어야** 했다. 사진을
           올리는 까닭이 그것을 보려는 것이므로 판에서 바로 읽히게 둔다 — 상자는 더 크게
           볼 때만 쓴다.

           자르지 않는다(`object-contain`): 설비 사진은 명판·단자대처럼 **가장자리에 있는
           것**이 요긴한데 `object-cover` 는 그것부터 잘라 낸다. 다만 세로로 긴 사진 한 장이
           판을 통째로 차지하지 않게 높이에 상한을 둔다. */
        <div className="space-y-3">
          {photos.map((p) => (
            <div key={p.id} className="space-y-1">
              <button
                type="button"
                className="block w-full focus-ring"
                title="크게 보기"
                onClick={() => setEnlargedId(p.id)}
              >
                <img
                  src={srcOf(p)}
                  alt={p.caption ?? '설비 사진'}
                  className="block max-h-96 w-full rounded border border-line bg-surface-2 object-contain"
                />
              </button>
              <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <InlineEditCell value={p.caption ?? ''} onCommit={(v) => handleCaptionCommit(p, v)} label="설명" />
                </div>
                <IconButton aria-label="사진 삭제" onClick={() => handleDelete(p.id)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {enlarged && (
        /* 판에서 이미 크게 보이므로 상자는 **더 크게** 볼 때만 쓸모가 있다 — 기본 폭(448px)
           이면 판보다 조금 넓을 뿐이라 여는 값이 없다. */
        <Modal open={true} onClose={() => setEnlargedId(null)} title={enlarged.caption ?? '사진'} size="xl">
          <img
            src={srcOf(enlarged)}
            alt={enlarged.caption ?? '설비 사진'}
            className="max-h-[70vh] max-w-full"
          />
        </Modal>
      )}
    </DetailCard>
  );
}
