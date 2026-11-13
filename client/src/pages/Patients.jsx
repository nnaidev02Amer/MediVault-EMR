import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { FileText, Pencil, Search, Stethoscope, UserPlus, Users, X } from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Alert,
  Avatar,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
  drName,
} from "../components/ui";

const initialForm = {
  name: "",
  mobile: "",
  email: "",
  age: "",
  gender: "Female",
  medicalHistory: "",
};

const prettyDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export default function Patients() {
  const { user } = useAuth();
  const location = useLocation();
  const [editingId, setEditingId] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [patients, setPatients] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type, text }
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState({
    appointmentId: "",
    diagnosis: "",
    treatmentPlan: "",
    note: "",
  });
  const [savingNote, setSavingNote] = useState(false);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/patients", {
        params: { search, limit: 50 },
      });
      setPatients(data.data || []);
      setTotal(data.meta?.total ?? (data.data || []).length);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load patients. Check the API connection.",
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
    setFormError("");
  }

  async function submitPatient(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const body = { ...form, age: Number(form.age) };
      if (editingId) {
        await api.patch(`/patients/${editingId}`, body);
        setMessage({ type: "success", text: "Patient details updated." });
      } else {
        await api.post("/patients", body);
        setMessage({ type: "success", text: "Patient registered." });
      }
      closeForm();
      await loadPatients();
    } catch (err) {
      setFormError(
        err.response?.data?.errors?.join(" ") ||
          err.response?.data?.message ||
          "Could not save patient.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function showDetails(id) {
    try {
      const { data } = await api.get(`/patients/${id}`);
      setSelected(data.data);
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Could not load patient record.",
      });
    }
  }

  useEffect(() => {
    const id = location.state?.openPatientId;
    if (id) showDetails(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  function startEdit(patient) {
    setEditingId(patient._id);
    setForm({
      name: patient.name || "",
      mobile: patient.mobile || "",
      email: patient.email || "",
      age: String(patient.age ?? ""),
      gender: patient.gender || "Female",
      medicalHistory: patient.medicalHistory || "",
    });
    setFormError("");
    setShowForm(true);
    setMessage(null);
  }

  async function startEditFromList(patient) {
    // the list omits medical history, so fetch the full record first
    try {
      const { data } = await api.get(`/patients/${patient._id}`);
      startEdit(data.data.patient);
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.message || "Could not load patient." });
    }
  }

  async function saveEditedNote(event) {
    event.preventDefault();
    try {
      const { _id, diagnosis, treatmentPlan, note: text } = editingNote;
      await api.patch(
        `/patients/${selected.patient._id}/clinical-notes/${_id}`,
        { diagnosis, treatmentPlan, note: text },
      );
      setEditingNote(null);
      setMessage({ type: "success", text: "Clinical note updated." });
      await showDetails(selected.patient._id);
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err.response?.data?.errors?.join(" ") ||
          err.response?.data?.message ||
          "Could not update clinical note.",
      });
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    setSavingNote(true);
    try {
      await api.post(`/patients/${selected.patient._id}/clinical-notes`, note);
      setMessage({ type: "success", text: "Clinical note saved." });
      setNote({
        appointmentId: "",
        diagnosis: "",
        treatmentPlan: "",
        note: "",
      });
      await showDetails(selected.patient._id);
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Could not save clinical note.",
      });
    } finally {
      setSavingNote(false);
    }
  }

  const canRegister = ["SUPER_ADMIN", "RECEPTIONIST"].includes(user?.role);
  const isDoctor = user?.role === "DOCTOR";
  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Records"
        title="Patients"
        subtitle="Search patient records and view authorized clinical history."
        actions={
          canRegister && (
            <button
              onClick={() => {
                setEditingId(null);
                setForm(initialForm);
                setFormError("");
                setMessage(null);
                setShowForm(true);
              }}
              className="btn btn-primary"
            >
              <UserPlus className="h-4 w-4" /> Register patient
            </button>
          )
        }
      />

      {message && (
        <Alert type={message.type} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* Search */}
      <div className="card card-body">
        <label className="sr-only" htmlFor="patient-search">
          Search patients
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            id="patient-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, patient ID, mobile, or email"
            className="input pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1.5 rounded p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        {loading && patients.length === 0 ? (
          <ListSkeleton rows={6} label="Loading patient records…" />
        ) : error ? (
          <ErrorState message={error} onRetry={loadPatients} />
        ) : patients.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? "No patients match your search" : "No patient records found"}
            message={
              search
                ? "Check the spelling, or try a mobile number or patient ID."
                : isDoctor
                  ? "Patients with an appointment assigned to you will appear here."
                  : "Register your first patient to get started."
            }
            action={
              search ? (
                <button onClick={() => setSearch("")} className="btn btn-secondary btn-sm">Clear search</button>
              ) : canRegister ? (
                <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">
                  <UserPlus className="h-4 w-4" /> Register patient
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <p className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 sm:px-5">
              <span>
                Showing {patients.length} of {total} patients
                {total > patients.length && " — refine your search to narrow results"}
              </span>
              {loading && <Spinner className="h-3.5 w-3.5" />}
            </p>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="table-th">Patient</th>
                    <th className="table-th">ID</th>
                    <th className="table-th">Contact</th>
                    <th className="table-th">Age / Gender</th>
                    <th className="table-th">Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patients.map((patient) => (
                    <tr key={patient._id} className="hover:bg-slate-50/70">
                      <td className="table-td">
                        <div className="flex items-center gap-3">
                          <Avatar name={patient.name} />
                          <span className="font-semibold text-slate-900">{patient.name}</span>
                        </div>
                      </td>
                      <td className="table-td font-mono text-xs">{patient.patientId}</td>
                      <td className="table-td">
                        <p>{patient.mobile}</p>
                        {patient.email && <p className="text-xs text-slate-500">{patient.email}</p>}
                      </td>
                      <td className="table-td">
                        {patient.age} / {patient.gender}
                      </td>
                      <td className="table-td">
                        <div className="flex gap-2">
                          <button onClick={() => showDetails(patient._id)} className="btn btn-soft btn-sm">
                            <FileText className="h-3.5 w-3.5" /> View record
                          </button>
                          {canRegister && (
                            <button onClick={() => startEditFromList(patient)} className="btn btn-secondary btn-sm">
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden">
              {patients.map((patient) => (
                <li key={patient._id} className="space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={patient.name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{patient.name}</p>
                      <p className="truncate font-mono text-xs text-slate-500">{patient.patientId}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600">
                    {patient.mobile}
                    {patient.email ? ` · ${patient.email}` : ""}
                    <span className="block text-xs text-slate-500">
                      {patient.age} yrs · {patient.gender}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => showDetails(patient._id)} className="btn btn-soft btn-sm">
                      <FileText className="h-3.5 w-3.5" /> View record
                    </button>
                    {canRegister && (
                      <button onClick={() => startEditFromList(patient)} className="btn btn-secondary btn-sm">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Register / edit */}
      {showForm && (
        <Modal
          size="lg"
          title={editingId ? "Edit patient details" : "New patient registration"}
          subtitle={editingId ? undefined : "Patient ID is generated automatically."}
          onClose={closeForm}
          footer={
            <>
              <button type="button" onClick={closeForm} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" form="patient-form" disabled={saving} className="btn btn-primary">
                {saving && <Spinner className="h-4 w-4" />}
                {saving ? "Saving…" : editingId ? "Save changes" : "Save patient"}
              </button>
            </>
          }
        >
          <form id="patient-form" onSubmit={submitPatient} className="grid gap-4 sm:grid-cols-2">
            {formError && <Alert type="error" className="sm:col-span-2">{formError}</Alert>}
            <div>
              <label htmlFor="pf-name" className="label">Full name</label>
              <input id="pf-name" required minLength="2" maxLength="120" className="input" {...field("name")} />
            </div>
            <div>
              <label htmlFor="pf-mobile" className="label">Mobile number</label>
              <input id="pf-mobile" required pattern="[0-9]{10}" inputMode="numeric" title="10 digits" className="input" {...field("mobile")} />
              <p className="hint">10 digits, used to prevent duplicate records.</p>
            </div>
            <div>
              <label htmlFor="pf-email" className="label">Email (optional)</label>
              <input id="pf-email" type="email" className="input" {...field("email")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pf-age" className="label">Age</label>
                <input id="pf-age" type="number" min="0" max="120" required className="input" {...field("age")} />
              </div>
              <div>
                <label htmlFor="pf-gender" className="label">Gender</label>
                <select id="pf-gender" className="input" {...field("gender")}>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pf-history" className="label">Relevant medical history</label>
              <textarea id="pf-history" maxLength="5000" rows="3" className="input" {...field("medicalHistory")} />
              <p className="hint">Synthetic/demo data only.</p>
            </div>
          </form>
        </Modal>
      )}

      {/* Patient record */}
      {selected && (
        <Modal
          size="lg"
          title={selected.patient.name}
          subtitle={`${selected.patient.patientId} · ${selected.patient.age} yrs · ${selected.patient.gender}`}
          onClose={() => {
            setSelected(null);
            setEditingNote(null);
          }}
        >
          <div className="space-y-6">
            <section>
              <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">Contact</h3>
              <p className="text-sm text-slate-700">
                {selected.patient.mobile}
                {selected.patient.email ? ` · ${selected.patient.email}` : ""}
              </p>
            </section>

            <section>
              <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">Medical history</h3>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                {selected.patient.medicalHistory || "No history recorded."}
              </p>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Appointments</h3>
              {selected.appointments.length ? (
                <ul className="space-y-2">
                  {selected.appointments.map((item) => (
                    <li
                      key={item._id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {prettyDate(item.appointmentDate)} · {item.slotStartTime}
                        </p>
                        <p className="text-slate-600">
                          {item.purpose}
                          {item.doctorId?.userId?.name && ` · ${drName(item.doctorId.userId.name)}`}
                        </p>
                      </div>
                      <StatusBadge status={item.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No appointments found.</p>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Clinical notes</h3>
              {user?.role === "RECEPTIONIST" && (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  Clinical notes are visible to doctors only.
                </p>
              )}
              {user?.role !== "RECEPTIONIST" && !(selected.patient.clinicalNotes || []).length && (
                <p className="text-sm text-slate-500">No clinical notes recorded.</p>
              )}
              <ul className="space-y-3">
                {(selected.patient.clinicalNotes || []).map((item, index) =>
                  editingNote?._id === item._id ? (
                    <li key={item._id}>
                      <form onSubmit={saveEditedNote} className="space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3 text-sm">
                        <input
                          aria-label="Diagnosis"
                          className="input"
                          value={editingNote.diagnosis}
                          onChange={(e) => setEditingNote({ ...editingNote, diagnosis: e.target.value })}
                        />
                        <textarea
                          aria-label="Treatment plan"
                          rows="2"
                          className="input"
                          value={editingNote.treatmentPlan}
                          onChange={(e) => setEditingNote({ ...editingNote, treatmentPlan: e.target.value })}
                        />
                        <textarea
                          aria-label="Clinical note"
                          rows="3"
                          className="input"
                          value={editingNote.note}
                          onChange={(e) => setEditingNote({ ...editingNote, note: e.target.value })}
                        />
                        <div className="flex gap-2">
                          <button className="btn btn-primary btn-sm">Save</button>
                          <button type="button" onClick={() => setEditingNote(null)} className="btn btn-secondary btn-sm">
                            Cancel
                          </button>
                        </div>
                      </form>
                    </li>
                  ) : (
                    <li key={`${item._id || index}`} className="rounded-lg border-l-4 border-brand-500 bg-slate-50 p-3 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold text-slate-900">{item.diagnosis || "Clinical note"}</p>
                        {item.createdAt && (
                          <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString()}</p>
                        )}
                      </div>
                      {item.treatmentPlan && (
                        <p className="mt-1 text-slate-700">
                          <span className="font-medium">Plan: </span>
                          {item.treatmentPlan}
                        </p>
                      )}
                      {item.note && <p className="mt-1 whitespace-pre-wrap text-slate-600">{item.note}</p>}
                      {isDoctor && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingNote({
                              _id: item._id,
                              diagnosis: item.diagnosis || "",
                              treatmentPlan: item.treatmentPlan || "",
                              note: item.note || "",
                            })
                          }
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                        >
                          <Pencil className="h-3 w-3" /> Edit note
                        </button>
                      )}
                    </li>
                  ),
                )}
              </ul>
            </section>

            {isDoctor && selected.appointments.some((item) => item.status !== "Cancelled") && (
              <form onSubmit={saveNote} className="space-y-3 rounded-xl border border-slate-200 p-4">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                  <Stethoscope className="h-4 w-4 text-brand-600" /> Add clinical note
                </h3>
                <div>
                  <label htmlFor="cn-appt" className="label">Assigned appointment</label>
                  <select
                    id="cn-appt"
                    required
                    className="input"
                    value={note.appointmentId}
                    onChange={(e) => setNote({ ...note, appointmentId: e.target.value })}
                  >
                    <option value="">Select appointment</option>
                    {selected.appointments
                      .filter((item) => item.status !== "Cancelled")
                      .map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.appointmentDate} · {item.slotStartTime}
                        </option>
                      ))}
                  </select>
                </div>
                <input
                  aria-label="Diagnosis"
                  placeholder="Diagnosis"
                  className="input"
                  value={note.diagnosis}
                  onChange={(e) => setNote({ ...note, diagnosis: e.target.value })}
                />
                <textarea
                  aria-label="Treatment plan"
                  placeholder="Treatment plan"
                  rows="2"
                  className="input"
                  value={note.treatmentPlan}
                  onChange={(e) => setNote({ ...note, treatmentPlan: e.target.value })}
                />
                <textarea
                  aria-label="Clinical note"
                  placeholder="Clinical note"
                  rows="3"
                  className="input"
                  value={note.note}
                  onChange={(e) => setNote({ ...note, note: e.target.value })}
                />
                <button disabled={savingNote} className="btn btn-primary">
                  {savingNote && <Spinner className="h-4 w-4" />}
                  Save note
                </button>
              </form>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
