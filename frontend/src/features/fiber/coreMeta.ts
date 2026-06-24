import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { isOpgwTwin } from '../cables/cableEndpoint';
import { todayInputValue } from '../../utils/date';
import type { CableLike } from './slotRegister';

/**
 * 코어 한 필드를 **OPGW.specParams.coreMeta[coreNumber]** 에 머지 스테이징(기존 키 보존).
 * 선번(코어정보)은 OPGW 케이블 소유 — 자국·대국이 같은 OPGW 를 공유하므로 한쪽 입력이 양쪽에 반영.
 *
 * **속성을 변경하면(점검일 자체 편집 제외) 마지막점검일(inspectDate)을 오늘로 자동 갱신** —
 * 손실/거리 수정·삭제, 설비 연결/해제 등 "코어를 만졌다 = 점검했다". 점검일은 수동 편집도 가능.
 */
export function commitCoreMeta(opgwId: string, coreNumber: number, field: string, value: string | null) {
  const wc = useSubstationWorkingCopy.getState();
  const opgw = wc.effectiveCables().find((c) => c.id === opgwId);
  const sp = ((opgw?.specParams as Record<string, unknown>) ?? {});
  const coreMeta = { ...((sp.coreMeta as Record<string, Record<string, unknown>>) ?? {}) };
  const k = String(coreNumber);
  const next = { ...(coreMeta[k] ?? {}), [field]: value };
  if (field !== 'inspectDate') next.inspectDate = todayInputValue(); // 속성 변경 시 점검일 자동
  coreMeta[k] = next;
  wc.patch('cables', opgwId, { specParams: { ...sp, coreMeta } });
}

/** 설비 연결/변경/해제 등 코어 패치 케이블 변경 후 — 점검일만 오늘로 갱신. */
export function touchCoreInspect(opgwId: string, coreNumber: number) {
  commitCoreMeta(opgwId, coreNumber, 'inspectDate', todayInputValue());
}

/** 슬롯의 OPGW(IN-IN twin) 케이블 id — 코어 메타 소유자. 자국/대국 어느 슬롯에서든 같은 OPGW. */
export function opgwIdOfSlot(slotId: string, cables: CableLike[]): string | null {
  const opgw = cables.find((c) => isOpgwTwin(c) && (c.sourceAssetId === slotId || c.targetAssetId === slotId));
  return opgw?.id ?? null;
}
