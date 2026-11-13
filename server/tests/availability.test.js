/**
 * Doctor availability + receptionist booking tests (throwaway MongoDB database,
 * synthetic data, dropped afterwards).
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

const TEST_DB = `emr_rbac_test_avail_${process.pid}_${Date.now()}`;
const BASE_URI = (process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017").replace(/\/+$/, "");
const PW = "Passw0rd-long";
const api = (method, url, token) => {
  const r = request(app)[method](url);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};
const login = async (email) =>
  (await request(app).post("/api/v1/auth/login").send({ email, password: PW })).body.data;

// 2030-01-07 Monday, 2030-01-08 Tuesday, 2030-01-09 Wednesday
const MON = "2030-01-07";
const TUE = "2030-01-08";
const WED = "2030-01-09";
const day = (dayOfWeek, o = {}) => ({
  dayOfWeek,
  slotDurationMinutes: 30,
  sessions: [{ startTime: "09:00", endTime: "12:00" }],
  breaks: [],
  ...o,
});

let t = {}, admin, docA, docB, profA, profB, noProfileUser, patient;

const slotsFor = async (doctor, date) => {
  const res = await api("get", `/api/v1/slots?doctorId=${doctor.id}&date=${date}`, t.rec);
  expect(res.status).toBe(200);
  return res.body;
};
const times = (body, onlyFree = false) =>
  body.data.filter((s) => !onlyFree || s.isAvailable).map((s) => s.startTime);

beforeAll(async () => {
  expect(TEST_DB).toMatch(/^emr_rbac_test_/);
  await mongoose.connect(`${BASE_URI}/${TEST_DB}`, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Doctor.init(), Patient.init()]);
  const mk = (name, role, email) => User.create({ name, email, password: PW, role });
  admin = await mk("Admin", "SUPER_ADMIN", "admin@t.com");
  await mk("Recep", "RECEPTIONIST", "recep@t.com");
  docA = await mk("Dr A", "DOCTOR", "a@t.com");
  docB = await mk("Dr B", "DOCTOR", "b@t.com");
  noProfileUser = await mk("Dr None", "DOCTOR", "none@t.com");
  profA = await Doctor.create({ userId: docA._id, department: "General", specialization: "IM" }); // no schedule yet
  profB = await Doctor.create({
    userId: docB._id, department: "ENT", specialization: "Ear",
    schedule: [day("Monday", { sessions: [{ startTime: "10:00", endTime: "11:00" }] })],
  });
  patient = await Patient.create({ patientId: "PAT-1", name: "Pat One", mobile: "5550000001", age: 40, gender: "Male" });
  for (const [k, e] of [["admin", "admin@t.com"], ["rec", "recep@t.com"], ["a", "a@t.com"], ["b", "b@t.com"], ["none", "none@t.com"]])
    t[k] = (await login(e)).accessToken;
});

afterAll(async () => {
  if (mongoose.connection.name === TEST_DB) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("doctor: My Availability", () => {
  test("a doctor with no schedule can load their profile", async () => {
    const res = await api("get", "/api/v1/doctors/me", t.a);
    expect(res.status).toBe(200);
    expect(res.body.data.department).toBe("General");
    expect(res.body.data.schedule).toEqual([]);
  });

  test("creates weekly availability; persisted in MongoDB", async () => {
    const schedule = [
      day("Monday", { breaks: [{ startTime: "10:30", endTime: "11:00", title: "Tea" }] }),
      day("Wednesday", { slotDurationMinutes: 20, sessions: [{ startTime: "14:00", endTime: "15:00" }] }),
    ];
    const res = await api("patch", "/api/v1/doctors/me/availability", t.a).send({ schedule });
    expect(res.status).toBe(200);
    const saved = await Doctor.findById(profA.id);
    expect(saved.schedule.map((s) => s.dayOfWeek)).toEqual(["Monday", "Wednesday"]);
    expect(saved.schedule[0].breaks[0]).toEqual(expect.objectContaining({ startTime: "10:30", endTime: "11:00" }));
    expect(saved.schedule[1].slotDurationMinutes).toBe(20);
    // viewing it back
    const me = await api("get", "/api/v1/doctors/me", t.a);
    expect(me.body.data.schedule).toHaveLength(2);
  });

  test("edits availability: change hours, drop a day, remove breaks", async () => {
    const res = await api("patch", "/api/v1/doctors/me/availability", t.a).send({
      schedule: [day("Monday", { sessions: [{ startTime: "09:00", endTime: "11:00" }] })],
    });
    expect(res.status).toBe(200);
    const saved = await Doctor.findById(profA.id);
    expect(saved.schedule).toHaveLength(1);
    expect(saved.schedule[0].sessions[0].endTime).toBe("11:00");
    expect(saved.schedule[0].breaks).toHaveLength(0);
    // fields other than the schedule are untouched
    expect([saved.department, saved.specialization]).toEqual(["General", "IM"]);
  });

  test("a doctor can change only their own availability", async () => {
    const beforeB = JSON.stringify((await Doctor.findById(profB.id)).schedule);
    // no id is accepted; unknown/other fields are rejected
    expect((await api("patch", "/api/v1/doctors/me/availability", t.a).send({ doctorId: profB.id, schedule: [] })).status).toBe(400);
    expect((await api("patch", "/api/v1/doctors/me/availability", t.a).send({ department: "Hack", schedule: [] })).status).toBe(400);
    // the generic admin endpoint is closed to doctors
    expect((await api("patch", `/api/v1/doctors/${profB.id}`, t.a).send({ schedule: [] })).status).toBe(403);
    expect(JSON.stringify((await Doctor.findById(profB.id)).schedule)).toBe(beforeB);
    // other roles cannot use the doctor endpoints
    for (const tok of [t.rec, t.admin]) {
      expect((await api("patch", "/api/v1/doctors/me/availability", tok).send({ schedule: [] })).status).toBe(403);
      expect((await api("get", "/api/v1/doctors/me", tok)).status).toBe(403);
    }
    expect((await api("patch", "/api/v1/doctors/me/availability").send({ schedule: [] })).status).toBe(401);
  });

  test("invalid availability is rejected and nothing is saved", async () => {
    const snapshot = JSON.stringify((await Doctor.findById(profA.id)).schedule);
    const send = (schedule) => api("patch", "/api/v1/doctors/me/availability", t.a).send({ schedule });
    expect((await send([day("Friday", { sessions: [{ startTime: "12:00", endTime: "09:00" }] })])).status).toBe(400);
    expect((await send([day("Friday", { breaks: [{ startTime: "11:00", endTime: "10:00" }] })])).status).toBe(400);
    expect((await send([day("Friday"), day("Friday")])).status).toBe(400);
    expect((await send([day("Friday", { slotDurationMinutes: 2 })])).status).toBe(400);
    expect((await send([day("Someday")])).status).toBe(400);
    expect((await api("patch", "/api/v1/doctors/me/availability", t.a).send({})).status).toBe(400);
    expect(JSON.stringify((await Doctor.findById(profA.id)).schedule)).toBe(snapshot);
  });

  test("a doctor account without a profile gets a clear 404", async () => {
    const res = await api("get", "/api/v1/doctors/me", t.none);
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/administrator/);
    expect((await api("patch", "/api/v1/doctors/me/availability", t.none).send({ schedule: [] })).status).toBe(404);
  });

  test("Super Admin still manages any doctor's schedule", async () => {
    const res = await api("patch", `/api/v1/doctors/${profA.id}`, t.admin).send({
      schedule: [day("Monday", { sessions: [{ startTime: "09:00", endTime: "12:00" }] })],
    });
    expect(res.status).toBe(200);
    expect((await Doctor.findById(profA.id)).schedule[0].sessions[0].endTime).toBe("12:00");
  });

  test("upcoming appointments: only today-or-later, active, and own", async () => {
    const mk = (doc, date, time, status) =>
      Appointment.create({
        patientId: patient._id, doctorId: doc._id, department: doc.department, appointmentDate: date,
        slotStartTime: time, slotEndTime: time, purpose: "v", status, createdById: admin._id,
      });
    await mk(profA, "2000-01-03", "09:00", "Scheduled"); // past
    await mk(profA, MON, "11:00", "Cancelled"); // cancelled
    const keep = await mk(profA, MON, "09:00", "Scheduled");
    await mk(profB, MON, "10:00", "Scheduled"); // someone else's
    const res = await api("get", "/api/v1/appointments?upcoming=true", t.a);
    expect(res.body.data.map((x) => x._id)).toEqual([keep.id]);
  });
});

describe("slot calculation from saved availability", () => {
  test("slots follow the saved schedule; days off explain why", async () => {
    // profA now: Monday 09:00-12:00, 30-minute slots
    expect(times(await slotsFor(profA, MON))).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"].filter((x) => x));
    const off = await slotsFor(profA, TUE);
    expect(off.data).toEqual([]);
    expect(off.message).toMatch(/does not work on Tuesdays/);
  });

  test("booked slots are marked unavailable; cancelled ones are free again", async () => {
    const body = await slotsFor(profA, MON);
    const nine = body.data.find((s) => s.startTime === "09:00");
    expect(nine.isAvailable).toBe(false); // booked by the upcoming test above
    const appt = await Appointment.findOne({ doctorId: profA._id, appointmentDate: MON, slotStartTime: "09:00" });
    await Appointment.updateOne({ _id: appt._id }, { status: "Cancelled" });
    expect((await slotsFor(profA, MON)).data.find((s) => s.startTime === "09:00").isAvailable).toBe(true);
    await Appointment.updateOne({ _id: appt._id }, { status: "Scheduled" });
  });

  test("slots overlapping a break are excluded, adjacent ones are kept", async () => {
    await api("patch", "/api/v1/doctors/me/availability", t.a).send({
      schedule: [day("Monday", { breaks: [{ startTime: "10:15", endTime: "11:00" }] })],
    });
    const free = times(await slotsFor(profA, MON));
    // 10:00-10:30 overlaps the break, 10:30-11:00 overlaps too; 09:30-10:00 ends before it, 11:00 starts after
    expect(free).toEqual(["09:00", "09:30", "11:00", "11:30"]);
    // a break that exactly abuts slots removes nothing around it
    await api("patch", "/api/v1/doctors/me/availability", t.a).send({
      schedule: [day("Monday", { breaks: [{ startTime: "10:00", endTime: "10:30" }] })],
    });
    expect(times(await slotsFor(profA, MON))).toEqual(["09:00", "09:30", "10:30", "11:00", "11:30"]);
  });

  test("a schedule change shows up in the scheduler immediately and keeps existing appointments", async () => {
    const before = await Appointment.find({ doctorId: profA._id }).lean();
    await api("patch", "/api/v1/doctors/me/availability", t.a).send({
      schedule: [day("Monday", { slotDurationMinutes: 60, sessions: [{ startTime: "13:00", endTime: "15:00" }] })],
    });
    const body = await slotsFor(profA, MON);
    expect(times(body)).toEqual(["13:00", "14:00"]);
    expect(body.data.every((s) => s.endTime)).toBe(true);
    // existing appointments are unchanged (even though 09:00 is now outside hours)
    const after = await Appointment.find({ doctorId: profA._id }).lean();
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  test("unavailable doctors and dates are explained", async () => {
    const past = await slotsFor(profA, "2000-01-03");
    expect([past.data, past.message]).toEqual([[], expect.stringMatching(/past/)]);
    expect((await slotsFor(profA, "not-a-date")).message).toBe("Invalid date");
    expect((await api("get", `/api/v1/slots?doctorId=${new mongoose.Types.ObjectId()}&date=${MON}`, t.rec)).status).toBe(404);
    expect((await api("get", `/api/v1/slots?doctorId=${profA.id}`, t.rec)).status).toBe(400);
    await User.updateOne({ _id: docB._id }, { isActive: false });
    const inactive = await slotsFor(profB, MON);
    expect(inactive.data).toEqual([]);
    expect(inactive.message).toMatch(/unavailable/);
    await User.updateOne({ _id: docB._id }, { isActive: true });
  });
});

describe("receptionist booking workflow", () => {
  const book = (over) =>
    api("post", "/api/v1/appointments", t.rec).send({
      patientType: "EXISTING", patientId: patient.id, doctorId: profA.id,
      appointmentDate: MON, slotStartTime: "13:00", slotEndTime: "14:00", purpose: "checkup", ...over,
    });

  test("full flow for an existing patient: search -> doctor -> slots -> book -> saved", async () => {
    const search = await api("get", "/api/v1/patients?search=5550000001", t.rec);
    expect(search.body.data.map((p) => p.name)).toEqual(["Pat One"]);
    const docs = await api("get", "/api/v1/doctors", t.rec);
    expect(docs.body.data.map((d) => d.userId.name)).toEqual(expect.arrayContaining(["Dr A", "Dr B"]));
    expect(times(await slotsFor(profA, MON), true)).toContain("13:00");

    const res = await book({ patientId: search.body.data[0]._id });
    expect(res.status).toBe(201);
    const saved = await Appointment.findById(res.body.data._id);
    expect(saved).toEqual(expect.objectContaining({
      appointmentDate: MON, slotStartTime: "13:00", slotEndTime: "14:00", status: "Scheduled",
      department: "General", purpose: "checkup",
    }));
    expect(String(saved.patientId)).toBe(patient.id);
    expect(String(saved.doctorId)).toBe(profA.id);
    expect(times(await slotsFor(profA, MON), true)).toEqual(["14:00"]);
  });

  test("same slot cannot be double-booked", async () => {
    const res = await book();
    expect(res.status).toBe(409);
    expect(await Appointment.countDocuments({ doctorId: profA._id, appointmentDate: MON, slotStartTime: "13:00", status: { $ne: "Cancelled" } })).toBe(1);
  });

  test("booking outside working hours, during a break, or with wrong slot length is refused", async () => {
    await api("patch", "/api/v1/doctors/me/availability", t.a).send({
      schedule: [day("Monday", { slotDurationMinutes: 60, sessions: [{ startTime: "13:00", endTime: "17:00" }], breaks: [{ startTime: "15:00", endTime: "16:00" }] })],
    });
    expect((await book({ slotStartTime: "08:00", slotEndTime: "09:00" })).status).toBe(409); // before hours
    expect((await book({ slotStartTime: "17:00", slotEndTime: "18:00" })).status).toBe(409); // after hours
    expect((await book({ slotStartTime: "15:00", slotEndTime: "16:00" })).status).toBe(409); // break
    expect((await book({ slotStartTime: "14:15", slotEndTime: "15:15" })).status).toBe(409); // off-grid
    expect((await book({ slotStartTime: "14:00", slotEndTime: "14:30" })).status).toBe(409); // wrong length
    expect((await book({ slotStartTime: "16:00", slotEndTime: "17:00" })).status).toBe(201); // valid
  });

  test("off days, past dates and inactive doctors give a clear 409", async () => {
    const off = await book({ appointmentDate: TUE });
    expect(off.status).toBe(409);
    expect(off.body.message).toMatch(/does not work on Tuesdays/);
    const past = await book({ appointmentDate: "2000-01-03" });
    expect(past.status).toBe(409);
    expect(past.body.message).toMatch(/past/);
    await User.updateOne({ _id: docA._id }, { isActive: false });
    const inactive = await book({ slotStartTime: "14:00", slotEndTime: "15:00" });
    expect(inactive.status).toBe(409);
    expect(inactive.body.message).toMatch(/unavailable/);
    await User.updateOne({ _id: docA._id }, { isActive: true });
  });

  test("new patient: registered and booked in one step; bad slot leaves no patient", async () => {
    const details = { name: "Fresh Face", mobile: "5550000009", age: 31, gender: "Female", email: "" };
    const bad = await book({ patientType: "NEW", patientId: undefined, patientDetails: details, slotStartTime: "03:00", slotEndTime: "04:00" });
    expect(bad.status).toBe(409);
    expect(await Patient.countDocuments({ mobile: "5550000009" })).toBe(0);
    const ok = await book({ patientType: "NEW", patientId: undefined, patientDetails: details, slotStartTime: "14:00", slotEndTime: "15:00" });
    expect(ok.status).toBe(201);
    const p = await Patient.findOne({ mobile: "5550000009" });
    expect(p).toBeTruthy();
    expect(p.patientId).toMatch(/^PAT-/);
    const appt = await Appointment.findById(ok.body.data._id);
    expect(String(appt.patientId)).toBe(p.id);
  });

  test("doctors cannot book; unauthenticated cannot book", async () => {
    const body = { patientType: "EXISTING", patientId: patient.id, doctorId: profA.id, appointmentDate: MON, slotStartTime: "13:00", slotEndTime: "14:00", purpose: "x" };
    expect((await api("post", "/api/v1/appointments", t.a).send(body)).status).toBe(403);
    expect((await api("post", "/api/v1/appointments").send(body)).status).toBe(401);
  });
});
