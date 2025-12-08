import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FloorPlanEditorPage } from '../pages/FloorPlanEditorPage';
import * as api from '../utils/api';
import type { FloorDetail } from '../types';
import type { FloorPlanDetail } from '../types/floorPlan';

// Mock API module
vi.mock('../utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  getErrorMessage: vi.fn((error) => error?.message || 'Unknown error'),
}));

// Mock auth store
vi.mock('../stores/authStore', () => ({
  useIsAdmin: () => true,
}));

// Test data
const mockFloor: FloorDetail = {
  id: 'floor-1',
  substationId: 'substation-1',
  name: 'B1층',
  level: -1,
  height: 3.5,
  description: 'Test floor',
  floorPlanId: 'plan-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockFloorPlan: FloorPlanDetail = {
  id: 'plan-1',
  floorId: 'floor-1',
  name: 'B1층 평면도',
  canvasWidth: 2000,
  canvasHeight: 1500,
  gridSize: 20,
  backgroundColor: '#FFFFFF',
  elements: [],
  racks: [],
  version: 1,
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('FloorPlanEditorPage - Tool Selection', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(api.api.get).mockImplementation((url: string) => {
      if (url.includes('/floors/floor-1/floor-plan')) {
        return Promise.resolve({ data: { data: mockFloorPlan } });
      }
      if (url.includes('/floors/floor-1')) {
        return Promise.resolve({ data: { data: mockFloor } });
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  const renderEditor = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/floors/floor-1/floor-plan']}>
          <Routes>
            <Route path="/floors/:floorId/floor-plan" element={<FloorPlanEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('should render editor with default select tool active', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const selectButton = screen.getByTitle('선택 (V)');
    expect(selectButton).toHaveClass('bg-blue-100');
  });

  it('should switch to wall tool when wall button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const wallButton = screen.getByTitle('벽 (W)');
    fireEvent.click(wallButton);

    expect(wallButton).toHaveClass('bg-blue-100');
    expect(screen.getByText(/벽 그리기 중/)).toBeInTheDocument();
  });

  it('should switch to door tool when door button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const doorButton = screen.getByTitle(/문 \(D\)/);
    fireEvent.click(doorButton);

    expect(doorButton).toHaveClass('bg-blue-100');
    expect(screen.getByText(/회전:/)).toBeInTheDocument();
  });

  it('should switch to window tool when window button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const windowButton = screen.getByTitle(/창문 \(N\)/);
    fireEvent.click(windowButton);

    expect(windowButton).toHaveClass('bg-blue-100');
  });

  it('should switch to column tool when column button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const columnButton = screen.getByTitle('기둥 (C)');
    fireEvent.click(columnButton);

    expect(columnButton).toHaveClass('bg-blue-100');
  });

  it('should switch to rack tool when rack button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const rackButton = screen.getByTitle('랙 (R)');
    fireEvent.click(rackButton);

    expect(rackButton).toHaveClass('bg-blue-100');
  });

  it('should switch to delete tool when delete button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const deleteButton = screen.getByTitle('삭제 (Delete)');
    fireEvent.click(deleteButton);

    expect(deleteButton).toHaveClass('bg-blue-100');
  });

  it('should switch tools using keyboard shortcuts', async () => {
    renderEditor();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Press 'w' for wall
    await user.keyboard('w');
    expect(screen.getByTitle('벽 (W)')).toHaveClass('bg-blue-100');

    // Press 'd' for door
    await user.keyboard('d');
    expect(screen.getByTitle(/문 \(D\)/)).toHaveClass('bg-blue-100');

    // Press 'v' for select
    await user.keyboard('v');
    expect(screen.getByTitle('선택 (V)')).toHaveClass('bg-blue-100');
  });
});

describe('FloorPlanEditorPage - Element Creation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(api.api.get).mockImplementation((url: string) => {
      if (url.includes('/floors/floor-1/floor-plan')) {
        return Promise.resolve({ data: { data: mockFloorPlan } });
      }
      if (url.includes('/floors/floor-1')) {
        return Promise.resolve({ data: { data: mockFloor } });
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  const renderEditor = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/floors/floor-1/floor-plan']}>
          <Routes>
            <Route path="/floors/:floorId/floor-plan" element={<FloorPlanEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('should create wall element with two clicks', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Select wall tool
    const wallButton = screen.getByTitle('벽 (W)');
    fireEvent.click(wallButton);

    // Get canvas element
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeTruthy();

    // First click to start wall
    fireEvent.click(canvas!, { clientX: 100, clientY: 100 });

    // Second click to complete wall
    fireEvent.click(canvas!, { clientX: 200, clientY: 100 });

    // Wall should be created (check for changes indicator)
    await waitFor(() => {
      const saveButton = screen.getByText('저장');
      expect(saveButton).not.toHaveClass('bg-gray-100');
    });
  });

  it('should create door element with single click', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Select door tool
    const doorButton = screen.getByTitle(/문 \(D\)/);
    fireEvent.click(doorButton);

    // Click canvas to create door
    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 150, clientY: 150 });

    // Door should be created
    await waitFor(() => {
      const saveButton = screen.getByText('저장');
      expect(saveButton).not.toHaveClass('bg-gray-100');
    });
  });

  it('should create window element with single click', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Select window tool
    const windowButton = screen.getByTitle(/창문 \(N\)/);
    fireEvent.click(windowButton);

    // Click canvas to create window
    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 150, clientY: 150 });

    // Window should be created
    await waitFor(() => {
      const saveButton = screen.getByText('저장');
      expect(saveButton).not.toHaveClass('bg-gray-100');
    });
  });

  it('should create column element with single click', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Select column tool
    const columnButton = screen.getByTitle('기둥 (C)');
    fireEvent.click(columnButton);

    // Click canvas to create column
    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 150, clientY: 150 });

    // Column should be created
    await waitFor(() => {
      const saveButton = screen.getByText('저장');
      expect(saveButton).not.toHaveClass('bg-gray-100');
    });
  });

  it('should show rack modal when rack tool is clicked on canvas', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Select rack tool
    const rackButton = screen.getByTitle('랙 (R)');
    fireEvent.click(rackButton);

    // Click canvas to trigger rack modal
    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 150, clientY: 150 });

    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText('랙 추가')).toBeInTheDocument();
    });
  });

  it('should rotate door preview when Q is pressed', async () => {
    renderEditor();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Select door tool
    const doorButton = screen.getByTitle(/문 \(D\)/);
    fireEvent.click(doorButton);

    // Initial rotation should be 0
    expect(screen.getByText(/회전: 0°/)).toBeInTheDocument();

    // Press Q to rotate
    await user.keyboard('q');
    expect(screen.getByText(/회전: 90°/)).toBeInTheDocument();

    // Press Q again
    await user.keyboard('q');
    expect(screen.getByText(/회전: 180°/)).toBeInTheDocument();
  });
});

describe('FloorPlanEditorPage - Undo/Redo', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(api.api.get).mockImplementation((url: string) => {
      if (url.includes('/floors/floor-1/floor-plan')) {
        return Promise.resolve({ data: { data: mockFloorPlan } });
      }
      if (url.includes('/floors/floor-1')) {
        return Promise.resolve({ data: { data: mockFloor } });
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  const renderEditor = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/floors/floor-1/floor-plan']}>
          <Routes>
            <Route path="/floors/:floorId/floor-plan" element={<FloorPlanEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('should have undo button disabled initially', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const undoButton = screen.getByTitle('실행 취소 (Ctrl+Z)');
    expect(undoButton).toBeDisabled();
  });

  it('should enable undo after creating element', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Create a column
    const columnButton = screen.getByTitle('기둥 (C)');
    fireEvent.click(columnButton);

    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 150, clientY: 150 });

    // Undo button should be enabled
    await waitFor(() => {
      const undoButton = screen.getByTitle('실행 취소 (Ctrl+Z)');
      expect(undoButton).not.toBeDisabled();
    });
  });

  it('should undo element creation when undo button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Create a column
    const columnButton = screen.getByTitle('기둥 (C)');
    fireEvent.click(columnButton);

    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 150, clientY: 150 });

    // Wait for undo to be enabled
    await waitFor(() => {
      const undoButton = screen.getByTitle('실행 취소 (Ctrl+Z)');
      expect(undoButton).not.toBeDisabled();
    });

    // Click undo
    const undoButton = screen.getByTitle('실행 취소 (Ctrl+Z)');
    fireEvent.click(undoButton);

    // Undo should be disabled again
    await waitFor(() => {
      expect(undoButton).toBeDisabled();
    });
  });

  it('should redo after undo', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Create element
    const columnButton = screen.getByTitle('기둥 (C)');
    fireEvent.click(columnButton);

    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 150, clientY: 150 });

    // Wait for undo to be enabled
    await waitFor(() => {
      const undoButton = screen.getByTitle('실행 취소 (Ctrl+Z)');
      expect(undoButton).not.toBeDisabled();
    });

    // Undo
    const undoButton = screen.getByTitle('실행 취소 (Ctrl+Z)');
    fireEvent.click(undoButton);

    // Redo should be enabled
    await waitFor(() => {
      const redoButton = screen.getByTitle('다시 실행 (Ctrl+Y)');
      expect(redoButton).not.toBeDisabled();
    });

    // Click redo
    const redoButton = screen.getByTitle('다시 실행 (Ctrl+Y)');
    fireEvent.click(redoButton);

    // Redo should be disabled
    await waitFor(() => {
      expect(redoButton).toBeDisabled();
    });
  });

  it('should support Ctrl+Z keyboard shortcut for undo', async () => {
    renderEditor();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Create element
    const columnButton = screen.getByTitle('기둥 (C)');
    fireEvent.click(columnButton);

    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 150, clientY: 150 });

    // Press Ctrl+Z
    await user.keyboard('{Control>}z{/Control}');

    // Undo button should be disabled
    await waitFor(() => {
      const undoButton = screen.getByTitle('실행 취소 (Ctrl+Z)');
      expect(undoButton).toBeDisabled();
    });
  });
});

describe('FloorPlanEditorPage - Zoom and Pan', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(api.api.get).mockImplementation((url: string) => {
      if (url.includes('/floors/floor-1/floor-plan')) {
        return Promise.resolve({ data: { data: mockFloorPlan } });
      }
      if (url.includes('/floors/floor-1')) {
        return Promise.resolve({ data: { data: mockFloor } });
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  const renderEditor = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/floors/floor-1/floor-plan']}>
          <Routes>
            <Route path="/floors/:floorId/floor-plan" element={<FloorPlanEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('should start with 100% zoom', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should zoom in when plus button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const zoomInButton = screen.getAllByRole('button').find(btn =>
      btn.querySelector('path[d="M12 4v16m8-8H4"]')
    );

    expect(zoomInButton).toBeTruthy();
    fireEvent.click(zoomInButton!);

    await waitFor(() => {
      expect(screen.getByText('110%')).toBeInTheDocument();
    });
  });

  it('should zoom out when minus button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const zoomOutButton = screen.getAllByRole('button').find(btn =>
      btn.querySelector('path[d="M20 12H4"]')
    );

    expect(zoomOutButton).toBeTruthy();
    fireEvent.click(zoomOutButton!);

    await waitFor(() => {
      expect(screen.getByText('90%')).toBeInTheDocument();
    });
  });

  it('should not zoom below 25%', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const zoomOutButton = screen.getAllByRole('button').find(btn =>
      btn.querySelector('path[d="M20 12H4"]')
    );

    // Click zoom out multiple times
    for (let i = 0; i < 10; i++) {
      fireEvent.click(zoomOutButton!);
    }

    await waitFor(() => {
      expect(screen.getByText('25%')).toBeInTheDocument();
    });
  });

  it('should not zoom above 400%', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const zoomInButton = screen.getAllByRole('button').find(btn =>
      btn.querySelector('path[d="M12 4v16m8-8H4"]')
    );

    // Click zoom in multiple times
    for (let i = 0; i < 35; i++) {
      fireEvent.click(zoomInButton!);
    }

    await waitFor(() => {
      expect(screen.getByText('400%')).toBeInTheDocument();
    });
  });
});

describe('FloorPlanEditorPage - Grid Snap', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(api.api.get).mockImplementation((url: string) => {
      if (url.includes('/floors/floor-1/floor-plan')) {
        return Promise.resolve({ data: { data: mockFloorPlan } });
      }
      if (url.includes('/floors/floor-1')) {
        return Promise.resolve({ data: { data: mockFloor } });
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  const renderEditor = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/floors/floor-1/floor-plan']}>
          <Routes>
            <Route path="/floors/:floorId/floor-plan" element={<FloorPlanEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('should have grid snap enabled by default', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const gridSnapButton = screen.getByTitle('그리드 스냅 (G)');
    expect(gridSnapButton).toHaveClass('bg-blue-100');
  });

  it('should toggle grid snap when button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const gridSnapButton = screen.getByTitle('그리드 스냅 (G)');

    // Initially enabled
    expect(gridSnapButton).toHaveClass('bg-blue-100');

    // Click to disable
    fireEvent.click(gridSnapButton);
    expect(gridSnapButton).not.toHaveClass('bg-blue-100');

    // Click to enable again
    fireEvent.click(gridSnapButton);
    expect(gridSnapButton).toHaveClass('bg-blue-100');
  });

  it('should toggle grid snap using G keyboard shortcut', async () => {
    renderEditor();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const gridSnapButton = screen.getByTitle('그리드 스냅 (G)');

    // Initially enabled
    expect(gridSnapButton).toHaveClass('bg-blue-100');

    // Press G to toggle
    await user.keyboard('g');
    expect(gridSnapButton).not.toHaveClass('bg-blue-100');
  });

  it('should toggle grid display when grid button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const gridButton = screen.getByTitle('그리드 표시');

    // Initially should be enabled
    expect(gridButton).toHaveClass('bg-blue-100');

    // Click to disable
    fireEvent.click(gridButton);
    expect(gridButton).not.toHaveClass('bg-blue-100');
  });
});

describe('FloorPlanEditorPage - Save Functionality', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(api.api.get).mockImplementation((url: string) => {
      if (url.includes('/floors/floor-1/floor-plan')) {
        return Promise.resolve({ data: { data: mockFloorPlan } });
      }
      if (url.includes('/floors/floor-1')) {
        return Promise.resolve({ data: { data: mockFloor } });
      }
      return Promise.reject(new Error('Not found'));
    });

    vi.mocked(api.api.put).mockResolvedValue({
      data: { data: { ...mockFloorPlan, version: 2 } },
    });
  });

  const renderEditor = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/floors/floor-1/floor-plan']}>
          <Routes>
            <Route path="/floors/:floorId/floor-plan" element={<FloorPlanEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('should have save button disabled initially', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('저장');
    expect(saveButton).toHaveClass('bg-gray-100');
  });

  it('should enable save button after making changes', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Create a column
    const columnButton = screen.getByTitle('기둥 (C)');
    fireEvent.click(columnButton);

    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 150, clientY: 150 });

    // Save button should be enabled
    await waitFor(() => {
      const saveButton = screen.getByText('저장');
      expect(saveButton).toHaveClass('bg-blue-600');
    });
  });

  it('should call API when save button clicked', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Create a column
    const columnButton = screen.getByTitle('기둥 (C)');
    fireEvent.click(columnButton);

    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 150, clientY: 150 });

    // Wait for save to be enabled
    await waitFor(() => {
      const saveButton = screen.getByText('저장');
      expect(saveButton).toHaveClass('bg-blue-600');
    });

    // Click save
    const saveButton = screen.getByText('저장');
    fireEvent.click(saveButton);

    // API should be called
    await waitFor(() => {
      expect(api.api.put).toHaveBeenCalled();
    });
  });

  it('should save using Ctrl+S keyboard shortcut', async () => {
    renderEditor();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Create element
    const columnButton = screen.getByTitle('기둥 (C)');
    fireEvent.click(columnButton);

    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 150, clientY: 150 });

    // Press Ctrl+S
    await user.keyboard('{Control>}s{/Control}');

    // API should be called
    await waitFor(() => {
      expect(api.api.put).toHaveBeenCalled();
    });
  });
});

describe('FloorPlanEditorPage - Delete Functionality', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const planWithElements: FloorPlanDetail = {
      ...mockFloorPlan,
      elements: [
        {
          id: 'elem-1',
          elementType: 'column',
          properties: { x: 100, y: 100, width: 40, height: 40, shape: 'rect' },
          zIndex: 0,
          isVisible: true,
        },
      ],
    };

    vi.mocked(api.api.get).mockImplementation((url: string) => {
      if (url.includes('/floors/floor-1/floor-plan')) {
        return Promise.resolve({ data: { data: planWithElements } });
      }
      if (url.includes('/floors/floor-1')) {
        return Promise.resolve({ data: { data: mockFloor } });
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  const renderEditor = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/floors/floor-1/floor-plan']}>
          <Routes>
            <Route path="/floors/:floorId/floor-plan" element={<FloorPlanEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('should delete element when Delete key pressed after selection', async () => {
    renderEditor();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Switch to select tool
    const selectButton = screen.getByTitle('선택 (V)');
    fireEvent.click(selectButton);

    // Click on element (approximate position)
    const canvas = document.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 100, clientY: 100 });

    // Press Delete
    await user.keyboard('{Delete}');

    // Changes should be made
    await waitFor(() => {
      const saveButton = screen.getByText('저장');
      expect(saveButton).toHaveClass('bg-blue-600');
    });
  });

  it('should cancel selection with Escape key', async () => {
    renderEditor();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('B1층 평면도')).toBeInTheDocument();
    });

    // Create element first
    const columnButton = screen.getByTitle('기둥 (C)');
    fireEvent.click(columnButton);

    // Press Escape
    await user.keyboard('{Escape}');

    // Should return to select mode
    const selectButton = screen.getByTitle('선택 (V)');
    expect(selectButton).toHaveClass('bg-blue-100');
  });
});
