import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, CheckCircle2, Stethoscope, UserPlus, Users } from 'lucide-react';
import api from '../services/api';
import socket from '../services/socket';
import SlotGrid from '../components/appointments/SlotGrid';
import PatientPicker from '../components/appointments/PatientPicker';
import { Alert, Avatar, PageHeader, Spinner, drName } from '../components/ui';

const todayLocal = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const prettyDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

function Step({ n, title, done, disabled, children }) {
  return (
    <section className={`card card-body ${disabled ? 'opacity-60' : ''}`}>
      <h2 className="mb-4 flex items-center gap-3 text-base font-semibold text-slate-900">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
            done ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-600 text-white'
          }`}
        >
          {done ? <CheckCircle2 className="h-4 w-4" /> : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function AppointmentScheduler() {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayLocal());
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Patient Booking Form state
  const [patientType, setPatientType] = useState('NEW');
  const [pickedPatient, setPickedPatient] = useState(null);
  const [booking, setBooking] = useState(false);
  const [slotMessage, setSlotMessage] = useState('');
  const emptyPatientForm = { name: '', mobile: '', age: '', gender: 'Male', email: '' };
  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [purpose, setPurpose] = useState('');
  const [message, setMessage] = useState(null);

  // Load doctors once. (Previously this ran on every doctor/date change and
  // reset the selection back to the first doctor.)
  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
    socket.connect();
    socket.on('appointmentUpdated', () => {
      if (selectedDoctor && selectedDate) fetchSlots(selectedDoctor, selectedDate);
    });
    return () => {
      socket.off('appointmentUpdated');
      socket.disconnect();
    };
  }, [selectedDoctor, selectedDate]);

  const fetchDoctors = async () => {
    try {
      const res = await api.get('/doctors');
      // Doctors whose login account has been deactivated cannot take bookings
      const active = res.data.data.filter((d) => d.userId?.isActive !== false);
      setDoctors(active);
      if (active.length > 0) setSelectedDoctor((cur) => cur || active[0]._id);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to load doctors' });
    }
  };

  const fetchSlots = async (docId, date) => {
    setLoadingSlots(true);
    try {
      const res = await api.get(`/slots?doctorId=${docId}&date=${date}`);
      setSlots(res.data.data);
      setSlotMessage(res.data.message || '');
    } catch (err) {
      setSlots([]);
      setSlotMessage('');
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to load time slots' });
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (selectedDoctor && selectedDate) {
      fetchSlots(selectedDoctor, selectedDate);
      setSelectedSlot(null);
    }
  }, [selectedDoctor, selectedDate]);

  // Switching type discards the other mode's data so nothing is carried over
  const switchPatientType = (type) => {
    if (type === patientType) return;
    setPatientType(type);
    setPickedPatient(null);
    setPatientForm(emptyPatientForm);
    setMessage(null);
  };

  const handleBook = async (e) => {
    e.preventDefault();
    if (!selectedSlot) return setMessage({ type: 'error', text: 'Please select a time slot.' });
    if (patientType === 'EXISTING' && !pickedPatient) {
      return setMessage({ type: 'error', text: 'Search for and select an existing patient.' });
    }

    const payload = {
      patientType,
      doctorId: selectedDoctor,
      appointmentDate: selectedDate,
      slotStartTime: selectedSlot.startTime,
      slotEndTime: selectedSlot.endTime,
      purpose,
      ...(patientType === 'EXISTING' ? { patientId: pickedPatient._id } : { patientDetails: patientForm }),
    };

    setBooking(true);
    try {
      const patientLine =
        patientType === 'EXISTING'
          ? `Patient: ${pickedPatient.name} (${pickedPatient.patientId}) · ${pickedPatient.mobile}`
          : `Patient: ${patientForm.name} (new) · ${patientForm.mobile}`;
      const doc = doctors.find((d) => d._id === selectedDoctor);
      await api.post('/appointments', payload);
      setMessage({
        type: 'success',
        text: 'Appointment booked successfully!',
        details: [
          patientLine,
          `Doctor: ${drName(doc?.userId?.name)} (${doc?.department})`,
          `Date: ${selectedDate}`,
          `Time: ${selectedSlot.startTime} - ${selectedSlot.endTime}`,
          `Purpose: ${purpose}`,
        ],
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setSelectedSlot(null);
      setPurpose('');
      setPatientForm(emptyPatientForm);
      setPickedPatient(null);
      fetchSlots(selectedDoctor, selectedDate);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.errors?.join(' ') || err.response?.data?.message || 'Failed to book appointment' });
    } finally {
      setBooking(false);
    }
  };

  const doctor = doctors.find((d) => d._id === selectedDoctor);
  const patientReady =
    patientType === 'EXISTING' ? !!pickedPatient : !!(patientForm.name && patientForm.mobile && patientForm.age);
  const summaryPatient =
    patientType === 'EXISTING' ? pickedPatient?.name : patientForm.name;

  const segment = (value, label, Icon) => (
    <label className="flex-1 cursor-pointer">
      <input
        type="radio"
        name="patientType"
        value={value}
        checked={patientType === value}
        onChange={() => switchPatientType(value)}
        className="peer sr-only"
      />
      <span className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
    </label>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Appointments"
        title="Book Appointment"
        subtitle="Choose a doctor and date, pick a free slot, select or register the patient, then confirm."
      />

      {message?.type === 'success' ? (
        <div role="status" className="card border-emerald-200 bg-emerald-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-emerald-900">{message.text}</p>
              <ul className="mt-2 space-y-0.5 text-sm text-emerald-900/90">
                {message.details?.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setMessage(null)} className="btn btn-success btn-sm">
                  Book another
                </button>
                <button onClick={() => navigate('/dashboard')} className="btn btn-secondary btn-sm">
                  View appointments
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        message && (
          <Alert type={message.type} onDismiss={() => setMessage(null)}>
            {message.text}
          </Alert>
        )
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Step n={1} title="Doctor & date" done={!!selectedDoctor}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sch-doctor" className="label">Select Doctor</label>
                <select
                  id="sch-doctor"
                  value={selectedDoctor}
                  onChange={(e) => setSelectedDoctor(e.target.value)}
                  className="input"
                >
                  {doctors.length === 0 && <option value="">No doctors available</option>}
                  {doctors.map((doc) => (
                    <option key={doc._id} value={doc._id}>
                      {drName(doc.userId?.name)} ({doc.department})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sch-date" className="label">Select Date</label>
                <input
                  id="sch-date"
                  type="date"
                  value={selectedDate}
                  min={todayLocal()}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="input"
                />
              </div>
            </div>
            {doctor && (
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                <Avatar name={doctor.userId?.name} size="h-10 w-10 text-sm" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-900">{drName(doctor.userId?.name)}</p>
                  <p className="text-slate-500">
                    {doctor.department} · {doctor.specialization}
                  </p>
                </div>
              </div>
            )}
          </Step>

          <Step n={2} title="Available time slots" done={!!selectedSlot}>
            <p className="mb-3 text-sm text-slate-500">{selectedDate ? prettyDate(selectedDate) : ''}</p>
            {!loadingSlots && slots.length === 0 && slotMessage ? (
              <Alert type="warning">{slotMessage}</Alert>
            ) : (
              <>
                <SlotGrid slots={slots} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} loading={loadingSlots} />
                {!loadingSlots && slots.length > 0 && slotMessage && (
                  <p className="mt-3 text-sm text-amber-700">{slotMessage}</p>
                )}
              </>
            )}
          </Step>

          {selectedSlot ? (
            <form onSubmit={handleBook}>
              <Step n={3} title="Patient information & booking" done={false}>
                <div className="mb-4 flex gap-3" role="group" aria-label="Patient type">
                  {segment('NEW', 'New Patient', UserPlus)}
                  {segment('EXISTING', 'Existing Patient', Users)}
                </div>

                {patientType === 'NEW' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="np-name" className="label">Full name</label>
                      <input
                        id="np-name"
                        type="text"
                        placeholder="Full Name"
                        required
                        value={patientForm.name}
                        onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div>
                      <label htmlFor="np-mobile" className="label">Mobile number</label>
                      <input
                        id="np-mobile"
                        type="text"
                        inputMode="numeric"
                        placeholder="Mobile Number (10 digits)"
                        required
                        pattern="[0-9]{10}"
                        value={patientForm.mobile}
                        onChange={(e) => setPatientForm({ ...patientForm, mobile: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div>
                      <label htmlFor="np-age" className="label">Age</label>
                      <input
                        id="np-age"
                        type="number"
                        placeholder="Age"
                        required
                        min="0"
                        max="120"
                        value={patientForm.age}
                        onChange={(e) => setPatientForm({ ...patientForm, age: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div>
                      <label htmlFor="np-gender" className="label">Gender</label>
                      <select
                        id="np-gender"
                        value={patientForm.gender}
                        onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                        className="input"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="np-email" className="label">Email (optional)</label>
                      <input
                        id="np-email"
                        type="email"
                        placeholder="Email (optional)"
                        value={patientForm.email}
                        onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                        className="input"
                      />
                    </div>
                  </div>
                ) : (
                  <PatientPicker selected={pickedPatient} onSelect={setPickedPatient} />
                )}

                <div className="mt-5">
                  <label htmlFor="sch-purpose" className="label">Purpose of visit</label>
                  <input
                    id="sch-purpose"
                    type="text"
                    placeholder="Purpose of Visit (e.g., General Checkup)"
                    required
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="input"
                  />
                </div>

                <button type="submit" disabled={booking} className="btn btn-primary mt-5 w-full py-2.5 text-base">
                  {booking ? <Spinner className="h-4 w-4" /> : <CalendarCheck className="h-5 w-5" />}
                  {booking ? 'Booking…' : `Confirm Booking for ${selectedSlot.startTime}`}
                </button>
              </Step>
            </form>
          ) : (
            <Step n={3} title="Patient information & booking" disabled>
              <p className="text-sm text-slate-500">Select a time slot above to continue.</p>
            </Step>
          )}
        </div>

        {/* Booking summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Booking summary">
          <div className="card card-body">
            <h2 className="card-title mb-3 flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-brand-600" /> Booking summary
            </h2>
            <dl className="space-y-3 text-sm">
              {[
                ['Doctor', doctor ? drName(doctor.userId?.name) : '—'],
                ['Department', doctor?.department || '—'],
                ['Date', selectedDate ? prettyDate(selectedDate) : '—'],
                ['Time', selectedSlot ? `${selectedSlot.startTime} – ${selectedSlot.endTime}` : 'Not selected'],
                ['Patient', summaryPatient || (selectedSlot ? 'Not selected' : '—')],
                ['Purpose', purpose || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
            {selectedSlot && !patientReady && (
              <p className="mt-4 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                {patientType === 'EXISTING' ? 'Select a patient to continue.' : 'Enter the patient details to continue.'}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
