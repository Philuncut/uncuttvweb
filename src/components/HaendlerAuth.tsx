"use client";

import { useState, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PasswordToggleInput } from "@/components/PasswordToggleInput";

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
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      autoComplete={autoComplete}
      className="w-full border border-[#333] bg-[#111] px-3 py-3 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
    />
  );
}

export default function HaendlerAuth() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
        window.dispatchEvent(new Event("uncuttv:session-changed"));
        router.push("/haendler/dashboard");
      } catch {
        setError("Verbindungsfehler.");
        setLoading(false);
      }
    },
    [loginEmail, loginPw, router]
  );

  return (
    <div>
      <p className="border-b border-[#222] py-3 text-center text-xs font-bold tracking-[0.2em] text-white">
        ANMELDEN
      </p>

      {error && <p className="mt-4 text-sm text-[#c0392b]">{error}</p>}

      <form onSubmit={handleLogin} className="mt-6 space-y-4">
        <div>
          <Label>E-MAIL</Label>
          <Input
            type="email"
            value={loginEmail}
            onChange={setLoginEmail}
            placeholder="haendler@firma.at"
            autoComplete="username"
            required
          />
        </div>
        <div>
          <Label>PASSWORT</Label>
          <PasswordToggleInput
            value={loginPw}
            onChange={setLoginPw}
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
            autoComplete="current-password"
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
      </form>

      <div className="mt-8 border-t border-[#222] pt-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">
          NOCH KEIN HÄNDLER?
        </p>
        <p className="mt-2 text-sm text-white/50">
          Bewirb dich als autorisierter Fachhändler.
        </p>
        <Link
          href="/haendler/anfrage"
          className="mt-4 inline-flex w-full items-center justify-center border border-[#c0392b] bg-transparent py-3 text-xs font-bold tracking-[0.18em] text-[#c0392b] transition-all duration-300 hover:bg-[#c0392b] hover:text-white"
        >
          ANFRAGE STELLEN
        </Link>
      </div>
    </div>
  );
}
