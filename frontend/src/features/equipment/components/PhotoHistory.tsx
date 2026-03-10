import { useState } from 'react';
import { useEquipmentPhotos, useDeletePhoto } from '../hooks/useEquipmentPhotos';
import { PhotoUploader } from './PhotoUploader';
import { useIsAdmin } from '../../../stores/authStore';
import type { EquipmentPhoto } from '../../../types/maintenance';
import { format } from 'date-fns';

interface PhotoHistoryProps {
  equipmentId: string;
}

export function PhotoHistory({ equipmentId }: PhotoHistoryProps) {
  const { data: photos, isLoading } = useEquipmentPhotos(equipmentId);
  const deletePhoto = useDeletePhoto();
  const isAdmin = useIsAdmin();
  const [showUploader, setShowUploader] = useState(false);
  const [enlargedPhoto, setEnlargedPhoto] = useState<EquipmentPhoto | null>(
    null
  );

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-gray-500">로딩 중...</div>;
  }

  const frontPhotos =
    photos?.filter((p) => p.side === 'front') ?? [];
  const rearPhotos =
    photos?.filter((p) => p.side === 'rear') ?? [];

  const handleDelete = async (id: string) => {
    if (!confirm('이 사진을 삭제하시겠습니까?')) return;
    await deletePhoto.mutateAsync(id);
  };

  const renderColumn = (title: string, items: EquipmentPhoto[]) => (
    <div className="flex-1">
      <h4 className="mb-2 text-center text-xs font-semibold text-gray-600">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-center text-xs text-gray-400">사진 없음</p>
      ) : (
        <div className="space-y-2">
          {items.map((photo) => (
            <div
              key={photo.id}
              className="group relative overflow-hidden rounded border border-gray-200"
            >
              <img
                src={photo.imageUrl}
                alt={photo.description || title}
                className="h-32 w-full cursor-pointer object-cover"
                onClick={() => setEnlargedPhoto(photo)}
              />
              <div className="bg-gray-50 px-2 py-1">
                <p className="text-xs text-gray-500">
                  {photo.takenAt
                    ? format(new Date(photo.takenAt), 'yyyy-MM-dd')
                    : format(new Date(photo.createdAt), 'yyyy-MM-dd')}
                </p>
                {photo.description && (
                  <p className="truncate text-xs text-gray-600">
                    {photo.description}
                  </p>
                )}
              </div>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(photo.id)}
                  className="absolute right-1 top-1 hidden rounded bg-red-500 px-1.5 py-0.5 text-xs text-white group-hover:block"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-3">
      {isAdmin && (
        <div className="mb-3">
          <button
            onClick={() => setShowUploader(!showUploader)}
            className="w-full rounded border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500"
          >
            {showUploader ? '업로드 닫기' : '+ 사진 업로드'}
          </button>
        </div>
      )}

      {showUploader && (
        <div className="mb-3">
          <PhotoUploader
            equipmentId={equipmentId}
            onSuccess={() => setShowUploader(false)}
          />
        </div>
      )}

      <div className="flex gap-3">
        {renderColumn('앞면', frontPhotos)}
        {renderColumn('뒷면', rearPhotos)}
      </div>

      {/* Enlarged Photo Modal */}
      {enlargedPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
          onClick={() => setEnlargedPhoto(null)}
        >
          <div
            className="relative max-h-[80vh] max-w-[80vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={enlargedPhoto.imageUrl}
              alt={enlargedPhoto.description || '장비 사진'}
              className="max-h-[80vh] max-w-[80vw] rounded object-contain"
            />
            <button
              onClick={() => setEnlargedPhoto(null)}
              className="absolute -right-3 -top-3 rounded-full bg-white px-2 py-1 text-sm shadow hover:bg-gray-100"
            >
              X
            </button>
            {enlargedPhoto.description && (
              <p className="mt-2 text-center text-sm text-white">
                {enlargedPhoto.description}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
