import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { RoomConnection } from '../../../types/connection';

export function useRoomConnections(roomId: string, enabled = true) {
  return useQuery({
    queryKey: ['room-connections', roomId],
    queryFn: async () => {
      const { data } = await api.get<{ data: RoomConnection[] }>(
        `/rooms/${roomId}/connections`
      );
      return data.data;
    },
    enabled: !!roomId && enabled,
  });
}
