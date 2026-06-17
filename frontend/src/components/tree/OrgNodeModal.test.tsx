import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrgNodeModal } from './OrgNodeModal';

const noop = vi.fn();
const asyncNoop = vi.fn(async () => {});

describe('OrgNodeModal', () => {
  it('add + substation → 이름 + 주소 inputs present', () => {
    render(
      <OrgNodeModal
        open
        mode="add"
        targetType="substation"
        onSubmit={asyncNoop}
        onClose={noop}
      />,
    );
    expect(screen.getByText('변전소 추가')).toBeInTheDocument();
    expect(screen.getByText('이름')).toBeInTheDocument();
    expect(screen.getByText('주소')).toBeInTheDocument();
    expect(screen.queryByText('층번호')).not.toBeInTheDocument();
  });

  it('add + floor → 이름 + 층번호 inputs present', () => {
    render(
      <OrgNodeModal
        open
        mode="add"
        targetType="floor"
        onSubmit={asyncNoop}
        onClose={noop}
      />,
    );
    expect(screen.getByText('층 추가')).toBeInTheDocument();
    expect(screen.getByText('이름')).toBeInTheDocument();
    expect(screen.getByText('층번호')).toBeInTheDocument();
    expect(screen.queryByText('주소')).not.toBeInTheDocument();
  });

  it('add + branch → only 이름 (no 주소/층번호)', () => {
    render(
      <OrgNodeModal
        open
        mode="add"
        targetType="branch"
        onSubmit={asyncNoop}
        onClose={noop}
      />,
    );
    expect(screen.getByText('지사 추가')).toBeInTheDocument();
    expect(screen.getByText('이름')).toBeInTheDocument();
    expect(screen.queryByText('주소')).not.toBeInTheDocument();
    expect(screen.queryByText('층번호')).not.toBeInTheDocument();
  });

  it('edit (substation, initialName X) → only 이름, prefilled', () => {
    render(
      <OrgNodeModal
        open
        mode="edit"
        targetType="substation"
        initialName="X"
        onSubmit={asyncNoop}
        onClose={noop}
      />,
    );
    expect(screen.getByText('이름 변경')).toBeInTheDocument();
    expect(screen.getByText('이름')).toBeInTheDocument();
    expect(screen.queryByText('주소')).not.toBeInTheDocument();
    expect(screen.queryByText('층번호')).not.toBeInTheDocument();
    const input = screen.getByDisplayValue('X');
    expect(input).toBeInTheDocument();
  });

  it('empty name → 추가/저장 button disabled', () => {
    render(
      <OrgNodeModal
        open
        mode="add"
        targetType="branch"
        onSubmit={asyncNoop}
        onClose={noop}
      />,
    );
    const submitBtn = screen.getByRole('button', { name: '추가' });
    expect(submitBtn).toBeDisabled();
  });
});
