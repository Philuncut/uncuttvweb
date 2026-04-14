"use client";

export default function MobileNewsletterBanner() {
  return (
    <>
      <div
        className="md:hidden w-full border-l-4 border-[#c0392b] bg-[#0d0d0d]"
        style={{ padding: "12px 16px" }}
      >
        {/* Top row: headline + toggle button */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] leading-tight text-white">
            <span className="font-black text-[#c0392b]">SPARE 10%</span>
            <span className="ml-1.5 text-white/70">
              bei deinem ersten Einkauf
            </span>
          </p>
          <button
            id="newsletter-banner-toggle"
            type="button"
            aria-expanded="false"
            style={{
              flexShrink: 0,
              cursor: "pointer",
              background: "#c0392b",
              border: "none",
              color: "white",
              padding: "6px 12px",
              fontSize: "10px",
              fontWeight: "bold",
              letterSpacing: "0.05em",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "rgba(255,255,255,0.3)",
            }}
          >
            ANMELDEN →
          </button>
        </div>

        {/* Animated expandable section — always in DOM */}
        <div
          id="newsletter-banner-form"
          style={{
            maxHeight: 0,
            overflow: "hidden",
            transition: "max-height 0.35s ease, margin-top 0.35s ease",
            marginTop: 0,
          }}
        >
          <form id="newsletter-banner-form-el" style={{ paddingTop: 12 }}>
            <input
              id="newsletter-banner-email"
              type="email"
              required
              placeholder="deine@email.com"
              style={{
                width: "100%",
                border: "1px solid #333",
                background: "#111",
                padding: "10px 12px",
                fontSize: "12px",
                color: "white",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              id="newsletter-banner-submit"
              type="submit"
              style={{
                width: "100%",
                marginTop: 8,
                background: "#c0392b",
                border: "none",
                color: "white",
                padding: "10px 12px",
                fontSize: "11px",
                fontWeight: "bold",
                letterSpacing: "0.15em",
                cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "rgba(255,255,255,0.3)",
              }}
            >
              ANMELDEN
            </button>
            <div
              id="newsletter-banner-message"
              style={{ marginTop: 6, fontSize: 10, minHeight: 0 }}
            />
          </form>
        </div>
      </div>

      {/* Vanilla JS — bypasses React for iOS Safari */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  function init() {
    var toggle = document.getElementById('newsletter-banner-toggle');
    var formWrap = document.getElementById('newsletter-banner-form');
    var formEl = document.getElementById('newsletter-banner-form-el');
    var emailInput = document.getElementById('newsletter-banner-email');
    var submitBtn = document.getElementById('newsletter-banner-submit');
    var messageEl = document.getElementById('newsletter-banner-message');

    if (!toggle || !formWrap || !formEl || !emailInput || !submitBtn || !messageEl) {
      return;
    }

    function openForm() {
      formWrap.style.maxHeight = '200px';
      formWrap.style.marginTop = '12px';
      toggle.textContent = 'SCHLIESSEN';
      toggle.setAttribute('aria-expanded', 'true');
    }

    function closeForm() {
      formWrap.style.maxHeight = '0';
      formWrap.style.marginTop = '0';
      toggle.textContent = 'ANMELDEN \u2192';
      toggle.setAttribute('aria-expanded', 'false');
    }

    function showSuccess() {
      formEl.innerHTML = '<div style="border:1px solid #222;background:#111;padding:10px 12px;"><p style="font-size:12px;line-height:1.5;color:white;margin:0;"><span style="font-weight:bold;color:#c0392b;">Danke!</span> Dein Rabattcode <span style="font-weight:bold;color:#c0392b;">WELCOME10</span> kommt per E-Mail.</p></div>';
      formWrap.style.maxHeight = '120px';
      toggle.style.display = 'none';
    }

    function showError(msg) {
      messageEl.textContent = msg || 'Anmeldung fehlgeschlagen.';
      messageEl.style.color = '#c0392b';
    }

    function clearError() {
      messageEl.textContent = '';
    }

    if (!toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      var toggleHandler = function(e) {
        if (e) e.preventDefault();
        if (formWrap.style.maxHeight === '0px' || !formWrap.style.maxHeight) {
          openForm();
        } else {
          closeForm();
        }
      };
      toggle.addEventListener('touchend', toggleHandler);
      toggle.addEventListener('click', toggleHandler);
    }

    if (!formEl.dataset.bound) {
      formEl.dataset.bound = '1';
      formEl.addEventListener('submit', function(e) {
        e.preventDefault();
        clearError();
        var email = emailInput.value.trim();
        if (!email || email.indexOf('@') === -1) {
          showError('Ungültige E-Mail-Adresse.');
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = '...';
        fetch('/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email }),
        })
          .then(function(res) {
            if (res.ok) {
              showSuccess();
            } else {
              return res.json().then(function(data) {
                showError(data.error || 'Anmeldung fehlgeschlagen.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'ANMELDEN';
              });
            }
          })
          .catch(function() {
            showError('Verbindungsfehler.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'ANMELDEN';
          });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
        `,
        }}
      />
    </>
  );
}
