const request = require("supertest");

jest.mock("../src/models/User", () => ({
  create: jest.fn(),
}));

jest.mock("../src/utils/auditLogger", () => jest.fn());

const User = require("../src/models/User");
const app = require("../src/app");

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
});

describe("EMR API safety and availability", () => {
  test("health endpoint responds without requiring MongoDB", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("OK");
  });

  test("appointment API rejects unauthenticated requests", async () => {
    const response = await request(app).get("/api/v1/appointments");
    expect(response.status).toBe(401);
  });

  test("patient API rejects unauthenticated requests", async () => {
    const response = await request(app).post("/api/v1/patients").send({});
    expect(response.status).toBe(401);
  });

  test("unknown routes do not return a successful response", async () => {
    const response = await request(app).get("/does-not-exist");
    expect(response.status).toBe(404);
  });

  test("public signup is disabled and creates no account", async () => {
    const response = await request(app).post("/api/v1/auth/signup").send({
      name: "New Staff User",
      email: "newuser@example.com",
      password: "StrongPassword123",
      role: "DOCTOR",
    });

    expect(response.status).toBe(403);
    expect(response.body.data).toBeUndefined();
    expect(User.create).not.toHaveBeenCalled();
  });
});
