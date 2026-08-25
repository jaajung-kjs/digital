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
import { apiErrorMessage } from '../../apiError';
import { photoUrl, uploadPhoto } from '../../api';
import { useEffectivePhotos } from '../../store/useWorkingCopy';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import type { V2AssetPhoto } from '../../types';
import { InlineEditCell } from '../InlineEditCell';

interface PhotoCardProps {
  assetId: string;
}

export function PhotoCard({ assetId }: PhotoCardProps) {
  const photos = useEffectivePhotos(assetId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlargedId, setEnlargedId] = useState<string | null>(null);
  const enlarged = enlargedId != null ? photos.find((p) => p.id === enlargedId) ?? null : null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    // 프로젝트 관례: 비동기 이전에 e.currentTarget 을 먼저 읽는다.
    const input = e.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { filePath } = await uploadPhoto(file);
      useV2WorkingCopy.getState().stagePhotoCreate({
        id: crypto.randomUUID(),
        assetId,
        filePath,
        caption: null,
        updatedAt: '',
      });
    } catch (err) {
      setError(apiErrorMessage(err, '사진 업로드에 실패했습니다'));
    } finally {
      setUploading(false);
    }
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
            <Button variant="secondary" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? '올리는 중…' : '추가'}
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

      {error && <p className="text-xs text-danger">{error}</p>}

      {photos.length === 0 ? (
        <p className="text-xs text-content-faint">등록된 사진이 없습니다</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="space-y-1">
              <button type="button" className="block" onClick={() => setEnlargedId(p.id)}>
                <img
                  src={photoUrl(p.filePath)}
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
            src={photoUrl(enlarged.filePath)}
            alt={enlarged.caption ?? '설비 사진'}
            className="max-h-[70vh] max-w-full"
          />
        </Modal>
      )}
    </DetailCard>
  );
}
