import React from 'react';
import { CalendarX } from 'lucide-react';

export default function SlotGrid({ slots, selectedSlot, onSelectSlot, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" role="status" aria-label="Loading time slots">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="skeleton h-10 rounded-lg" />
        ))}
        <span className="sr-only">Loading time slots…</span>
      </div>
    );
  }
  if (!slots || slots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        <CalendarX className="h-6 w-6 text-slate-400" aria-hidden="true" />
        No slots available or scheduled doctor off.
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {slots.map((slot) => {
          const isSelected = selectedSlot?.startTime === slot.startTime;
          const isDisabled = !slot.isAvailable;

          let cls =
            'rounded-lg border px-2 py-2 text-center text-sm font-medium tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ';
          if (isDisabled) {
            cls += 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through';
          } else if (isSelected) {
            cls += 'border-brand-600 bg-brand-600 text-white shadow-sm';
          } else {
            cls += 'border-slate-300 bg-white text-slate-700 hover:border-brand-500 hover:bg-brand-50';
          }

          return (
            <button
              key={slot.startTime}
              disabled={isDisabled}
              onClick={() => onSelectSlot(slot)}
              className={cls}
              type="button"
              aria-pressed={isSelected}
              title={isDisabled ? 'Already booked' : `${slot.startTime} – ${slot.endTime}`}
            >
              {slot.startTime}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-slate-300 bg-white" /> Available</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-brand-600 bg-brand-600" /> Selected</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-slate-200 bg-slate-100" /> Booked</span>
      </div>
    </div>
  );
}
