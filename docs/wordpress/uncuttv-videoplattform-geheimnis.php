<?php
/**
 * UncutTV: Geheimnis fuer den Videoplattform-Anmelde-Endpunkt setzen
 *
 * Begleit-Snippet zu uncuttv-videoplattform-anmeldung.php fuer den Fall,
 * dass kein Zugriff auf die wp-config.php besteht: Es ERZEUGT das
 * gemeinsame Geheimnis selbst (64 Hex-Zeichen aus random_bytes) und legt
 * es in der Option uncuttv_videoplattform_secret ab — im Snippet-Code
 * steht damit nie ein Klartext-Geheimnis.
 *
 * Ablauf:
 * - Beim ersten Admin-Aufbau nach Aktivierung wird das Geheimnis
 *   erzeugt (nur falls die Option noch leer ist) und Administratoren
 *   als Hinweis angezeigt — zum Eintragen in Vercel (SHOP_AUTH_SECRET).
 * - Der Link "Übertragen — nicht mehr anzeigen" im Hinweis beendet die
 *   Anzeige dauerhaft. Danach kann das Snippet gefahrlos aktiv bleiben
 *   (es zeigt nichts mehr und ueberschreibt nie ein vorhandenes
 *   Geheimnis) oder deaktiviert werden.
 * - "Neues Geheimnis erzeugen" rotiert bei Bedarf: neues Geheimnis,
 *   Anzeige wieder an — der alte Wert gilt sofort nicht mehr, Vercel
 *   muss nachziehen.
 *
 * Sicherheit:
 * - Option mit autoload=no; nicht per register_setting registriert und
 *   damit nicht ueber die REST-API (/wp/v2/settings) auslesbar.
 * - Anzeige und Aktionen nur fuer manage_options, Aktionen mit Nonce.
 *
 * Install: WPCode -> Add New -> PHP Snippet
 * Name: "UncutTV — Videoplattform Geheimnis setzen"
 * Location: Admin Only (reicht; Run Everywhere schadet nicht)
 */

defined('ABSPATH') || exit;

const UNCUTTV_VP_GEHEIMNIS_OPTION    = 'uncuttv_videoplattform_secret';
const UNCUTTV_VP_GEHEIMNIS_BESTAETIGT = 'uncuttv_videoplattform_secret_bestaetigt';

add_action('admin_init', function () {
    if (!current_user_can('manage_options')) {
        return;
    }
    if (isset($_GET['uncuttv_vp_geheimnis_ok']) && check_admin_referer('uncuttv_vp_geheimnis_ok')) {
        update_option(UNCUTTV_VP_GEHEIMNIS_BESTAETIGT, '1', false);
        wp_safe_redirect(remove_query_arg(array('uncuttv_vp_geheimnis_ok', '_wpnonce')));
        exit;
    }
    if (isset($_GET['uncuttv_vp_geheimnis_neu']) && check_admin_referer('uncuttv_vp_geheimnis_neu')) {
        update_option(UNCUTTV_VP_GEHEIMNIS_OPTION, bin2hex(random_bytes(32)), false);
        delete_option(UNCUTTV_VP_GEHEIMNIS_BESTAETIGT);
        wp_safe_redirect(remove_query_arg(array('uncuttv_vp_geheimnis_neu', '_wpnonce')));
        exit;
    }
});

add_action('admin_notices', function () {
    if (!current_user_can('manage_options')) {
        return;
    }

    $wert = get_option(UNCUTTV_VP_GEHEIMNIS_OPTION, '');
    if (!is_string($wert) || $wert === '') {
        // Erzeugen, nie ueberschreiben; autoload bewusst "no".
        $wert = bin2hex(random_bytes(32));
        add_option(UNCUTTV_VP_GEHEIMNIS_OPTION, $wert, '', 'no');
        delete_option(UNCUTTV_VP_GEHEIMNIS_BESTAETIGT);
    }

    if (get_option(UNCUTTV_VP_GEHEIMNIS_BESTAETIGT) === '1') {
        return; // Uebertragen — nichts mehr anzeigen.
    }

    $ok_link  = wp_nonce_url(add_query_arg('uncuttv_vp_geheimnis_ok', '1'), 'uncuttv_vp_geheimnis_ok');
    $neu_link = wp_nonce_url(add_query_arg('uncuttv_vp_geheimnis_neu', '1'), 'uncuttv_vp_geheimnis_neu');

    echo '<div class="notice notice-warning"><p><strong>UncutTV Videoplattform:</strong> '
        . 'Gemeinsames Geheimnis f&uuml;r den Anmelde-Endpunkt — auf der Videoplattform (Vercel) '
        . 'als <code>SHOP_AUTH_SECRET</code> eintragen:</p>'
        . '<p><code style="user-select:all">' . esc_html($wert) . '</code></p>'
        . '<p><a href="' . esc_url($ok_link) . '">&Uuml;bertragen — nicht mehr anzeigen</a>'
        . ' &nbsp;|&nbsp; <a href="' . esc_url($neu_link) . '" '
        . 'onclick="return confirm(\'Neues Geheimnis erzeugen? Das alte gilt sofort nicht mehr.\');">'
        . 'Neues Geheimnis erzeugen</a></p></div>';
});
