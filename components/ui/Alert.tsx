import { AlertTriangle } from "lucide-react";
import clsx from "clsx";

const STYLES = {
  danger: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-700",
  success: "bg-emerald-50 text-emerald-700",
  info: "bg-blue-50 text-blue-700",
} as const;

export function Alert({
  type,
  title,
  text,
}: {
  type: keyof typeof STYLES;
  title: string;
  text: string;
}) {
  return (
    <div className={clsx("rounded-2xl p-3", STYLES[type])}>
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0" size={17} />
        <div>
          <b className="text-sm">{title}</b>
          <p className="mt-1 text-xs opacity-80">{text}</p>
        </div>
      </div>
    </div>
  );
}
