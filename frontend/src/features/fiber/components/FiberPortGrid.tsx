import { useState } from 'react';
import type { FiberPathDetail, FiberPortStatus, FiberPortUsage } from '../types';
import { useFiberPaths } from '../hooks/useFiberPaths';
import { useOfdConnectionFlowStore } from '../stores/ofdConnectionFlowStore';

interface FiberPortGridProps {
  fiberPath: FiberPathDetail;
  localOfdId: string;
  /** Called when user wants to connect an empty port (or add to a partial port) */
  onPortConnect?: (portNumber: number, fiberPathId: string) => void;
  /** Called when user wants to delete a cable from a port */
  onPortDelete?: (cableId: string) => void;
  /** Called when user wants to switch a cable to a different fiber path/port (절체) */
  onPortSwitch?: (cableId: string, connectedEquipmentId: string, newFiberPathId: string, newPortNumber: number) => void;
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

export function FiberPortGrid({ fiberPath, localOfdId, onPortConnect, onPortDelete, onPortSwitch, onNavigateRemote }: FiberPortGridProps) {
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const ofdFlowPhase = useOfdConnectionFlowStore((s) => s.phase);
  const isPortSelecting = ofdFlowPhase === 'selectingPort';

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

          const isConnectable = isPortSelecting && !localSide;

          return (
            <div
              key={port.portNumber}
              className={`rounded border p-1.5 text-center cursor-pointer transition-all ${color} ${
                isConnectable
                  ? 'hover:border-blue-500 hover:bg-blue-100 hover:ring-2 hover:ring-blue-300 hover:shadow-md'
                  : 'hover:opacity-80'
              }`}
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
          localOfdId={localOfdId}
          onConnect={onPortConnect ? () => {
            onPortConnect(selectedPortData.portNumber, fiberPath.id);
            setSelectedPort(null);
          } : undefined}
          onDelete={onPortDelete}
          onSwitch={onPortSwitch}
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
  localOfdId: string;
  onConnect?: () => void;
  onDelete?: (cableId: string) => void;
  onSwitch?: (cableId: string, connectedEquipmentId: string, newFiberPathId: string, newPortNumber: number) => void;
  onNavigateRemote?: () => void;
  onClose: () => void;
}

function SideRow({
  label,
  subName,
  side,
  onDelete,
  onSwitch,
  localOfdId,
  currentFiberPathId,
}: {
  label: string;
  subName: string;
  side: FiberPortUsage | null;
  onDelete?: (cableId: string) => void;
  onSwitch?: (cableId: string, connectedEquipmentId: string, newFiberPathId: string, newPortNumber: number) => void;
  localOfdId: string;
  currentFiberPathId: string;
}) {
  const [switching, setSwitching] = useState(false);
  const [targetPathId, setTargetPathId] = useState('');
  const [targetPort, setTargetPort] = useState<number | undefined>();
  const { data: allPaths } = useFiberPaths(localOfdId, switching);

  const otherPaths = allPaths?.filter((p) => p.id !== currentFiberPathId) ?? [];
  const selectedPath = allPaths?.find((p) => p.id === targetPathId);
  const isLocalA = selectedPath ? selectedPath.ofdA.id === localOfdId : false;
  const availablePorts = selectedPath?.ports.filter((p) => {
    const localSide = isLocalA ? p.sideA : p.sideB;
    return !localSide; // only empty ports
  }) ?? [];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs">
        <span className="shrink-0 w-14 text-gray-400">{label}</span>
        <span className="shrink-0 text-gray-400">({subName})</span>
        {side ? (
          <span className="font-medium text-gray-700 truncate flex-1">{side.equipmentName}</span>
        ) : (
          <span className="text-gray-300 flex-1">미연결</span>
        )}
        {side && onDelete && (
          <button
            onClick={() => {
              if (confirm(`${side.equipmentName} 연결을 삭제하시겠습니까?`)) {
                onDelete(side.cableId);
              }
            }}
            className="shrink-0 text-[10px] text-red-500 hover:text-red-700"
          >
            삭제
          </button>
        )}
        {side && onSwitch && (
          <button
            onClick={() => setSwitching(!switching)}
            className="shrink-0 text-[10px] text-blue-500 hover:text-blue-700"
          >
            {switching ? '취소' : '절체'}
          </button>
        )}
      </div>

      {/* 절체 UI */}
      {switching && side && onSwitch && (
        <div className="ml-16 rounded border border-blue-200 bg-blue-50 p-2 space-y-1.5">
          <select
            value={targetPathId}
            onChange={(e) => { setTargetPathId(e.target.value); setTargetPort(undefined); }}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
          >
            <option value="">광경로 선택</option>
            {otherPaths.map((fp) => {
              const remote = fp.ofdA.id === localOfdId ? fp.ofdB : fp.ofdA;
              const local = fp.ofdA.id === localOfdId ? fp.ofdA : fp.ofdB;
              return (
                <option key={fp.id} value={fp.id}>
                  {local.substationName}-{remote.substationName} ({fp.portCount}코어)
                </option>
              );
            })}
          </select>
          {targetPathId && availablePorts.length > 0 && (
            <select
              value={targetPort ?? ''}
              onChange={(e) => setTargetPort(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
            >
              <option value="">포트 선택</option>
              {availablePorts.map((p) => (
                <option key={p.portNumber} value={p.portNumber}>#{p.portNumber}</option>
              ))}
            </select>
          )}
          {targetPathId && availablePorts.length === 0 && (
            <p className="text-[10px] text-amber-600">빈 포트가 없습니다</p>
          )}
          <button
            disabled={!targetPathId || !targetPort}
            onClick={() => {
              if (targetPathId && targetPort) {
                onSwitch(side.cableId, side.equipmentId, targetPathId, targetPort);
                setSwitching(false);
              }
            }}
            className="w-full rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            절체 실행
          </button>
        </div>
      )}
    </div>
  );
}

function PortDetail({
  port,
  localSide,
  remoteSide,
  localSubName,
  remoteSubName,
  fiberPathId,
  localOfdId,
  onConnect,
  onDelete,
  onSwitch,
  onNavigateRemote,
  onClose,
}: PortDetailProps) {
  const hasLocal = !!localSide;
  const hasRemote = !!remoteSide;
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

      {/* Connection info — both sides editable */}
      <div className="space-y-1.5">
        <SideRow
          label="자국"
          subName={localSubName}
          side={localSide}
          onDelete={onDelete}
          onSwitch={onSwitch}
          localOfdId={localOfdId}
          currentFiberPathId={fiberPathId}
        />
        <SideRow
          label="대국"
          subName={remoteSubName}
          side={remoteSide}
          onDelete={onDelete}
          onSwitch={onSwitch}
          localOfdId={localOfdId}
          currentFiberPathId={fiberPathId}
        />
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
        {!hasLocal && hasRemote && onConnect && (
          <button
            onClick={onConnect}
            className="flex-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            자국 연결 추가
          </button>
        )}
        {hasLocal && !hasRemote && (
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
      </div>
    </div>
  );
}
