# Clerivo

CRM / Sales Intelligence workspace avec front React, API Express, session par cookie signe et persistance Postgres.

## Local

1. Installer les dependances
   `npm install`
2. Copier `.env.example` vers `.env`
3. Configurer `DATABASE_URL` vers une vraie base Postgres
4. Lancer l'application
   `npm run dev`

## Verification

- TypeScript: `npm run lint`
- Tests: `npm run test`
- Build complet: `npm run build`
- Controle global: `npm run check` (lint + tests + build)

## Production

Variables importantes:

- `NODE_ENV=production`
- `SESSION_SECRET` avec au moins 32 caracteres aleatoires
- `TRUST_PROXY=true` si l'app est derriere un reverse proxy TLS
- `DATABASE_URL` obligatoire
- `BLOB_READ_WRITE_TOKEN` requis pour les uploads documents, signatures et medias WhatsApp
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` requis pour le checkout abonnement

Vercel:

1. creer une base Postgres et exposer `DATABASE_URL` dans le projet Vercel
2. definir `SESSION_SECRET`
3. definir `BOOTSTRAP_ADMIN_EMAIL` et `BOOTSTRAP_ADMIN_PASSWORD` pour le premier boot
4. deployer: Vercel sert le front depuis `dist/` et execute l'API Express via `api/index.ts`

Premier demarrage en production:

- si la base Postgres est vide, il faut fournir
  - `BOOTSTRAP_ADMIN_EMAIL`
  - `BOOTSTRAP_ADMIN_PASSWORD`
- le serveur refuse maintenant de recreer des comptes de demonstration en production

Build et demarrage:

1. `npm run build`
2. `npm run start`

Docker:

1. `docker build -t clerivo .`
2. `docker run --env-file .env -p 3000:3000 clerivo`

Notes d'exploitation:

- le client est servi depuis `dist/`
- le bundle serveur local est genere dans `build/server.cjs`
- en Vercel, l'API tourne via la fonction `api/index.ts`
- les migrations SQL sont appliquees automatiquement au demarrage
- contrat API: `docs/openapi.yaml`
- endpoints de supervision:
  - `GET /healthz`
  - `GET /readyz`

## Comptes de demonstration

Disponibles uniquement en environnement local / seed demo.

Mot de passe commun: `demo123`

- `terrain@atlas.local`
- `manager@atlas.local`
- `admin@atlas.local`
- `finance@atlas.local`
- `direction@atlas.local`
