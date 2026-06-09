import { TreeVisualization } from '../components/tree/TreeVisualization';
import { StatsSidePanel } from '../components/tree/StatsSidePanel';

export function TreePage() {
  return (
    <div className="flex h-full overflow-hidden">
      <main className="flex-1 overflow-auto bg-gray-50">
        <TreeVisualization />
      </main>
      <aside className="w-72 border-l bg-white flex-shrink-0">
        <StatsSidePanel />
      </aside>
    </div>
  );
}
