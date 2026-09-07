This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Anmeldung der Videoplattform gegen die Shop-Konten

Die Videoplattform (Repo `uncuttv-videoplattform`) lässt Kunden sich mit
ihrem bestehenden Shop-Konto anmelden. Die Kontoprüfung läuft **nicht**
über dieses Next.js-Frontend, sondern über einen Endpunkt direkt in
WordPress auf **wp.uncuttv.at** (WPCode-Snippet):

- Quelle und Anleitung: [`docs/wordpress/uncuttv-videoplattform-anmeldung.php`](docs/wordpress/uncuttv-videoplattform-anmeldung.php)
  bzw. [`docs/wordpress/WPCODE_SNIPPETS.md`](docs/wordpress/WPCODE_SNIPPETS.md)
  (Abschnitt „Videoplattform Anmelde-Endpunkt“).
- Nötige Konfiguration in `wp-config.php` auf wp.uncuttv.at:
  `define('UNCUTTV_VIDEOPLATTFORM_SECRET', '…')` — dasselbe Geheimnis
  steht auf der Videoplattform als `SHOP_AUTH_SECRET`. Der Endpunkt gibt
  nur Kennung, Anzeigename und E-Mail heraus; Passwörter bleiben im Shop.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
