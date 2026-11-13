import React, { useContext, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import {
  Activity,
  CalendarPlus,
  ChevronDown,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { Avatar, RoleBadge } from "../ui";

const ALL = ["SUPER_ADMIN", "RECEPTIONIST", "DOCTOR"];
const LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
  { to: "/patients", label: "Patients", icon: Users, roles: ALL },
  { to: "/scheduler", label: "Book Appointment", icon: CalendarPlus, roles: ["SUPER_ADMIN", "RECEPTIONIST"] },
  { to: "/availability", label: "My Availability", icon: Clock, roles: ["DOCTOR"] },
  { to: "/users", label: "Manage users", icon: UserCog, roles: ["SUPER_ADMIN"] },
];

const linkClass = ({ isActive }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-brand-50 text-brand-700"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

export default function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menus whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  // Close the profile menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => !menuRef.current?.contains(e.target) && setMenuOpen(false);
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    setMobileOpen(false);
    await logout();
    navigate("/login");
  };

  const links = user ? LINKS.filter((l) => l.roles.includes(user.role)) : [];

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur" aria-label="Main">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link to={user ? "/dashboard" : "/login"} className="flex shrink-0 items-center gap-2.5">
          <span className="rounded-lg bg-brand-600 p-2 text-white shadow-sm">
            <Activity className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Medi<span className="text-brand-600">Vault</span>
            <span className="ml-1.5 hidden text-xs font-semibold uppercase tracking-wider text-slate-400 sm:inline">EMR</span>
          </span>
        </Link>

        {/* Desktop links */}
        {user && (
          <div className="hidden flex-1 items-center gap-1 md:flex lg:ml-6">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        )}

        {/* Desktop profile menu */}
        {user ? (
          <div className="hidden md:block" ref={menuRef}>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2.5 rounded-lg border border-transparent py-1 pl-1 pr-2 hover:border-slate-200 hover:bg-slate-50"
              >
                <Avatar name={user.name} />
                <span className="hidden text-left lg:block">
                  <span className="block max-w-[10rem] truncate text-sm font-semibold leading-tight text-slate-900">{user.name}</span>
                  <span className="block text-xs leading-tight text-slate-500">{user.role.replace("_", " ")}</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-pop">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                    <div className="mt-2">
                      <RoleBadge role={user.role} />
                    </div>
                  </div>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          location.pathname !== "/login" && (
            <Link to="/login" className="btn btn-secondary btn-sm">
              Sign In
            </Link>
          )
        )}

        {/* Mobile menu button */}
        {user && (
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        )}
      </div>

      {/* Mobile panel */}
      {user && mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-3 shadow-pop md:hidden">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <Avatar name={user.name} size="h-10 w-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
              <RoleBadge role={user.role} />
            </div>
          </div>
          <div className="space-y-1">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `${linkClass({ isActive })} py-2.5 text-base`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
          <button onClick={handleLogout} className="btn btn-danger-soft mt-3 w-full">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      )}
    </nav>
  );
}
