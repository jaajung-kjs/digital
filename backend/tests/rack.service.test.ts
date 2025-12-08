import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rackService } from '../src/services/rack.service.js';
import prisma from '../src/config/prisma.js';
import { NotFoundError, ConflictError } from '../src/utils/errors.js';

// Mock Prisma
vi.mock('../src/config/prisma.js', () => ({
  default: {
    floorPlan: {
      findUnique: vi.fn(),
    },
    rack: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('RackService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getByFloorPlanId', () => {
    const mockFloorPlanId = 'fp-123';

    it('should return all racks with equipment counts', async () => {
      const mockFloorPlan = { id: mockFloorPlanId };
      const mockRacks = [
        {
          id: 'rack-1',
          floorPlanId: mockFloorPlanId,
          name: 'Rack A1',
          code: 'RA1',
          positionX: 100,
          positionY: 100,
          width: 60,
          height: 100,
          rotation: 0,
          totalU: 42,
          frontImageUrl: null,
          rearImageUrl: null,
          description: 'Main rack',
          sortOrder: 1,
          equipment: [{ heightU: 2 }, { heightU: 3 }],
          _count: { equipment: 2 },
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);
      vi.mocked(prisma.rack.findMany).mockResolvedValue(mockRacks as any);

      const result = await rackService.getByFloorPlanId(mockFloorPlanId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Rack A1');
      expect(result[0].equipmentCount).toBe(2);
      expect(result[0].usedU).toBe(5); // 2 + 3
    });

    it('should calculate used U correctly', async () => {
      const mockFloorPlan = { id: mockFloorPlanId };
      const mockRacks = [
        {
          id: 'rack-1',
          floorPlanId: mockFloorPlanId,
          name: 'Rack A1',
          code: 'RA1',
          positionX: 100,
          positionY: 100,
          width: 60,
          height: 100,
          rotation: 0,
          totalU: 42,
          frontImageUrl: null,
          rearImageUrl: null,
          description: null,
          sortOrder: 1,
          equipment: [{ heightU: 1 }, { heightU: 2 }, { heightU: 4 }],
          _count: { equipment: 3 },
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);
      vi.mocked(prisma.rack.findMany).mockResolvedValue(mockRacks as any);

      const result = await rackService.getByFloorPlanId(mockFloorPlanId);

      expect(result[0].usedU).toBe(7); // 1 + 2 + 4
    });

    it('should throw NotFoundError when floor plan does not exist', async () => {
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(null);

      await expect(rackService.getByFloorPlanId('invalid-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getById', () => {
    it('should return rack details by id', async () => {
      const mockRack = {
        id: 'rack-1',
        floorPlanId: 'fp-123',
        name: 'Rack A1',
        code: 'RA1',
        positionX: 100,
        positionY: 100,
        width: 60,
        height: 100,
        rotation: 0,
        totalU: 42,
        frontImageUrl: '/images/rack-front.png',
        rearImageUrl: '/images/rack-rear.png',
        description: 'Main rack',
        sortOrder: 1,
        equipment: [{ heightU: 2 }],
        _count: { equipment: 1 },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);

      const result = await rackService.getById('rack-1');

      expect(result.id).toBe('rack-1');
      expect(result.name).toBe('Rack A1');
      expect(result.frontImageUrl).toBe('/images/rack-front.png');
      expect(result.equipmentCount).toBe(1);
    });

    it('should throw NotFoundError when rack does not exist', async () => {
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(null);

      await expect(rackService.getById('invalid-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    const mockFloorPlanId = 'fp-123';
    const mockUserId = 'user-123';

    it('should create a rack with default values', async () => {
      const mockFloorPlan = { id: mockFloorPlanId };
      const mockCreatedRack = {
        id: 'rack-1',
        floorPlanId: mockFloorPlanId,
        name: 'New Rack',
        code: null,
        positionX: 200,
        positionY: 200,
        width: 60,
        height: 100,
        rotation: 0,
        totalU: 42,
        frontImageUrl: null,
        rearImageUrl: null,
        description: null,
        sortOrder: 1,
        createdById: mockUserId,
        updatedById: mockUserId,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);
      vi.mocked(prisma.rack.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.rack.create).mockResolvedValue(mockCreatedRack as any);

      const result = await rackService.create(
        mockFloorPlanId,
        {
          name: 'New Rack',
          positionX: 200,
          positionY: 200,
        },
        mockUserId
      );

      expect(result.name).toBe('New Rack');
      expect(result.width).toBe(60);
      expect(result.height).toBe(100);
      expect(result.totalU).toBe(42);
      expect(result.equipmentCount).toBe(0);
    });

    it('should create rack with custom dimensions', async () => {
      const mockFloorPlan = { id: mockFloorPlanId };
      const mockCreatedRack = {
        id: 'rack-2',
        floorPlanId: mockFloorPlanId,
        name: 'Custom Rack',
        code: 'CR1',
        positionX: 300,
        positionY: 300,
        width: 80,
        height: 120,
        rotation: 90,
        totalU: 48,
        frontImageUrl: null,
        rearImageUrl: null,
        description: 'Custom sized rack',
        sortOrder: 1,
        createdById: mockUserId,
        updatedById: mockUserId,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);
      vi.mocked(prisma.rack.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.rack.create).mockResolvedValue(mockCreatedRack as any);

      const result = await rackService.create(
        mockFloorPlanId,
        {
          name: 'Custom Rack',
          code: 'CR1',
          positionX: 300,
          positionY: 300,
          width: 80,
          height: 120,
          rotation: 90,
          totalU: 48,
          description: 'Custom sized rack',
        },
        mockUserId
      );

      expect(result.width).toBe(80);
      expect(result.height).toBe(120);
      expect(result.rotation).toBe(90);
      expect(result.totalU).toBe(48);
    });

    it('should throw NotFoundError when floor plan does not exist', async () => {
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(null);

      await expect(
        rackService.create('invalid-id', { name: 'Test', positionX: 0, positionY: 0 }, mockUserId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError when rack name already exists', async () => {
      const mockFloorPlan = { id: mockFloorPlanId };
      const existingRack = { id: 'rack-existing', name: 'Existing Rack' };

      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);
      vi.mocked(prisma.rack.findFirst).mockResolvedValue(existingRack as any);

      await expect(
        rackService.create(
          mockFloorPlanId,
          { name: 'Existing Rack', positionX: 0, positionY: 0 },
          mockUserId
        )
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('update', () => {
    const mockUserId = 'user-123';

    it('should update rack position and rotation', async () => {
      const mockExisting = {
        id: 'rack-1',
        floorPlanId: 'fp-123',
        name: 'Rack A1',
        positionX: 100,
        positionY: 100,
        rotation: 0,
      };

      const mockUpdated = {
        ...mockExisting,
        positionX: 200,
        positionY: 200,
        rotation: 90,
        code: null,
        width: 60,
        height: 100,
        totalU: 42,
        frontImageUrl: null,
        rearImageUrl: null,
        description: null,
        sortOrder: 1,
        equipment: [],
        _count: { equipment: 0 },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        updatedById: mockUserId,
      };

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.rack.update).mockResolvedValue(mockUpdated as any);

      const result = await rackService.update(
        'rack-1',
        {
          positionX: 200,
          positionY: 200,
          rotation: 90,
        },
        mockUserId
      );

      expect(result.positionX).toBe(200);
      expect(result.positionY).toBe(200);
      expect(result.rotation).toBe(90);
    });

    it('should prevent duplicate names during update', async () => {
      const mockExisting = {
        id: 'rack-1',
        floorPlanId: 'fp-123',
        name: 'Rack A1',
      };

      const existingWithSameName = {
        id: 'rack-2',
        floorPlanId: 'fp-123',
        name: 'Rack A2',
      };

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.rack.findFirst).mockResolvedValue(existingWithSameName as any);

      await expect(
        rackService.update('rack-1', { name: 'Rack A2' }, mockUserId)
      ).rejects.toThrow(ConflictError);
    });

    it('should allow updating rack without changing name', async () => {
      const mockExisting = {
        id: 'rack-1',
        floorPlanId: 'fp-123',
        name: 'Rack A1',
      };

      const mockUpdated = {
        ...mockExisting,
        positionX: 150,
        positionY: 150,
        code: null,
        width: 60,
        height: 100,
        rotation: 0,
        totalU: 42,
        frontImageUrl: null,
        rearImageUrl: null,
        description: null,
        sortOrder: 1,
        equipment: [],
        _count: { equipment: 0 },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        updatedById: mockUserId,
      };

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.rack.update).mockResolvedValue(mockUpdated as any);

      const result = await rackService.update('rack-1', { positionX: 150, positionY: 150 }, mockUserId);

      expect(result.positionX).toBe(150);
    });

    it('should throw NotFoundError when rack does not exist', async () => {
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(null);

      await expect(rackService.update('invalid-id', { name: 'New Name' }, mockUserId)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('delete', () => {
    it('should delete rack when no equipment exists', async () => {
      const mockRack = {
        id: 'rack-1',
        name: 'Rack A1',
        _count: { equipment: 0 },
      };

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.rack.delete).mockResolvedValue(mockRack as any);

      await rackService.delete('rack-1');

      expect(prisma.rack.delete).toHaveBeenCalledWith({
        where: { id: 'rack-1' },
      });
    });

    it('should throw ConflictError when equipment exists', async () => {
      const mockRack = {
        id: 'rack-1',
        name: 'Rack A1',
        _count: { equipment: 3 },
      };

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);

      await expect(rackService.delete('rack-1')).rejects.toThrow(ConflictError);
    });

    it('should throw NotFoundError when rack does not exist', async () => {
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(null);

      await expect(rackService.delete('invalid-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateImage', () => {
    const mockUserId = 'user-123';

    it('should update front image URL', async () => {
      const mockExisting = {
        id: 'rack-1',
        floorPlanId: 'fp-123',
        name: 'Rack A1',
        frontImageUrl: null,
      };

      const mockUpdated = {
        ...mockExisting,
        frontImageUrl: '/images/new-front.png',
        code: null,
        positionX: 100,
        positionY: 100,
        width: 60,
        height: 100,
        rotation: 0,
        totalU: 42,
        rearImageUrl: null,
        description: null,
        sortOrder: 1,
        equipment: [],
        _count: { equipment: 0 },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        updatedById: mockUserId,
      };

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.rack.update).mockResolvedValue(mockUpdated as any);

      const result = await rackService.updateImage('rack-1', 'front', '/images/new-front.png', mockUserId);

      expect(result.frontImageUrl).toBe('/images/new-front.png');
    });

    it('should update rear image URL', async () => {
      const mockExisting = {
        id: 'rack-1',
        floorPlanId: 'fp-123',
        name: 'Rack A1',
        rearImageUrl: null,
      };

      const mockUpdated = {
        ...mockExisting,
        rearImageUrl: '/images/new-rear.png',
        code: null,
        positionX: 100,
        positionY: 100,
        width: 60,
        height: 100,
        rotation: 0,
        totalU: 42,
        frontImageUrl: null,
        description: null,
        sortOrder: 1,
        equipment: [],
        _count: { equipment: 0 },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        updatedById: mockUserId,
      };

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.rack.update).mockResolvedValue(mockUpdated as any);

      const result = await rackService.updateImage('rack-1', 'rear', '/images/new-rear.png', mockUserId);

      expect(result.rearImageUrl).toBe('/images/new-rear.png');
    });

    it('should throw NotFoundError when rack does not exist', async () => {
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(null);

      await expect(
        rackService.updateImage('invalid-id', 'front', '/images/test.png', mockUserId)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
