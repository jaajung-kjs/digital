import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dwgImportApi, type ImportOptions } from '../../../services/dwgImportApi';
import type { DwgImportResult } from '../../../types/floorPlan';

type Stage = 'upload' | 'preview' | 'committing' | 'done' | 'error';

interface Props {
  floorId: string;
  onClose: () => void;
  onImported: () => void;
}

export function DwgImportModal({ floorId, onClose, onImported }: Props) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(new Set());
  const [includeOutline, setIncludeOutline] = useState(true);
  const [includeLabels, setIncludeLabels] = useState(true);
  const [result, setResult] = useState<DwgImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback(async (f: File, mode: 'smart' | 'advanced', layers?: string[]) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const opts: ImportOptions = {
        mode,
        commit: false,
        ...(mode === 'advanced' ? { layers } : {}),
        ...(mode === 'smart' ? { includeOutline, includeLabels } : {}),
      };
      const r = await dwgImportApi.importToFloor(floorId, f, opts);
      setResult(r);
      setStage('preview');
      // Initialize advanced selection on first parse
      if (mode === 'smart' && selectedLayers.size === 0) {
        const initial = new Set([...r.smartChoice.outline, ...r.smartChoice.labels]);
        setSelectedLayers(initial);
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        ?? (e as { message?: string })?.message
        ?? '파일을 처리할 수 없습니다.';
      setErrorMessage(msg);
      setStage('error');
    } finally {
      setBusy(false);
    }
  }, [floorId, includeOutline, includeLabels, selectedLayers.size]);

  const handleFileSelected = useCallback((f: File) => {
    setFile(f);
    parseFile(f, 'smart');
  }, [parseFile]);

  const handleReparse = useCallback(async () => {
    if (!file) return;
    if (advanced) {
      await parseFile(file, 'advanced', [...selectedLayers]);
    } else {
      await parseFile(file, 'smart');
    }
  }, [file, advanced, selectedLayers, parseFile]);

  const handleCommit = useCallback(async () => {
    if (!file) return;
    setStage('committing');
    setBusy(true);
    try {
      const opts: ImportOptions = advanced
        ? { mode: 'advanced', commit: true, layers: [...selectedLayers] }
        : { mode: 'smart', commit: true, includeOutline, includeLabels };
      await dwgImportApi.importToFloor(floorId, file, opts);
      await queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
      setStage('done');
      onImported();
      setTimeout(onClose, 600);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        ?? '저장에 실패했습니다.';
      setErrorMessage(msg);
      setStage('error');
    } finally {
      setBusy(false);
    }
  }, [file, advanced, selectedLayers, includeOutline, includeLabels, floorId, queryClient, onClose, onImported]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelected(f);
  }, [handleFileSelected]);

  const toggleLayer = (name: string) => {
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-[640px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold">도면 가져오기 (DWG/DXF)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" disabled={busy}>×</button>
        </div>

        {/* Stage: upload */}
        {stage === 'upload' && (
          <div className="p-5 flex-1 flex flex-col gap-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            >
              <p className="text-sm text-gray-600 mb-2">DWG 또는 DXF 파일을 여기로 드래그</p>
              <p className="text-xs text-gray-400">또는 클릭해서 파일 선택 (최대 30MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".dwg,.dxf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                }}
              />
            </div>
            <p className="text-xs text-gray-500">
              자동으로 윤곽선과 라벨을 추출합니다. 필요시 [고급 모드]에서 레이어를 직접 선택할 수 있습니다.
            </p>
          </div>
        )}

        {/* Stage: preview */}
        {stage === 'preview' && result && (
          <div className="p-5 flex-1 overflow-auto">
            <div className="mb-3 text-sm">
              <span className="font-medium">{file?.name}</span>{' '}
              <span className="text-gray-500">({(file!.size / 1024 / 1024).toFixed(1)}MB)</span>
            </div>

            {/* Mode switch */}
            <div className="flex gap-2 mb-4">
              <button
                disabled={busy}
                onClick={() => { setAdvanced(false); parseFile(file!, 'smart'); }}
                className={`px-3 py-1.5 text-sm rounded ${!advanced ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                자동 (Smart)
              </button>
              <button
                disabled={busy}
                onClick={() => setAdvanced(true)}
                className={`px-3 py-1.5 text-sm rounded ${advanced ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                고급 (레이어 직접 선택)
              </button>
            </div>

            {/* Smart mode controls */}
            {!advanced && (
              <div className="bg-gray-50 rounded p-3 mb-4">
                <p className="text-xs text-gray-600 mb-2">자동 감지 결과:</p>
                <ul className="text-xs space-y-1">
                  <li>
                    <strong>윤곽 레이어:</strong> {result.smartChoice.outline.join(', ') || '(없음)'}
                  </li>
                  <li>
                    <strong>라벨 레이어:</strong> {result.smartChoice.labels.slice(0, 5).join(', ')}
                    {result.smartChoice.labels.length > 5 && ` 외 ${result.smartChoice.labels.length - 5}개`}
                  </li>
                </ul>
                <div className="mt-3 flex gap-3 text-xs">
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeOutline}
                      onChange={(e) => { setIncludeOutline(e.target.checked); }}
                    />
                    윤곽 포함
                  </label>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeLabels}
                      onChange={(e) => { setIncludeLabels(e.target.checked); }}
                    />
                    라벨 포함
                  </label>
                  <button onClick={handleReparse} disabled={busy} className="ml-auto text-blue-600 hover:underline">
                    다시 추출
                  </button>
                </div>
              </div>
            )}

            {/* Advanced mode: layer list */}
            {advanced && (
              <div className="bg-gray-50 rounded p-3 mb-4 max-h-72 overflow-auto">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-600">레이어 선택 ({selectedLayers.size}/{result.availableLayers.length})</p>
                  <button onClick={handleReparse} disabled={busy} className="text-xs text-blue-600 hover:underline">
                    선택 적용
                  </button>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 text-left">
                      <th className="w-6"></th>
                      <th>이름</th>
                      <th className="w-12 text-right">엔티티</th>
                      <th className="w-12 text-right">점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.availableLayers.map((layer) => (
                      <tr key={layer.name} className="border-t border-gray-200">
                        <td className="py-1">
                          <input
                            type="checkbox"
                            checked={selectedLayers.has(layer.name)}
                            onChange={() => toggleLayer(layer.name)}
                          />
                        </td>
                        <td className="py-1 font-mono">{layer.name}</td>
                        <td className="py-1 text-right text-gray-500">{layer.entityCount}</td>
                        <td className="py-1 text-right text-gray-500">{layer.outlineScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Result preview */}
            <PreviewCanvas result={result} />

            <div className="text-xs text-gray-500 mt-3">
              윤곽 폴리라인 <strong>{result.backgroundDrawing.outline?.polylines.length ?? 0}</strong>개 ·{' '}
              라벨 <strong>{result.backgroundDrawing.labels.length}</strong>개
            </div>
          </div>
        )}

        {stage === 'committing' && (
          <div className="flex-1 flex items-center justify-center text-gray-600">저장 중...</div>
        )}

        {stage === 'done' && (
          <div className="flex-1 flex items-center justify-center text-green-600">완료!</div>
        )}

        {stage === 'error' && (
          <div className="p-5">
            <p className="text-red-600 text-sm">{errorMessage}</p>
            <button
              onClick={() => { setStage('upload'); setErrorMessage(null); }}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* Footer */}
        {stage === 'preview' && (
          <div className="border-t px-5 py-3 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-50"
              disabled={busy}
            >
              취소
            </button>
            <button
              onClick={handleCommit}
              disabled={busy}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              저장
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Lightweight SVG preview of the parsed result */
function PreviewCanvas({ result }: { result: DwgImportResult }) {
  const { backgroundDrawing: bg } = result;
  const w = 580;
  const h = 280;
  const { minX, minY, maxX, maxY } = bg.bounds;
  const pad = 10;
  const srcW = Math.max(1, maxX - minX);
  const srcH = Math.max(1, maxY - minY);
  const scale = Math.min((w - pad * 2) / srcW, (h - pad * 2) / srcH);
  const tx = pad - minX * scale + (w - srcW * scale) / 2 - pad;
  const ty = pad - minY * scale + (h - srcH * scale) / 2 - pad;

  return (
    <div className="border rounded bg-white">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {bg.outline?.polylines.map((flat, i) => {
          if (flat.length < 4) return null;
          const pts: string[] = [];
          for (let j = 0; j < flat.length; j += 2) {
            pts.push(`${flat[j] * scale + tx},${flat[j + 1] * scale + ty}`);
          }
          return (
            <polyline
              key={i}
              points={pts.join(' ')}
              fill="none"
              stroke="#666"
              strokeWidth="0.8"
            />
          );
        })}
        {bg.labels.map((l, i) => (
          <text
            key={i}
            x={l.x * scale + tx}
            y={l.y * scale + ty}
            fontSize={Math.max(6, Math.min(12, l.size * scale))}
            fill="#444"
          >
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
