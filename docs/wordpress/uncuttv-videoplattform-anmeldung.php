<?php
/**
 * UncutTV: Anmelde-Endpunkt fuer die Videoplattform
 *
 * POST /wp-json/uncuttv/v1/videoplattform/anmeldung
 * Body (JSON): { "email": "...", "passwort": "..." }
 *
 * Prueft Zugangsdaten gegen die bestehenden Kundenkonten und gibt bei
 * Erfolg NUR die Eckdaten zurueck: unveraenderliche Kennung (WP-User-ID),
 * Anzeigename, E-Mail. Kein Passwort, keine Bestelldaten.
 *
 * Absicherung:
 * - Nur mit gemeinsamem Geheimnis erreichbar (Header
 *   X-Videoplattform-Secret). Quelle des Geheimnisses, in dieser
 *   Reihenfolge: Konstante UNCUTTV_VIDEOPLATTFORM_SECRET (wp-config.php,
 *   hat Vorrang, falls Dateizugriff moeglich ist) — sonst die
 *   WordPress-Option uncuttv_videoplattform_secret, gesetzt ueber das
 *   Begleit-Snippet uncuttv-videoplattform-geheimnis.php (kein
 *   Dateizugriff noetig). Ohne bzw. mit falschem Geheimnis: 401, ist
 *   keins von beiden gesetzt: 503 — der Endpunkt ist nie oeffentlich
 *   nutzbar. Die Option ist nicht per register_setting registriert und
 *   damit nicht ueber /wp/v2/settings auslesbar; autoload steht auf no.
 * - Versuchszaehler je Absender-IP und je Konto (Transients, 15 min);
 *   ueber dem Limit 429 mit Retry-After, davor zunehmende Verzoegerung.
 * - Falsches Passwort und unbekanntes Konto ergeben dieselbe Antwort;
 *   fuer unbekannte Konten laeuft dieselbe bcrypt-Rechenarbeit wie eine
 *   echte Passwortpruefung, damit die Antwortzeit nicht verraet, welche
 *   E-Mail-Adressen Kunden sind.
 * - Die Pruefung laeuft ueber wp_authenticate: Sperren aus
 *   Sicherheits-Plugins und deaktivierte Konten greifen damit ebenfalls;
 *   zusaetzlich blockt user_status != 0.
 *
 * Install: WordPress Admin -> Code Snippets (WPCode) -> Add New -> PHP
 * Name: "UncutTV — Videoplattform Anmelde-Endpunkt"
 * Location: Run Everywhere
 * Voraussetzung: Geheimnis gesetzt — per Begleit-Snippet (Option) oder,
 * falls moeglich, per define('UNCUTTV_VIDEOPLATTFORM_SECRET', ...) in
 * der wp-config.php (Konstante hat Vorrang).
 */

defined('ABSPATH') || exit;

add_action('rest_api_init', function () {
    register_rest_route('uncuttv/v1', '/videoplattform/anmeldung', array(
        'methods'             => 'POST',
        'callback'            => 'uncuttv_vp_anmeldung',
        'permission_callback' => 'uncuttv_vp_anmeldung_erlaubt',
    ));
});

/**
 * Das gemeinsame Geheimnis der beiden Server: bevorzugt die Konstante
 * aus der wp-config.php; ohne Dateizugriff die WordPress-Option, die
 * das Begleit-Snippet setzt. Leer = nicht konfiguriert.
 */
function uncuttv_vp_geheimnis() {
    if (defined('UNCUTTV_VIDEOPLATTFORM_SECRET') && UNCUTTV_VIDEOPLATTFORM_SECRET !== '') {
        return (string) UNCUTTV_VIDEOPLATTFORM_SECRET;
    }
    $option = get_option('uncuttv_videoplattform_secret', '');
    return is_string($option) ? $option : '';
}

/**
 * Zugang nur mit dem gemeinsamen Geheimnis der beiden Server.
 */
function uncuttv_vp_anmeldung_erlaubt(WP_REST_Request $request) {
    $erwartet = uncuttv_vp_geheimnis();
    if ($erwartet === '') {
        return new WP_Error('nicht_konfiguriert', 'Endpunkt nicht konfiguriert.', array('status' => 503));
    }
    $geheimnis = (string) $request->get_header('x-videoplattform-secret');
    if ($geheimnis === '' || !hash_equals($erwartet, $geheimnis)) {
        return new WP_Error('kein_zugriff', 'Kein Zugriff.', array('status' => 401));
    }
    return true;
}

function uncuttv_vp_anmeldung(WP_REST_Request $request) {
    $email    = sanitize_email((string) $request->get_param('email'));
    $passwort = (string) $request->get_param('passwort');

    // Eine Antwort fuer alle Fehlschlaege — falsches Passwort, unbekanntes
    // oder gesperrtes Konto sind von aussen nicht unterscheidbar.
    $ungueltig = new WP_REST_Response(array('fehler' => 'ungueltig'), 401);

    if ($email === '' || $passwort === '') {
        return $ungueltig;
    }

    $ip           = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    $konto_schl   = 'kto_' . md5(strtolower($email));
    $ip_schl      = 'ip_' . md5($ip);
    $je_konto     = uncuttv_vp_versuche($konto_schl);
    $je_ip        = uncuttv_vp_versuche($ip_schl);

    // Limits je 15 Minuten: 10 Fehlversuche je Konto, 30 je Absender.
    if ($je_konto >= 10 || $je_ip >= 30) {
        $zu_viele = new WP_REST_Response(array('fehler' => 'zu_viele_versuche'), 429);
        $zu_viele->header('Retry-After', '900');
        return $zu_viele;
    }

    // Nach mehreren Fehlschlaegen zunehmend verzoegern (bis 2 s).
    $fehlschlaege = max($je_konto, (int) floor($je_ip / 3));
    if ($fehlschlaege >= 3) {
        usleep(min(2000000, ($fehlschlaege - 2) * 500000));
    }

    $user = get_user_by('email', $email);

    if (!$user) {
        // Dieselbe bcrypt-Rechenarbeit wie eine echte Pruefung, dann
        // dieselbe Antwort — kein Orakel fuer vorhandene Konten.
        wp_hash_password($passwort);
        uncuttv_vp_fehlversuch($konto_schl, $ip_schl);
        return $ungueltig;
    }

    // wp_authenticate statt nur wp_check_password: Sperren und Limits aus
    // Sicherheits-Plugins greifen so auch fuer diesen Endpunkt.
    $geprueft = wp_authenticate($user->user_login, $passwort);

    if (is_wp_error($geprueft) || (int) $geprueft->user_status !== 0) {
        uncuttv_vp_fehlversuch($konto_schl, $ip_schl);
        return $ungueltig;
    }

    delete_transient('uncuttv_vp_versuche_' . $konto_schl);

    $anzeigename = trim((string) $geprueft->display_name);
    if ($anzeigename === '') {
        $anzeigename = (string) $geprueft->user_login;
    }

    return new WP_REST_Response(array(
        'kennung'     => (int) $geprueft->ID,
        'anzeigename' => $anzeigename,
        'email'       => (string) $geprueft->user_email,
    ), 200);
}

/** Aktueller Fehlversuchs-Zaehler (15-Minuten-Fenster). */
function uncuttv_vp_versuche($schluessel) {
    return (int) get_transient('uncuttv_vp_versuche_' . $schluessel);
}

/** Fehlversuch je Konto und je Absender festhalten. */
function uncuttv_vp_fehlversuch($konto_schl, $ip_schl) {
    foreach (array($konto_schl, $ip_schl) as $schl) {
        $name = 'uncuttv_vp_versuche_' . $schl;
        set_transient($name, (int) get_transient($name) + 1, 15 * MINUTE_IN_SECONDS);
    }
}
