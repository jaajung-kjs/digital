import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { generateTempId } from '../../../utils/idHelpers';
import { useEditorStore } from '../../editor/stores/editorStore';
// 현황(대장) 점검 이력도 에디터 LogsTab 과 동일한 보류 큐로 스테이징 → 단일 저장 시 flushPendingMedia 가 생성.
// 저장된 로그는 editor 와 동일한 query key(['maintenance-logs', id])를 써서 commit 무효화로 자동 갱신.
import { useMaintenanceLogs } from '../../equipment/hooks/useMaintenanceLogs';

export function AssetMaintenanceSection({ assetId }: { assetId: string }) {
  const { data: saved = [] } = useMaintenanceLogs(assetId);
  const pendingLogs = useEditorStore((s) => s.pendingLogs);
  const addPendingLog = useEditorStore((s) => s.addPendingLog);
  const removePendingLog = useEditorStore((s) => s.removePendingLog);
  const [title, setTitle] = useState('');
  const [logType, setLogType] = useState('MAINTENANCE');

  // 저장된 로그 + 이 장비의 보류 로그(저장 대기) 머지
  const logs = useMemo(() => {
    const pending = pendingLogs
      .filter((l) => l.equipmentId === assetId)
      .map((l) => ({ id: l.id, logType: l.logType, title: l.title, logDate: l.logDate, isPending: true as const }));
    const savedShown = saved.map((l) => ({
      id: l.id, logType: l.logType, title: l.title, logDate: l.logDate, isPending: false as const,
    }));
    return [...pending, ...savedShown];
  }, [pendingLogs, saved, assetId]);

  // 현황 자산은 이미 저장됨(real id) → 보류 큐에 real equipmentId 로 적재, 단일 저장 시 생성.
  const add = () => {
    if (!title.trim()) return;
    addPendingLog({ id: generateTempId(), equipmentId: assetId, logType, title: title.trim() });
    setTitle('');
  };

  const isEmpty = logs.length === 0;

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">유지보수 이력</h3>
      <div className="flex gap-1 mb-2">
        <select value={logType} onChange={(e) => setLogType(e.target.value)} className="text-xs border border-gray-200 rounded px-1">
          <option value="MAINTENANCE">점검</option>
          <option value="FAILURE">고장</option>
          <option value="REPAIR">수리</option>
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="내용"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1" />
        <button onClick={add} disabled={!title.trim()}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300">추가</button>
      </div>
      {isEmpty ? (
        <p className="text-xs text-gray-400">이력 없음</p>
      ) : (
        <ul className="space-y-1">
          {logs.map((l) => (
            <li key={l.id} className="text-xs text-gray-600 flex justify-between items-center gap-2">
              <span className="flex items-center gap-1">
                [{l.logType}] {l.title}
                {l.isPending && (
                  <span className="text-[10px] bg-amber-500 text-white rounded px-1">저장 대기</span>
                )}
              </span>
              {l.isPending ? (
                <button aria-label="삭제" onClick={() => removePendingLog(l.id)} className="text-content-muted hover:text-danger"><X size={14} /></button>
              ) : (
                <span className="text-gray-400">{l.logDate ? new Date(l.logDate).toLocaleDateString('ko-KR') : ''}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
