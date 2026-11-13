const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');

const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Today's date (server local time) as YYYY-MM-DD
const todayStr = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * Slots for a doctor on a date, plus a human-readable reason when the day has
 * no (or no free) slots. Slots overlapping a break are excluded, booked slots
 * are returned with isAvailable=false.
 */
const getAvailability = async (doctorId, dateStr) => {
  const doctor = await Doctor.findById(doctorId).populate('userId', 'name isActive');
  if (!doctor) {
    const error = new Error('Doctor not found');
    error.statusCode = 404;
    throw error;
  }
  const doctorName = doctor.userId?.name ? `Dr. ${doctor.userId.name}` : 'This doctor';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(new Date(dateStr).getTime()))
    return { slots: [], reason: 'Invalid date' };
  if (doctor.userId && doctor.userId.isActive === false)
    return { slots: [], reason: `${doctorName} is currently unavailable (account inactive)` };
  if (dateStr < todayStr())
    return { slots: [], reason: 'Appointments cannot be booked for a past date' };

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[new Date(dateStr).getUTCDay()];
  const daySchedule = doctor.schedule.find((s) => s.dayOfWeek === dayName);
  if (!daySchedule)
    return { slots: [], reason: `${doctorName} does not work on ${dayName}s` };

  const existingAppointments = await Appointment.find({
    doctorId,
    appointmentDate: dateStr,
    status: { $ne: 'Cancelled' },
  });
  const bookedSlotsSet = new Set(existingAppointments.map((app) => app.slotStartTime));

  const slots = [];
  const duration = daySchedule.slotDurationMinutes;
  for (const session of daySchedule.sessions) {
    let current = timeToMinutes(session.startTime);
    const sessionEnd = timeToMinutes(session.endTime);
    while (current + duration <= sessionEnd) {
      // exclude any slot that overlaps a break
      const overlapsBreak = daySchedule.breaks.some((b) => {
        const breakStart = timeToMinutes(b.startTime);
        const breakEnd = timeToMinutes(b.endTime);
        return current < breakEnd && current + duration > breakStart;
      });
      if (!overlapsBreak) {
        const slotStartStr = minutesToTime(current);
        slots.push({
          startTime: slotStartStr,
          endTime: minutesToTime(current + duration),
          isAvailable: !bookedSlotsSet.has(slotStartStr),
        });
      }
      current += duration;
    }
  }

  let reason = null;
  if (!slots.length) reason = `${doctorName} has no bookable slots on ${dayName}s`;
  else if (!slots.some((s) => s.isAvailable)) reason = 'All slots are booked for this date';
  return { slots, reason };
};

const getAvailableSlots = async (doctorId, dateStr) =>
  (await getAvailability(doctorId, dateStr)).slots;

module.exports = { getAvailableSlots, getAvailability, todayStr };
