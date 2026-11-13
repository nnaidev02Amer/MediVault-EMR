const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const {
  createPatientSchema,
  clinicalNoteSchema,
  updatePatientSchema,
  updateClinicalNoteSchema,
} = require("../validators/schemas");
const patientController = require("../controllers/patient.controller");

router.use(authenticate);
router.get("/", patientController.listPatients);
router.post(
  "/",
  authorize("SUPER_ADMIN", "RECEPTIONIST"),
  validate(createPatientSchema),
  patientController.createPatient,
);
router.get("/:id", patientController.getPatient);
router.patch(
  "/:id",
  authorize("SUPER_ADMIN", "RECEPTIONIST"),
  validate(updatePatientSchema),
  patientController.updatePatient,
);
router.patch(
  "/:id/clinical-notes/:noteId",
  authorize("DOCTOR"),
  validate(updateClinicalNoteSchema),
  patientController.updateClinicalNote,
);
router.post(
  "/:id/clinical-notes",
  authorize("DOCTOR"),
  validate(clinicalNoteSchema),
  patientController.addClinicalNote,
);

module.exports = router;
