import { setPortValueAt, type ValueDef } from '@twin/core';
import { EMPTY, Toggle, cn } from '../../../components/ui';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import { InlineEditCell } from '../InlineEditCell';

/**
 * 포트 하나에 딸린 값 한 칸 — **적는 문이 하나**다.
 *
 * 계통 표의 회로 줄과 포트 판의 상세 카드가 같은 값(전압·용량·개폐)을 적는다. 예전에는
 * 표 쪽에만 있어서, 포트를 눌러 놓고도 전압을 적을 곳이 없었다.
 *
 * 무엇을 적는 칸인지는 **종류 선언이 준다**(`portFieldsFor`) — 화면이 `voltage` 같은 키를
 * 알지 않는다. 자료형이 `boolean` 이면 스위치, 고를 값이 선언돼 있으면 목록이다.
 */
export function PortValueControl({
  assetId, portId, field, value, muted,
}: { assetId: string; portId: string; field: ValueDef; value: unknown; muted?: boolean }) {
  function write(next: unknown) {
    const live = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === assetId);
    const target = live?.ports.find((p) => p.id === portId);
    if (!live || !target) return;
    const ports = live.ports.map((p) =>
      p.id === portId ? { ...p, fieldValues: setPortValueAt(p, 1, field.key, next) } : p,
    );
    useV2WorkingCopy.getState().stageAssetUpdate(assetId, { ports });
  }

  /* 선언이 정하는 값은 **여기서 고치지 않는다**(전원의 전압) — 적는 자리는 장비 관리의
     포트 선언 하나뿐이다. 여러 곳에서 고칠 수 있게 두면 같은 회로의 두 끝이 다른 전압으로
     적히고, 어느 쪽이 사실인지 알 길이 없다. */
  if (field.readOnly) {
    return (
      <span className={cn('block px-1 text-sm', muted ? 'text-content-faint' : 'text-content')}>
        {value === null || value === undefined || value === '' ? EMPTY : String(value)}
      </span>
    );
  }

  if (field.type === 'boolean') {
    return (
      <Toggle
        checked={value === true}
        onChange={write}
        size="sm"
        label={value === true ? (field.trueLabel ?? 'ON') : (field.falseLabel ?? 'OFF')}
        aria-label={field.label}
      />
    );
  }

  return (
    <InlineEditCell
      value={value === null || value === undefined ? '' : String(value)}
      onCommit={(raw) => {
        const next = field.type === 'number' ? (raw.trim() === '' ? null : Number(raw)) : (raw.trim() || null);
        if (field.type === 'number' && typeof next === 'number' && Number.isNaN(next)) return;
        if ((value ?? null) === next) return;
        write(next);
      }}
      muted={muted}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : undefined}
      label={field.label}
      unit={field.unit}
      /* 고를 수 있는 값이 선언돼 있으면 목록으로 — 화면이 그 목록을 알지 않는다. */
      options={field.options}
    />
  );
}
