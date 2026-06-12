# Clerivo

CRM / Sales Intelligence workspace avec front React, API Express, session par cookie signe et base JSON persistante.

## Local

1. Installer les dependances
   `npm install`
2. Copier `.env.example` vers `.env`
3. Lancer l'application
   `npm run dev`

## Verification

- TypeScript: `npm run lint`
- Build complet: `npm run build`
- Controle global: `npm run check`

## Production

Variables importantes:

- `NODE_ENV=production`
- `SESSION_SECRET` avec au moins 32 caracteres aleatoires
- `TRUST_PROXY=true` si l'app est derriere un reverse proxy TLS

Premier demarrage en production:

- si `data/app-db.json` n'existe pas, il faut fournir
  - `BOOTSTRAP_ADMIN_EMAIL`
  - `BOOTSTRAP_ADMIN_PASSWORD`
- le serveur refuse maintenant de recreer des comptes de demonstration en production

Build et demarrage:

1. `npm run build`
2. `npm run start`

Notes d'exploitation:

- le client est servi depuis `dist/`
- le bundle serveur est genere dans `build/server.cjs`
- `data/app-db.json` doit etre monte sur un stockage persistant
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
