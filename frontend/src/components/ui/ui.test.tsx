import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';
import { Badge } from './Badge';
import { Modal } from './Modal';
import { DetailCard, DetailCardHeader, DetailRow, DetailNote } from './DetailCard';

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

describe('DetailCard', () => {
  it('표준 카드 외형(rounded-lg/border-line/bg-surface/p-3/text-sm)으로 통일', () => {
    const { container } = render(<DetailCard>본문</DetailCard>);
    const card = container.firstChild as HTMLElement;
    for (const cls of ['rounded-lg', 'border-line', 'bg-surface', 'p-3', 'text-sm']) {
      expect(card).toHaveClass(cls);
    }
  });

  it('헤더는 제목 + 상태 배지(Badge)를 렌더', () => {
    render(<DetailCardHeader title="포트 3" badge="양측" badgeStatus="success" />);
    expect(screen.getByText('포트 3')).toBeInTheDocument();
    const badge = screen.getByText('양측');
    expect(badge).toHaveClass('text-success');
  });

  it('배지가 없으면 배지를 렌더하지 않는다', () => {
    render(<DetailCardHeader title="CB 1" />);
    expect(screen.getByText('CB 1')).toBeInTheDocument();
  });

  it('DetailRow 는 라벨(text-xs) + 값(text-sm 본문), DetailNote 는 보조설명', () => {
    render(
      <DetailCard>
        <DetailRow label="부하">복도등</DetailRow>
        <DetailNote>안내</DetailNote>
      </DetailCard>,
    );
    expect(screen.getByText('부하')).toHaveClass('text-xs');
    expect(screen.getByText('복도등')).toBeInTheDocument();
    expect(screen.getByText('안내')).toHaveClass('text-xs');
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
