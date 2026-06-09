import { useState } from 'react';
import { useAssetMaintenanceLogs } from '../hooks/useAssetMaintenanceLogs';
import { useRegisterStore } from '../registerStore';
import { generateTempId } from '../../../utils/idHelpers';

export function AssetMaintenanceSection({ assetId }: { assetId: string }) {
  const { data: logs = [] } = useAssetMaintenanceLogs(assetId);
  const logQueue = useRegisterStore((s) => s.logQueue);
  const queued = logQueue.filter((l) => l.assetId === assetId);
  const [title, setTitle] = useState('');
  const [logType, setLogType] = useState('MAINTENANCE');

  const add = () => {
    if (!title.trim()) return;
    useRegisterStore.getState().enqueueLog({ tempLogId: generateTempId(), assetId, logType, title: title.trim() });
    setTitle('');
  };

  const isEmpty = logs.length === 0 && queued.length === 0;

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
            <li key={l.id} className="text-xs text-gray-600 flex justify-between">
              <span>[{l.logType}] {l.title}</span>
              <span className="text-gray-400">{l.logDate ? new Date(l.logDate).toLocaleDateString('ko-KR') : ''}</span>
            </li>
          ))}
          {queued.map((l) => (
            <li key={l.tempLogId} className="text-xs text-gray-600 flex justify-between">
              <span>[{l.logType}] {l.title}</span>
              <span className="text-[10px] bg-amber-500 text-white rounded px-1">미커밋</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
