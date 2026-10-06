import { useState } from 'react';
import { Input, type InputProps } from './Input';
import { isCommitKey, isComposing } from './keyboard';

export interface CommitInputProps extends Omit<InputProps, 'value' | 'defaultValue' | 'onChange'> {
  /** 저장된(또는 변경안에 담긴) 값. */
  value: string;
  /** 다 쳤을 때 한 번 — 앞뒤 공백을 걷은 값. 그대로면 부르지 않는다. */
  onCommit: (value: string) => void;
  /** 비울 수 없는 칸(이름) — 비우고 나가면 원래 값으로 돌아간다. */
  required?: boolean;
}

/**
 * 폼 한 칸 — **치는 동안은 초안, 다 치면 한 번** 넘긴다(포커스를 잃거나 Enter).
 *
 * 글자마다 변경안에 실으면 ① 되돌리기 이력이 글자 수만큼 쌓이고(⌘Z 한 번에 한 글자),
 * ② 이름 칸을 다 지운 순간 빈 이름이 변경안에 들어가 저장이 서버에서 거절된다.
 * Esc 는 초안을 버리고 원래 값으로 돌아간다.
 */
export function CommitInput({ value, onCommit, required = false, onBlur, onKeyDown, ...rest }: CommitInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  function finish(raw: string) {
    setDraft(null);
    const next = raw.trim();
    if (required && next === '') return;
    if (next !== value) onCommit(next);
  }
  return (
    <Input
      {...rest}
      value={draft ?? value}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={(e) => { finish(e.currentTarget.value); onBlur?.(e); }}
      onKeyDown={(e) => {
        if (isCommitKey(e)) e.currentTarget.blur();
        else if (e.key === 'Escape' && !isComposing(e)) setDraft(null);
        onKeyDown?.(e);
      }}
    />
  );
}
