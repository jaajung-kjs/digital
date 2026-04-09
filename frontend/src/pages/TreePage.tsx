import { TreePanel } from '../components/tree/TreePanel';
import { TreeVisualization } from '../components/tree/TreeVisualization';

export function TreePage() {
  return (
    <div className="flex h-full overflow-hidden">
      <aside className="w-72 border-r bg-white overflow-y-auto flex-shrink-0">
        <TreePanel />
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50">
        <TreeVisualization />
      </main>
    </div>
  );
}
