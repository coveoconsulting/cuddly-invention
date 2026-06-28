import crypto from "node:crypto";
import { Pool } from "pg";
import type { Express, Request, RequestHandler, Response } from "express";

type AuthedRequest = Request & {
  authUser?: { id: string; role: string };
};

type Deps = {
  pool: Pool;
  requireAuth: RequestHandler;
  requirePermission: (permission: string) => RequestHandler;
  asyncRoute: <T extends Request = Request>(
    handler: (req: T, res: Response) => unknown,
  ) => RequestHandler;
  logInfo: (event: string, meta?: Record<string, unknown>) => void;
  logError: (event: string, meta?: Record<string, unknown>) => void;
};

type WhatsAppSettingsRow = {
  id: string;
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
  verify_token: string;
  app_secret: string;
  display_phone_number: string;
  default_language: string;
};

const META_GRAPH = "https://graph.facebook.com/v21.0";

function newId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function normalizePhone(input: string) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";
  const cleaned = trimmed.replace(/[^\d+]/g, "");
  return cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
}

async function getSettings(pool: Pool): Promise<WhatsAppSettingsRow> {
  const { rows } = await pool.query<WhatsAppSettingsRow>(
    `SELECT id, phone_number_id, business_account_id, access_token,
            verify_token, app_secret, display_phone_number, default_language
       FROM whatsapp_settings WHERE id = 'default'`,
  );
  if (rows[0]) return rows[0];
  await pool.query(`INSERT INTO whatsapp_settings (id) VALUES ('default') ON CONFLICT DO NOTHING`);
  const retry = await pool.query<WhatsAppSettingsRow>(
    `SELECT id, phone_number_id, business_account_id, access_token,
            verify_token, app_secret, display_phone_number, default_language
       FROM whatsapp_settings WHERE id = 'default'`,
  );
  return retry.rows[0];
}

function sanitizeSettings(row: WhatsAppSettingsRow) {
  return {
    phoneNumberId: row.phone_number_id,
    businessAccountId: row.business_account_id,
    displayPhoneNumber: row.display_phone_number,
    verifyToken: row.verify_token,
    defaultLanguage: row.default_language,
    hasAccessToken: Boolean(row.access_token),
    hasAppSecret: Boolean(row.app_secret),
    webhookUrl: "(set by deployment)",
  };
}

async function ensureContact(
  pool: Pool,
  phone: string,
  profileName?: string,
): Promise<{ id: string; phone: string; display_name: string }> {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("Numéro WhatsApp invalide");

  const existing = await pool.query<{ id: string; phone: string; display_name: string }>(
    `SELECT id, phone, display_name FROM whatsapp_contacts WHERE phone = $1`,
    [normalized],
  );
  if (existing.rows[0]) {
    if (profileName) {
      await pool.query(
        `UPDATE whatsapp_contacts SET profile_name = $2 WHERE id = $1 AND profile_name <> $2`,
        [existing.rows[0].id, profileName],
      );
    }
    return existing.rows[0];
  }

  const id = newId("wac");
  const linked = await pool.query<{ client_id: string | null; prospect_id: string | null; name: string | null }>(
    `SELECT
       (SELECT id FROM clients WHERE phone = $1 LIMIT 1) AS client_id,
       (SELECT id FROM prospects WHERE phone = $1 LIMIT 1) AS prospect_id,
       COALESCE(
         (SELECT name FROM clients WHERE phone = $1 LIMIT 1),
         (SELECT name FROM prospects WHERE phone = $1 LIMIT 1)
       ) AS name`,
    [normalized],
  );
  const link = linked.rows[0];
  const displayName = link?.name || profileName || `+${normalized}`;

  await pool.query(
    `INSERT INTO whatsapp_contacts (id, phone, display_name, profile_name, client_id, prospect_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, normalized, displayName, profileName ?? "", link?.client_id ?? null, link?.prospect_id ?? null],
  );
  return { id, phone: normalized, display_name: displayName };
}

type SseClient = { id: string; res: Response };
const sseClients = new Set<SseClient>();

function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of sseClients) {
    try {
      c.res.write(payload);
    } catch {
      sseClients.delete(c);
    }
  }
}

async function rowToMessage(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    contactId: row.contact_id as string,
    waMessageId: (row.wa_message_id as string | null) ?? null,
    direction: row.direction as "inbound" | "outbound",
    type: row.message_type as string,
    body: (row.body as string) ?? "",
    mediaUrl: (row.media_url as string | null) ?? null,
    mediaMime: (row.media_mime as string | null) ?? null,
    mediaFilename: (row.media_filename as string | null) ?? null,
    templateName: (row.template_name as string | null) ?? null,
    status: row.status as string,
    errorMessage: (row.error_message as string | null) ?? null,
    sentByUserId: (row.sent_by_user_id as string | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

async function postToMeta(
  settings: WhatsAppSettingsRow,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  if (!settings.access_token || !settings.phone_number_id) {
    return { ok: false, error: "WhatsApp non configuré (token ou phone_number_id manquant)" };
  }
  const url = `${META_GRAPH}/${settings.phone_number_id}/messages`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      return { ok: false, error: data?.error?.message || `HTTP ${response.status}` };
    }
    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

async function markReadOnMeta(settings: WhatsAppSettingsRow, waMessageId: string): Promise<void> {
  if (!settings.access_token || !settings.phone_number_id || !waMessageId) return;
  const url = `${META_GRAPH}/${settings.phone_number_id}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: waMessageId,
    }),
  }).catch(() => undefined);
}

function verifyMetaSignature(appSecret: string, rawBody: Buffer, signatureHeader: string | undefined) {
  if (!appSecret) return true; // not configured → skip enforcement (dev)
  if (!signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

async function processInboundPayload(pool: Pool, body: any, logInfo: Deps["logInfo"]) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value ?? {};
      const contactsMeta: any[] = Array.isArray(value?.contacts) ? value.contacts : [];
      const contactNameByWaId = new Map<string, string>();
      for (const c of contactsMeta) {
        if (c?.wa_id) contactNameByWaId.set(String(c.wa_id), String(c?.profile?.name ?? ""));
      }

      // incoming messages
      const messages: any[] = Array.isArray(value?.messages) ? value.messages : [];
      for (const msg of messages) {
        const fromPhone = String(msg.from || "");
        if (!fromPhone) continue;
        const profileName = contactNameByWaId.get(fromPhone) || "";
        const contact = await ensureContact(pool, fromPhone, profileName);

        const messageType = String(msg.type || "text");
        let body = "";
        let mediaUrl: string | null = null;
        let mediaMime: string | null = null;
        let mediaFilename: string | null = null;

        if (messageType === "text") {
          body = String(msg.text?.body || "");
        } else if (messageType === "image" || messageType === "document" || messageType === "audio" || messageType === "video" || messageType === "sticker") {
          const m = msg[messageType] ?? {};
          mediaMime = m.mime_type ?? null;
          mediaFilename = m.filename ?? null;
          mediaUrl = m.id ? `/api/whatsapp/media/${m.id}` : null;
          body = m.caption ?? "";
        } else if (messageType === "location") {
          body = `📍 ${msg.location?.latitude},${msg.location?.longitude}`;
        } else if (messageType === "reaction") {
          body = msg.reaction?.emoji ?? "";
        }

        const id = newId("wam");
        const waMessageId = String(msg.id || "");
        const createdAtIso = msg.timestamp
          ? new Date(Number(msg.timestamp) * 1000).toISOString()
          : new Date().toISOString();

        try {
          const inserted = await pool.query(
            `INSERT INTO whatsapp_messages
               (id, contact_id, wa_message_id, direction, message_type, body, media_url, media_mime, media_filename, status, created_at)
             VALUES ($1,$2,$3,'inbound',$4,$5,$6,$7,$8,'received',$9)
             ON CONFLICT (wa_message_id) DO NOTHING
             RETURNING *`,
            [id, contact.id, waMessageId || null, messageType, body, mediaUrl, mediaMime, mediaFilename, createdAtIso],
          );
          if (inserted.rowCount && inserted.rowCount > 0) {
            await pool.query(
              `UPDATE whatsapp_contacts
                 SET last_message_at = $2,
                     last_inbound_at = $2,
                     unread_count = unread_count + 1
               WHERE id = $1`,
              [contact.id, createdAtIso],
            );
            broadcast("message", await rowToMessage(inserted.rows[0]));
          }
        } catch (err) {
          logInfo("whatsapp.insert_message_failed", { err: (err as Error).message });
        }
      }

      // status updates (sent → delivered → read)
      const statuses: any[] = Array.isArray(value?.statuses) ? value.statuses : [];
      for (const st of statuses) {
        const waId = String(st.id || "");
        const status = String(st.status || "");
        if (!waId || !status) continue;
        const errMsg = st.errors?.[0]?.title ?? null;
        await pool.query(
          `UPDATE whatsapp_messages SET status = $2, error_message = $3 WHERE wa_message_id = $1`,
          [waId, status, errMsg],
        );
        broadcast("status", { waMessageId: waId, status, errorMessage: errMsg });
      }
    }
  }
}

export function mountWhatsAppRoutes(app: Express, deps: Deps) {
  const { pool, requireAuth, requirePermission, asyncRoute, logInfo, logError } = deps;

  // --- Webhook (no auth) — needs raw body for signature ---
  app.get("/api/whatsapp/webhook", (req: Request, res: Response) => {
    void (async () => {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];
      const settings = await getSettings(pool);
      if (mode === "subscribe" && token && String(token) === settings.verify_token && settings.verify_token) {
        res.status(200).send(String(challenge));
        return;
      }
      res.sendStatus(403);
    })().catch((e) => {
      logError("whatsapp.webhook_verify_failed", { error: (e as Error).message });
      res.sendStatus(500);
    });
  });

  app.post(
    "/api/whatsapp/webhook",
    // need raw body for signature check; capture before express.json (which is mounted globally).
    // Express.json already ran here, but body is preserved as parsed; we recompute signature from re-stringified payload.
    // For Meta payloads this works because Meta sends compact JSON we can reconstruct.
    (req: Request, res: Response) => {
      void (async () => {
        const settings = await getSettings(pool);
        const signature = (req.headers["x-hub-signature-256"] as string | undefined) || undefined;
        const raw =
          (req as Request & { rawBody?: Buffer }).rawBody ??
          Buffer.from(JSON.stringify(req.body ?? {}));
        if (settings.app_secret && !verifyMetaSignature(settings.app_secret, raw, signature)) {
          logInfo("whatsapp.signature_invalid", {});
          res.sendStatus(403);
          return;
        }
        await processInboundPayload(pool, req.body, logInfo);
        res.sendStatus(200);
      })().catch((e) => {
        logError("whatsapp.webhook_failed", { error: (e as Error).message });
        res.sendStatus(200); // always 200 so Meta doesn't disable webhook
      });
    },
  );

  // --- Authenticated API ---
  const api = "/api/v1/whatsapp";

  app.get(
    `${api}/settings`,
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (_req, res) => {
      const settings = await getSettings(pool);
      res.json(sanitizeSettings(settings));
    }),
  );

  app.patch(
    `${api}/settings`,
    requireAuth,
    requirePermission("settings.write"),
    asyncRoute(async (req: AuthedRequest, res) => {
      if (req.authUser?.role !== "admin" && req.authUser?.role !== "director") {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      const b = (req.body || {}) as Record<string, string | undefined>;
      const current = await getSettings(pool);
      const next = {
        phone_number_id: b.phoneNumberId ?? current.phone_number_id,
        business_account_id: b.businessAccountId ?? current.business_account_id,
        access_token: b.accessToken !== undefined ? String(b.accessToken) : current.access_token,
        verify_token: b.verifyToken ?? current.verify_token,
        app_secret: b.appSecret !== undefined ? String(b.appSecret) : current.app_secret,
        display_phone_number: b.displayPhoneNumber ?? current.display_phone_number,
        default_language: b.defaultLanguage ?? current.default_language,
      };
      await pool.query(
        `UPDATE whatsapp_settings
            SET phone_number_id=$1, business_account_id=$2, access_token=$3,
                verify_token=$4, app_secret=$5, display_phone_number=$6,
                default_language=$7, updated_at=NOW()
          WHERE id='default'`,
        [
          next.phone_number_id, next.business_account_id, next.access_token,
          next.verify_token, next.app_secret, next.display_phone_number,
          next.default_language,
        ],
      );
      const refreshed = await getSettings(pool);
      res.json(sanitizeSettings(refreshed));
    }),
  );

  app.get(
    `${api}/contacts`,
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (req: AuthedRequest, res) => {
      const filter = String(req.query.filter || "");
      const userId = req.authUser?.id ?? "";
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filter === "mine" && userId) {
        params.push(userId);
        conditions.push(`c.assigned_user_id = $${params.length}`);
      } else if (filter === "unassigned") {
        conditions.push(`c.assigned_user_id IS NULL`);
      } else if (filter === "unread") {
        conditions.push(`c.unread_count > 0`);
      } else if (filter === "unlinked") {
        conditions.push(`c.client_id IS NULL AND c.prospect_id IS NULL`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `SELECT c.id, c.phone, c.display_name, c.profile_name, c.client_id, c.prospect_id,
                c.assigned_user_id, c.last_message_at, c.last_inbound_at, c.unread_count,
                cl.name AS client_name, pr.name AS prospect_name, au.name AS assigned_name,
                (SELECT body FROM whatsapp_messages m
                   WHERE m.contact_id = c.id
                   ORDER BY m.created_at DESC LIMIT 1) AS last_body,
                (SELECT message_type FROM whatsapp_messages m
                   WHERE m.contact_id = c.id
                   ORDER BY m.created_at DESC LIMIT 1) AS last_type
           FROM whatsapp_contacts c
           LEFT JOIN clients cl ON cl.id = c.client_id
           LEFT JOIN prospects pr ON pr.id = c.prospect_id
           LEFT JOIN users au ON au.id = c.assigned_user_id
          ${where}
          ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
          LIMIT 500`,
        params,
      );
      res.json(
        rows.map((r) => ({
          id: r.id,
          phone: r.phone,
          displayName: r.display_name,
          profileName: r.profile_name,
          clientId: r.client_id,
          prospectId: r.prospect_id,
          linkedName: r.client_name || r.prospect_name || null,
          assignedUserId: r.assigned_user_id ?? null,
          assignedName: r.assigned_name ?? null,
          lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
          lastInboundAt: r.last_inbound_at ? new Date(r.last_inbound_at).toISOString() : null,
          unreadCount: Number(r.unread_count || 0),
          lastBody: r.last_body ?? "",
          lastType: r.last_type ?? null,
        })),
      );
    }),
  );

  // Active users that can own a conversation (assignment picker).
  app.get(
    `${api}/agents`,
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (_req, res) => {
      const { rows } = await pool.query(
        `SELECT id, name, initials FROM users WHERE active = TRUE ORDER BY name ASC LIMIT 200`,
      );
      res.json(rows.map((r) => ({ id: r.id, name: r.name, initials: r.initials })));
    }),
  );

  // Global unread counter (shared inbox badge).
  app.get(
    `${api}/unread-count`,
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (_req, res) => {
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(unread_count), 0)::int AS total FROM whatsapp_contacts`,
      );
      res.json({ total: Number(rows[0]?.total || 0) });
    }),
  );

  app.post(
    `${api}/contacts`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req, res) => {
      const phone = String(req.body?.phone || "");
      const displayName = req.body?.displayName ? String(req.body.displayName) : undefined;
      if (!phone) {
        res.status(400).json({ error: "Numéro requis" });
        return;
      }
      try {
        const contact = await ensureContact(pool, phone, displayName);
        if (displayName) {
          await pool.query(
            `UPDATE whatsapp_contacts SET display_name = $2 WHERE id = $1`,
            [contact.id, displayName],
          );
        }
        res.json({ id: contact.id, phone: contact.phone, displayName: displayName || contact.display_name });
      } catch (e) {
        res.status(400).json({ error: (e as Error).message });
      }
    }),
  );

  app.get(
    `${api}/contacts/:id/messages`,
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT * FROM whatsapp_messages
           WHERE contact_id = $1
           ORDER BY created_at ASC
           LIMIT 500`,
        [req.params.id],
      );
      const out = await Promise.all(rows.map(rowToMessage));
      res.json(out);
    }),
  );

  app.post(
    `${api}/contacts/:id/read`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req, res) => {
      await pool.query(
        `UPDATE whatsapp_contacts SET unread_count = 0 WHERE id = $1`,
        [req.params.id],
      );
      // Send a read receipt to Meta for the latest inbound message (blue ticks).
      try {
        const { rows } = await pool.query<{ wa_message_id: string | null }>(
          `SELECT wa_message_id FROM whatsapp_messages
             WHERE contact_id = $1 AND direction = 'inbound' AND wa_message_id IS NOT NULL
             ORDER BY created_at DESC LIMIT 1`,
          [req.params.id],
        );
        const waId = rows[0]?.wa_message_id;
        if (waId) {
          const settings = await getSettings(pool);
          await markReadOnMeta(settings, waId);
        }
      } catch (e) {
        logInfo("whatsapp.read_receipt_failed", { err: (e as Error).message });
      }
      res.json({ ok: true });
    }),
  );

  // Assign a conversation to a sales rep (or unassign with userId = null).
  app.post(
    `${api}/contacts/:id/assign`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req, res) => {
      const rawUserId = (req.body as { userId?: string | null } | undefined)?.userId;
      const userId = rawUserId ? String(rawUserId) : null;
      if (userId) {
        const check = await pool.query(`SELECT 1 FROM users WHERE id = $1 AND active = TRUE`, [userId]);
        if (check.rowCount === 0) {
          res.status(400).json({ error: "Utilisateur introuvable" });
          return;
        }
      }
      const updated = await pool.query(
        `UPDATE whatsapp_contacts SET assigned_user_id = $2 WHERE id = $1 RETURNING id`,
        [req.params.id, userId],
      );
      if (updated.rowCount === 0) {
        res.status(404).json({ error: "Contact introuvable" });
        return;
      }
      res.json({ ok: true, assignedUserId: userId });
    }),
  );

  // Link a conversation to an existing client or prospect.
  app.post(
    `${api}/contacts/:id/link`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req, res) => {
      const b = (req.body || {}) as { clientId?: string | null; prospectId?: string | null };
      const clientId = b.clientId ? String(b.clientId) : null;
      const prospectId = b.prospectId ? String(b.prospectId) : null;
      let linkedName: string | null = null;
      if (clientId) {
        const r = await pool.query<{ name: string }>(`SELECT name FROM clients WHERE id = $1`, [clientId]);
        if (r.rowCount === 0) { res.status(400).json({ error: "Client introuvable" }); return; }
        linkedName = r.rows[0].name;
      } else if (prospectId) {
        const r = await pool.query<{ name: string }>(`SELECT name FROM prospects WHERE id = $1`, [prospectId]);
        if (r.rowCount === 0) { res.status(400).json({ error: "Prospect introuvable" }); return; }
        linkedName = r.rows[0].name;
      } else {
        res.status(400).json({ error: "clientId ou prospectId requis" });
        return;
      }
      const updated = await pool.query(
        `UPDATE whatsapp_contacts
            SET client_id = $2, prospect_id = $3,
                display_name = CASE WHEN $4 <> '' THEN $4 ELSE display_name END
          WHERE id = $1 RETURNING id`,
        [req.params.id, clientId, prospectId, linkedName ?? ""],
      );
      if (updated.rowCount === 0) {
        res.status(404).json({ error: "Contact introuvable" });
        return;
      }
      res.json({ ok: true, clientId, prospectId, linkedName });
    }),
  );

  // Create a prospect straight from a WhatsApp conversation and link it.
  app.post(
    `${api}/contacts/:id/create-prospect`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthedRequest, res) => {
      const ownerId = req.authUser?.id ?? "";
      const contactRow = await pool.query<{ id: string; phone: string; display_name: string; profile_name: string; prospect_id: string | null }>(
        `SELECT id, phone, display_name, profile_name, prospect_id FROM whatsapp_contacts WHERE id = $1`,
        [req.params.id],
      );
      const contact = contactRow.rows[0];
      if (!contact) { res.status(404).json({ error: "Contact introuvable" }); return; }
      if (contact.prospect_id) { res.status(409).json({ error: "Déjà lié à un prospect" }); return; }

      // Resolve a territory for the new prospect: the owner's first territory, else any.
      const terr = await pool.query<{ territory_id: string }>(
        `SELECT territory_id FROM user_territories WHERE user_id = $1 ORDER BY position ASC LIMIT 1`,
        [ownerId],
      );
      let territoryId = terr.rows[0]?.territory_id ?? null;
      if (!territoryId) {
        const anyTerr = await pool.query<{ id: string }>(`SELECT id FROM territories ORDER BY id ASC LIMIT 1`);
        territoryId = anyTerr.rows[0]?.id ?? null;
      }
      if (!territoryId || !ownerId) {
        res.status(400).json({ error: "Impossible de déterminer le territoire/propriétaire" });
        return;
      }

      const name = (req.body as { name?: string } | undefined)?.name?.trim()
        || contact.display_name
        || contact.profile_name
        || `+${contact.phone}`;
      const prospectId = `prospect-${crypto.randomUUID()}`;
      await pool.query(
        `INSERT INTO prospects (id, name, contact_name, phone, email, source, status, score, owner_user_id, territory_id, notes)
         VALUES ($1,$2,$3,$4,'','WhatsApp','new',50,$5,$6,'Créé depuis une conversation WhatsApp.')`,
        [prospectId, name, contact.profile_name || "", contact.phone, ownerId, territoryId],
      );
      await pool.query(
        `UPDATE whatsapp_contacts SET prospect_id = $2, display_name = $3 WHERE id = $1`,
        [contact.id, prospectId, name],
      );
      await pool.query(
        `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, meta)
         VALUES ($1,$2,'prospect.created','prospect',$3,$4)`,
        [newId("aud"), ownerId, prospectId, JSON.stringify({ via: "whatsapp", contactId: contact.id })],
      ).catch(() => undefined);
      res.json({ ok: true, prospectId, name });
    }),
  );

  // Log the conversation as a CRM activity on the linked client/prospect.
  app.post(
    `${api}/contacts/:id/log-activity`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthedRequest, res) => {
      const ownerId = req.authUser?.id ?? "";
      const contactRow = await pool.query<{ id: string; display_name: string; phone: string; client_id: string | null; prospect_id: string | null }>(
        `SELECT id, display_name, phone, client_id, prospect_id FROM whatsapp_contacts WHERE id = $1`,
        [req.params.id],
      );
      const contact = contactRow.rows[0];
      if (!contact) { res.status(404).json({ error: "Contact introuvable" }); return; }
      if (!contact.client_id && !contact.prospect_id) {
        res.status(400).json({ error: "Liez d'abord la conversation à un client ou prospect" });
        return;
      }
      const note = (req.body as { note?: string } | undefined)?.note?.trim() || "";
      const stats = await pool.query<{ total: string; last_body: string | null }>(
        `SELECT COUNT(*)::text AS total,
                (SELECT body FROM whatsapp_messages WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 1) AS last_body
           FROM whatsapp_messages WHERE contact_id = $1`,
        [contact.id],
      );
      const total = stats.rows[0]?.total ?? "0";
      const lastBody = stats.rows[0]?.last_body ?? "";
      const content = note
        || `Conversation WhatsApp (${total} message(s)). Dernier message : ${lastBody || "—"}`;
      const activityId = `activity-${crypto.randomUUID()}`;
      await pool.query(
        `INSERT INTO activities (id, type, subject, content, owner_user_id, client_id, prospect_id, completed_at)
         VALUES ($1,'note',$2,$3,$4,$5,$6,NOW())`,
        [
          activityId,
          `Échange WhatsApp · +${contact.phone}`,
          content,
          ownerId,
          contact.client_id,
          contact.prospect_id,
        ],
      );
      res.json({ ok: true, activityId });
    }),
  );

  // Approved WhatsApp message templates from the WABA (for out-of-window sends).
  app.get(
    `${api}/templates`,
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (_req, res) => {
      const settings = await getSettings(pool);
      if (!settings.access_token || !settings.business_account_id) {
        res.json([]);
        return;
      }
      try {
        const url = `${META_GRAPH}/${settings.business_account_id}/message_templates?status=APPROVED&limit=200`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${settings.access_token}` } });
        const data = (await r.json().catch(() => ({}))) as {
          data?: Array<{
            name: string;
            language: string;
            category: string;
            status: string;
            components?: Array<{ type: string; text?: string }>;
          }>;
          error?: { message?: string };
        };
        if (!r.ok) {
          res.status(502).json({ error: data?.error?.message || `HTTP ${r.status}` });
          return;
        }
        const templates = (data.data ?? []).map((t) => ({
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          body: (t.components ?? []).find((c) => c.type === "BODY")?.text ?? "",
        }));
        res.json(templates);
      } catch (e) {
        res.status(502).json({ error: (e as Error).message });
      }
    }),
  );

  app.post(
    `${api}/contacts/:id/messages`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthedRequest, res) => {
      const contactId = req.params.id;
      const body = (req.body || {}) as {
        text?: string;
        templateName?: string;
        templateLanguage?: string;
        templateParams?: string[];
        mediaUrl?: string;
        mediaType?: "image" | "document" | "audio" | "video";
        mediaFilename?: string;
        mediaCaption?: string;
      };

      const settings = await getSettings(pool);
      const contactRow = await pool.query<{ id: string; phone: string }>(
        `SELECT id, phone FROM whatsapp_contacts WHERE id = $1`,
        [contactId],
      );
      const contact = contactRow.rows[0];
      if (!contact) {
        res.status(404).json({ error: "Contact introuvable" });
        return;
      }

      let metaBody: Record<string, unknown>;
      let messageType = "text";
      let storedBody = body.text ?? "";
      let storedMediaUrl: string | null = null;
      let storedMediaMime: string | null = null;
      let storedMediaFilename: string | null = null;
      let templateName: string | null = null;

      if (body.templateName) {
        messageType = "template";
        templateName = body.templateName;
        storedBody = `[template: ${body.templateName}] ${(body.templateParams ?? []).join(" | ")}`;
        const components = body.templateParams && body.templateParams.length > 0
          ? [{
              type: "body",
              parameters: body.templateParams.map((p) => ({ type: "text", text: String(p) })),
            }]
          : undefined;
        metaBody = {
          messaging_product: "whatsapp",
          to: contact.phone,
          type: "template",
          template: {
            name: body.templateName,
            language: { code: body.templateLanguage || settings.default_language || "fr" },
            ...(components ? { components } : {}),
          },
        };
      } else if (body.mediaUrl && body.mediaType) {
        messageType = body.mediaType;
        storedMediaUrl = body.mediaUrl;
        storedMediaFilename = body.mediaFilename ?? null;
        storedBody = body.mediaCaption ?? "";
        const mediaObj: Record<string, unknown> = { link: body.mediaUrl };
        if (body.mediaCaption && (body.mediaType === "image" || body.mediaType === "document" || body.mediaType === "video")) {
          mediaObj.caption = body.mediaCaption;
        }
        if (body.mediaType === "document" && body.mediaFilename) {
          mediaObj.filename = body.mediaFilename;
        }
        metaBody = {
          messaging_product: "whatsapp",
          to: contact.phone,
          type: body.mediaType,
          [body.mediaType]: mediaObj,
        };
      } else {
        const text = (body.text ?? "").trim();
        if (!text) {
          res.status(400).json({ error: "Message vide" });
          return;
        }
        storedBody = text;
        metaBody = {
          messaging_product: "whatsapp",
          to: contact.phone,
          type: "text",
          text: { body: text, preview_url: true },
        };
      }

      const result = await postToMeta(settings, metaBody);
      const id = newId("wam");
      const status = result.ok ? "sent" : "failed";
      const errMsg = result.ok ? null : (result.error ?? "Erreur inconnue");

      const inserted = await pool.query(
        `INSERT INTO whatsapp_messages
           (id, contact_id, wa_message_id, direction, message_type, body,
            media_url, media_mime, media_filename, template_name, status,
            error_message, sent_by_user_id)
         VALUES ($1,$2,$3,'outbound',$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          id, contactId, result.messageId ?? null, messageType, storedBody,
          storedMediaUrl, storedMediaMime, storedMediaFilename, templateName,
          status, errMsg, req.authUser?.id ?? null,
        ],
      );
      await pool.query(
        `UPDATE whatsapp_contacts SET last_message_at = NOW() WHERE id = $1`,
        [contactId],
      );

      const message = await rowToMessage(inserted.rows[0]);
      broadcast("message", message);
      if (!result.ok) {
        res.status(502).json({ ...message, error: errMsg });
        return;
      }
      res.json(message);
    }),
  );

  // Media proxy: stream media from Meta on demand (incoming attachments).
  app.get(
    "/api/whatsapp/media/:mediaId",
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (req, res) => {
      const settings = await getSettings(pool);
      if (!settings.access_token) {
        res.status(503).json({ error: "WhatsApp non configuré" });
        return;
      }
      try {
        const metaRes = await fetch(`${META_GRAPH}/${req.params.mediaId}`, {
          headers: { Authorization: `Bearer ${settings.access_token}` },
        });
        if (!metaRes.ok) {
          res.status(metaRes.status).end();
          return;
        }
        const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
        if (!meta.url) {
          res.status(404).end();
          return;
        }
        const fileRes = await fetch(meta.url, {
          headers: { Authorization: `Bearer ${settings.access_token}` },
        });
        if (!fileRes.ok || !fileRes.body) {
          res.status(fileRes.status || 500).end();
          return;
        }
        if (meta.mime_type) res.setHeader("Content-Type", meta.mime_type);
        res.setHeader("Cache-Control", "private, max-age=86400");
        const reader = fileRes.body.getReader();
        const pump = async () => {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        };
        await pump();
      } catch (e) {
        logError("whatsapp.media_proxy_failed", { error: (e as Error).message });
        res.status(500).end();
      }
    }),
  );

  // SSE stream
  app.get(
    `${api}/stream`,
    requireAuth,
    requirePermission("clients.read"),
    (req: Request, res: Response) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      res.write(`event: hello\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
      const client: SseClient = { id: newId("sse"), res };
      sseClients.add(client);
      const heartbeat = setInterval(() => {
        try { res.write(`: ping\n\n`); } catch { /* ignore */ }
      }, 25_000);
      req.on("close", () => {
        clearInterval(heartbeat);
        sseClients.delete(client);
      });
    },
  );

  logInfo("whatsapp.routes_mounted", {});
}
