import React, { useEffect, useRef } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from "lucide-react";

/* ---------------------------------------------------------------- Spinner */
export function Spinner({ className = "h-5 w-5" }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
}

/* ------------------------------------------------------------- PageHeader */
export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500 sm:text-base">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ Alert */
const ALERT_STYLES = {
  success: ["border-emerald-200 bg-emerald-50 text-emerald-900", CheckCircle2, "text-emerald-600"],
  error: ["border-rose-200 bg-rose-50 text-rose-900", AlertCircle, "text-rose-600"],
  info: ["border-brand-200 bg-brand-50 text-brand-900", Info, "text-brand-600"],
  warning: ["border-amber-200 bg-amber-50 text-amber-900", AlertTriangle, "text-amber-600"],
};

export function Alert({ type = "info", children, onDismiss, className = "" }) {
  const [box, Icon, iconColor] = ALERT_STYLES[type] || ALERT_STYLES.info;
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${box} ${className}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded p-0.5 opacity-60 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Badges */
const STATUS_STYLES = {
  Scheduled: "bg-amber-50 text-amber-800 ring-amber-600/20",
  Arrived: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  Completed: "bg-indigo-50 text-indigo-800 ring-indigo-600/20",
  Cancelled: "bg-rose-50 text-rose-800 ring-rose-600/20",
};
const STATUS_DOT = {
  Scheduled: "bg-amber-500",
  Arrived: "bg-emerald-500",
  Completed: "bg-indigo-500",
  Cancelled: "bg-rose-500",
};
export const STATUS_COLORS = STATUS_DOT;

export function StatusBadge({ status }) {
  return (
    <span className={`badge ${STATUS_STYLES[status] || "bg-slate-100 text-slate-700 ring-slate-500/20"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] || "bg-slate-400"}`} />
      {status}
    </span>
  );
}

const ROLE_STYLES = {
  SUPER_ADMIN: "bg-violet-50 text-violet-800 ring-violet-600/20",
  RECEPTIONIST: "bg-sky-50 text-sky-800 ring-sky-600/20",
  DOCTOR: "bg-teal-50 text-teal-800 ring-teal-600/20",
};
export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  RECEPTIONIST: "Receptionist",
  DOCTOR: "Doctor",
};
export function RoleBadge({ role }) {
  return (
    <span className={`badge ${ROLE_STYLES[role] || "bg-slate-100 text-slate-700 ring-slate-500/20"}`}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

export function ActiveBadge({ active }) {
  return active ? (
    <span className="badge bg-emerald-50 text-emerald-800 ring-emerald-600/20">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  ) : (
    <span className="badge bg-slate-100 text-slate-600 ring-slate-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Inactive
    </span>
  );
}

/* ------------------------------------------------------------------ Modal */
export function Modal({ title, subtitle, onClose, children, footer, size = "md", labelledBy = "modal-title" }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const width = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-pop outline-none sm:rounded-2xl ${width}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={labelledBy} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:justify-end sm:rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", tone = "primary", busy, onConfirm, onCancel }) {
  return (
    <Modal
      size="sm"
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Keep as is
          </button>
          <button
            type="button"
            disabled={busy}
            className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {busy && <Spinner className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------- EmptyState */
export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon && (
        <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-rose-50 p-3 text-rose-500">
        <AlertCircle className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-slate-900">Something went wrong</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Skeleton */
export function ListSkeleton({ rows = 5, label = "Loading…" }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-3 w-2/3" />
          </div>
          <div className="skeleton hidden h-6 w-20 rounded-full sm:block" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/* --------------------------------------------------------------- StatCard */
const TONES = {
  blue: "bg-brand-50 text-brand-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  indigo: "bg-indigo-50 text-indigo-600",
  rose: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
  teal: "bg-teal-50 text-teal-600",
};
export function StatCard({ icon: Icon, label, value, tone = "blue", loading }) {
  return (
    <div className="card flex items-center gap-3 p-3 sm:gap-4 sm:p-5">
      <div className={`shrink-0 rounded-xl p-2 sm:p-3 ${TONES[tone]}`}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium leading-tight text-slate-500 sm:text-sm">{label}</p>
        {loading ? (
          <div className="skeleton mt-1 h-7 w-12" />
        ) : (
          <p className="text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Doctor name */
// Some accounts are already named "Dr. Jane Doe"; never render "Dr. Dr. Jane Doe"
export const drName = (name) =>
  !name ? "Doctor" : /^dr\.?\s/i.test(name.trim()) ? name.trim() : `Dr. ${name.trim()}`;

/* -------------------------------------------------------------- Avatar */
export function initials(name = "") {
  return (
    name
      .replace(/^Dr\.?\s+/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("") || "?"
  );
}
export function Avatar({ name, size = "h-9 w-9 text-sm" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ${size}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
