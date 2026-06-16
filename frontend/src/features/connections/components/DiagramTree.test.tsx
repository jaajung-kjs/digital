import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiagramTree } from './DiagramTree';
import type { DiagramNode } from '../connectionDiagram';

const leaf = (label: string, extra: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id: label, label, kind: 'asset', isSelf: false, isOrigin: false, edgeFiber: false, children: [], ...extra });

describe('DiagramTree', () => {
  it('분기 노드 자식을 렌더(충전기 → 피더 → {부하1,부하2})', () => {
    const root: DiagramNode = leaf('충전기', { isOrigin: true, children: [
      leaf('피더', { children: [leaf('부하1', { isSelf: true }), leaf('부하2')] }),
    ] });
    render(<DiagramTree root={root} />);
    expect(screen.getByText('충전기')).toBeInTheDocument();
    expect(screen.getByText('부하1')).toBeInTheDocument();
    expect(screen.getByText('부하2')).toBeInTheDocument();
  });
  it('self 노드는 강조 클래스(font-medium), boundary 는 점선 표시', () => {
    const root = leaf('단말광1', { isSelf: true, children: [leaf('남춘천', { kind: 'boundary' })] });
    render(<DiagramTree root={root} />);
    expect(screen.getByText('단말광1').className).toContain('font-medium');
    expect(screen.getByText('남춘천').className).toContain('border-dashed');
  });
});
