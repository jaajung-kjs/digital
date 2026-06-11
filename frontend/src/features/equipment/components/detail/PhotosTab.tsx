import { useState, useRef, useMemo } from 'react';
import { X, ImageIcon, Trash2 } from 'lucide-react';
import { compressImage } from '../../../../utils/imageCompression';
import { generateTempId } from '../../../../utils/idHelpers';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';
import { useEffectivePhotos } from '../../../workingCopy/hooks';
import { useSnapshotStore } from '../../../editor/stores/snapshotStore';
import { useEquipmentPhotos } from '../../hooks/useEquipmentPhotos';
import { PhotoLightbox } from './PhotoLightbox';
import { UploadDialog } from './UploadDialog';
import { createPortal } from 'react-dom';
import type { EquipmentDetail, LightboxPhoto } from './types';

/* ================================================================
   Snapshot Photos Tab — read-only display of photos from snapshot data
   ================================================================ */

export function SnapshotPhotosTab({ equipmentId }: { equipmentId: string }) {
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const [photoSide, setPhotoSide] = useState<'front' | 'rear'>('front');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const snapEq = snapshotEquipment.find((e) => e.id === equipmentId);
  const allPhotos = (snapEq?.photos ?? []).filter((p) => p.side === photoSide);
  const latestPhoto = allPhotos.length > 0 ? allPhotos[0] : null;

  return (
    <div className="p-4">
      {/* Side toggle */}
      <div className="mb-4 flex gap-2">
        {(['front', 'rear'] as const).map((side) => (
          <button
            key={side}
            onClick={() => setPhotoSide(side)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              photoSide === side
                ? 'bg-primary text-white'
                : 'bg-surface-2 text-content-muted hover:bg-surface-2'
            }`}
          >
            {side === 'front' ? '전면' : '후면'}
          </button>
        ))}
      </div>

      {/* Main photo */}
      {latestPhoto ? (
        <div className="mb-4 overflow-hidden rounded-lg border border-line">
          <img
            src={latestPhoto.imageUrl}
            alt={`${photoSide === 'front' ? '전면' : '후면'} 사진`}
            className="w-full cursor-pointer object-contain"
            style={{ maxHeight: '240px' }}
            onClick={() => setLightboxIndex(0)}
          />
        </div>
      ) : (
        <div className="mb-4 flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-line text-sm text-content-faint">
          {photoSide === 'front' ? '전면' : '후면'} 사진 없음
        </div>
      )}

      {/* Gallery */}
      {allPhotos.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {allPhotos.map((photo, idx) => (
            <div
              key={photo.id}
              className="cursor-pointer overflow-hidden rounded border border-line hover:border-primary"
              onClick={() => setLightboxIndex(idx)}
            >
              <img src={photo.imageUrl} alt="" className="h-16 w-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && allPhotos[lightboxIndex] && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
          onClick={() => setLightboxIndex(null)}
        >
          <img
            src={allPhotos[lightboxIndex].imageUrl}
            alt="확대 사진"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute right-6 top-6 rounded-full bg-surface/20 p-2 text-white hover:bg-surface/40"
          >
            <X size={24} />
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ================================================================
   Photos Tab
   ================================================================ */

export function PhotosTab({ equipment, readOnly }: { equipment: EquipmentDetail; readOnly?: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoSide, setPhotoSide] = useState<'front' | 'rear'>('front');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const stagedPhotos = useEffectivePhotos();
  const put = useSubstationWorkingCopy((s) => s.put);
  const remove = useSubstationWorkingCopy((s) => s.remove);

  const { data: savedPhotos } = useEquipmentPhotos(equipment.id);

  const allPhotos: LightboxPhoto[] = useMemo(() => {
    const uploads = stagedPhotos
      .filter((u) => u.equipmentId === equipment.id && u.side === photoSide);

    const saved = (savedPhotos ?? [])
      .filter((p) => p.side === photoSide);

    return [
      ...uploads.map((u) => ({
        id: `pending-${u.id}`,
        url: u.objectUrl ?? '',
        date: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
        description: u.description || null,
      })),
      ...saved.map((p) => ({
        id: p.id,
        url: p.imageUrl,
        date: new Date(p.takenAt || p.createdAt).toLocaleDateString('ko-KR', {
          year: 'numeric', month: 'long', day: 'numeric',
        }),
        description: p.description,
      })),
    ];
  }, [stagedPhotos, savedPhotos, equipment.id, photoSide]);

  const latestPhoto = allPhotos.length > 0 ? allPhotos[0] : null;
  const currentImageUrl = latestPhoto?.url ?? null;

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
    e.target.value = '';
  };

  const handleConfirmUpload = async (description: string) => {
    if (!pendingFile) return;
    const compressed = await compressImage(pendingFile);
    const objectUrl = URL.createObjectURL(compressed);
    put('photos', {
      id: generateTempId(),
      equipmentId: equipment.id,
      side: photoSide,
      file: compressed,
      description,
      objectUrl,
    });
    setPendingFile(null);
  };

  const handleDeletePhoto = (photoId: string) => {
    if (photoId.startsWith('pending-')) {
      const uploadId = photoId.replace('pending-', '');
      const staged = stagedPhotos.find((u) => u.id === uploadId);
      if (staged?.objectUrl) URL.revokeObjectURL(staged.objectUrl);
      remove('photos', uploadId);
    }
    // 저장된(커밋된) 사진 삭제는 현황 패널(AssetPhotoSection)에서 stage 로 지원. 에디터 탭은 보류 사진만 제거.
  };

  const handleDeleteCurrent = () => {
    if (!latestPhoto?.id) return;
    if (confirm(`${photoSide === 'front' ? '전면' : '후면'} 현재 사진을 삭제하시겠습니까?`)) {
      handleDeletePhoto(latestPhoto.id);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {pendingFile && (
        <UploadDialog
          fileName={pendingFile.name}
          side={photoSide}
          onConfirm={handleConfirmUpload}
          onCancel={() => setPendingFile(null)}
          isPending={false}
        />
      )}

      {lightboxIndex !== null && allPhotos.length > 0 && (
        <PhotoLightbox
          photos={allPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={readOnly ? undefined : handleDeletePhoto}
        />
      )}

      <div className="relative bg-gray-900 flex-1 flex items-center justify-center min-h-0">
        <div className="absolute top-2 left-2 z-10 flex rounded-md overflow-hidden border border-white/30 shadow-sm">
          <button
            onClick={() => setPhotoSide('front')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              photoSide === 'front' ? 'bg-primary text-white' : 'bg-black/50 text-white/80 hover:bg-black/70'
            }`}
          >
            전면
          </button>
          <button
            onClick={() => setPhotoSide('rear')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              photoSide === 'rear' ? 'bg-primary text-white' : 'bg-black/50 text-white/80 hover:bg-black/70'
            }`}
          >
            후면
          </button>
        </div>

        {!readOnly && (
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            <button
              onClick={handleUploadClick}
              className="p-1.5 bg-black/50 rounded-md text-white/80 hover:bg-black/70 hover:text-white transition-colors shadow-sm"
              title={currentImageUrl ? '사진 변경' : '사진 업로드'}
            >
              <ImageIcon size={16} />
            </button>
            {currentImageUrl && (
              <button
                onClick={handleDeleteCurrent}
                className="p-1.5 bg-black/50 rounded-md text-white/80 hover:bg-black/70 hover:text-danger transition-colors shadow-sm"
                title="사진 삭제"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        )}

        {allPhotos.length > 1 && (
          <div className="absolute bottom-2 left-2 z-10">
            <span className="px-2 py-1 bg-black/50 rounded text-[10px] text-white/80">
              이력 {allPhotos.length}장 - 클릭하여 탐색
            </span>
          </div>
        )}

        {latestPhoto && (
          <div className="absolute bottom-2 right-2 z-10 text-right">
            <span className="px-2 py-1 bg-black/50 rounded text-[10px] text-white/80">
              {latestPhoto.date}
              {latestPhoto.description && ` · ${latestPhoto.description}`}
            </span>
          </div>
        )}

        {currentImageUrl ? (
          <img
            src={currentImageUrl}
            alt={photoSide === 'front' ? '전면' : '후면'}
            className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setLightboxIndex(0)}
          />
        ) : readOnly ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-content-muted">
            <ImageIcon size={48} strokeWidth={1} className="mb-2" />
            <span className="text-sm">{photoSide === 'front' ? '전면' : '후면'} 사진 없음</span>
          </div>
        ) : (
          <button
            onClick={handleUploadClick}
            className="w-full h-full flex flex-col items-center justify-center text-content-muted hover:text-primary transition-colors"
          >
            <ImageIcon size={48} strokeWidth={1} className="mb-2" />
            <span className="text-sm">{photoSide === 'front' ? '전면' : '후면'} 사진 추가</span>
          </button>
        )}
      </div>
    </div>
  );
}
