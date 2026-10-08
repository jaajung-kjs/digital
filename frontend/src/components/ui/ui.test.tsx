import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Button } from './Button';
import { Badge } from './Badge';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';
import { Tabs, useTabs } from './Tabs';
import { OverflowMenu, type OverflowMenuItem } from './OverflowMenu';
import { SELECTABLE } from './selection';
import { isCancelKey, isCommitKey } from './keyboard';
import { DetailCard, DetailCardHeader, DetailRow } from './DetailCard';

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

  /* 비활성은 **색을 죽인다** — 반투명(`opacity-50`)으로만 두면 흰 글자 대비가 2.73:1 로
     떨어지면서도 여전히 파란 주 버튼처럼 보여, 눌리지 않는 이유가 화면에 없었다. */
  it('applies disabled styles', () => {
    render(<Button disabled>비활성</Button>);
    const btn = screen.getByRole('button', { name: '비활성' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveClass('!bg-surface-3');
    expect(btn).toHaveClass('!text-content-faint');
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
  /* 업무화면의 상세는 **표**다 — 둥근 모서리·그림자·안쪽 여백 대신 1px 테두리와 칸 구분선.
     여백은 카드가 아니라 **줄**이 갖는다(라벨칸·값칸이 각자 padding 을 쓴다). */
  it('표준 상세 외형(1px 테두리 · 흰 면 · text-sm)으로 통일', () => {
    const { container } = render(<DetailCard>본문</DetailCard>);
    const card = container.firstChild as HTMLElement;
    for (const cls of ['border', 'border-line-strong', 'bg-surface', 'text-sm']) {
      expect(card).toHaveClass(cls);
    }
    /* 둥근 모서리는 쓰지 않는다 — 표와 칸이 맞닿는 화면에서 모서리가 어긋나 보인다. */
    expect(card.className).not.toMatch(/rounded-(lg|md|xl)/);
  });

  /* 라벨은 **회색 칸**이고 값은 흰 칸이다 — 라벨이 어디서 끝나는지가 화면마다 같아진다. */
  it('상세 한 줄은 라벨칸 + 값칸', () => {
    const { container } = render(<DetailRow label="이름" required>값</DetailRow>);
    const label = container.querySelector('label') as HTMLElement;
    expect(label).toHaveClass('bg-surface-2');
    expect(label).toHaveClass('border-r');
    /* 필수 별표는 한전 CI 레드 — 경고색과 쓰임이 다르다. */
    expect(container.querySelector('.text-required')).not.toBeNull();
  });

  /**
   * **줄이 아닌 내용도 여백을 갖는다.**
   *
   * 여백을 카드에서 걷고 줄에 준 뒤, 사진 격자·안내 문구·빈 상태처럼 줄이 아닌 내용이
   * 테두리에 딱 붙었다(사진 탭·기준정보에서 실제로 그랬다). 호출부마다 감싸는 상자를 두면
   * 새 카드를 만들 때마다 기억해야 하고 한 번 잊으면 그 화면만 붙는다 — 카드가 가려낸다.
   */
  it('줄·머리가 아닌 자식에는 카드가 여백을 준다', () => {
    const { container } = render(
      <DetailCard>
        <DetailCardHeader title="사진" />
        <DetailRow label="이름">값</DetailRow>
        <p>등록된 사진이 없습니다</p>
      </DetailCard>,
    );
    const card = container.firstChild as HTMLElement;
    /* 규칙은 **카드의 클래스**로 산다 — 자식을 고르는 선택자라 jsdom 에서 계산값이 안 나온다. */
    expect(card.className).toContain('[&>*:not([data-detail-row]):not([data-detail-head])]:px-2.5');
    /* 제 여백을 갖는 둘은 표를 달고 있어 그 규칙에서 빠진다. */
    expect(container.querySelector('[data-detail-head]')).not.toBeNull();
    expect(container.querySelector('[data-detail-row]')).not.toBeNull();
  });

  it('헤더는 제목 + 상태 배지(Badge)를 렌더', () => {
    render(<DetailCardHeader title="차단기 3" badge="연결" badgeStatus="success" />);
    expect(screen.getByText('차단기 3')).toBeInTheDocument();
    const badge = screen.getByText('연결');
    expect(badge).toHaveClass('text-success');
  });

  it('배지가 없으면 배지를 렌더하지 않는다', () => {
    render(<DetailCardHeader title="CB 1" />);
    expect(screen.getByText('CB 1')).toBeInTheDocument();
  });

  it('onEdit/onDelete 를 주면 수정·삭제 버튼을 렌더하고 호출한다', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<DetailCardHeader title="CB 1" onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('핸들러가 없으면 액션 버튼을 렌더하지 않는다', () => {
    render(<DetailCardHeader title="CB 1" />);
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('DetailRow 는 라벨(text-xs) + 값(text-sm 본문)', () => {
    render(
      <DetailCard>
        <DetailRow label="부하">복도등</DetailRow>
      </DetailCard>,
    );
    expect(screen.getByText('부하')).toHaveClass('text-xs');
    expect(screen.getByText('복도등')).toBeInTheDocument();
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

  /* 뒤에 깔린 화면들도 Esc 를 「고른 것 풀기」로 듣는다. 상자를 닫는 Esc 가 거기까지 닿으면
     상자가 닫히면서 고른 설비까지 풀려 상세 패널이 통째로 사라진다. 「떠 있는 상자가 있으면
     뒤는 듣지 않는다」로는 못 막는다 — 이 손짓 안에서 상자가 이미 지워지기 때문이다. */
  it('Esc 는 상자에서 끝난다 — 뒤에 깔린 화면까지 닿지 않는다', () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="제목">
        <p>본문</p>
      </Modal>,
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    window.removeEventListener('keydown', behind);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(behind).not.toHaveBeenCalled();
  });

  /* 「이름을 적는 상자」가 한 글자만 받고 멈췄다. `onClose` 가 그 자리에서 만들어지는 함수라
     부모가 다시 그려질 때마다 초점 effect 가 걷혔다 다시 섰고, 그때마다 초점을 머리줄의
     「닫기」로 끌고 갔다 — 두 번째 글자부터 아무 데도 들어가지 않고, 거기서 Enter 를 누르면
     상자가 닫혀 Esc 를 누른 것처럼 보였다. */
  it('글자를 쳐도 초점이 칸에 남는다 — 부모가 다시 그려져도', () => {
    function Host() {
      const [v, setV] = useState('');
      const [open, setOpen] = useState(true);
      return (
        <Modal open={open} onClose={() => setOpen(false)} title="본부 추가">
          <input aria-label="이름" autoFocus value={v} onChange={(e) => setV(e.target.value)} />
        </Modal>
      );
    }
    render(<Host />);
    const field = screen.getByLabelText('이름');
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: '중' } });
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: '중부' } });
    expect(document.activeElement).toBe(field);
    expect((field as HTMLInputElement).value).toBe('중부');
  });

  /* 닫히면 열기 전 자리로 돌아간다 — 안 그러면 body 로 튕겨 처음부터 다시 Tab 해야 한다.
     **다만 그 키를 다 쓴 뒤에** 돌려준다: 한 번의 키 누름은 `keydown → keypress → keyup` 한
     묶음인데, 상자를 닫는 일은 `keydown` 에서 일어난다. 그 안에서 초점을 옮기면 남은 조각을
     새 자리가 받는다 — Enter 로 추가하면 상자가 닫히고 초점이 「본부 추가」 단추로 간 뒤 같은
     Enter 의 `keypress` 가 그 단추를 눌러 빈 상자가 곧바로 다시 열렸다. */
  it('닫히면 초점이 상자를 연 자리로 돌아간다 — 그 키를 다 쓴 뒤에', async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>본부 추가</button>
          <Modal open={open} onClose={() => setOpen(false)} title="본부 추가">
            <input aria-label="이름" autoFocus />
          </Modal>
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: '본부 추가' });
    opener.focus();
    fireEvent.click(opener);
    const field = screen.getByLabelText('이름');
    expect(document.activeElement).toBe(field);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    // 상자를 닫은 그 키가 아직 끝나지 않았다 — 이 순간 단추가 초점을 갖고 있으면 안 된다.
    expect(document.activeElement).not.toBe(opener);
    await waitFor(() => expect(document.activeElement).toBe(opener));
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

/* 바깥을 **누르면** 닫는다 — 뗄 때가 아니라. `click` 은 누른 자리와 뗀 자리의 공통 조상에서
   나므로, 상자 안 글자를 끌어 고르다 바깥에서 손을 떼면 적던 것이 통째로 날아갔다. */
describe('Modal — 바깥 누름', () => {
  const down = (el: Element) =>
    fireEvent(el, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));

  it('바깥을 누르면 닫는다', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="제목"><p>본문</p></Modal>);
    down(document.querySelector('[data-modal-overlay]')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('안에서 눌러 바깥에서 떼는 것은 「바깥 누름」이 아니다', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="제목">
        <input aria-label="이름" defaultValue="적던 값" />
      </Modal>,
    );
    down(screen.getByLabelText('이름'));
    // 글자를 끌어 고르다 백드롭에서 손을 뗀다 → 브라우저는 공통 조상에 click 을 떨어뜨린다.
    fireEvent.click(document.querySelector('[data-modal-overlay]')!);
    expect(onClose).not.toHaveBeenCalled();
  });
});

/* 열자마자 「닫기」가 초점을 쥐고 있으면 Enter 한 번에 상자가 사라진다. 상자 자신이 받고,
   커서를 어디 둘지는 내용이 말한다(Radix `DialogContent` 기본값). */
describe('Modal — 초점과 잠금', () => {
  it('내용이 초점을 안 잡으면 상자 자신이 받는다 — 「닫기」가 아니라', () => {
    render(<Modal open onClose={() => {}} title="제목"><p>본문</p></Modal>);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  /* Tab 을 순환시키는 것만으로는 뒤 화면을 못 막는다 — 주소창을 찍었다 돌아오면 초점은
     문서 맨 앞에서 다시 시작한다. 뒤 화면을 통째로 들어낸다. */
  it('열려 있는 동안 뒤 화면은 inert 다', () => {
    const { unmount } = render(<Modal open onClose={() => {}} title="제목"><p>본문</p></Modal>);
    const overlay = document.querySelector('[data-modal-overlay]')!;
    const others = [...document.body.children].filter((c) => c !== overlay);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((c) => (c as HTMLElement).inert)).toBe(true);
    unmount();
    expect([...document.body.children].every((c) => !(c as HTMLElement).inert)).toBe(true);
  });
});

/* 묻는 상자에서 Enter·Space 는 반사적으로 눌린다 — 지우는 상자에서 그 반사가 삭제가 되면
   안 된다(APG: 가장 덜 파괴적인 곳에 초점). */
describe('ConfirmModal', () => {
  const props = { open: true, title: '조직 삭제', target: '판암변전소', message: '되돌릴 수 없습니다.' };

  it('되돌릴 수 없는 물음은 alertdialog 이고 본문이 함께 읽힌다', () => {
    render(<ConfirmModal {...props} danger confirmLabel="삭제" onConfirm={() => {}} onClose={() => {}} />);
    const box = screen.getByRole('alertdialog');
    const described = document.getElementById(box.getAttribute('aria-describedby')!);
    expect(described?.textContent).toContain('되돌릴 수 없습니다.');
    expect(described?.textContent).toContain('판암변전소');
  });

  it('지우는 물음은 「취소」가 초점을 받는다', () => {
    render(<ConfirmModal {...props} danger confirmLabel="삭제" onConfirm={() => {}} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' }));
  });

  it('되돌릴 수 있는 물음은 「확인」이 초점을 받는다', () => {
    render(<ConfirmModal {...props} onConfirm={() => {}} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '확인' }));
  });
});

/* 탭 줄은 **하나의 정거장**이다(§1.7-k, APG Tabs) — Tab 은 한 번만 서고 안은 화살표로 옮긴다. */
describe('Tabs', () => {
  const items = [{ key: 'a', label: '정보' }, { key: 'b', label: '사진' }, { key: 'c', label: '연결' }] as const;

  function Host() {
    const [v, setV] = useState<'a' | 'b' | 'c'>('a');
    const t = useTabs(v);
    return (
      <>
        <Tabs {...t.list} items={items} onChange={setV} />
        <div {...t.panel}>{v} 내용</div>
      </>
    );
  }

  it('Tab 이 서는 자리는 고른 탭 하나뿐이다', () => {
    render(<Host />);
    const stops = screen.getAllByRole('tab').filter((t) => t.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveTextContent('정보');
  });

  it('→ 로 다음 탭이 열리고 초점도 함께 간다', () => {
    render(<Host />);
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(screen.getAllByRole('tab')[1]);
  });

  /* 화면으로 보는 사람에게는 탭 바로 아래가 그 내용이라는 것이 자명하지만, 못 보는 사람에게는
     그 자명함이 없다 — 이어 두지 않으면 「탭」이라고만 읽히고 무엇을 여는지는 말해 주지 못한다. */
  it('탭과 그 내용이 서로를 가리킨다', () => {
    render(<Host />);
    const tab = screen.getAllByRole('tab')[0]!;
    const panel = screen.getByRole('tabpanel');
    expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
  });

  it('탭을 옮기면 내용도 그 탭을 가리킨다', () => {
    render(<Host />);
    fireEvent.keyDown(screen.getAllByRole('tab')[0]!, { key: 'ArrowRight' });
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(screen.getAllByRole('tab')[1]!.id);
    expect(screen.getAllByRole('tab')[1]!.getAttribute('aria-controls')).toBe(panel.id);
  });

  /* 이름이 곧 탭이므로 고치는 자리도 탭이다 — 상자를 띄우면 무엇의 이름을 고치는 중인지
     화면에서 사라진다(시트 탭 어법: Excel·AutoCAD 배치·Figma 페이지). */
  describe('시트 탭 어법 — 이름과 메뉴', () => {
    function Editable({ onRename, menu }: { onRename?: (n: string) => void; menu?: OverflowMenuItem[] }) {
      const [v, setV] = useState<'a' | 'b'>('a');
      const t = useTabs(v);
      return (
        <Tabs
          {...t.list}
          items={[{ key: 'a', label: '1층', onRename, menu }, { key: 'b', label: '2층' }]}
          onChange={setV}
        />
      );
    }

    it('탭을 두 번 누르면 그 자리에 이름 칸이 선다', () => {
      const onRename = vi.fn();
      render(<Editable onRename={onRename} />);
      fireEvent.doubleClick(screen.getByRole('tab', { name: /1층/ }));
      const field = screen.getByLabelText('1층 이름');
      expect(field).toHaveFocus();
      fireEvent.change(field, { target: { value: '지하1층' } });
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(onRename).toHaveBeenCalledWith('지하1층');
    });

    it('고칠 수 없는 탭은 두 번 눌러도 칸이 서지 않는다', () => {
      render(<Editable />);
      fireEvent.doubleClick(screen.getByRole('tab', { name: /1층/ }));
      expect(screen.queryByLabelText('1층 이름')).not.toBeInTheDocument();
    });

    /* `⋯` 는 **tablist 밖**에 선다 — 탭 목록에는 탭만 담긴다(APG). */
    it('열린 탭에만 ⋯ 가 서고, 그 안에 「이름 변경」이 있다', () => {
      render(<Editable onRename={() => {}} menu={[{ label: '층 삭제', danger: true, onSelect: () => {} }]} />);
      const menuButton = screen.getByRole('button', { name: '1층 더 보기' });
      expect(within(screen.getByRole('tablist')).queryByRole('button', { name: '1층 더 보기' })).toBeNull();
      fireEvent.click(menuButton);
      expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['이름 변경', '층 삭제']);
      fireEvent.click(screen.getByRole('menuitem', { name: '이름 변경' }));
      expect(screen.getByLabelText('1층 이름')).toBeInTheDocument();
    });
  });

  it('끝에서 반대쪽으로 감는다', () => {
    render(<Host />);
    fireEvent.keyDown(screen.getAllByRole('tab')[0]!, { key: 'ArrowLeft' });
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true');
  });
});

/* 메뉴 단추(APG): 열면 초점이 안으로 들어가고, Esc 로 닫으면 `⋯` 로 돌아온다. 없으면 열어
   놓고 갈 데가 없다 — Tab 은 메뉴를 지나쳐 뒤 화면으로 가 버린다. */
describe('OverflowMenu', () => {
  const items = [
    { label: '품목 삭제', onSelect: () => {}, danger: true },
    { label: '복제', onSelect: () => {} },
  ];

  it('열면 첫 항목이 초점을 받고 ↓ 로 옮긴다', () => {
    render(<OverflowMenu items={items} />);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    const entries = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(entries[0]);
    fireEvent.keyDown(entries[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(entries[1]);
  });

  it('Esc 로 닫으면 초점이 ⋯ 로 돌아온다', () => {
    render(<OverflowMenu items={items} />);
    const trigger = screen.getByRole('button', { name: '더 보기' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0]!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('isCancelKey', () => {
  const esc = () => new KeyboardEvent('keydown', { key: 'Escape' });

  it('Esc 는 「지금 하던 것을 물린다」', () => {
    expect(isCancelKey(esc())).toBe(true);
  });

  /* 상자가 떠 있으면 Esc 는 그 상자의 것이다. 예전에는 뒤에 깔린 화면들도 같은 키를 들어서,
     (옛) 구성 격자에서 장비 상자를 닫으면 고른 설비까지 함께 풀려 상세 패널이 사라졌다. */
  it('대화상자가 떠 있으면 뒤에 깔린 화면은 Esc 를 듣지 않는다', () => {
    render(
      <Modal open onClose={() => {}} title="제목">
        <p>본문</p>
      </Modal>,
    );
    expect(isCancelKey(esc())).toBe(false);
  });
});

/* 한글을 치다 Enter 를 누르면 keydown 이 **두 번** 온다: 조합을 끝내는 Enter 와 진짜 Enter.
   가리지 않으면 한 번 누른 것이 두 번 실행된다 — 층을 만들면 「이미 같은 이름이 있습니다」가
   뜨는데 층은 만들어져 있었다(첫 요청 성공, 둘째가 409). */
describe('isCommitKey', () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { key: 'Enter', ...init });

  it('그냥 Enter 는 확정이다', () => {
    expect(isCommitKey(key({}))).toBe(true);
  });

  it('조합을 끝내는 Enter 는 확정이 아니다', () => {
    expect(isCommitKey(key({ isComposing: true }))).toBe(false);
  });

  it('`keyCode` 229 로만 알리는 브라우저도 가린다', () => {
    expect(isCommitKey(key({ keyCode: 229 }))).toBe(false);
  });

  it('Enter 가 아니면 확정이 아니다', () => {
    expect(isCommitKey(key({ key: 'a' }))).toBe(false);
  });

  /* React 합성 이벤트는 `isComposing` 을 겉으로 내주지 않는다 — `nativeEvent` 를 봐야 한다. */
  it('React 합성 이벤트 모양도 받는다', () => {
    expect(isCommitKey({ key: 'Enter', nativeEvent: key({ isComposing: true }) })).toBe(false);
    expect(isCommitKey({ key: 'Enter', nativeEvent: key({}) })).toBe(true);
  });
});

/* 조합 중인 Esc 는 IME 의 것이다 — 한글을 물리려고 누른 것이 상자까지 닫으면 안 된다. */
describe('Modal — 조합 중인 Esc', () => {
  it('조합 중이면 닫지 않는다', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="제목"><input aria-label="이름" /></Modal>);
    fireEvent.keyDown(screen.getByLabelText('이름'), { key: 'Escape', isComposing: true });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('이름'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SELECTABLE', () => {
  it('고를 수 있는 줄은 글자가 선택되지 않는다', () => {
    /* 다시 누르는 것이 뜻을 갖는 줄들이다(가지는 접히고 잎은 놓인다). 연달아 두 번 누르면
       브라우저가 더블클릭으로 읽고 줄의 글자를 잡아, 접었다 펴면 파랗게 잡힌 채로 열렸다. */
    expect(SELECTABLE).toContain('select-none');
  });
});

import { BusyOverlay } from './BusyOverlay';
import { PageState } from './PageState';
import { ListItemRow } from './ListRow';

describe('BusyOverlay', () => {
  it('바쁜 동안은 덮개가 서고 감싼 판은 inert 다 — 칸에 닿지 못한다', () => {
    const { rerender } = render(<BusyOverlay busy={false} label="저장 중…"><input aria-label="이름" /></BusyOverlay>);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('busy-scope').inert).toBe(false);
    rerender(<BusyOverlay busy label="저장 중…"><input aria-label="이름" /></BusyOverlay>);
    expect(screen.getByRole('status')).toHaveTextContent('저장 중…');
    expect(screen.getByTestId('busy-scope').inert).toBe(true);
    expect(screen.getByTestId('busy-scope')).toContainElement(screen.getByLabelText('이름'));
    rerender(<BusyOverlay busy={false} label="저장 중…"><input aria-label="이름" /></BusyOverlay>);
    expect(screen.getByTestId('busy-scope').inert).toBe(false);
  });
});

describe('PageState', () => {
  it('못 읽었으면 까닭과 다시 해 볼 길을 함께 보인다', () => {
    const retry = vi.fn();
    render(<PageState error="변전소를 불러오지 못했습니다" action={<Button onClick={retry}>다시 시도</Button>} />);
    expect(screen.getByRole('alert')).toHaveTextContent('변전소를 불러오지 못했습니다');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalled();
  });
  it('읽는 중에는 단추를 두지 않는다', () => {
    render(<PageState action={<Button>다시 시도</Button>} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ListItemRow', () => {
  it('칸들과 손잡이를 한 줄에 둔다', () => {
    render(<ListItemRow actions={<Button>지우기</Button>}><span>회로 1</span></ListItemRow>);
    expect(screen.getByText('회로 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지우기' })).toBeInTheDocument();
  });
});
