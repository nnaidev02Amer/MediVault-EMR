# Engineering decisions and limitations

- Use CommonJS on the Express service to match the existing server; use Vite ES modules on the React client.
- Keep one API prefix (`/api/v1`) and use Vite proxying locally; the nginx container proxies API and Socket.IO requests to the Compose backend.
- Authorization is enforced server-side on every protected route: the user (and role) is re-read from the database per request, requests are validated with Joi (unknown fields are rejected), doctors are restricted to their own appointments, patients and clinical notes, receptionists never receive clinical notes, and only a Super Admin can create accounts or change roles. The UI only hides what a role cannot use.
- Public self-registration is disabled; refresh tokens are revoked on logout, deactivation, password change and role change.
- Appointment availability is computed from the doctor's saved weekly schedule (breaks excluded, booked slots marked). The same calculation validates bookings and reschedules, and a slot is validated before any patient record is created.
- Doctors manage only their own availability; Super Admin can manage every doctor's schedule. Schedule edits never modify existing appointments.
- The demo seed is LOCAL DEMO ONLY, idempotent and never drops collections. JWT secrets and database connection strings are environment-only; `.env` files are git-ignored and the `.env.example` files contain placeholders.
- Backend tests are integration tests: they run the real Express app against throwaway MongoDB databases (`emr_rbac_test_*`) that they drop afterwards, using synthetic data. A running MongoDB is required (`TEST_MONGO_URI` overrides the server address).
- The frontend uses a small shared UI kit (`client/src/components/ui`) and Tailwind component classes (`client/src/index.css`) so every page shares colours, spacing, buttons, forms, badges, dialogs and empty/error/loading states.
- The app is not a PWA: there is no manifest or service worker.

## Known limitations

- The `Appointment` unique double-booking index cannot be built by MongoDB (unsupported `$ne` partial filter) — see `DATABASE_SCHEMA.md`. The booking service's slot check is the effective guard.
- Socket.IO connections are unauthenticated (events carry appointment ids, doctor ids and dates only).
- A global rate limit of 200 requests / 15 minutes / IP applies to the whole API.
- This is a learning/development foundation, not a validated clinical product. Before real use add threat modeling, encryption/key management, regulatory review, secure session design, audit retention, migrations, backups, monitoring, and broader authorization tests.
