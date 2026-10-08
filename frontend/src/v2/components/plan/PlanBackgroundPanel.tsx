import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { BackgroundDrawing } from '@twin/core';
import { DetailCardHeader, IconButton } from '../../../components/ui';

/**
 * 배경 도면 정보(농도·레이어) — **평면도 판 안**, 도면 오른쪽 위에 뜨는 도구 판(GIS 의 레이어 판).
 *
 * 머리 띠의 「배경 도면」 단추가 열고 닫는다. 예전에는 조직 트리 아래 레일에 살아서 평면도에서는 트리를 접을 수
 * 없었다(1280 에서 판이 좁은 채로 잠겼다). 판 안에 두면 트리는 다른 판과 똑같이 접힌다.
 * 농도는 자료라 워킹카피에 오르고(`onOpacity`), 레이어 끄기는 보는 방식이라 화면이 든다(§3.3).
 */
export function PlanBackgroundPanel({
  drawing, hidden, onToggle, onShowAll, opacity, onOpacity, onClose,
}: {
  drawing: BackgroundDrawing | null;
  hidden: ReadonlySet<string>;
  onToggle: (name: string) => void;
  onShowAll: () => void;
  opacity: number;
  /** 손을 뗄 때 한 번 불린다. 없으면(조회 사용자) 농도는 읽기만 한다. */
  onOpacity?: (v: number) => void;
  onClose: () => void;
}) {
  /* 도면이 실제로 그리는 레이어만 — 선언만 있고 아무것도 안 그리는 것이 흔하다(`DEFPOINTS`). */
  const layers = useMemo(() => {
    if (!drawing) return [];
    const used = new Set<string>();
    for (const p of drawing.paths) used.add(p.layer);
    for (const t of drawing.texts) used.add(t.layer);
    for (const f of drawing.filled ?? []) used.add(f.layer);
    return drawing.layers.filter((l) => used.has(l.name));
  }, [drawing]);
  /* 끄는 동안은 화면만 바꾸고, **손을 뗄 때 한 번** 쓴다 — 한 칸마다 쓰면 되돌리기가 칸 수만큼 쌓인다. */
  const [draft, setDraft] = useState<number | null>(null);
  if (!drawing) return null;
  const shown = draft ?? opacity;
  const commit = () => {
    if (draft != null && draft !== opacity) onOpacity?.(draft);
    setDraft(null);
  };
  const offCount = layers.filter((l) => hidden.has(l.name)).length;

  return (
    <div
      role="region" aria-label="배경 도면"
      className="absolute right-2 top-2 z-legend flex max-h-[calc(100%-1rem)] w-64 flex-col overflow-hidden rounded border border-line-strong bg-surface text-xs shadow-md"
    >
      <DetailCardHeader
        title="배경 도면"
        className="shrink-0"
        actions={(
          <>
            <span className="min-w-0 truncate text-xs text-content-faint" title={drawing.source.fileName}>{drawing.source.fileName}</span>
            <IconButton size="sm" aria-label="배경 도면 닫기" title="닫기" onClick={onClose}><X size={14} /></IconButton>
          </>
        )}
      />
      <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
        <span className="shrink-0 text-content-muted">농도</span>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round(shown * 100)}
          aria-label="배경 농도"
          disabled={!onOpacity}
          className="min-w-0 flex-1"
          onChange={(e) => setDraft(Number(e.currentTarget.value) / 100)}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <span className="w-8 shrink-0 text-right tabular-nums text-content">{Math.round(shown * 100)}%</span>
      </div>
      <DetailCardHeader
        title={`레이어 ${layers.length - offCount}/${layers.length}`}
        className="shrink-0 border-t"
        actions={
          <button
            type="button"
            className="text-xs text-primary hover:underline disabled:text-content-faint"
            disabled={offCount === 0}
            onClick={onShowAll}
          >
            모두 켜기
          </button>
        }
      />
      {/* 레이어가 스물 장을 넘겨도 트리를 밀어내지 않는다 — 목록만 제 안에서 흐른다. */}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {layers.map((l) => (
          <li key={l.name}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-surface-2">
              <input type="checkbox" className="size-3.5" checked={!hidden.has(l.name)} onChange={() => onToggle(l.name)} />
              {/* 도면이 그 레이어에 쓰는 색 — CAD 에서 레이어는 색으로 기억된다. */}
              <span aria-hidden className="size-2.5 shrink-0 border border-line" style={{ background: l.color }} />
              <span className="min-w-0 flex-1 truncate text-content">{l.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
