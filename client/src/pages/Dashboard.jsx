import React, { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import socket from "../services/socket";
import { AuthContext } from "../context/AuthContext";
import SlotGrid from "../components/appointments/SlotGrid";
import { ScheduleSummary } from "../components/doctors/AvailabilityEditor";
import {
  Alert,
  Avatar,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Modal,
  PageHeader,
  STATUS_COLORS,
  Spinner,
  StatCard,
  StatusBadge,
  ROLE_LABELS,
  drName,
} from "../components/ui";
import {
  Calendar,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  Search,
  Stethoscope,
  UserCheck,
  UserCog,
  Users,
  X,
} from "lucide-react";

const localToday = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// "2026-11-16" -> "Mon, 16 Nov 2026" (parsed as a plain date, no timezone shift)
const prettyDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const STATUS_ORDER = ["Scheduled", "Arrived", "Completed", "Cancelled"];

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const isStaff = ["SUPER_ADMIN", "RECEPTIONIST"].includes(user?.role);
  const isDoctor = user?.role === "DOCTOR";
  const isAdmin = user?.role === "SUPER_ADMIN";

  const [notice, setNotice] = useState(null); // { type, text }
  const [profile, setProfile] = useState(null);

  // Reschedule modal state
  const [resTarget, setResTarget] = useState(null);
  const [resDate, setResDate] = useState("");
  const [resSlots, setResSlots] = useState([]);
  const [resSlot, setResSlot] = useState(null);
  const [resLoading, setResLoading] = useState(false);
  const [resBusy, setResBusy] = useState(false);
  const [resError, setResError] = useState("");

  // Confirm dialog (cancel / complete)
  const [confirm, setConfirm] = useState(null); // { kind, app }
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Appointments & Meta State
  const [appointments, setAppointments] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [systemStats, setSystemStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter & Pagination States
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const hasFilters = !!(search || statusFilter || departmentFilter || dateFilter);

  // Edit / Notes Modal State
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [notesInput, setNotesInput] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Fetch Appointments from Backend
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page,
        limit: 10,
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(departmentFilter && { department: departmentFilter }),
        ...(dateFilter && { date: dateFilter }),
      });

      const response = await api.get(`/appointments?${params.toString()}`);
      setAppointments(response.data.data);
      setMeta(response.data.meta);
      try {
        const statsResponse = await api.get("/dashboard/stats");
        setSystemStats(statsResponse.data.data || {});
      } catch {
        setSystemStats({});
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, departmentFilter, dateFilter]);

  // Initial Load & Real-Time Socket Updates
  useEffect(() => {
    fetchAppointments();

    socket.connect();
    socket.on("appointmentUpdated", () => {
      fetchAppointments();
    });

    return () => {
      socket.off("appointmentUpdated");
      socket.disconnect();
    };
  }, [fetchAppointments]);

  // Doctor: load own profile & schedule
  useEffect(() => {
    if (user?.role !== "DOCTOR") return;
    api
      .get("/doctors")
      .then((res) =>
        setProfile(
          (res.data.data || []).find((d) => d.userId?._id === user.id) || null,
        ),
      )
      .catch(() => setProfile(null));
  }, [user]);

  // Reschedule: load slots for the chosen date
  useEffect(() => {
    if (!resTarget || !resDate) return;
    let cancelled = false;
    setResLoading(true);
    setResSlot(null);
    api
      .get("/slots", {
        params: { doctorId: resTarget.doctorId?._id, date: resDate },
      })
      .then((res) => !cancelled && setResSlots(res.data.data || []))
      .catch((err) => {
        if (cancelled) return;
        setResSlots([]);
        setResError(err.response?.data?.message || "Failed to load slots");
      })
      .finally(() => !cancelled && setResLoading(false));
    return () => {
      cancelled = true;
    };
  }, [resTarget, resDate]);

  const openReschedule = (app) => {
    setResTarget(app);
    setResDate(app.appointmentDate);
    setResSlot(null);
    setResError("");
  };

  const handleReschedule = async () => {
    if (!resSlot) return setResError("Please select a new time slot.");
    setResBusy(true);
    setResError("");
    try {
      await api.post(`/appointments/${resTarget._id}/reschedule`, {
        appointmentDate: resDate,
        slotStartTime: resSlot.startTime,
        slotEndTime: resSlot.endTime,
      });
      setResTarget(null);
      setNotice({ type: "success", text: "Appointment rescheduled." });
      fetchAppointments();
    } catch (err) {
      setResError(err.response?.data?.message || "Failed to reschedule");
    } finally {
      setResBusy(false);
    }
  };

  const handleMarkArrived = async (id) => {
    try {
      await api.post(`/appointments/${id}/arrive`);
      setNotice({ type: "success", text: "Patient marked as arrived." });
      fetchAppointments();
    } catch (err) {
      setNotice({ type: "error", text: err.response?.data?.message || "Failed to mark patient as arrived" });
    }
  };

  // Cancel / Complete both go through the confirm dialog
  const runConfirmed = async () => {
    const { kind, app } = confirm;
    setConfirmBusy(true);
    try {
      if (kind === "cancel") {
        await api.delete(`/appointments/${app._id}`);
        setNotice({ type: "success", text: "Appointment cancelled." });
      } else {
        await api.put(`/appointments/${app._id}`, { status: "Completed" });
        setNotice({ type: "success", text: "Consultation marked as completed." });
      }
      setConfirm(null);
      fetchAppointments();
    } catch (err) {
      setConfirm(null);
      setNotice({
        type: "error",
        text:
          err.response?.data?.message ||
          (kind === "cancel" ? "Failed to cancel appointment" : "Failed to complete consultation"),
      });
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedAppointment) return;
    setSavingNotes(true);
    try {
      await api.put(`/appointments/${selectedAppointment._id}`, {
        notes: notesInput,
      });
      setSelectedAppointment(null);
      setNotice({ type: "success", text: "Notes saved." });
      fetchAppointments();
    } catch (err) {
      setNotice({ type: "error", text: err.response?.data?.message || "Failed to save notes" });
      setSelectedAppointment(null);
    } finally {
      setSavingNotes(false);
    }
  };

  // Helper Stats Counters
  const statusCount = (s) =>
    systemStats.statuses?.[s] ?? appointments.filter((a) => a.status === s).length;
  const stats = {
    total: systemStats.appointments ?? meta.total ?? 0,
    scheduled: statusCount("Scheduled"),
    arrived: statusCount("Arrived"),
    completed: statusCount("Completed"),
  };
  const statusTotal = STATUS_ORDER.reduce((n, s) => n + statusCount(s), 0);
  const statsLoading = loading && !Object.keys(systemStats).length;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setDepartmentFilter("");
    setDateFilter("");
    setPage(1);
  };

  const renderActions = (app) => (
    <>
      {isStaff && app.status === "Scheduled" && (
        <button onClick={() => handleMarkArrived(app._id)} className="btn btn-success btn-sm">
          <UserCheck className="h-3.5 w-3.5" /> Mark Arrived
        </button>
      )}
      {isDoctor && (
        <>
          <button
            onClick={() => navigate("/patients", { state: { openPatientId: app.patientId?._id } })}
            className="btn btn-secondary btn-sm"
          >
            Patient Record
          </button>
          <button
            onClick={() => {
              setSelectedAppointment(app);
              setNotesInput(app.notes || "");
            }}
            className="btn btn-soft btn-sm"
          >
            Update Notes
          </button>
          {["Scheduled", "Arrived"].includes(app.status) && (
            <button onClick={() => setConfirm({ kind: "complete", app })} className="btn btn-primary btn-sm">
              <CheckCircle2 className="h-3.5 w-3.5" /> Complete
            </button>
          )}
        </>
      )}
      {isStaff && ["Scheduled", "Arrived"].includes(app.status) && (
        <button onClick={() => openReschedule(app)} className="btn btn-soft btn-sm">
          <CalendarClock className="h-3.5 w-3.5" /> Reschedule
        </button>
      )}
      {isStaff && app.status !== "Cancelled" && app.status !== "Completed" && (
        <button onClick={() => setConfirm({ kind: "cancel", app })} className="btn btn-danger-soft btn-sm">
          Cancel
        </button>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ROLE_LABELS[user?.role]}
        title={`Welcome back, ${user?.name ?? ""}`}
        subtitle="Central EMR appointment dashboard"
        actions={
          <>
            {isStaff && (
              <button onClick={() => navigate("/scheduler")} className="btn btn-primary">
                <CalendarPlus className="h-4 w-4" /> Book Appointment
              </button>
            )}
            <button onClick={fetchAppointments} className="btn btn-secondary" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh Data
            </button>
          </>
        }
      />

      {notice && (
        <Alert type={notice.type} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      {isDoctor && (
        <section className="card card-body" aria-label="My profile">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size="h-12 w-12 text-base" />
              <div>
                <h2 className="card-title">My profile</h2>
                {profile ? (
                  <p className="text-sm text-slate-500">
                    {profile.department} · {profile.specialization}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">
                    No doctor profile is linked to your account yet. Contact an administrator.
                  </p>
                )}
              </div>
            </div>
            <button onClick={() => navigate("/availability")} className="btn btn-primary btn-sm">
              <Clock className="h-4 w-4" /> Manage my availability
            </button>
          </div>
          {profile && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Weekly schedule</p>
              <ScheduleSummary schedule={profile.schedule} compact />
            </div>
          )}
        </section>
      )}

      {isAdmin && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatCard icon={Users} tone="violet" label="Registered Patients" value={systemStats.patients ?? "—"} loading={statsLoading} />
          <StatCard icon={Stethoscope} tone="teal" label="Doctor Profiles" value={systemStats.doctors ?? "—"} loading={statsLoading} />
          <StatCard icon={UserCog} tone="blue" label="Active Staff Accounts" value={systemStats.activeUsers ?? "—"} loading={statsLoading} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Calendar} tone="blue" label="Total Appointments" value={stats.total} loading={statsLoading} />
        <StatCard icon={Clock} tone="amber" label="Scheduled" value={stats.scheduled} loading={statsLoading} />
        <StatCard icon={UserCheck} tone="emerald" label="Arrived" value={stats.arrived} loading={statsLoading} />
        <StatCard icon={CheckCircle2} tone="indigo" label="Completed" value={stats.completed} loading={statsLoading} />
      </div>

      {/* Status distribution chart */}
      <section className="card card-body" aria-label="Appointments by status">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="card-title">Appointments by status</h2>
          <p className="text-sm text-slate-500">{statusTotal} total</p>
        </div>
        {statusTotal === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No appointment data to chart yet.</p>
        ) : (
          <>
            <div
              className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
              role="img"
              aria-label={STATUS_ORDER.map((s) => `${s}: ${statusCount(s)}`).join(", ")}
            >
              {STATUS_ORDER.map(
                (s) =>
                  statusCount(s) > 0 && (
                    <div
                      key={s}
                      className={STATUS_COLORS[s]}
                      style={{ width: `${(statusCount(s) / statusTotal) * 100}%` }}
                      title={`${s}: ${statusCount(s)}`}
                    />
                  ),
              )}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:flex sm:flex-wrap">
              {STATUS_ORDER.map((s) => (
                <li key={s} className="flex items-center gap-2 text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[s]}`} />
                  {s}
                  <span className="font-semibold tabular-nums text-slate-900">{statusCount(s)}</span>
                  <span className="text-slate-400">({Math.round((statusCount(s) / statusTotal) * 100)}%)</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Search & Filter Bar */}
      <section className="card card-body" aria-label="Filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              aria-label="Search appointments"
              placeholder="Search name, phone, ID…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="input pl-9"
            />
          </div>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="input"
          >
            <option value="">All statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="text"
            aria-label="Filter by department"
            placeholder="Filter department…"
            value={departmentFilter}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
              setPage(1);
            }}
            className="input"
          />
          <input
            type="date"
            aria-label="Filter by date"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            className="input"
          />
        </div>
        {hasFilters && (
          <div className="mt-3">
            <button onClick={clearFilters} className="btn btn-ghost btn-sm">
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          </div>
        )}
      </section>

      {/* Appointments */}
      <section className="card overflow-hidden" aria-label="Appointments">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 className="card-title">{isDoctor ? "My appointments" : "Appointments"}</h2>
          {loading && appointments.length > 0 && <Spinner className="h-4 w-4 text-slate-400" />}
        </div>

        {loading && appointments.length === 0 ? (
          <ListSkeleton rows={5} label="Loading appointments…" />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchAppointments} />
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={hasFilters ? "No appointments match your filters" : "No appointments found"}
            message={
              hasFilters
                ? "Try changing or clearing the filters."
                : isDoctor
                  ? "Appointments assigned to you will appear here."
                  : "Booked appointments will appear here."
            }
            action={
              hasFilters ? (
                <button onClick={clearFilters} className="btn btn-secondary btn-sm">Clear filters</button>
              ) : isStaff ? (
                <button onClick={() => navigate("/scheduler")} className="btn btn-primary btn-sm">
                  <CalendarPlus className="h-4 w-4" /> Book Appointment
                </button>
              ) : null
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="table-th">Patient</th>
                    <th className="table-th">{isDoctor ? "Department" : "Doctor / Dept"}</th>
                    <th className="table-th">Date &amp; Time</th>
                    <th className="table-th">Purpose / Notes</th>
                    <th className="table-th">Status</th>
                    <th className="table-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appointments.map((app) => (
                    <tr key={app._id} className="hover:bg-slate-50/70">
                      <td className="table-td">
                        <div className="flex items-center gap-3">
                          <Avatar name={app.patientId?.name} />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{app.patientId?.name || "N/A"}</p>
                            <p className="text-xs text-slate-500">
                              {app.patientId?.patientId} · {app.patientId?.mobile}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="table-td">
                        {!isDoctor && (
                          <p className="font-medium text-slate-900">{app.doctorId?.userId?.name ? drName(app.doctorId.userId.name) : "Assigned Doctor"}</p>
                        )}
                        <p className={isDoctor ? "font-medium text-slate-900" : "text-xs text-brand-600"}>{app.department}</p>
                      </td>
                      <td className="table-td whitespace-nowrap">
                        <p className="font-medium text-slate-900">{prettyDate(app.appointmentDate)}</p>
                        <p className="text-xs text-slate-500">
                          {app.slotStartTime} – {app.slotEndTime}
                        </p>
                      </td>
                      <td className="table-td max-w-[16rem]">
                        <p className="text-slate-900">{app.purpose}</p>
                        {app.notes && <p className="mt-0.5 line-clamp-2 text-xs italic text-slate-500">“{app.notes}”</p>}
                      </td>
                      <td className="table-td">
                        <StatusBadge status={app.status} />
                      </td>
                      <td className="table-td">
                        <div className="flex flex-wrap justify-end gap-1.5">{renderActions(app)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {appointments.map((app) => (
                <li key={app._id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={app.patientId?.name} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{app.patientId?.name || "N/A"}</p>
                        <p className="truncate text-xs text-slate-500">
                          {app.patientId?.patientId} · {app.patientId?.mobile}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Date</dt>
                      <dd className="font-medium text-slate-900">{prettyDate(app.appointmentDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Time</dt>
                      <dd className="font-medium text-slate-900">
                        {app.slotStartTime} – {app.slotEndTime}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">{isDoctor ? "Department" : "Doctor"}</dt>
                      {!isDoctor && (
                        <dd className="text-slate-900">{app.doctorId?.userId?.name ? drName(app.doctorId.userId.name) : "Assigned Doctor"}</dd>
                      )}
                      <dd className={isDoctor ? "text-slate-900" : "text-xs text-brand-600"}>{app.department}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Purpose</dt>
                      <dd className="text-slate-900">{app.purpose}</dd>
                    </div>
                  </dl>
                  {app.notes && <p className="rounded-lg bg-slate-50 p-2 text-xs italic text-slate-600">“{app.notes}”</p>}
                  <div className="flex flex-wrap gap-2">{renderActions(app)}</div>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Pagination Footer */}
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span className="text-slate-500">
            Page <span className="font-semibold text-slate-800">{meta.page}</span> of{" "}
            <span className="font-semibold text-slate-800">{meta.pages || 1}</span> ({meta.total} total)
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="btn btn-secondary btn-sm"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button
              disabled={page >= meta.pages}
              onClick={() => setPage((p) => p + 1)}
              className="btn btn-secondary btn-sm"
              aria-label="Next page"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "cancel" ? "Cancel this appointment?" : "Mark consultation as completed?"}
          message={
            confirm.kind === "cancel"
              ? `${confirm.app.patientId?.name}'s appointment on ${prettyDate(confirm.app.appointmentDate)} at ${confirm.app.slotStartTime} will be cancelled and the slot freed.`
              : `${confirm.app.patientId?.name}'s consultation will be marked as completed.`
          }
          confirmLabel={confirm.kind === "cancel" ? "Cancel appointment" : "Mark completed"}
          tone={confirm.kind === "cancel" ? "danger" : "primary"}
          busy={confirmBusy}
          onConfirm={runConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Reschedule Modal */}
      {resTarget && (
        <Modal
          title={`Reschedule ${resTarget.patientId?.name}`}
          subtitle={`${drName(resTarget.doctorId?.userId?.name)} · currently ${prettyDate(resTarget.appointmentDate)} ${resTarget.slotStartTime}`}
          onClose={() => setResTarget(null)}
          footer={
            <>
              <button onClick={() => setResTarget(null)} className="btn btn-secondary">
                Close
              </button>
              <button disabled={resBusy || !resSlot} onClick={handleReschedule} className="btn btn-primary">
                {resBusy && <Spinner className="h-4 w-4" />}
                {resBusy ? "Saving…" : resSlot ? `Move to ${resSlot.startTime}` : "Select a slot"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {resError && <Alert type="error">{resError}</Alert>}
            <div>
              <label htmlFor="res-date" className="label">New date</label>
              <input
                id="res-date"
                type="date"
                value={resDate}
                min={localToday()}
                onChange={(e) => setResDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <p className="label">Available time slots</p>
              <SlotGrid slots={resSlots} selectedSlot={resSlot} onSelectSlot={setResSlot} loading={resLoading} />
            </div>
          </div>
        </Modal>
      )}

      {/* Consultation Notes Modal for Doctor */}
      {selectedAppointment && (
        <Modal
          title="Consultation notes"
          subtitle={`${selectedAppointment.patientId?.name} · ${prettyDate(selectedAppointment.appointmentDate)} ${selectedAppointment.slotStartTime}`}
          onClose={() => setSelectedAppointment(null)}
          footer={
            <>
              <button onClick={() => setSelectedAppointment(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button disabled={savingNotes} onClick={handleSaveNotes} className="btn btn-primary">
                {savingNotes && <Spinner className="h-4 w-4" />}
                {savingNotes ? "Saving…" : "Save Notes"}
              </button>
            </>
          }
        >
          <label htmlFor="consult-notes" className="label">Notes</label>
          <textarea
            id="consult-notes"
            rows={5}
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            placeholder="Type consultation notes or diagnosis details…"
            className="input"
          />
        </Modal>
      )}
    </div>
  );
}
