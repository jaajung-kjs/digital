import { useMemo } from 'react';
import { useEffectiveEquipment } from '../../workingCopy/hooks';
import { kindOf } from '../../workingCopy/placement';
import { useCableDrawing, useInteractionStore } from '../stores/interactionStore';
import { useEditorStore } from '../stores/editorStore';
import { RackModulePicker } from '../../connections/components/RackModulePicker';
import { SlotCorePicker } from '../../connections/components/SlotCorePicker';
import { CircuitPicker } from '../../connections/components/CircuitPicker';

/**
 * P9 host: opens the right endpoint picker (rack module / OFD port) based on
 * the cable drawing store's phase. Sits at the editor root so it can render
 * above the canvas regardless of which equipment was clicked.
 *
 * Source phase: pickingSourceModule  → picker over `sourceContainerAssetId`.
 * Target phase: pickingTargetModule  → picker over `targetContainerAssetId`.
 *
 * On select / cancel, the store transitions to drawingPath / selectingSpec
 * (or back to selectingSource for a cancel).
 */
interface CableEndpointPickerHostProps {
  /** SSOT-2d Task 3 — effective 설비(activeEquipment) 조회용. */
  floorId: string;
}

export function CableEndpointPickerHost({ floorId }: CableEndpointPickerHostProps) {
  const cable = useCableDrawing();
  const phase = cable?.phase ?? 'idle';
  const sourceContainerAssetId = cable?.sourceContainerAssetId ?? null;
  const sourcePosition = cable?.sourcePosition ?? null;
  const targetContainerAssetId = cable?.targetContainerAssetId ?? null;
  const targetPosition = cable?.targetPosition ?? null;

  // SSOT-2d Task 3 — 읽기를 통합 스토어 effective 로.
  const localEquipment = useEffectiveEquipment(floorId);

  const activeEquipmentId =
    phase === 'pickingSourceModule'
      ? sourceContainerAssetId
      : phase === 'pickingTargetModule'
        ? targetContainerAssetId
        : null;

  const activeEquipment = useMemo(
    () =>
      activeEquipmentId
        ? localEquipment.find((eq) => eq.id === activeEquipmentId) ?? null
        : null,
    [activeEquipmentId, localEquipment],
  );

  if (!activeEquipment) return null;
  if (phase !== 'pickingSourceModule' && phase !== 'pickingTargetModule') return null;

  const isSource = phase === 'pickingSourceModule';
  const center = isSource ? sourcePosition : targetPosition;
  if (!center) return null;

  const activeKind = kindOf(activeEquipment);

  const handleCancel = () => {
    // 전체 그리기 취소 — interaction idle + tool select 를 *함께* 되돌린다(단일 진입점).
    // (cancel 만 하면 tool='cable' 이 남아 캔버스가 먹통이 되던 버그.)
    useEditorStore.getState().cancelCableDrawing();
  };

  if (activeKind === 'RACK') {
    return (
      <RackModulePicker
        rackEquipmentId={activeEquipment.id}
        rackName={activeEquipment.name}
        onSelect={(moduleId) => {
          if (isSource) {
            useInteractionStore.getState().cableSetSource(activeEquipment.id, center, {
              innerAssetId: moduleId,
            });
          } else {
            useInteractionStore.getState().cableSetTarget(activeEquipment.id, center, {
              innerAssetId: moduleId,
            });
          }
        }}
        onCancel={handleCancel}
      />
    );
  }

  if (activeKind === 'DISTRIBUTION') {
    return (
      <CircuitPicker
        distributionEquipmentId={activeEquipment.id}
        distributionName={activeEquipment.name}
        onSelect={(feederId) => {
          // 케이블은 FEEDER(분전반의 전원 계통)로 직접 그려진다 — innerAssetId = 피더 asset id.
          // FEEDER 는 connectionKind='distributor' 라 이후 CableSpecModal 의 IN/OUT 선택이 적용된다.
          if (isSource) {
            useInteractionStore.getState().cableSetSource(activeEquipment.id, center, {
              innerAssetId: feederId,
            });
          } else {
            useInteractionStore.getState().cableSetTarget(activeEquipment.id, center, {
              innerAssetId: feederId,
            });
          }
        }}
        onCancel={handleCancel}
      />
    );
  }

  if (activeKind === 'OFD') {
    return (
      <SlotCorePicker
        ofdId={activeEquipment.id}
        onSelect={({ slotId, coreNumber }) => {
          // containerAssetId = OFD equipment id (highlight + self-loop guard 유지).
          // slotId 는 extras 채널로 흘러 CableSpecModal 이 sourceAssetId/targetAssetId = slotId 로 해소.
          // center = OFD 중심 (경로 기하) — floorAnchor 가 슬롯→OFD 렌더.
          if (isSource) {
            useInteractionStore.getState().cableSetSource(activeEquipment.id, center, {
              slotId,
              coreNumber,
            });
          } else {
            useInteractionStore.getState().cableSetTarget(activeEquipment.id, center, {
              slotId,
              coreNumber,
            });
          }
        }}
        onCancel={handleCancel}
      />
    );
  }

  return null;
}
