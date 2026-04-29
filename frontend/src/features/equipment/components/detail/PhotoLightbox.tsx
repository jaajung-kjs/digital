import { useState, useRef, useCallback } from 'react';
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
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>
          <button onClick={() => setScale((s) => Math.max(s - 0.5, 0.5))} className="p-1.5 hover:bg-white/20 rounded" title="축소">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          {scale !== 1 && (
            <button onClick={resetView} className="px-2 py-1 text-xs hover:bg-white/20 rounded">
              {Math.round(scale * 100)}%
            </button>
          )}
          {photo.id && photo.id.startsWith('pending-') && onDelete && (
            <button onClick={handleDelete} className="p-1.5 hover:bg-red-500/50 rounded" title="사진 삭제">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded" title="닫기">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0">
        {hasPrev && (
          <button
            onClick={() => goTo(index - 1)}
            className="absolute left-3 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => goTo(index + 1)}
            className="absolute right-3 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
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
