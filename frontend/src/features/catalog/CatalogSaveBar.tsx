import { useState } from 'react';
import { useCatalogStore } from './catalogStore';
import { Button } from '../../components/ui';
import { useToastStore } from '../editor/stores/toastStore';

/** 카탈로그 워킹카피 저장바 — dirty 0 이면 숨김. 저장=원자적 commit, 취소=overlay 폐기. */
export function CatalogSaveBar() {
  const dirty = useCatalogStore((s) => s.dirtyCount());
  const commit = useCatalogStore((s) => s.commit);
  const discard = useCatalogStore((s) => s.discard);
  const [saving, setSaving] = useState(false);

  if (dirty === 0) return null;

  const onSave = async () => {
    setSaving(true);
    try {
      await commit();
      useToastStore.getState().showToast('저장되었습니다');
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e as { message?: string })?.message ?? '저장에 실패했습니다';
      useToastStore.getState().showToast(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-t border-line bg-surface">
      <span className="text-sm text-content-muted">변경 {dirty}건</span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={discard} disabled={saving}>취소</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>{saving ? '저장 중…' : '저장'}</Button>
      </div>
    </div>
  );
}
