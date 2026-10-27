import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Monitor, Moon, ShieldCheck, ShieldAlert, Sun, KeyRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Logo } from "../../components/Logo";

export function DashboardHeader({ onOpenSecurity }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const initials = (user.full_name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const strong = user.has_mpin && user.biometric_enabled;

  return (
    <header className="sticky top-0 z-40 bg-page/85 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <button type="button" onClick={onOpenSecurity}
            className={`hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-semibold transition-colors
              ${strong ? "border-mint-600/30 bg-accent-soft text-accent" : "border-warning/40 bg-warning-soft text-warning-fg"}`}>
            {strong ? <ShieldCheck className="w-4 h-4" aria-hidden /> : <ShieldAlert className="w-4 h-4" aria-hidden />}
            {strong ? "MPIN + biometrics" : "MPIN only"}
          </button>
          <div className="relative" ref={ref}>
            <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
              className="flex items-center gap-2 h-10 pl-1 pr-2 rounded-full border border-line bg-surface hover:border-line-strong">
              <span className="w-8 h-8 rounded-full bg-mint-600 text-on-primary text-xs font-bold flex items-center justify-center">{initials}</span>
              <ChevronDown className="w-4 h-4 text-muted" aria-hidden />
              <span className="sr-only">Account menu</span>
            </button>
            {open && (
              <div role="menu" className="absolute right-0 mt-2 w-72 rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)] p-2">
                <div className="px-3 py-2.5">
                  <p className="font-semibold text-fg truncate">{user.full_name}</p>
                  <p className="text-sm text-muted tabular">{user.mobile_number}</p>
                  {user.email && <p className="text-sm text-muted truncate">{user.email}</p>}
                </div>
                <div className="h-px bg-line my-1" />
                <MenuItem icon={KeyRound} onClick={() => { setOpen(false); onOpenSecurity(); }}>Security settings</MenuItem>
                <div className="px-3 pt-2.5 pb-1 text-xs font-semibold text-muted">Theme</div>
                <div className="grid grid-cols-3 gap-1 px-2 pb-2" role="group" aria-label="Theme">
                  {[["system", Monitor, "System"], ["light", Sun, "Light"], ["dark", Moon, "Dark"]].map(([k, Icon, l]) => (
                    <button key={k} type="button" onClick={() => setTheme(k)} aria-pressed={theme === k}
                      className={`flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-medium border transition-colors
                        ${theme === k ? "border-mint-600 bg-accent-soft text-accent" : "border-transparent text-muted hover:bg-surface-2"}`}>
                      <Icon className="w-4 h-4" aria-hidden />{l}
                    </button>
                  ))}
                </div>
                <div className="h-px bg-line my-1" />
                <MenuItem icon={LogOut} onClick={logout} danger>Sign out</MenuItem>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger }) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-sm font-medium hover:bg-surface-2 ${danger ? "text-danger-fg" : "text-fg"}`}>
      <Icon className="w-4 h-4" aria-hidden />{children}
    </button>
  );
}
