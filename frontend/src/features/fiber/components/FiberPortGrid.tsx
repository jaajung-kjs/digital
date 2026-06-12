import { useState } from 'react';
import type { FiberPathDetail, FiberPortStatus, FiberPortUsage } from '../types';
import type { LocalCable } from '../../editor/stores/editorStore';
import { useEffectiveCables } from '../../workingCopy/hooks';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { CABLE_COLORS, normalizeCableColor } from '../../../types/connection';

interface FiberPortGridProps {
  fiberPath: FiberPathDetail;
  localOfdId: string;
  /** Called when user wants to connect an empty port (or add to a partial port) */
  onPortConnect?: (portNumber: number, fiberPathId: string) => void;
  /** Called when user wants to delete a cable from a port */
  onPortDelete?: (cableId: string) => void;
  /** Called when user wants to navigate to the remote OFD's room to connect there */
  onNavigateRemote?: (remoteRoomId: string) => void;
}

function getPortColor(port: FiberPortStatus): string {
  const hasA = !!port.sideA;
  const hasB = !!port.sideB;
  if (hasA && hasB) return 'bg-success-bg border-success';
  if (hasA || hasB) return 'bg-warning-bg border-warning';
  return 'bg-surface-2 border-line';
}

function getSelectedColor(port: FiberPortStatus): string {
  const hasA = !!port.sideA;
  const hasB = !!port.sideB;
  if (hasA && hasB) return 'bg-success-bg border-success ring-2 ring-success/40';
  if (hasA || hasB) return 'bg-warning-bg border-warning ring-2 ring-warning/40';
  return 'bg-info-bg border-primary ring-2 ring-primary/30';
}

export function FiberPortGrid({ fiberPath, localOfdId, onPortConnect, onPortDelete, onNavigateRemote }: FiberPortGridProps) {
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const startTrace = usePathHighlightStore((s) => s.startTrace);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);

  const isLocalA = fiberPath.ofdA.id === localOfdId;
  const localSub = isLocalA ? fiberPath.ofdA.substationName : fiberPath.ofdB.substationName;
  const remoteSub = isLocalA ? fiberPath.ofdB.substationName : fiberPath.ofdA.substationName;
  const remoteRoomId = isLocalA ? fiberPath.ofdB.floorId : fiberPath.ofdA.floorId;

  const getLocalSide = (port: FiberPortStatus): FiberPortUsage | null =>
    isLocalA ? port.sideA : port.sideB;
  const getRemoteSide = (port: FiberPortStatus): FiberPortUsage | null =>
    isLocalA ? port.sideB : port.sideA;

  const selectedPortData = fiberPath.ports.find((p) => p.portNumber === selectedPort);

  // 포트 셀 클릭 = "이 포트의 경로를 보고 싶다" — 셀 클릭 한 번으로 selectedPort 갱신
  // + trace 시작/종료 동시. 빈 포트는 trace 종료, cable 있는 포트는 그 cable trace 시작.
  const handleCellClick = (port: FiberPortStatus) => {
    const isToggleOff = selectedPort === port.portNumber;
    if (isToggleOff) {
      setSelectedPort(null);
      clearHighlight();
      return;
    }
    setSelectedPort(port.portNumber);
    const localSide = getLocalSide(port);
    if (localSide?.cableId) {
      void startTrace(localSide.cableId);
    } else {
      clearHighlight();
    }
  };

  return (
    <div>
      {/* Path label */}
      <div className="mb-2 text-xs font-medium text-content-muted">
        {localSub} - {remoteSub}
      </div>

      {/* Port grid */}
      <div className="grid grid-cols-6 gap-1.5">
        {fiberPath.ports.map((port) => {
          const localSide = getLocalSide(port);
          const isSelected = selectedPort === port.portNumber;
          const color = isSelected ? getSelectedColor(port) : getPortColor(port);

          return (
            <div
              key={port.portNumber}
              className={`rounded border p-1.5 text-center cursor-pointer transition-all hover:opacity-80 ${color}`}
              onClick={() => handleCellClick(port)}
            >
              <div className="font-mono text-xs font-bold text-content">
                #{port.portNumber}
              </div>
              {localSide ? (
                <div className="truncate text-[10px] text-content-muted">
                  {localSide.assetName}
                </div>
              ) : (
                <div className="text-[10px] text-content-faint">빈 포트</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected port detail */}
      {selectedPortData && (
        <PortDetail
          port={selectedPortData}
          localSide={getLocalSide(selectedPortData)}
          remoteSide={getRemoteSide(selectedPortData)}
          localSubName={localSub}
          remoteSubName={remoteSub}
          onConnect={onPortConnect ? () => {
            onPortConnect(selectedPortData.portNumber, fiberPath.id);
            setSelectedPort(null);
          } : undefined}
          onDelete={onPortDelete}
          onNavigateRemote={remoteRoomId && onNavigateRemote ? () => {
            onNavigateRemote(remoteRoomId);
          } : undefined}
          onClose={() => { setSelectedPort(null); clearHighlight(); }}
        />
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[10px] text-content-muted">
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-success bg-success-bg" />
          양측 연결
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-warning bg-warning-bg" />
          편측 연결
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-line bg-surface-2" />
          빈 포트
        </div>
      </div>
    </div>
  );
}

/* ── Port Detail Panel ── */

interface PortDetailProps {
  port: FiberPortStatus;
  localSide: FiberPortUsage | null;
  remoteSide: FiberPortUsage | null;
  localSubName: string;
  remoteSubName: string;
  onConnect?: () => void;
  onDelete?: (cableId: string) => void;
  onNavigateRemote?: () => void;
  onClose: () => void;
}

function PortDetail({
  port,
  localSide,
  remoteSide,
  localSubName,
  remoteSubName,
  onConnect,
  onDelete,
  onNavigateRemote,
  onClose,
}: PortDetailProps) {
  const hasLocal = !!localSide;
  const hasRemote = !!remoteSide;
  const isEmpty = !hasLocal && !hasRemote;

  // 자국 cable 의 카테고리/색상 lookup — ConnectionDiagram cable card 와 같은 톤의 배지 표시
  const effectiveCables = useEffectiveCables();
  const localCable = localSide
    ? ((effectiveCables.find((c) => (c as { id: string }).id === localSide.cableId) ??
        null) as unknown as LocalCable | null)
    : null;
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const traceActive = usePathHighlightStore((s) => s.active);
  // trace 는 셀 클릭 (FiberPortGrid.handleCellClick) 에서 단일 진입 — 카드 본체 클릭은
  // 시각 강조만. isCardSelected 는 *현재 셀 = 현재 trace cable* 인지의 표시용.
  const isCardSelected = traceActive && tracingCableId === localSide?.cableId;

  const badgeLabel =
    localCable?.categoryName ?? localCable?.categoryCode ?? localCable?.cableType ?? 'FIBER';
  const badgeColor =
    normalizeCableColor(localCable?.displayColor) || (localCable ? CABLE_COLORS[localCable.cableType] : null) || '#22c55e';

  return (
    <div className="mt-2 rounded-lg border border-line bg-surface p-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-content">
          포트 #{port.portNumber} 상세
        </span>
        <button
          onClick={onClose}
          className="text-content-faint hover:text-content text-xs"
        >
          닫기
        </button>
      </div>

      {/* Cable card — ConnectionDiagram 톤. trace 는 셀 클릭에서 이미 시작됐고
          여기는 그 결과의 시각 카드. */}
      {hasLocal ? (
        <div
          className={`group rounded border px-3 py-2 transition-colors ${
            isCardSelected
              ? 'border-primary bg-info-bg ring-1 ring-primary/30'
              : 'border-line bg-surface'
          }`}
        >
          <div className="flex items-center gap-2 text-sm">
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-medium text-content">{localSide!.assetName}</p>
              <p className="truncate text-[10px] text-content-faint">자국 · {localSubName}</p>
            </div>
            <div className="flex flex-col items-center shrink-0">
              <span
                className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: badgeColor }}
              >
                {badgeLabel}
              </span>
              <div className="my-0.5 h-px w-12 bg-line" />
            </div>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-medium text-content">
                {hasRemote ? remoteSide!.assetName : '대국 미연결'}
              </p>
              <p className="truncate text-[10px] text-content-faint">대국 · {remoteSubName}</p>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-content-faint text-center truncate">
            {localSubName}-{remoteSubName} #{port.portNumber}
          </p>
        </div>
      ) : (
        // 자국 없음 (대국만 또는 빈 포트) — trace 불가, 정보만 표시. 자국/대국 모두 "빈 포트" 톤 통일.
        <div className="rounded border border-dashed border-line bg-surface-2 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-medium text-content-faint">빈 포트</p>
              <p className="truncate text-[10px] text-content-faint">자국 · {localSubName}</p>
            </div>
            <div className="shrink-0 text-content-faint">|</div>
            <div className="min-w-0 flex-1 text-center">
              <p className={`truncate text-sm font-medium ${hasRemote ? 'text-content' : 'text-content-faint'}`}>
                {hasRemote ? remoteSide!.assetName : '빈 포트'}
              </p>
              <p className="truncate text-[10px] text-content-faint">대국 · {remoteSubName}</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-line">
        {/* 자국 있음 → 삭제. 자국 카드 클릭으로 이미 trace 시작됐고, 외부망은 PathTraceDetail 의 "상세" 로. */}
        {hasLocal && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`${localSide!.assetName} 연결을 삭제하시겠습니까?`)) {
                onDelete(localSide!.cableId);
                clearHighlight();
              }
            }}
            className="text-xs text-content-muted hover:text-danger"
          >
            삭제
          </button>
        )}

        {/* 빈 자국 + 대국 있음 → 자국 연결 추가 */}
        {!hasLocal && hasRemote && onConnect && (
          <button
            onClick={onConnect}
            className="flex-1 rounded bg-warning px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            자국 연결 추가
          </button>
        )}

        {/* 자국 있음 + 대국 없음 → 대국 도면으로 이동 */}
        {hasLocal && !hasRemote && (
          onNavigateRemote ? (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigateRemote(); }}
              className="ml-auto rounded bg-warning px-3 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              대국({remoteSubName}) 도면으로 이동
            </button>
          ) : (
            <p className="ml-auto text-[10px] text-warning">
              대국({remoteSubName}) 도면에서 연결해주세요
            </p>
          )
        )}

        {/* 완전 빈 포트 → 연결 */}
        {isEmpty && onConnect && (
          <button
            onClick={onConnect}
            className="flex-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
          >
            연결
          </button>
        )}
      </div>
    </div>
  );
}

