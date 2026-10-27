import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle, CameraOff, CheckCircle2, Copy, ExternalLink, ImageUp, Info, Link2, ScanLine, ShieldCheck, Smartphone, Zap, ZapOff,
} from "lucide-react";
import jsQR from "jsqr";
import { useAuth } from "../../context/AuthContext";
import { fmtDateTime, fmtINR } from "../../utils/format";
import { buildUpiLink, classifyQr, isValidUpiAmount } from "../../utils/upi";
import { Badge, Banner, Button, Card, Field, inputCls, useToast } from "../../components/ui";
import { PageHeader } from "./AppShell";

/**
 * Scanner: reads a UPI QR (camera or image), shows who is being paid, and hands the
 * payment to a UPI app on the device. LendEase does not move UPI money itself — that
 * needs NPCI approval as a UPI app — so it records the hand-off, never a result.
 */
export function ScannerPage() {
  const toast = useToast();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const [camState, setCamState] = useState("idle");   // idle | starting | scanning | denied | unavailable | insecure
  const [result, setResult] = useState(null);
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [historyVersion, setHistoryVersion] = useState(0);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const onDecoded = useCallback((text) => {
    stop();
    if (navigator.vibrate) navigator.vibrate(40);
    setResult(classifyQr(text));
    setCamState("idle");
  }, [stop]);

  const tick = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !streamRef.current) return;
    if (v.readyState >= 2) {
      try {
        if (detectorRef.current) {
          const codes = await detectorRef.current.detect(v);
          if (codes[0]?.rawValue) return onDecoded(codes[0].rawValue);
        } else {
          const c = canvasRef.current;
          const w = Math.min(v.videoWidth, 720), h = Math.round((v.videoHeight / v.videoWidth) * w);
          c.width = w; c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(v, 0, 0, w, h);
          const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
          if (code?.data) return onDecoded(code.data);
        }
      } catch { /* keep scanning */ }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onDecoded]);

  const start = useCallback(async () => {
    setResult(null);
    if (!window.isSecureContext) { setCamState("insecure"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setCamState("unavailable"); return; }
    setCamState("starting");
    for (let i = 0; i < 30 && !videoRef.current; i++) await new Promise((r) => setTimeout(r, 50));
    if (!videoRef.current) { setCamState("idle"); return; }
    try {
      if ("BarcodeDetector" in window) {
        const formats = await window.BarcodeDetector.getSupportedFormats?.();
        if (!formats || formats.includes("qr_code")) detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setTorch({ supported: !!track.getCapabilities?.().torch, on: false });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCamState("scanning");
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      stop();
      setCamState(e?.name === "NotAllowedError" ? "denied" : "unavailable");
    }
  }, [tick, stop]);

  useEffect(() => stop, [stop]);
  useEffect(() => {
    const onHide = () => { if (document.hidden) { stop(); setCamState("idle"); } };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stop]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torch.on }] }); setTorch((t) => ({ ...t, on: !t.on })); }
    catch { toast("error", "Torch isn't available on this camera."); }
  };

  const fromImage = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) { toast("error", "Choose an image under 8 MB."); return; }
    stop();
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      const c = canvasRef.current; c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
      if (code?.data) onDecoded(code.data);
      else { toast("error", "No QR code found in that image."); setCamState("idle"); }
    } catch { toast("error", "Couldn't read that image."); }
  };

  return (
    <>
      <PageHeader title="Scanner" text="Scan a UPI QR code on a bill or at a shop to pay from your UPI app." />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <Card className="p-4 sm:p-6">
          <AnimatePresence mode="wait">
            {!result ? (
              <motion.div key="cam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="relative aspect-square w-full max-w-sm mx-auto rounded-3xl overflow-hidden bg-ink-950 ring-1 ring-line">
                  <video ref={videoRef} playsInline muted className={`w-full h-full object-cover ${camState === "scanning" ? "" : "opacity-0"}`} />
                  {camState === "scanning" && (
                    <>
                      <div className="absolute inset-[14%] pointer-events-none">
                        <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: "0 0 0 9999px rgba(10,15,13,0.5)" }} />
                        {["top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl", "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                          "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"]
                          .map((c) => <span key={c} className={`absolute w-10 h-10 border-mint-500 ${c}`} />)}
                        <motion.div className="absolute left-3 right-3 h-0.5 bg-gradient-to-r from-transparent via-mint-400 to-transparent shadow-[0_0_12px_rgba(0,245,184,0.8)]"
                          initial={{ top: "6%" }} animate={{ top: ["6%", "94%", "6%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
                      </div>
                      {torch.supported && (
                        <button type="button" onClick={toggleTorch} aria-label={torch.on ? "Turn torch off" : "Turn torch on"}
                          className="absolute bottom-4 right-4 w-11 h-11 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white">
                          {torch.on ? <ZapOff className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                        </button>
                      )}
                      <button type="button" onClick={() => { stop(); setCamState("idle"); }}
                        className="absolute bottom-4 left-4 h-11 px-4 rounded-full bg-black/60 border border-white/20 text-white text-sm font-semibold">Stop</button>
                    </>
                  )}
                  {camState !== "scanning" && <CameraMessage state={camState} onStart={start} />}
                </div>
                <p className="text-center text-xs text-muted">Point the camera at a UPI QR code — it scans automatically.</p>
                <label className="flex items-center justify-center gap-2 w-full max-w-sm mx-auto h-12 px-4 rounded-[var(--radius-control)] border border-line-strong bg-surface text-sm font-semibold text-fg hover:bg-surface-2 cursor-pointer">
                  <ImageUp className="w-4 h-4" aria-hidden /> Upload QR image
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => { fromImage(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </motion.div>
            ) : (
              <motion.div key="res" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ScanResult result={result} onScanAgain={() => { setResult(null); start(); }}
                  onHandedOff={() => setHistoryVersion((v) => v + 1)} />
              </motion.div>
            )}
          </AnimatePresence>
          <canvas ref={canvasRef} className="hidden" />
        </Card>

        <div className="space-y-4">
          <RecentPayees version={historyVersion} />
          <div className="flex items-start gap-2 text-xs text-muted leading-relaxed">
            <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
            <span>LendEase reads the QR and opens your UPI app (Google Pay, PhonePe, BHIM…) to complete the payment. UPI
              payments inside LendEase would need NPCI approval as a UPI app and aren't enabled. To pay your loan EMI, use
              Pay now on Home.</span>
          </div>
        </div>
      </div>
    </>
  );
}

function CameraMessage({ state, onStart }) {
  const msg = {
    idle: ["Ready to scan", "Start the camera, or upload a photo of the QR code."],
    starting: ["Starting camera…", "Allow camera access when your browser asks."],
    denied: ["Camera permission denied", "Allow camera access in your browser's site settings, or upload a QR image."],
    unavailable: ["No camera available", "This device or browser can't open a camera. Upload a QR image instead."],
    insecure: ["Camera needs HTTPS", "Open the app over https:// (or localhost) to use the camera."],
  }[state] || ["", ""];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-white">
      {state === "starting" ? <ScanLine className="w-9 h-9 text-mint-400 animate-pulse" aria-hidden />
        : state === "idle" ? <ScanLine className="w-9 h-9 text-mint-400" aria-hidden /> : <CameraOff className="w-9 h-9 text-neutral-400" aria-hidden />}
      <p className="text-sm font-semibold mt-3">{msg[0]}</p>
      <p className="text-xs text-neutral-400 mt-1 max-w-[16rem]">{msg[1]}</p>
      {state !== "starting" && state !== "insecure" && <Button size="sm" className="mt-4" onClick={onStart}>Start camera</Button>}
    </div>
  );
}

function ScanResult({ result, onScanAgain, onHandedOff }) {
  const toast = useToast();
  const { api } = useAuth();
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (result.kind === "upi") {
    const p = result.payee;
    const pay = async () => {
      if (!p.amount && !isValidUpiAmount(amount)) { setErr("Enter a valid amount (up to 2 decimals)."); return; }
      const link = buildUpiLink(result, p.amount ? null : amount);
      if (!link) { setErr("Couldn't prepare this payment."); return; }
      // Record the hand-off for history (best effort; never blocks paying).
      await api("/scan/payments", { method: "POST", body: { payee_vpa: p.vpa, payee_name: p.name, merchant_code: p.merchantCode,
        amount: p.amount || amount || null, note: p.note } }).catch(() => {});
      onHandedOff();
      window.location.href = link;      // the OS offers the installed UPI apps
    };
    const initials = (p.name || p.vpa).split(/[\s@.]/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
    return (
      <div className="space-y-4 max-w-md mx-auto">
        <div className="rounded-3xl border border-line bg-surface-2 p-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-mint-600 text-on-primary flex items-center justify-center text-lg font-bold">{initials}</div>
          <p className="text-xs text-muted mt-4">Paying</p>
          <p className="text-lg font-bold text-fg break-words">{p.name || "Unnamed payee"}</p>
          <p className="text-sm text-muted font-mono break-all">{p.vpa}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            {p.merchantCode && <Badge tone="success">Merchant</Badge>}
            {!p.name && <Badge tone="warning">No name in QR</Badge>}
          </div>
          {p.amount ? (
            <p className="text-3xl font-extrabold text-fg mt-5 tabular">{fmtINR(p.amount)}</p>
          ) : (
            <div className="mt-5 text-left">
              <Field label="Amount (₹)" error={err}>
                {(fp) => <input {...fp} className={`${inputCls(err)} text-2xl font-bold text-center tabular`} inputMode="decimal" autoFocus placeholder="0"
                  value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, "")); setErr(""); }} />}
              </Field>
            </div>
          )}
          {p.note && <p className="text-xs text-muted mt-3">Note: {p.note}</p>}
        </div>
        <Banner tone="warn" icon={ShieldCheck}>Check the payee name and UPI ID before paying. Your UPI app asks for your UPI PIN — never share it, and never scan a QR to <i>receive</i> money.</Banner>
        {isMobile ? (
          <Button className="w-full" size="lg" onClick={pay}><Smartphone className="w-4 h-4" aria-hidden /> Pay with UPI app</Button>
        ) : (
          <div className="space-y-2">
            <Banner icon={Smartphone}>UPI apps open on your phone. Scan this code with your phone's UPI app, or copy the UPI ID.</Banner>
            <Button variant="secondary" className="w-full" onClick={() => navigator.clipboard?.writeText(p.vpa).then(() => toast("success", "UPI ID copied."))}>
              <Copy className="w-4 h-4" aria-hidden /> Copy UPI ID
            </Button>
          </div>
        )}
        <Button variant="ghost" className="w-full" onClick={onScanAgain}><ScanLine className="w-4 h-4" aria-hidden /> Scan another code</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div className="rounded-3xl border border-line bg-surface-2 p-6">
        {result.kind === "invalid-upi" ? (
          <div className="text-center">
            <AlertTriangle className="w-10 h-10 text-warning mx-auto" aria-hidden />
            <p className="font-bold text-fg mt-3">Not a valid UPI payment code</p>
            <p className="text-sm text-muted mt-1">{result.reason} Don't pay using this code.</p>
          </div>
        ) : result.kind === "url" ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-bold text-fg"><Link2 className="w-4 h-4 text-accent" aria-hidden /> This QR contains a link</p>
            <p className="text-sm text-fg break-all font-mono bg-surface rounded-xl p-3 border border-line">{result.url}</p>
            <Banner tone="warn" icon={AlertTriangle}>Only open links you trust. LendEase never asks for your MPIN, OTP or card details on other sites.</Banner>
            <a href={result.url} target="_blank" rel="noopener noreferrer nofollow"
              className="flex items-center justify-center gap-2 w-full h-12 rounded-[var(--radius-control)] border border-line-strong bg-surface text-sm font-semibold text-fg hover:bg-surface-2">
              Open {result.host} <ExternalLink className="w-3.5 h-3.5" aria-hidden />
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-bold text-fg"><CheckCircle2 className="w-4 h-4 text-accent" aria-hidden /> QR scanned</p>
            <p className="text-sm text-fg break-words whitespace-pre-wrap bg-surface rounded-xl p-3 border border-line">{result.text || "(empty)"}</p>
            <p className="text-xs text-muted">This isn't a UPI payment code.</p>
            <Button variant="secondary" size="sm" onClick={() => navigator.clipboard?.writeText(result.text).then(() => toast("success", "Copied."))}>
              <Copy className="w-3.5 h-3.5" aria-hidden /> Copy text
            </Button>
          </div>
        )}
      </div>
      <Button className="w-full" onClick={onScanAgain}><ScanLine className="w-4 h-4" aria-hidden /> Scan again</Button>
    </div>
  );
}

function RecentPayees({ version }) {
  const { api } = useAuth();
  const [rows, setRows] = useState(null);
  useEffect(() => { api("/scan/payments?limit=6").then((r) => setRows(r.ok ? r.data.payments : [])); }, [api, version]);
  return (
    <Card className="p-5">
      <h2 className="font-bold text-fg">Recent payees</h2>
      {rows === null ? <p className="text-sm text-muted mt-2">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-muted mt-2">Payees you scan will appear here.</p>
      ) : (
        <ul className="divide-y divide-line mt-2">
          {rows.map((r) => (
            <li key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold text-fg truncate">{r.payee_name || r.payee_vpa}</span>
                <span className="block text-xs text-muted font-mono truncate">{r.payee_vpa}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-fg tabular">{r.amount ? fmtINR(r.amount) : "—"}</span>
                <span className="block text-[11px] text-subtle">{fmtDateTime(r.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
