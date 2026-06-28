# Audit d'enforcement backend — Force Commerciale Terrain

> Première action du plan : audit auth / permissions / scoping sur les 3 couches backend,
> avant tout refactor. Daté du 2026-06-28. Basé sur le code réel (`server.ts`, `crm-flow.ts`, `whatsapp.ts`).

## 0. Correction d'hypothèse majeure — l'app est MONO-tenant, pas multi-tenant

Le plan part du « multi-tenant SaaS » comme risque n°1. **Le code ne l'est pas.**

- La session ne contient **que** `{ userId }` (`server.ts:2689`, `requireAuth` → `findUserById`).
- **Aucune** table de données ne porte de `company_id` / `tenant_id` (`migrations/001_init.sql`).
  Il y a une table `companies` mais une seule entreprise est servie : `db.company` (singulier).
- Conséquence : **le risque « un commercial voit les données d'une autre entreprise » n'existe pas**
  aujourd'hui — il n'y a qu'une entreprise par déploiement.

➡️ Le vrai risque d'isolation est **horizontal intra-entreprise** : un `sales_rep` voit-il les
données d'un autre `sales_rep` ? C'est géré par `getVisibleUserIds` / `canSeeEntity`
(`server.ts:2283-2306`) et `visibleUserIds` / `canSee` (`crm-flow.ts:39-55`).

**Décision à prendre (bloquante, voir §5)** : voulez-vous rester mono-tenant (1 déploiement = 1 client)
ou introduire un vrai multi-tenant (`company_id` partout + scoping) ? Tout le plan en dépend.

---

## 1. Modèle d'enforcement constaté

| Couche | Auth | Permission | Scoping horizontal | Accès DB |
|---|---|---|---|---|
| `server.ts` | `requireAuth` (cookie session) | `requirePermission(key)` sur chaque route | `canSeeEntity` / `getVisibleUserIds` | store mémoire + `persistDiff` |
| `crm-flow.ts` | injecté via deps | `requirePermission` (ajouté à l'audit du 26/06) | `visibleUserIds` / `canSee` | `pool.query` direct |
| `whatsapp.ts` | injecté via deps | `requirePermission` | **absent** (voir F-05) | `pool.query` direct |

Points solides confirmés :
- `resolveOwner` (`server.ts:2628`) et `resolveTerritory` (`server.ts:2638`) **recalculent**
  `ownerUserId`/`territoryId` côté serveur et rejettent toute valeur du body hors périmètre visible.
  → pas d'injection d'`ownerId` par le client. ✅
- Workflow remise/approbation (`server.ts:3592`) : `remise > 5% OU montant > 20000` ⇒ `pending`,
  auto-approuvé **uniquement** si l'acteur a `orders.approve`. Un `sales_rep` ne peut pas s'auto-valider. ✅
- Décisions d'approbation : `requirePermission("orders.approve")` + `canSeeEntity` + audit. ✅
- Webhook WhatsApp : `rawBody` réellement capturé par `express.json({ verify })` (`server.ts:2790`),
  signature HMAC vérifiée (`whatsapp.ts:200`), inbound **idempotent** `ON CONFLICT (wa_message_id) DO NOTHING`
  (`whatsapp.ts:259`). ✅
- Webhook Stripe : signature + timestamp vérifiés sur rawBody (`server.ts:5753`). ✅

---

## 2. Matrice route → permission → feature → scope → audit (extrait représentatif)

Légende scope : **OWN** = propre/équipe/global via `canSeeEntity` · **GLOBAL** = pas de scope ligne · **PUBLIC** = non authentifié (token).

| Route | Permission | Feature plan | Scope | Audit | OK |
|---|---|---|---|---|---|
| `GET /clients` | clients.read | contacts | OWN | – | ✅ |
| `PATCH /clients/:id` | clients.write | contacts | OWN (`canSeeEntity`) | ✅ | ✅ |
| `POST /orders` | orders.write | orders | OWN (resolveOwner) | ✅ | ✅ |
| `GET /approvals` | orders.approve | – | OWN | – | ✅ |
| `POST /approvals/:id` | orders.approve | – | OWN | ✅ | ✅ |
| `GET /quotes` | orders.read | quotes | OWN (`canSee`) | – | ✅ |
| `GET/PATCH/DELETE /quotes/:id` | orders.read/write/delete | quotes | OWN | – | ✅ |
| `POST /quotes/:id/lines` | orders.write | quotes | **GLOBAL** ❌ | – | **F-01** |
| `PATCH /quotes/:quoteId/lines/:lineId` | orders.write | quotes | **GLOBAL** ❌ | – | **F-01** |
| `DELETE /quotes/:quoteId/lines/:lineId` | orders.write | quotes | **GLOBAL** ❌ | – | **F-01** |
| `POST /quotes/:id/send` | orders.write | quotes | **GLOBAL** ❌ | – | **F-02** |
| `POST /quotes/:id/cancel` | orders.write | quotes | **GLOBAL** ❌ | – | **F-03** |
| `DELETE /comments/:id` | clients.write | – | **à vérifier** | – | **F-04** |
| `GET /whatsapp/conversations` … | clients.read | whatsapp | **GLOBAL** ❌ | – | **F-05** |
| `POST /public/quotes/:id/sign` | PUBLIC (token) | – | token signé | partiel | ✅ (F-06) |
| `GET /public/quotes/:id/pdf` | PUBLIC (token) | – | token | – | ✅ |

> Aucune route n'accepte de `companyId`/`tenantId` du body (cohérent avec le mono-tenant).
> Aucune route métier authentifiée trouvée **sans** `requirePermission` sur les 3 couches.

---

## 3. Non-conformités (priorisées)

### P0 — IDOR horizontal sur les devis (`crm-flow.ts`) — ✅ CORRIGÉ (2026-06-28)
Ces routes exigeaient `orders.write` et vérifiaient `status≠signed`, mais **ne vérifiaient pas la propriété**
du devis. Un `sales_rep` pouvait donc agir sur le devis d'un **autre** commercial en connaissant son id.

Correctif appliqué : helper partagé `ensureQuoteOwnerVisible(pool, actor, ownerUserId)` (crm-flow.ts,
après `canSee`), branché sur les 5 handlers. Réponse **404** (pas 403) pour ne pas divulguer l'existence.

- **F-01** ✅ — Lignes de devis (POST/PATCH/DELETE) : garde de propriété ajouté avant toute mutation.
- **F-02** ✅ — `POST /quotes/:id/send` : garde ajouté (plus de lien de signature généré pour autrui).
- **F-03** ✅ — `POST /quotes/:id/cancel` : charge le devis + garde existence/propriété/`signed` avant `cancel`.

Reste à faire (P1) : logguer en `audit_logs` les mutations de prix/remise/statut de devis (non couvert).

### P1
- **F-04** — `DELETE /comments/:id` (`crm-flow.ts:482`) : ✅ **déjà correct** — autorise uniquement
  l'auteur OU un rôle `POWER_ROLES`. (Faux positif de l'audit initial.)
- **F-05** — Inbox WhatsApp : **par conception une boîte PARTAGÉE** (filtres `mine`/`unassigned`,
  picker d'assignation, badge global). Tout `clients.read` voit toutes les conversations. C'est un
  **choix produit**, pas un bug. ✅ **Décision (2026-06-28) : inbox partagée conservée** (reprise de
  leads non assignés). Aucun changement de code. F-05 clos.
- **F-09** ✅ **CORRIGÉ** — Incohérence de visibilité entre couches : `POWER_ROLES` de crm-flow valait
  `["admin","director"]` (sans `super_admin`) → un `super_admin` ne voyait que ses propres devis et ne
  pouvait ni éditer `crm-settings` ni supprimer un commentaire ; `finance/logistics/support/viewer`
  n'avaient pas la lecture globale (vs server.ts). Corrigé : `super_admin` ajouté à `POWER_ROLES`, et
  nouveau set `GLOBAL_READ_ROLES` (miroir de server.ts) utilisé pour la visibilité lecture.
- **F-06** — Signature publique (`crm-flow.ts:899`) : convertit prospect→client, crée client + commande.
  L'audit de conversion a `actor_user_id = null` (normal, public) mais la **création de commande** issue
  de signature n'est pas tracée en `audit_logs`. Ajouter une entrée `order.created_from_quote`.
- **F-07** — Seuils d'approbation **codés en dur** (`discount > 5 || amount > 20000`, `server.ts:3592`).
  Devraient être dans `crm_settings` (par entreprise) pour éviter un redéploiement à chaque changement de règle.
- **F-08** — `verifyMetaSignature` retourne `true` si `app_secret` vide (`whatsapp.ts:198`, « dev »).
  Acceptable en dev, mais à **forcer en prod** (refuser si secret absent quand `NODE_ENV=production`).

### P2
- Normalisation des erreurs API (format `{ error: { code, message, requestId } }`) — actuellement
  `{ error: "texte" }` hétérogène.
- Documents Vercel Blob : vérifier expiration/URL signées + scope tenant avant génération du lien.

---

## 4. Tests d'autorisation à écrire (fondation anti-régression)

Workflows critiques, un test par ligne :
- [ ] `sales_rep` ne voit que ses clients/visites/devis (et pas ceux d'un autre rep).
- [ ] `manager` voit son équipe ; `admin` voit tout.
- [ ] `sales_rep` ne peut pas supprimer (clients/quotes) → 403.
- [ ] `sales_rep` ne peut pas approuver une commande → 403.
- [ ] `sales_rep` **ne peut pas** ajouter/modifier/supprimer une ligne sur le devis d'un autre rep (F-01).
- [ ] `sales_rep` ne peut pas `send`/`cancel` le devis d'un autre rep (F-02/F-03).
- [ ] Devis signé : lignes & édition verrouillées (409).
- [ ] Remise > 5% ou montant > 20000 ⇒ commande en `pending` + notif manager/finance.
- [ ] Webhook WhatsApp rejoué 2× ⇒ pas de doublon (idempotence `wa_message_id`).
- [ ] Webhook WhatsApp signature invalide ⇒ 403.

---

## 5. Questions bloquantes avant tout refactor
1. **Mono-tenant ou multi-tenant ?** (détermine s'il faut ajouter `company_id` partout). Recommandation :
   rester mono-tenant tant qu'un seul client, mais figer la décision.
2. **Couche cible** : centraliser l'accès DB derrière des services/repositories prenant `authContext`,
   ou se limiter d'abord à corriger les IDOR (F-01..F-05) ? Recommandation : corriger F-01..F-05 d'abord
   (rapide, haut risque), refactor services ensuite.
3. **Stratégie offline mobile** : où est la revalidation des permissions au moment du replay
   (`src/lib/offlineQueue.ts`) ? À auditer séparément (non couvert ici).
