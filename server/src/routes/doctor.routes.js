// doctor.routes.js
const expressDoctor = require("express");
const routerDoctor = expressDoctor.Router();
const doctorController = require("../controllers/doctor.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const {
  createDoctorSchema,
  updateDoctorSchema,
  availabilitySchema,
} = require("../validators/schemas");

routerDoctor.get("/", authenticate, doctorController.getDoctors);
routerDoctor.post(
  "/",
  authenticate,
  authorize("SUPER_ADMIN"),
  validate(createDoctorSchema),
  doctorController.createDoctor,
);
routerDoctor.get(
  "/me",
  authenticate,
  authorize("DOCTOR"),
  doctorController.getMyProfile,
);
routerDoctor.patch(
  "/me/availability",
  authenticate,
  authorize("DOCTOR"),
  validate(availabilitySchema),
  doctorController.updateMyAvailability,
);
routerDoctor.patch(
  "/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  validate(updateDoctorSchema),
  doctorController.updateDoctor,
);
module.exports = routerDoctor;
