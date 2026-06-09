import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsibleSection } from './CollapsibleSection';

describe('CollapsibleSection', () => {
  it('기본 접힘 — 본문 숨김, 클릭하면 펼침', () => {
    render(<CollapsibleSection title="사진"><div>본문내용</div></CollapsibleSection>);
    expect(screen.queryByText('본문내용')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('사진'));
    expect(screen.getByText('본문내용')).toBeInTheDocument();
  });
  it('defaultOpen=true 면 처음부터 보임', () => {
    render(<CollapsibleSection title="속성" defaultOpen><div>속성본문</div></CollapsibleSection>);
    expect(screen.getByText('속성본문')).toBeInTheDocument();
  });
});
