# Database schema

- **User** — normalized unique email, bcrypt-hashed password (`select: false`), role (`SUPER_ADMIN`, `RECEPTIONIST`, `DOCTOR`), active flag, optional refresh token (`select: false`).
- **Doctor** — unique linked doctor user, department, specialization, and a weekly `schedule`: per weekday a slot duration, one or more working `sessions` and `breaks` (`HH:mm` strings).
- **Patient** — unique generated patient ID and unique mobile number, name, optional email, age, gender, synthetic medical history, and embedded `clinicalNotes` (each referencing the authoring doctor and the appointment; diagnosis, treatment plan, note, timestamp).
- **Appointment** — patient, doctor, booking user, date (`YYYY-MM-DD`), start/end slot (`HH:mm`), department, purpose, status (`Scheduled`, `Arrived`, `Completed`, `Cancelled`) and notes.
- **AuditLog** — actor ID/role, action, entity, entity ID, and limited non-secret details.

The app uses a MongoDB URI supplied through `MONGO_URI` (or `MONGODB_URI`). The backend test suites create temporary databases named `emr_rbac_test_*` on the same MongoDB server and drop them when finished; they never touch the application database. The demo seed (`npm run seed`) only upserts the named LOCAL DEMO accounts and a sample doctor profile; production seeding is refused.

## Known limitation: double-booking index

`Appointment` declares a compound unique index on `doctorId + appointmentDate + slotStartTime` with a partial filter `status ≠ Cancelled`. MongoDB does not support `$ne` in a partial index filter, so this index **cannot be built** and does not exist. Double-booking is prevented by the booking service (it recomputes the doctor's slots and rejects a taken slot), which covers ordinary use but not two exactly simultaneous requests. A supported alternative would be a partial filter such as `status: { $in: ["Scheduled", "Arrived", "Completed"] }` (not applied here, because changing indexes alters existing databases).

Clinical data is not encrypted at the application layer, and this schema has not been reviewed for any regulatory compliance. Use synthetic records only.
