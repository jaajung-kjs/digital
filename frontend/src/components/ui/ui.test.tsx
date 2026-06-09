import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';
import { Badge } from './Badge';
import { Modal } from './Modal';

describe('Button', () => {
  it('renders primary variant by default', () => {
    render(<Button>저장</Button>);
    const btn = screen.getByRole('button', { name: '저장' });
    expect(btn).toHaveClass('bg-primary');
    expect(btn).toHaveClass('text-white');
  });

  it('renders danger variant', () => {
    render(<Button variant="danger">삭제</Button>);
    expect(screen.getByRole('button', { name: '삭제' })).toHaveClass('bg-danger');
  });

  it('applies disabled styles', () => {
    render(<Button disabled>비활성</Button>);
    const btn = screen.getByRole('button', { name: '비활성' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveClass('opacity-50');
    expect(btn).toHaveClass('cursor-not-allowed');
  });
});

describe('Badge', () => {
  it('renders neutral by default', () => {
    render(<Badge>중립</Badge>);
    const el = screen.getByText('중립');
    expect(el).toHaveClass('bg-surface-2');
    expect(el).toHaveClass('text-content-muted');
  });

  it('renders success status', () => {
    render(<Badge status="success">정상</Badge>);
    const el = screen.getByText('정상');
    expect(el).toHaveClass('bg-success-bg');
    expect(el).toHaveClass('text-success');
  });

  it('renders danger status', () => {
    render(<Badge status="danger">오류</Badge>);
    const el = screen.getByText('오류');
    expect(el).toHaveClass('bg-danger-bg');
    expect(el).toHaveClass('text-danger');
  });
});

describe('Modal', () => {
  it('renders children when open', () => {
    render(
      <Modal open onClose={() => {}} title="제목">
        <p>본문 내용</p>
      </Modal>,
    );
    expect(screen.getByText('본문 내용')).toBeInTheDocument();
    expect(screen.getByText('제목')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="제목">
        <p>본문 내용</p>
      </Modal>,
    );
    expect(screen.queryByText('본문 내용')).not.toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="제목">
        <p>본문</p>
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
