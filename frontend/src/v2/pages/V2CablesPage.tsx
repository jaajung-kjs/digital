/**
 * V2CablesPage — 「케이블 종류」 화면
 *
 * 대장 안의 한 탭이 아니라 **제 화면**이다. 케이블은 설비·자산과 **분류 체계를 공유하지
 * 않는다**: 설비 종류와 자산 종류는 같은 `AssetCategory`(구조·통신·전원·공조)에 속하는
 * 형제지만, 케이블 그룹은 포트 종류와 1:1인 고정 어휘(전원·네트워크·광·제어·접지)다.
 * 같은 트리에 두면 있지도 않은 계층을 꾸며 내게 된다 — 실제로 그렇게 해 봤더니 뿌리를
 * 누를 때마다 오른쪽이 통째로 다른 화면이 되어 어긋나 보였다.
 *
 * 판은 앱의 다른 화면과 같다 — `트리 │ 캔버스`.
 */
import { PageState } from '../../components/ui';
import { useV2Catalog } from '../hooks';
import { CableCatalogPanel } from '../components/admin/CableCatalogPanel';

export default function V2CablesPage() {
  const catalog = useV2Catalog();
  /* `null` 을 돌려주지 않는다 — 아무것도 없는 화면은 고장과 구별되지 않는다. */
  if (catalog.isLoading) return <PageState />;
  if (catalog.isError || catalog.data == null) return <PageState error="카탈로그를 불러오지 못했습니다" />;
  return (
    <div className="flex min-h-0 flex-1">
      <CableCatalogPanel catalog={catalog.data} />
    </div>
  );
}
