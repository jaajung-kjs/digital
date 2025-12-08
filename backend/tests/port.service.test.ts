import { describe, it, expect, vi, beforeEach } from 'vitest';
import { portService } from '../src/services/port.service.js';
import prisma from '../src/config/prisma.js';
import { NotFoundError, ConflictError } from '../src/utils/errors.js';

// Mock Prisma
vi.mock('../src/config/prisma.js', () => ({
  default: {
    equipment: {
      findUnique: vi.fn(),
    },
    port: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('PortService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockEquipmentId = 'eq-123';

  describe('getByEquipmentId', () => {
    it('should return all ports for equipment with connection status', async () => {
      const mockEquipment = { id: mockEquipmentId };
      const mockPorts = [
        {
          id: 'port-1',
          equipmentId: mockEquipmentId,
          name: 'eth0',
          portType: 'LAN',
          portNumber: 1,
          label: 'Management',
          speed: '1Gbps',
          description: null,
          sortOrder: 0,
          sourceCables: [{ id: 'cable-1' }],
          targetCables: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'port-2',
          equipmentId: mockEquipmentId,
          name: 'power1',
          portType: 'AC',
          portNumber: 1,
          label: 'Power Supply 1',
          speed: null,
          description: null,
          sortOrder: 1,
          sourceCables: [],
          targetCables: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockEquipment as any);
      vi.mocked(prisma.port.findMany).mockResolvedValue(mockPorts as any);

      const result = await portService.getByEquipmentId(mockEquipmentId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('eth0');
      expect(result[0].isConnected).toBe(true); // Has sourceCables
      expect(result[1].name).toBe('power1');
      expect(result[1].isConnected).toBe(false); // No cables
    });

    it('should throw NotFoundError when equipment does not exist', async () => {
      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(null);

      await expect(portService.getByEquipmentId(mockEquipmentId)).rejects.toThrow(NotFoundError);
    });

    it('should return empty array when equipment has no ports', async () => {
      const mockEquipment = { id: mockEquipmentId };
      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockEquipment as any);
      vi.mocked(prisma.port.findMany).mockResolvedValue([]);

      const result = await portService.getByEquipmentId(mockEquipmentId);

      expect(result).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('should return port details with connection status', async () => {
      const mockPort = {
        id: 'port-1',
        equipmentId: mockEquipmentId,
        name: 'eth0',
        portType: 'LAN',
        portNumber: 1,
        label: 'Management',
        speed: '1Gbps',
        description: 'Management network port',
        sortOrder: 0,
        sourceCables: [],
        targetCables: [{ id: 'cable-1' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.port.findUnique).mockResolvedValue(mockPort as any);

      const result = await portService.getById('port-1');

      expect(result.id).toBe('port-1');
      expect(result.name).toBe('eth0');
      expect(result.portType).toBe('LAN');
      expect(result.isConnected).toBe(true); // Has targetCables
    });

    it('should throw NotFoundError when port does not exist', async () => {
      vi.mocked(prisma.port.findUnique).mockResolvedValue(null);

      await expect(portService.getById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    it('should create a port with all fields', async () => {
      const mockEquipment = { id: mockEquipmentId };
      const input = {
        name: 'eth1',
        portType: 'LAN' as const,
        portNumber: 2,
        label: 'Data Port',
        speed: '10Gbps',
        description: 'High-speed data connection',
      };

      const mockCreated = {
        id: 'port-new',
        equipmentId: mockEquipmentId,
        ...input,
        connectorType: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockEquipment as any);
      vi.mocked(prisma.port.findFirst).mockResolvedValue(null); // No duplicate
      vi.mocked(prisma.port.create).mockResolvedValue(mockCreated as any);

      const result = await portService.create(mockEquipmentId, input);

      expect(result.id).toBe('port-new');
      expect(result.name).toBe('eth1');
      expect(result.portType).toBe('LAN');
      expect(result.speed).toBe('10Gbps');
      expect(result.isConnected).toBe(false);
    });

    it('should create a port with minimal fields', async () => {
      const mockEquipment = { id: mockEquipmentId };
      const input = {
        name: 'port1',
        portType: 'OTHER' as const,
      };

      const mockCreated = {
        id: 'port-new',
        equipmentId: mockEquipmentId,
        name: 'port1',
        portType: 'OTHER',
        portNumber: null,
        label: null,
        speed: null,
        connectorType: null,
        description: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockEquipment as any);
      vi.mocked(prisma.port.findFirst).mockResolvedValue(null); // No duplicate
      vi.mocked(prisma.port.create).mockResolvedValue(mockCreated as any);

      const result = await portService.create(mockEquipmentId, input);

      expect(result.name).toBe('port1');
      expect(result.portNumber).toBeNull();
    });

    it('should throw NotFoundError when equipment does not exist', async () => {
      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(null);

      await expect(
        portService.create(mockEquipmentId, { name: 'test', portType: 'LAN' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createBulk', () => {
    it('should create multiple ports at once', async () => {
      const mockEquipment = { id: mockEquipmentId };
      const inputs = [
        { name: 'eth0', portType: 'LAN' as const, portNumber: 1 },
        { name: 'eth1', portType: 'LAN' as const, portNumber: 2 },
        { name: 'power1', portType: 'AC' as const, portNumber: 1 },
      ];

      const mockExisting = []; // No existing ports with these names

      const mockPorts = inputs.map((input, i) => ({
        id: `port-${i}`,
        equipmentId: mockEquipmentId,
        ...input,
        label: null,
        speed: null,
        connectorType: null,
        description: null,
        sortOrder: i,
        sourceCables: [],
        targetCables: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockEquipment as any);
      vi.mocked(prisma.port.findMany).mockResolvedValueOnce(mockExisting as any); // First call - check existing
      vi.mocked(prisma.port.createMany).mockResolvedValue({ count: 3 });
      vi.mocked(prisma.port.findMany).mockResolvedValueOnce(mockPorts as any); // Second call - return created

      const result = await portService.createBulk(mockEquipmentId, inputs);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('eth0');
      expect(result[1].name).toBe('eth1');
      expect(result[2].name).toBe('power1');
    });

    it('should throw NotFoundError when equipment does not exist', async () => {
      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(null);

      await expect(
        portService.createBulk(mockEquipmentId, [{ name: 'test', portType: 'LAN' }])
      ).rejects.toThrow(NotFoundError);
    });

    it('should return empty array when no ports provided', async () => {
      const mockEquipment = { id: mockEquipmentId };
      vi.mocked(prisma.equipment.findUnique).mockResolvedValue(mockEquipment as any);
      vi.mocked(prisma.port.createMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.port.findMany).mockResolvedValue([]);

      const result = await portService.createBulk(mockEquipmentId, []);

      expect(result).toHaveLength(0);
    });
  });

  describe('update', () => {
    const mockExisting = {
      id: 'port-1',
      equipmentId: mockEquipmentId,
      name: 'eth0',
      portType: 'LAN',
      portNumber: 1,
      label: 'Old Label',
      speed: '1Gbps',
      connectorType: null,
      description: null,
      sortOrder: 0,
      sourceCables: [],
      targetCables: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should update port name and label', async () => {
      const mockUpdated = {
        ...mockExisting,
        name: 'eth-mgmt',
        label: 'Management Interface',
      };

      vi.mocked(prisma.port.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.port.findFirst).mockResolvedValue(null); // No name conflict
      vi.mocked(prisma.port.update).mockResolvedValue(mockUpdated as any);

      const result = await portService.update('port-1', {
        name: 'eth-mgmt',
        label: 'Management Interface',
      });

      expect(result.name).toBe('eth-mgmt');
      expect(result.label).toBe('Management Interface');
    });

    it('should update port type and speed', async () => {
      const mockUpdated = {
        ...mockExisting,
        portType: 'FIBER',
        speed: '40Gbps',
      };

      vi.mocked(prisma.port.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.port.update).mockResolvedValue(mockUpdated as any);

      const result = await portService.update('port-1', {
        portType: 'FIBER',
        speed: '40Gbps',
      });

      expect(result.portType).toBe('FIBER');
      expect(result.speed).toBe('40Gbps');
      expect(result.isConnected).toBe(false); // mockUpdated has empty cables arrays
    });

    it('should throw NotFoundError when port does not exist', async () => {
      vi.mocked(prisma.port.findUnique).mockResolvedValue(null);

      await expect(
        portService.update('nonexistent', { name: 'test' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete port when not connected', async () => {
      const mockPort = {
        id: 'port-1',
        sourceCables: [],
        targetCables: [],
      };

      vi.mocked(prisma.port.findUnique).mockResolvedValue(mockPort as any);
      vi.mocked(prisma.port.delete).mockResolvedValue(mockPort as any);

      await expect(portService.delete('port-1')).resolves.toBeUndefined();

      expect(prisma.port.delete).toHaveBeenCalledWith({ where: { id: 'port-1' } });
    });

    it('should throw NotFoundError when port does not exist', async () => {
      vi.mocked(prisma.port.findUnique).mockResolvedValue(null);

      await expect(portService.delete('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError when port has source cables', async () => {
      const mockPort = {
        id: 'port-1',
        sourceCables: [{ id: 'cable-1' }],
        targetCables: [],
      };

      vi.mocked(prisma.port.findUnique).mockResolvedValue(mockPort as any);

      await expect(portService.delete('port-1')).rejects.toThrow(ConflictError);
    });

    it('should throw ConflictError when port has target cables', async () => {
      const mockPort = {
        id: 'port-1',
        sourceCables: [],
        targetCables: [{ id: 'cable-1' }, { id: 'cable-2' }],
      };

      vi.mocked(prisma.port.findUnique).mockResolvedValue(mockPort as any);

      await expect(portService.delete('port-1')).rejects.toThrow(ConflictError);
    });
  });
});
