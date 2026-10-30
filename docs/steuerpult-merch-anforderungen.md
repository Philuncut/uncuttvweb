# Merkzettel: Was das Steuerpult bei Merch künftig können muss

Stand 31.10.2026, nach der Umstellung der sechs Halloween-Merch-Artikel
(Shirts und Hoodies, IDs 6545, 6544, 6576, 6543, 6542, 6539) auf variable
Produkte mit Größen durch den Shop (`scripts/merch-variabel-umstellen.mjs`).
Nur Notizen für die Weiterentwicklung des Steuerpults
(D:/UncutTV/Software/software/uncuttv-steuerpult), hier wurde nichts am
Steuerpult geändert.

## Wie die Artikel jetzt in WooCommerce liegen

- `type: variable`, globales Attribut "Größe" (`pa_groesse`, `variation: true`,
  `visible: true`), Optionen in der Reihenfolge der Begriffe (XS … 5XL).
- Je Größe eine Variante: `regular_price` wie das Elternprodukt (29,90 bzw.
  59,90), `manage_stock: false`, `stock_status: instock`, `status: publish`,
  **kein** `haendler_preis` an der Variante (der steht nur am Elternprodukt).
- Kategorien `merch` **und** `vorverkauf`; "Jetzt erhältlich!" ist entfernt.
- Meta `uncuttv_verkauf_bis = 2026-11-06T17:00:00Z` am Elternprodukt.
- **Kein** `uncuttv_angaben` mit `typ: "merch"` -- bewusst, damit das
  Steuerpult sie vorerst nicht als Merch öffnet (siehe unten, Punkt 3).

Der Shop (uncuttv.at) liest Größen, Preise und Lager direkt aus den
Varianten (`src/lib/varianten.ts`, `src/lib/shop-catalog.ts`) und prüft vor
jeder Zahlung frisch gegen WooCommerce (`src/lib/bestellpruefung.ts`).

## Was das Steuerpult können muss

### 1. Lagerverwaltung je Größe optional

Heute setzt `variantenRumpf` in `src/gemeinsam/merchKern.ts` immer
`manage_stock: true` mit `stock_quantity`, und `pruefeVarianten` meldet
"nicht verwaltet" als Fehler; das Formular verlangt vor dem Speichern einen
Bestand je Größe (`ShopMerchFormular.tsx`, "Bestand für Größe X").

Im Vorverkauf gibt es aber keinen Bestand: Die Größe ist bestellbar, solange
der Verkaufszeitraum läuft (`manage_stock: false`, `stock_status: instock`).
Der Shop behandelt genau diesen Zustand als bestellbar
(`istVarianteBestellbar` in `varianten.ts`).

Nötig: je Größe ein Schalter "Bestand führen" (ja/nein). Nein ->
`manage_stock: false`, `stock_status: instock` (oder `outofstock`, wenn die
Größe gesperrt werden soll), kein Bestandspflichtfeld. Ja -> wie bisher.
`pruefeVarianten` muss den unverwalteten Zustand als gewollt akzeptieren.

### 2. Mehrere Kategorien beibehalten statt eine zu überschreiben

`speichereMerch` in `shopKern.ts` schreibt `categories: [{ id: kategorieId }]`
und löscht damit alle anderen Kategorien des Produkts. Merch steht aber
zugleich in `merch` und `vorverkauf`, und der Shop zeigt den Artikel in
beiden (Filterknopf Merch und Abschnitt "Jetzt vorbestellen").

Nötig: Kategorien als Mehrfachauswahl im Formular, oder beim Speichern die
vorhandenen Kategorien des Produkts lesen und nur die Merch-Hauptkategorie
sicherstellen, ohne die übrigen zu entfernen. Gleiches gilt sinngemäß für
`speichereProdukt` (Filme), falls dort je eine zweite Kategorie gebraucht wird.

### 3. Bestehende variable Produkte ohne uncuttv_angaben übernehmen

Das Steuerpult erkennt Merch nur über `uncuttv_angaben` mit `typ: "merch"`
(`typAusAngaben`, `liesMerchAngaben`). Ein variables Produkt ohne dieses
Meta gilt als "unbekannt" und lässt sich nicht öffnen -- so wie jetzt die
sechs umgestellten Artikel.

Nötig: Ein Produkt mit `type: variable` und Attribut `pa_groesse` als Merch
behandeln, auch ohne Angaben; beim ersten Öffnen die Felder aus WooCommerce
vorbelegen (Name, Beschreibung, `regular_price` der Varianten als Grundpreis,
`haendler_preis` vom Elternprodukt, Kategorien, Verkaufszeitraum) und
`uncuttv_angaben` erst beim ersten Speichern schreiben. Dabei Punkt 1 und 2
beachten: unverwaltete Varianten dürfen nicht auf Bestand 0 fallen, die
Kategorien dürfen nicht auf eine zusammenschrumpfen.

### Außerdem aufgefallen

- `haendler_preis` an Varianten: Das Steuerpult schreibt ihn je Variante, der
  Shop liest ihn (Variante vor Produkt), verkauft Merch aber nie an Händler
  (`haendler-filter.ts`, `bestellpruefung.ts`). Für Merch kann der Händlerpreis
  entfallen oder leer bleiben.
- Der Shop zeigt den Verkaufszeitraum als "AB TT.MM." bzw. "NICHT MEHR
  ERHÄLTLICH" (Wiener Zeit) und prüft ihn vor der Zahlung noch einmal; das
  WordPress-Snippet `verkaufszeitraum.php` bleibt die Regel dafür.
