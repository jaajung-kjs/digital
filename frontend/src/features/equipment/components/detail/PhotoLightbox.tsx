import { useState, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { LightboxPhoto } from './types';

export function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
  onDelete,
}: {
  photos: LightboxPhoto[];
  initialIndex: number;
  onClose: () => void;
  onDelete?: (photoId: string) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  const photo = photos[index];
  if (!photo) return null;

  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  const resetView = () => { setScale(1); setTranslate({ x: 0, y: 0 }); };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((s) => Math.min(Math.max(s + delta, 0.5), 5));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (scale <= 1) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [scale, translate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    setTranslate({
      x: translateStart.current.x + e.clientX - dragStart.current.x,
      y: translateStart.current.y + e.clientY - dragStart.current.y,
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const goTo = (newIndex: number) => {
    setIndex(newIndex);
    resetView();
  };

  const handleDelete = () => {
    if (!photo.id || !onDelete) return;
    if (!confirm('이 사진을 삭제하시겠습니까?')) return;
    onDelete(photo.id);
    if (photos.length <= 1) {
      onClose();
    } else if (index >= photos.length - 1) {
      setIndex(index - 1);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <span className="text-sm">{index + 1} / {photos.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setScale((s) => Math.min(s + 0.5, 5))} className="p-1.5 hover:bg-white/20 rounded" title="확대">
            <ZoomIn size={20} />
          </button>
          <button onClick={() => setScale((s) => Math.max(s - 0.5, 0.5))} className="p-1.5 hover:bg-white/20 rounded" title="축소">
            <ZoomOut size={20} />
          </button>
          {scale !== 1 && (
            <button onClick={resetView} className="px-2 py-1 text-xs hover:bg-white/20 rounded">
              {Math.round(scale * 100)}%
            </button>
          )}
          {photo.id && photo.id.startsWith('pending-') && onDelete && (
            <button onClick={handleDelete} className="p-1.5 hover:bg-red-500/50 rounded" title="사진 삭제">
              <Trash2 size={20} />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded" title="닫기">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0">
        {hasPrev && (
          <button
            onClick={() => goTo(index - 1)}
            className="absolute left-3 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => goTo(index + 1)}
            className="absolute right-3 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
          >
            <ChevronRight size={24} />
          </button>
        )}
        <img
          src={photo.url}
          alt={photo.description || '사진'}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
            cursor: scale > 1 ? 'grab' : 'default',
            transition: isDragging.current ? 'none' : 'transform 0.15s ease',
          }}
          draggable={false}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>

      <div className="shrink-0 px-4 py-3 text-white text-center">
        <p className="text-sm">{photo.date}</p>
        {photo.description && (
          <p className="text-sm text-white/70 mt-0.5">{photo.description}</p>
        )}
      </div>
    </div>,
    document.body
  );
}
