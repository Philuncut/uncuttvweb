import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Datenschutz — UNCUTTV",
};

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="border-l-4 border-[#c0392b] pl-4 text-lg font-black text-white sm:text-2xl sm:tracking-[0.1em] md:text-3xl md:tracking-[0.15em]">
          DATENSCHUTZERKLÄRUNG
        </h1>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-white/70">
          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              1. Verantwortlicher
            </h2>
            <p>
              UncutTV GmbH, Kalchgruben 4/11, 6094 Axams, Österreich
            </p>
            <p>
              E-Mail:{" "}
              <a
                href="mailto:office@uncuttv.at"
                className="text-[#c0392b] hover:underline"
              >
                office@uncuttv.at
              </a>
            </p>
            <p>Geschäftsführung: Florian Schütz, Philipp Gasser</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              2. Erhebung und Verarbeitung personenbezogener Daten
            </h2>
            <p>
              Beim Besuch unserer Website werden automatisch technische Daten
              erfasst (IP-Adresse, Browsertyp, Betriebssystem, Referrer-URL,
              Zeitpunkt des Zugriffs). Diese Daten sind für den technischen
              Betrieb der Website erforderlich und werden nicht zur
              Identifikation einzelner Personen verwendet.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              3. Bestellungen und Kundenkonto
            </h2>
            <p>
              Bei einer Bestellung in unserem Shop verarbeiten wir folgende
              Daten: Name, Lieferadresse, Rechnungsadresse, E-Mail-Adresse,
              Telefonnummer (optional) und Zahlungsinformationen. Diese Daten
              werden ausschließlich zur Abwicklung Ihrer Bestellung und zur
              Erfüllung gesetzlicher Aufbewahrungspflichten verwendet.
            </p>
            <p className="mt-2">
              Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)
              und Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Verpflichtung).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              4. Cookies
            </h2>
            <p>
              Unsere Website verwendet technisch notwendige Cookies, die für
              den Betrieb der Seite erforderlich sind (z.&nbsp;B.
              Altersverifikation, Warenkorb-Funktionalität). Diese Cookies
              werden ohne gesonderte Einwilligung gesetzt, da sie für die
              Nutzung der Website unerlässlich sind.
            </p>
            <p className="mt-2">
              Analyse- oder Marketing-Cookies werden nur mit Ihrer
              ausdrücklichen Einwilligung gesetzt.
            </p>
          </section>

          {/* ENTWURF, noch nicht anwaltlich freigegeben (cookiefreie
              Reichweitenmessung, 3. Oktober 2026). Die zu pruefenden
              Stellen sind mit "ENTWURF -- ANWALT" markiert. Dieselbe
              Messung laeuft auf uncuttv.app und UncutTV Social; Technik:
              src/lib/visitor-stats.ts. */}
          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              5. Reichweitenmessung ohne Cookies
            </h2>
            {/* ENTWURF -- ANWALT: Neuer Abschnitt, insgesamt pruefen. GA4 und Meta Pixel (nur mit Einwilligung) sind in dieser Erklaerung bisher nicht einzeln beschrieben. */}
            <p>
              Wir zählen, wie viele Besucher unsere Seiten aufrufen, mit einer eigenen Messung, die ohne Cookies auskommt. Dabei speichern wir nichts auf Ihrem Gerät und lesen dort nichts aus – kein Cookie, kein lokaler Speicher. Die Messung läuft unabhängig vom Cookie-Banner. An Werbe- oder Analysedienste wie Meta oder Google geben wir diese Daten nicht weiter.
            </p>
            <p className="mt-2">
              Erfasst werden: die aufgerufene Seite und der Zeitpunkt des Aufrufs, die Website, von der Sie gekommen sind (Referrer), Kampagnenparameter aus der aufgerufenen Adresse (UTM-Parameter), das Land, aus dem der Aufruf kommt, Gerätetyp und Browser sowie – wenn Sie angemeldet sind – die Kennung Ihres Kundenkontos.
            </p>
            {/* ENTWURF -- ANWALT: Einordnung der Tageskennung (Hash aus IP-Adresse, User-Agent, Angebot und taeglich geloeschtem Zufallswert) -- anonym oder pseudonym? Es gibt keinen Zugriff auf das Endgeraet; nach unserer Sicht daher kein Fall des § 165 Abs. 3 TKG 2021. */}
            <p className="mt-2">
              Ihre IP-Adresse speichern wir für diese Messung nicht. Um Besucher eines Tages nur einmal zu zählen, bilden wir aus IP-Adresse, Browserkennung (User-Agent) und einem täglich wechselnden Zufallswert einen Hashwert (SHA-256). Den Zufallswert löschen wir nach Ablauf des Tages. Danach lässt sich der Hashwert weder auf Sie zurückführen noch mit Aufrufen an anderen Tagen verbinden.
            </p>
            {/* ENTWURF -- ANWALT: Zuordnung der Aufrufe zum Konto angemeldeter Nutzer ueber drei Angebote hinweg -- traegt Art. 6 Abs. 1 lit. f DSGVO, oder braucht es eine Einwilligung? */}
            <p className="mt-2">
              Sind Sie angemeldet, halten wir zusätzlich fest, an welchen Tagen Ihr Konto welches unserer Angebote genutzt hat – diesen Shop, die Streaming-Plattform auf uncuttv.app und UncutTV Social. So erkennen wir, wie viele Konten mehrere unserer Angebote nutzen. Ausgewertet wird das nur in zusammengefassten Zahlen, nicht für einzelne Personen.
            </p>
            {/* ENTWURF -- ANWALT: Speicherdauern pruefen (90 und 400 Tage sind technisch so gesetzt). Der Speicherort (Supabase als Auftragsverarbeiter) ist in dieser Erklaerung sonst nicht genannt. */}
            <p className="mt-2">
              Einzelne Seitenaufrufe löschen wir nach 90 Tagen. Die Angabe, an welchen Tagen ein Konto welches Angebot genutzt hat, löschen wir nach 400 Tagen. Dauerhaft bleiben nur zusammengefasste Tageszahlen ohne Personenbezug. Die Daten liegen in unserer Datenbank bei unserem Auftragsverarbeiter Supabase auf Servern in der EU.
            </p>
            {/* ENTWURF -- ANWALT: Rechtsgrundlage pruefen. Technisch offen: es gibt keinen Schalter fuer den Widerspruch (Opt-out); bei nicht angemeldeten Besuchern laesst er sich mangels Zuordnung nicht umsetzen, bei Konten nur von Hand. */}
            <p className="mt-2">
              Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse liegt darin, die Nutzung unserer Angebote zu messen und sie zu verbessern. Sie können dieser Verarbeitung jederzeit widersprechen (Art. 21 DSGVO); schreiben Sie dazu an office@uncuttv.at.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              6. Newsletter
            </h2>
            <p>
              Wenn Sie sich für unseren Newsletter anmelden, verwenden wir Ihre
              E-Mail-Adresse ausschließlich für den Versand von Informationen
              zu neuen Produkten, Angeboten und Neuigkeiten. Sie können sich
              jederzeit über den Abmeldelink in jeder E-Mail abmelden.
            </p>
            <p className="mt-2">
              Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              7. Weitergabe an Dritte
            </h2>
            <p>
              Eine Weitergabe personenbezogener Daten an Dritte erfolgt nur,
              soweit dies zur Vertragserfüllung erforderlich ist (z.&nbsp;B.
              Versanddienstleister, Zahlungsanbieter) oder eine gesetzliche
              Verpflichtung besteht.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              8. Speicherdauer
            </h2>
            <p>
              Personenbezogene Daten werden nur so lange gespeichert, wie dies
              für den jeweiligen Zweck erforderlich ist oder gesetzliche
              Aufbewahrungsfristen dies vorschreiben (z.&nbsp;B. 7 Jahre gemäß
              BAO für steuerrechtliche Unterlagen).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              9. Ihre Rechte
            </h2>
            <p>Sie haben das Recht auf:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Auskunft über Ihre gespeicherten Daten (Art. 15 DSGVO)</li>
              <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
              <li>Löschung Ihrer Daten (Art. 17 DSGVO)</li>
              <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
              <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
              <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
            </ul>
            <p className="mt-2">
              Anfragen richten Sie bitte an{" "}
              <a
                href="mailto:office@uncuttv.at"
                className="text-[#c0392b] hover:underline"
              >
                office@uncuttv.at
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              10. Beschwerderecht
            </h2>
            <p>
              Sie haben das Recht, sich bei der zuständigen Aufsichtsbehörde
              zu beschweren: Österreichische Datenschutzbehörde, Barichgasse
              40–42, 1030 Wien,{" "}
              <a
                href="https://www.dsb.gv.at"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#c0392b] hover:underline"
              >
                www.dsb.gv.at
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
