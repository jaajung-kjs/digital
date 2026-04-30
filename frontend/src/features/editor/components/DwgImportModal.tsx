import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dwgImportApi, type ImportOptions } from '../../../services/dwgImportApi';
import type { DwgImportResult, BgLayer } from '../../../types/floorPlan';

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
  /** advanced 모드에서 사용자가 import 하길 원하는 layer 이름 화이트리스트. */
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<DwgImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback(
    async (f: File, mode: 'smart' | 'advanced', layers?: string[]) => {
      setBusy(true);
      setErrorMessage(null);
      try {
        const opts: ImportOptions = {
          mode,
          commit: false,
          ...(mode === 'advanced' ? { layers } : {}),
        };
        const r = await dwgImportApi.importToFloor(floorId, f, opts);
        setResult(r);
        setStage('preview');
        // smart 결과로 처음 들어왔을 때 — 모든 visible layer 를 기본 선택해 두기.
        if (mode === 'smart' && selectedLayers.size === 0) {
          const initial = new Set(
            r.backgroundDrawing.layers.filter((l) => l.isVisible).map((l) => l.name),
          );
          setSelectedLayers(initial);
        }
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
          ?? (e as { message?: string })?.message
          ?? '파일을 처리할 수 없습니다.';
        setErrorMessage(msg);
        setStage('error');
      } finally {
        setBusy(false);
      }
    },
    [floorId, selectedLayers.size],
  );

  const handleFileSelected = useCallback(
    (f: File) => {
      setFile(f);
      parseFile(f, 'smart');
    },
    [parseFile],
  );

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
        : { mode: 'smart', commit: true };
      await dwgImportApi.importToFloor(floorId, file, opts);
      await queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
      setStage('done');
      onImported();
      setTimeout(onClose, 600);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        ?? '저장에 실패했습니다.';
      setErrorMessage(msg);
      setStage('error');
    } finally {
      setBusy(false);
    }
  }, [file, advanced, selectedLayers, floorId, queryClient, onClose, onImported]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) handleFileSelected(f);
    },
    [handleFileSelected],
  );

  const toggleLayer = (name: string) => {
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-[640px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold">도면 가져오기 (DWG/DXF)</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            disabled={busy}
          >
            ×
          </button>
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
              모든 레이어가 불러와지며, 각 entity 의 색상 · 선 굵기 · 선 종류가 함께 보존됩니다.
              불러온 후 [레이어] 패널에서 가시성을 조절할 수 있습니다. 특정 레이어만 import 하려면
              [고급 모드]를 사용하세요.
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
                onClick={() => {
                  setAdvanced(false);
                  parseFile(file!, 'smart');
                }}
                className={`px-3 py-1.5 text-sm rounded ${
                  !advanced ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                자동 (모든 레이어)
              </button>
              <button
                disabled={busy}
                onClick={() => setAdvanced(true)}
                className={`px-3 py-1.5 text-sm rounded ${
                  advanced ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                고급 (레이어 직접 선택)
              </button>
            </div>

            {/* Advanced mode: layer list */}
            {advanced && (
              <div className="bg-gray-50 rounded p-3 mb-4 max-h-72 overflow-auto">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-600">
                    레이어 선택 ({selectedLayers.size}/{result.backgroundDrawing.layers.length})
                  </p>
                  <button
                    onClick={handleReparse}
                    disabled={busy}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    선택 적용
                  </button>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 text-left">
                      <th className="w-6"></th>
                      <th className="w-6"></th>
                      <th>이름</th>
                      <th className="w-12 text-right">선굵기</th>
                      <th className="w-16 text-right">선종류</th>
                      <th className="w-12 text-center">보임</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.backgroundDrawing.layers.map((layer) => (
                      <tr key={layer.name} className="border-t border-gray-200">
                        <td className="py-1">
                          <input
                            type="checkbox"
                            checked={selectedLayers.has(layer.name)}
                            onChange={() => toggleLayer(layer.name)}
                          />
                        </td>
                        <td className="py-1">
                          <span
                            className="inline-block w-3 h-3 rounded-sm border border-gray-300"
                            style={{ backgroundColor: layer.color }}
                          />
                        </td>
                        <td className="py-1 font-mono">{layer.name}</td>
                        <td className="py-1 text-right text-gray-500">
                          {layer.lineweight.toFixed(2)}
                        </td>
                        <td className="py-1 text-right text-gray-500">{layer.linetype}</td>
                        <td className="py-1 text-center text-gray-500">
                          {layer.isVisible ? '✓' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Result preview */}
            <PreviewCanvas result={result} />

            <div className="text-xs text-gray-500 mt-3">
              레이어 <strong>{result.backgroundDrawing.layers.length}</strong>개 ·{' '}
              폴리라인 <strong>{result.backgroundDrawing.paths.length}</strong>개 ·{' '}
              텍스트 <strong>{result.backgroundDrawing.texts.length}</strong>개 ·{' '}
              채움 <strong>{result.backgroundDrawing.filled.length}</strong>개
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
              onClick={() => {
                setStage('upload');
                setErrorMessage(null);
              }}
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

/**
 * Lightweight SVG preview of the parsed result. Honours per-entity BYLAYER
 * styling and skips entities on hidden layers (mirrors canvas renderer).
 */
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

  const layerMap = new Map<string, BgLayer>(bg.layers.map((l) => [l.name, l]));
  const isHidden = (name: string): boolean => {
    const l = layerMap.get(name);
    if (!l) return true;
    return l.isVisible === false;
  };

  return (
    <div className="border rounded bg-white">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {/* filled — draw first (under strokes) */}
        {bg.filled.flatMap((f, i) => {
          if (isHidden(f.layer)) return [];
          const layer = layerMap.get(f.layer);
          const fill = f.color ?? layer?.color ?? '#aaaaaa';
          return f.loops.map((loop, li) => {
            if (loop.length < 4) return null;
            const pts: string[] = [];
            for (let j = 0; j < loop.length; j += 2) {
              pts.push(`${loop[j] * scale + tx},${loop[j + 1] * scale + ty}`);
            }
            return (
              <polygon
                key={`f${i}-${li}`}
                points={pts.join(' ')}
                fill={fill}
                fillOpacity={0.3}
                stroke="none"
              />
            );
          });
        })}
        {/* paths */}
        {bg.paths.map((p, i) => {
          if (isHidden(p.layer)) return null;
          if (p.points.length < 4) return null;
          const layer = layerMap.get(p.layer);
          const stroke = p.color ?? layer?.color ?? '#666666';
          const lw = p.lineweight ?? layer?.lineweight ?? 1;
          const dash = p.dashArray ?? layer?.dashArray;
          const pts: string[] = [];
          for (let j = 0; j < p.points.length; j += 2) {
            pts.push(`${p.points[j] * scale + tx},${p.points[j + 1] * scale + ty}`);
          }
          return (
            <polyline
              key={`p${i}`}
              points={pts.join(' ')}
              fill="none"
              stroke={stroke}
              strokeWidth={Math.max(0.4, lw * 0.5)}
              strokeDasharray={dash?.map((d) => d * scale).join(' ')}
            />
          );
        })}
        {/* texts — drop rotation in the SVG preview to keep it cheap */}
        {bg.texts.map((t, i) => {
          if (isHidden(t.layer)) return null;
          const layer = layerMap.get(t.layer);
          const fill = t.color ?? layer?.color ?? '#444444';
          return (
            <text
              key={`t${i}`}
              x={t.x * scale + tx}
              y={t.y * scale + ty}
              fontSize={Math.max(6, Math.min(12, t.size * scale))}
              fill={fill}
            >
              {t.text}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
