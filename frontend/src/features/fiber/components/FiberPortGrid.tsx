import { useState } from 'react';
import type { FiberPathDetail, FiberPortStatus, FiberPortUsage } from '../types';

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

  const isLocalA = fiberPath.ofdA.id === localOfdId;
  const localSub = isLocalA ? fiberPath.ofdA.substationName : fiberPath.ofdB.substationName;
  const remoteSub = isLocalA ? fiberPath.ofdB.substationName : fiberPath.ofdA.substationName;
  const remoteRoomId = isLocalA ? fiberPath.ofdB.roomId : fiberPath.ofdA.roomId;

  const getLocalSide = (port: FiberPortStatus): FiberPortUsage | null =>
    isLocalA ? port.sideA : port.sideB;
  const getRemoteSide = (port: FiberPortStatus): FiberPortUsage | null =>
    isLocalA ? port.sideB : port.sideA;

  const selectedPortData = fiberPath.ports.find((p) => p.portNumber === selectedPort);

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

          return (
            <div
              key={port.portNumber}
              className={`rounded border p-1.5 text-center cursor-pointer transition-all ${color} hover:opacity-80`}
              onClick={() => setSelectedPort(isSelected ? null : port.portNumber)}
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
          fiberPathId={fiberPath.id}
          onConnect={onPortConnect ? () => {
            onPortConnect(selectedPortData.portNumber, fiberPath.id);
            setSelectedPort(null);
          } : undefined}
          onDelete={onPortDelete}
          onNavigateRemote={remoteRoomId && onNavigateRemote ? () => {
            onNavigateRemote(remoteRoomId);
          } : undefined}
          onClose={() => setSelectedPort(null)}
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
  fiberPathId: string;
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
  const isBothConnected = hasLocal && hasRemote;
  const isPartial = (hasLocal || hasRemote) && !isBothConnected;
  const isEmpty = !hasLocal && !hasRemote;

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

      {/* Connection info */}
      <div className="space-y-1.5">
        {/* Local (자국) side */}
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 w-14 text-gray-400">자국</span>
          <span className="shrink-0 text-gray-400">({localSubName})</span>
          {hasLocal ? (
            <span className="font-medium text-gray-700 truncate">{localSide.equipmentName}</span>
          ) : (
            <span className="text-gray-300">미연결</span>
          )}
        </div>

        {/* Remote (대국) side */}
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 w-14 text-gray-400">대국</span>
          <span className="shrink-0 text-gray-400">({remoteSubName})</span>
          {hasRemote ? (
            <span className="font-medium text-gray-700 truncate">{remoteSide.equipmentName}</span>
          ) : (
            <span className="text-gray-300">미연결</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
        {/* Empty port → connect */}
        {isEmpty && onConnect && (
          <button
            onClick={onConnect}
            className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            연결
          </button>
        )}

        {/* Partial → add connection for missing side */}
        {isPartial && !hasLocal && onConnect && (
          <button
            onClick={onConnect}
            className="flex-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            자국 연결 추가
          </button>
        )}
        {isPartial && hasLocal && !hasRemote && (
          onNavigateRemote ? (
            <button
              onClick={onNavigateRemote}
              className="flex-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
            >
              대국({remoteSubName}) 도면으로 이동
            </button>
          ) : (
            <p className="text-[10px] text-amber-600">
              대국({remoteSubName}) 도면에서 연결해주세요
            </p>
          )
        )}

        {/* Both connected → can delete local cable */}
        {isBothConnected && onDelete && localSide && (
          <button
            onClick={() => {
              if (confirm(`${localSide.equipmentName} 연결을 삭제하시겠습니까?`)) {
                onDelete(localSide.cableId);
              }
            }}
            className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            자국 연결 삭제
          </button>
        )}

        {/* Both connected → can delete remote cable */}
        {isBothConnected && onDelete && remoteSide && (
          <button
            onClick={() => {
              if (confirm(`${remoteSide.equipmentName} 연결을 삭제하시겠습니까?`)) {
                onDelete(remoteSide.cableId);
              }
            }}
            className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            대국 연결 삭제
          </button>
        )}
      </div>
    </div>
  );
}
