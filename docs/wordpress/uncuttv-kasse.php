<?php
/**
 * UncutTV Kasse: Suche und Sperre je Zahlung (Stand 1) und Reservierung für
 * Einzelstücke (Stand 2, weiter unten). November 2026.
 *
 * Warum: Der Shop (Next.js) legt Bestellungen über die WooCommerce-REST-
 * Schnittstelle an. Diese kann Bestellungen nicht nach Zahlungsreferenz
 * oder Meta-Feld filtern (der Parameter meta_key wird ignoriert, es kommen
 * einfach die neuesten 20 zurück). Deshalb entstanden zu einer PayPal-
 * Zahlung mehrere Bestellungen, wenn der Browser den Auftrag wiederholte.
 *
 * Was dieses Snippet tut:
 *   1. Dichte Suche: Gibt es zu einer Zahlung (pi_… / paypal_…) oder zu
 *      einem Kassenvorgang (kasse_…) schon eine Bestellung? Gesucht wird
 *      direkt in der Datenbank über transaction_id und über die Meta-Felder
 *      _uncuttv_payment_ref, _stripe_pi_id, _paypal_order_id und
 *      _uncuttv_checkout_key, nicht über "die letzten 20".
 *   2. Sperre: Eine Tabelle mit eindeutigem Schlüssel. Von zwei
 *      gleichzeitigen Aufrufen zur selben Zahlung bekommt genau einer die
 *      Sperre und darf die Bestellung anlegen; der andere erfährt, dass
 *      gerade jemand anlegt oder welche Bestellung schon da ist.
 *
 * Routen (Anmeldung wie die WooCommerce-REST-Schnittstelle, also mit dem
 * vorhandenen Consumer Key/Secret des Shops; der Namensraum beginnt dafür
 * absichtlich mit "wc-"):
 *
 *   POST /wp-json/wc-uncuttv/v1/zahlung/belegen
 *        { "schluessel": ["paypal_…", "kasse_…"], "nur_suchen": false }
 *        -> { "zustand": "vorhanden", "order_id", "number", "status",
 *             "transaction_id", "treffer": "<Schlüssel>" }
 *        -> { "zustand": "frei", "token": "…" }      (Sperre genommen)
 *        -> { "zustand": "frei" }                     (bei nur_suchen)
 *        -> { "zustand": "in_arbeit" }                (jemand legt gerade an)
 *   POST /wp-json/wc-uncuttv/v1/zahlung/bestaetigen  { "token", "order_id" }
 *   POST /wp-json/wc-uncuttv/v1/zahlung/freigeben    { "token" }
 *   GET  /wp-json/wc-uncuttv/v1/status[?ref=paypal_…]
 *
 * Einspielen: WordPress → Code Snippets (WPCode) → Add New → PHP Snippet,
 * Name "UncutTV Kasse: Suche und Sperre", Location "Run Everywhere",
 * aktivieren. Die Tabelle legt das Snippet beim ersten Aufruf selbst an.
 * Ausführliche Anleitung: docs/wordpress/WPCODE_SNIPPETS.md.
 */

defined('ABSPATH') || exit;

if (!function_exists('uncuttv_kasse_tabelle')) {

    /** Sperre ohne Bestellung gilt nach so vielen Sekunden als liegen geblieben. */
    if (!defined('UNCUTTV_KASSE_UEBERNAHME_SEK')) {
        define('UNCUTTV_KASSE_UEBERNAHME_SEK', 300);
    }
    /** Ein Kassenvorgang (kasse_…) zählt nur so viele Stunden als "derselbe Einkauf". */
    if (!defined('UNCUTTV_KASSE_VORGANG_STD')) {
        define('UNCUTTV_KASSE_VORGANG_STD', 24);
    }
    if (!defined('UNCUTTV_KASSE_STAND')) {
        define('UNCUTTV_KASSE_STAND', '1');
    }

    function uncuttv_kasse_tabelle() {
        global $wpdb;
        return $wpdb->prefix . 'uncuttv_zahlung_sperre';
    }

    /** Legt die Tabelle an, falls sie fehlt. Liefert true, wenn sie da ist. */
    function uncuttv_kasse_installiere() {
        global $wpdb;
        if (get_option('uncuttv_kasse_db') === UNCUTTV_KASSE_STAND) {
            return true;
        }
        $tabelle = uncuttv_kasse_tabelle();
        $zeichen = $wpdb->get_charset_collate();
        // schluessel ist der Primärschlüssel: Die Datenbank selbst verhindert,
        // dass zwei Aufrufe denselben Schlüssel belegen.
        $wpdb->query(
            "CREATE TABLE IF NOT EXISTS {$tabelle} (
                schluessel varchar(191) NOT NULL,
                token char(32) NOT NULL,
                order_id bigint(20) unsigned NOT NULL DEFAULT 0,
                erstellt datetime NOT NULL,
                PRIMARY KEY (schluessel),
                KEY token (token)
            ) {$zeichen}"
        );
        $da = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $tabelle)) === $tabelle;
        if ($da) {
            update_option('uncuttv_kasse_db', UNCUTTV_KASSE_STAND, false);
        }
        return $da;
    }

    function uncuttv_kasse_hpos() {
        return class_exists('\Automattic\WooCommerce\Utilities\OrderUtil')
            && \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled();
    }

    function uncuttv_kasse_darf() {
        return current_user_can('manage_woocommerce') || current_user_can('publish_shop_orders');
    }

    /** Nur saubere Schlüssel: pi_…, paypal_…, kasse_…; höchstens vier. */
    function uncuttv_kasse_schluessel($roh) {
        if (!is_array($roh)) {
            return array();
        }
        $sauber = array();
        foreach ($roh as $k) {
            if (!is_string($k)) {
                continue;
            }
            $k = trim($k);
            if (preg_match('/^(pi|paypal|kasse)_[A-Za-z0-9_]{6,180}$/', $k)) {
                $sauber[$k] = true;
            }
        }
        return array_slice(array_keys($sauber), 0, 4);
    }

    function uncuttv_kasse_ist_vorgang($schluessel) {
        return strpos($schluessel, 'kasse_') === 0;
    }

    /**
     * Bestellnummern zu einer Zahlungsreferenz: Spalte transaction_id und die
     * Meta-Felder, in denen der Shop die Referenz ablegt.
     */
    function uncuttv_kasse_ids_zur_referenz($ref) {
        global $wpdb;
        $ids = array();
        $meta_keys = array('_uncuttv_payment_ref');
        $meta_wert = $ref;
        if (strpos($ref, 'pi_') === 0) {
            $meta_keys[] = '_stripe_pi_id';
        }
        $paypal_id = strpos($ref, 'paypal_') === 0 ? substr($ref, 7) : '';

        if (uncuttv_kasse_hpos()) {
            $o = $wpdb->prefix . 'wc_orders';
            $m = $wpdb->prefix . 'wc_orders_meta';
            $ids = $wpdb->get_col($wpdb->prepare(
                "SELECT id FROM {$o} WHERE type = 'shop_order' AND status <> 'trash'
                 AND transaction_id = %s ORDER BY id ASC LIMIT 20",
                $ref
            ));
            foreach ($meta_keys as $mk) {
                $ids = array_merge($ids, $wpdb->get_col($wpdb->prepare(
                    "SELECT o.id FROM {$o} o JOIN {$m} m ON m.order_id = o.id
                     WHERE o.type = 'shop_order' AND o.status <> 'trash'
                     AND m.meta_key = %s AND m.meta_value = %s ORDER BY o.id ASC LIMIT 20",
                    $mk,
                    $meta_wert
                )));
            }
            if ($paypal_id !== '') {
                $ids = array_merge($ids, $wpdb->get_col($wpdb->prepare(
                    "SELECT o.id FROM {$o} o JOIN {$m} m ON m.order_id = o.id
                     WHERE o.type = 'shop_order' AND o.status <> 'trash'
                     AND m.meta_key = '_paypal_order_id' AND m.meta_value = %s ORDER BY o.id ASC LIMIT 20",
                    $paypal_id
                )));
            }
        } else {
            $meta_keys[] = '_transaction_id';
            foreach ($meta_keys as $mk) {
                $ids = array_merge($ids, $wpdb->get_col($wpdb->prepare(
                    "SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id = p.ID
                     WHERE p.post_type = 'shop_order' AND p.post_status <> 'trash'
                     AND m.meta_key = %s AND m.meta_value = %s ORDER BY p.ID ASC LIMIT 20",
                    $mk,
                    $meta_wert
                )));
            }
            if ($paypal_id !== '') {
                $ids = array_merge($ids, $wpdb->get_col($wpdb->prepare(
                    "SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id = p.ID
                     WHERE p.post_type = 'shop_order' AND p.post_status <> 'trash'
                     AND m.meta_key = '_paypal_order_id' AND m.meta_value = %s ORDER BY p.ID ASC LIMIT 20",
                    $paypal_id
                )));
            }
        }
        return array_values(array_unique(array_map('intval', $ids)));
    }

    /** Bestellnummern zu einem Kassenvorgang, nur aus den letzten Stunden. */
    function uncuttv_kasse_ids_zum_vorgang($schluessel) {
        global $wpdb;
        $std = (int) UNCUTTV_KASSE_VORGANG_STD;
        if (uncuttv_kasse_hpos()) {
            $o = $wpdb->prefix . 'wc_orders';
            $m = $wpdb->prefix . 'wc_orders_meta';
            $ids = $wpdb->get_col($wpdb->prepare(
                "SELECT o.id FROM {$o} o JOIN {$m} m ON m.order_id = o.id
                 WHERE o.type = 'shop_order' AND o.status <> 'trash'
                 AND m.meta_key = '_uncuttv_checkout_key' AND m.meta_value = %s
                 AND o.date_created_gmt > (UTC_TIMESTAMP() - INTERVAL {$std} HOUR)
                 ORDER BY o.id ASC LIMIT 20",
                $schluessel
            ));
        } else {
            $ids = $wpdb->get_col($wpdb->prepare(
                "SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id = p.ID
                 WHERE p.post_type = 'shop_order' AND p.post_status <> 'trash'
                 AND m.meta_key = '_uncuttv_checkout_key' AND m.meta_value = %s
                 AND p.post_date_gmt > (UTC_TIMESTAMP() - INTERVAL {$std} HOUR)
                 ORDER BY p.ID ASC LIMIT 20",
                $schluessel
            ));
        }
        return array_values(array_unique(array_map('intval', $ids)));
    }

    /**
     * Aus mehreren Bestellungen die maßgebliche: zuerst eine bezahlte oder
     * wartende, sonst eine offene, sonst die älteste.
     */
    function uncuttv_kasse_waehle($ids) {
        $rang = array(
            'processing' => 0,
            'completed'  => 0,
            'on-hold'    => 1,
            'pending'    => 2,
        );
        $beste = null;
        $bester_rang = 99;
        foreach ($ids as $id) {
            $order = wc_get_order($id);
            if (!$order || !is_a($order, 'WC_Order') || $order->get_type() !== 'shop_order') {
                continue;
            }
            $status = $order->get_status();
            if ($status === 'trash') {
                continue;
            }
            $r = isset($rang[$status]) ? $rang[$status] : 3;
            if ($r < $bester_rang) {
                $bester_rang = $r;
                $beste = $order;
            }
        }
        return $beste;
    }

    function uncuttv_kasse_antwort_vorhanden($order, $treffer) {
        return array(
            'zustand'        => 'vorhanden',
            'order_id'       => (int) $order->get_id(),
            'number'         => (string) $order->get_order_number(),
            'status'         => (string) $order->get_status(),
            'transaction_id' => (string) $order->get_transaction_id(),
            'treffer'        => (string) $treffer,
        );
    }

    /**
     * Gibt es zu einem der Schlüssel schon eine Bestellung? Zahlungs-
     * referenzen haben Vorrang vor dem Kassenvorgang.
     */
    function uncuttv_kasse_finde($schluessel) {
        global $wpdb;
        $tabelle = uncuttv_kasse_tabelle();
        $std = (int) UNCUTTV_KASSE_VORGANG_STD;

        usort($schluessel, function ($a, $b) {
            return (int) uncuttv_kasse_ist_vorgang($a) - (int) uncuttv_kasse_ist_vorgang($b);
        });

        foreach ($schluessel as $k) {
            $ids = array();
            // 1. Sperrtabelle: dort trägt der Shop die Bestellnummer ein.
            if (uncuttv_kasse_ist_vorgang($k)) {
                $id = (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT order_id FROM {$tabelle} WHERE schluessel = %s AND order_id > 0
                     AND erstellt > (UTC_TIMESTAMP() - INTERVAL {$std} HOUR)",
                    $k
                ));
            } else {
                $id = (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT order_id FROM {$tabelle} WHERE schluessel = %s AND order_id > 0",
                    $k
                ));
            }
            if ($id > 0) {
                $ids[] = $id;
            }
            // 2. Die Bestellungen selbst (auch solche aus der Zeit vor der Sperre,
            //    und solche, bei denen die Bestätigung der Sperre verloren ging).
            $ids = array_merge(
                $ids,
                uncuttv_kasse_ist_vorgang($k)
                    ? uncuttv_kasse_ids_zum_vorgang($k)
                    : uncuttv_kasse_ids_zur_referenz($k)
            );
            $order = uncuttv_kasse_waehle(array_values(array_unique($ids)));
            if ($order) {
                return uncuttv_kasse_antwort_vorhanden($order, $k);
            }
        }
        return null;
    }

    function uncuttv_kasse_fehler($code, $text, $status) {
        return new WP_Error($code, $text, array('status' => $status));
    }

    function uncuttv_kasse_belegen($request) {
        global $wpdb;
        if (!uncuttv_kasse_installiere()) {
            return uncuttv_kasse_fehler('uncuttv_tabelle', 'Sperrtabelle fehlt.', 500);
        }
        $schluessel = uncuttv_kasse_schluessel($request->get_param('schluessel'));
        if (empty($schluessel)) {
            return uncuttv_kasse_fehler('uncuttv_schluessel', 'Kein gültiger Schlüssel.', 400);
        }
        $nur_suchen = (bool) $request->get_param('nur_suchen');
        $tabelle = uncuttv_kasse_tabelle();
        $std = (int) UNCUTTV_KASSE_VORGANG_STD;
        $sek = (int) UNCUTTV_KASSE_UEBERNAHME_SEK;

        $vorhanden = uncuttv_kasse_finde($schluessel);
        if ($vorhanden) {
            return rest_ensure_response($vorhanden);
        }
        if ($nur_suchen) {
            return rest_ensure_response(array('zustand' => 'frei'));
        }

        // Abgelaufene Kassenvorgänge räumen, damit ihr Schlüssel wieder frei ist.
        $wpdb->query(
            "DELETE FROM {$tabelle} WHERE schluessel LIKE 'kasse\\_%'
             AND erstellt < (UTC_TIMESTAMP() - INTERVAL {$std} HOUR)"
        );

        $token = bin2hex(random_bytes(16));
        foreach ($schluessel as $k) {
            // INSERT IGNORE auf den Primärschlüssel: Genau ein Aufruf bekommt 1.
            $neu = $wpdb->query($wpdb->prepare(
                "INSERT IGNORE INTO {$tabelle} (schluessel, token, order_id, erstellt)
                 VALUES (%s, %s, 0, UTC_TIMESTAMP())",
                $k,
                $token
            ));
            if ($neu === false) {
                $wpdb->query($wpdb->prepare(
                    "DELETE FROM {$tabelle} WHERE token = %s AND order_id = 0",
                    $token
                ));
                return uncuttv_kasse_fehler('uncuttv_db', 'Sperre konnte nicht geschrieben werden.', 500);
            }
            if ((int) $neu === 1) {
                continue;
            }
            // Belegt. Liegt die Sperre seit Minuten ohne Bestellung, übernehmen
            // (der erste Aufruf ist abgebrochen); auch das ist ein einzelner,
            // bedingter Schreibzugriff, den nur einer gewinnt.
            $uebernommen = $wpdb->query($wpdb->prepare(
                "UPDATE {$tabelle} SET token = %s, erstellt = UTC_TIMESTAMP()
                 WHERE schluessel = %s AND order_id = 0
                 AND erstellt < (UTC_TIMESTAMP() - INTERVAL {$sek} SECOND)",
                $token,
                $k
            ));
            if ((int) $uebernommen === 1) {
                continue;
            }
            // Jemand anderes legt gerade an, oder ist inzwischen fertig.
            $wpdb->query($wpdb->prepare(
                "DELETE FROM {$tabelle} WHERE token = %s AND order_id = 0",
                $token
            ));
            $vorhanden = uncuttv_kasse_finde($schluessel);
            if ($vorhanden) {
                return rest_ensure_response($vorhanden);
            }
            return rest_ensure_response(array('zustand' => 'in_arbeit', 'schluessel' => $k));
        }

        // Zwischen Suche und Sperre kann eine Bestellung fertig geworden sein.
        $vorhanden = uncuttv_kasse_finde($schluessel);
        if ($vorhanden) {
            $wpdb->query($wpdb->prepare(
                "DELETE FROM {$tabelle} WHERE token = %s AND order_id = 0",
                $token
            ));
            return rest_ensure_response($vorhanden);
        }
        return rest_ensure_response(array('zustand' => 'frei', 'token' => $token));
    }

    function uncuttv_kasse_token($request) {
        $token = (string) $request->get_param('token');
        return preg_match('/^[a-f0-9]{32}$/', $token) ? $token : '';
    }

    function uncuttv_kasse_bestaetigen($request) {
        global $wpdb;
        $token = uncuttv_kasse_token($request);
        $order_id = (int) $request->get_param('order_id');
        if ($token === '' || $order_id <= 0) {
            return uncuttv_kasse_fehler('uncuttv_eingabe', 'token und order_id nötig.', 400);
        }
        $n = $wpdb->query($wpdb->prepare(
            'UPDATE ' . uncuttv_kasse_tabelle() . ' SET order_id = %d WHERE token = %s AND order_id = 0',
            $order_id,
            $token
        ));
        return rest_ensure_response(array('ok' => $n !== false, 'zeilen' => (int) $n));
    }

    function uncuttv_kasse_freigeben($request) {
        global $wpdb;
        $token = uncuttv_kasse_token($request);
        if ($token === '') {
            return uncuttv_kasse_fehler('uncuttv_eingabe', 'token nötig.', 400);
        }
        $n = $wpdb->query($wpdb->prepare(
            'DELETE FROM ' . uncuttv_kasse_tabelle() . ' WHERE token = %s AND order_id = 0',
            $token
        ));
        return rest_ensure_response(array('ok' => $n !== false, 'zeilen' => (int) $n));
    }

    /** Selbstauskunft; mit ?ref=paypal_… zusätzlich eine Probesuche (nur lesend). */
    function uncuttv_kasse_status($request) {
        global $wpdb;
        $da = uncuttv_kasse_installiere();
        $tabelle = uncuttv_kasse_tabelle();
        $antwort = array(
            'stand'    => UNCUTTV_KASSE_STAND,
            'tabelle'  => $da,
            'hpos'     => uncuttv_kasse_hpos(),
            'sperren'  => $da ? (int) $wpdb->get_var("SELECT COUNT(*) FROM {$tabelle}") : 0,
            'offen'    => $da ? (int) $wpdb->get_var("SELECT COUNT(*) FROM {$tabelle} WHERE order_id = 0") : 0,
        );
        $ref = uncuttv_kasse_schluessel(array((string) $request->get_param('ref')));
        if (!empty($ref)) {
            $treffer = uncuttv_kasse_finde($ref);
            $antwort['suche'] = $treffer ? $treffer : array('zustand' => 'frei');
        }
        return rest_ensure_response($antwort);
    }

    add_action('rest_api_init', function () {
        $ns = 'wc-uncuttv/v1';
        register_rest_route($ns, '/zahlung/belegen', array(
            'methods'             => 'POST',
            'callback'            => 'uncuttv_kasse_belegen',
            'permission_callback' => 'uncuttv_kasse_darf',
        ));
        register_rest_route($ns, '/zahlung/bestaetigen', array(
            'methods'             => 'POST',
            'callback'            => 'uncuttv_kasse_bestaetigen',
            'permission_callback' => 'uncuttv_kasse_darf',
        ));
        register_rest_route($ns, '/zahlung/freigeben', array(
            'methods'             => 'POST',
            'callback'            => 'uncuttv_kasse_freigeben',
            'permission_callback' => 'uncuttv_kasse_darf',
        ));
        register_rest_route($ns, '/status', array(
            'methods'             => 'GET',
            'callback'            => 'uncuttv_kasse_status',
            'permission_callback' => 'uncuttv_kasse_darf',
        ));
    });
}

/* ======================================================================
 * Stand 2: Reservierung für Einzelstücke
 * ======================================================================
 *
 * Warum: Einzelstücke (Bestand 1) wurden doppelt verkauft. Kunde A hatte
 * das Bild im Warenkorb, Kunde B kaufte es, danach konnte A trotzdem noch
 * bezahlen, weil zwischen Laden der Kasse und Zahlung niemand den Bestand
 * festhielt.
 *
 * Was hier passiert:
 *   - Gilt NUR für Produkte mit dem Schlagwort "einzelstueck" und
 *     Lagerverwaltung. Alle anderen Positionen werden übersprungen.
 *   - Reservieren bucht den Bestand sofort ab, mit EINER bedingten
 *     SQL-Anweisung ("nur wenn Bestand >= Menge"). Von zwei gleichzeitigen
 *     Käufern gewinnt genau einer; der andere bekommt "ausverkauft".
 *   - Ohne Bestellung läuft die Reservierung ab (Vorgabe 15 Minuten) und
 *     der Bestand kommt zurück.
 *   - Entsteht die Bestellung, übernimmt sie die Reservierung: Die Position
 *     bekommt das WooCommerce-Kennzeichen _reduced_stock, dadurch bucht
 *     WooCommerce NICHT ein zweites Mal ab und bucht bei Storno oder
 *     Erstattung wie gewohnt zurück.
 *   - Vorkasse bindet den Bestand ebenfalls sofort. Ist die Bestellung nach
 *     UNCUTTV_RES_VORKASSE_STD Stunden noch unbezahlt, wird sie storniert
 *     und der Bestand kommt zurück.
 *
 * Routen:
 *   POST /wp-json/wc-uncuttv/v1/reservierung/nehmen
 *        { "schluessel": "pi_…|rk_…|bank_…", "minuten": 15,
 *          "positionen": [ { "product_id", "variation_id", "qty" } ] }
 *        -> { "ok": true, "reserviert": 1 }
 *        -> { "ok": false, "ausverkauft": [ { "product_id", "variation_id", "name" } ] }
 *   POST /wp-json/wc-uncuttv/v1/reservierung/freigeben  { "schluessel" }
 *   POST /wp-json/wc-uncuttv/v1/reservierung/aufraeumen (Ablauf; ruft der Shop alle 5 Minuten)
 *   GET  /wp-json/wc-uncuttv/v1/reservierung/status
 */

if (!function_exists('uncuttv_res_tabelle')) {

    /** Schlagwort (Slug), das ein Produkt zum Einzelstück macht. */
    if (!defined('UNCUTTV_RES_SCHLAGWORT')) {
        define('UNCUTTV_RES_SCHLAGWORT', 'einzelstueck');
    }
    /**
     * Vorkasse: So viele Stunden bleibt der Bestand für eine unbezahlte
     * Vorkasse-Bestellung gebunden. Danach wird sie storniert.
     * HIER SELBST SETZEN.
     */
    if (!defined('UNCUTTV_RES_VORKASSE_STD')) {
        define('UNCUTTV_RES_VORKASSE_STD', 168);
    }
    /** Vorgabe in Minuten, wenn der Shop keine Dauer mitschickt. */
    if (!defined('UNCUTTV_RES_MINUTEN')) {
        define('UNCUTTV_RES_MINUTEN', 15);
    }
    if (!defined('UNCUTTV_RES_STAND')) {
        define('UNCUTTV_RES_STAND', '2');
    }

    function uncuttv_res_tabelle() {
        global $wpdb;
        return $wpdb->prefix . 'uncuttv_reservierung';
    }

    function uncuttv_res_installiere() {
        global $wpdb;
        if (get_option('uncuttv_res_db') === UNCUTTV_RES_STAND) {
            return true;
        }
        $tabelle = uncuttv_res_tabelle();
        $zeichen = $wpdb->get_charset_collate();
        // status: offen (reserviert, keine Bestellung), bestellt (Bestellung da,
        // noch nicht bezahlt), verbraucht (gehört endgültig zur Bestellung),
        // frei (zurückgebucht).
        $wpdb->query(
            "CREATE TABLE IF NOT EXISTS {$tabelle} (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                schluessel varchar(191) NOT NULL,
                lager_id bigint(20) unsigned NOT NULL,
                product_id bigint(20) unsigned NOT NULL,
                variation_id bigint(20) unsigned NOT NULL DEFAULT 0,
                menge int(11) NOT NULL,
                status varchar(12) NOT NULL DEFAULT 'offen',
                order_id bigint(20) unsigned NOT NULL DEFAULT 0,
                erstellt datetime NOT NULL,
                ablauf datetime NOT NULL,
                PRIMARY KEY (id),
                KEY schluessel (schluessel),
                KEY status_ablauf (status, ablauf),
                KEY order_id (order_id)
            ) {$zeichen}"
        );
        $da = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $tabelle)) === $tabelle;
        if ($da) {
            update_option('uncuttv_res_db', UNCUTTV_RES_STAND, false);
        }
        return $da;
    }

    function uncuttv_res_darf() {
        return current_user_can('manage_woocommerce') || current_user_can('publish_shop_orders');
    }

    function uncuttv_res_schluessel($roh) {
        $k = is_string($roh) ? trim($roh) : '';
        return preg_match('/^(pi|rk|bank)_[A-Za-z0-9_]{6,180}$/', $k) ? $k : '';
    }

    /**
     * Ist die Position ein Einzelstück mit Lagerverwaltung? Liefert die ID,
     * an der der Bestand hängt (Produkt oder Variante), sonst 0.
     */
    function uncuttv_res_lager_id($product) {
        if (!$product || !is_a($product, 'WC_Product')) {
            return 0;
        }
        $eltern = $product->get_parent_id() ? $product->get_parent_id() : $product->get_id();
        if (!has_term(UNCUTTV_RES_SCHLAGWORT, 'product_tag', $eltern)) {
            return 0;
        }
        if (!$product->managing_stock()) {
            return 0;
        }
        return (int) $product->get_stock_managed_by_id();
    }

    /** Bestand direkt aus der Datenbank, am Cache vorbei. */
    function uncuttv_res_bestand($lager_id) {
        global $wpdb;
        $wert = $wpdb->get_var($wpdb->prepare(
            "SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = '_stock' LIMIT 1",
            $lager_id
        ));
        return $wert === null ? null : (int) floor((float) $wert);
    }

    /**
     * Nach einer direkten Bestandsänderung: Cache leeren und den Lagerstatus
     * ("vorrätig" / "ausverkauft") über WooCommerce nachziehen.
     */
    function uncuttv_res_gleiche_ab($lager_id) {
        wp_cache_delete($lager_id, 'post_meta');
        if (function_exists('wc_delete_product_transients')) {
            wc_delete_product_transients($lager_id);
        }
        $product = wc_get_product($lager_id);
        if (!$product) {
            return;
        }
        $bestand = uncuttv_res_bestand($lager_id);
        if ($bestand === null) {
            return;
        }
        $schwelle = (int) get_option('woocommerce_notify_no_stock_amount', 0);
        if ($bestand > $schwelle) {
            $soll = 'instock';
        } else {
            $soll = $product->backorders_allowed() ? 'onbackorder' : 'outofstock';
        }
        if ($product->get_stock_status() !== $soll) {
            wc_update_product_stock_status($lager_id, $soll);
        }
    }

    /**
     * Der Kern: eine einzige bedingte Anweisung. Sie ändert genau dann eine
     * Zeile, wenn der Bestand reicht. Zwei gleichzeitige Aufrufe können
     * nicht beide 1 zurückbekommen.
     */
    function uncuttv_res_buche_ab($lager_id, $menge) {
        global $wpdb;
        $n = $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->postmeta} SET meta_value = meta_value - %d
             WHERE post_id = %d AND meta_key = '_stock'
             AND CAST(meta_value AS SIGNED) >= %d",
            $menge,
            $lager_id,
            $menge
        ));
        return (int) $n === 1;
    }

    function uncuttv_res_buche_zurueck($lager_id, $menge) {
        global $wpdb;
        $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->postmeta} SET meta_value = meta_value + %d
             WHERE post_id = %d AND meta_key = '_stock'",
            $menge,
            $lager_id
        ));
        uncuttv_res_gleiche_ab($lager_id);
    }

    /**
     * Eine Reservierungszeile freigeben. Der Statuswechsel ist bedingt, damit
     * zwei gleichzeitige Freigaben den Bestand nicht doppelt zurückbuchen.
     */
    function uncuttv_res_gib_zeile_frei($zeile, $von_status) {
        global $wpdb;
        $n = $wpdb->query($wpdb->prepare(
            'UPDATE ' . uncuttv_res_tabelle() . " SET status = 'frei' WHERE id = %d AND status = %s",
            (int) $zeile->id,
            $von_status
        ));
        if ((int) $n !== 1) {
            return false;
        }
        uncuttv_res_buche_zurueck((int) $zeile->lager_id, (int) $zeile->menge);
        return true;
    }

    function uncuttv_res_zeilen($schluessel, $status_liste) {
        global $wpdb;
        $platzhalter = implode(',', array_fill(0, count($status_liste), '%s'));
        $args = array_merge(array($schluessel), $status_liste);
        return $wpdb->get_results($wpdb->prepare(
            'SELECT * FROM ' . uncuttv_res_tabelle() . " WHERE schluessel = %s AND status IN ({$platzhalter}) ORDER BY id ASC",
            $args
        ));
    }

    /** Abgelaufene Reservierungen zurückbuchen; unbezahlte Vorkasse stornieren. */
    function uncuttv_res_aufraeumen($grenze = 50) {
        global $wpdb;
        if (!uncuttv_res_installiere()) {
            return array('frei' => 0, 'storniert' => 0, 'verbraucht' => 0);
        }
        $tabelle = uncuttv_res_tabelle();
        $zeilen = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$tabelle} WHERE status IN ('offen','bestellt')
             AND ablauf < UTC_TIMESTAMP() ORDER BY id ASC LIMIT %d",
            (int) $grenze
        ));
        $ergebnis = array('frei' => 0, 'storniert' => 0, 'verbraucht' => 0);
        $storniert = array();
        foreach ($zeilen as $z) {
            if ($z->status === 'offen') {
                if (uncuttv_res_gib_zeile_frei($z, 'offen')) {
                    $ergebnis['frei']++;
                }
                continue;
            }
            // bestellt: Es gibt eine Bestellung. Bezahlt? Dann gehört der Bestand ihr.
            $order = wc_get_order((int) $z->order_id);
            $status = $order ? $order->get_status() : 'weg';
            if (in_array($status, array('processing', 'completed', 'on-hold'), true)) {
                $wpdb->query($wpdb->prepare(
                    "UPDATE {$tabelle} SET status = 'verbraucht' WHERE id = %d AND status = 'bestellt'",
                    (int) $z->id
                ));
                $ergebnis['verbraucht']++;
                continue;
            }
            if (uncuttv_res_gib_zeile_frei($z, 'bestellt')) {
                $ergebnis['frei']++;
            }
            if ($order && $status === 'pending' && !isset($storniert[$order->get_id()])) {
                $storniert[$order->get_id()] = true;
                $order->update_status(
                    'cancelled',
                    'Reservierung des Einzelstücks abgelaufen, Bestellung unbezahlt: automatisch storniert, Bestand wieder frei.'
                );
                $ergebnis['storniert']++;
            }
        }
        return $ergebnis;
    }

    function uncuttv_res_nehmen($request) {
        global $wpdb;
        if (!uncuttv_res_installiere()) {
            return new WP_Error('uncuttv_tabelle', 'Reservierungstabelle fehlt.', array('status' => 500));
        }
        $schluessel = uncuttv_res_schluessel($request->get_param('schluessel'));
        $positionen = $request->get_param('positionen');
        if ($schluessel === '' || !is_array($positionen)) {
            return new WP_Error('uncuttv_eingabe', 'schluessel und positionen nötig.', array('status' => 400));
        }
        $minuten = (int) $request->get_param('minuten');
        if ($minuten < 1 || $minuten > 60 * 24 * 60) {
            $minuten = (int) UNCUTTV_RES_MINUTEN;
        }
        $tabelle = uncuttv_res_tabelle();

        uncuttv_res_aufraeumen(20);

        // Gewünscht: Menge je Lager-ID, nur Einzelstücke.
        $gewuenscht = array();
        foreach ($positionen as $p) {
            if (!is_array($p)) {
                continue;
            }
            $product_id = isset($p['product_id']) ? (int) $p['product_id'] : 0;
            $variation_id = isset($p['variation_id']) ? (int) $p['variation_id'] : 0;
            $menge = isset($p['qty']) ? max(1, (int) $p['qty']) : 1;
            if ($product_id <= 0) {
                continue;
            }
            $product = wc_get_product($variation_id > 0 ? $variation_id : $product_id);
            $lager_id = uncuttv_res_lager_id($product);
            if ($lager_id <= 0) {
                continue;
            }
            if (!isset($gewuenscht[$lager_id])) {
                $gewuenscht[$lager_id] = array(
                    'menge'        => 0,
                    'product_id'   => $product_id,
                    'variation_id' => $variation_id,
                    'name'         => $product->get_name(),
                );
            }
            $gewuenscht[$lager_id]['menge'] += $menge;
        }

        // Schon reserviert unter diesem Schlüssel (zweiter Klick)?
        $vorhanden = uncuttv_res_zeilen($schluessel, array('offen'));
        $gleich = count($vorhanden) === count($gewuenscht) && count($vorhanden) > 0;
        if ($gleich) {
            foreach ($vorhanden as $z) {
                $lid = (int) $z->lager_id;
                if (!isset($gewuenscht[$lid]) || (int) $gewuenscht[$lid]['menge'] !== (int) $z->menge) {
                    $gleich = false;
                    break;
                }
            }
        }
        if ($gleich) {
            $wpdb->query($wpdb->prepare(
                "UPDATE {$tabelle} SET ablauf = (UTC_TIMESTAMP() + INTERVAL %d MINUTE)
                 WHERE schluessel = %s AND status = 'offen'",
                $minuten,
                $schluessel
            ));
            return rest_ensure_response(array(
                'ok'         => true,
                'reserviert' => count($vorhanden),
                'verlaengert' => true,
            ));
        }
        // Anderer Warenkorb als beim letzten Klick: alte Reservierung zurück.
        foreach ($vorhanden as $z) {
            uncuttv_res_gib_zeile_frei($z, 'offen');
        }
        if (empty($gewuenscht)) {
            return rest_ensure_response(array('ok' => true, 'reserviert' => 0));
        }

        $genommen = array();
        $ausverkauft = array();
        foreach ($gewuenscht as $lager_id => $g) {
            if (!uncuttv_res_buche_ab($lager_id, $g['menge'])) {
                $ausverkauft[] = array(
                    'product_id'   => (int) $g['product_id'],
                    'variation_id' => (int) $g['variation_id'],
                    'name'         => (string) $g['name'],
                );
                continue;
            }
            $wpdb->query($wpdb->prepare(
                "INSERT INTO {$tabelle}
                 (schluessel, lager_id, product_id, variation_id, menge, status, order_id, erstellt, ablauf)
                 VALUES (%s, %d, %d, %d, %d, 'offen', 0, UTC_TIMESTAMP(), (UTC_TIMESTAMP() + INTERVAL %d MINUTE))",
                $schluessel,
                $lager_id,
                (int) $g['product_id'],
                (int) $g['variation_id'],
                (int) $g['menge'],
                $minuten
            ));
            $zeilen_id = (int) $wpdb->insert_id;
            if ($zeilen_id <= 0) {
                // Zeile nicht geschrieben: Abbuchung sofort zurück, sonst hinge
                // der Bestand ohne Reservierung fest.
                uncuttv_res_buche_zurueck($lager_id, $g['menge']);
                foreach ($genommen as $z) {
                    uncuttv_res_gib_zeile_frei($z, 'offen');
                }
                return new WP_Error('uncuttv_db', 'Reservierung konnte nicht gespeichert werden.', array('status' => 500));
            }
            uncuttv_res_gleiche_ab($lager_id);
            $genommen[] = (object) array(
                'id'       => $zeilen_id,
                'lager_id' => $lager_id,
                'menge'    => (int) $g['menge'],
            );
        }

        if (!empty($ausverkauft)) {
            // Alles oder nichts: Was dieser Aufruf schon genommen hat, zurück.
            foreach ($genommen as $z) {
                uncuttv_res_gib_zeile_frei($z, 'offen');
            }
            return rest_ensure_response(array('ok' => false, 'ausverkauft' => $ausverkauft));
        }
        return rest_ensure_response(array('ok' => true, 'reserviert' => count($genommen)));
    }

    function uncuttv_res_freigeben($request) {
        $schluessel = uncuttv_res_schluessel($request->get_param('schluessel'));
        if ($schluessel === '' || !uncuttv_res_installiere()) {
            return new WP_Error('uncuttv_eingabe', 'schluessel nötig.', array('status' => 400));
        }
        $n = 0;
        foreach (uncuttv_res_zeilen($schluessel, array('offen')) as $z) {
            if (uncuttv_res_gib_zeile_frei($z, 'offen')) {
                $n++;
            }
        }
        return rest_ensure_response(array('ok' => true, 'frei' => $n));
    }

    function uncuttv_res_aufraeumen_route() {
        return rest_ensure_response(array_merge(array('ok' => true), uncuttv_res_aufraeumen(100)));
    }

    function uncuttv_res_status() {
        global $wpdb;
        $da = uncuttv_res_installiere();
        $tabelle = uncuttv_res_tabelle();
        $zahlen = array();
        if ($da) {
            foreach ($wpdb->get_results("SELECT status, COUNT(*) AS n FROM {$tabelle} GROUP BY status") as $r) {
                $zahlen[$r->status] = (int) $r->n;
            }
        }
        $begriff = get_term_by('slug', UNCUTTV_RES_SCHLAGWORT, 'product_tag');
        return rest_ensure_response(array(
            'stand'         => UNCUTTV_RES_STAND,
            'tabelle'       => $da,
            'schlagwort'    => UNCUTTV_RES_SCHLAGWORT,
            'schlagwort_da' => (bool) $begriff,
            'produkte'      => $begriff ? (int) $begriff->count : 0,
            'vorkasse_std'  => (int) UNCUTTV_RES_VORKASSE_STD,
            'zeilen'        => $zahlen,
        ));
    }

    /**
     * Bestellung entsteht (REST): offene Reservierung an die Bestellung
     * binden. Vorkasse bekommt die längere Frist. Bezahlte Bestellungen
     * sind hier schon "verbraucht" (siehe Filter unten, der vorher läuft).
     */
    function uncuttv_res_binde_an_bestellung($order, $request, $creating) {
        global $wpdb;
        if (!$creating || !is_a($order, 'WC_Order')) {
            return;
        }
        $schluessel = uncuttv_res_schluessel((string) $order->get_meta('_uncuttv_reservierung'));
        if ($schluessel === '' || !uncuttv_res_installiere()) {
            return;
        }
        $tabelle = uncuttv_res_tabelle();
        if ($order->get_payment_method() === 'bacs') {
            $wpdb->query($wpdb->prepare(
                "UPDATE {$tabelle} SET status = 'bestellt', order_id = %d,
                 ablauf = (UTC_TIMESTAMP() + INTERVAL %d HOUR)
                 WHERE schluessel = %s AND status = 'offen'",
                (int) $order->get_id(),
                (int) UNCUTTV_RES_VORKASSE_STD,
                $schluessel
            ));
        } else {
            $wpdb->query($wpdb->prepare(
                "UPDATE {$tabelle} SET status = 'bestellt', order_id = %d
                 WHERE schluessel = %s AND status = 'offen'",
                (int) $order->get_id(),
                $schluessel
            ));
        }
    }
    add_action('woocommerce_rest_insert_shop_order_object', 'uncuttv_res_binde_an_bestellung', 30, 3);

    /**
     * WooCommerce will den Bestand der Bestellung abbuchen. Für reservierte
     * Positionen ist das schon geschehen: Sie bekommen _reduced_stock, damit
     * WooCommerce sie überspringt (kein zweites Abbuchen) und bei Storno
     * oder Erstattung wie gewohnt zurückbucht. Alle anderen Positionen der
     * Bestellung bucht WooCommerce normal ab.
     */
    function uncuttv_res_uebernimm_in_bestellung($darf, $order) {
        global $wpdb;
        if (!$darf || !is_a($order, 'WC_Order')) {
            return $darf;
        }
        $schluessel = uncuttv_res_schluessel((string) $order->get_meta('_uncuttv_reservierung'));
        if ($schluessel === '' || !uncuttv_res_installiere()) {
            return $darf;
        }
        $zeilen = uncuttv_res_zeilen($schluessel, array('offen', 'bestellt'));
        if (empty($zeilen)) {
            return $darf;
        }
        $rest = array();
        foreach ($zeilen as $z) {
            $lid = (int) $z->lager_id;
            $rest[$lid] = (isset($rest[$lid]) ? $rest[$lid] : 0) + (int) $z->menge;
        }
        $uebernommen = 0;
        foreach ($order->get_items() as $item) {
            if (!$item->is_type('line_item') || $item->get_meta('_reduced_stock', true)) {
                continue;
            }
            $product = $item->get_product();
            if (!$product || !$product->managing_stock()) {
                continue;
            }
            $lid = (int) $product->get_stock_managed_by_id();
            $menge = (int) $item->get_quantity();
            if (!isset($rest[$lid]) || $rest[$lid] < $menge) {
                continue;
            }
            $item->add_meta_data('_reduced_stock', $menge, true);
            $item->save();
            $rest[$lid] -= $menge;
            $uebernommen++;
        }
        $tabelle = uncuttv_res_tabelle();
        $wpdb->query($wpdb->prepare(
            "UPDATE {$tabelle} SET status = 'verbraucht', order_id = %d
             WHERE schluessel = %s AND status IN ('offen','bestellt')",
            (int) $order->get_id(),
            $schluessel
        ));
        if ($uebernommen > 0) {
            $order->add_order_note(sprintf(
                'Bestand für %d Einzelstück-Position(en) war reserviert und wird nicht ein zweites Mal abgebucht.',
                $uebernommen
            ));
        }
        return $darf;
    }
    add_filter('woocommerce_can_reduce_order_stock', 'uncuttv_res_uebernimm_in_bestellung', 20, 2);

    /**
     * Unbezahlte Bestellung wird storniert oder scheitert, bevor WooCommerce
     * je abgebucht hat: Die Reservierung sofort zurückbuchen, nicht erst
     * beim Ablauf.
     */
    function uncuttv_res_bei_storno($order_id) {
        global $wpdb;
        if (!uncuttv_res_installiere()) {
            return;
        }
        $zeilen = $wpdb->get_results($wpdb->prepare(
            'SELECT * FROM ' . uncuttv_res_tabelle() . " WHERE order_id = %d AND status = 'bestellt'",
            (int) $order_id
        ));
        foreach ($zeilen as $z) {
            uncuttv_res_gib_zeile_frei($z, 'bestellt');
        }
    }
    add_action('woocommerce_order_status_cancelled', 'uncuttv_res_bei_storno', 5);
    add_action('woocommerce_order_status_failed', 'uncuttv_res_bei_storno', 5);

    add_action('rest_api_init', function () {
        $ns = 'wc-uncuttv/v1';
        register_rest_route($ns, '/reservierung/nehmen', array(
            'methods'             => 'POST',
            'callback'            => 'uncuttv_res_nehmen',
            'permission_callback' => 'uncuttv_res_darf',
        ));
        register_rest_route($ns, '/reservierung/freigeben', array(
            'methods'             => 'POST',
            'callback'            => 'uncuttv_res_freigeben',
            'permission_callback' => 'uncuttv_res_darf',
        ));
        register_rest_route($ns, '/reservierung/aufraeumen', array(
            'methods'             => 'POST',
            'callback'            => 'uncuttv_res_aufraeumen_route',
            'permission_callback' => 'uncuttv_res_darf',
        ));
        register_rest_route($ns, '/reservierung/status', array(
            'methods'             => 'GET',
            'callback'            => 'uncuttv_res_status',
            'permission_callback' => 'uncuttv_res_darf',
        ));
    });
}
