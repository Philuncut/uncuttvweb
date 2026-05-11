"use client";

import { useState, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Tab = "login" | "register";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full border border-[#333] bg-[#111] px-3 py-3 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
    />
  );
}

function PasswordInput({
  value,
  onChange,
  visible,
  onToggle,
  placeholder = "••••••••",
}: {
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggle: () => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full border border-[#333] bg-[#111] px-3 py-3 pr-10 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer bg-transparent p-0 text-white/30 transition-colors hover:text-white/60"
        aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
      >
        {visible ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function AuthForms() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register state
  const [regFirst, setRegFirst] = useState("");
  const [regLast, setRegLast] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showRegPw, setShowRegPw] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);

  const handleLogin = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: loginEmail,
            password: loginPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Anmeldung fehlgeschlagen.");
          setLoading(false);
          return;
        }
        window.dispatchEvent(new Event("uncuttv:session-changed"));
        router.push("/konto/dashboard");
      } catch {
        setError("Verbindungsfehler.");
        setLoading(false);
      }
    },
    [loginEmail, loginPassword, router]
  );

  const handleRegister = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");

      if (regPassword !== regConfirm) {
        setError("Passwörter stimmen nicht überein.");
        return;
      }
      if (regPassword.length < 6) {
        setError("Passwort muss mindestens 6 Zeichen lang sein.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: regEmail,
            password: regPassword,
            firstName: regFirst,
            lastName: regLast,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Registrierung fehlgeschlagen.");
          setLoading(false);
          return;
        }
        window.dispatchEvent(new Event("uncuttv:session-changed"));
        router.push("/konto/dashboard");
      } catch {
        setError("Verbindungsfehler.");
        setLoading(false);
      }
    },
    [regEmail, regPassword, regConfirm, regFirst, regLast, router]
  );

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex border-b border-[#222]">
        <button
          type="button"
          onClick={() => {
            setTab("login");
            setError("");
          }}
          className={`flex-1 cursor-pointer py-3 text-center text-xs font-bold tracking-[0.2em] transition-colors ${
            tab === "login"
              ? "border-b-2 border-[#c0392b] text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          ANMELDEN
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("register");
            setError("");
          }}
          className={`flex-1 cursor-pointer py-3 text-center text-xs font-bold tracking-[0.2em] transition-colors ${
            tab === "register"
              ? "border-b-2 border-[#c0392b] text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          REGISTRIEREN
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-4 text-sm text-[#c0392b]">{error}</p>
      )}

      {/* Login form */}
      {tab === "login" && (
        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <Label>E-MAIL</Label>
            <Input
              type="email"
              value={loginEmail}
              onChange={setLoginEmail}
              placeholder="deine@email.com"
              required
            />
          </div>
          <div>
            <Label>PASSWORT</Label>
            <PasswordInput
              value={loginPassword}
              onChange={setLoginPassword}
              visible={showLoginPw}
              onToggle={() => setShowLoginPw((v) => !v)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)] disabled:opacity-60"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin border-2 border-white border-t-transparent" />
            ) : (
              "ANMELDEN"
            )}
          </button>
          <a
            href="/passwort-vergessen"
            className="mt-3 block text-center text-xs text-white/40 transition-colors hover:text-[#c0392b]"
          >
            Passwort vergessen?
          </a>
        </form>
      )}

      {/* Register form */}
      {tab === "register" && (
        <form onSubmit={handleRegister} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>VORNAME</Label>
              <Input
                value={regFirst}
                onChange={setRegFirst}
                placeholder="Max"
                required
              />
            </div>
            <div>
              <Label>NACHNAME</Label>
              <Input
                value={regLast}
                onChange={setRegLast}
                placeholder="Mustermann"
                required
              />
            </div>
          </div>
          <div>
            <Label>E-MAIL</Label>
            <Input
              type="email"
              value={regEmail}
              onChange={setRegEmail}
              placeholder="deine@email.com"
              required
            />
          </div>
          <div>
            <Label>PASSWORT</Label>
            <PasswordInput
              value={regPassword}
              onChange={setRegPassword}
              visible={showRegPw}
              onToggle={() => setShowRegPw((v) => !v)}
              placeholder="Min. 6 Zeichen"
            />
          </div>
          <div>
            <Label>PASSWORT WIEDERHOLEN</Label>
            <PasswordInput
              value={regConfirm}
              onChange={setRegConfirm}
              visible={showRegConfirm}
              onToggle={() => setShowRegConfirm((v) => !v)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)] disabled:opacity-60"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin border-2 border-white border-t-transparent" />
            ) : (
              "KONTO ERSTELLEN"
            )}
          </button>
        </form>
      )}
    </div>
  );
}
