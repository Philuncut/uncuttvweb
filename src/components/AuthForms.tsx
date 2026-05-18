"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordToggleInput } from "@/components/PasswordToggleInput";
import { useCart } from "@/lib/CartContext";

/** Validates and resolves the post-login redirect target. */
function resolveRedirectTarget(searchParams: { get(name: string): string | null }): string {
  const raw = searchParams.get("redirect") ?? "";
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("://")) {
    return raw;
  }
  return "";
}

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

export default function AuthForms() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { repriceCartForWholesale } = useCart();
  const [tab, setTab] = useState<Tab>("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect target: URL param wins; referrer is the fallback; /shop is the floor.
  const [redirectTo, setRedirectTo] = useState<string>("/shop");
  useEffect(() => {
    const fromParam = resolveRedirectTarget(searchParams);
    if (fromParam) {
      setRedirectTo(fromParam);
      return;
    }
    // Referrer fallback — only safe if same origin and not the login page itself.
    try {
      const ref = document.referrer;
      if (ref) {
        const refUrl = new URL(ref);
        if (
          refUrl.hostname === window.location.hostname &&
          !refUrl.pathname.startsWith("/konto/login")
        ) {
          setRedirectTo(refUrl.pathname + refUrl.search);
          return;
        }
      }
    } catch {
      // malformed referrer — ignore
    }
    setRedirectTo("/shop");
  }, [searchParams]);

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

        // Wholesale takes priority — B2C shop flow skipped and cart repriced server-side prices.
        if (data.isWholesale === true) {
          try {
            const result = await repriceCartForWholesale();
            if (
              result.repricedCount > 0 ||
              result.removedItems.length > 0
            ) {
              sessionStorage.setItem(
                "cart_reprice_notice",
                JSON.stringify({
                  removedItems: result.removedItems,
                  repricedCount: result.repricedCount,
                })
              );
            }
          } catch {
            /* keep cart unchanged on failure */
          }
          window.dispatchEvent(new Event("uncuttv:session-changed"));
          setLoading(false);
          router.push("/haendler/dashboard");
          return;
        }

        window.dispatchEvent(new Event("uncuttv:session-changed"));
        setLoading(false);
        router.push(redirectTo);
      } catch {
        setError("Verbindungsfehler.");
        setLoading(false);
      }
    },
    [loginEmail, loginPassword, router, redirectTo, repriceCartForWholesale]
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
        router.push(redirectTo);
      } catch {
        setError("Verbindungsfehler.");
        setLoading(false);
      }
    },
    [regEmail, regPassword, regConfirm, regFirst, regLast, router, redirectTo]
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
            <PasswordToggleInput
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
            <PasswordToggleInput
              value={regPassword}
              onChange={setRegPassword}
              visible={showRegPw}
              onToggle={() => setShowRegPw((v) => !v)}
              placeholder="Min. 6 Zeichen"
            />
          </div>
          <div>
            <Label>PASSWORT WIEDERHOLEN</Label>
            <PasswordToggleInput
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
