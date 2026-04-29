import type { FloorPlanDetail } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';

interface EmptyStateGuideProps {
  floorPlan: FloorPlanDetail | undefined;
}

/**
 * 3-step onboarding card shown when the floor is completely empty:
 * no equipment, no cables, no background drawing.
 *
 * The wrapper is `pointer-events-none` so the guide never blocks canvas
 * interactions; the inner card is purely informational text.
 */
export function EmptyStateGuide({ floorPlan }: EmptyStateGuideProps) {
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const localCables = useEditorStore((s) => s.localCables);

  if (!floorPlan) return null;

  const hasEquipment = localEquipment.length > 0 || floorPlan.equipment.length > 0;
  const hasCables = localCables.length > 0 || floorPlan.cables.length > 0;
  const hasBackground = floorPlan.backgroundDrawing != null;

  if (hasEquipment || hasCables || hasBackground) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 12 }}
    >
      <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-2xl shadow-lg px-8 py-6 max-w-md">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          평면도 시작하기
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          아래 순서로 도면을 구성해 보세요.
        </p>
        <ol className="space-y-3">
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold flex items-center justify-center">
              1
            </span>
            <div className="text-sm text-gray-700">
              <span className="mr-1">📐</span>
              <span className="font-medium">도면 가져오기</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                DWG/DXF 임포트 — 우상단 ⚙️ 버튼
              </span>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold flex items-center justify-center">
              2
            </span>
            <div className="text-sm text-gray-700">
              <span className="mr-1">🏗️</span>
              <span className="font-medium">설비 배치</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                왼쪽 [설비] 메뉴에서 카테고리 선택 후 캔버스에 배치
              </span>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold flex items-center justify-center">
              3
            </span>
            <div className="text-sm text-gray-700">
              <span className="mr-1">🔌</span>
              <span className="font-medium">케이블 연결</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                왼쪽 [케이블] 메뉴에서 종류 선택 후 설비 두 개 연결
              </span>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}
