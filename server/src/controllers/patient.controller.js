const { randomUUID } = require("crypto");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const logAudit = require("../utils/auditLogger");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getPatientFilter = async (user, query) => {
  const filter = {};
  if (query.search) {
    const safeSearch = escapeRegex(String(query.search).slice(0, 100));
    filter.$or = [
      { name: { $regex: safeSearch, $options: "i" } },
      { mobile: { $regex: safeSearch, $options: "i" } },
      { patientId: { $regex: safeSearch, $options: "i" } },
      { email: { $regex: safeSearch, $options: "i" } },
    ];
  }
  if (user.role === "DOCTOR") {
    const doctor = await Doctor.findOne({ userId: user.id }).select("_id");
    if (!doctor) return { _id: { $exists: false } };
    const appointments = await Appointment.find({
      doctorId: doctor._id,
    }).distinct("patientId");
    filter._id = { $in: appointments };
  }
  return filter;
};

const listPatients = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 10),
    );
    const filter = await getPatientFilter(req.user, req.query);
    const [patients, total] = await Promise.all([
      Patient.find(filter)
        .select("-clinicalNotes -medicalHistory")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Patient.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data: patients,
      meta: { total, page, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    next(error);
  }
};

const createPatient = async (req, res, next) => {
  try {
    const patient = await Patient.create({
      ...req.body,
      patientId: `PAT-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
    });
    await logAudit({
      user: req.user,
      action: "PATIENT_REGISTERED",
      entity: "Patient",
      entityId: patient._id,
    });
    res.status(201).json({ success: true, data: patient });
  } catch (error) {
    if (error.code === 11000)
      return res
        .status(409)
        .json({
          success: false,
          message: "A patient with this mobile number is already registered",
        });
    next(error);
  }
};

const getPatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id).select("-__v");
    if (!patient)
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    if (req.user.role === "DOCTOR") {
      const doctor = await Doctor.findOne({ userId: req.user.id }).select(
        "_id",
      );
      const authorized =
        doctor &&
        (await Appointment.exists({
          doctorId: doctor._id,
          patientId: patient._id,
        }));
      if (!authorized)
        return res
          .status(403)
          .json({
            success: false,
            message: "No assigned patient relationship found",
          });
    }
    let doctorScope = null;
    if (req.user.role === "DOCTOR") {
      doctorScope = (
        await Doctor.findOne({ userId: req.user.id }).select("_id")
      )._id;
    }
    const appointments = await Appointment.find({
      patientId: patient._id,
      ...(doctorScope ? { doctorId: doctorScope } : {}),
    })
      .populate({
        path: "doctorId",
        populate: { path: "userId", select: "name" },
      })
      .sort({ appointmentDate: -1, slotStartTime: -1 })
      .limit(50);
    // Clinical notes: Super Admin sees all, a Doctor only their own,
    // a Receptionist none.
    const record = patient.toObject();
    if (req.user.role === "RECEPTIONIST") record.clinicalNotes = [];
    else if (doctorScope)
      record.clinicalNotes = (record.clinicalNotes || []).filter(
        (note) => String(note.doctorId) === String(doctorScope),
      );
    res.json({ success: true, data: { patient: record, appointments } });
  } catch (error) {
    next(error);
  }
};

const addClinicalNote = async (req, res, next) => {
  try {
    if (req.user.role !== "DOCTOR")
      return res
        .status(403)
        .json({
          success: false,
          message: "Only doctors may add clinical notes",
        });
    const doctor = await Doctor.findOne({ userId: req.user.id }).select("_id");
    if (!doctor)
      return res
        .status(403)
        .json({
          success: false,
          message: "No doctor profile is linked to this account",
        });
    const appointment = await Appointment.findOne({
      _id: req.body.appointmentId,
      patientId: req.params.id,
      doctorId: doctor._id,
    });
    if (!appointment)
      return res
        .status(403)
        .json({
          success: false,
          message: "Clinical note must be linked to your assigned appointment",
        });
    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          clinicalNotes: {
            doctorId: doctor._id,
            appointmentId: appointment._id,
            ...req.body,
          },
        },
      },
      { new: true, runValidators: true },
    );
    if (!patient)
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    await logAudit({
      user: req.user,
      action: "CLINICAL_NOTE_CREATED",
      entity: "Patient",
      entityId: patient._id,
    });
    res.status(201).json({ success: true, data: patient.clinicalNotes.at(-1) });
  } catch (error) {
    next(error);
  }
};

const updatePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true },
    ).select("-clinicalNotes -__v");
    if (!patient)
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    await logAudit({
      user: req.user,
      action: "PATIENT_UPDATED",
      entity: "Patient",
      entityId: patient._id,
    });
    res.json({ success: true, data: patient });
  } catch (error) {
    if (error.code === 11000)
      return res.status(409).json({
        success: false,
        message: "A patient with this mobile number is already registered",
      });
    next(error);
  }
};

const updateClinicalNote = async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id }).select("_id");
    if (!doctor)
      return res.status(403).json({
        success: false,
        message: "No doctor profile is linked to this account",
      });
    const set = {};
    for (const key of ["diagnosis", "treatmentPlan", "note"])
      if (req.body[key] !== undefined)
        set[`clinicalNotes.$.${key}`] = req.body[key];
    // Matching on doctorId means a doctor can only edit their own notes.
    const patient = await Patient.findOneAndUpdate(
      {
        _id: req.params.id,
        clinicalNotes: {
          $elemMatch: { _id: req.params.noteId, doctorId: doctor._id },
        },
      },
      { $set: set },
      { new: true, runValidators: true },
    );
    if (!patient)
      return res.status(403).json({
        success: false,
        message: "Clinical note not found or not authored by you",
      });
    await logAudit({
      user: req.user,
      action: "CLINICAL_NOTE_UPDATED",
      entity: "Patient",
      entityId: patient._id,
    });
    res.json({
      success: true,
      data: patient.clinicalNotes.id(req.params.noteId),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listPatients,
  createPatient,
  getPatient,
  addClinicalNote,
  updatePatient,
  updateClinicalNote,
};
