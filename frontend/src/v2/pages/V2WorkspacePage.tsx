export default function V2WorkspacePage() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-64 shrink-0 border-r border-line bg-sidebar" data-testid="v2-org-tree" />
      <main className="flex min-w-0 flex-1 flex-col" data-testid="v2-main">
        <div className="p-4 text-sm text-content-muted">변전소를 선택하세요</div>
      </main>
    </div>
  );
}
