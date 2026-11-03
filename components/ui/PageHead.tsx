export function PageHead({
  eyebrow,
  title,
  text,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  action?: React.ReactNode;
  onAction?: () => void;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div>
        <div className="text-xs font-black uppercase tracking-[.18em] text-primary-500">
          {eyebrow}
        </div>
        <h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1>
        {text && <p className="mt-2 text-slate-500">{text}</p>}
      </div>
      {action}
    </div>
  );
}
