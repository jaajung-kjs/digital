import { useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { compressImage } from '../../../utils/imageCompression';
import { generateTempId } from '../../../utils/idHelpers';
import { useEditorStore } from '../../editor/stores/editorStore';
// 현황(대장) 사진도 에디터 PhotosTab 과 동일한 보류 큐로 스테이징 → 단일 저장 시 flushPendingMedia 가 업로드.
// 저장된 사진은 editor 와 동일한 query key(['equipment-photos', id])를 써서 commit 무효화로 자동 갱신.
import { useEquipmentPhotos, useDeletePhoto } from '../../equipment/hooks/useEquipmentPhotos';

type Shown = { id: string; url: string; isPending: boolean; date: string | null };

const fmtDate = (s: string) => new Date(s).toLocaleDateString('ko-KR');

/**
 * 사진 섹션 — 전면/후면 세그먼트 토글 + 큰 사진(세로 사진도 꽉 차게 object-contain) +
 * 클릭 시 라이트박스 확대 + 업로드 날짜 표시. 보류(저장 대기) 사진도 함께 노출.
 */
export function AssetPhotoSection({ assetId }: { assetId: string }) {
  const [side, setSide] = useState<'front' | 'rear'>('front');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: saved = [] } = useEquipmentPhotos(assetId);
  const del = useDeletePhoto();

  const pendingUploads = useEditorStore((s) => s.pendingUploads);
  const addPendingUpload = useEditorStore((s) => s.addPendingUpload);
  const removePendingUpload = useEditorStore((s) => s.removePendingUpload);

  const shown = useMemo<Shown[]>(() => {
    const pending = pendingUploads
      .filter((u) => u.equipmentId === assetId && u.side === side)
      .map((u) => ({ id: u.id, url: u.objectUrl, isPending: true as const, date: null }));
    const savedShown = saved
      .filter((p) => p.side === side)
      .map((p) => ({
        id: p.id,
        url: p.imageUrl,
        isPending: false as const,
        date: p.takenAt ?? p.createdAt ?? null,
      }));
    return [...pending, ...savedShown];
  }, [pendingUploads, saved, assetId, side]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const compressed = await compressImage(file);
    const objectUrl = URL.createObjectURL(compressed);
    addPendingUpload({ id: generateTempId(), equipmentId: assetId, side, file: compressed, description: '', objectUrl });
  };

  const onDelete = (item: { id: string; isPending: boolean }) => {
    if (item.isPending) { removePendingUpload(item.id); return; }
    if (window.confirm('사진을 삭제할까요?')) del.mutate(item.id);
  };

  return (
    <section className="space-y-3">
      {/* 전면/후면 세그먼트 + 업로드 */}
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-line p-0.5 bg-surface-2/60">
          {(['front', 'rear'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors focus-visible:outline-none ${
                side === s ? 'bg-primary text-white shadow-sm' : 'text-content-muted hover:text-content'
              }`}
            >
              {s === 'front' ? '전면' : '후면'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 text-sm font-medium rounded px-2 py-1 text-primary hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Upload size={14} /> 업로드
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line py-12 text-content-faint">
          <ImageIcon size={28} className="opacity-50" />
          <p className="text-sm">{side === 'front' ? '전면' : '후면'} 사진이 없습니다</p>
          <button type="button" onClick={() => fileRef.current?.click()} className="text-sm text-primary hover:underline">
            사진 업로드
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((item) => (
            <figure key={item.id} className="relative group rounded-lg overflow-hidden border border-line bg-gray-900">
              {/* 세로/가로 무관 전체가 보이도록 object-contain + 넉넉한 높이. 클릭 시 확대. */}
              <img
                src={item.url}
                alt=""
                onClick={() => setLightbox(item.url)}
                className="w-full max-h-[24rem] object-contain cursor-zoom-in"
              />
              <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between px-2 py-1 bg-gradient-to-t from-black/65 to-transparent text-xs text-white">
                <span>
                  {item.isPending ? '저장 대기' : item.date ? fmtDate(item.date) : ''}
                </span>
              </figcaption>
              <button
                type="button"
                aria-label="사진 삭제"
                onClick={() => onDelete(item)}
                className="absolute top-1.5 right-1.5 rounded-full bg-black/50 p-1 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-danger"
              >
                <X size={13} />
              </button>
            </figure>
          ))}
        </div>
      )}

      {/* 라이트박스 — body 포털, 배경/닫기 버튼 클릭으로 닫기. */}
      {lightbox &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
            onClick={() => setLightbox(null)}
            role="dialog"
            aria-modal="true"
          >
            <img src={lightbox} alt="" className="max-w-full max-h-full object-contain" />
            <button
              type="button"
              aria-label="닫기"
              onClick={() => setLightbox(null)}
              className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X size={20} />
            </button>
          </div>,
          document.body,
        )}
    </section>
  );
}
