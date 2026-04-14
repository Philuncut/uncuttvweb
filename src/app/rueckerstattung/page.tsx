import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Rückerstattung & Rückgabe — UNCUTTV",
};

export default function RueckerstattungPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="border-l-4 border-[#c0392b] pl-4 text-lg font-black text-white sm:text-2xl sm:tracking-[0.1em] md:text-3xl md:tracking-[0.15em]">
          RÜCKERSTATTUNG &amp; RÜCKGABE
        </h1>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-white/70">
          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              1. Widerrufsrecht
            </h2>
            <p>
              Sie haben das Recht, binnen 14 Tagen ohne Angabe von Gründen
              diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt 14 Tage
              ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der
              nicht der Beförderer ist, die Waren in Besitz genommen haben.
            </p>
            <p className="mt-2">
              Um Ihr Widerrufsrecht auszuüben, müssen Sie uns mittels einer
              eindeutigen Erklärung (z.&nbsp;B. E-Mail) über Ihren Entschluss,
              diesen Vertrag zu widerrufen, informieren:
            </p>
            <p className="mt-2">
              UncutTV GmbH, Kalchgruben 4/11, 6094 Axams, Österreich
              <br />
              E-Mail:{" "}
              <a
                href="mailto:office@uncuttv.at"
                className="text-[#c0392b] hover:underline"
              >
                office@uncuttv.at
              </a>
            </p>
            <p className="mt-2">
              Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die
              Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der
              Widerrufsfrist absenden.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              2. Folgen des Widerrufs
            </h2>
            <p>
              Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle
              Zahlungen, die wir von Ihnen erhalten haben, einschließlich der
              Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich
              daraus ergeben, dass Sie eine andere Art der Lieferung als die
              von uns angebotene, günstigste Standardlieferung gewählt haben),
              unverzüglich und spätestens binnen 14 Tagen ab dem Tag
              zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses
              Vertrags bei uns eingegangen ist.
            </p>
            <p className="mt-2">
              Für die Rückzahlung verwenden wir dasselbe Zahlungsmittel, das
              Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei
              denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart. In
              keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte
              berechnet.
            </p>
            <p className="mt-2">
              Wir können die Rückzahlung verweigern, bis wir die Waren wieder
              zurückerhalten haben oder bis Sie den Nachweis erbracht haben,
              dass Sie die Waren zurückgesandt haben, je nachdem, welches der
              frühere Zeitpunkt ist.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              3. Rücksendung
            </h2>
            <p>
              Sie haben die Waren unverzüglich und in jedem Fall spätestens
              binnen 14 Tagen ab dem Tag, an dem Sie uns über den Widerruf
              dieses Vertrags unterrichten, an uns zurückzusenden oder zu
              übergeben. Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf
              der Frist von 14 Tagen absenden.
            </p>
            <p className="mt-2">
              Sie tragen die unmittelbaren Kosten der Rücksendung der Waren.
            </p>
            <p className="mt-2">
              Sie müssen für einen etwaigen Wertverlust der Waren nur
              aufkommen, wenn dieser Wertverlust auf einen zur Prüfung der
              Beschaffenheit, Eigenschaften und Funktionsweise der Waren nicht
              notwendigen Umgang mit ihnen zurückzuführen ist.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              4. Ausschluss des Widerrufsrechts
            </h2>
            <p>
              Das Widerrufsrecht besteht nicht bei Verträgen zur Lieferung
              versiegelter Waren (z.&nbsp;B. Blu-rays, DVDs), die aus Gründen
              des Gesundheitsschutzes oder der Hygiene nicht zur Rückgabe
              geeignet sind, wenn ihre Versiegelung nach der Lieferung
              entfernt wurde.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              5. Beschädigte oder fehlerhafte Ware
            </h2>
            <p>
              Sollten Sie eine beschädigte oder fehlerhafte Ware erhalten,
              kontaktieren Sie uns bitte umgehend unter{" "}
              <a
                href="mailto:office@uncuttv.at"
                className="text-[#c0392b] hover:underline"
              >
                office@uncuttv.at
              </a>{" "}
              mit einer Beschreibung des Problems und Fotos. Wir werden uns
              schnellstmöglich um eine Lösung bemühen (Ersatzlieferung oder
              Rückerstattung).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              6. Kontakt
            </h2>
            <p>
              Bei Fragen zu Rücksendungen und Erstattungen wenden Sie sich
              bitte an:
            </p>
            <p className="mt-2">
              UncutTV GmbH
              <br />
              Kalchgruben 4/11, 6094 Axams, Österreich
              <br />
              E-Mail:{" "}
              <a
                href="mailto:office@uncuttv.at"
                className="text-[#c0392b] hover:underline"
              >
                office@uncuttv.at
              </a>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
