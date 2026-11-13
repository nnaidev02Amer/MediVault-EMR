/**
 * RBAC / authentication integration tests.
 * Runs the real Express app against a THROWAWAY MongoDB database that is
 * dropped afterwards. It never touches the application database.
 */
const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

jest.mock("../src/utils/auditLogger", () => jest.fn());

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const app = require("../src/app");
const User = require("../src/models/User");
const Doctor = require("../src/models/Doctor");
const Patient = require("../src/models/Patient");
const Appointment = require("../src/models/Appointment");

const TEST_DB = `emr_rbac_test_${process.pid}_${Date.now()}`;
const BASE_URI = (process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017").replace(/\/+$/, "");
const PW = "Passw0rd-long";

const api = (method, url, token) => {
  const r = request(app)[method](url);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};

const tokens = {};
let ids = {};

const login = async (email) => {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PW });
  expect(res.status).toBe(200);
  return res.body.data;
};
const refresh = (refreshToken) => request(app).post("/api/v1/auth/refresh").send({ refreshToken });

beforeAll(async () => {
  expect(TEST_DB).toMatch(/^emr_rbac_test_/); // safety: never the real DB
  await mongoose.connect(`${BASE_URI}/${TEST_DB}`, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Doctor.init(), Patient.init()]); // Appointment index is invalid on MongoDB ($ne in partial index) - see audit report

  const mk = (name, role, email) => User.create({ name, email, password: PW, role });
  const admin = await mk("Admin", "SUPER_ADMIN", "admin@t.com");
  const recep = await mk("Recep", "RECEPTIONIST", "recep@t.com");
  const docA = await mk("Dr A", "DOCTOR", "a@t.com");
  const docB = await mk("Dr B", "DOCTOR", "b@t.com");
  await mk("Dr NoProfile", "DOCTOR", "np@t.com");

  const profA = await Doctor.create({ userId: docA._id, department: "Gen", specialization: "IM" });
  const profB = await Doctor.create({ userId: docB._id, department: "Gen", specialization: "IM" });

  const mkPatient = (n, mobile) =>
    Patient.create({ patientId: `PAT-${n}`, name: `Patient ${n}`, mobile, age: 30, gender: "Male", medicalHistory: "hx" });
  const pA = await mkPatient("A", "1111111111"); // seen only by Dr A
  const pB = await mkPatient("B", "2222222222"); // seen only by Dr B
  const pShared = await mkPatient("S", "3333333333"); // seen by both

  const mkAppt = (patient, prof, time) =>
    Appointment.create({
      patientId: patient._id,
      doctorId: prof._id,
      department: "Gen",
      appointmentDate: "2030-01-07",
      slotStartTime: time,
      slotEndTime: time.replace(":00", ":15"),
      purpose: "checkup",
      createdById: admin._id,
    });
  const aA = await mkAppt(pA, profA, "09:00");
  const aB = await mkAppt(pB, profB, "09:00");
  const aSA = await mkAppt(pShared, profA, "10:00");
  const aSB = await mkAppt(pShared, profB, "10:00");

  await Patient.findByIdAndUpdate(pShared._id, {
    $push: {
      clinicalNotes: [
        { doctorId: profA._id, appointmentId: aSA._id, note: "note-by-A" },
        { doctorId: profB._id, appointmentId: aSB._id, note: "note-by-B" },
      ],
    },
  });

  ids = { admin, recep, docA, docB, profA, profB, pA, pB, pShared, aA, aB, aSA, aSB };
  for (const [k, e] of [
    ["admin", "admin@t.com"],
    ["recep", "recep@t.com"],
    ["docA", "a@t.com"],
    ["docB", "b@t.com"],
    ["np", "np@t.com"],
  ])
    tokens[k] = (await login(e)).accessToken;
});

afterAll(async () => {
  if (mongoose.connection.name === TEST_DB) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("authentication", () => {
  test("login returns role and tokens; bad password / unknown user -> 401", async () => {
    const ok = await login("recep@t.com");
    expect(ok.user.role).toBe("RECEPTIONIST");
    expect(ok.user.password).toBeUndefined();
    const bad = await request(app).post("/api/v1/auth/login").send({ email: "recep@t.com", password: "wrong-password" });
    expect(bad.status).toBe(401);
    const unknown = await request(app).post("/api/v1/auth/login").send({ email: "nobody@t.com", password: PW });
    expect(unknown.status).toBe(401);
  });

  test("protected APIs reject missing, malformed, tampered, forged, expired and alg=none tokens", async () => {
    const urls = ["/api/v1/appointments", "/api/v1/patients", "/api/v1/users", "/api/v1/doctors", "/api/v1/dashboard/stats", "/api/v1/slots"];
    for (const u of urls) expect((await api("get", u)).status).toBe(401);
    expect((await api("get", "/api/v1/patients", "garbage")).status).toBe(401);
    const tampered = tokens.recep.slice(0, -2) + (tokens.recep.endsWith("AA") ? "BB" : "AA");
    expect((await api("get", "/api/v1/patients", tampered)).status).toBe(401);
    const forged = jwt.sign({ id: ids.recep.id, role: "SUPER_ADMIN" }, "other-secret");
    expect((await api("get", "/api/v1/users", forged)).status).toBe(401);
    const expired = jwt.sign({ id: ids.admin.id }, process.env.JWT_ACCESS_SECRET, { expiresIn: -10 });
    expect((await api("get", "/api/v1/users", expired)).status).toBe(401);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ id: ids.admin.id })).toString("base64url")}.`;
    expect((await api("get", "/api/v1/users", none)).status).toBe(401);
  });

  test("role comes from the database, not the token claim", async () => {
    const lying = jwt.sign({ id: ids.recep.id, role: "SUPER_ADMIN" }, process.env.JWT_ACCESS_SECRET);
    expect((await api("get", "/api/v1/users", lying)).status).toBe(403);
  });

  test("a validly signed token for a non-existent user is rejected", async () => {
    const ghost = jwt.sign({ id: new mongoose.Types.ObjectId().toString() }, process.env.JWT_ACCESS_SECRET);
    expect((await api("get", "/api/v1/patients", ghost)).status).toBe(401);
  });

  test("refresh restores a session; logout revokes the refresh token", async () => {
    const s = await login("np@t.com");
    const r = await refresh(s.refreshToken);
    expect(r.status).toBe(200);
    expect((await api("get", "/api/v1/dashboard/stats", r.body.data.accessToken)).status).toBe(200);
    expect((await refresh("bad")).status).toBe(401);
    expect((await refresh(s.accessToken)).status).toBe(401); // access token is not a refresh token
    expect((await api("post", "/api/v1/auth/logout", s.accessToken)).status).toBe(200);
    expect((await refresh(s.refreshToken)).status).toBe(401);
    expect((await api("post", "/api/v1/auth/logout")).status).toBe(401);
  });

  test("deactivated user: access token, refresh token and login all stop working", async () => {
    const u = await User.create({ name: "Temp", email: "temp@t.com", password: PW, role: "RECEPTIONIST" });
    const s = await login("temp@t.com");
    expect((await api("get", "/api/v1/patients", s.accessToken)).status).toBe(200);
    expect((await api("patch", `/api/v1/users/${u.id}`, tokens.admin).send({ isActive: false })).status).toBe(200);
    expect((await api("get", "/api/v1/patients", s.accessToken)).status).toBe(401);
    expect((await refresh(s.refreshToken)).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/login").send({ email: "temp@t.com", password: PW })).status).toBe(401);
  });

  test("role change revokes the user's refresh token", async () => {
    const u = await User.create({ name: "Temp2", email: "temp2@t.com", password: PW, role: "RECEPTIONIST" });
    const s = await login("temp2@t.com");
    expect((await api("patch", `/api/v1/users/${u.id}`, tokens.admin).send({ role: "DOCTOR" })).status).toBe(200);
    expect((await refresh(s.refreshToken)).status).toBe(401);
  });
});

describe("account creation and privilege escalation", () => {
  test("public signup is closed for every role value (incl. SUPER_ADMIN) and creates nothing", async () => {
    for (const role of ["RECEPTIONIST", "DOCTOR", "SUPER_ADMIN", undefined]) {
      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send({ name: "Mallory", email: `m-${role}@t.com`, password: PW, role });
      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
    }
    expect(await User.countDocuments({ email: /^m-/ })).toBe(0);
  });

  test("only SUPER_ADMIN can list/create/update users", async () => {
    const body = { name: "Created", email: "created@t.com", password: PW, role: "DOCTOR" };
    for (const t of [tokens.recep, tokens.docA]) {
      expect((await api("get", "/api/v1/users", t)).status).toBe(403);
      expect((await api("post", "/api/v1/users", t).send(body)).status).toBe(403);
      expect((await api("patch", `/api/v1/users/${ids.docB.id}`, t).send({ isActive: false })).status).toBe(403);
    }
    expect((await api("post", "/api/v1/users").send(body)).status).toBe(401);
    const ok = await api("post", "/api/v1/users", tokens.admin).send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.data.password).toBeUndefined();
    expect((await api("get", "/api/v1/users", tokens.admin)).status).toBe(200);
  });

  test("invalid roles, unknown fields and malformed ids are rejected", async () => {
    const bad = await api("post", "/api/v1/users", tokens.admin).send({ name: "X Y", email: "x@t.com", password: PW, role: "ROOT" });
    expect(bad.status).toBe(400);
    expect((await api("patch", `/api/v1/users/${ids.recep.id}`, tokens.admin).send({ role: "GOD" })).status).toBe(400);
    expect((await api("patch", `/api/v1/users/${ids.recep.id}`, tokens.admin).send({ refreshToken: "x" })).status).toBe(400);
    expect((await api("patch", "/api/v1/users/not-an-id", tokens.admin).send({ name: "Zed Zed" })).status).toBe(400);
  });

  test("receptionist and doctor cannot escalate their own role", async () => {
    for (const [k, user] of [["recep", ids.recep], ["docA", ids.docA]]) {
      const res = await api("patch", `/api/v1/users/${user.id}`, tokens[k]).send({ role: "SUPER_ADMIN" });
      expect(res.status).toBe(403);
      expect((await User.findById(user.id)).role).not.toBe("SUPER_ADMIN");
    }
  });

  test("Super Admin cannot demote/deactivate themselves or the last active admin", async () => {
    expect((await api("patch", `/api/v1/users/${ids.admin.id}`, tokens.admin).send({ role: "DOCTOR" })).status).toBe(400);
    expect((await api("patch", `/api/v1/users/${ids.admin.id}`, tokens.admin).send({ isActive: false })).status).toBe(400);
  });

  test("only Super Admin can create doctor profiles", async () => {
    const u = await User.create({ name: "Dr New", email: "new@t.com", password: PW, role: "DOCTOR" });
    const body = { userId: u.id, department: "Cardio", specialization: "Heart" };
    expect((await api("post", "/api/v1/doctors", tokens.recep).send(body)).status).toBe(403);
    expect((await api("post", "/api/v1/doctors", tokens.docA).send(body)).status).toBe(403);
    expect((await api("post", "/api/v1/doctors", tokens.admin).send(body)).status).toBe(201);
  });
});

describe("role permissions on patients and appointments", () => {
  test("receptionist can register patients; doctor cannot; mass-assignment rejected", async () => {
    const body = { name: "Walk In", mobile: "9999999999", age: 20, gender: "Female" };
    expect((await api("post", "/api/v1/patients", tokens.docA).send(body)).status).toBe(403);
    expect((await api("post", "/api/v1/patients", tokens.recep).send(body)).status).toBe(201);
    const inj = await api("post", "/api/v1/patients", tokens.recep).send({ ...body, mobile: "8888888888", patientId: "HACK", clinicalNotes: [] });
    expect(inj.status).toBe(400);
  });

  test("receptionist can manage appointments; doctor cannot create/arrive/cancel", async () => {
    expect((await api("post", `/api/v1/appointments/${ids.aA.id}/arrive`, tokens.docA)).status).toBe(403);
    expect((await api("delete", `/api/v1/appointments/${ids.aA.id}`, tokens.docA)).status).toBe(403);
    expect((await api("post", "/api/v1/appointments", tokens.docA).send({})).status).toBe(403);
    expect((await api("post", `/api/v1/appointments/${ids.aA.id}/arrive`, tokens.recep)).status).toBe(200);
  });

  test("doctor sees only own appointments and only their patients; doctorId query cannot widen scope", async () => {
    const list = await api("get", "/api/v1/appointments?limit=50", tokens.docA);
    expect(list.status).toBe(200);
    expect(list.body.data.map((a) => a._id).sort()).toEqual([ids.aA.id, ids.aSA.id].sort());
    const spoof = await api("get", `/api/v1/appointments?limit=50&doctorId=${ids.profB.id}`, tokens.docA);
    expect(spoof.body.data.every((a) => a._id !== ids.aB.id && a._id !== ids.aSB.id)).toBe(true);
    const pats = await api("get", "/api/v1/patients?limit=50", tokens.docA);
    expect(pats.body.data.map((p) => p.name).sort()).toEqual(["Patient A", "Patient S"]);
    expect((await api("get", "/api/v1/appointments?limit=50", tokens.recep)).body.meta.total).toBe(4);
  });

  test("doctor without a profile sees nothing", async () => {
    expect((await api("get", "/api/v1/appointments", tokens.np)).body.data).toHaveLength(0);
    expect((await api("get", "/api/v1/patients", tokens.np)).body.data).toHaveLength(0);
  });

  test("doctor cannot read an unrelated patient record by direct URL", async () => {
    expect((await api("get", `/api/v1/patients/${ids.pB.id}`, tokens.docA)).status).toBe(403);
    expect((await api("get", `/api/v1/patients/${ids.pA.id}`, tokens.docB)).status).toBe(403);
    expect((await api("get", `/api/v1/patients/${ids.pA.id}`, tokens.np)).status).toBe(403);
    expect((await api("get", `/api/v1/patients/${ids.pA.id}`, tokens.docA)).status).toBe(200);
    expect((await api("get", "/api/v1/patients/not-an-id", tokens.docA)).status).toBe(400);
  });

  test("doctor cannot modify another doctor's appointment or disallowed fields", async () => {
    const put = (id, body) => api("put", `/api/v1/appointments/${id}`, tokens.docA).send(body);
    expect((await put(ids.aB.id, { notes: "x" })).status).toBe(403);
    expect((await put(ids.aA.id, { purpose: "x" })).status).toBe(403);
    expect((await put(ids.aA.id, { status: "Cancelled" })).status).toBe(403);
    expect((await put(ids.aA.id, { doctorId: ids.profB.id, notes: "x" })).status).toBe(400);
    expect((await put(ids.aA.id, { notes: "mine", status: "Completed" })).status).toBe(200);
  });

  test("dashboard stats are scoped by role", async () => {
    const adm = await api("get", "/api/v1/dashboard/stats", tokens.admin);
    expect(adm.body.data.appointments).toBe(4);
    const rec = await api("get", "/api/v1/dashboard/stats", tokens.recep);
    expect(rec.body.data.patients).toBeNull();
    expect(rec.body.data.activeUsers).toBeNull();
    const doc = await api("get", "/api/v1/dashboard/stats", tokens.docA);
    expect(doc.body.data.appointments).toBe(2);
    expect(doc.body.data.activeUsers).toBeNull();
  });
});

describe("clinical-note ownership", () => {
  const note = { diagnosis: "d", treatmentPlan: "t", note: "n" };
  const url = (p) => `/api/v1/patients/${p.id}/clinical-notes`;

  test("only a doctor can add notes", async () => {
    const body = { appointmentId: ids.aA.id, ...note };
    expect((await api("post", url(ids.pA)).send(body)).status).toBe(401);
    expect((await api("post", url(ids.pA), tokens.recep).send(body)).status).toBe(403);
    expect((await api("post", url(ids.pA), tokens.admin).send(body)).status).toBe(403);
  });

  test("doctor can only add a note for their own appointment with that patient", async () => {
    expect((await api("post", url(ids.pB), tokens.docA).send({ appointmentId: ids.aB.id, ...note })).status).toBe(403);
    expect((await api("post", url(ids.pB), tokens.docA).send({ appointmentId: ids.aA.id, ...note })).status).toBe(403);
    expect((await api("post", url(ids.pA), tokens.np).send({ appointmentId: ids.aA.id, ...note })).status).toBe(403);
    const spoof = await api("post", url(ids.pA), tokens.docA).send({ appointmentId: ids.aA.id, doctorId: ids.profB.id, ...note });
    expect(spoof.status).toBe(400);
    const ok = await api("post", url(ids.pA), tokens.docA).send({ appointmentId: ids.aA.id, ...note });
    expect(ok.status).toBe(201);
    expect(String(ok.body.data.doctorId)).toBe(ids.profA.id);
  });

  test("doctor sees only their own notes and appointments on a shared patient", async () => {
    const res = await api("get", `/api/v1/patients/${ids.pShared.id}`, tokens.docA);
    expect(res.status).toBe(200);
    expect(res.body.data.patient.clinicalNotes.map((n) => n.note)).toEqual(["note-by-A"]);
    expect(res.body.data.appointments.map((a) => a._id)).toEqual([ids.aSA.id]);
    const resB = await api("get", `/api/v1/patients/${ids.pShared.id}`, tokens.docB);
    expect(resB.body.data.patient.clinicalNotes.map((n) => n.note)).toEqual(["note-by-B"]);
  });

  test("receptionist never receives clinical notes; patient lists never include them", async () => {
    const res = await api("get", `/api/v1/patients/${ids.pShared.id}`, tokens.recep);
    expect(res.status).toBe(200);
    expect(res.body.data.patient.clinicalNotes).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/note-by-/);
    for (const t of [tokens.recep, tokens.admin, tokens.docA]) {
      const list = await api("get", "/api/v1/patients?limit=50", t);
      expect(JSON.stringify(list.body)).not.toMatch(/note-by-|clinicalNotes/);
    }
  });

  test("super admin can read all notes", async () => {
    const res = await api("get", `/api/v1/patients/${ids.pShared.id}`, tokens.admin);
    expect(res.body.data.patient.clinicalNotes).toHaveLength(2);
  });
});
