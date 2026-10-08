/**
 * RackPlanView — 평면도. **도면에 서는 것은 랙뿐이다.**
 *
 * 층 탭 + 캔버스(배경 → 격자 → 연결선 → 랙 → 그리는 네모) + 뷰포트(확대·밀기) + 배치 도구.
 * 배치는 「아직 놓이지 않은 이 국 랙」을 골라 도면에 네모를 그리는 일이다 — 랙을 새로 만들지
 * 않는다(만드는 길은 현황의 「랙 추가」 하나다). 도면에서 빼도 랙은 남는다.
 *
 * rAF 렌더와 창 리스너는 React 렌더 밖에서 돈다 — 그것들이 읽는 「지금 값」은 매 렌더 갱신되는
 * `latest` 하나뿐이다(클로저에서 읽으면 낡은 프레임을 그린다). 손짓은 `usePlanGesture` 가 쥔다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCw } from 'lucide-react';
import { renderBackgroundDrawing } from '../../canvas/backgroundRenderer';
import { backingSize } from '../../canvas/backingStore';
import { contentBounds, fitViewport } from '../../canvas/fitView';
import { renderGrid } from '../../canvas/gridRenderer';
import { findAssetAt, type PlacedRect } from '../../canvas/hitTest';
import { renderDrawPreview, renderPlacedAssets } from '../../canvas/renderers';
import { SNAP_GRID } from '../../canvas/constants';
import { canvasColor } from '../../canvas/theme';
import { zoomAtPoint, ZOOM_STEP, type Viewport } from '../../canvas/transform';
import { useCatalog } from '../../model/hooks';
import { bySubstation, effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Floor } from '../../model/types';
import { isAdminRole, useV2AuthStore } from '../../store/authStore';
import { Button, EmptyState, IconButton, Select, StatusBar, StatusItem, Tabs, useConfirm, useTabs, ViewCard, formatNumber } from '../../../components/ui';
import { AssetResizeHandles } from '../floorplan/AssetResizeHandles';
import { BackgroundImportControls } from '../floorplan/BackgroundImportControls';
import { useFloorAdmin } from '../floorplan/useFloorAdmin';
import { PlanBackgroundRail } from './PlanBackgroundRail';
import { nextFacing, placedRacks, planLinks, unplacedRacks, type PlanLink } from './planSelectors';
import { usePlanGesture } from './usePlanGesture';

/** 주 격자 — 타일 다섯 장(3 m). 보조 격자(타일 한 장, 60 cm)의 배수여야 두 격자가 겹친다. */
const MAJOR_GRID = 300;
/** 연결선 굵기 — 화면 기준 고정. */
const LINK_PX = 1.5;

interface Props {
  substationId: string;
  selectedRackId: string | null;
  onSelectRack: (id: string | null) => void;
  /** 배경 도면 농도·레이어를 펼 자리(트리 아래) — 없으면 펴지 않는다. */
  railTarget?: HTMLElement | null;
}

/** rAF 렌더가 읽는 「지금 값」 — 매 렌더 한 번 갱신된다. */
interface Latest {
  viewport: Viewport;
  floor: Floor | null;
  placed: PlacedRect[];
  links: PlanLink[];
  selectedRackId: string | null;
  hiddenLayers: ReadonlySet<string>;
}

export function RackPlanView({ substationId, selectedRackId, onSelectRack, railTarget = null }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const isAdmin = useV2AuthStore((s) => isAdminRole(s.user?.role));

  const floors = useMemo(
    () => bySubstation(effectiveRows({ saved, overlays }, 'floors'), substationId).sort((a, b) => a.sortOrder - b.sortOrder),
    [saved, overlays, substationId],
  );
  const racks = useMemo(() => bySubstation(effectiveRows({ saved, overlays }, 'racks'), substationId), [saved, overlays, substationId]);

  // ── 층 ── 고른 것이 없거나 지워졌으면 첫 층(파생값 — effect 로 세우면 첫 프레임이 빈다).
  const [pickedFloorId, setPickedFloorId] = useState<string | null>(null);
  const activeFloorId = floors.some((f) => f.id === pickedFloorId) ? pickedFloorId : (floors[0]?.id ?? null);
  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? null;

  /* 고른 랙이 다른 층에 놓였으면 그 층으로 따라간다 — 사람이 고른 층을 덮는 명령이라 effect 다.
     **고른 것이 바뀔 때 한 번만** 따라간다: 매번 따르면 랙을 고른 채로는 다른 층 탭을 열 수 없다. */
  const followedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedRackId) { followedFor.current = null; return; }
    if (followedFor.current === selectedRackId) return;
    const floorId = racks.find((r) => r.id === selectedRackId)?.floorId;
    if (!floorId || !floors.some((f) => f.id === floorId)) return; // 아직 안 놓였다 — 놓이면 그때
    followedFor.current = selectedRackId;
    setPickedFloorId(floorId);
  }, [selectedRackId, racks, floors]);

  const placed = useMemo(
    () => (activeFloorId ? placedRacks({ saved, overlays }, activeFloorId) : []),
    [saved, overlays, activeFloorId],
  );
  const waiting = useMemo(() => unplacedRacks({ saved, overlays }, substationId), [saved, overlays, substationId]);

  /* 선 색 — 케이블 품목의 매체 색, 품목이 없으면 도면의 중립색(랙 윤곽과 같은 색). */
  const links = useMemo(() => {
    if (!activeFloorId) return [];
    const mediumOfType = new Map((catalog?.cableTypes ?? []).map((t) => [t.id, t.medium]));
    const colorOfMedium = new Map((catalog?.media ?? []).map((m) => [m.key, m.color]));
    return planLinks(
      { saved, overlays }, activeFloorId,
      (id) => (id ? mediumOfType.get(id) ?? null : null),
      (m) => (m ? colorOfMedium.get(m) : undefined) ?? canvasColor('plan-rack-stroke'),
    );
  }, [saved, overlays, activeFloorId, catalog]);

  // ── 배치 도구 ── `[배치] + [랙 Select]` 한 줄(§1.6).
  const [armed, setArmed] = useState(false);
  const [pickedRackId, setPickedRackId] = useState('');
  const placeRackId = waiting.some((r) => r.id === pickedRackId) ? pickedRackId : (waiting[0]?.id ?? '');
  /* 놓을 랙이 다 떨어지면 도구는 저절로 꺼진다(파생). */
  const isArmed = armed && placeRackId !== '' && activeFloorId != null;

  // ── 뷰포트·캔버스 ──
  const [viewport, setViewport] = useState<Viewport>({ zoom: 100, panX: 0, panY: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coordRef = useRef<HTMLSpanElement | null>(null);
  const backingScale = useRef(1);
  const rafPending = useRef(false);
  /** 꺼 둔 배경 레이어 — 보는 방식이지 자료가 아니다. 층이 바뀌면 비운다(§3.3). */
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<string>>(() => new Set());
  const hiddenFor = useRef<string | null>(null);
  if (hiddenFor.current !== activeFloorId) {
    hiddenFor.current = activeFloorId;
    if (hiddenLayers.size > 0) setHiddenLayers(new Set());
  }
  const latest = useRef<Latest>({ viewport, floor: activeFloor, placed, links, selectedRackId, hiddenLayers });
  latest.current = { viewport, floor: activeFloor, placed, links, selectedRackId, hiddenLayers };
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const update = workingCopyStore.getState().update;
  const { gesture, preview, fold, handlers } = usePlanGesture({
    viewportRef,
    setViewport,
    hitAt: (w) => findAssetAt(w.x, w.y, latest.current.placed),
    resizable: () => latest.current.placed.find((r) => r.id === latest.current.selectedRackId) ?? null,
    armed: () => (isArmed && activeFloorId ? { rackId: placeRackId, floorId: activeFloorId } : null),
    onDraw: (rackId, floorId, rect) => {
      update('racks', rackId, { floorId, ...rect, facing: nextFacing(null) });
      setArmed(false);
      onSelectRack(rackId);
    },
    onMove: (rackId, at) => update('racks', rackId, at),
    onResize: (rackId, rect) => update('racks', rackId, rect),
    onSelect: onSelectRack,
    onEscape: () => setArmed(false),
    onChange: () => scheduleRender(),
    onPointerWorld: (w) => {
      /* 캔버스 1 unit = 1 cm — 도면의 단위인 mm 로 적는다(리렌더 없이 마디에 직접). */
      if (coordRef.current) coordRef.current.textContent = `X ${formatNumber(Math.round(w.x * 10))} · Y ${formatNumber(Math.round(w.y * 10))}`;
    },
  });

  const scheduleRender = () => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const L = latest.current;
      const { zoom, panX, panY } = L.viewport;
      const scale = zoom / 100;
      const dpr = backingScale.current;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(scale, scale);

      // 1. 배경 도면
      if (L.floor?.backgroundDrawing) {
        renderBackgroundDrawing(ctx, L.floor.backgroundDrawing, L.floor.backgroundOpacity, scale, L.hiddenLayers);
      }
      // 2. 격자
      const left = -panX / scale;
      const top = -panY / scale;
      renderGrid(ctx, MAJOR_GRID, left, top, left + w / scale, top + h / scale, scale);

      /* 끄는 중인 랙 — 상자와 선이 **같은 것을 본다**(선이 옛 자리에 남았다가 뗄 때 튀지 않게). */
      const g = gesture.current;
      const live = g?.kind === 'resize' ? { id: g.rackId, ...g.rect }
        : g?.kind === 'move' && g.at ? { id: g.session.assetId, x: g.at.x, y: g.at.y } : null;
      const shifted = previewCenters(L.placed, live);

      // 3. 연결선 — 같은 두 랙 사이 여러 줄은 겹쳐 그린다(묶음 없음).
      ctx.save();
      ctx.lineWidth = LINK_PX / scale;
      ctx.lineCap = 'round';
      for (const l of L.links) {
        ctx.strokeStyle = l.color;
        ctx.beginPath();
        const from = shifted(l.from);
        const to = shifted(l.to);
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
      ctx.restore();

      // 4. 랙
      renderPlacedAssets(ctx, L.placed, L.selectedRackId, live, scale);

      // 5. 그리는 네모
      if (g?.kind === 'draw') renderDrawPreview(ctx, g.start, g.end);
      ctx.restore();
    });
  };
  useEffect(() => { scheduleRender(); });

  // ── 처음 맞추기 — 층마다 한 번(사람이 밀어 둔 화면을 도로 당기지 않는다) ──
  const fittedFloors = useRef(new Set<string>());
  useEffect(() => { fittedFloors.current = new Set(); }, [substationId]);
  const maybeFitRef = useRef(() => {});
  maybeFitRef.current = () => {
    const canvas = canvasRef.current;
    if (!activeFloorId || !canvas || fittedFloors.current.has(activeFloorId)) return;
    const rect = canvas.getBoundingClientRect();
    const next = fitViewport(
      contentBounds(placed, links.flatMap((l) => [l.from, l.to])),
      { width: rect.width, height: rect.height },
    );
    if (!next) return;
    fittedFloors.current.add(activeFloorId);
    setViewport(next);
  };
  useEffect(() => { maybeFitRef.current(); });

  /* 캔버스가 **붙는 순간** 크기를 맞추고 휠을 듣는다 — DOM 에 딸린 일은 ref 콜백(§1.7-q). */
  const detachCanvas = useRef<(() => void) | null>(null);
  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    detachCanvas.current?.();
    detachCanvas.current = null;
    if (!canvas) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      const { width, height } = backingSize(r.width, r.height, dpr);
      backingScale.current = dpr;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      scheduleRender();
      maybeFitRef.current();
    };
    fit();
    /* 커서 아래 도면을 고정한 채 확대 — 브라우저 확대를 막아야 하므로 passive 가 아니다. */
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      setViewport((prev) => zoomAtPoint(prev, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX - r.left, e.clientY - r.top));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    detachCanvas.current = () => { ro.disconnect(); canvas.removeEventListener('wheel', onWheel); };
    // scheduleRender 는 ref 만 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 고른 랙이 화면 밖이면 그 자리로 옮긴다 — 고른 것이 바뀔 때 한 번만, 보이면 건드리지 않는다. */
  const centeredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedRackId) { centeredFor.current = null; return; }
    const canvas = canvasRef.current;
    const t = placed.find((r) => r.id === selectedRackId);
    if (centeredFor.current === selectedRackId || !canvas || !t) return;
    centeredFor.current = selectedRackId;
    const w = canvas.width / backingScale.current;
    const h = canvas.height / backingScale.current;
    const s = viewport.zoom / 100;
    const M = 24;
    const l = viewport.panX + t.x * s;
    const tp = viewport.panY + t.y * s;
    if (l >= M && tp >= M && l + t.width * s <= w - M && tp + t.height * s <= h - M) return;
    setViewport((prev) => ({ ...prev, panX: w / 2 - (t.x + t.width / 2) * (prev.zoom / 100), panY: h / 2 - (t.y + t.height / 2) * (prev.zoom / 100) }));
    // 뷰포트는 여기서 정한 값으로만 바뀐다 — 의존성에 넣으면 스스로를 다시 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRackId, placed]);

  const zoomByButton = (factor: number) => {
    const r = canvasRef.current?.getBoundingClientRect();
    setViewport((prev) => zoomAtPoint(prev, factor, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2));
  };
  /** 배율 단추 = 「맞추기」(100% 원점으로 가면 아무것도 없는 자리일 수 있다). */
  const refit = () => {
    if (activeFloorId) fittedFloors.current.delete(activeFloorId);
    maybeFitRef.current();
  };

  // ── 고른 랙 ──
  const selectedPlaced = placed.find((r) => r.id === selectedRackId) ?? null;
  const rotateFacing = () => {
    if (!selectedRackId) return;
    /* 값은 **지금 스토어**에서 읽는다 — 렌더 클로저의 것을 쓰면 연달아 누를 때 한 칸에서 맴돈다. */
    const s = workingCopyStore.getState();
    const now = effectiveRows(s, 'racks').find((r) => r.id === selectedRackId)?.facing ?? null;
    s.update('racks', selectedRackId, { facing: nextFacing(now) });
  };
  const takeOff = () => {
    if (!selectedRackId) return;
    update('racks', selectedRackId, { floorId: null, x: null, y: null, width: null, height: null, facing: null });
  };

  /* 고른 것이 바뀌면 그 랙에 걸린 크기 손짓은 접는다 — 손잡이가 사라진 뒤에 쓰지 않게. */
  useEffect(() => {
    if (gesture.current?.kind === 'resize' && gesture.current.rackId !== selectedRackId) fold();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRackId]);

  /* 손잡이 자리 — 끄는 중이면 끌려간 자리다(크기든 이동이든). */
  const handleRect = selectedPlaced && preview?.id === selectedPlaced.id ? { ...selectedPlaced, ...preview } : selectedPlaced;

  const floorTabs = useTabs(activeFloorId ?? '');
  const { tabItems, startAdd, floorPrompt } = useFloorAdmin({ substationId, floors, racks, confirm, onCreated: setPickedFloorId });

  if (floors.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState
          title="이 변전소에는 층이 없습니다"
          description="층을 추가하면 랙을 배치할 수 있습니다."
          action={<Button size="sm" onClick={startAdd}>층 추가</Button>}
        />
        {floorPrompt}
        {confirmDialog}
      </div>
    );
  }

  const tools = (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {waiting.length > 0 ? (
        <>
          <Button size="sm" variant={isArmed ? 'primary' : 'secondary'} onClick={() => setArmed(!isArmed)}>
            배치
          </Button>
          <div className="w-44">
            <Select size="sm" aria-label="배치할 랙" title="배치할 랙" value={placeRackId} onChange={(e) => setPickedRackId(e.currentTarget.value)}>
              {waiting.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
          {isArmed && <span className="text-xs text-content-muted">드래그하여 위치 지정 · Esc 취소</span>}
        </>
      ) : (
        <span className="text-xs text-content-muted">모든 랙이 배치되었습니다</span>
      )}
      {selectedPlaced && (
        <>
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
          <IconButton
            size="sm"
            aria-label={`정면 회전 (현재 ${selectedPlaced.facing ?? '없음'})`}
            title={`정면 회전 — 현재 ${selectedPlaced.facing ?? '없음'}`}
            onClick={rotateFacing}
          >
            <RotateCw size={15} />
          </IconButton>
          <Button size="sm" variant="ghost" onClick={takeOff}>배치 해제</Button>
        </>
      )}
    </div>
  );

  const status = (
    <StatusBar className="pl-0">
      <Tabs {...floorTabs.list} edge="bottom" menuText="층 관리" items={tabItems} onChange={setPickedFloorId} className="h-full border-t-0" />
      <IconButton aria-label="층 추가" size="sm" onClick={startAdd}>
        <Plus size={14} />
      </IconButton>
      <span className="mx-2 h-4 w-px bg-line" aria-hidden />
      <StatusItem label="좌표"><span ref={coordRef}>—</span></StatusItem>
      <StatusItem label="스냅">{SNAP_GRID * 10} mm</StatusItem>
      <StatusItem label="격자">60 cm (타일)</StatusItem>
      <StatusItem label="랙">{placed.length}</StatusItem>
      <span className="ml-auto flex items-center gap-0.5">
        <IconButton aria-label="축소" size="sm" onClick={() => zoomByButton(1 / ZOOM_STEP)}>
          <Minus size={14} />
        </IconButton>
        <button
          type="button"
          title="배치된 랙에 맞추기"
          className="min-w-12 px-1 text-xs tabular-nums text-content hover:bg-surface-3"
          onClick={refit}
        >
          {Math.round(viewport.zoom)}%
        </button>
        <IconButton aria-label="확대" size="sm" onClick={() => zoomByButton(ZOOM_STEP)}>
          <Plus size={14} />
        </IconButton>
      </span>
    </StatusBar>
  );

  return (
    <ViewCard
      body="fill"
      tools={tools}
      actions={isAdmin ? <BackgroundImportControls floorId={activeFloorId} hasBackground={activeFloor?.backgroundDrawing != null} /> : undefined}
      status={status}
    >
      {floorPrompt}
      <div {...floorTabs.panel} className="flex min-h-0 min-w-0 flex-1">
        {/* 손짓의 주인은 이 판 하나다 — 캔버스와 손잡이의 누름이 모두 여기로 온다(§1.7-t). */}
        <div className="relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden bg-surface" {...handlers}>
          <canvas
            ref={attachCanvas}
            className="absolute inset-0 block h-full w-full"
            style={{ cursor: isArmed ? 'crosshair' : undefined }}
            data-testid="rackplan-canvas"
          />
          {handleRect && <AssetResizeHandles viewport={viewport} rect={handleRect} />}
          {placed.length === 0 && !isArmed && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="text-center text-xs text-content-faint">
                {waiting.length > 0
                  ? '배치된 랙이 없습니다 — 상단 「배치」에서 랙을 선택하여 배치하세요'
                  : '배치할 랙이 없습니다 — 현황에서 랙을 먼저 추가하세요'}
              </span>
            </div>
          )}
        </div>
      </div>
      <PlanBackgroundRail
        target={railTarget}
        drawing={activeFloor?.backgroundDrawing ?? null}
        hidden={hiddenLayers}
        onToggle={(name) => setHiddenLayers((prev) => {
          const next = new Set(prev);
          if (next.has(name)) next.delete(name); else next.add(name);
          return next;
        })}
        onShowAll={() => setHiddenLayers(new Set())}
        opacity={activeFloor?.backgroundOpacity ?? 0.5}
        onOpacity={(v) => { if (activeFloorId) update('floors', activeFloorId, { backgroundOpacity: v }); }}
      />
      {confirmDialog}
    </ViewCard>
  );
}

/**
 * 끄는 중인 랙의 **옛 중심 → 새 중심** — 선 끝이 그 랙의 옛 중심이면 새 중심으로 옮긴다.
 * 끄는 것이 없으면 그대로 돌려준다.
 */
function previewCenters(
  placed: readonly PlacedRect[],
  preview: { id: string; x: number; y: number; width?: number; height?: number } | null,
): (p: { x: number; y: number }) => { x: number; y: number } {
  const base = preview ? placed.find((r) => r.id === preview.id) : undefined;
  if (!preview || !base) return (p) => p;
  const from = { x: base.x + base.width / 2, y: base.y + base.height / 2 };
  const to = { x: preview.x + (preview.width ?? base.width) / 2, y: preview.y + (preview.height ?? base.height) / 2 };
  return (p) => (p.x === from.x && p.y === from.y ? to : p);
}
