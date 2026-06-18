import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidePanel } from './SidePanel';

describe('SidePanel', () => {
  it('renders the title and children', () => {
    render(
      <SidePanel title="설계서 (미리보기)" onClose={() => {}}>
        <div>본문</div>
      </SidePanel>,
    );
    expect(screen.getByText('설계서 (미리보기)')).toBeInTheDocument();
    expect(screen.getByText('본문')).toBeInTheDocument();
  });

  it('renders headerExtra next to the title', () => {
    render(
      <SidePanel title="상세" headerExtra={<span>뱃지</span>} onClose={() => {}}>
        <div />
      </SidePanel>,
    );
    expect(screen.getByText('뱃지')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <SidePanel title="x" onClose={onClose}>
        <div />
      </SidePanel>,
    );
    fireEvent.click(screen.getByLabelText('닫기'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when ESC is pressed', () => {
    const onClose = vi.fn();
    render(
      <SidePanel title="x" onClose={onClose}>
        <div />
      </SidePanel>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores ESC while a fixed-inset overlay (modal/lightbox) is open', () => {
    const onClose = vi.fn();
    render(
      <>
        <div className="fixed inset-0 z-modal">modal</div>
        <SidePanel title="x" onClose={onClose}>
          <div />
        </SidePanel>
      </>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("right side applies right positioning and right slide animation", () => {
    const { container } = render(
      <SidePanel side="right" title="x" onClose={() => {}}>
        <div />
      </SidePanel>,
    );
    const panel = container.querySelector('[data-side="right"]')!;
    expect(panel).toHaveClass('right-0');
    expect(panel).toHaveClass('border-l');
    expect(panel).toHaveClass('animate-slide-in-right');
  });

  it("left side applies left positioning and left slide animation", () => {
    const { container } = render(
      <SidePanel side="left" title="x" onClose={() => {}}>
        <div />
      </SidePanel>,
    );
    const panel = container.querySelector('[data-side="left"]')!;
    expect(panel).toHaveClass('left-0');
    expect(panel).toHaveClass('border-r');
    expect(panel).toHaveClass('animate-slide-in-left');
  });

  it('applies the width style', () => {
    const { container } = render(
      <SidePanel title="x" width={300} onClose={() => {}}>
        <div />
      </SidePanel>,
    );
    const panel = container.querySelector('[data-side="right"]') as HTMLElement;
    expect(panel.style.width).toBe('300px');
  });
});
