import { useState, useEffect } from 'react';
import { api } from '../../../utils/api';

interface RemoteEquipmentSelectorProps {
  label: string;
  selectedEquipmentId: string;
  onSelect: (equipmentId: string, equipmentName: string) => void;
  localEquipmentList: { id: string; name: string }[];
  excludeId?: string;
}

interface SelectOption {
  id: string;
  name: string;
}

export function RemoteEquipmentSelector({
  label,
  selectedEquipmentId,
  onSelect,
  localEquipmentList,
  excludeId,
}: RemoteEquipmentSelectorProps) {
  const [mode, setMode] = useState<'local' | 'remote'>('local');

  // Hierarchical state
  const [hqList, setHqList] = useState<SelectOption[]>([]);
  const [branchList, setBranchList] = useState<SelectOption[]>([]);
  const [subList, setSubList] = useState<SelectOption[]>([]);
  const [floorList, setFloorList] = useState<SelectOption[]>([]);
  const [roomList, setRoomList] = useState<SelectOption[]>([]);
  const [equipList, setEquipList] = useState<SelectOption[]>([]);

  const [selectedHq, setSelectedHq] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedSub, setSelectedSub] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');

  // Load HQ list on mount when remote mode
  useEffect(() => {
    if (mode !== 'remote') return;
    api.get<{ data: SelectOption[] }>('/organizations/headquarters')
      .then((res) => setHqList(res.data.data));
  }, [mode]);

  // Load branches when HQ selected
  useEffect(() => {
    if (!selectedHq) { setBranchList([]); return; }
    setSelectedBranch(''); setSubList([]); setFloorList([]); setRoomList([]); setEquipList([]);
    api.get<{ data: SelectOption[] }>(`/organizations/headquarters/${selectedHq}/branches`)
      .then((res) => setBranchList(res.data.data));
  }, [selectedHq]);

  // Load substations when branch selected
  useEffect(() => {
    if (!selectedBranch) { setSubList([]); return; }
    setSelectedSub(''); setFloorList([]); setRoomList([]); setEquipList([]);
    api.get<{ data: SelectOption[] }>(`/organizations/branches/${selectedBranch}/substations`)
      .then((res) => setSubList(res.data.data));
  }, [selectedBranch]);

  // Load floors when substation selected
  useEffect(() => {
    if (!selectedSub) { setFloorList([]); return; }
    setSelectedFloor(''); setRoomList([]); setEquipList([]);
    api.get<{ data: SelectOption[] }>(`/substations/${selectedSub}/floors`)
      .then((res) => setFloorList(res.data.data));
  }, [selectedSub]);

  // Load rooms when floor selected
  useEffect(() => {
    if (!selectedFloor) { setRoomList([]); return; }
    setSelectedRoom(''); setEquipList([]);
    api.get<{ data: SelectOption[] }>(`/floors/${selectedFloor}/rooms`)
      .then((res) => setRoomList(res.data.data));
  }, [selectedFloor]);

  // Load equipment when room selected
  useEffect(() => {
    if (!selectedRoom) { setEquipList([]); return; }
    api.get<{ data: { equipment: SelectOption[] } }>(`/rooms/${selectedRoom}/plan`)
      .then((res) => setEquipList(res.data.data.equipment ?? []))
      .catch(() => setEquipList([]));
  }, [selectedRoom]);

  const selectClass = 'w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const labelClass = 'block text-[10px] text-gray-400 mb-0.5';

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs text-gray-500">{label}</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode('local')}
            className={`text-[10px] px-1.5 py-0.5 rounded ${mode === 'local' ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}
          >
            현재 실
          </button>
          <button
            type="button"
            onClick={() => setMode('remote')}
            className={`text-[10px] px-1.5 py-0.5 rounded ${mode === 'remote' ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}
          >
            다른 실
          </button>
        </div>
      </div>

      {mode === 'local' ? (
        <select
          value={selectedEquipmentId}
          onChange={(e) => {
            const eq = localEquipmentList.find((x) => x.id === e.target.value);
            if (eq) onSelect(eq.id, eq.name);
          }}
          className={selectClass}
        >
          <option value="">선택...</option>
          {localEquipmentList
            .filter((eq) => eq.id !== excludeId)
            .map((eq) => (
              <option key={eq.id} value={eq.id}>{eq.name}</option>
            ))}
        </select>
      ) : (
        <div className="space-y-1.5 bg-gray-50 rounded p-2 border border-gray-200">
          <div>
            <span className={labelClass}>본부</span>
            <select value={selectedHq} onChange={(e) => setSelectedHq(e.target.value)} className={selectClass}>
              <option value="">선택...</option>
              {hqList.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          {selectedHq && (
            <div>
              <span className={labelClass}>지사</span>
              <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className={selectClass}>
                <option value="">선택...</option>
                {branchList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          {selectedBranch && (
            <div>
              <span className={labelClass}>변전소</span>
              <select value={selectedSub} onChange={(e) => setSelectedSub(e.target.value)} className={selectClass}>
                <option value="">선택...</option>
                {subList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {selectedSub && (
            <div>
              <span className={labelClass}>층</span>
              <select value={selectedFloor} onChange={(e) => setSelectedFloor(e.target.value)} className={selectClass}>
                <option value="">선택...</option>
                {floorList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}
          {selectedFloor && (
            <div>
              <span className={labelClass}>실</span>
              <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} className={selectClass}>
                <option value="">선택...</option>
                {roomList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          {selectedRoom && (
            <div>
              <span className={labelClass}>설비</span>
              <select
                value={selectedEquipmentId}
                onChange={(e) => {
                  const eq = equipList.find((x) => x.id === e.target.value);
                  if (eq) onSelect(eq.id, eq.name);
                }}
                className={selectClass}
              >
                <option value="">선택...</option>
                {equipList
                  .filter((eq) => eq.id !== excludeId)
                  .map((eq) => (
                    <option key={eq.id} value={eq.id}>{eq.name}</option>
                  ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
