import { useState } from 'react';
import type { FiberPathDetail, FiberPortStatus, FiberPortUsage } from '../types';
import { useOfdFlow } from '../../editor/stores/interactionStore';
import { useEditorStore } from '../../editor/stores/editorStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { CABLE_COLORS } from '../../../types/connection';

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
  if (hasA && hasB) return 'bg-green-100 border-green-400';
  if (hasA || hasB) return 'bg-amber-50 border-amber-400';
  return 'bg-gray-50 border-gray-300';
}

function getSelectedColor(port: FiberPortStatus): string {
  const hasA = !!port.sideA;
  const hasB = !!port.sideB;
  if (hasA && hasB) return 'bg-green-200 border-green-500 ring-2 ring-green-300';
  if (hasA || hasB) return 'bg-amber-100 border-amber-500 ring-2 ring-amber-300';
  return 'bg-blue-100 border-blue-400 ring-2 ring-blue-300';
}

export function FiberPortGrid({ fiberPath, localOfdId, onPortConnect, onPortDelete, onNavigateRemote }: FiberPortGridProps) {
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const ofdFlow = useOfdFlow();
  const isPortSelecting = ofdFlow?.phase === 'selectingPort';
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
      void startTrace(localSide.cableId, '');
    } else {
      clearHighlight();
    }
  };

  return (
    <div>
      {/* Path label */}
      <div className="mb-2 text-xs font-medium text-gray-600">
        {localSub} - {remoteSub}
      </div>

      {/* Port grid */}
      <div className="grid grid-cols-6 gap-1.5">
        {fiberPath.ports.map((port) => {
          const localSide = getLocalSide(port);
          const isSelected = selectedPort === port.portNumber;
          const color = isSelected ? getSelectedColor(port) : getPortColor(port);

          const isConnectable = isPortSelecting && !localSide;

          return (
            <div
              key={port.portNumber}
              className={`rounded border p-1.5 text-center cursor-pointer transition-all ${color} ${
                isConnectable
                  ? 'hover:border-blue-500 hover:bg-blue-100 hover:ring-2 hover:ring-blue-300 hover:shadow-md'
                  : 'hover:opacity-80'
              }`}
              onClick={() => handleCellClick(port)}
            >
              <div className="font-mono text-xs font-bold text-gray-700">
                #{port.portNumber}
              </div>
              {localSide ? (
                <div className="truncate text-[10px] text-gray-500">
                  {localSide.equipmentName}
                </div>
              ) : (
                <div className="text-[10px] text-gray-400">빈 포트</div>
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
      <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-500">
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-green-400 bg-green-100" />
          양측 연결
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-amber-400 bg-amber-50" />
          편측 연결
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-gray-300 bg-gray-50" />
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
  const localCable = useEditorStore((s) =>
    localSide ? s.localCables.find((c) => c.id === localSide.cableId) ?? null : null,
  );
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const traceActive = usePathHighlightStore((s) => s.active);
  // trace 는 셀 클릭 (FiberPortGrid.handleCellClick) 에서 단일 진입 — 카드 본체 클릭은
  // 시각 강조만. isCardSelected 는 *현재 셀 = 현재 trace cable* 인지의 표시용.
  const isCardSelected = traceActive && tracingCableId === localSide?.cableId;

  const badgeLabel =
    localCable?.categoryName ?? localCable?.categoryCode ?? localCable?.cableType ?? 'FIBER';
  const badgeColor =
    localCable?.displayColor || (localCable ? CABLE_COLORS[localCable.cableType] : null) || '#22c55e';

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">
          포트 #{port.portNumber} 상세
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xs"
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
              ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
              : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center gap-2 text-sm">
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-medium text-gray-700">{localSide!.equipmentName}</p>
              <p className="truncate text-[10px] text-gray-400">자국 · {localSubName}</p>
            </div>
            <div className="flex flex-col items-center shrink-0">
              <span
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ backgroundColor: badgeColor, color: '#ffffff' }}
              >
                {badgeLabel}
              </span>
              <div className="my-0.5 h-px w-12 bg-gray-300" />
            </div>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-medium text-gray-700">
                {hasRemote ? remoteSide!.equipmentName : '대국 미연결'}
              </p>
              <p className="truncate text-[10px] text-gray-400">대국 · {remoteSubName}</p>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-gray-400 text-center truncate">
            {localSubName}-{remoteSubName} #{port.portNumber}
          </p>
        </div>
      ) : (
        // 자국 없음 (대국만 또는 빈 포트) — trace 불가, 정보만 표시. 자국/대국 모두 "빈 포트" 톤 통일.
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-medium text-gray-400">빈 포트</p>
              <p className="truncate text-[10px] text-gray-400">자국 · {localSubName}</p>
            </div>
            <div className="shrink-0 text-gray-300">|</div>
            <div className="min-w-0 flex-1 text-center">
              <p className={`truncate text-sm font-medium ${hasRemote ? 'text-gray-700' : 'text-gray-400'}`}>
                {hasRemote ? remoteSide!.equipmentName : '빈 포트'}
              </p>
              <p className="truncate text-[10px] text-gray-400">대국 · {remoteSubName}</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
        {/* 자국 있음 → 삭제. 자국 카드 클릭으로 이미 trace 시작됐고, 외부망은 PathTraceDetail 의 "상세" 로. */}
        {hasLocal && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`${localSide!.equipmentName} 연결을 삭제하시겠습니까?`)) {
                onDelete(localSide!.cableId);
                clearHighlight();
              }
            }}
            className="text-xs text-gray-500 hover:text-red-600"
          >
            삭제
          </button>
        )}

        {/* 빈 자국 + 대국 있음 → 자국 연결 추가 */}
        {!hasLocal && hasRemote && onConnect && (
          <button
            onClick={onConnect}
            className="flex-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            자국 연결 추가
          </button>
        )}

        {/* 자국 있음 + 대국 없음 → 대국 도면으로 이동 */}
        {hasLocal && !hasRemote && (
          onNavigateRemote ? (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigateRemote(); }}
              className="ml-auto rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
            >
              대국({remoteSubName}) 도면으로 이동
            </button>
          ) : (
            <p className="ml-auto text-[10px] text-amber-600">
              대국({remoteSubName}) 도면에서 연결해주세요
            </p>
          )
        )}

        {/* 완전 빈 포트 → 연결 */}
        {isEmpty && onConnect && (
          <button
            onClick={onConnect}
            className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            연결
          </button>
        )}
      </div>
    </div>
  );
}

