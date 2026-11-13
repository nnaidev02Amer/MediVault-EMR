# MediVault — Enterprise MERN EMR (academic prototype)

MediVault is a role-based Electronic Medical Records (EMR) prototype for managing doctors' availability, patient registration, appointment booking and clinical notes. It is built with the MERN stack (MongoDB, Express, React, Node.js).

> **Synthetic data only.** This is an academic/development prototype. It has not been assessed for HIPAA, GDPR or any other compliance regime and is **not suitable for real clinical use** without independent security, privacy, clinical and legal review. Patient data is not encrypted at the application layer.

## Features

| Role | What they can do |
| --- | --- |
| **Super Admin** | Dashboard with system totals and appointment-status chart · create/search/filter user accounts, change roles, reset passwords, deactivate/reactivate accounts · create doctor profiles and edit any doctor's department, specialization and weekly schedule · register, search, view and edit patients · book, reschedule, cancel and mark appointments arrived · read all clinical notes |
| **Receptionist** | Dashboard with appointment statistics · **Book Appointment** workflow (search an existing patient by name, patient ID, mobile or email, or register a new one; pick a doctor, date and a free slot; confirmation summary) · register, search and edit patients · mark arrived, reschedule and cancel appointments · cannot see clinical notes or manage users |
| **Doctor** | Dashboard with own appointments, statistics and profile · **My Availability** (working days, hours, breaks, slot length, upcoming appointments — own schedule only) · view patients they have an appointment with, including medical history · add and edit their own clinical notes · save consultation notes and mark appointments completed |

Other behaviour worth knowing:

- **Role-based access** is enforced by the API on every protected route (JWT access + refresh tokens); the UI only hides what a role cannot use. Users cannot change their own role, and public self-registration is disabled — only a Super Admin creates accounts.
- **Slot calculation** follows the doctor's saved weekly schedule: slots overlapping a break are excluded, booked slots are marked unavailable, and past dates, days off and inactive doctors are explained to the user. Changing a doctor's availability never alters existing appointments.
- **Real-time refresh** of slots/dashboards through Socket.IO.
- **Audit log** entries are written for important actions.

## Technology stack

- **Frontend:** React 18, Vite 5, React Router 6, Tailwind CSS 3, Axios, Socket.IO client, lucide-react icons
- **Backend:** Node.js, Express 4, Mongoose 8 (MongoDB), Joi validation, JSON Web Tokens, bcryptjs, helmet, express-rate-limit, Socket.IO
- **Testing:** Jest + Supertest
- **Tooling:** Docker Compose (optional), `concurrently` for running both servers

This project is **not** a PWA: it has no manifest or service worker. (`client/src/main.jsx` unregisters any stale service worker that another project may have left on the same `localhost` port.)

## Project structure

```
.
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── components/        # appointments/, common/, doctors/, layout/ (Navbar), ui/ (shared UI kit)
│   │   ├── context/           # AuthContext (login/logout, session persistence)
│   │   ├── pages/             # Login, Dashboard, Patients, AppointmentScheduler (Book Appointment),
│   │   │                      #   MyAvailability, UserManagement
│   │   └── services/          # api.js (Axios + token refresh), socket.js
│   ├── Dockerfile, nginx.conf
│   └── vite.config.js         # dev server :5173, proxies /api and /socket.io to :5000
├── server/                    # Express + MongoDB backend
│   ├── src/
│   │   ├── controllers/  routes/  services/  middleware/  validators/  models/  utils/  config/
│   │   └── server.js, app.js
│   ├── scripts/seed.js        # LOCAL DEMO ONLY demo accounts
│   ├── tests/                 # Jest + Supertest suites
│   └── Dockerfile
├── docs/                      # API.md, DATABASE_SCHEMA.md, ENGINEERING_DECISIONS.md
├── docker-compose.yml         # mongodb + backend + frontend
├── .env.example               # Docker Compose variables (placeholders)
└── package.json               # root scripts (dev, build, test, seed)
```

## Prerequisites

- **Node.js 20+** and npm
- **MongoDB 6+** running locally on `127.0.0.1:27017`, **or** Docker Desktop (the included Compose file can start MongoDB for you)

## Installation

```bash
git clone <your-repository-url>
cd <repository-folder>

npm install                  # root: installs `concurrently`
npm install --prefix client
npm install --prefix server
```

## Environment variables

The backend reads `server/.env` (git-ignored). Create it from the example and set your own secrets:

```bash
cp server/.env.example server/.env        # Windows PowerShell: Copy-Item server/.env.example server/.env
```

Generate two **different** random secrets and put them in `server/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

| Variable | Purpose | Local default |
| --- | --- | --- |
| `PORT` | API port | `5000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/emr_db` |
| `JWT_ACCESS_SECRET` | signs access tokens — **required** | *(set your own)* |
| `JWT_REFRESH_SECRET` | signs refresh tokens — **required, different from above** | *(set your own)* |
| `JWT_ACCESS_EXPIRATION` / `JWT_REFRESH_EXPIRATION` | token lifetimes | `15m` / `7d` |
| `CLIENT_URL` | allowed CORS origin(s), comma-separated | `http://localhost:5173` |

The root `.env.example` is only for the Docker Compose stack (see below). **Never commit `.env` files or real secrets.**

## MongoDB configuration

- **Local MongoDB:** start the service and keep `MONGO_URI=mongodb://127.0.0.1:27017/emr_db`.
- **MongoDB in Docker:** `docker compose up -d mongodb` (exposes `27017`, data kept in the `mongo_data` volume).

## Running the application

```bash
npm run seed     # once: creates the LOCAL DEMO accounts + a sample doctor profile (never clears data)
npm run dev      # starts the API and the web app together
```

| Service | URL |
| --- | --- |
| Web app (Vite) | http://localhost:5173 |
| API | http://localhost:5000/api/v1 |
| Health check | http://localhost:5000/health |

Run them separately with `npm run dev:server` and `npm run dev:client`. Seeding is refused when `NODE_ENV=production`.

### Full stack with Docker (optional)

```bash
cp .env.example .env        # then set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in the root .env
docker compose up --build
```

The web app is then served by nginx on http://localhost:3000 (API proxied to the backend on `:5000`). To create demo data in that stack: `docker compose exec backend node scripts/seed.js`. *(The Compose stack was not exercised during the final review of this prototype.)*

## Demo login credentials — LOCAL DEMO ONLY

> **LOCAL DEMO ONLY.** These accounts exist only after you run `npm run seed` on your own machine. The passwords are public — never use them on a shared, hosted or production database, and delete or change them before any real use.

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `admin@emr.com` | `Super123` |
| Receptionist | `receptionist@emr.com` | `receptionist123` |
| Doctor | `doctor@emr.com` | `Doctor123` |

The seeded doctor has only a sample Monday schedule. Edit it from **My Availability** (as the doctor) or **Manage users → Doctor profiles** (as Super Admin) before booking other days.

## Testing and building

```bash
npm test          # backend: Jest + Supertest
npm run build     # frontend production build (client/dist)
```

- `npm test` needs MongoDB running. The suites create **throwaway databases named `emr_rbac_test_*` on the same MongoDB server and drop them afterwards**; they never read or modify `emr_db`. Use `TEST_MONGO_URI=mongodb://host:port` to point them at another server.
- The suites cover authentication and token handling, role-based access, admin operations, doctor workflows and availability, receptionist patient management, slot calculation, booking, patient search and clinical-note ownership.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | API + web app with hot reload |
| `npm run build` | production frontend bundle |
| `npm test` | backend test suites |
| `npm run seed` | LOCAL DEMO accounts and sample doctor profile |
| `docker compose up -d mongodb` | local MongoDB only |
| `docker compose up --build` | complete containerised stack |

## Documentation

- [`docs/API.md`](docs/API.md) — endpoint reference
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — collections and relationships
- [`docs/ENGINEERING_DECISIONS.md`](docs/ENGINEERING_DECISIONS.md) — design decisions and known limitations

## Known limitations

- The unique index on `Appointment` (`doctorId + appointmentDate + slotStartTime`, partial on non-cancelled status) uses an operator MongoDB does not support in partial indexes, so it is **not created**. Double-booking is prevented by the application's slot check, but two exactly simultaneous bookings of one slot are not blocked at the database level.
- Socket.IO connections are unauthenticated; they only carry appointment ids/dates, no patient data.
- The API allows 200 requests per 15 minutes per IP address (`express-rate-limit`), which is easy to reach with heavy automated use during development.
- Not a validated clinical product: no encryption at rest, no secure-session hardening, backups, monitoring or regulatory review.
