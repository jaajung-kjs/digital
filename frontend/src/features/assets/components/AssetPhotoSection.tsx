import { useState, useRef } from 'react';
import { useAssetPhotos, useDeleteAssetPhoto } from '../hooks/useAssetPhotos';
import { useRegisterStore } from '../registerStore';
import { generateTempId } from '../../../utils/idHelpers';

export function AssetPhotoSection({ assetId }: { assetId: string }) {
  const [side, setSide] = useState<'front' | 'rear'>('front');
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: photos = [] } = useAssetPhotos(assetId);
  const del = useDeleteAssetPhoto(assetId);
  const photoQueue = useRegisterStore((s) => s.photoQueue);
  const shown = photos.filter((p) => p.side === side);
  const queued = photoQueue.filter((p) => p.assetId === assetId && p.side === side);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    useRegisterStore.getState().enqueuePhoto({
      tempPhotoId: generateTempId(), assetId, side, file, objectUrl: URL.createObjectURL(file),
    });
    e.target.value = '';
  };

  const isEmpty = shown.length === 0 && queued.length === 0;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">사진</h3>
        <div className="flex gap-1">
          {(['front', 'rear'] as const).map((s) => (
            <button key={s} onClick={() => setSide(s)}
              className={`text-xs px-2 py-0.5 rounded ${side === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {s === 'front' ? '전면' : '후면'}
            </button>
          ))}
          <button onClick={() => fileRef.current?.click()} className="text-xs px-2 py-0.5 rounded bg-green-600 text-white">+ 업로드</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
      </div>
      {isEmpty ? (
        <p className="text-xs text-gray-400">{side === 'front' ? '전면' : '후면'} 사진 없음</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {shown.map((p) => (
            <div key={p.id} className="relative group">
              <img src={p.imageUrl} alt="" className="w-full h-20 object-cover rounded border border-gray-200" />
              <button onClick={() => { if (confirm('사진을 삭제할까요?')) del.mutate(p.id); }}
                className="absolute top-0.5 right-0.5 text-xs bg-white/80 rounded px-1 opacity-0 group-hover:opacity-100">✕</button>
            </div>
          ))}
          {queued.map((p) => (
            <div key={p.tempPhotoId} className="relative">
              <img src={p.objectUrl} alt="" className="w-full h-20 object-cover rounded border border-amber-300" />
              <span className="absolute bottom-0.5 left-0.5 text-[10px] bg-amber-500 text-white rounded px-1">미커밋</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
