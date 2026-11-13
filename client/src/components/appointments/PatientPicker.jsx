import React, { useEffect, useRef, useState } from 'react';
import { Search, UserCheck, X } from 'lucide-react';
import api from '../../services/api';

/**
 * Search-and-select for an existing patient (uses GET /patients?search=).
 * Searches name, patient ID, mobile and email as the user types.
 *
 * Props: selected (patient object | null), onSelect(patient | null)
 */
export default function PatientPicker({ selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false); // a search for the current query has finished
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0); // bump to retry the same query
  const inputRef = useRef(null);

  // Focus the search box as soon as it is shown / after a selection is cleared
  useEffect(() => {
    if (!selected) inputRef.current?.focus();
  }, [selected]);

  useEffect(() => {
    const q = query.trim();
    if (selected || !q) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      setError('');
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setSearched(false);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/patients', { params: { search: q, limit: 10 } });
        if (cancelled) return;
        const seen = new Set();
        setResults((res.data.data || []).filter((p) => !seen.has(p._id) && seen.add(p._id)));
        setSearched(true);
      } catch (err) {
        if (cancelled) return;
        setResults([]);
        setError(err.response?.data?.message || 'Could not search patients. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected, attempt]);

  if (selected) {
    return (
      <div
        className="rounded-xl border-2 border-brand-500 bg-brand-50 p-3 sm:p-4"
        data-testid="selected-patient"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <UserCheck className="mt-0.5 h-5 w-5 text-blue-600" />
            <div className="text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Selected patient</p>
              <p className="font-semibold text-gray-900">{selected.name}</p>
              <p className="text-gray-600">
                {selected.patientId} · {selected.mobile}
                {selected.email ? ` · ${selected.email}` : ''}
              </p>
              <p className="text-gray-500">
                {selected.age} yrs · {selected.gender}
              </p>
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => onSelect(null)}>
              Change
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-red-600"
              onClick={() => {
                setQuery('');
                onSelect(null);
              }}
            >
              <X className="h-4 w-4" /> Clear
            </button>
          </div>
        </div>
      </div>
    );
  }

  const trimmed = query.trim();
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          aria-label="Search existing patient"
          placeholder="Search by name, patient ID, mobile or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input pl-9"
        />
      </div>

      {loading && (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" /> Searching…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded bg-red-50 p-2 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" className="font-semibold underline" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      {!loading && !error && searched && results.length === 0 && (
        <p className="mt-2 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          No patients match “{trimmed}”. Check the spelling, or choose <strong>New Patient</strong> to register them.
        </p>
      )}
      {results.length > 0 && (
        <ul className="card mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto" aria-label="Matching patients">
          {results.map((p) => (
            <li key={p._id}>
              <button
                type="button"
                onClick={() => onSelect(p)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
              >
                <span className="font-semibold text-gray-900">{p.name}</span>
                <span className="block text-gray-600 sm:inline sm:before:content-['_·_']">
                  {p.patientId} · {p.mobile}
                </span>
                <span className="block text-xs text-gray-500">
                  {p.age} yrs · {p.gender}
                  {p.email ? ` · ${p.email}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
