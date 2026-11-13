import { useContext, useEffect, useMemo, useState } from "react";
import { Pencil, Search, Stethoscope, UserPlus, Users, X } from "lucide-react";
import api from "../services/api";
import { AuthContext } from "../context/AuthContext";
import AvailabilityEditor, {
  fromDayRows,
  toDayRows,
} from "../components/doctors/AvailabilityEditor";
import {
  ActiveBadge,
  Alert,
  Avatar,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Modal,
  PageHeader,
  Spinner,
  drName,
} from "../components/ui";

const blank = { name: "", email: "", password: "", role: "RECEPTIONIST" };
const blankDoctor = { userId: "", department: "", specialization: "" };

export default function UserManagement() {
  const { user: me } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState(blank);
  const [doctorForm, setDoctorForm] = useState(blankDoctor);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [editDoctor, setEditDoctor] = useState(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateDoctor, setShowCreateDoctor] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(null);
  const [tab, setTab] = useState("users");

  // Users table filters
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  async function reload() {
    setLoading(true);
    setLoadError("");
    try {
      const { data } = await api.get("/users");
      setUsers(data.data || []);
      const doctorsResponse = await api.get("/doctors");
      setDoctors(doctorsResponse.data.data || []);
    } catch (err) {
      setLoadError(err.response?.data?.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    reload();
  }, []);

  function resetMessages() {
    setFeedback("");
    setError("");
  }

  async function createUser(event) {
    event.preventDefault();
    setBusy(true);
    resetMessages();
    try {
      await api.post("/users", form);
      setForm(blank);
      setShowCreateUser(false);
      setFeedback("User account created.");
      await reload();
    } catch (err) {
      setError(
        err.response?.data?.errors?.join(" ") ||
          err.response?.data?.message ||
          "Could not create user.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createDoctorProfile(event) {
    event.preventDefault();
    setBusy(true);
    resetMessages();
    try {
      await api.post("/doctors", {
        ...doctorForm,
        schedule: [
          {
            dayOfWeek: "Monday",
            slotDurationMinutes: 15,
            sessions: [{ startTime: "09:00", endTime: "17:00" }],
            breaks: [{ startTime: "13:00", endTime: "14:00", title: "Lunch" }],
          },
        ],
      });
      setDoctorForm(blankDoctor);
      setShowCreateDoctor(false);
      setTab("doctors");
      setFeedback(
        "Doctor profile created with the sample Monday schedule. Update hours before use.",
      );
      await reload();
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not create doctor profile.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveUser(event) {
    event.preventDefault();
    setBusy(true);
    resetMessages();
    try {
      const body = { name: editUser.name };
      if (editUser.password) body.password = editUser.password;
      await api.patch(`/users/${editUser._id}`, body);
      setEditUser(null);
      setFeedback("User details updated.");
      await reload();
    } catch (err) {
      setError(
        err.response?.data?.errors?.join(" ") ||
          err.response?.data?.message ||
          "Could not update user.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveDoctor(event) {
    event.preventDefault();
    setBusy(true);
    resetMessages();
    try {
      await api.patch(`/doctors/${editDoctor._id}`, {
        department: editDoctor.department,
        specialization: editDoctor.specialization,
        schedule: fromDayRows(editDoctor.rows),
      });
      setEditDoctor(null);
      setFeedback("Doctor profile and schedule updated.");
      await reload();
    } catch (err) {
      setError(
        err.response?.data?.errors?.join(" ") ||
          err.response?.data?.message ||
          "Could not update doctor profile.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(user, role) {
    resetMessages();
    try {
      await api.patch(`/users/${user._id}`, { role });
      setFeedback(`Updated ${user.name}'s role.`);
      await reload();
    } catch (err) {
      setError(err.response?.data?.message || "Could not update role.");
    }
  }

  async function toggleActive() {
    const user = confirmToggle;
    setBusy(true);
    resetMessages();
    try {
      await api.patch(`/users/${user._id}`, { isActive: !user.isActive });
      setFeedback("Account status updated.");
      setConfirmToggle(null);
      await reload();
    } catch (err) {
      setConfirmToggle(null);
      setError(err.response?.data?.message || "Could not update account.");
    } finally {
      setBusy(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) =>
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (!roleFilter || u.role === roleFilter) &&
        (!statusFilter || String(u.isActive) === statusFilter),
    );
  }, [users, query, roleFilter, statusFilter]);
  const filtersActive = !!(query || roleFilter || statusFilter);

  const eligibleDoctorUsers = users.filter(
    (u) => u.role === "DOCTOR" && u.isActive && !doctors.some((d) => d.userId?._id === u._id),
  );

  const RoleSelect = ({ user }) => (
    <select
      aria-label={`Role for ${user.name}`}
      className="input w-auto py-1.5"
      value={user.role}
      disabled={user._id === me?.id}
      title={user._id === me?.id ? "You cannot change your own role" : undefined}
      onChange={(e) => changeRole(user, e.target.value)}
    >
      <option value="SUPER_ADMIN">Super Admin</option>
      <option value="RECEPTIONIST">Receptionist</option>
      <option value="DOCTOR">Doctor</option>
    </select>
  );

  const UserActions = ({ user }) => (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setEditUser({ _id: user._id, name: user.name, password: "" })}
        className="btn btn-secondary btn-sm"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </button>
      <button
        onClick={() => setConfirmToggle(user)}
        disabled={user._id === me?.id}
        title={user._id === me?.id ? "You cannot deactivate your own account" : undefined}
        className={`btn btn-sm ${user.isActive ? "btn-danger-soft" : "btn-soft"}`}
      >
        {user.isActive ? "Deactivate" : "Activate"}
      </button>
    </div>
  );

  const scheduleChips = (doctor) =>
    doctor.schedule?.length ? (
      <div className="flex flex-wrap gap-1.5">
        {doctor.schedule.map((s) => (
          <span key={s.dayOfWeek} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            <span className="font-semibold">{s.dayOfWeek.slice(0, 3)}</span>{" "}
            {s.sessions.map((x) => `${x.startTime}–${x.endTime}`).join(", ")}
          </span>
        ))}
      </div>
    ) : (
      <span className="text-sm text-amber-700">No schedule set</span>
    );

  const openDoctorEditor = (doctor) =>
    setEditDoctor({
      _id: doctor._id,
      name: doctor.userId?.name,
      department: doctor.department,
      specialization: doctor.specialization,
      rows: toDayRows(doctor.schedule),
    });

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="User management"
        subtitle="Create staff accounts, manage role access and doctor schedules."
        actions={
          <>
            <button onClick={() => setShowCreateDoctor(true)} className="btn btn-secondary">
              <Stethoscope className="h-4 w-4" /> Add doctor profile
            </button>
            <button onClick={() => { resetMessages(); setShowCreateUser(true); }} className="btn btn-primary">
              <UserPlus className="h-4 w-4" /> Create user
            </button>
          </>
        }
      />

      {feedback && <Alert type="success" onDismiss={() => setFeedback("")}>{feedback}</Alert>}
      {error && !showCreateUser && !showCreateDoctor && !editUser && !editDoctor && (
        <Alert type="error" onDismiss={() => setError("")}>{error}</Alert>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div role="tablist" className="-mb-px flex gap-6">
          {[
            ["users", "User accounts", users.length],
            ["doctors", "Doctor profiles", doctors.length],
          ].map(([key, label, count]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`border-b-2 pb-3 text-sm font-semibold transition-colors ${
                tab === key
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loadError ? (
          <ErrorState message={loadError} onRetry={reload} />
        ) : loading && !users.length ? (
          <ListSkeleton rows={6} label="Loading user accounts…" />
        ) : tab === "users" ? (
          <>
            <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_12rem_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  aria-label="Search users"
                  placeholder="Search by name or email…"
                  className="input pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select aria-label="Filter by role" className="input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="">All roles</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="RECEPTIONIST">Receptionist</option>
                <option value="DOCTOR">Doctor</option>
              </select>
              <select aria-label="Filter by status" className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
              {filtersActive && (
                <button
                  onClick={() => { setQuery(""); setRoleFilter(""); setStatusFilter(""); }}
                  className="btn btn-ghost"
                >
                  <X className="h-4 w-4" /> Clear
                </button>
              )}
            </div>

            {filteredUsers.length === 0 ? (
              <EmptyState
                icon={Users}
                title={filtersActive ? "No users match your filters" : "No users found"}
                message={filtersActive ? "Try a different search or clear the filters." : "Create the first staff account to get started."}
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th className="table-th">User</th>
                        <th className="table-th">Role</th>
                        <th className="table-th">Status</th>
                        <th className="table-th">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((user) => (
                        <tr key={user._id} className="hover:bg-slate-50/70">
                          <td className="table-td">
                            <div className="flex items-center gap-3">
                              <Avatar name={user.name} />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900">
                                  {user.name}
                                  {user._id === me?.id && <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>}
                                </p>
                                <p className="truncate text-xs text-slate-500">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="table-td"><RoleSelect user={user} /></td>
                          <td className="table-td"><ActiveBadge active={user.isActive} /></td>
                          <td className="table-td"><UserActions user={user} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="divide-y divide-slate-100 md:hidden">
                  {filteredUsers.map((user) => (
                    <li key={user._id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={user.name} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                              {user.name}
                              {user._id === me?.id && <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>}
                            </p>
                            <p className="truncate text-xs text-slate-500">{user.email}</p>
                          </div>
                        </div>
                        <ActiveBadge active={user.isActive} />
                      </div>
                      <RoleSelect user={user} />
                      <UserActions user={user} />
                    </li>
                  ))}
                </ul>
                <p className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
                  Showing {filteredUsers.length} of {users.length} accounts
                </p>
              </>
            )}
          </>
        ) : doctors.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No doctor profiles yet"
            message="Create a user with the Doctor role, then add a doctor profile for them."
            action={<button onClick={() => setShowCreateDoctor(true)} className="btn btn-primary btn-sm">Add doctor profile</button>}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="table-th">Doctor</th>
                    <th className="table-th">Department</th>
                    <th className="table-th">Specialization</th>
                    <th className="table-th">Working days</th>
                    <th className="table-th">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {doctors.map((doctor) => (
                    <tr key={doctor._id} className="hover:bg-slate-50/70">
                      <td className="table-td">
                        <div className="flex items-center gap-3">
                          <Avatar name={doctor.userId?.name} />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{doctor.userId?.name ? drName(doctor.userId.name) : "Unknown"}</p>
                            <p className="truncate text-xs text-slate-500">
                              {doctor.userId?.email}
                              {doctor.userId?.isActive === false && " (inactive)"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="table-td">{doctor.department}</td>
                      <td className="table-td">{doctor.specialization}</td>
                      <td className="table-td max-w-sm">{scheduleChips(doctor)}</td>
                      <td className="table-td">
                        <button onClick={() => openDoctorEditor(doctor)} className="btn btn-secondary btn-sm">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden">
              {doctors.map((doctor) => (
                <li key={doctor._id} className="space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={doctor.userId?.name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{doctor.userId?.name ? drName(doctor.userId.name) : "Unknown"}</p>
                      <p className="truncate text-xs text-slate-500">
                        {doctor.department} · {doctor.specialization}
                        {doctor.userId?.isActive === false && " (inactive)"}
                      </p>
                    </div>
                  </div>
                  {scheduleChips(doctor)}
                  <button onClick={() => openDoctorEditor(doctor)} className="btn btn-secondary btn-sm">
                    <Pencil className="h-3.5 w-3.5" /> Edit profile &amp; schedule
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Create user */}
      {showCreateUser && (
        <Modal
          title="Create account"
          subtitle="The user signs in with this email and temporary password."
          onClose={() => setShowCreateUser(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateUser(false)}>Cancel</button>
              <button type="submit" form="create-user-form" disabled={busy} className="btn btn-primary">
                {busy ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {busy ? "Creating…" : "Create user"}
              </button>
            </>
          }
        >
          <form id="create-user-form" onSubmit={createUser} className="space-y-4">
            {error && <Alert type="error">{error}</Alert>}
            <div>
              <label htmlFor="cu-name" className="label">Name</label>
              <input id="cu-name" required minLength="2" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="cu-email" className="label">Email</label>
              <input id="cu-email" required type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label htmlFor="cu-pass" className="label">Temporary password</label>
              <input id="cu-pass" required minLength="10" type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <p className="hint">At least 10 characters.</p>
            </div>
            <div>
              <label htmlFor="cu-role" className="label">Role</label>
              <select id="cu-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="RECEPTIONIST">Receptionist</option>
                <option value="DOCTOR">Doctor</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
              <p className="hint">Super Admins have full access, including user management.</p>
            </div>
          </form>
        </Modal>
      )}

      {/* Add doctor profile */}
      {showCreateDoctor && (
        <Modal
          title="Add doctor profile"
          subtitle="Links clinical details and a starter schedule to a Doctor account."
          onClose={() => setShowCreateDoctor(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateDoctor(false)}>Cancel</button>
              <button type="submit" form="create-doctor-form" disabled={busy || !doctorForm.userId} className="btn btn-primary">
                {busy && <Spinner className="h-4 w-4" />}
                Create doctor profile
              </button>
            </>
          }
        >
          <form id="create-doctor-form" onSubmit={createDoctorProfile} className="space-y-4">
            {error && <Alert type="error">{error}</Alert>}
            {eligibleDoctorUsers.length === 0 && (
              <Alert type="warning">
                No active Doctor accounts without a profile. Create a user with the Doctor role first.
              </Alert>
            )}
            <div>
              <label htmlFor="cd-user" className="label">Doctor account</label>
              <select id="cd-user" required className="input" value={doctorForm.userId} onChange={(e) => setDoctorForm({ ...doctorForm, userId: e.target.value })}>
                <option value="">Select doctor account</option>
                {eligibleDoctorUsers.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name} · {user.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cd-dept" className="label">Department</label>
                <input id="cd-dept" required className="input" value={doctorForm.department} onChange={(e) => setDoctorForm({ ...doctorForm, department: e.target.value })} />
              </div>
              <div>
                <label htmlFor="cd-spec" className="label">Specialization</label>
                <input id="cd-spec" required className="input" value={doctorForm.specialization} onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })} />
              </div>
            </div>
            <p className="hint">A sample Monday 09:00–17:00 schedule is added; edit it afterwards.</p>
          </form>
        </Modal>
      )}

      {/* Edit user */}
      {editUser && (
        <Modal
          title="Edit user"
          onClose={() => setEditUser(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>Cancel</button>
              <button type="submit" form="edit-user-form" disabled={busy} className="btn btn-primary">
                {busy && <Spinner className="h-4 w-4" />}
                {busy ? "Saving…" : "Save changes"}
              </button>
            </>
          }
        >
          <form id="edit-user-form" onSubmit={saveUser} className="space-y-4">
            {error && <Alert type="error">{error}</Alert>}
            <div>
              <label htmlFor="eu-name" className="label">Name</label>
              <input id="eu-name" required minLength="2" className="input" value={editUser.name} onChange={(e) => setEditUser({ ...editUser, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="eu-pass" className="label">New password</label>
              <input id="eu-pass" type="password" minLength="10" className="input" value={editUser.password} onChange={(e) => setEditUser({ ...editUser, password: e.target.value })} />
              <p className="hint">Leave blank to keep the current password. Changing it signs the user out.</p>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit doctor */}
      {editDoctor && (
        <Modal
          size="xl"
          title={`Edit ${drName(editDoctor.name)}`}
          subtitle="Profile details and weekly availability"
          onClose={() => setEditDoctor(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditDoctor(null)}>Cancel</button>
              <button type="submit" form="edit-doctor-form" disabled={busy} className="btn btn-primary">
                {busy && <Spinner className="h-4 w-4" />}
                {busy ? "Saving…" : "Save doctor profile"}
              </button>
            </>
          }
        >
          <form id="edit-doctor-form" onSubmit={saveDoctor} className="space-y-5">
            {error && <Alert type="error">{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ed-dept" className="label">Department</label>
                <input id="ed-dept" required className="input" value={editDoctor.department} onChange={(e) => setEditDoctor({ ...editDoctor, department: e.target.value })} />
              </div>
              <div>
                <label htmlFor="ed-spec" className="label">Specialization</label>
                <input id="ed-spec" required className="input" value={editDoctor.specialization} onChange={(e) => setEditDoctor({ ...editDoctor, specialization: e.target.value })} />
              </div>
            </div>
            <AvailabilityEditor rows={editDoctor.rows} onChange={(rows) => setEditDoctor({ ...editDoctor, rows })} />
          </form>
        </Modal>
      )}

      {/* Activate / deactivate confirmation */}
      {confirmToggle && (
        <ConfirmDialog
          title={`${confirmToggle.isActive ? "Deactivate" : "Activate"} ${confirmToggle.name}?`}
          message={
            confirmToggle.isActive
              ? "They will be signed out and unable to log in until reactivated. Their data is kept."
              : "They will be able to log in again."
          }
          confirmLabel={confirmToggle.isActive ? "Deactivate" : "Activate"}
          tone={confirmToggle.isActive ? "danger" : "primary"}
          busy={busy}
          onConfirm={toggleActive}
          onCancel={() => setConfirmToggle(null)}
        />
      )}
    </section>
  );
}
