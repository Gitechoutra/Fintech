import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AppLock } from "./components/AppLock";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import { LogoMark } from "./components/Logo";
import { ToastProvider } from "./components/ui";

function Shell() {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-page" role="status" aria-label="Loading">
        <LogoMark className="w-12 h-12 animate-pulse" />
      </div>
    );
  }
  return (
    <>
      {/* Routes stay mounted under the lock so the user returns exactly where they were. */}
      <div aria-hidden={status === "locked"} className={status === "locked" ? "invisible" : ""}>
        <RouterProvider router={router} />
      </div>
      {status === "locked" && <AppLock />}
    </>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <Shell />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
