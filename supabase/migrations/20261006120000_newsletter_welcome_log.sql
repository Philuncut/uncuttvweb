-- Welche Ghost-Mitglieder die Willkommensmail mit WELCOME10 schon bekommen
-- haben. Der Ghost-Webhook member.added (api/newsletter/ghost-webhook)
-- traegt die Kennung vor dem Versand ein; eine Wiederholung des Webhooks
-- scheitert an der Eindeutigkeit und schickt nichts zweimal.
-- Apply in Supabase SQL Editor for project xmqxnwhszgsijmhdtrhg.

CREATE TABLE IF NOT EXISTS shop_newsletter_welcome_log (
  ghost_member_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shop_newsletter_welcome_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shop_newsletter_welcome_log FROM anon, authenticated;
