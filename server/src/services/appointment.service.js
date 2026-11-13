const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const logAudit = require("../utils/auditLogger");
const slotService = require("./slot.service");

const httpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const assertSlotAvailable = async (doctorId, date, start, end) => {
  const { slots, reason } = await slotService.getAvailability(doctorId, date);
  const validSlot = slots.some(
    (slot) =>
      slot.startTime === start && slot.endTime === end && slot.isAvailable,
  );
  if (!validSlot)
    throw httpError(
      slots.length === 0 && reason
        ? reason
        : "The selected slot is unavailable, booked, or outside the doctor's working hours",
      409,
    );
};

const createAppointment = async (data, user, io) => {
  const doctor = await Doctor.findById(data.doctorId);
  if (!doctor) throw httpError("Doctor not found", 404);

  let existingPatient = null;
  if (data.patientType !== "NEW") {
    existingPatient = await Patient.findById(data.patientId);
    if (!existingPatient) throw httpError("Patient record not found", 404);
  }

  // Validate the slot BEFORE creating anything, so a failed booking never
  // leaves an orphan patient behind.
  await assertSlotAvailable(
    data.doctorId,
    data.appointmentDate,
    data.slotStartTime,
    data.slotEndTime,
  );

  let createdPatient = null;
  if (data.patientType === "NEW") {
    const { randomUUID } = require("crypto");
    try {
      createdPatient = await Patient.create({
        patientId: `PAT-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
        ...data.patientDetails,
      });
    } catch (error) {
      if (error.code === 11000)
        throw httpError(
          "A patient with this mobile number is already registered. Choose Existing Patient instead.",
          409,
        );
      throw error;
    }
  }
  const patientIdObj = (existingPatient || createdPatient)._id;

  // Create appointment (Unique DB index prevents duplicate concurrency)
  let appointment;
  try {
    appointment = await Appointment.create({
      patientId: patientIdObj,
      doctorId: data.doctorId,
      department: doctor.department,
      appointmentDate: data.appointmentDate,
      slotStartTime: data.slotStartTime,
      slotEndTime: data.slotEndTime,
      purpose: data.purpose,
      createdById: user.id,
    });
  } catch (error) {
    if (createdPatient) await Patient.deleteOne({ _id: createdPatient._id });
    throw error;
  }

  await logAudit({
    user,
    action: "APPOINTMENT_CREATED",
    entity: "Appointment",
    entityId: appointment._id,
    details: {
      date: data.appointmentDate,
      slot: data.slotStartTime,
      doctorId: data.doctorId,
    },
  });

  if (io) {
    io.emit("appointmentUpdated", {
      type: "CREATED",
      doctorId: data.doctorId,
      date: data.appointmentDate,
      appointmentId: appointment._id,
    });
  }

  return appointment;
};

const getAppointments = async (query, user) => {
  const {
    page = 1,
    limit = 10,
    doctorId,
    department,
    status,
    date,
    search,
  } = query;
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 10));
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = {};

  if (user.role === "DOCTOR") {
    const doctorProfile = await Doctor.findOne({ userId: user.id });
    filter.doctorId = doctorProfile ? doctorProfile._id : null;
  } else if (doctorId) {
    filter.doctorId = doctorId;
  }

  if (department) filter.department = String(department);
  if (status) filter.status = String(status);
  if (date) filter.appointmentDate = String(date);
  if (query.upcoming === "true") {
    // upcoming = today or later and still active
    if (!date) filter.appointmentDate = { $gte: slotService.todayStr() };
    if (!status) filter.status = { $in: ["Scheduled", "Arrived"] };
  }

  let queryBuilder = Appointment.find(filter)
    .populate("patientId", "patientId name mobile email age gender")
    .populate({
      path: "doctorId",
      populate: { path: "userId", select: "name" },
    })
    .sort({ appointmentDate: 1, slotStartTime: 1 });

  if (search) {
    const safeSearch = escapeRegex(String(search).slice(0, 100));
    const patients = await Patient.find({
      $or: [
        { name: { $regex: safeSearch, $options: "i" } },
        { mobile: { $regex: safeSearch, $options: "i" } },
        { patientId: { $regex: safeSearch, $options: "i" } },
      ],
    }).select("_id");
    const pIds = patients.map((p) => p._id);
    filter.patientId = { $in: pIds };
    queryBuilder = Appointment.find(filter)
      .populate("patientId", "patientId name mobile email age gender")
      .populate({
        path: "doctorId",
        populate: { path: "userId", select: "name" },
      })
      .sort({ appointmentDate: 1, slotStartTime: 1 });
  }

  const skip = (pageNum - 1) * limitNum;
  const total = await Appointment.countDocuments(filter);
  const appointments = await queryBuilder.skip(skip).limit(limitNum);

  return {
    appointments,
    meta: {
      total,
      page: pageNum,
      pages: Math.max(1, Math.ceil(total / limitNum)),
    },
  };
};

const rescheduleAppointment = async (id, data, user, io) => {
  const appointment = await Appointment.findById(id);
  if (!appointment) throw httpError("Appointment not found", 404);
  if (["Cancelled", "Completed"].includes(appointment.status))
    throw httpError(
      `A ${appointment.status.toLowerCase()} appointment cannot be rescheduled`,
      409,
    );
  const unchanged =
    appointment.appointmentDate === data.appointmentDate &&
    appointment.slotStartTime === data.slotStartTime;
  if (!unchanged)
    await assertSlotAvailable(
      appointment.doctorId,
      data.appointmentDate,
      data.slotStartTime,
      data.slotEndTime,
    );
  const previous = {
    date: appointment.appointmentDate,
    slot: appointment.slotStartTime,
  };
  appointment.appointmentDate = data.appointmentDate;
  appointment.slotStartTime = data.slotStartTime;
  appointment.slotEndTime = data.slotEndTime;
  appointment.status = "Scheduled";
  await appointment.save();
  await logAudit({
    user,
    action: "APPOINTMENT_RESCHEDULED",
    entity: "Appointment",
    entityId: appointment._id,
    details: { from: previous, to: data.appointmentDate },
  });
  if (io)
    io.emit("appointmentUpdated", {
      type: "RESCHEDULED",
      doctorId: appointment.doctorId,
      date: appointment.appointmentDate,
      appointmentId: appointment._id,
    });
  return appointment;
};

module.exports = {
  createAppointment,
  getAppointments,
  rescheduleAppointment,
};
