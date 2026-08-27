/**
 * PhotoCard — InfoTab 사진 카드 (레코드의 세 번째 종류)
 *
 * 업로드(파일 선택 → POST /v2/photos → stagePhotoCreate)·썸네일 그리드·캡션
 * 인라인 편집(InlineEditCell)·삭제·클릭 확대(Modal). 표시 대상 계산은
 * RecordsTab.tsx 와 같은 형태(워킹카피가 보여 주는 것을 그대로 읽는다) —
 * 스토어에 함수참조 셀렉터를 새로 추가하지 않는다(maintenance/inspections 의
 * effective*For 는 RecordsTab 이 실제로 쓰지 않는 죽은 셀렉터라 그 형태를
 * 새로 반복하지 않는다).
 */
import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { DetailCardHeader, Button, DetailCard, IconButton, Modal } from '../../../components/ui';
import { photoUrl } from '../../api';
import { useEffectivePhotos } from '../../store/useWorkingCopy';
import { holdPhotoFile, pendingPhotoUrl } from '../../store/pendingPhotos';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import type { V2AssetPhoto } from '../../types';
import { InlineEditCell } from '../InlineEditCell';
import { newId } from '../../newId';

/**
 * 이 사진을 어디서 보나 — 저장 전이면 브라우저가 들고 있는 것, 저장됐으면 서버의 것.
 *
 * 한 줄로 적어 **두 자리(격자·확대)가 갈리지 않게** 한다.
 */
function srcOf(p: V2AssetPhoto): string {
  return pendingPhotoUrl(p.id) ?? photoUrl(p.filePath);
}

interface PhotoCardProps {
  assetId: string;
}

export function PhotoCard({ assetId }: PhotoCardProps) {
  const photos = useEffectivePhotos(assetId);

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
    useV2WorkingCopy.getState().stagePhotoCreate({ id, assetId, filePath: '', caption: null, updatedAt: '' });
  }

  function handleCaptionCommit(photo: V2AssetPhoto, value: string) {
    const trimmed = value.trim();
    const nextCaption = trimmed || null;
    if (nextCaption === photo.caption) return;
    useV2WorkingCopy.getState().stagePhotoUpdate(photo.id, { caption: nextCaption });
  }

  function handleDelete(id: string) {
    useV2WorkingCopy.getState().stagePhotoDelete(id);
    if (enlargedId === id) setEnlargedId(null);
  }

  return (
    <DetailCard>
      <div>
        <DetailCardHeader
          title="사진"
          actions={
            /* 같은 패널의 점검·고장이력과 **같은 동작**이다(목록에 한 줄을 더한다) —
               한 동작에 한 단어. 「업로드」는 그 일을 하는 **방법**이지 하려는 일이 아니다. */
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
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
      </div>


      {photos.length === 0 ? (
        <p className="text-xs text-content-faint">등록된 사진이 없습니다</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="space-y-1">
              <button type="button" className="block" onClick={() => setEnlargedId(p.id)}>
                <img
                  src={srcOf(p)}
                  alt={p.caption ?? '설비 사진'}
                  className="h-20 w-20 rounded border border-line object-cover"
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
        <Modal open={true} onClose={() => setEnlargedId(null)} title={enlarged.caption ?? '사진'}>
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
