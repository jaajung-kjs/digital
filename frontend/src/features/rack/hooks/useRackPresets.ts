import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type {
  CreateRackPresetInput,
  RackPreset,
  UpdateRackPresetInput,
} from '../../../types/rackPreset';

export const RACK_PRESET_KEYS = {
  all: ['rack-presets'] as const,
  detail: (id: string) => ['rack-presets', 'detail', id] as const,
};

/**
 * List rack presets. Used by EditorSidebar (P9) and PresetActionsBar (P10).
 *
 * Backend route: GET /api/rack-presets.
 */
export function useRackPresets() {
  return useQuery({
    queryKey: RACK_PRESET_KEYS.all,
    queryFn: async () => {
      const { data } = await api.get<{ data: RackPreset[] }>('/rack-presets');
      return data.data;
    },
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * P10: Create a new rack preset (admin only on backend).
 *
 * Backend route: POST /api/rack-presets.
 * On success, invalidates `RACK_PRESET_KEYS.all` so the sidebar list refreshes.
 */
export function useCreateRackPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRackPresetInput) => {
      const { data } = await api.post<{ data: RackPreset }>(
        '/rack-presets',
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RACK_PRESET_KEYS.all });
    },
  });
}

/**
 * P10: Update an existing rack preset (admin only on backend).
 *
 * Backend route: PATCH /api/rack-presets/:id. `code` cannot be changed —
 * see backend zod schema in `rackPresets.routes.ts`.
 */
export function useUpdateRackPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: UpdateRackPresetInput;
    }) => {
      const { data } = await api.patch<{ data: RackPreset }>(
        `/rack-presets/${id}`,
        input,
      );
      return data.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: RACK_PRESET_KEYS.all });
      qc.invalidateQueries({ queryKey: RACK_PRESET_KEYS.detail(variables.id) });
    },
  });
}

/**
 * P10: Delete a rack preset (admin only on backend).
 *
 * Backend route: DELETE /api/rack-presets/:id.
 */
export function useDeleteRackPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/rack-presets/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RACK_PRESET_KEYS.all });
    },
  });
}
