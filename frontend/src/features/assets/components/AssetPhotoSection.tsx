import { useRef, useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { compressImage } from '../../../utils/imageCompression';
import { generateTempId } from '../../../utils/idHelpers';
import { useEditorStore } from '../../editor/stores/editorStore';
// 현황(대장) 사진도 에디터 PhotosTab 과 동일한 보류 큐로 스테이징 → 단일 저장 시 flushPendingMedia 가 업로드.
// 저장된 사진은 editor 와 동일한 query key(['equipment-photos', id])를 써서 commit 무효화로 자동 갱신.
import { useEquipmentPhotos, useDeletePhoto } from '../../equipment/hooks/useEquipmentPhotos';

export function AssetPhotoSection({ assetId }: { assetId: string }) {
  const [side, setSide] = useState<'front' | 'rear'>('front');
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: saved = [] } = useEquipmentPhotos(assetId);
  const del = useDeletePhoto();

  const pendingUploads = useEditorStore((s) => s.pendingUploads);
  const addPendingUpload = useEditorStore((s) => s.addPendingUpload);
  const removePendingUpload = useEditorStore((s) => s.removePendingUpload);

  // 저장된 사진 + 이 장비의 보류 사진(저장 대기) 머지
  const shown = useMemo(() => {
    const pending = pendingUploads
      .filter((u) => u.equipmentId === assetId && u.side === side)
      .map((u) => ({ id: u.id, url: u.objectUrl, isPending: true as const }));
    const savedShown = saved
      .filter((p) => p.side === side)
      .map((p) => ({ id: p.id, url: p.imageUrl, isPending: false as const }));
    return [...pending, ...savedShown];
  }, [pendingUploads, saved, assetId, side]);

  // 현황 자산은 이미 저장됨(real id) → 보류 큐에 real equipmentId 로 적재, 단일 저장 시 업로드.
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const compressed = await compressImage(file);
    const objectUrl = URL.createObjectURL(compressed);
    addPendingUpload({
      id: generateTempId(),
      equipmentId: assetId,
      side,
      file: compressed,
      description: '',
      objectUrl,
    });
  };

  const onDelete = (item: { id: string; isPending: boolean }) => {
    if (item.isPending) {
      removePendingUpload(item.id);
      return;
    }
    if (confirm('사진을 삭제할까요?')) del.mutate(item.id);
  };

  const isEmpty = shown.length === 0;

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
          <button onClick={() => fileRef.current?.click()}
            className="text-xs px-2 py-0.5 rounded bg-green-600 text-white">+ 업로드</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
      </div>
      {isEmpty ? (
        <p className="text-xs text-gray-400">{side === 'front' ? '전면' : '후면'} 사진 없음</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {shown.map((item) => (
            <div key={item.id} className="relative group">
              <img src={item.url} alt="" className="w-full h-20 object-cover rounded border border-gray-200" />
              {item.isPending && (
                <span className="absolute bottom-0.5 left-0.5 text-[10px] bg-amber-500 text-white rounded px-1">저장 대기</span>
              )}
              <button aria-label="사진 삭제" onClick={() => onDelete(item)}
                className="absolute top-0.5 right-0.5 bg-white/80 rounded p-0.5 opacity-0 group-hover:opacity-100"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
