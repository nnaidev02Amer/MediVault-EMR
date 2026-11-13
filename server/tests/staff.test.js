/**
 * Doctor and Receptionist workflow tests against a THROWAWAY MongoDB database
 * (dropped afterwards) with synthetic data. Verifies persistence in MongoDB.
 */
const request = require("supertest");
const mongoose = require("mongoose");

jest.mock("../src/utils/auditLogger", () => jest.fn());
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const app = require("../src/app");
const User = require("../src/models/User");
const Doctor = require("../src/models/Doctor");
const Patient = require("../src/models/Patient");
const Appointment = require("../src/models/Appointment");

const TEST_DB = `emr_rbac_test_staff_${process.pid}_${Date.now()}`;
const BASE_URI = (process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017").replace(/\/+$/, "");
const PW = "Passw0rd-long";
const api = (method, url, token) => {
  const r = request(app)[method](url);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};
const login = async (email) =>
  (await request(app).post("/api/v1/auth/login").send({ email, password: PW })).body.data;

// 2030-01-07 is a Monday, 2030-01-14 the next Monday
const MON = "2030-01-07";
const MON2 = "2030-01-14";
let t = {}, profA, profB, pat, apptA, apptB;

beforeAll(async () => {
  expect(TEST_DB).toMatch(/^emr_rbac_test_/);
  await mongoose.connect(`${BASE_URI}/${TEST_DB}`, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Doctor.init(), Patient.init()]);
  const mk = (name, role, email) => User.create({ name, email, password: PW, role });
  const admin = await mk("Admin", "SUPER_ADMIN", "admin@t.com");
  await mk("Recep", "RECEPTIONIST", "recep@t.com");
  const ua = await mk("Dr A", "DOCTOR", "a@t.com");
  const ub = await mk("Dr B", "DOCTOR", "b@t.com");
  const sched = [{ dayOfWeek: "Monday", slotDurationMinutes: 30, sessions: [{ startTime: "09:00", endTime: "11:00" }], breaks: [] }];
  profA = await Doctor.create({ userId: ua._id, department: "General", specialization: "IM", schedule: sched });
  profB = await Doctor.create({ userId: ub._id, department: "ENT", specialization: "Ear", schedule: sched });
  pat = await Patient.create({ patientId: "PAT-1", name: "Pat One", mobile: "5550000001", age: 40, gender: "Male", medicalHistory: "asthma" });
  const mkAppt = (doc, time) =>
    Appointment.create({
      patientId: pat._id, doctorId: doc._id, department: doc.department, appointmentDate: MON,
      slotStartTime: time, slotEndTime: time, purpose: "visit", createdById: admin._id,
    });
  apptA = await mkAppt(profA, "09:00");
  apptB = await mkAppt(profB, "09:00");
  for (const [k, e] of [["admin", "admin@t.com"], ["rec", "recep@t.com"], ["a", "a@t.com"], ["b", "b@t.com"]])
    t[k] = (await login(e)).accessToken;
});

afterAll(async () => {
  if (mongoose.connection.name === TEST_DB) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("doctor workflow", () => {
  test("login returns DOCTOR role; sees own profile and schedule via the doctors list", async () => {
    const me = await User.findOne({ email: "a@t.com" });
    const res = await api("get", "/api/v1/doctors", t.a);
    const mine = res.body.data.find((d) => d.userId._id === me.id);
    expect(mine).toEqual(expect.objectContaining({ department: "General", specialization: "IM" }));
    expect(mine.schedule[0].sessions[0]).toEqual(expect.objectContaining({ startTime: "09:00", endTime: "11:00" }));
  });

  test("assigned appointments and statistics are correct and scoped", async () => {
    const list = await api("get", "/api/v1/appointments", t.a);
    expect(list.body.data.map((a) => a._id)).toEqual([apptA.id]);
    expect(list.body.data[0].patientId.name).toBe("Pat One");
    const stats = await api("get", "/api/v1/dashboard/stats", t.a);
    expect(stats.body.data.appointments).toBe(1);
    expect(stats.body.data.statuses).toEqual({ Scheduled: 1 });
    expect(stats.body.data.patients).toBeNull();
  });

  test("can read an authorized patient with medical history", async () => {
    const res = await api("get", `/api/v1/patients/${pat.id}`, t.a);
    expect(res.status).toBe(200);
    expect(res.body.data.patient.medicalHistory).toBe("asthma");
  });

  test("add a clinical note, then update it; persisted in MongoDB", async () => {
    const add = await api("post", `/api/v1/patients/${pat.id}/clinical-notes`, t.a)
      .send({ appointmentId: apptA.id, diagnosis: "Flu", treatmentPlan: "Rest", note: "initial" });
    expect(add.status).toBe(201);
    const noteId = add.body.data._id;
    const upd = await api("patch", `/api/v1/patients/${pat.id}/clinical-notes/${noteId}`, t.a)
      .send({ diagnosis: "Viral flu", note: "revised" });
    expect(upd.status).toBe(200);
    const saved = (await Patient.findById(pat.id)).clinicalNotes.id(noteId);
    expect([saved.diagnosis, saved.treatmentPlan, saved.note]).toEqual(["Viral flu", "Rest", "revised"]);
    // another doctor / non-doctors cannot edit it
    const url = `/api/v1/patients/${pat.id}/clinical-notes/${noteId}`;
    expect((await api("patch", url, t.b).send({ note: "hijack" })).status).toBe(403);
    expect((await api("patch", url, t.rec).send({ note: "hijack" })).status).toBe(403);
    expect((await api("patch", url, t.admin).send({ note: "hijack" })).status).toBe(403);
    expect((await api("patch", url).send({ note: "hijack" })).status).toBe(401);
    expect((await api("patch", url, t.a).send({})).status).toBe(400);
    expect((await api("patch", url, t.a).send({ doctorId: profB.id })).status).toBe(400);
    expect((await Patient.findById(pat.id)).clinicalNotes.id(noteId).note).toBe("revised");
  });

  test("saves appointment notes and marks consultation completed", async () => {
    const res = await api("put", `/api/v1/appointments/${apptA.id}`, t.a).send({ notes: "seen", status: "Completed" });
    expect(res.status).toBe(200);
    const saved = await Appointment.findById(apptA.id);
    expect([saved.notes, saved.status]).toEqual(["seen", "Completed"]);
    expect((await api("get", "/api/v1/dashboard/stats", t.a)).body.data.statuses).toEqual({ Completed: 1 });
  });

  test("cannot complete a cancelled appointment, nor another doctor's appointment", async () => {
    const cancelled = await Appointment.create({
      patientId: pat._id, doctorId: profA._id, department: "General", appointmentDate: MON,
      slotStartTime: "10:00", slotEndTime: "10:30", purpose: "x", status: "Cancelled", createdById: new mongoose.Types.ObjectId(),
    });
    expect((await api("put", `/api/v1/appointments/${cancelled.id}`, t.a).send({ status: "Completed" })).status).toBe(409);
    expect((await api("put", `/api/v1/appointments/${apptB.id}`, t.a).send({ status: "Completed" })).status).toBe(403);
    expect((await Appointment.findById(apptB.id)).status).toBe("Scheduled");
  });
});

describe("receptionist workflow", () => {
  test("registers, searches (name / ID / mobile) and edits a patient; persisted", async () => {
    const reg = await api("post", "/api/v1/patients", t.rec).send({ name: "Zed Walker", mobile: "5550000002", age: 22, gender: "Female", email: "" });
    expect(reg.status).toBe(201);
    const id = reg.body.data._id;
    const by = async (q) => (await api("get", `/api/v1/patients?search=${encodeURIComponent(q)}`, t.rec)).body.data.map((p) => p.name);
    expect(await by("zed")).toEqual(["Zed Walker"]);
    expect(await by(reg.body.data.patientId)).toEqual(["Zed Walker"]);
    expect(await by("5550000002")).toEqual(["Zed Walker"]);

    const upd = await api("patch", `/api/v1/patients/${id}`, t.rec).send({ name: "Zed Walker Jr", age: 23, email: "zed@t.com", medicalHistory: "none" });
    expect(upd.status).toBe(200);
    const saved = await Patient.findById(id);
    expect([saved.name, saved.age, saved.email, saved.medicalHistory]).toEqual(["Zed Walker Jr", 23, "zed@t.com", "none"]);
    expect(saved.patientId).toBe(reg.body.data.patientId);
    // duplicate mobile, invalid fields, unknown fields, missing patient
    expect((await api("patch", `/api/v1/patients/${id}`, t.rec).send({ mobile: "5550000001" })).status).toBe(409);
    expect((await api("patch", `/api/v1/patients/${id}`, t.rec).send({ age: -1 })).status).toBe(400);
    expect((await api("patch", `/api/v1/patients/${id}`, t.rec).send({ patientId: "HACK" })).status).toBe(400);
    expect((await api("patch", `/api/v1/patients/${id}`, t.rec).send({ clinicalNotes: [] })).status).toBe(400);
    expect((await api("patch", `/api/v1/patients/${new mongoose.Types.ObjectId()}`, t.rec).send({ name: "Nobody" })).status).toBe(404);
    // doctors cannot edit patient demographics
    expect((await api("patch", `/api/v1/patients/${id}`, t.a).send({ name: "Hack" })).status).toBe(403);
  });

  test("books for an EXISTING patient picked from search results", async () => {
    const found = await api("get", "/api/v1/patients?search=Pat%20One", t.rec);
    const res = await api("post", "/api/v1/appointments", t.rec).send({
      patientType: "EXISTING", patientId: found.body.data[0]._id, doctorId: profA.id,
      appointmentDate: MON, slotStartTime: "09:30", slotEndTime: "10:00", purpose: "follow-up",
    });
    expect(res.status).toBe(201);
    const saved = await Appointment.findById(res.body.data._id);
    expect([saved.status, saved.department, String(saved.patientId)]).toEqual(["Scheduled", "General", pat.id]);
    // the slot is no longer offered
    const slots = await api("get", `/api/v1/slots?doctorId=${profA.id}&date=${MON}`, t.rec);
    expect(slots.body.data.find((s) => s.startTime === "09:30").isAvailable).toBe(false);
  });

  test("double booking the same slot is refused", async () => {
    const body = {
      patientType: "EXISTING", patientId: pat.id, doctorId: profA.id,
      appointmentDate: MON, slotStartTime: "09:30", slotEndTime: "10:00", purpose: "dup",
    };
    expect((await api("post", "/api/v1/appointments", t.rec).send(body)).status).toBe(409);
  });

  test("booking a NEW patient creates patient + appointment; failures leave no orphan patient", async () => {
    const details = { name: "Fresh Face", mobile: "5550000003", age: 31, gender: "Male" };
    const base = { patientType: "NEW", patientDetails: details, doctorId: profB.id, purpose: "first visit" };
    // unavailable slot (Tuesday - doctor off) -> 409 and nothing created
    const off = await api("post", "/api/v1/appointments", t.rec).send({ ...base, appointmentDate: "2030-01-08", slotStartTime: "09:00", slotEndTime: "09:30" });
    expect(off.status).toBe(409);
    expect(await Patient.countDocuments({ mobile: "5550000003" })).toBe(0);
    const ok = await api("post", "/api/v1/appointments", t.rec).send({ ...base, appointmentDate: MON, slotStartTime: "10:00", slotEndTime: "10:30" });
    expect(ok.status).toBe(201);
    expect(await Patient.countDocuments({ mobile: "5550000003" })).toBe(1);
    // same mobile again -> clear 409 about the patient, not about slots
    const dup = await api("post", "/api/v1/appointments", t.rec).send({ ...base, appointmentDate: MON, slotStartTime: "10:30", slotEndTime: "11:00" });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toMatch(/mobile number/);
    expect(await Appointment.countDocuments({ doctorId: profB._id, slotStartTime: "10:30" })).toBe(0);
  });

  test("unknown doctor / patient give 404, not 500", async () => {
    const base = { patientType: "EXISTING", patientId: pat.id, doctorId: profA.id, appointmentDate: MON, slotStartTime: "10:00", slotEndTime: "10:30", purpose: "x" };
    expect((await api("post", "/api/v1/appointments", t.rec).send({ ...base, doctorId: new mongoose.Types.ObjectId().toString() })).status).toBe(404);
    expect((await api("post", "/api/v1/appointments", t.rec).send({ ...base, patientId: new mongoose.Types.ObjectId().toString() })).status).toBe(404);
  });

  test("arrive, with state guards", async () => {
    const fresh = await Appointment.create({
      patientId: pat._id, doctorId: profB._id, department: "ENT", appointmentDate: MON2,
      slotStartTime: "09:00", slotEndTime: "09:30", purpose: "v", createdById: new mongoose.Types.ObjectId(),
    });
    expect((await api("post", `/api/v1/appointments/${fresh.id}/arrive`, t.rec)).status).toBe(200);
    expect((await Appointment.findById(fresh.id)).status).toBe("Arrived");
    expect((await api("post", `/api/v1/appointments/${fresh.id}/arrive`, t.rec)).status).toBe(409); // already arrived
    expect((await api("post", `/api/v1/appointments/${apptA.id}/arrive`, t.rec)).status).toBe(409); // completed
  });

  test("reschedule moves the appointment, frees the old slot, and enforces rules", async () => {
    const a = await Appointment.create({
      patientId: pat._id, doctorId: profA._id, department: "General", appointmentDate: MON2,
      slotStartTime: "09:00", slotEndTime: "09:30", purpose: "v", createdById: new mongoose.Types.ObjectId(),
    });
    const url = `/api/v1/appointments/${a.id}/reschedule`;
    const move = { appointmentDate: MON2, slotStartTime: "10:00", slotEndTime: "10:30" };
    expect((await api("post", url, t.a).send(move)).status).toBe(403); // doctors cannot
    expect((await api("post", url).send(move)).status).toBe(401);
    expect((await api("post", url, t.rec).send({ ...move, slotStartTime: "13:00", slotEndTime: "13:30" })).status).toBe(409); // outside schedule
    expect((await api("post", url, t.rec).send({ ...move, appointmentDate: "2030-01-08" })).status).toBe(409); // doctor off
    const ok = await api("post", url, t.rec).send(move);
    expect(ok.status).toBe(200);
    const saved = await Appointment.findById(a.id);
    expect([saved.appointmentDate, saved.slotStartTime, saved.slotEndTime, saved.status]).toEqual([MON2, "10:00", "10:30", "Scheduled"]);
    const slots = await api("get", `/api/v1/slots?doctorId=${profA.id}&date=${MON2}`, t.rec);
    const by = (s) => slots.body.data.find((x) => x.startTime === s).isAvailable;
    expect([by("09:00"), by("10:00")]).toEqual([true, false]);
    // slot taken by someone else
    const other = await Appointment.create({
      patientId: pat._id, doctorId: profA._id, department: "General", appointmentDate: MON2,
      slotStartTime: "10:30", slotEndTime: "11:00", purpose: "v", createdById: new mongoose.Types.ObjectId(),
    });
    expect((await api("post", url, t.rec).send({ ...move, slotStartTime: "10:30", slotEndTime: "11:00" })).status).toBe(409);
    expect(other.slotStartTime).toBe("10:30");
    // completed / cancelled cannot be rescheduled; unknown id -> 404
    expect((await api("post", `/api/v1/appointments/${apptA.id}/reschedule`, t.rec).send(move)).status).toBe(409);
    expect((await api("post", `/api/v1/appointments/${new mongoose.Types.ObjectId()}/reschedule`, t.rec).send(move)).status).toBe(404);
    expect((await api("post", url, t.rec).send({ appointmentDate: "bad" })).status).toBe(400);
  });

  test("cancel works; completed cannot be cancelled; stats count correctly", async () => {
    const a = await Appointment.create({
      patientId: pat._id, doctorId: profB._id, department: "ENT", appointmentDate: MON2,
      slotStartTime: "10:00", slotEndTime: "10:30", purpose: "v", createdById: new mongoose.Types.ObjectId(),
    });
    expect((await api("delete", `/api/v1/appointments/${a.id}`, t.rec)).status).toBe(200);
    expect((await Appointment.findById(a.id)).status).toBe("Cancelled");
    expect((await api("delete", `/api/v1/appointments/${apptA.id}`, t.rec)).status).toBe(409);
    const stats = await api("get", "/api/v1/dashboard/stats", t.rec);
    const byStatus = await Appointment.aggregate([{ $group: { _id: "$status", c: { $sum: 1 } } }]);
    expect(stats.body.data.statuses).toEqual(Object.fromEntries(byStatus.map((x) => [x._id, x.c])));
    expect(stats.body.data.appointments).toBe(await Appointment.countDocuments());
    // receptionist can not use doctor-only or admin-only features
    expect((await api("post", `/api/v1/patients/${pat.id}/clinical-notes`, t.rec).send({ appointmentId: apptA.id })).status).toBe(403);
    expect((await api("get", "/api/v1/users", t.rec)).status).toBe(403);
  });
});
