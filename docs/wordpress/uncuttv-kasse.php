<?php
/**
 * UncutTV Kasse: Suche und Sperre je Zahlung (Stand 1, November 2026)
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
