import { useRef, useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { IconAction } from './detail/SectionShell';

const INLINE_INPUT =
  'min-w-0 w-full px-1.5 py-0.5 rounded text-sm bg-surface border border-line ' +
  'focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-colors';
const PENCIL =
  'shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 group-focus-within:opacity-100 transition-opacity';

export interface EditableFieldOption { value: string; label: string }

/**
 * 인라인 편집 primitive — 읽기=텍스트 + 셀 호버 시 ✎, ✎ 클릭→입력(text/select/date),
 * Enter/blur 커밋, Esc 취소. AssetInspector.Field 패턴 추출(그리드·인스펙터 공유).
 * valueClickEdits: 값 클릭이 편집을 열지(인스펙터=true) 아니면 부모(행클릭=패널)로 버블(그리드=false).
 *
 * 행클릭 차단: pencil 은 <span onClick={stopPropagation}> 로 래핑.
 * IconAction 의 onClick 은 () => void(이벤트 미전달)이므로 래퍼 span 이 유일한 버블 차단 포인트.
 */
export function EditableField({
  value, type = 'text', options, placeholder, disabled, display, ariaLabel, valueClickEdits = false, onCommit,
}: {
  value: string; type?: 'text' | 'select' | 'date'; options?: EditableFieldOption[];
  placeholder?: string; disabled?: boolean; display?: (v: string) => ReactNode;
  ariaLabel?: string; valueClickEdits?: boolean; onCommit: (v: string) => void;
}) {
  const cancel = useRef(false);
  const committed = useRef(false);
  const [editing, setEditing] = useState(false);
  const start = () => { if (!disabled) setEditing(true); };

  if (editing) {
    if (type === 'select') {
      return (
        <select
          autoFocus
          aria-label={ariaLabel}
          value={value}
          className={INLINE_INPUT}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { onCommit(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        >
          {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input
        autoFocus
        type={type}
        aria-label={ariaLabel}
        placeholder={placeholder}
        defaultValue={value}
        className={INLINE_INPUT}
        ref={(el) => {
          if (el && type === 'date') requestAnimationFrame(() => {
            try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* no user gesture */ }
          });
        }}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          if (!cancel.current && !committed.current && e.target.value !== value) onCommit(e.target.value);
          cancel.current = false;
          committed.current = false;
          setEditing(false);
        }}
        onChange={type === 'date' ? (e) => { committed.current = true; onCommit(e.target.value); setEditing(false); } : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          else if (e.key === 'Escape') { cancel.current = true; (e.target as HTMLInputElement).blur(); }
        }}
      />
    );
  }

  const shown = display ? display(value) : (value || <span className="text-content-faint">—</span>);
  return (
    <span className="group inline-flex items-center gap-1 min-w-0 w-full">
      {valueClickEdits ? (
        <button
          type="button"
          title={value || undefined}
          onClick={(e) => { e.stopPropagation(); start(); }}
          className="min-w-0 flex-1 truncate text-left text-sm text-content hover:text-primary transition-colors"
        >
          {shown}
        </button>
      ) : (
        <span title={value || undefined} className="min-w-0 flex-1 truncate text-sm text-content">{shown}</span>
      )}
      {!disabled && (
        <span className={PENCIL} onClick={(e) => e.stopPropagation()}>
          <IconAction onClick={() => start()} title={`${ariaLabel ?? ''} 수정`}>
            <Pencil size={13} />
          </IconAction>
        </span>
      )}
    </span>
  );
}
