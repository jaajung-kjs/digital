import { useState, type ReactNode } from 'react';

interface Props { title: string; badge?: ReactNode; defaultOpen?: boolean; children: ReactNode; }

export function CollapsibleSection({ title, badge, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
      >
        <span className="text-gray-400 w-3">{open ? '▾' : '▸'}</span>
        <span>{title}</span>
        {badge != null && <span className="ml-auto text-gray-400 font-normal">{badge}</span>}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </section>
  );
}
