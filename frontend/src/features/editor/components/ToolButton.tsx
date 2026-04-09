import React from 'react';

interface ToolButtonProps {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
  shortcut: string;
  danger?: boolean;
  children: React.ReactNode;
}

export function ToolButton({
  active,
  onClick,
  title,
  label,
  shortcut,
  danger,
  children,
}: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-full px-2 py-1.5 flex items-center gap-2 rounded-lg transition-colors ${
        active
          ? danger
            ? 'bg-red-100 text-red-600'
            : 'bg-blue-100 text-blue-600'
          : danger
            ? 'hover:bg-red-50 text-red-500'
            : 'hover:bg-gray-100 text-gray-600'
      }`}
    >
      <div className="w-5 h-5 flex-shrink-0">{children}</div>
      <span className="text-xs whitespace-nowrap">{label} <span className="text-gray-400">({shortcut})</span></span>
    </button>
  );
}
