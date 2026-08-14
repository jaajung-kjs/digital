/**
 * V2AssembliesPage — 「설비 종류」 화면
 *
 * **제 화면을 갖는 이유.** 설비 종류·자산 종류·케이블 종류는 서로의 보는 면이 아니라
 * 각자 별개의 대장이다. 워크스페이스의 탭(현황·평면도·선번장·계통)은 **고른 변전소 하나**를
 * 다르게 보는 판이라 캔버스에 속하지만, 대장들은 무엇의 탭도 아니다 — 그래서 탭으로 두면
 * 사이드바 위에 붕 뜨고, 한 트리의 뿌리로 묶으면 없는 계층을 꾸며 내게 되고, 한 목록에
 * 섞으면 「설비만 보기」가 사라진다. 셋 다 해 봤고 셋 다 어긋났다.
 *
 * 판은 앱의 다른 화면과 같다 — `트리 │ 캔버스`.
 */
import { ErrorStrip, PageState } from '../../components/ui';
import { useV2Catalog } from '../hooks';
import { AssemblyCatalogPanel } from '../components/admin/AssemblyCatalogPanel';
import { useCategoryAdmin } from '../useCategoryAdmin';

export default function V2AssembliesPage() {
  const catalogQuery = useV2Catalog();
  const catalog = catalogQuery.data;
  /* 분류는 자산 종류 화면과 **같은 체계**다 — 어느 쪽에서 만들든 양쪽에 나타난다. */
  const category = useCategoryAdmin();

  if (catalogQuery.isLoading) return <PageState />;
  if (catalogQuery.isError || catalog == null) return <PageState error="카탈로그를 불러오지 못했습니다" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ErrorStrip
        message={category.error}
        onDismiss={category.clearError}
        className="shrink-0 border-b border-line bg-surface px-4 py-1"
      />
      <div className="flex min-h-0 flex-1">
        <AssemblyCatalogPanel
          catalog={catalog}
          onRenameCategory={category.rename}
          onDeleteCategory={(cat) => void category.remove(cat)}
          onAddCategory={category.openAdd}
        />
      </div>
      {category.modal(catalog.categories)}
    </div>
  );
}
