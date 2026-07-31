/**
 * PhotoCard — InfoTab 사진 카드 (레코드의 세 번째 종류)
 *
 * 업로드(파일 선택 → POST /v2/photos → stagePhotoCreate)·썸네일 그리드·캡션
 * 인라인 편집(InlineEditCell)·삭제·클릭 확대(Modal). 표시 대상 계산은
 * RecordsTab.tsx 와 동일한 형태(반응형 슬라이스 구독 + mergeEffective 인라인) —
 * 스토어에 함수참조 셀렉터를 새로 추가하지 않는다(maintenance/inspections 의
 * effective*For 는 RecordsTab 이 실제로 쓰지 않는 죽은 셀렉터라 그 형태를
 * 새로 반복하지 않는다).
 */
import { useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, DetailCard, IconButton, Modal } from '../../components/ui';
import { apiErrorMessage } from '../apiError';
import { photoUrl, uploadPhoto } from '../api';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import type { V2AssetPhoto } from '../types';
import { InlineEditCell } from './InlineEditCell';

interface PhotoCardProps {
  assetId: string;
}

export function PhotoCard({ assetId }: PhotoCardProps) {
  // ── 반응형 슬라이스 구독 (RecordsTab 과 동일 패턴, 함수참조 구독 금지) ──────
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  const photos = useMemo(
    () => mergeEffective(saved.photos, overlays.photos).filter((p) => p.assetId === assetId),
    [saved, overlays, assetId],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlargedId, setEnlargedId] = useState<string | null>(null);
  const enlarged = enlargedId != null ? photos.find((p) => p.id === enlargedId) ?? null : null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ''; // 같은 파일 재선택 허용
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
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-content-muted">사진</p>
        <Button variant="secondary" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? '업로드 중…' : '업로드'}
        </Button>
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
                  alt={p.caption ?? '자산 사진'}
                  className="h-20 w-20 rounded border border-line object-cover"
                />
              </button>
              <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <InlineEditCell value={p.caption ?? ''} onCommit={(v) => handleCaptionCommit(p, v)} />
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
            alt={enlarged.caption ?? '자산 사진'}
            className="max-h-[70vh] max-w-full"
          />
        </Modal>
      )}
    </DetailCard>
  );
}
