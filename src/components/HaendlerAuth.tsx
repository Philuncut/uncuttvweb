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

export default function HaendlerAuth() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");

  // Register
  const [regFirst, setRegFirst] = useState("");
  const [regLast, setRegLast] = useState("");
  const [regCompany, setRegCompany] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [regPw, setRegPw] = useState("");

  const handleLogin = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        const res = await fetch("/api/haendler/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: loginEmail, password: loginPw }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Anmeldung fehlgeschlagen.");
          setLoading(false);
          return;
        }
        router.push("/haendler/dashboard");
      } catch {
        setError("Verbindungsfehler.");
        setLoading(false);
      }
    },
    [loginEmail, loginPw, router]
  );

  const handleRegister = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");
      setSuccess("");
      setLoading(true);

      try {
        const res = await fetch("/api/haendler/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: regEmail,
            password: regPw,
            firstName: regFirst,
            lastName: regLast,
            company: regCompany,
            phone: regPhone,
            address: regAddress,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Registrierung fehlgeschlagen.");
        } else {
          setSuccess(data.message);
        }
      } catch {
        setError("Verbindungsfehler.");
      } finally {
        setLoading(false);
      }
    },
    [regEmail, regPw, regFirst, regLast, regCompany, regPhone, regAddress]
  );

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex border-b border-[#222]">
        <button
          type="button"
          onClick={() => { setTab("login"); setError(""); setSuccess(""); }}
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
          onClick={() => { setTab("register"); setError(""); setSuccess(""); }}
          className={`flex-1 cursor-pointer py-3 text-center text-xs font-bold tracking-[0.2em] transition-colors ${
            tab === "register"
              ? "border-b-2 border-[#c0392b] text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          REGISTRIEREN
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-[#c0392b]">{error}</p>}
      {success && <p className="mt-4 text-sm text-green-400">{success}</p>}

      {tab === "login" && (
        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <Label>E-MAIL</Label>
            <Input type="email" value={loginEmail} onChange={setLoginEmail} placeholder="haendler@firma.at" required />
          </div>
          <div>
            <Label>PASSWORT</Label>
            <Input type="password" value={loginPw} onChange={setLoginPw} placeholder="••••••••" required />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)] disabled:opacity-60"
          >
            {loading ? <div className="h-5 w-5 animate-spin border-2 border-white border-t-transparent" /> : "ANMELDEN"}
          </button>
        </form>
      )}

      {tab === "register" && !success && (
        <form onSubmit={handleRegister} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>VORNAME</Label><Input value={regFirst} onChange={setRegFirst} placeholder="Max" required /></div>
            <div><Label>NACHNAME</Label><Input value={regLast} onChange={setRegLast} placeholder="Mustermann" required /></div>
          </div>
          <div><Label>FIRMA *</Label><Input value={regCompany} onChange={setRegCompany} placeholder="Muster GmbH" required /></div>
          <div><Label>E-MAIL</Label><Input type="email" value={regEmail} onChange={setRegEmail} placeholder="haendler@firma.at" required /></div>
          <div><Label>TELEFON</Label><Input value={regPhone} onChange={setRegPhone} placeholder="+43 ..." /></div>
          <div><Label>ADRESSE</Label><Input value={regAddress} onChange={setRegAddress} placeholder="Straße, PLZ Ort, Land" /></div>
          <div><Label>PASSWORT</Label><Input type="password" value={regPw} onChange={setRegPw} placeholder="Min. 8 Zeichen" required /></div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)] disabled:opacity-60"
          >
            {loading ? <div className="h-5 w-5 animate-spin border-2 border-white border-t-transparent" /> : "ANFRAGE SENDEN"}
          </button>
        </form>
      )}
    </div>
  );
}
