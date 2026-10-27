import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, ChevronDown, History, Home, LogOut, Monitor, Moon, ScanLine, Search, Settings, ShieldAlert,
  ShieldCheck, Sun, UserRound,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Logo } from "../../components/Logo";
import { PaymentFlow } from "../../components/PaymentFlow";
import { ModalShell, useToast } from "../../components/ui";
import { AppCtx } from "./AppContext";

/** Main navigation: a floating bottom bar. `match` lists the routes that keep a tab
 *  highlighted — Home covers the Money transfer pages it opens. */
export const NAV = [
  { to: "/dashboard", label: "Home", icon: Home,
    match: ["/dashboard", "/dashboard/bills", "/dashboard/cards", "/dashboard/emis", "/dashboard/loans"] },
  { to: "/dashboard/search", label: "Search", icon: Search, match: ["/dashboard/search"] },
  { to: "/dashboard/scanner", label: "Scanner", icon: ScanLine, match: ["/dashboard/scanner"] },
  { to: "/dashboard/history", label: "History", icon: History, match: ["/dashboard/history"] },
  { to: "/dashboard/settings", label: "Settings", icon: Settings, match: ["/dashboard/settings"] },
];

const isActiveTab = (tab, pathname) => {
  const path = pathname.replace(/\/+$/, "") || "/";
  return tab.match.some((m) => (m === "/dashboard" ? path === m : path === m || path.startsWith(`${m}/`)));
};

/**
 * Signed-in app frame: a fixed top bar (brand, security status, account menu) and a
 * fixed floating bottom bar with the main sections. Neither moves while scrolling.
 */
export function AppShell() {
  const { status, user, api } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [payCfg, setPayCfg] = useState(null);
  const [lendersAvailable, setLendersAvailable] = useState(false);
  const [paying, setPaying] = useState(null);
  const [version, setVersion] = useState(0);

  const ready = status === "ready" && user?.onboarding?.complete;
  useEffect(() => {
    if (!ready) return;
    api("/payments/config").then((r) => setPayCfg(r.ok ? r.data : { configured: false, message: r.message }));
    api("/loans/providers").then((r) => setLendersAvailable(r.ok && r.data.configured));
  }, [ready, api]);

  // Each section starts at the top.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [location.pathname]);

  const onPaymentFinished = useCallback((txn) => {
    if (txn.status === "SUCCESS") toast("success", "Payment confirmed. Your dashboard is updated.");
    else if (txn.status === "FAILED") toast("error", "The payment did not go through.");
    setVersion((v) => v + 1);
  }, [toast]);

  if (status === "signed_out") return <Navigate to="/welcome" replace />;
  if (!user) return null;                                   // locked: AppLock overlays this route
  if (!user.onboarding.complete) return <Navigate to={`/onboarding/${user.onboarding.next_step}`} replace />;

  return (
    <AppCtx.Provider value={{ payCfg, openPay: setPaying, version, lendersAvailable, reload: () => setVersion((v) => v + 1) }}>
      <div className="min-h-dvh bg-page">
        <TopBar />
        <main className="pt-16 pb-36">
          <AnimatePresence mode="wait" initial={false}>
            {/* Opacity only: a transform here would re-anchor fixed dialogs opened inside a page. */}
            <motion.div key={location.pathname}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-9">
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
        <BottomBar />
      </div>

      {paying && (
        <ModalShell title={paying.open_payment_id ? "Payment status" : "Pay now"}
          subtitle={`${paying.provider_name} · ${paying.masked_number}`}
          onClose={() => { setPaying(null); setVersion((v) => v + 1); }}>
          <PaymentFlow loan={paying} payment={payCfg || { configured: false }} onFinished={onPaymentFinished} />
        </ModalShell>
      )}
    </AppCtx.Provider>
  );
}

/* ── Fixed top bar: brand, security status, account menu ── */
function TopBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const strong = user.has_mpin && user.biometric_enabled;
  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 bg-surface/90 backdrop-blur-md border-b border-line">
      <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center gap-4">
        <Link to="/dashboard" aria-label="LendEase home" className="shrink-0 rounded-xl"><Logo size="sm" /></Link>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => navigate("/dashboard/settings#security")}
            className={`hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-semibold transition-colors
              ${strong ? "border-mint-600/30 bg-accent-soft text-accent" : "border-warning/40 bg-warning-soft text-warning-fg"}`}>
            {strong ? <ShieldCheck className="w-4 h-4" aria-hidden /> : <ShieldAlert className="w-4 h-4" aria-hidden />}
            {strong ? "MPIN + biometrics" : "MPIN only"}
          </button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

/* ── Fixed floating bottom bar (all screen sizes) ── */
function BottomBar() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" className="fixed z-50 bottom-0 inset-x-0 sm:bottom-5 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2
      pb-[env(safe-area-inset-bottom)] sm:pb-0">
      <ul className="grid grid-cols-5 items-end h-[68px] sm:w-[520px] px-1 sm:px-2 bg-surface/95 backdrop-blur-md
        border-t sm:border border-line sm:rounded-[26px] shadow-[0_-8px_24px_-16px_rgb(10_15_13/0.25)] sm:shadow-[var(--shadow-pop)]">
        {NAV.map((n) => {
          const active = isActiveTab(n, pathname);
          return (
            <li key={n.to} className="relative h-full flex justify-center">
              {/* Plain Link: NavLink would also mark Home current on every /dashboard/* page. */}
              <Link to={n.to} aria-current={active ? "page" : undefined}
                className={`group flex flex-col items-center justify-end gap-1 pb-2.5 h-full w-full text-[11px] font-semibold transition-colors
                  focus-visible:outline-none ${active ? "text-accent" : "text-muted hover:text-fg"}`}>
                <span className={`relative flex items-center justify-center w-12 h-8 rounded-2xl transition-colors
                    group-focus-visible:ring-2 group-focus-visible:ring-mint-500/50 ${active ? "text-accent" : ""}`}>
                    {active && (
                      <motion.span layoutId="tab-pill" aria-hidden className="absolute inset-0 rounded-2xl bg-accent-soft"
                        transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                    )}
                    <n.icon className="relative w-[20px] h-[20px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
                  </span>
                <span className="leading-none">{n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
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
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-1.5 h-10 pl-1 pr-2 rounded-full border border-line bg-surface hover:border-line-strong">
        <span className="w-8 h-8 rounded-full bg-mint-600 text-on-primary text-xs font-bold flex items-center justify-center">{initials}</span>
        <ChevronDown className="w-4 h-4 text-muted" aria-hidden />
        <span className="sr-only">Account menu</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.14 }}
            className="absolute right-0 mt-2 w-72 rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)] p-2 origin-top-right">
            <div className="px-3 py-2.5">
              <p className="font-semibold text-fg truncate">{user.full_name}</p>
              <p className="text-sm text-muted tabular">{user.mobile_number}</p>
              {user.email && <p className="text-sm text-muted truncate">{user.email}</p>}
            </div>
            <div className="h-px bg-line my-1" />
            <MenuItem icon={UserRound} onClick={() => { setOpen(false); navigate("/dashboard/settings"); }}>Settings</MenuItem>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

/** Section heading shared by every page. `back` adds a link to the parent section. */
export function PageHeader({ title, text, action, back }) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.to} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg mb-3 -ml-1 px-1 py-0.5 rounded-lg">
          <ArrowLeft className="w-4 h-4" aria-hidden />{back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-fg">{title}</h1>
          {text && <p className="text-sm text-muted mt-1">{text}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
