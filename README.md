# Clerivo

CRM / Sales Intelligence workspace avec front React, API Express, session par cookie signe et stockage local JSON ou Postgres.

## Local

1. Installer les dependances
   `npm install`
2. Copier `.env.example` vers `.env`
3. Lancer l'application
   `npm run dev`

En local, si `DATABASE_URL` n'est pas defini, l'application continue d'utiliser `data/app-db.json`.

## Verification

- TypeScript: `npm run lint`
- Build complet: `npm run build`
- Controle global: `npm run check`

## Production

Variables importantes:

- `NODE_ENV=production`
- `SESSION_SECRET` avec au moins 32 caracteres aleatoires
- `TRUST_PROXY=true` si l'app est derriere un reverse proxy TLS
- `DATABASE_URL` pour utiliser Postgres en deploiement serverless / Vercel

Vercel:

1. creer une base Postgres et exposer `DATABASE_URL` dans le projet Vercel
2. definir `SESSION_SECRET`
3. definir `BOOTSTRAP_ADMIN_EMAIL` et `BOOTSTRAP_ADMIN_PASSWORD` pour le premier boot
4. deployer: Vercel sert le front depuis `dist/` et execute l'API Express via `api/[...path].ts`

Premier demarrage en production:

- si la base Postgres ou `data/app-db.json` est vide, il faut fournir
  - `BOOTSTRAP_ADMIN_EMAIL`
  - `BOOTSTRAP_ADMIN_PASSWORD`
- le serveur refuse maintenant de recreer des comptes de demonstration en production

Build et demarrage:

1. `npm run build`
2. `npm run start`

Notes d'exploitation:

- le client est servi depuis `dist/`
- le bundle serveur local est genere dans `build/server.cjs`
- en Vercel, l'API tourne via la fonction `api/[...path].ts`
- sans `DATABASE_URL`, `data/app-db.json` doit etre monte sur un stockage persistant
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
