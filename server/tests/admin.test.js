/**
 * Super Admin feature tests (dashboard, users, doctors, patients, appointments).
 * Uses a THROWAWAY MongoDB database (dropped afterwards) with synthetic data and
 * verifies that API changes are actually persisted in MongoDB.
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

const TEST_DB = `emr_rbac_test_admin_${process.pid}_${Date.now()}`;
const BASE_URI = (process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017").replace(/\/+$/, "");
const PW = "Passw0rd-long";
const api = (method, url, token) => {
  const r = request(app)[method](url);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};

let admin, recepTok, docTok, adminTok, profile, doctorUser, patients;

const login = async (email) =>
  (await request(app).post("/api/v1/auth/login").send({ email, password: PW })).body.data;

beforeAll(async () => {
  expect(TEST_DB).toMatch(/^emr_rbac_test_/);
  await mongoose.connect(`${BASE_URI}/${TEST_DB}`, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Doctor.init(), Patient.init()]);
  admin = await User.create({ name: "Admin", email: "admin@t.com", password: PW, role: "SUPER_ADMIN" });
  await User.create({ name: "Recep", email: "recep@t.com", password: PW, role: "RECEPTIONIST" });
  doctorUser = await User.create({ name: "Dr Who", email: "doc@t.com", password: PW, role: "DOCTOR" });
  profile = await Doctor.create({
    userId: doctorUser._id,
    department: "General",
    specialization: "IM",
    schedule: [{ dayOfWeek: "Monday", slotDurationMinutes: 30, sessions: [{ startTime: "09:00", endTime: "11:00" }], breaks: [] }],
  });
  patients = [];
  for (const [i, name] of ["Alice Smith", "Bob (Test) Jones", "Carol O'Neil", "Dan Brown+Co"].entries())
    patients.push(await Patient.create({ patientId: `PAT-X${i}`, name, mobile: `55500000${i}0`.slice(0, 10), age: 30 + i, gender: "Other" }));
  const mk = (p, time, status) =>
    Appointment.create({
      patientId: p._id, doctorId: profile._id, department: "General", appointmentDate: "2030-01-07",
      slotStartTime: time, slotEndTime: time, purpose: "visit", status, createdById: admin._id,
    });
  await mk(patients[0], "09:00", "Scheduled");
  await mk(patients[1], "09:30", "Arrived");
  await mk(patients[2], "10:00", "Completed");
  await mk(patients[3], "10:30", "Cancelled");
  adminTok = (await login("admin@t.com")).accessToken;
  recepTok = (await login("recep@t.com")).accessToken;
  docTok = (await login("doc@t.com")).accessToken;
});

afterAll(async () => {
  if (mongoose.connection.name === TEST_DB) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("admin dashboard", () => {
  test("statistics match MongoDB contents", async () => {
    const res = await api("get", "/api/v1/dashboard/stats", adminTok);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.appointments).toBe(await Appointment.countDocuments());
    expect(d.patients).toBe(await Patient.countDocuments());
    expect(d.doctors).toBe(await Doctor.countDocuments());
    expect(d.activeUsers).toBe(await User.countDocuments({ isActive: true }));
    expect(d.statuses).toEqual({ Scheduled: 1, Arrived: 1, Completed: 1, Cancelled: 1 });
  });
});

describe("user management", () => {
  test("create receptionist and doctor; persisted with hashed password", async () => {
    for (const role of ["RECEPTIONIST", "DOCTOR"]) {
      const res = await api("post", "/api/v1/users", adminTok).send({
        name: `New ${role}`, email: `new-${role}@t.com`.toLowerCase(), password: PW, role,
      });
      expect(res.status).toBe(201);
      const saved = await User.findOne({ email: `new-${role}@t.com`.toLowerCase() }).select("+password");
      expect(saved.role).toBe(role);
      expect(saved.isActive).toBe(true);
      expect(saved.password).not.toBe(PW);
      expect(await saved.comparePassword(PW)).toBe(true);
    }
    // duplicate email
    const dup = await api("post", "/api/v1/users", adminTok).send({ name: "Dup", email: "RECEP@t.com", password: PW, role: "DOCTOR" });
    expect(dup.status).toBe(409);
  });

  test("list shows users and no password hashes", async () => {
    const res = await api("get", "/api/v1/users", adminTok);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(await User.countDocuments());
    expect(JSON.stringify(res.body)).not.toMatch(/password|refreshToken/);
  });

  test("edit name, reset password, change role, deactivate/reactivate persist", async () => {
    const u = await User.create({ name: "Edit Me", email: "edit@t.com", password: PW, role: "RECEPTIONIST" });
    const patch = (b) => api("patch", `/api/v1/users/${u.id}`, adminTok).send(b);
    expect((await patch({ name: "Renamed User" })).status).toBe(200);
    expect((await User.findById(u.id)).name).toBe("Renamed User");
    expect((await patch({ password: "Another-long-pw1" })).status).toBe(200);
    const login2 = await request(app).post("/api/v1/auth/login").send({ email: "edit@t.com", password: "Another-long-pw1" });
    expect(login2.status).toBe(200);
    expect((await patch({ role: "DOCTOR" })).status).toBe(200);
    expect((await User.findById(u.id)).role).toBe("DOCTOR");
    expect((await patch({ isActive: false })).status).toBe(200);
    expect((await User.findById(u.id)).isActive).toBe(false);
    expect((await patch({ isActive: true })).status).toBe(200);
    expect((await User.findById(u.id)).isActive).toBe(true);
    expect((await api("patch", `/api/v1/users/${new mongoose.Types.ObjectId()}`, adminTok).send({ name: "Ghost User" })).status).toBe(404);
  });
});

describe("doctor management", () => {
  test("create profile for a doctor account; wrong role / duplicate / inactive rejected", async () => {
    const d2 = await User.create({ name: "Dr Two", email: "doc2@t.com", password: PW, role: "DOCTOR" });
    const body = { userId: d2.id, department: "Cardiology", specialization: "Heart" };
    expect((await api("post", "/api/v1/doctors", adminTok).send({ ...body, userId: (await User.findOne({ email: "recep@t.com" })).id })).status).toBe(400);
    const ok = await api("post", "/api/v1/doctors", adminTok).send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.data.userId.name).toBe("Dr Two");
    expect((await Doctor.findOne({ userId: d2._id })).department).toBe("Cardiology");
    expect((await api("post", "/api/v1/doctors", adminTok).send(body)).status).toBe(409);
  });

  test("list returns populated doctor info incl. account status", async () => {
    const res = await api("get", "/api/v1/doctors", adminTok);
    expect(res.status).toBe(200);
    const d = res.body.data.find((x) => x._id === profile.id);
    expect(d.userId).toEqual(expect.objectContaining({ name: "Dr Who", email: "doc@t.com", isActive: true }));
    expect(JSON.stringify(res.body)).not.toMatch(/password/);
  });

  test("edit department/specialization persists", async () => {
    const res = await api("patch", `/api/v1/doctors/${profile.id}`, adminTok).send({ department: "Neurology", specialization: "Brain" });
    expect(res.status).toBe(200);
    const saved = await Doctor.findById(profile.id);
    expect([saved.department, saved.specialization]).toEqual(["Neurology", "Brain"]);
    expect(saved.schedule).toHaveLength(1); // schedule untouched
  });

  test("editing the schedule persists and changes the bookable slots", async () => {
    // 2030-01-07 is a Monday, 2030-01-08 a Tuesday
    const before = await api("get", `/api/v1/slots?doctorId=${profile.id}&date=2030-01-08`, adminTok);
    expect(before.body.data).toHaveLength(0);
    const res = await api("patch", `/api/v1/doctors/${profile.id}`, adminTok).send({
      schedule: [
        { dayOfWeek: "Monday", slotDurationMinutes: 30, sessions: [{ startTime: "09:00", endTime: "11:00" }], breaks: [] },
        { dayOfWeek: "Tuesday", slotDurationMinutes: 60, sessions: [{ startTime: "10:00", endTime: "13:00" }], breaks: [{ startTime: "11:00", endTime: "12:00", title: "Lunch" }] },
      ],
    });
    expect(res.status).toBe(200);
    expect((await Doctor.findById(profile.id)).schedule.map((s) => s.dayOfWeek)).toEqual(["Monday", "Tuesday"]);
    const after = await api("get", `/api/v1/slots?doctorId=${profile.id}&date=2030-01-08`, adminTok);
    expect(after.body.data.map((s) => s.startTime)).toEqual(["10:00", "12:00"]); // 11:00 is the break
  });

  test("invalid schedules are rejected and nothing is saved", async () => {
    const snapshot = JSON.stringify((await Doctor.findById(profile.id)).schedule);
    const send = (schedule) => api("patch", `/api/v1/doctors/${profile.id}`, adminTok).send({ schedule });
    const day = (o) => ({ dayOfWeek: "Friday", slotDurationMinutes: 15, sessions: [{ startTime: "09:00", endTime: "12:00" }], breaks: [], ...o });
    expect((await send([day({ sessions: [{ startTime: "12:00", endTime: "09:00" }] })])).status).toBe(400);
    expect((await send([day({ breaks: [{ startTime: "11:00", endTime: "10:00" }] })])).status).toBe(400);
    expect((await send([day(), day()])).status).toBe(400);
    expect((await send([day({ slotDurationMinutes: 1 })])).status).toBe(400);
    expect((await send([day({ sessions: [{ startTime: "9am", endTime: "5pm" }] })])).status).toBe(400);
    expect((await api("patch", `/api/v1/doctors/${profile.id}`, adminTok).send({})).status).toBe(400);
    expect(JSON.stringify((await Doctor.findById(profile.id)).schedule)).toBe(snapshot);
    expect((await api("patch", `/api/v1/doctors/${new mongoose.Types.ObjectId()}`, adminTok).send({ department: "Nowhere" })).status).toBe(404);
  });

  test("only Super Admin may edit doctors", async () => {
    for (const t of [recepTok, docTok])
      expect((await api("patch", `/api/v1/doctors/${profile.id}`, t).send({ department: "Hack" })).status).toBe(403);
    expect((await api("patch", `/api/v1/doctors/${profile.id}`).send({ department: "Hack" })).status).toBe(401);
  });
});

describe("patient management", () => {
  test("list, search by name / id / mobile, and special characters do not break search", async () => {
    const all = await api("get", "/api/v1/patients?limit=50", adminTok);
    expect(all.body.meta.total).toBe(4);
    const by = async (q) => (await api("get", `/api/v1/patients?search=${encodeURIComponent(q)}`, adminTok)).body.data.map((p) => p.name);
    expect(await by("alice")).toEqual(["Alice Smith"]);
    expect(await by("PAT-X2")).toEqual(["Carol O'Neil"]);
    expect(await by(patients[1].mobile)).toEqual(["Bob (Test) Jones"]);
    expect(await by("(")).toEqual(["Bob (Test) Jones"]);
    expect(await by("+Co")).toEqual(["Dan Brown+Co"]);
    expect(await by(".*")).toEqual([]);
  });

  test("patient detail shows correct info with doctor name on appointments", async () => {
    const res = await api("get", `/api/v1/patients/${patients[0].id}`, adminTok);
    expect(res.status).toBe(200);
    expect(res.body.data.patient).toEqual(expect.objectContaining({ name: "Alice Smith", patientId: "PAT-X0", age: 30, gender: "Other" }));
    expect(res.body.data.appointments).toHaveLength(1);
    expect(res.body.data.appointments[0].doctorId.userId.name).toBe("Dr Who");
  });
});

describe("appointment management", () => {
  test("view all with accurate details, filters and pagination", async () => {
    const all = await api("get", "/api/v1/appointments?limit=50", adminTok);
    expect(all.body.meta).toEqual({ total: 4, page: 1, pages: 1 });
    const a = all.body.data.find((x) => x.patientId.name === "Alice Smith");
    expect(a).toEqual(expect.objectContaining({ status: "Scheduled", appointmentDate: "2030-01-07", slotStartTime: "09:00", department: "General" }));
    expect(a.doctorId.userId.name).toBe("Dr Who");
    const arrived = await api("get", "/api/v1/appointments?status=Arrived", adminTok);
    expect(arrived.body.data.map((x) => x.patientId.name)).toEqual(["Bob (Test) Jones"]);
    const dated = await api("get", "/api/v1/appointments?date=2031-01-01", adminTok);
    expect(dated.body.data).toHaveLength(0);
    const p1 = await api("get", "/api/v1/appointments?limit=3&page=2", adminTok);
    expect(p1.body.data).toHaveLength(1);
    expect(p1.body.meta).toEqual({ total: 4, page: 2, pages: 2 });
  });

  test("search handles regex characters and garbage paging without errors", async () => {
    const r = await api("get", `/api/v1/appointments?search=${encodeURIComponent("(")}`, adminTok);
    expect(r.status).toBe(200);
    expect(r.body.data.map((x) => x.patientId.name)).toEqual(["Bob (Test) Jones"]);
    const bad = await api("get", "/api/v1/appointments?page=abc&limit=-5", adminTok);
    expect(bad.status).toBe(200);
    expect(bad.body.meta.page).toBe(1);
  });

  test("admin can mark arrived, update and cancel; changes persist", async () => {
    const appt = await Appointment.findOne({ status: "Scheduled" });
    expect((await api("post", `/api/v1/appointments/${appt.id}/arrive`, adminTok)).status).toBe(200);
    expect((await Appointment.findById(appt.id)).status).toBe("Arrived");
    expect((await api("put", `/api/v1/appointments/${appt.id}`, adminTok).send({ notes: "bring reports" })).status).toBe(200);
    expect((await Appointment.findById(appt.id)).notes).toBe("bring reports");
    expect((await api("delete", `/api/v1/appointments/${appt.id}`, adminTok)).status).toBe(200);
    expect((await Appointment.findById(appt.id)).status).toBe("Cancelled");
    expect((await api("post", `/api/v1/appointments/${new mongoose.Types.ObjectId()}/arrive`, adminTok)).status).toBe(404);
  });
});
