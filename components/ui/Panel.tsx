import clsx from "clsx";

export function Panel({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={clsx(
        "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}
