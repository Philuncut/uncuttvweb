"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AuthSessionPayload } from "@/app/api/auth/session/route";
import { useCart } from "@/lib/CartContext";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";
import CartDrawer from "@/components/CartDrawer";

const linkGlow =
  "0 0 8px rgba(192,57,43,0.8), 0 0 20px rgba(192,57,43,0.4), 0 0 40px rgba(192,57,43,0.2)";
const logoTvGlow =
  "0 0 10px rgba(192,57,43,0.8), 0 0 25px rgba(192,57,43,0.4)";

function NavLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  const style: React.CSSProperties = {
    letterSpacing: hovered ? "0.25em" : "0.1em",
    color: hovered ? "#c0392b" : "#fff",
    textShadow: hovered ? linkGlow : "none",
    transition: "all 0.3s ease",
  };

  const props = {
    className: "text-sm font-bold uppercase",
    style,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };

  if (external) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

function Divider() {
  return (
    <div
      className="mx-5 h-4"
      style={{ width: 1, backgroundColor: "#333" }}
    />
  );
}

/* ── Cinematic mobile fullscreen overlay menu ── */

interface MobileOverlayMenuProps {
  open: boolean;
  onClose: () => void;
  language: "de" | "en";
  toggleLanguage: () => void;
  t: (key: string) => string;
}

function MobileMenuLink({
  href,
  external,
  delay,
  visible,
  onClose,
  children,
}: {
  href: string;
  external?: boolean;
  delay: number;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  const style: React.CSSProperties = {
    fontSize: "2.5rem",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.2em",
    color: hovered ? "#c0392b" : "#fff",
    textShadow: hovered
      ? "0 0 8px rgba(192,57,43,0.8), 0 0 20px rgba(192,57,43,0.4), 0 0 40px rgba(192,57,43,0.2)"
      : "none",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(20px)",
    transition: `opacity 0.5s ease ${delay}s, transform 0.5s ease ${delay}s, color 0.3s ease, text-shadow 0.3s ease`,
    display: "block",
    padding: "0.5rem 0",
  };

  const props = {
    style,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onClick: onClose,
  };

  if (external) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

function MobileOverlayMenu({
  open,
  onClose,
  language,
  toggleLanguage,
  t,
}: MobileOverlayMenuProps) {
  const [mounted, setMounted] = useState(false);
  const [linksVisible, setLinksVisible] = useState(false);

  // Slide animation
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Slight delay to trigger transition after mount
      const t1 = setTimeout(() => setLinksVisible(true), 50);
      return () => clearTimeout(t1);
    } else {
      setLinksVisible(false);
      const t2 = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t2);
    }
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className="md:hidden"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "#0a0a0a",
        zIndex: 9999,
        transform: open ? "translateY(0)" : "translateY(-100%)",
        transition: open
          ? "transform 0.4s ease-out"
          : "transform 0.3s ease-in",
      }}
    >
      {/* Top bar with logo + close */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          height: 60,
        }}
      >
        <Link
          href="/shop"
          onClick={onClose}
          className="text-3xl font-black tracking-wider"
        >
          <span className="text-white">UNCUT</span>
          <span className="text-[#c0392b]">TV</span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Menü schließen"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "#fff",
            padding: 4,
          }}
        >
          <svg
            style={{ width: 28, height: 28 }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="square" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Centered nav links */}
      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 60px)",
          gap: "0.5rem",
          padding: "0 24px",
        }}
      >
        <MobileMenuLink
          href="/shop"
          delay={0.2}
          visible={linksVisible}
          onClose={onClose}
        >
          {t("SHOP")}
        </MobileMenuLink>
        <MobileMenuLink
          href="/konto"
          delay={0.3}
          visible={linksVisible}
          onClose={onClose}
        >
          {t("MEIN_KONTO")}
        </MobileMenuLink>
        <MobileMenuLink
          href="/haendler"
          delay={0.4}
          visible={linksVisible}
          onClose={onClose}
        >
          {t("HAENDLER")}
        </MobileMenuLink>

        {/* Language toggle */}
        <div
          style={{
            marginTop: "2rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "1rem",
            fontWeight: "bold",
            opacity: linksVisible ? 1 : 0,
            transform: linksVisible ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.5s ease 0.5s, transform 0.5s ease 0.5s",
          }}
        >
          <button
            type="button"
            onClick={language === "en" ? toggleLanguage : undefined}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              color: language === "de" ? "#fff" : "#888",
            }}
          >
            DE
          </button>
          <span style={{ color: "#333" }}>|</span>
          <button
            type="button"
            onClick={language === "de" ? toggleLanguage : undefined}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              color: language === "en" ? "#fff" : "#888",
            }}
          >
            EN
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);
  const [cartHovered, setCartHovered] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { totalItems, openDrawer } = useCart();
  const { language, toggleLanguage } = useLanguage();
  const t = createT(language);

  const [sessionReady, setSessionReady] = useState(false);
  const [session, setSession] = useState<AuthSessionPayload | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = (await res.json()) as AuthSessionPayload;
      setSession(data);
    } catch {
      setSession({
        isLoggedIn: false,
        type: null,
        name: null,
        dashboardHref: null,
        isWholesale: false,
      });
    } finally {
      setSessionReady(true);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [pathname, loadSession]);

  useEffect(() => {
    const onSessionChanged = () => {
      void loadSession();
    };
    window.addEventListener("uncuttv:session-changed", onSessionChanged);
    return () =>
      window.removeEventListener("uncuttv:session-changed", onSessionChanged);
  }, [loadSession]);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 10);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ESC key closes mobile menu + body scroll lock
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileMenuOpen(false);
    }
    if (mobileMenuOpen) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Vanilla JS bindings for mobile menu + language buttons (runs after hydration)
  useEffect(() => {
    const btn = document.getElementById("hamburger-btn");
    const menu = document.getElementById("mobile-menu");
    const closeBtn = document.getElementById("mobile-menu-close");

    function openMenu() {
      if (!menu) return;
      menu.style.display = "flex";
      void menu.offsetHeight;
      menu.classList.add("is-open");
      document.body.style.overflow = "hidden";
    }

    function closeMenu() {
      if (!menu) return;
      menu.classList.remove("is-open");
      document.body.style.overflow = "";
      setTimeout(() => {
        if (menu && !menu.classList.contains("is-open")) {
          menu.style.display = "none";
        }
      }, 400);
    }

    const onBtnTouch = (e: Event) => { e.preventDefault(); openMenu(); };
    const onCloseTouch = (e: Event) => { e.preventDefault(); closeMenu(); };

    btn?.addEventListener("touchend", onBtnTouch);
    btn?.addEventListener("click", openMenu);
    closeBtn?.addEventListener("touchend", onCloseTouch);
    closeBtn?.addEventListener("click", closeMenu);

    const links = menu?.querySelectorAll("a") || [];
    links.forEach((link) => link.addEventListener("click", closeMenu));

    // DE/EN language buttons
    const deBtn = document.getElementById("lang-de-btn");
    const enBtn = document.getElementById("lang-en-btn");

    function updateLangButtons(lang: string) {
      if (deBtn) deBtn.style.color = lang === "de" ? "#fff" : "#555";
      if (enBtn) enBtn.style.color = lang === "en" ? "#fff" : "#555";
    }

    function applyLanguage(lang: string) {
      try { localStorage.setItem("uncuttv_language", lang); } catch {}
      updateLangButtons(lang);
    }

    try {
      updateLangButtons(localStorage.getItem("uncuttv_language") || "de");
    } catch {}

    const deHandler = (e: Event) => { e.preventDefault(); applyLanguage("de"); };
    const enHandler = (e: Event) => { e.preventDefault(); applyLanguage("en"); };

    deBtn?.addEventListener("touchend", deHandler);
    deBtn?.addEventListener("click", deHandler);
    enBtn?.addEventListener("touchend", enHandler);
    enBtn?.addEventListener("click", enHandler);

    return () => {
      btn?.removeEventListener("touchend", onBtnTouch);
      btn?.removeEventListener("click", openMenu);
      closeBtn?.removeEventListener("touchend", onCloseTouch);
      closeBtn?.removeEventListener("click", closeMenu);
      links.forEach((link) => link.removeEventListener("click", closeMenu));
      deBtn?.removeEventListener("touchend", deHandler);
      deBtn?.removeEventListener("click", deHandler);
      enBtn?.removeEventListener("touchend", enHandler);
      enBtn?.removeEventListener("click", enHandler);
    };
  }, []);

  return (
    <>
      <nav
        className="flex w-full items-center justify-between px-6"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10001,
          pointerEvents: "auto",
          height: 60,
          borderBottom: "1px solid #1a1a1a",
          background: scrolled ? "rgba(10,10,10,0.95)" : "#0a0a0a",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(12px)" : "none",
          transition: "background 0.3s ease, backdrop-filter 0.3s ease",
        }}
      >
        <Link
          href="/shop"
          className="text-3xl font-black tracking-wider"
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
        >
          <span className="text-white">UNCUT</span>
          <span
            style={{
              color: "#c0392b",
              textShadow: logoHovered ? logoTvGlow : "none",
              transition: "text-shadow 0.3s ease",
            }}
          >
            TV
          </span>
        </Link>

        <div className="flex items-center">
          {/* Desktop nav links — hidden on mobile */}
          <div className="hidden items-center md:flex">
            <NavLink href="/shop">{t("SHOP")}</NavLink>
            <Divider />
            {!sessionReady ? (
              <span
                className="inline-block h-5 w-28 rounded bg-white/10 align-middle animate-pulse"
                aria-hidden
              />
            ) : session?.isLoggedIn &&
              session.name &&
              session.dashboardHref ? (
              <>
                <NavLink href={session.dashboardHref}>
                  <span style={{ color: "#c0392b" }}>
                    {session.name.toUpperCase()}
                  </span>
                </NavLink>
                <span
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    await fetch("/api/haendler/logout", { method: "POST" });
                    document.cookie = "woo_customer_name=; path=/; max-age=0";
                    window.dispatchEvent(new Event("uncuttv:session-changed"));
                    window.location.href = "/shop";
                  }}
                  style={{
                    marginLeft: 8,
                    color: "#555",
                    fontSize: 11,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  ✕
                </span>
              </>
            ) : (
              <NavLink href="/konto/login">{t("ANMELDEN")}</NavLink>
            )}
            <Divider />
            <NavLink href="/haendler">{t("HAENDLER")}</NavLink>
            <Divider />

            {/* Language toggle */}
            <div className="flex items-center gap-1 text-sm font-bold">
              <button
                type="button"
                onClick={language === "en" ? toggleLanguage : undefined}
                className="cursor-pointer bg-transparent px-1 transition-colors"
                style={{ color: language === "de" ? "#fff" : "#888" }}
              >
                DE
              </button>
              <span className="text-[#333]">|</span>
              <button
                type="button"
                onClick={language === "de" ? toggleLanguage : undefined}
                className="cursor-pointer bg-transparent px-1 transition-colors"
                style={{ color: language === "en" ? "#fff" : "#888" }}
              >
                EN
              </button>
            </div>
            <Divider />
          </div>

          {/* DE/EN toggle — mobile only, before cart icon */}
          <div
            className="mr-3 flex items-center md:hidden"
            style={{
              gap: "4px",
              fontSize: "11px",
              fontWeight: "bold",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            <button
              id="lang-de-btn"
              type="button"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px 4px",
                color: language === "de" ? "#fff" : "#555",
                fontSize: "11px",
                fontWeight: "bold",
                touchAction: "manipulation",
              }}
            >
              DE
            </button>
            <span style={{ color: "#333" }}>|</span>
            <button
              id="lang-en-btn"
              type="button"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px 4px",
                color: language === "en" ? "#fff" : "#555",
                fontSize: "11px",
                fontWeight: "bold",
                touchAction: "manipulation",
              }}
            >
              EN
            </button>
          </div>

          {/* Cart icon */}
          <button
            type="button"
            onClick={openDrawer}
            onMouseEnter={() => setCartHovered(true)}
            onMouseLeave={() => setCartHovered(false)}
            className="relative cursor-pointer bg-transparent p-1"
            aria-label="Warenkorb öffnen"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              style={{
                color: cartHovered ? "#c0392b" : "#fff",
                filter: cartHovered
                  ? "drop-shadow(0 0 6px rgba(192,57,43,0.8))"
                  : "none",
                transition: "all 0.3s ease",
              }}
            >
              <path
                strokeLinecap="square"
                strokeLinejoin="miter"
                d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>

            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center bg-[#c0392b] px-1 text-[10px] font-bold text-white">
                {totalItems}
              </span>
            )}
          </button>

          {/* Hamburger menu button — mobile only — vanilla JS handles click */}
          <button
            id="hamburger-btn"
            type="button"
            aria-label="Menü öffnen"
            className="ml-3 md:hidden hamburger-btn"
            onClick={() => {
              const menu = document.getElementById("mobile-menu");
              if (menu) {
                menu.style.display = "flex";
                void menu.offsetHeight;
                menu.classList.add("is-open");
                document.body.style.overflow = "hidden";
              }
            }}
            style={{
              width: 44,
              height: 44,
              background: "none",
              border: "none",
              color: "white",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              padding: 0,
              touchAction: "manipulation",
              WebkitTapHighlightColor: "rgba(192,57,43,0.3)",
            }}
          >
            <span className="hamburger-line" style={{ width: 22, height: 2, background: "currentColor", display: "block", transition: "background 0.2s" }} />
            <span className="hamburger-line" style={{ width: 22, height: 2, background: "currentColor", display: "block", transition: "background 0.2s" }} />
            <span className="hamburger-line" style={{ width: 22, height: 2, background: "currentColor", display: "block", transition: "background 0.2s" }} />
          </button>
        </div>
      </nav>

      {/* Inline styles for menu animations + hamburger hover */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .hamburger-btn:hover .hamburger-line {
              background: #c0392b !important;
            }
            @keyframes menuLinkFadeIn {
              from { opacity: 0; transform: translateX(-20px); }
              to { opacity: 1; transform: translateX(0); }
            }
            #mobile-menu.is-open {
              transform: translateY(0) !important;
            }
            #mobile-menu.is-open .menu-link {
              animation: menuLinkFadeIn 0.5s ease forwards;
            }
            #mobile-menu .menu-link {
              opacity: 0;
            }
            #mobile-menu .menu-main-link {
              position: relative;
              transition: color 0.3s, text-shadow 0.3s, padding-left 0.3s;
            }
            #mobile-menu .menu-main-link::before {
              content: "";
              position: absolute;
              left: 16px;
              top: 50%;
              transform: translateY(-50%);
              width: 3px;
              height: 0;
              background: #c0392b;
              transition: height 0.3s ease;
            }
            #mobile-menu .menu-main-link:hover {
              color: #c0392b !important;
              text-shadow: 0 0 8px rgba(192,57,43,0.8), 0 0 20px rgba(192,57,43,0.4);
            }
            #mobile-menu .menu-main-link:hover::before {
              height: 70%;
            }
            #mobile-menu .menu-sub-link {
              transition: color 0.3s;
            }
            #mobile-menu .menu-sub-link:hover {
              color: #c0392b !important;
            }
          `,
        }}
      />

      {/* Fullscreen mobile menu overlay — left-aligned cinematic style */}
      <div
        id="mobile-menu"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "#0a0a0a",
          zIndex: 100000,
          display: "none",
          flexDirection: "column",
          padding: 0,
          overflowY: "auto",
          transform: "translateY(-100%)",
          transition: "transform 0.4s ease-out",
        }}
      >
        {/* Top bar — logo left, close right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 16px 32px",
          }}
        >
          <a
            href="/shop"
            style={{
              fontSize: "1.5rem",
              fontWeight: 900,
              letterSpacing: "0.05em",
              textDecoration: "none",
            }}
          >
            <span style={{ color: "white" }}>UNCUT</span>
            <span style={{ color: "#c0392b" }}>TV</span>
          </a>
          <button
            id="mobile-menu-close"
            type="button"
            aria-label="Menü schließen"
            onClick={() => {
              const menu = document.getElementById("mobile-menu");
              if (menu) {
                menu.classList.remove("is-open");
                document.body.style.overflow = "";
                setTimeout(() => {
                  if (menu && !menu.classList.contains("is-open")) {
                    menu.style.display = "none";
                  }
                }, 400);
              }
            }}
            style={{
              width: 44,
              height: 44,
              color: "white",
              fontSize: 40,
              lineHeight: 1,
              background: "none",
              border: "none",
              cursor: "pointer",
              touchAction: "manipulation",
              padding: 0,
              zIndex: 10,
              position: "relative",
            }}
          >
            ×
          </button>
        </div>

        {/* Main nav — left aligned */}
        <nav
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            paddingTop: "1rem",
            paddingBottom: "1rem",
          }}
        >
          {/* SHOP */}
          <a
            href="/shop"
            className="menu-link menu-main-link"
            style={{
              color: "white",
              fontSize: "2.2rem",
              fontWeight: "bold",
              textDecoration: "none",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              padding: "12px 32px",
              animationDelay: "0.1s",
            }}
          >
            {t("SHOP")}
          </a>
          <a
            href="/shop?kategorie=vorverkauf"
            className="menu-link menu-sub-link"
            style={{
              color: "#666",
              fontSize: "1rem",
              fontWeight: "bold",
              textDecoration: "none",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "4px 48px",
              animationDelay: "0.15s",
            }}
          >
            <span style={{ color: "#c0392b", marginRight: 8 }}>·</span>
            VORVERKAUF
          </a>
          <a
            href="/shop?kategorie=brandneu"
            className="menu-link menu-sub-link"
            style={{
              color: "#666",
              fontSize: "1rem",
              fontWeight: "bold",
              textDecoration: "none",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "4px 48px",
              animationDelay: "0.2s",
            }}
          >
            <span style={{ color: "#c0392b", marginRight: 8 }}>·</span>
            BRANDNEU
          </a>
          <a
            href="/shop?kategorie=jetzt-erhaeltlich"
            className="menu-link menu-sub-link"
            style={{
              color: "#666",
              fontSize: "1rem",
              fontWeight: "bold",
              textDecoration: "none",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "4px 48px",
              animationDelay: "0.25s",
            }}
          >
            <span style={{ color: "#c0392b", marginRight: 8 }}>·</span>
            JETZT ERHÄLTLICH
          </a>
          <a
            href="/shop?kategorie=outofprint"
            className="menu-link menu-sub-link"
            style={{
              color: "#666",
              fontSize: "1rem",
              fontWeight: "bold",
              textDecoration: "none",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "4px 48px",
              animationDelay: "0.3s",
            }}
          >
            <span style={{ color: "#c0392b", marginRight: 8 }}>·</span>
            OUT OF PRINT
          </a>

          {/* MEIN KONTO / ANMELDEN */}
          {!sessionReady ? (
            <span
              className="menu-link menu-main-link inline-block h-9 w-48 rounded bg-white/10 animate-pulse"
              style={{
                margin: "12px 32px",
                animationDelay: "0.35s",
              }}
              aria-hidden
            />
          ) : (
            <a
              href={
                session?.isLoggedIn && session.dashboardHref
                  ? session.dashboardHref
                  : "/konto/login"
              }
              className="menu-link menu-main-link"
              style={{
                color:
                  session?.isLoggedIn && session.name ? "#c0392b" : "white",
                fontSize: "2.2rem",
                fontWeight: "bold",
                textDecoration: "none",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "12px 32px",
                animationDelay: "0.35s",
              }}
            >
              {session?.isLoggedIn && session.name
                ? session.name.toUpperCase()
                : t("ANMELDEN")}
            </a>
          )}

          {/* KONTAKT */}
          <a
            href="/kontakt"
            className="menu-link menu-main-link"
            style={{
              color: "white",
              fontSize: "2.2rem",
              fontWeight: "bold",
              textDecoration: "none",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              padding: "12px 32px",
              animationDelay: "0.4s",
            }}
          >
            KONTAKT
          </a>
          <a
            href="/impressum"
            className="menu-link menu-sub-link"
            style={{
              color: "#666",
              fontSize: "1rem",
              fontWeight: "bold",
              textDecoration: "none",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "4px 48px",
              animationDelay: "0.45s",
            }}
          >
            <span style={{ color: "#c0392b", marginRight: 8 }}>·</span>
            IMPRESSUM
          </a>
          <a
            href="/datenschutz"
            className="menu-link menu-sub-link"
            style={{
              color: "#666",
              fontSize: "1rem",
              fontWeight: "bold",
              textDecoration: "none",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "4px 48px",
              animationDelay: "0.5s",
            }}
          >
            <span style={{ color: "#c0392b", marginRight: 8 }}>·</span>
            DATENSCHUTZ
          </a>

          {/* HÄNDLER — mobile-only bottom utility entry */}
          <div
            className="md:hidden"
            style={{
              borderTop: "1px solid #1a1a1a",
              margin: "16px 32px 0",
              paddingTop: 16,
            }}
          >
            <a
              href="/haendler"
              className="menu-link menu-main-link"
              style={{
                color: "white",
                fontSize: "2.2rem",
                fontWeight: "bold",
                textDecoration: "none",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "12px 0",
                animationDelay: "0.55s",
                display: "block",
              }}
            >
              {t("HAENDLER")}
            </a>
          </div>
        </nav>

        {/* Bottom: red separator + DE/EN toggle */}
      </div>

      <CartDrawer />
    </>
  );
}
