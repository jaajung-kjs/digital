import { describe, it, expect, vi, beforeEach } from 'vitest';
import { equipmentService } from '../src/services/equipment.service.js';
import prisma from '../src/config/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../src/utils/errors.js';

// Mock Prisma
vi.mock('../src/config/prisma.js', () => ({
  default: {
    rack: {
      findUnique: vi.fn(),
    },
    equipment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('EquipmentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockUserId = 'user-123';
  const mockRackId = 'rack-123';

  describe('getByRackId', () => {
    it('should return all equipment for a rack with port counts', async () => {
      const mockRack = { id: mockRackId, totalU: 12 };
      const mockEquipment = [
        {
          id: 'eq-1',
          rackId: mockRackId,
          name: 'Server #1',
          model: 'Dell R740',
          manufacturer: 'Dell',
          serialNumber: 'SN123',
          startU: 1,
          heightU: 2,
          category: 'SERVER',
          installDate: new Date('2024-01-01'),
          manager: '홍길동',
          description: '메인 서버',
          properties: null,
          sortOrder: 0,
          _count: { ports: 4 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'eq-2',
          rackId: mockRackId,
          name: 'Switch #1',
          model: 'Cisco 9300',
          manufacturer: 'Cisco',
          serialNumber: 'SN456',
          startU: 5,
          heightU: 1,
          category: 'NETWORK',
          installDate: null,
          manager: null,
          description: null,
          properties: null,
          sortOrder: 1,
          _count: { ports: 48 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue(mockEquipment as any);

      const result = await equipmentService.getByRackId(mockRackId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Server #1');
      expect(result[0].portCount).toBe(4);
      expect(result[1].portCount).toBe(48);
    });

    it('should throw NotFoundError when rack does not exist', async () => {
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(null);

      await expect(equipmentService.getByRackId(mockRackId)).rejects.toThrow(NotFoundError);
    });

    it('should return empty array when rack has no equipment', async () => {
      const mockRack = { id: mockRackId, totalU: 12 };
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue([]);

      const result = await equipmentService.getByRackId(mockRackId);

      expect(result).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('should return equipment details with port count', async () => {
      const mockEquipment = {
        id: 'eq-1',
        rackId: mockRackId,
        name: 'Server #1',
        model: 'Dell R740',
        manufacturer: 'Dell',
        serialNumber: 'SN123',
        startU: 1,
        heightU: 2,
        category: 'SERVER',
        installDate: new Date('2024-01-01'),
        manager: '홍길동',
        description: '메인 서버',
        properties: { cpu: '16 cores' },
        sortOrder: 0,
        _count: { ports: 8 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockEquipment as any);

      const result = await equipmentService.getById('eq-1');

      expect(result.id).toBe('eq-1');
      expect(result.name).toBe('Server #1');
      expect(result.portCount).toBe(8);
      expect(result.properties).toEqual({ cpu: '16 cores' });
    });

    it('should throw NotFoundError when equipment does not exist', async () => {
      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(null);

      await expect(equipmentService.getById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    const mockRack = { id: mockRackId, totalU: 12 };

    it('should create equipment with valid U position', async () => {
      const input = {
        name: 'New Server',
        model: 'Dell R740',
        manufacturer: 'Dell',
        serialNumber: 'SN789',
        startU: 10,
        heightU: 2,
        category: 'SERVER' as const,
        manager: '김철수',
        description: '새 서버',
      };

      const mockCreated = {
        id: 'eq-new',
        rackId: mockRackId,
        ...input,
        installDate: null,
        properties: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue([]); // No existing equipment
      vi.mocked(prisma.equipment.create).mockResolvedValue(mockCreated as any);

      const result = await equipmentService.create(mockRackId, input, mockUserId);

      expect(result.id).toBe('eq-new');
      expect(result.name).toBe('New Server');
      expect(result.startU).toBe(10);
      expect(result.heightU).toBe(2);
      expect(result.portCount).toBe(0);
    });

    it('should throw NotFoundError when rack does not exist', async () => {
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(null);

      await expect(
        equipmentService.create(mockRackId, { name: 'Test', startU: 1 }, mockUserId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError when U slot conflicts with existing equipment', async () => {
      const existingEquipment = [
        {
          id: 'eq-existing',
          rackId: mockRackId,
          name: 'Existing Server',
          model: null,
          manufacturer: null,
          serialNumber: null,
          startU: 8,
          heightU: 4, // Occupies U 8-11
          category: 'SERVER',
          installDate: null,
          manager: null,
          description: null,
          properties: null,
          sortOrder: 0,
          _count: { ports: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue(existingEquipment as any);

      // Try to place equipment at U 10 which conflicts with existing (U 8-11)
      await expect(
        equipmentService.create(
          mockRackId,
          { name: 'Conflict Server', startU: 10, heightU: 2 },
          mockUserId
        )
      ).rejects.toThrow(ConflictError);
    });

    it('should throw ValidationError when startU is less than 1', async () => {
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);

      await expect(
        equipmentService.create(
          mockRackId,
          { name: 'Invalid Server', startU: 0, heightU: 1 },
          mockUserId
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when equipment exceeds rack capacity', async () => {
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue([]);

      // Try to place 4U equipment at U 40 in a 42U rack (would end at U 43)
      await expect(
        equipmentService.create(
          mockRackId,
          { name: 'Overflow Server', startU: 40, heightU: 4 },
          mockUserId
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should use default heightU of 1 when not provided', async () => {
      const mockCreated = {
        id: 'eq-new',
        rackId: mockRackId,
        name: 'Small Device',
        model: null,
        manufacturer: null,
        serialNumber: null,
        startU: 1,
        heightU: 1,
        category: 'OTHER',
        installDate: null,
        manager: null,
        description: null,
        properties: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue([]);
      vi.mocked(prisma.equipment.create).mockResolvedValue(mockCreated as any);

      const result = await equipmentService.create(
        mockRackId,
        { name: 'Small Device', startU: 1 },
        mockUserId
      );

      expect(result.heightU).toBe(1);
    });
  });

  describe('update', () => {
    const mockExisting = {
      id: 'eq-1',
      rackId: mockRackId,
      name: 'Old Name',
      model: 'Old Model',
      manufacturer: null,
      serialNumber: null,
      startU: 5,
      heightU: 2,
      category: 'SERVER',
      installDate: null,
      manager: null,
      description: null,
      properties: null,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should update equipment name and description', async () => {
      const mockUpdated = {
        ...mockExisting,
        name: 'Updated Server',
        description: 'Updated description',
        _count: { ports: 4 },
      };

      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.equipment.update).mockResolvedValue(mockUpdated as any);

      const result = await equipmentService.update(
        'eq-1',
        { name: 'Updated Server', description: 'Updated description' },
        mockUserId
      );

      expect(result.name).toBe('Updated Server');
      expect(result.description).toBe('Updated description');
    });

    it('should update U position when no conflict', async () => {
      const mockRack = { id: mockRackId, totalU: 12 };
      const mockUpdated = {
        ...mockExisting,
        startU: 10, // heightU: 2 -> ends at U 11, valid for 12U rack
        _count: { ports: 0 },
      };

      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue([]); // No conflicts
      vi.mocked(prisma.equipment.update).mockResolvedValue(mockUpdated as any);

      const result = await equipmentService.update('eq-1', { startU: 10 }, mockUserId);

      expect(result.startU).toBe(10);
    });

    it('should throw NotFoundError when equipment does not exist', async () => {
      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(null);

      await expect(
        equipmentService.update('nonexistent', { name: 'Test' }, mockUserId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError when new U position conflicts', async () => {
      const existingOther = [
        {
          id: 'eq-other',
          rackId: mockRackId,
          name: 'Other Server',
          model: null,
          manufacturer: null,
          serialNumber: null,
          startU: 6,
          heightU: 4, // U 6-9
          category: 'SERVER',
          installDate: null,
          manager: null,
          description: null,
          properties: null,
          sortOrder: 0,
          _count: { ports: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockRack = { id: mockRackId, totalU: 12 };

      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue(existingOther as any);

      // Try to move to U 7 which conflicts with U 6-9
      await expect(
        equipmentService.update('eq-1', { startU: 7 }, mockUserId)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('move', () => {
    const mockRack = { id: mockRackId, totalU: 12 };
    const mockExisting = {
      id: 'eq-1',
      rackId: mockRackId,
      name: 'Server',
      model: null,
      manufacturer: null,
      serialNumber: null,
      startU: 5,
      heightU: 2,
      category: 'SERVER',
      installDate: null,
      manager: null,
      description: null,
      properties: null,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should move equipment to new U position', async () => {
      const mockMoved = {
        ...mockExisting,
        startU: 10,
        _count: { ports: 2 },
      };

      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue([]);
      vi.mocked(prisma.equipment.update).mockResolvedValue(mockMoved as any);

      const result = await equipmentService.move('eq-1', { startU: 10 }, mockUserId);

      expect(result.startU).toBe(10);
      expect(result.heightU).toBe(2); // Height unchanged (ends at U 11, valid for 12U rack)
    });

    it('should throw NotFoundError when equipment does not exist', async () => {
      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(null);

      await expect(
        equipmentService.move('nonexistent', { startU: 10 }, mockUserId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete equipment when no cables connected', async () => {
      const mockEquipment = {
        id: 'eq-1',
        ports: [
          { id: 'port-1', sourceCables: [], targetCables: [] },
          { id: 'port-2', sourceCables: [], targetCables: [] },
        ],
      };

      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockEquipment as any);
      vi.mocked(prisma.equipment.delete).mockResolvedValue(mockEquipment as any);

      await expect(equipmentService.delete('eq-1')).resolves.toBeUndefined();

      expect(prisma.equipment.delete).toHaveBeenCalledWith({ where: { id: 'eq-1' } });
    });

    it('should throw NotFoundError when equipment does not exist', async () => {
      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(null);

      await expect(equipmentService.delete('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError when equipment has connected cables', async () => {
      const mockEquipment = {
        id: 'eq-1',
        ports: [
          {
            id: 'port-1',
            sourceCables: [{ id: 'cable-1' }],
            targetCables: [],
          },
          {
            id: 'port-2',
            sourceCables: [],
            targetCables: [{ id: 'cable-2' }, { id: 'cable-3' }],
          },
        ],
      };

      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockEquipment as any);

      await expect(equipmentService.delete('eq-1')).rejects.toThrow(ConflictError);
    });
  });

  describe('getAvailableSlots', () => {
    const mockRack = { id: mockRackId, totalU: 10 };

    it('should return all slots when rack is empty', async () => {
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue([]);

      const result = await equipmentService.getAvailableSlots(mockRackId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ start: 1, end: 10 });
    });

    it('should return available ranges around equipment', async () => {
      const mockEquipment = [
        { startU: 3, heightU: 2 }, // U 3-4 occupied
        { startU: 7, heightU: 2 }, // U 7-8 occupied
      ];

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue(mockEquipment as any);

      const result = await equipmentService.getAvailableSlots(mockRackId);

      expect(result).toHaveLength(3);
      expect(result).toContainEqual({ start: 1, end: 2 });
      expect(result).toContainEqual({ start: 5, end: 6 });
      expect(result).toContainEqual({ start: 9, end: 10 });
    });

    it('should throw NotFoundError when rack does not exist', async () => {
      vi.mocked(prisma.rack.findUnique).mockResolvedValue(null);

      await expect(equipmentService.getAvailableSlots(mockRackId)).rejects.toThrow(NotFoundError);
    });

    it('should return empty array when rack is fully occupied', async () => {
      const mockEquipment = [{ startU: 1, heightU: 10 }]; // All slots occupied

      vi.mocked(prisma.rack.findUnique).mockResolvedValue(mockRack as any);
      vi.mocked(prisma.equipment.findMany).mockResolvedValue(mockEquipment as any);

      const result = await equipmentService.getAvailableSlots(mockRackId);

      expect(result).toHaveLength(0);
    });
  });
});
