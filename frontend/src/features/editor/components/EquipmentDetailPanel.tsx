import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { useEditorStore } from '../stores/editorStore';
import {
  useMaintenanceLogs,
  useCreateMaintenanceLog,
} from '../../equipment/hooks/useMaintenanceLogs';
import { ConnectionDiagram } from '../../equipment/components/ConnectionDiagram';
import {
  LOG_TYPE_LABELS,
  SEVERITY_COLORS,
  STATUS_COLORS,
  STATUS_LABELS,
  CATEGORY_LABELS,
} from '../../equipment/types/equipment';

interface EquipmentDetailPanelProps {
  equipmentId: string;
  roomId: string;
}

interface EquipmentDetail {
  id: string;
  name: string;
  category: string;
  model?: string;
  manufacturer?: string;
  manager?: string;
  description?: string;
  width: number;
  height: number;
  frontImageUrl?: string;
  rearImageUrl?: string;
}

type TabKey = 'info' | 'logs' | 'connections';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'info', label: '기본 정보' },
  { key: 'logs', label: '점검/고장 이력' },
  { key: 'connections', label: '연결 정보' },
];

function useEquipmentDetail(equipmentId: string) {
  return useQuery({
    queryKey: ['equipment-detail', equipmentId],
    queryFn: async () => {
      const { data } = await api.get<{ data: EquipmentDetail }>(`/equipment/${equipmentId}`);
      return data.data;
    },
    enabled: !!equipmentId,
  });
}

export function EquipmentDetailPanel({ equipmentId, roomId }: EquipmentDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const setDetailPanelEquipmentId = useEditorStore((s) => s.setDetailPanelEquipmentId);
  const { data: equipment, isLoading, error } = useEquipmentDetail(equipmentId);

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-[360px] bg-white border-l border-gray-200 shadow-[-4px_0_12px_rgba(0,0,0,0.08)] z-20 flex flex-col animate-slide-in-right"
      style={{
        animation: 'slideInRight 0.25s ease-out',
      }}
    >
      {/* Inline keyframes for slide animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <h3 className="text-sm font-semibold text-gray-900 truncate">
          {isLoading ? '로딩 중...' : equipment?.name ?? '설비 상세'}
        </h3>
        <button
          onClick={() => setDetailPanelEquipmentId(null)}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
          title="닫기"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-red-500">
            데이터를 불러올 수 없습니다.
          </div>
        ) : equipment ? (
          <>
            {activeTab === 'info' && <InfoTab equipment={equipment} />}
            {activeTab === 'logs' && <LogsTab equipmentId={equipmentId} />}
            {activeTab === 'connections' && (
              <ConnectionsTab equipmentId={equipmentId} roomId={roomId} />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

/* --- Info Tab --- */

function InfoTab({ equipment }: { equipment: EquipmentDetail }) {
  return (
    <div className="p-4 space-y-4">
      {/* Basic properties */}
      <section>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          기본 속성
        </h4>
        <dl className="space-y-1.5">
          <InfoRow label="이름" value={equipment.name} />
          <InfoRow label="분류" value={CATEGORY_LABELS[equipment.category] ?? equipment.category} />
          {equipment.model && <InfoRow label="모델" value={equipment.model} />}
          {equipment.manufacturer && <InfoRow label="제조사" value={equipment.manufacturer} />}
          {equipment.manager && <InfoRow label="담당자" value={equipment.manager} />}
          {equipment.description && <InfoRow label="설명" value={equipment.description} />}
          <InfoRow label="크기" value={`${equipment.width} x ${equipment.height}`} />
        </dl>
      </section>

      {/* Images */}
      {(equipment.frontImageUrl || equipment.rearImageUrl) && (
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            이미지
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {equipment.frontImageUrl && (
              <div>
                <p className="text-xs text-gray-400 mb-1">전면</p>
                <img
                  src={equipment.frontImageUrl}
                  alt="전면"
                  className="w-full h-24 object-cover rounded border border-gray-200"
                />
              </div>
            )}
            {equipment.rearImageUrl && (
              <div>
                <p className="text-xs text-gray-400 mb-1">후면</p>
                <img
                  src={equipment.rearImageUrl}
                  alt="후면"
                  className="w-full h-24 object-cover rounded border border-gray-200"
                />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 font-medium">{value}</dd>
    </div>
  );
}

/* --- Logs Tab --- */

function LogsTab({ equipmentId }: { equipmentId: string }) {
  const { data: logs, isLoading } = useMaintenanceLogs(equipmentId);
  const createMutation = useCreateMaintenanceLog(equipmentId);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    logType: 'MAINTENANCE',
    title: '',
    severity: 'LOW',
    description: '',
  });

  const handleSubmit = () => {
    if (!formData.title.trim()) return;
    createMutation.mutate(
      {
        logType: formData.logType,
        title: formData.title,
        severity: formData.severity,
        description: formData.description || undefined,
      },
      {
        onSuccess: () => {
          setFormData({ logType: 'MAINTENANCE', title: '', severity: 'LOW', description: '' });
          setShowForm(false);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Add button */}
      <div className="px-4 pt-2">
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          {showForm ? '취소' : '+ 새 이력 추가'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mx-4 mt-2 p-3 rounded border border-blue-200 bg-blue-50 space-y-2">
          <select
            value={formData.logType}
            onChange={(e) => setFormData((p) => ({ ...p, logType: e.target.value }))}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5"
          >
            {Object.entries(LOG_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="제목"
            value={formData.title}
            onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5"
          />
          <select
            value={formData.severity}
            onChange={(e) => setFormData((p) => ({ ...p, severity: e.target.value }))}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5"
          >
            {Object.entries(SEVERITY_COLORS).map(([key]) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
          <textarea
            placeholder="설명 (선택)"
            value={formData.description}
            onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none"
            rows={2}
          />
          <button
            onClick={handleSubmit}
            disabled={!formData.title.trim() || createMutation.isPending}
            className="w-full text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {createMutation.isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      )}

      {/* Logs list */}
      <div className="p-4 space-y-2">
        {!logs || logs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center">이력이 없습니다.</p>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-2.5 rounded border border-gray-100 bg-gray-50 text-sm"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">
                  {LOG_TYPE_LABELS[log.logType] ?? log.logType}
                </span>
                {log.severity && (
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                      SEVERITY_COLORS[log.severity] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {log.severity}
                  </span>
                )}
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                    STATUS_COLORS[log.status] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {STATUS_LABELS[log.status] ?? log.status}
                </span>
              </div>
              <p className="font-medium text-gray-800">{log.title}</p>
              {log.description && (
                <p className="text-xs text-gray-500 mt-0.5">{log.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {new Date(log.createdAt).toLocaleDateString('ko-KR')}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* --- Connections Tab --- */

function ConnectionsTab({
  equipmentId,
  roomId,
}: {
  equipmentId: string;
  roomId: string;
}) {
  return (
    <div className="p-4">
      <ConnectionDiagram roomId={roomId} equipmentId={equipmentId} />
    </div>
  );
}
