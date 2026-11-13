import React from "react";

export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const DEFAULT_SESSION = { startTime: "09:00", endTime: "17:00" };
const DEFAULT_BREAK = { startTime: "", endTime: "", title: "Break" };

// Turn a stored schedule into editable per-day rows. Only the first session and
// first break per day are edited; any extra ones are preserved untouched.
export const toDayRows = (schedule = []) =>
  DAYS.map((day) => {
    const found = schedule.find((s) => s.dayOfWeek === day);
    const plain = (list = []) =>
      list.map(({ startTime, endTime, title }) => ({
        startTime,
        endTime,
        ...(title ? { title } : {}),
      }));
    return {
      day,
      works: !!found,
      slot: found?.slotDurationMinutes || 15,
      sessions: found ? plain(found.sessions) : [],
      breaks: found ? plain(found.breaks) : [],
    };
  });

export const fromDayRows = (rows) =>
  rows
    .filter((r) => r.works)
    .map((r) => ({
      dayOfWeek: r.day,
      slotDurationMinutes: Number(r.slot),
      sessions: r.sessions.length ? r.sessions : [DEFAULT_SESSION],
      // an empty break row means "no break"
      breaks: r.breaks.filter((b) => b.startTime && b.endTime),
    }));

/** Read-only weekly schedule. `compact` renders small inline chips. */
export function ScheduleSummary({ schedule, compact = false }) {
  if (!schedule?.length)
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        No availability saved yet — patients cannot be booked with this doctor.
      </p>
    );
  const ordered = DAYS.map((d) => schedule.find((s) => s.dayOfWeek === d)).filter(Boolean);
  if (compact)
    return (
      <ul className="flex flex-wrap gap-2">
        {ordered.map((s) => (
          <li key={s.dayOfWeek} className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm ring-1 ring-inset ring-slate-200">
            <span className="font-semibold text-slate-900">{s.dayOfWeek.slice(0, 3)}</span>{" "}
            <span className="text-slate-600">{s.sessions.map((x) => `${x.startTime}–${x.endTime}`).join(", ")}</span>
          </li>
        ))}
      </ul>
    );
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {DAYS.map((d) => {
        const s = schedule.find((x) => x.dayOfWeek === d);
        return (
          <li
            key={d}
            className={`rounded-xl border p-4 ${s ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50"}`}
          >
            <div className="flex items-center justify-between">
              <p className={`font-semibold ${s ? "text-slate-900" : "text-slate-400"}`}>{d}</p>
              {s ? (
                <span className="badge bg-emerald-50 text-emerald-800 ring-emerald-600/20">Working</span>
              ) : (
                <span className="badge bg-slate-100 text-slate-500 ring-slate-500/20">Day off</span>
              )}
            </div>
            {s && (
              <div className="mt-2 space-y-1 text-sm">
                <p className="font-medium tabular-nums text-slate-800">
                  {s.sessions.map((x) => `${x.startTime} – ${x.endTime}`).join(", ")}
                </p>
                {s.breaks?.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Break {s.breaks.map((b) => `${b.startTime} – ${b.endTime}`).join(", ")}
                  </p>
                )}
                <p className="text-xs text-slate-500">{s.slotDurationMinutes}-minute appointments</p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Weekly availability form. `rows` come from toDayRows(); onChange gets new rows. */
export default function AvailabilityEditor({ rows, onChange }) {
  const updateRow = (index, patch) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const updateFirst = (index, key, field, value, fallback) => {
    const list = rows[index][key].length ? [...rows[index][key]] : [fallback];
    list[0] = { ...list[0], [field]: value };
    updateRow(index, { [key]: list });
  };

  const field = "text-xs font-medium text-slate-500";
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-900">Weekly availability</h3>
      {rows.map((row, i) => (
        <div
          key={row.day}
          className={`rounded-xl border p-3 transition-colors sm:p-4 ${row.works ? "border-brand-200 bg-white" : "border-slate-200 bg-slate-50"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-3 font-semibold text-slate-900">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={row.works}
                onChange={(e) => updateRow(i, { works: e.target.checked })}
              />
              {row.day}
            </label>
            {!row.works && <span className="text-sm text-slate-400">Day off</span>}
          </div>
          {row.works && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <label className={field}>
                Start
                <input
                  required
                  type="time"
                  className="input mt-1"
                  value={row.sessions[0]?.startTime || "09:00"}
                  onChange={(e) =>
                    updateFirst(i, "sessions", "startTime", e.target.value, DEFAULT_SESSION)
                  }
                />
              </label>
              <label className={field}>
                End
                <input
                  required
                  type="time"
                  className="input mt-1"
                  value={row.sessions[0]?.endTime || "17:00"}
                  onChange={(e) =>
                    updateFirst(i, "sessions", "endTime", e.target.value, DEFAULT_SESSION)
                  }
                />
              </label>
              <label className={field}>
                Break from
                <input
                  type="time"
                  className="input mt-1"
                  value={row.breaks[0]?.startTime || ""}
                  onChange={(e) =>
                    updateFirst(i, "breaks", "startTime", e.target.value, DEFAULT_BREAK)
                  }
                />
              </label>
              <label className={field}>
                Break to
                <input
                  type="time"
                  className="input mt-1"
                  value={row.breaks[0]?.endTime || ""}
                  onChange={(e) =>
                    updateFirst(i, "breaks", "endTime", e.target.value, DEFAULT_BREAK)
                  }
                />
              </label>
              <label className={field}>
                Slot (minutes)
                <input
                  aria-label={`Slot minutes for ${row.day}`}
                  type="number"
                  min="5"
                  max="120"
                  className="input mt-1"
                  value={row.slot}
                  onChange={(e) => updateRow(i, { slot: e.target.value })}
                />
              </label>
            </div>
          )}
        </div>
      ))}
      <p className="hint">
        Leave the break times empty for no break. Existing appointments are not
        changed when availability is edited. Additional sessions or breaks that
        already exist are kept as they are.
      </p>
    </div>
  );
}
