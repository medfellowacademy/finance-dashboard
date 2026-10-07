import { STATUS_LABEL } from "@/lib/format";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{message}</p>;
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

const BADGE: Record<string, string> = {
  received: "bg-emerald-50 text-emerald-700",
  paid: "bg-emerald-50 text-emerald-700",
  approved: "bg-sky-50 text-sky-700",
  requested: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[status] ?? "bg-zinc-100"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Bar({ value, max, tone = "teal" }: { value: number; max: number; tone?: "teal" | "rose" }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded bg-zinc-100">
      <div
        className={`h-2 rounded ${tone === "teal" ? "bg-teal-600" : "bg-rose-500"}`}
        style={{ width: `${value > 0 ? pct : 0}%` }}
      />
    </div>
  );
}
