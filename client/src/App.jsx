import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/common/ProtectedRoute";
import Navbar from "./components/layout/Navbar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AppointmentScheduler from "./pages/AppointmentScheduler";
import Patients from "./pages/Patients";
import UserManagement from "./pages/UserManagement";
import MyAvailability from "./pages/MyAvailability";

// The login page is full-bleed; every other page sits in a centered container
function Main({ children }) {
  const { pathname } = useLocation();
  return (
    <main
      className={
        pathname === "/login"
          ? "flex-1"
          : "mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
      }
    >
      {children}
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
          <Navbar />
          <Main>
            <Routes>
              {/* Public Route */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Navigate to="/login" replace />} />

              {/* Protected Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/scheduler"
                element={
                  <ProtectedRoute
                    allowedRoles={["SUPER_ADMIN", "RECEPTIONIST"]}
                  >
                    <AppointmentScheduler />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/patients"
                element={
                  <ProtectedRoute>
                    <Patients />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/availability"
                element={
                  <ProtectedRoute allowedRoles={["DOCTOR"]}>
                    <MyAvailability />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                    <UserManagement />
                  </ProtectedRoute>
                }
              />

              {/* Default Redirect */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Main>
        </div>
      </Router>
    </AuthProvider>
  );
}
