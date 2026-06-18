import { useState, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { dwgImportApi, type ImportOptions } from '../../../services/dwgImportApi';
import { Button, IconButton } from '../../../components/ui';
import { useEditorStore } from '../stores/editorStore';
import type { DwgImportResult, BgLayer } from '../../../types/floorPlan';

type Stage = 'upload' | 'preview' | 'done' | 'error';

interface Props {
  floorId: string;
  onClose: () => void;
  onImported: () => void;
}

export function DwgImportModal({ floorId, onClose, onImported }: Props) {
  const stageBackgroundDrawing = useEditorStore((s) => s.stageBackgroundDrawing);
  const [stage, setStage] = useState<Stage>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<DwgImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback(
    async (f: File) => {
      setBusy(true);
      setErrorMessage(null);
      try {
        const opts: ImportOptions = { mode: 'smart' };
        const r = await dwgImportApi.importToFloor(floorId, f, opts);
        setResult(r);
        setStage('preview');
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
    [floorId],
  );

  const handleFileSelected = useCallback(
    (f: File) => {
      setFile(f);
      parseFile(f);
    },
    [parseFile],
  );

  // Stage the parsed DWG into the editor store. The viewport-init effect in
  // useFloorPlanData notices the new `source.importedAt` and re-fits.
  // Actual DB write happens on the next 저장 click via PUT /floors/:id/plan.
  const handleCommit = useCallback(() => {
    if (!result) return;
    stageBackgroundDrawing(result.backgroundDrawing);
    setStage('done');
    onImported();
    setTimeout(onClose, 400);
  }, [result, stageBackgroundDrawing, onClose, onImported]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) handleFileSelected(f);
    },
    [handleFileSelected],
  );

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--overlay)]" onClick={onClose}>
      <div
        className="bg-surface rounded shadow-xl border border-line w-[640px] max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold text-content">도면 가져오기 (DWG/DXF)</h2>
          <IconButton aria-label="닫기" onClick={onClose} disabled={busy}>
            <X size={16} />
          </IconButton>
        </div>

        {/* Stage: upload */}
        {stage === 'upload' && (
          <div className="p-5 flex-1 flex flex-col gap-4">
            <div className="rounded border border-warning bg-warning-bg px-4 py-3">
              <p className="text-sm font-semibold text-warning">
                DRM(문서보안)이 걸린 파일은 가져올 수 없습니다
              </p>
              <p className="mt-1 text-xs text-warning leading-relaxed">
                사내 보안솔루션으로 암호화된 도면은 CAD에서는 열려도 업로드 시
                암호화된 상태로 전송되어 깨진 파일로 인식됩니다. 업로드 전
                반드시 <strong>DRM 해제(반출)</strong> 후 가져오세요.
              </p>
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-line rounded p-12 text-center cursor-pointer hover:border-primary hover:bg-info-bg/30 transition-colors"
            >
              <p className="text-sm text-content-muted mb-2">DWG 또는 DXF 파일을 여기로 드래그</p>
              <p className="text-xs text-content-faint">또는 클릭해서 파일 선택 (최대 30MB)</p>
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
            <p className="text-xs text-content-muted">
              모든 레이어가 불러와지며, 각 entity 의 색상 · 선 굵기 · 선 종류가 함께 보존됩니다.
              불러온 후 우측 [레이어] 패널에서 layer 별 가시성을 조절할 수 있습니다.
            </p>
          </div>
        )}

        {/* Stage: preview */}
        {stage === 'preview' && result && (
          <div className="p-5 flex-1 overflow-auto">
            <div className="mb-3 text-sm text-content">
              <span className="font-medium">{file?.name}</span>{' '}
              <span className="text-content-muted">({(file!.size / 1024 / 1024).toFixed(1)}MB)</span>
            </div>

            <PreviewCanvas result={result} />

            <div className="text-xs text-content-muted mt-3">
              레이어 <strong>{result.backgroundDrawing.layers.length}</strong>개 ·{' '}
              폴리라인 <strong>{result.backgroundDrawing.paths.length}</strong>개 ·{' '}
              텍스트 <strong>{result.backgroundDrawing.texts.length}</strong>개 ·{' '}
              채움 <strong>{result.backgroundDrawing.filled.length}</strong>개
            </div>
          </div>
        )}

        {stage === 'done' && (
          <div className="flex-1 flex items-center justify-center text-success">
            가져왔습니다 — 저장 버튼을 눌러야 영구 적용됩니다.
          </div>
        )}

        {stage === 'error' && (
          <div className="p-5">
            <p className="text-danger text-sm">{errorMessage}</p>
            <p className="mt-2 text-xs text-warning">
              파일이 정상 DWG인데도 실패한다면 <strong>DRM(문서보안)</strong>이
              걸려 있을 수 있습니다. DRM 해제(반출) 후 다시 시도하세요.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 px-0 text-primary hover:bg-transparent hover:underline"
              onClick={() => {
                setStage('upload');
                setErrorMessage(null);
              }}
            >
              다시 시도
            </Button>
          </div>
        )}

        {/* Footer */}
        {stage === 'preview' && (
          <div className="border-t border-line px-5 py-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
            <Button onClick={handleCommit} disabled={busy}>가져오기</Button>
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
    <div className="border border-line rounded bg-surface">
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
              strokeDasharray={dash?.map((d: number) => d * scale).join(' ')}
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
