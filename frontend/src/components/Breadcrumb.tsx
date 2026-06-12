import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useOrganizationStore } from '../stores/organizationStore';
import { workspaceFloorUrl } from '../features/workspace/workspaceUrls';
import { buildTrail, type TrailItem } from './breadcrumbTrail';

export function Breadcrumb() {
  const params = useParams<{ substationId?: string; floorId?: string }>();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const findNode = useOrganizationStore((s) => s.findNode);

  const deepestId = params.floorId ?? sp.get('floor') ?? params.substationId ?? null;
  const trail = buildTrail((id) => findNode(id) ?? undefined, deepestId);

  const go = (t: TrailItem) => {
    if (t.type === 'substation') navigate(`/substations/${t.id}/workspace`);
    else if (t.type === 'floor') {
      const n = findNode(t.id);
      if (n?.parentId) navigate(workspaceFloorUrl(n.parentId, t.id));
    } else navigate('/');
  };

  if (!trail.length) return <span className="text-sm text-content-faint">전체</span>;
  return (
    <nav className="flex items-center gap-1 text-sm min-w-0">
      {trail.map((t, i) => (
        <span key={t.id} className="flex items-center gap-1 min-w-0">
          {i > 0 && <span className="text-content-faint">›</span>}
          <button className="hover:underline text-content-muted truncate" onClick={() => go(t)}>{t.name}</button>
        </span>
      ))}
    </nav>
  );
}
