import { useMemo } from 'react';
import { useEffectiveEquipment } from '../../workingCopy/hooks';
import { kindOf } from '../../workingCopy/placement';
import { useCableDrawing, useInteractionStore } from '../stores/interactionStore';
import { useEditorStore } from '../stores/editorStore';
import { getEquipmentCenter } from '../../../utils/floorplan/elementSystem';
import { commitCable } from '../cableConnection';
import { RackModulePicker } from '../../connections/components/RackModulePicker';
import { SlotCorePicker } from '../../connections/components/SlotCorePicker';
import { CircuitPicker } from '../../connections/components/CircuitPicker';

/**
 * 출발/도착 endpoint 의 모듈/회로/슬롯 picker 를 phase 에 따라 연다. 에디터
 * 루트에 위치해 어느 설비를 클릭하든 캔버스 위에 렌더된다.
 *
 * Source phase: pickingSourceEndpoint  → picker over pendingContainerId.
 * Target phase: pickingTargetEndpoint  → picker over pendingContainerId.
 *
 * 선택 시 EndpointRef 를 만들어 cableSetSource (source) 또는
 * cableSetTarget + commitCable (target) 로 흘려보낸다.
 *
 * NOTE: 이 host 는 Phase 2 에서 제거 예정(피커가 직접 EndpointRef 를 만들도록).
 */
interface CableEndpointPickerHostProps {
  /** SSOT-2d Task 3 — effective 설비(activeEquipment) 조회용. */
  floorId: string;
}

export function CableEndpointPickerHost({ floorId }: CableEndpointPickerHostProps) {
  const cable = useCableDrawing();
  const phase = cable?.phase ?? 'idle';
  const pendingContainerId = cable?.pendingContainerId ?? null;

  // SSOT-2d Task 3 — 읽기를 통합 스토어 effective 로.
  const localEquipment = useEffectiveEquipment(floorId);

  const activeEquipment = useMemo(
    () =>
      pendingContainerId
        ? localEquipment.find((eq) => eq.id === pendingContainerId) ?? null
        : null,
    [pendingContainerId, localEquipment],
  );

  if (!activeEquipment) return null;
  if (phase !== 'pickingSourceEndpoint' && phase !== 'pickingTargetEndpoint') return null;

  const isSource = phase === 'pickingSourceEndpoint';
  const center = getEquipmentCenter(activeEquipment);

  const activeKind = kindOf(activeEquipment);

  const handleCancel = () => {
    // 전체 그리기 취소 — interaction idle + tool select 를 *함께* 되돌린다(단일 진입점).
    // (cancel 만 하면 tool='cable' 이 남아 캔버스가 먹통이 되던 버그.)
    useEditorStore.getState().cancelCableDrawing();
  };

  /** source → cableSetSource, target → cableSetTarget + commitCable. */
  const apply = (ref: {
    innerAssetId?: string | null;
    slotId?: string | null;
    coreNumber?: number | null;
    role?: 'IN' | 'OUT' | null;
  }) => {
    const ix = useInteractionStore.getState();
    const endpoint = { containerAssetId: activeEquipment.id, position: center, ...ref };
    if (isSource) {
      ix.cableSetSource(endpoint);
    } else {
      ix.cableSetTarget(endpoint);
      commitCable();
    }
  };

  if (activeKind === 'RACK') {
    return (
      <RackModulePicker
        rackEquipmentId={activeEquipment.id}
        rackName={activeEquipment.name}
        onSelect={(moduleId) => apply({ innerAssetId: moduleId })}
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
          // FEEDER 는 connectionKind='distributor' → 출력 케이블이므로 role='OUT'.
          apply({ innerAssetId: feederId, role: 'OUT' });
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
          // slotId 는 endpointAssetId() 가 endpoint 로 해소. conduit 슬롯 끝은 role='OUT'.
          // center = OFD 중심 (경로 기하) — floorAnchor 가 슬롯→OFD 렌더.
          apply({ slotId, coreNumber, role: 'OUT' });
        }}
        onCancel={handleCancel}
      />
    );
  }

  return null;
}
