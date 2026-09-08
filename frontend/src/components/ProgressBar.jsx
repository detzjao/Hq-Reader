export default function ProgressBar({ current, total }) {
  const percent = total ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  return (
    <div className="w-full" aria-label={`Progresso: página ${current} de ${total}`}>
      <div className="h-1 w-full overflow-hidden bg-zinc-800">
        <div className="h-full bg-red-600 transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
