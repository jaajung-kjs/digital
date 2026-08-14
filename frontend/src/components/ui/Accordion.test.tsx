/**
 * Accordion — **한 번에 하나만 펼친다**, 그리고 접힌 것은 **그리지 않는다**.
 *
 * 두 번째가 회귀로 깨지기 쉽다: `hidden` 으로 감추기만 해도 화면은 같아 보이지만, 그러면
 * 포트 판 열두 장이 그대로 DOM 에 남아 정작 고치려던 것(개수에 비례해 무거워지는 패널)이
 * 그대로다. 그래서 「보이나」가 아니라 「있나」를 본다.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Accordion, type AccordionSection } from './Accordion';

const SECTIONS: AccordionSection[] = [
  { key: 'a', title: '광단말 A', badge: '3/16 연결', body: <p>판 A</p> },
  { key: 'b', title: '광단말 B', badge: '0/16 연결', body: <p>판 B</p> },
  { key: 'c', title: '방화벽', badge: '1/2 연결', body: <p>판 C</p> },
];

/** 부르는 쪽이 `openKey` 를 쥐는 컴포넌트라, 테스트에서도 그 자리를 만들어 준다. */
function Harness({ initial = 'a' }: { initial?: string | null }) {
  const [open, setOpen] = useState<string | null>(initial);
  return <Accordion sections={SECTIONS} openKey={open} onOpenChange={setOpen} />;
}

describe('Accordion', () => {
  it('펼친 구획의 것만 그린다 — 나머지는 DOM 에 없다', () => {
    render(<Harness />);
    expect(screen.getByText('판 A')).toBeInTheDocument();
    expect(screen.queryByText('판 B')).not.toBeInTheDocument();
    expect(screen.queryByText('판 C')).not.toBeInTheDocument();
  });

  it('접혀 있어도 머리줄은 남는다 — 그 줄이 곧 목록이다(이름 + 요약)', () => {
    render(<Harness />);
    for (const s of SECTIONS) expect(screen.getByText(String(s.title))).toBeInTheDocument();
    // 펴 보지 않고도 고를 수 있게 하는 값
    expect(screen.getByText('0/16 연결')).toBeInTheDocument();
  });

  it('다른 머리줄을 누르면 그것만 펼쳐진다 — 둘이 함께 열리지 않는다', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /방화벽/ }));
    expect(screen.getByText('판 C')).toBeInTheDocument();
    expect(screen.queryByText('판 A')).not.toBeInTheDocument();
  });

  it('펼친 것을 다시 누르면 접힌다 — 앱 공통 「다시 누르면 풀린다」', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /광단말 A/ }));
    expect(screen.queryByText('판 A')).not.toBeInTheDocument();
  });

  it('머리줄이 제 몸통을 가리킨다 — aria-expanded / aria-controls', () => {
    render(<Harness />);
    const openHeader = screen.getByRole('button', { name: /광단말 A/ });
    expect(openHeader).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /광단말 B/ })).toHaveAttribute('aria-expanded', 'false');

    const region = screen.getByRole('region');
    expect(openHeader.getAttribute('aria-controls')).toBe(region.getAttribute('id'));
    expect(region.getAttribute('aria-labelledby')).toBe(openHeader.getAttribute('id'));
  });

  it('전부 접힌 상태(openKey=null)도 그린다 — 머리줄만 남는다', () => {
    render(<Harness initial={null} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(SECTIONS.length);
  });

  it('누른 구획의 key 를 그대로 돌려준다', () => {
    const onOpenChange = vi.fn();
    render(<Accordion sections={SECTIONS} openKey="a" onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: /광단말 B/ }));
    expect(onOpenChange).toHaveBeenCalledWith('b');
    // 펼친 것을 누르면 「접어라」가 간다
    fireEvent.click(screen.getByRole('button', { name: /광단말 A/ }));
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });
});
