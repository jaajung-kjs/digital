import React from 'react';
import { Button } from './Button';

interface CommitBarProps {
  dirty: number;
  onCommit: () => void | Promise<void>;
  onRevert: () => void;
  busy?: boolean;
  extra?: React.ReactNode;
}

export function CommitBar({ dirty, onCommit, onRevert, busy, extra }: CommitBarProps): JSX.Element {
  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-line bg-warning-bg text-sm">
      <span className="text-warning font-medium">저장 {dirty}건</span>
      <Button size="sm" onClick={onCommit} disabled={busy}>저장</Button>
      <Button size="sm" variant="secondary" onClick={onRevert} disabled={busy}>되돌리기</Button>
      {extra}
    </div>
  );
}
