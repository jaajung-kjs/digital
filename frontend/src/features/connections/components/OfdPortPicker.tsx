import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { usePortStatus } from '../../fiber/hooks/usePortStatus';

interface OfdPortPickerProps {
  ofdEquipmentId: string;
  ofdName?: string;
  /**
   * Fired when the user picks an OFD endpoint.
   *
   * - `fiberPathId` + `portNumber` are set when a specific port is chosen.
   * - When the user opts to use the OFD itself as the endpoint (no specific
   *   port), both are null. The cable will still reference the OFD via
   *   `*EquipmentId`.
   */
  onSelect: (selection: { fiberPathId: string | null; portNumber: number | null }) => void;
  onCancel: () => void;
}

/**
 * P9: OFD port selector shown during cable drawing when source/target is an
 * OFD. Mirrors the rack module picker — it lists fiber paths for the OFD,
 * each with a port grid; clicking an empty port commits the endpoint with
 * `fiberPathId / fiberPortNumber` populated.
 *
 * Symmetric to `RackModulePicker` (used for RACK endpoints).
 */
export function OfdPortPicker({
  ofdEquipmentId,
  ofdName,
  onSelect,
  onCancel,
}: OfdPortPickerProps) {
  const { mergedPaths, isLoading } = usePortStatus(ofdEquipmentId);
  const [activePathId, setActivePathId] = useState<string | null>(null);

  // Default-expand the first path with empty ports so users see something useful.
  useEffect(() => {
    if (activePathId || mergedPaths.length === 0) return;
    setActivePathId(mergedPaths[0].id);
  }, [activePathId, mergedPaths]);

  // ESC closes.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const activePath = mergedPaths.find((p) => p.id === activePathId);
  const isLocalA = activePath ? activePath.ofdA.id === ofdEquipmentId : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]">
      <div className="bg-surface rounded-lg shadow-xl w-[520px] max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-content">OFD 포트 선택</h3>
            <p className="text-xs text-content-muted mt-0.5">
              {ofdName ? `${ofdName} — ` : ''}연결할 포트를 클릭하세요
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-surface-2 text-content-muted transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title="닫기 (ESC)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <button
            onClick={() => onSelect({ fiberPathId: null, portNumber: null })}
            className="w-full text-left px-3 py-2 mb-3 rounded border border-line text-sm text-content-muted hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title="포트를 지정하지 않고 OFD 본체를 끝점으로 사용합니다."
          >
            <span className="font-medium">OFD 본체에 연결</span>
            <span className="ml-2 text-xs text-content-faint">(포트 미지정)</span>
          </button>

          {isLoading ? (
            <div className="py-8 text-center text-xs text-content-faint">불러오는 중...</div>
          ) : mergedPaths.length === 0 ? (
            <p className="text-xs text-content-faint text-center py-6">
              이 OFD에는 경로가 없습니다 — OFD 본체에 연결하세요.
            </p>
          ) : (
            <>
              <div className="text-[11px] text-content-faint mb-1">경로</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {mergedPaths.map((p) => {
                  const remote =
                    p.ofdA.id === ofdEquipmentId ? p.ofdB : p.ofdA;
                  const active = activePathId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePathId(p.id)}
                      className={`text-xs px-2 py-1 rounded border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                        active
                          ? 'border-primary bg-info-bg text-primary'
                          : 'border-line text-content-muted hover:bg-surface-2'
                      }`}
                    >
                      → {remote.substationName ?? remote.name ?? '대국'} ({p.portCount}코어)
                    </button>
                  );
                })}
              </div>

              {activePath && (
                <div className="grid grid-cols-8 gap-1">
                  {activePath.ports.map((port) => {
                    const localSide = isLocalA ? port.sideA : port.sideB;
                    const used = !!localSide;
                    return (
                      <button
                        key={port.portNumber}
                        type="button"
                        disabled={used}
                        onClick={() =>
                          onSelect({
                            fiberPathId: activePath.id,
                            portNumber: port.portNumber,
                          })
                        }
                        title={used ? `사용 중: ${localSide?.assetName ?? ''}` : `포트 ${port.portNumber}`}
                        className={`h-7 rounded text-[10px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                          used
                            ? 'bg-surface-2 text-content-faint cursor-not-allowed opacity-40'
                            : 'bg-surface border border-line text-content-muted hover:bg-info-bg hover:border-primary'
                        }`}
                      >
                        {port.portNumber}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-line shrink-0 flex justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-content-muted hover:bg-surface-2 rounded transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
