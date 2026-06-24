import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useCatalogStore } from './catalogStore';
import { CatalogSaveBar } from './CatalogSaveBar';
import { AssetTypesTab } from './AssetTypesTab';
import { CableTypesTab } from './CableTypesTab';

type TabKey = 'asset-types' | 'cable-types' | 'presets';
const TABS: { key: TabKey; label: string; enabled: boolean }[] = [
  { key: 'asset-types', label: '설비종류', enabled: true },
  { key: 'cable-types', label: '케이블종류', enabled: true },
  { key: 'presets', label: '프리셋', enabled: false },
];

/**
 * 자산관리 — 전역 마스터데이터(종류·분류) 관리 화면. 관리자 전용.
 * 카탈로그 워킹카피(스테이징 → 원자적 저장/취소). 변전소 워킹카피와 분리.
 */
export function AssetManagementPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const load = useCatalogStore((s) => s.load);
  const discard = useCatalogStore((s) => s.discard);
  const [activeTab, setActiveTab] = useState<TabKey>('asset-types');

  useEffect(() => {
    load();
    return () => discard(); // 화면 이탈 시 미저장 스테이징 폐기
  }, [load, discard]);

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={!t.enabled}
            onClick={() => t.enabled && setActiveTab(t.key)}
            className={`px-3 py-1 text-sm rounded ${
              !t.enabled
                ? 'text-content-faint cursor-not-allowed'
                : activeTab === t.key
                  ? 'bg-info-bg text-primary font-medium'
                  : 'text-content hover:bg-surface-2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {activeTab === 'asset-types' && <AssetTypesTab />}
        {activeTab === 'cable-types' && <CableTypesTab />}
      </div>
      <CatalogSaveBar />
    </div>
  );
}
