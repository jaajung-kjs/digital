import { useIsAdmin } from '../../../../stores/authStore';
import { RecordFormList } from '../../../workingCopy/RecordFormList';
import { RECORD_TYPE_BY_KEY } from '../../../workingCopy/recordTypes';

/**
 * 점검(inspection) 섹션 — git-like 스테이징.
 *
 * P5c: 점검/고장이력 form-list 는 ASSET_RECORD_TYPES 레지스트리 + 제네릭 RecordFormList 로
 * 통합됐다. 이 컴포넌트는 점검 def + 관리자(isAdmin) 게이팅을 주입하는 thin wrapper.
 *  - 작성/수정/삭제는 즉시 백엔드로 가지 않고 워킹카피 inspections overlay 에 스테이징됐다가
 *    단일 SAVE(commit) 시 반영된다. 보류 항목은 인라인 수정/삭제, 저장 항목은 삭제만.
 */
export function InspectionSection({ assetId }: { assetId: string }) {
  const isAdmin = useIsAdmin();
  return <RecordFormList def={RECORD_TYPE_BY_KEY.inspections} parentId={assetId} readOnly={!isAdmin} />;
}
