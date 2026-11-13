import React, { useState, useContext, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { Activity, CalendarCheck, Eye, EyeOff, Lock, Mail, ShieldCheck, Stethoscope } from "lucide-react";
import { Alert, Spinner } from "../components/ui";

const FEATURES = [
  [CalendarCheck, "Smart scheduling", "Live doctor availability and conflict-free booking."],
  [Stethoscope, "Clinical workspace", "Patient records and notes, scoped to the treating doctor."],
  [ShieldCheck, "Role-based access", "Super Admin, Receptionist and Doctor each see only what they need."],
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  // Determine redirect route after login (default to dashboard)
  const from = location.state?.from?.pathname || "/dashboard";

  // If already logged in, redirect away from login page
  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email || !password) {
      setErrorMessage("Please fill in both email and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message ||
          "Invalid email or password. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/5" />
        <div className="relative max-w-md">
          <span className="inline-flex rounded-xl bg-white/15 p-3">
            <Activity className="h-8 w-8" />
          </span>
          <h2 className="mt-6 text-4xl font-bold tracking-tight">MediVault EMR</h2>
          <p className="mt-3 text-lg text-brand-100">
            One secure place for appointments, patients and clinical care.
          </p>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(([Icon, title, text]) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 h-fit rounded-lg bg-white/15 p-2">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-brand-100">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Form */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm lg:hidden">
              <Activity className="h-7 w-7" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Welcome back</h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to access appointment management and the clinical portal.
            </p>
          </div>

          {errorMessage && <Alert type="error" className="mb-5">{errorMessage}</Alert>}

          <form className="card card-body space-y-5 sm:p-6" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="login-email" className="label">Email address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="you@hospital.com"
                />
              </div>
            </div>
            <div>
              <label htmlFor="login-password" className="label">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10 pr-11"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1.5 rounded p-1 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary w-full py-2.5">
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4" /> Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500 lg:text-left">
            Need an account? Ask a Super Admin to create one for you.
          </p>
        </div>
      </div>
    </div>
  );
}
