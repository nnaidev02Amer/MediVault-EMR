import { useCallback, useEffect, useState } from "react";
import { Calendar, CalendarClock } from "lucide-react";
import api from "../services/api";
import AvailabilityEditor, {
  ScheduleSummary,
  fromDayRows,
  toDayRows,
} from "../components/doctors/AvailabilityEditor";
import {
  Alert,
  Avatar,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  Spinner,
  StatusBadge,
} from "../components/ui";

const prettyDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

export default function MyAvailability() {
  const [profile, setProfile] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [rows, setRows] = useState(null); // non-null while editing
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const me = await api.get("/doctors/me");
      setProfile(me.data.data);
      const appts = await api.get("/appointments", {
        params: { upcoming: true, limit: 10 },
      });
      setUpcoming(appts.data.data || []);
    } catch (err) {
      setProfile(null);
      setError(err.response?.data?.message || "Unable to load your availability.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.patch("/doctors/me/availability", {
        schedule: fromDayRows(rows),
      });
      setProfile(data.data);
      setRows(null);
      setNotice("Availability saved. Receptionists will see these slots immediately.");
    } catch (err) {
      setError(
        err.response?.data?.errors?.join(" ") ||
          err.response?.data?.message ||
          "Could not save availability.",
      );
    } finally {
      setSaving(false);
    }
  }

  const workingDays = profile?.schedule?.length || 0;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Doctor"
        title="My Availability"
        subtitle="Set your working days, hours, breaks and appointment length."
        actions={
          profile &&
          !rows && (
            <button
              onClick={() => {
                setNotice("");
                setError("");
                setRows(toDayRows(profile.schedule));
              }}
              className="btn btn-primary"
            >
              <CalendarClock className="h-4 w-4" />
              {workingDays ? "Edit availability" : "Set availability"}
            </button>
          )
        }
      />

      {notice && <Alert type="success" onDismiss={() => setNotice("")}>{notice}</Alert>}
      {error && profile && <Alert type="error" onDismiss={() => setError("")}>{error}</Alert>}

      {loading ? (
        <div className="card">
          <ListSkeleton rows={4} label="Loading your availability…" />
        </div>
      ) : !profile ? (
        <div className="card">
          <ErrorState message={error || "No doctor profile found."} onRetry={load} />
        </div>
      ) : (
        <>
          <div className="card card-body">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={profile.userId?.name} size="h-11 w-11 text-sm" />
                <div>
                  <h2 className="card-title">Weekly schedule</h2>
                  <p className="text-sm text-slate-500">
                    {profile.department} · {profile.specialization}
                    {" · "}
                    {workingDays ? `${workingDays} working day${workingDays > 1 ? "s" : ""}` : "no working days set"}
                  </p>
                </div>
              </div>
            </div>
            {rows ? (
              <form onSubmit={save} className="space-y-5">
                <AvailabilityEditor rows={rows} onChange={setRows} />
                <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
                  <button type="button" onClick={() => setRows(null)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button disabled={saving} className="btn btn-primary">
                    {saving && <Spinner className="h-4 w-4" />}
                    {saving ? "Saving…" : "Save availability"}
                  </button>
                </div>
              </form>
            ) : (
              <ScheduleSummary schedule={profile.schedule} />
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
              <h2 className="card-title">Upcoming appointments</h2>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No upcoming appointments"
                message="Booked appointments from today onwards will appear here."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcoming.map((a) => (
                  <li key={a._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                    <div className="w-28 shrink-0">
                      <p className="text-sm font-semibold text-slate-900">{prettyDate(a.appointmentDate)}</p>
                      <p className="text-xs tabular-nums text-slate-500">
                        {a.slotStartTime}–{a.slotEndTime}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={a.patientId?.name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{a.patientId?.name || "N/A"}</p>
                        <p className="truncate text-xs text-slate-500">{a.purpose}</p>
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
