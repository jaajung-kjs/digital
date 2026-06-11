import { Ruler, Boxes, Cable } from 'lucide-react';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';
import { useEffectiveEquipment, useEffectiveFloorCables } from '../../workingCopy/hooks';

interface EmptyStateGuideProps {
  floorPlan: FloorPlanDetail | undefined;
  floorId: string | undefined;
  onImportClick?: () => void;
}

/**
 * 3-step onboarding card shown when the floor is completely empty:
 * no equipment, no cables, no background drawing.
 *
 * Step 1 has a direct [DWG 임포트] button so the user does not have to
 * dig through the settings panel for the first import.
 */
export function EmptyStateGuide({ floorPlan, floorId, onImportClick }: EmptyStateGuideProps) {
  // SSOT-2d Task 3 — 읽기를 통합 스토어 effective 로(empty 체크용).
  const localEquipment = useEffectiveEquipment(floorId ?? '');
  const localCables = useEffectiveFloorCables(floorId ?? '');
  const stagedBackgroundDrawing = useEditorStore((s) => s.stagedBackgroundDrawing);

  if (!floorPlan) return null;

  const hasEquipment = localEquipment.length > 0 || floorPlan.equipment.length > 0;
  const hasCables = localCables.length > 0 || floorPlan.cables.length > 0;
  // Background can be staged client-side before save — fall through to the
  // server value only when nothing is staged.
  const effectiveBackground =
    stagedBackgroundDrawing !== undefined ? stagedBackgroundDrawing : floorPlan.backgroundDrawing;
  const hasBackground = effectiveBackground != null;

  if (hasEquipment || hasCables || hasBackground) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 12 }}
    >
      <div className="bg-surface/95 backdrop-blur border border-line rounded-2xl shadow-lg px-8 py-6 max-w-md pointer-events-auto">
        <h3 className="text-base font-semibold text-content mb-1">
          평면도 시작하기
        </h3>
        <p className="text-xs text-content-muted mb-4">
          아래 순서로 도면을 구성해 보세요.
        </p>
        <ol className="space-y-3">
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-info-bg text-primary text-xs font-semibold flex items-center justify-center">
              1
            </span>
            <div className="text-sm text-content flex-1">
              <Ruler size={14} className="inline-block mr-1 -mt-0.5 text-content-muted" />
              <span className="font-medium">도면 가져오기</span>
              {onImportClick ? (
                <button
                  onClick={onImportClick}
                  className="block mt-1 px-3 py-1.5 text-xs bg-primary text-white rounded-md hover:bg-primary-hover transition-colors"
                >
                  DWG/DXF 파일 선택
                </button>
              ) : (
                <span className="block text-xs text-content-muted mt-0.5">
                  DWG/DXF 임포트 — 우상단 ⚙️ 버튼
                </span>
              )}
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-info-bg text-primary text-xs font-semibold flex items-center justify-center">
              2
            </span>
            <div className="text-sm text-content">
              <Boxes size={14} className="inline-block mr-1 -mt-0.5 text-content-muted" />
              <span className="font-medium">설비 배치</span>
              <span className="block text-xs text-content-muted mt-0.5">
                왼쪽 [설비]에서 종류 선택 후 캔버스에 드래그 — [랙 프리셋]은 클릭 한 번으로 배치
              </span>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-info-bg text-primary text-xs font-semibold flex items-center justify-center">
              3
            </span>
            <div className="text-sm text-content">
              <Cable size={14} className="inline-block mr-1 -mt-0.5 text-content-muted" />
              <span className="font-medium">케이블 연결</span>
              <span className="block text-xs text-content-muted mt-0.5">
                왼쪽 [케이블]에서 그룹 선택 후 두 객체를 클릭 — 랙/OFD는 모듈/포트 선택 모달이 열립니다
              </span>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}
