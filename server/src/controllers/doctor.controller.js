const Doctor = require("../models/Doctor");
const User = require("../models/User");
const logAudit = require("../utils/auditLogger");

const getDoctors = async (req, res, next) => {
  try {
    const doctors = await Doctor.find()
      .populate("userId", "name email isActive")
      .sort({ createdAt: 1 });
    res.json({ success: true, data: doctors });
  } catch (error) {
    next(error);
  }
};

const createDoctor = async (req, res, next) => {
  try {
    const problem = validSchedule(req.body.schedule);
    if (problem)
      return res.status(400).json({ success: false, message: problem });
    const user = await User.findOne({
      _id: req.body.userId,
      role: "DOCTOR",
      isActive: true,
    });
    if (!user)
      return res
        .status(400)
        .json({
          success: false,
          message: "Select an active user with the DOCTOR role",
        });
    if (await Doctor.exists({ userId: user._id }))
      return res
        .status(409)
        .json({ success: false, message: "This doctor already has a profile" });
    const doctor = await Doctor.create(req.body);
    await logAudit({
      user: req.user,
      action: "DOCTOR_PROFILE_CREATED",
      entity: "Doctor",
      entityId: doctor._id,
    });
    res
      .status(201)
      .json({
        success: true,
        data: await Doctor.findById(doctor._id).populate(
          "userId",
          "name email",
        ),
      });
  } catch (error) {
    next(error);
  }
};

const validSchedule = (schedule = []) => {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const days = new Set();
  for (const day of schedule) {
    if (days.has(day.dayOfWeek)) return `Duplicate schedule for ${day.dayOfWeek}`;
    days.add(day.dayOfWeek);
    for (const s of [...day.sessions, ...(day.breaks || [])])
      if (toMin(s.endTime) <= toMin(s.startTime))
        return `${day.dayOfWeek}: end time must be after start time`;
  }
  return null;
};

const updateDoctor = async (req, res, next) => {
  try {
    const problem = validSchedule(req.body.schedule);
    if (problem)
      return res.status(400).json({ success: false, message: problem });
    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true },
    ).populate("userId", "name email isActive");
    if (!doctor)
      return res
        .status(404)
        .json({ success: false, message: "Doctor not found" });
    await logAudit({
      user: req.user,
      action: "DOCTOR_PROFILE_UPDATED",
      entity: "Doctor",
      entityId: doctor._id,
    });
    res.json({ success: true, data: doctor });
  } catch (error) {
    next(error);
  }
};

const getMyProfile = async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id }).populate(
      "userId",
      "name email isActive",
    );
    if (!doctor)
      return res.status(404).json({
        success: false,
        message: "No doctor profile is linked to your account. Contact an administrator.",
      });
    res.json({ success: true, data: doctor });
  } catch (error) {
    next(error);
  }
};

// A doctor may change ONLY the schedule of their own profile.
const updateMyAvailability = async (req, res, next) => {
  try {
    const problem = validSchedule(req.body.schedule);
    if (problem)
      return res.status(400).json({ success: false, message: problem });
    const doctor = await Doctor.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { schedule: req.body.schedule } },
      { new: true, runValidators: true },
    ).populate("userId", "name email isActive");
    if (!doctor)
      return res.status(404).json({
        success: false,
        message: "No doctor profile is linked to your account. Contact an administrator.",
      });
    await logAudit({
      user: req.user,
      action: "DOCTOR_AVAILABILITY_UPDATED",
      entity: "Doctor",
      entityId: doctor._id,
    });
    res.json({ success: true, data: doctor });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDoctors,
  createDoctor,
  updateDoctor,
  getMyProfile,
  updateMyAvailability,
};
