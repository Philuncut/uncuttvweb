/**
 * The normalised WooCommerce role string for wholesale/dealer users.
 *
 * Every role check in the codebase — middleware, session route, login route,
 * cron jobs — resolves to this string. It matches what resolveSessionRole()
 * returns when the WordPress user's roles array contains "wholesale", and what
 * the WooCommerce customer object's `.role` field contains.
 *
 * Administrators and shop managers are intentionally NOT included here.
 * They log in via /haendler directly and must not be auto-redirected out of
 * the B2C shop.
 */
export const WHOLESALE_ROLE = "wholesale";
