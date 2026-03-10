import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { RoomConnection } from '../../../types/connection';

const CONNECTION_KEYS = {
  all: ['connections'] as const,
  room: (roomId: string) => [...CONNECTION_KEYS.all, 'room', roomId] as const,
};

export function useRoomConnections(roomId: string) {
  return useQuery({
    queryKey: CONNECTION_KEYS.room(roomId),
    queryFn: async () => {
      const { data } = await api.get<{ data: RoomConnection[] }>(
        `/rooms/${roomId}/connections`
      );
      return data.data;
    },
    enabled: !!roomId,
  });
}
