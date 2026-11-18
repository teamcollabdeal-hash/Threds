export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-56 rounded-lg bg-white/5" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-white/5" />)}
      </div>
      <div className="h-72 rounded-xl bg-white/5" />
    </div>
  );
}
