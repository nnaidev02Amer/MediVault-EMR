/**
 * Patient search used by the booking form's "Existing Patient" picker, and the
 * guarantee that booking an existing patient never creates another patient.
 * Throwaway MongoDB database, synthetic data.
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

const TEST_DB = `emr_rbac_test_psearch_${process.pid}_${Date.now()}`;
const BASE_URI = (process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017").replace(/\/+$/, "");
const PW = "Passw0rd-long";
const api = (method, url, token) => {
  const r = request(app)[method](url);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};
const MON = "2030-01-07";
let tok, prof, ids;

beforeAll(async () => {
  expect(TEST_DB).toMatch(/^emr_rbac_test_/);
  await mongoose.connect(`${BASE_URI}/${TEST_DB}`, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Doctor.init(), Patient.init()]);
  await User.create({ name: "Recep", email: "recep@t.com", password: PW, role: "RECEPTIONIST" });
  const du = await User.create({ name: "Dr A", email: "a@t.com", password: PW, role: "DOCTOR" });
  prof = await Doctor.create({
    userId: du._id, department: "General", specialization: "IM",
    schedule: [{ dayOfWeek: "Monday", slotDurationMinutes: 30, sessions: [{ startTime: "09:00", endTime: "12:00" }], breaks: [] }],
  });
  const mk = (patientId, name, mobile, email) => Patient.create({ patientId, name, mobile, email, age: 30, gender: "Female" });
  ids = {
    jane: await mk("PAT-JANE01", "Jane Doe", "5551110001", "jane.doe@example.com"),
    janet: await mk("PAT-JANET2", "Janet Roe", "5551110002", ""),
    bob: await mk("PAT-BOB003", "Bob O'Brien", "5559990003", "bob@example.org"),
  };
  tok = (await request(app).post("/api/v1/auth/login").send({ email: "recep@t.com", password: PW })).body.data.accessToken;
});

afterAll(async () => {
  if (mongoose.connection.name === TEST_DB) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const search = async (q) => {
  const res = await api("get", `/api/v1/patients?limit=10&search=${encodeURIComponent(q)}`, tok);
  expect(res.status).toBe(200);
  return res.body.data;
};

describe("patient search for the booking picker", () => {
  test("by name (partial, case-insensitive)", async () => {
    expect((await search("jan")).map((p) => p.name).sort()).toEqual(["Jane Doe", "Janet Roe"]);
    expect((await search("DOE")).map((p) => p.name)).toEqual(["Jane Doe"]);
  });
  test("by patient ID", async () => {
    expect((await search("PAT-BOB003")).map((p) => p.name)).toEqual(["Bob O'Brien"]);
    expect((await search("pat-jane0")).map((p) => p.name)).toEqual(["Jane Doe"]);
  });
  test("by mobile number (full and partial)", async () => {
    expect((await search("5551110002")).map((p) => p.name)).toEqual(["Janet Roe"]);
    expect((await search("555111")).map((p) => p.name).sort()).toEqual(["Jane Doe", "Janet Roe"]);
  });
  test("by email", async () => {
    expect((await search("jane.doe@example")).map((p) => p.name)).toEqual(["Jane Doe"]);
    expect((await search("example.org")).map((p) => p.name)).toEqual(["Bob O'Brien"]);
  });
  test("results contain what the picker shows and no duplicates", async () => {
    const rows = await search("5551");
    expect(new Set(rows.map((p) => p._id)).size).toBe(rows.length);
    expect(rows[0]).toEqual(expect.objectContaining({ patientId: expect.any(String), mobile: expect.any(String), age: 30, gender: "Female" }));
    expect(rows[0].clinicalNotes).toBeUndefined();
  });
  test("no match -> empty list; regex characters are treated literally", async () => {
    expect(await search("zzzz-no-such")).toEqual([]);
    expect(await search(".*")).toEqual([]);
    expect((await search("O'Brien")).map((p) => p.name)).toEqual(["Bob O'Brien"]);
  });
  test("unauthenticated search is refused", async () => {
    expect((await api("get", "/api/v1/patients?search=jane")).status).toBe(401);
  });
});

describe("booking with a selected existing patient", () => {
  const body = (over = {}) => ({
    patientType: "EXISTING", patientId: ids.jane.id, doctorId: prof.id,
    appointmentDate: MON, slotStartTime: "09:00", slotEndTime: "09:30", purpose: "checkup", ...over,
  });

  test("links the chosen patient and creates NO new patient", async () => {
    const before = await Patient.countDocuments();
    const res = await api("post", "/api/v1/appointments", tok).send(body());
    expect(res.status).toBe(201);
    expect(await Patient.countDocuments()).toBe(before);
    const saved = await Appointment.findById(res.body.data._id);
    expect(String(saved.patientId)).toBe(ids.jane.id);
    // the appointment list shows that patient's details
    const list = await api("get", "/api/v1/appointments", tok);
    expect(list.body.data[0].patientId).toEqual(expect.objectContaining({ name: "Jane Doe", patientId: "PAT-JANE01", mobile: "5551110001" }));
  });

  test("a missing / unknown / malformed patient is refused and creates nothing", async () => {
    const before = [await Patient.countDocuments(), await Appointment.countDocuments()];
    expect((await api("post", "/api/v1/appointments", tok).send(body({ patientId: undefined, slotStartTime: "10:00", slotEndTime: "10:30" }))).status).toBe(400);
    expect((await api("post", "/api/v1/appointments", tok).send(body({ patientId: new mongoose.Types.ObjectId().toString(), slotStartTime: "10:00", slotEndTime: "10:30" }))).status).toBe(404);
    expect((await api("post", "/api/v1/appointments", tok).send(body({ patientId: "not-an-id", slotStartTime: "10:00", slotEndTime: "10:30" }))).status).toBe(400);
    expect([await Patient.countDocuments(), await Appointment.countDocuments()]).toEqual(before);
  });

  test("an existing patient's details cannot be overridden through the booking request", async () => {
    const res = await api("post", "/api/v1/appointments", tok).send(
      body({ slotStartTime: "10:00", slotEndTime: "10:30", patientDetails: { name: "Hacked", mobile: "1234567890", age: 1, gender: "Male" } }),
    );
    // patientDetails is only allowed for NEW patients; the request is either rejected or ignores it
    if (res.status === 201) expect((await Patient.findById(ids.jane.id)).name).toBe("Jane Doe");
    expect(await Patient.countDocuments({ name: "Hacked" })).toBe(0);
  });

  test("new-patient booking still registers and links exactly one patient", async () => {
    const before = await Patient.countDocuments();
    const res = await api("post", "/api/v1/appointments", tok).send({
      patientType: "NEW", doctorId: prof.id, appointmentDate: MON, slotStartTime: "11:00", slotEndTime: "11:30", purpose: "first",
      patientDetails: { name: "Newly Added", mobile: "5557770001", age: 22, gender: "Male", email: "" },
    });
    expect(res.status).toBe(201);
    expect(await Patient.countDocuments()).toBe(before + 1);
    const p = await Patient.findOne({ mobile: "5557770001" });
    expect(String((await Appointment.findById(res.body.data._id)).patientId)).toBe(p.id);
    // and it is now findable in the picker
    expect((await search("Newly")).map((x) => x.name)).toEqual(["Newly Added"]);
  });
});
