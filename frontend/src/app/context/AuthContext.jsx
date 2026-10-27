/**
 * context/AuthContext.jsx
 * =======================
 * Session state machine + the authenticated `api()` helper every screen uses.
 *
 *   loading → signed_out | locked | ready
 *   signed_out → (OTP verified) → ready            (new user, or no MPIN yet)
 *              → (OTP verified, has MPIN) → locked
 *   locked → (MPIN / biometric) → ready
 *   ready → (idle / app hidden / server APP_LOCKED) → locked
 *
 * Onboarding progress is NOT client state: it comes from the server (user.onboarding)
 * and is re-read with refreshUser() after each step.
 *
 * The access token lives ONLY in memory (never localStorage). The long-lived
 * refresh token is an httpOnly cookie the JS cannot read.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getAssertion } from "../utils/webauthn";

export const API_BASE = "/v1";
const CSRF = { "X-Requested-With": "lendease" };
const IDLE_LOCK_MS = 15 * 60 * 1000;          // mirrors SESSION_IDLE_LOCK_MINUTES
const HIDDEN_LOCK_MS = 2 * 60 * 1000;         // lock when the app is backgrounded this long
const REFRESH_EVERY_MS = 12 * 60 * 1000;      // under the 15-min access-token lifetime

const NETWORK_ERROR = { ok: false, status: 0, data: {}, message: "Network error. Check your connection and try again.", errors: {} };

const AuthContext = createContext(null);

async function parse(res) {
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return {
    ok: res.ok && body?.bool !== false,
    status: res.status,
    data: body?.response ?? {},
    message: body?.response?.message || (res.ok ? "" : "Something went wrong. Please try again."),
    code: body?.response?.code,
    errors: body?.response?.errors || {},
  };
}

/** Calls that authenticate with the refresh cookie (no access token). */
export async function publicPost(path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...CSRF }, body: JSON.stringify(body || {}),
    });
    return parse(res);
  } catch {
    return NETWORK_ERROR;
  }
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [lockInfo, setLockInfo] = useState(null);
  const [notice, setNotice] = useState("");          // e.g. "signed out after wrong MPINs"
  const tokenRef = useRef(null);
  const refreshPromise = useRef(null);
  const lastActivity = useRef(Date.now());
  const hiddenAt = useRef(null);

  const setSession = useCallback((data) => {
    tokenRef.current = data.access_token;
    setUser(data.user);
    setLockInfo(null);
    lastActivity.current = Date.now();
    setStatus("ready");
  }, []);

  const toSignedOut = useCallback((message = "") => {
    tokenRef.current = null;
    setUser(null);
    setLockInfo(null);
    setNotice(message);
    setStatus("signed_out");
  }, []);

  const lock = useCallback(async () => {
    tokenRef.current = null;
    const r = await fetch(`${API_BASE}/authentication/session`, { headers: CSRF }).then(parse).catch(() => null);
    if (r?.data?.has_session && r.data.user?.has_mpin) {
      setLockInfo(r.data.user);
      setStatus("locked");
    } else {
      toSignedOut("Your session ended. Please sign in again.");
    }
  }, [toSignedOut]);

  // ── Boot: is there a session on this device? → lock screen, else sign-in ──
  useEffect(() => {
    (async () => {
      const r = await fetch(`${API_BASE}/authentication/session`, { headers: CSRF }).then(parse).catch(() => null);
      if (!r?.data?.has_session) return toSignedOut();
      if (!r.data.user?.has_mpin) {
        // Signed in but no MPIN yet (mid-onboarding): a refresh lets them resume where they left off.
        const ref = await publicPost("/authentication/refresh");
        return ref.ok ? setSession(ref.data) : toSignedOut();
      }
      setLockInfo(r.data.user);
      setStatus("locked");
    })();
  }, [setSession, toSignedOut]);

  // ── Single-flight silent refresh ──
  const refresh = useCallback(async () => {
    if (!refreshPromise.current) {
      refreshPromise.current = publicPost("/authentication/refresh").then((r) => {
        refreshPromise.current = null;
        if (r.ok) { tokenRef.current = r.data.access_token; setUser(r.data.user); return true; }
        if (r.code === "APP_LOCKED") lock();
        else if (r.status === 401) toSignedOut("Your session ended. Please sign in again.");
        return false;
      });
    }
    return refreshPromise.current;
  }, [lock, toSignedOut]);

  // ── Authenticated API call with one transparent retry after refresh ──
  const api = useCallback(async (path, { method = "GET", body, signal } = {}, retried = false) => {
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method, signal, credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      return NETWORK_ERROR;
    }
    const r = await parse(res);
    if (res.status === 401 && !retried) {
      if (["TOKEN_EXPIRED", "AUTH_REQUIRED", "TOKEN_INVALID"].includes(r.code) && (await refresh())) {
        return api(path, { method, body, signal }, true);
      }
      if (r.code === "APP_LOCKED") lock();
      else if (r.code === "SESSION_ENDED") toSignedOut(r.message);
    }
    return r;
  }, [refresh, lock, toSignedOut]);

  /** Re-read the profile + server-side onboarding state. */
  const refreshUser = useCallback(async () => {
    const r = await api("/authentication/me");
    if (r.ok) setUser(r.data);
    return r;
  }, [api]);

  // ── Activity tracking, idle lock, background lock, proactive refresh ──
  useEffect(() => {
    if (status !== "ready") return;
    const canLock = !!user?.has_mpin;
    const bump = () => { lastActivity.current = Date.now(); };
    const onVis = () => {
      if (document.hidden) { hiddenAt.current = Date.now(); return; }
      if (canLock && hiddenAt.current && Date.now() - hiddenAt.current > HIDDEN_LOCK_MS) lock();
      hiddenAt.current = null;
    };
    const evts = ["pointerdown", "keydown", "scroll", "touchstart"];
    evts.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener("visibilitychange", onVis);
    const tick = setInterval(() => {
      if (canLock && Date.now() - lastActivity.current > IDLE_LOCK_MS) lock();
    }, 30 * 1000);
    const ref = setInterval(() => {
      if (Date.now() - lastActivity.current < IDLE_LOCK_MS) refresh();
    }, REFRESH_EVERY_MS);
    return () => {
      evts.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(tick); clearInterval(ref);
    };
  }, [status, user?.has_mpin, lock, refresh]);

  // ── Unlock ──
  const unlockWithMpin = useCallback(async (mpin) => {
    const r = await publicPost("/authentication/unlock", { mpin });
    if (r.ok) setSession(r.data);
    else if (r.code === "SESSION_ENDED" || r.code === "NO_SESSION") toSignedOut(r.message);
    return r;
  }, [setSession, toSignedOut]);

  const unlockWithBiometric = useCallback(async () => {
    const opt = await publicPost("/authentication/webauthn/options");
    if (!opt.ok) return opt;
    let credential;
    try { credential = await getAssertion(opt.data.options); }
    catch { return { ok: false, message: "Biometric check was cancelled. Use your MPIN instead." }; }
    const r = await publicPost("/authentication/webauthn/verify", { credential });
    if (r.ok) setSession(r.data);
    return r;
  }, [setSession]);

  /** OTP verified for an account that has an MPIN: the server session stays locked until unlock. */
  const requireUnlock = useCallback((info) => {
    tokenRef.current = null;
    setLockInfo(info);
    setStatus("locked");
  }, []);

  const logout = useCallback(async () => {
    await publicPost("/authentication/logout");
    toSignedOut();
  }, [toSignedOut]);

  const value = useMemo(() => ({
    status, user, lockInfo, notice, api, setSession, refreshUser, lock, logout,
    unlockWithMpin, unlockWithBiometric, requireUnlock, clearNotice: () => setNotice(""),
  }), [status, user, lockInfo, notice, api, setSession, refreshUser, lock, logout, unlockWithMpin, unlockWithBiometric, requireUnlock]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
