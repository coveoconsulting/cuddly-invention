import crypto from "node:crypto";
import express from "express";
import type { Pool } from "pg";
import type { Express, Request, RequestHandler, Response } from "express";

type AuthedRequest = Request & {
  authUser?: { id: string; role: string; name?: string; email?: string; teamId?: string };
};

export type CrmFlowDeps = {
  pool: Pool;
  requireAuth: RequestHandler;
  requirePermission: (permission: string) => RequestHandler;
  asyncRoute: <T extends Request = Request>(
    handler: (req: T, res: Response) => unknown,
  ) => RequestHandler;
  logInfo: (event: string, meta?: Record<string, unknown>) => void;
  logError: (event: string, meta?: Record<string, unknown>) => void;
  publicBaseUrl: () => string;
  sendEmail?: (to: string, subject: string, html: string, text: string) => Promise<boolean>;
};

// Roles allowed to manage shared CRM resources (settings, others' comments).
const POWER_ROLES = new Set(["super_admin", "admin", "director"]);
// Roles with global read visibility — mirrors GLOBAL_READ_ROLES in server.ts so the
// "who can see whose data" rule is identical across both backend layers.
const GLOBAL_READ_ROLES = new Set([
  "super_admin", "admin", "director", "finance", "logistics", "support", "viewer",
]);
const ENTITY_TYPES = new Set(["client", "prospect", "opportunity", "quote", "order", "visit"]);

function newId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function toNumber(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function visibleUserIds(pool: Pool, actor: AuthedRequest["authUser"]): Promise<Set<string> | "all"> {
  if (!actor) return new Set();
  if (GLOBAL_READ_ROLES.has(actor.role)) return "all";
  if (actor.role === "manager" && actor.teamId) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE team_id = $1`,
      [actor.teamId],
    );
    return new Set(rows.map((r) => r.id));
  }
  return new Set([actor.id]);
}

function canSee(visible: Set<string> | "all", ownerUserId: string) {
  return visible === "all" || visible.has(ownerUserId);
}

// Horizontal-access guard for quote sub-resources. Every /quotes/:id* mutation must
// confirm the caller can see the quote's owner, otherwise a rep could alter another
// rep's quote (lines/prices/discounts, sending, cancelling) just by knowing its id.
async function ensureQuoteOwnerVisible(
  pool: Pool,
  actor: AuthedRequest["authUser"],
  ownerUserId: string,
): Promise<boolean> {
  const visible = await visibleUserIds(pool, actor);
  return canSee(visible, ownerUserId);
}

async function nextQuoteNumber(pool: Pool): Promise<{ number: string; prefix: string }> {
  const { rows } = await pool.query<{ quote_number_prefix: string; quote_number_counter: number }>(
    `UPDATE crm_settings
        SET quote_number_counter = quote_number_counter + 1
      WHERE id = 'default'
      RETURNING quote_number_prefix, quote_number_counter`,
  );
  const row = rows[0];
  if (!row) throw new Error("crm_settings introuvable");
  const year = new Date().getFullYear();
  const padded = String(row.quote_number_counter).padStart(4, "0");
  return { number: `${row.quote_number_prefix}-${year}-${padded}`, prefix: row.quote_number_prefix };
}

async function ensureSignatureSecret(pool: Pool): Promise<string> {
  const { rows } = await pool.query<{ signature_token_secret: string }>(
    `SELECT signature_token_secret FROM crm_settings WHERE id='default'`,
  );
  let secret = rows[0]?.signature_token_secret ?? "";
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `UPDATE crm_settings SET signature_token_secret = $1 WHERE id='default'`,
      [secret],
    );
  }
  return secret;
}

function signToken(secret: string, payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(secret: string, token: string): Record<string, unknown> | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch { return null; }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof payload.exp === "number" && payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

type QuoteRow = Record<string, unknown>;
type LineRow = Record<string, unknown>;

async function uploadSignatureToBlob(dataUrl: string, quoteId: string): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return null;
    const contentType = match[1];
    const buf = Buffer.from(match[2], "base64");
    const { put } = await import("@vercel/blob");
    const ext = contentType.split("/")[1] || "png";
    const { url } = await put(`signatures/${quoteId}-${Date.now()}.${ext}`, buf, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    return url;
  } catch {
    return null;
  }
}

async function fetchSignatureBytes(quote: Record<string, unknown>): Promise<Buffer | null> {
  if (quote.signature_url) {
    try {
      const r = await fetch(String(quote.signature_url));
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch {
      /* fall through */
    }
  }
  if (quote.signature_data_url) {
    const b64 = String(quote.signature_data_url).split(",")[1];
    if (b64) return Buffer.from(b64, "base64");
  }
  return null;
}

function mapQuote(row: QuoteRow, lines: LineRow[] = [], attachments: Array<Record<string, unknown>> = []): Record<string, unknown> {
  return {
    id: row.id,
    number: row.number,
    clientId: row.client_id ?? null,
    prospectId: row.prospect_id ?? null,
    opportunityId: row.opportunity_id ?? null,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name ?? "",
    territoryId: row.territory_id,
    status: row.status,
    title: row.title ?? "",
    clientName: row.client_name,
    clientContact: row.client_contact ?? "",
    clientEmail: row.client_email ?? "",
    clientAddress: row.client_address ?? "",
    currency: row.currency,
    taxRate: toNumber(row.tax_rate),
    subtotal: toNumber(row.subtotal),
    taxAmount: toNumber(row.tax_amount),
    total: toNumber(row.total),
    notes: row.notes ?? "",
    terms: row.terms ?? "",
    paymentTerms: row.payment_terms ?? "",
    issuedAt: row.issued_at ? new Date(row.issued_at as string).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at as string).toISOString() : null,
    sentAt: row.sent_at ? new Date(row.sent_at as string).toISOString() : null,
    signedAt: row.signed_at ? new Date(row.signed_at as string).toISOString() : null,
    signedByName: row.signed_by_name ?? null,
    signedByEmail: row.signed_by_email ?? null,
    signatureDataUrl: row.signature_data_url ?? null,
    signatureUrl: row.signature_url ?? null,
    refusedReason: row.refused_reason ?? null,
    orderId: row.order_id ?? null,
    reminderCount: toNumber(row.reminder_count),
    lastReminderAt: row.last_reminder_at ? new Date(row.last_reminder_at as string).toISOString() : null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
    lines: lines.map(mapLine),
    attachments: attachments.map(mapAttachment),
  };
}

function mapAttachment(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    blobUrl: row.blob_url,
    sizeBytes: toNumber(row.size_bytes),
    contentType: row.content_type ?? "",
    uploadedByUserId: row.uploaded_by_user_id ?? null,
    uploadedByName: row.uploaded_by_name ?? null,
    visibleToClient: Boolean(row.visible_to_client),
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function mapLine(row: LineRow): Record<string, unknown> {
  return {
    id: row.id,
    position: toNumber(row.position),
    productId: row.product_id ?? null,
    description: row.description ?? "",
    quantity: toNumber(row.quantity, 1),
    unitPrice: toNumber(row.unit_price),
    discountPercent: toNumber(row.discount_percent),
    lineTotal: toNumber(row.line_total),
  };
}

function computeLine(line: { quantity: number; unitPrice: number; discountPercent: number }) {
  const gross = line.quantity * line.unitPrice;
  const discount = gross * (line.discountPercent / 100);
  return round2(gross - discount);
}

async function recomputeQuoteTotals(pool: Pool, quoteId: string) {
  const { rows: lines } = await pool.query(
    `SELECT line_total FROM quote_lines WHERE quote_id = $1`,
    [quoteId],
  );
  const subtotal = round2(lines.reduce((s, r) => s + toNumber(r.line_total), 0));
  const { rows: q } = await pool.query<{ tax_rate: string }>(
    `SELECT tax_rate FROM quotes WHERE id = $1`,
    [quoteId],
  );
  const taxRate = toNumber(q[0]?.tax_rate);
  const taxAmount = round2(subtotal * (taxRate / 100));
  const total = round2(subtotal + taxAmount);
  await pool.query(
    `UPDATE quotes SET subtotal=$2, tax_amount=$3, total=$4 WHERE id=$1`,
    [quoteId, subtotal, taxAmount, total],
  );
  return { subtotal, taxAmount, total };
}

async function loadQuote(
  pool: Pool,
  id: string,
): Promise<{ quote: QuoteRow; lines: LineRow[]; attachments: Array<Record<string, unknown>> } | null> {
  const { rows } = await pool.query(
    `SELECT q.*, u.name AS owner_name
       FROM quotes q
       LEFT JOIN users u ON u.id = q.owner_user_id
      WHERE q.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const { rows: lineRows } = await pool.query(
    `SELECT * FROM quote_lines WHERE quote_id = $1 ORDER BY position ASC, id ASC`,
    [id],
  );
  const { rows: attRows } = await pool.query(
    `SELECT a.*, u.name AS uploaded_by_name
       FROM quote_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by_user_id
      WHERE a.quote_id = $1
      ORDER BY a.created_at DESC`,
    [id],
  );
  return { quote: rows[0], lines: lineRows, attachments: attRows };
}

// ---------- PDF -----------------------------------------------------------

async function generateQuotePdf(quote: ReturnType<typeof mapQuote>, settings: Record<string, unknown>): Promise<Buffer> {
  const { default: PDFDocument } = await import("pdfkit");
  const q = quote as Record<string, unknown>;
  // Pre-fetch signature image so we can include it synchronously below.
  const signatureBytes = (q.signedAt && (q.signatureUrl || q.signatureDataUrl))
    ? await fetchSignatureBytes({
        signature_url: q.signatureUrl,
        signature_data_url: q.signatureDataUrl,
      })
    : null;
  return await new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.fontSize(20).text(String(q.title || `Devis ${q.number}`), { continued: false });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#555").text(`N° ${q.number}`);
      if (q.issuedAt) doc.text(`Émis le : ${new Date(String(q.issuedAt)).toLocaleDateString("fr-FR")}`);
      if (q.expiresAt) doc.text(`Valable jusqu'au : ${new Date(String(q.expiresAt)).toLocaleDateString("fr-FR")}`);
      doc.moveDown();

      doc.fillColor("#000").fontSize(11).text("Client", { underline: true });
      doc.fontSize(10).text(String(q.clientName || ""));
      if (q.clientContact) doc.text(String(q.clientContact));
      if (q.clientAddress) doc.text(String(q.clientAddress));
      if (q.clientEmail) doc.text(String(q.clientEmail));
      doc.moveDown();

      // table header
      const tableTop = doc.y;
      const colX = { desc: 50, qty: 320, pu: 380, rem: 450, total: 510 };
      doc.fontSize(10).fillColor("#000");
      doc.text("Description", colX.desc, tableTop);
      doc.text("Qté", colX.qty, tableTop);
      doc.text("PU", colX.pu, tableTop);
      doc.text("Rem%", colX.rem, tableTop);
      doc.text("Total", colX.total, tableTop, { width: 50, align: "right" });
      doc.moveTo(50, tableTop + 14).lineTo(560, tableTop + 14).strokeColor("#ccc").stroke();
      doc.y = tableTop + 18;

      const lines = (q.lines as Array<Record<string, unknown>>) || [];
      for (const line of lines) {
        const y = doc.y;
        doc.text(String(line.description ?? ""), colX.desc, y, { width: 260 });
        doc.text(String(line.quantity ?? 0), colX.qty, y);
        doc.text(Number(line.unitPrice ?? 0).toFixed(2), colX.pu, y);
        doc.text(Number(line.discountPercent ?? 0).toFixed(1), colX.rem, y);
        doc.text(Number(line.lineTotal ?? 0).toFixed(2), colX.total, y, { width: 50, align: "right" });
        doc.moveDown(0.5);
      }

      doc.moveDown();
      const totalsX = 380;
      doc.fontSize(10);
      doc.text(`Sous-total : ${Number(q.subtotal ?? 0).toFixed(2)} ${q.currency}`, totalsX, doc.y);
      doc.text(`TVA (${Number(q.taxRate ?? 0).toFixed(2)}%) : ${Number(q.taxAmount ?? 0).toFixed(2)} ${q.currency}`, totalsX);
      doc.fontSize(12).fillColor("#000").text(`TOTAL : ${Number(q.total ?? 0).toFixed(2)} ${q.currency}`, totalsX);
      doc.moveDown(2).fontSize(9).fillColor("#555");

      if (q.paymentTerms) {
        doc.fillColor("#000").fontSize(10).text("Conditions de paiement", 50, doc.y);
        doc.fontSize(9).fillColor("#555").text(String(q.paymentTerms), { width: 500 });
        doc.moveDown(0.5);
      }
      if (q.terms) {
        doc.fillColor("#000").fontSize(10).text("Conditions générales", 50, doc.y);
        doc.fontSize(9).fillColor("#555").text(String(q.terms), { width: 500 });
        doc.moveDown(0.5);
      }
      if (settings.legal_mentions) {
        doc.fontSize(8).fillColor("#999").text(String(settings.legal_mentions), 50, 780, { width: 500, align: "center" });
      }

      if (signatureBytes) {
        try {
          doc.addPage().fontSize(14).fillColor("#000").text("Signature", { underline: true });
          doc.fontSize(10).text(`Signé par : ${q.signedByName ?? ""}`);
          if (q.signedByEmail) doc.text(`Email : ${q.signedByEmail}`);
          doc.text(`Date : ${new Date(String(q.signedAt)).toLocaleString("fr-FR")}`);
          doc.moveDown();
          doc.image(signatureBytes, { width: 300 });
        } catch {
          /* ignore */
        }
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ---------- Routes --------------------------------------------------------

export function mountCrmFlowRoutes(app: Express, deps: CrmFlowDeps) {
  const { pool, requireAuth, requirePermission, asyncRoute, logInfo, logError, publicBaseUrl, sendEmail } = deps;
  const API = "/api/v1";

  // ------ CRM settings ----------------------------------------------------
  app.get(`${API}/crm-settings`, requireAuth, requirePermission("settings.read"), asyncRoute(async (_req, res) => {
    const { rows } = await pool.query(`SELECT * FROM crm_settings WHERE id='default'`);
    const r = rows[0] || {};
    res.json({
      quoteNumberPrefix: r.quote_number_prefix ?? "DEV",
      quoteNumberCounter: toNumber(r.quote_number_counter),
      quoteValidityDays: toNumber(r.quote_validity_days, 30),
      defaultTaxRate: toNumber(r.default_tax_rate),
      defaultPaymentTerms: r.default_payment_terms ?? "",
      defaultQuoteTerms: r.default_quote_terms ?? "",
      legalMentions: r.legal_mentions ?? "",
      quoteEmailSubject: r.quote_email_subject ?? "",
      quoteEmailBody: r.quote_email_body ?? "",
    });
  }));

  app.patch(`${API}/crm-settings`, requireAuth, requirePermission("settings.write"), asyncRoute(async (req: AuthedRequest, res) => {
    if (!POWER_ROLES.has(req.authUser?.role ?? "")) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const b = (req.body || {}) as Record<string, unknown>;
    await pool.query(
      `UPDATE crm_settings SET
         quote_number_prefix    = COALESCE($1, quote_number_prefix),
         quote_validity_days    = COALESCE($2, quote_validity_days),
         default_tax_rate       = COALESCE($3, default_tax_rate),
         default_payment_terms  = COALESCE($4, default_payment_terms),
         default_quote_terms    = COALESCE($5, default_quote_terms),
         legal_mentions         = COALESCE($6, legal_mentions),
         quote_email_subject    = COALESCE($7, quote_email_subject),
         quote_email_body       = COALESCE($8, quote_email_body),
         updated_at             = NOW()
       WHERE id='default'`,
      [
        b.quoteNumberPrefix !== undefined ? String(b.quoteNumberPrefix) : null,
        b.quoteValidityDays !== undefined ? toNumber(b.quoteValidityDays, 30) : null,
        b.defaultTaxRate !== undefined ? toNumber(b.defaultTaxRate) : null,
        b.defaultPaymentTerms !== undefined ? String(b.defaultPaymentTerms) : null,
        b.defaultQuoteTerms !== undefined ? String(b.defaultQuoteTerms) : null,
        b.legalMentions !== undefined ? String(b.legalMentions) : null,
        b.quoteEmailSubject !== undefined ? String(b.quoteEmailSubject) : null,
        b.quoteEmailBody !== undefined ? String(b.quoteEmailBody) : null,
      ],
    );
    res.json({ ok: true });
  }));

  // ------ Comments --------------------------------------------------------
  app.get(`${API}/comments`, requireAuth, requirePermission("clients.read"), asyncRoute(async (req, res) => {
    const entityType = String(req.query.entityType || "");
    const entityId = String(req.query.entityId || "");
    if (!ENTITY_TYPES.has(entityType) || !entityId) {
      res.status(400).json({ error: "entityType/entityId requis" }); return;
    }
    const { rows } = await pool.query(
      `SELECT c.id, c.entity_type, c.entity_id, c.author_user_id, c.body, c.pinned, c.created_at,
              u.name AS author_name, u.initials AS author_initials
         FROM comments c
         LEFT JOIN users u ON u.id = c.author_user_id
        WHERE c.entity_type = $1 AND c.entity_id = $2
        ORDER BY c.pinned DESC, c.created_at DESC
        LIMIT 500`,
      [entityType, entityId],
    );
    res.json(rows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      authorUserId: r.author_user_id,
      authorName: r.author_name ?? "",
      authorInitials: r.author_initials ?? "",
      body: r.body,
      pinned: r.pinned,
      createdAt: new Date(r.created_at).toISOString(),
    })));
  }));

  app.post(`${API}/comments`, requireAuth, requirePermission("clients.write"), asyncRoute(async (req: AuthedRequest, res) => {
    const b = req.body || {};
    const entityType = String(b.entityType || "");
    const entityId = String(b.entityId || "");
    const body = String(b.body || "").trim();
    if (!ENTITY_TYPES.has(entityType) || !entityId || !body) {
      res.status(400).json({ error: "Champs invalides" }); return;
    }
    const id = newId("cmt");
    await pool.query(
      `INSERT INTO comments (id, entity_type, entity_id, author_user_id, body)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, entityType, entityId, req.authUser?.id ?? null, body],
    );
    res.json({ id });
  }));

  app.delete(`${API}/comments/:id`, requireAuth, requirePermission("clients.write"), asyncRoute(async (req: AuthedRequest, res) => {
    const { rows } = await pool.query(`SELECT author_user_id FROM comments WHERE id=$1`, [req.params.id]);
    const author = rows[0]?.author_user_id as string | undefined;
    if (!author) { res.status(404).json({ error: "Introuvable" }); return; }
    if (author !== req.authUser?.id && !POWER_ROLES.has(req.authUser?.role ?? "")) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    await pool.query(`DELETE FROM comments WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  }));

  // ------ Client detail (extended) ---------------------------------------
  app.get(`${API}/clients/:id/detail`, requireAuth, requirePermission("clients.read"), asyncRoute(async (req: AuthedRequest, res) => {
    const id = req.params.id;
    const visible = await visibleUserIds(pool, req.authUser);
    const { rows } = await pool.query(
      `SELECT c.*, t.label AS territory_label, u.name AS owner_name
         FROM clients c
         LEFT JOIN territories t ON t.id = c.territory_id
         LEFT JOIN users u ON u.id = c.owner_user_id
        WHERE c.id = $1`,
      [id],
    );
    const c = rows[0];
    if (!c) { res.status(404).json({ error: "Client introuvable" }); return; }
    if (!canSee(visible, c.owner_user_id)) { res.status(404).json({ error: "Client introuvable" }); return; }

    const [{ rows: visits }, { rows: opps }, { rows: orders }, { rows: docs }, { rows: quotes }] = await Promise.all([
      pool.query(`SELECT id, scheduled_date, status, objective, owner_user_id FROM visits WHERE client_id=$1 ORDER BY scheduled_date DESC LIMIT 50`, [id]),
      pool.query(`SELECT id, stage, amount, expected_close, priority FROM opportunities WHERE client_id=$1 ORDER BY expected_close DESC LIMIT 50`, [id]),
      pool.query(`SELECT id, date, amount, status, approval_status FROM orders WHERE client_id=$1 ORDER BY date DESC LIMIT 50`, [id]),
      pool.query(`SELECT id, name, blob_url, size_bytes, created_at, signed_at FROM documents WHERE client_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]),
      pool.query(`SELECT id, number, status, total, currency, issued_at, signed_at FROM quotes WHERE client_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]),
    ]);

    res.json({
      client: {
        id: c.id, name: c.name, type: c.type, status: c.status, segment: c.segment,
        address: c.address ?? "", city: c.city ?? "", zone: c.zone ?? "",
        contactName: c.contact_name ?? "", phone: c.phone ?? "", email: c.email ?? "",
        notes: c.notes ?? "",
        potentialScore: c.potential_score, financialRisk: c.financial_risk,
        territoryId: c.territory_id, territoryLabel: c.territory_label ?? "",
        ownerUserId: c.owner_user_id, ownerName: c.owner_name ?? "",
        lastVisit: c.last_visit, nextVisit: c.next_visit,
      },
      visits: visits.map((v) => ({ id: v.id, scheduledDate: v.scheduled_date, status: v.status, objective: v.objective })),
      opportunities: opps.map((o) => ({ id: o.id, stage: o.stage, amount: toNumber(o.amount), expectedClose: o.expected_close, priority: o.priority })),
      orders: orders.map((o) => ({ id: o.id, date: o.date, amount: toNumber(o.amount), status: o.status, approvalStatus: o.approval_status })),
      documents: docs.map((d) => ({ id: d.id, name: d.name, blobUrl: d.blob_url, sizeBytes: toNumber(d.size_bytes), createdAt: d.created_at, signedAt: d.signed_at })),
      quotes: quotes.map((q) => ({ id: q.id, number: q.number, status: q.status, total: toNumber(q.total), currency: q.currency, issuedAt: q.issued_at, signedAt: q.signed_at })),
    });
  }));

  // Extended PATCH for client (extra fields not in original)
  app.patch(`${API}/clients/:id/extra`, requireAuth, requirePermission("clients.write"), asyncRoute(async (req: AuthedRequest, res) => {
    if (!req.authUser) { res.status(401).json({ error: "Auth requise" }); return; }
    const b = req.body || {};
    const { rows } = await pool.query(`SELECT owner_user_id FROM clients WHERE id=$1`, [req.params.id]);
    const owner = rows[0]?.owner_user_id as string | undefined;
    if (!owner) { res.status(404).json({ error: "Client introuvable" }); return; }
    const visible = await visibleUserIds(pool, req.authUser);
    if (!canSee(visible, owner)) { res.status(403).json({ error: "Accès refusé" }); return; }
    await pool.query(
      `UPDATE clients SET
         segment = COALESCE($2, segment),
         status = COALESCE($3, status),
         potential_score = COALESCE($4, potential_score),
         financial_risk = COALESCE($5, financial_risk)
       WHERE id = $1`,
      [
        req.params.id,
        b.segment ? String(b.segment) : null,
        b.status ? String(b.status) : null,
        b.potentialScore !== undefined ? toNumber(b.potentialScore) : null,
        b.financialRisk ? String(b.financialRisk) : null,
      ],
    );
    res.json({ ok: true });
  }));

  // ------ Prospect detail ------------------------------------------------
  app.get(`${API}/prospects/:id/detail`, requireAuth, requirePermission("clients.read"), asyncRoute(async (req: AuthedRequest, res) => {
    const id = req.params.id;
    const { rows } = await pool.query(
      `SELECT p.*, t.label AS territory_label, u.name AS owner_name
         FROM prospects p
         LEFT JOIN territories t ON t.id = p.territory_id
         LEFT JOIN users u ON u.id = p.owner_user_id
        WHERE p.id = $1`,
      [id],
    );
    const p = rows[0];
    if (!p) { res.status(404).json({ error: "Prospect introuvable" }); return; }
    const visible = await visibleUserIds(pool, req.authUser);
    if (!canSee(visible, p.owner_user_id)) { res.status(404).json({ error: "Prospect introuvable" }); return; }

    const [{ rows: activities }, { rows: quotes }] = await Promise.all([
      pool.query(`SELECT id, type, subject, content, due_date, completed_at, created_at FROM activities WHERE prospect_id=$1 ORDER BY created_at DESC LIMIT 100`, [id]),
      pool.query(`SELECT id, number, status, total, currency, issued_at, signed_at FROM quotes WHERE prospect_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]),
    ]);

    res.json({
      prospect: {
        id: p.id, name: p.name, contactName: p.contact_name ?? "", phone: p.phone ?? "",
        email: p.email ?? "", source: p.source ?? "",
        team: p.team ?? "field", leadSource: p.lead_source ?? "societe",
        need: p.need ?? "", solutionFit: p.solution_fit ?? "",
        // Field intake
        address: p.address ?? "",
        zone: p.zone ?? "",
        establishmentType: p.establishment_type ?? "",
        potential: p.potential ?? null,
        competitor: p.competitor ?? "",
        nextVisitAt: p.next_visit_at ? new Date(p.next_visit_at).toISOString() : null,
        status: p.status, score: p.score,
        notes: p.notes ?? "", ownerUserId: p.owner_user_id, ownerName: p.owner_name ?? "",
        territoryId: p.territory_id, territoryLabel: p.territory_label ?? "",
        convertedClientId: p.converted_client_id, convertedAt: p.converted_at,
        createdAt: new Date(p.created_at).toISOString(),
      },
      activities: activities.map((a) => ({
        id: a.id, type: a.type, subject: a.subject, content: a.content ?? "",
        dueDate: a.due_date, completedAt: a.completed_at,
        createdAt: new Date(a.created_at).toISOString(),
      })),
      quotes: quotes.map((q) => ({ id: q.id, number: q.number, status: q.status, total: toNumber(q.total), currency: q.currency, issuedAt: q.issued_at, signedAt: q.signed_at })),
    });
  }));

  // ------ Quotes ----------------------------------------------------------
  app.get(`${API}/quotes`, requireAuth, requirePermission("orders.read"), asyncRoute(async (req: AuthedRequest, res) => {
    const visible = await visibleUserIds(pool, req.authUser);
    const filters: string[] = [];
    const values: unknown[] = [];
    if (visible !== "all") {
      filters.push(`q.owner_user_id = ANY($${filters.length + 1}::text[])`);
      values.push(Array.from(visible));
    }
    const status = String(req.query.status || "");
    if (status) {
      filters.push(`q.status = $${filters.length + 1}`);
      values.push(status);
    }
    const clientId = String(req.query.clientId || "");
    if (clientId) {
      filters.push(`q.client_id = $${filters.length + 1}`);
      values.push(clientId);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT q.*, u.name AS owner_name
         FROM quotes q
         LEFT JOIN users u ON u.id = q.owner_user_id
         ${where}
        ORDER BY q.created_at DESC
        LIMIT 500`,
      values,
    );
    res.json(rows.map((r) => mapQuote(r)));
  }));

  app.post(`${API}/quotes`, requireAuth, requirePermission("orders.write"), asyncRoute(async (req: AuthedRequest, res) => {
    if (!req.authUser) { res.status(401).json({ error: "Auth requise" }); return; }
    const b = req.body || {};
    const clientId = b.clientId ? String(b.clientId) : null;
    const prospectId = b.prospectId ? String(b.prospectId) : null;
    const opportunityId = b.opportunityId ? String(b.opportunityId) : null;

    let clientName = "";
    let clientContact = "";
    let clientEmail = "";
    let clientAddress = "";
    let territoryId = "";

    if (clientId) {
      const { rows } = await pool.query(
        `SELECT name, contact_name, email, address, city, territory_id FROM clients WHERE id=$1`,
        [clientId],
      );
      const c = rows[0];
      if (!c) { res.status(400).json({ error: "Client introuvable" }); return; }
      clientName = c.name;
      clientContact = c.contact_name ?? "";
      clientEmail = c.email ?? "";
      clientAddress = [c.address, c.city].filter(Boolean).join(", ");
      territoryId = c.territory_id;
    } else if (prospectId) {
      const { rows } = await pool.query(
        `SELECT name, contact_name, email, territory_id FROM prospects WHERE id=$1`,
        [prospectId],
      );
      const p = rows[0];
      if (!p) { res.status(400).json({ error: "Prospect introuvable" }); return; }
      clientName = p.name;
      clientContact = p.contact_name ?? "";
      clientEmail = p.email ?? "";
      territoryId = p.territory_id;
    } else {
      res.status(400).json({ error: "clientId ou prospectId requis" }); return;
    }

    const { rows: settingsRows } = await pool.query(
      `SELECT quote_validity_days, default_tax_rate, default_payment_terms, default_quote_terms FROM crm_settings WHERE id='default'`,
    );
    const settings = settingsRows[0] || {};
    const validityDays = toNumber(settings.quote_validity_days, 30);
    const taxRate = b.taxRate !== undefined ? toNumber(b.taxRate) : toNumber(settings.default_tax_rate);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + validityDays * 86400000);

    const { number } = await nextQuoteNumber(pool);
    const id = newId("quo");
    await pool.query(
      `INSERT INTO quotes
         (id, number, client_id, prospect_id, opportunity_id, owner_user_id, territory_id,
          status, title, client_name, client_contact, client_email, client_address,
          currency, tax_rate, notes, terms, payment_terms, issued_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        id, number, clientId, prospectId, opportunityId, req.authUser.id, territoryId,
        b.title ? String(b.title) : `Devis ${number}`,
        clientName, clientContact, clientEmail, clientAddress,
        b.currency ? String(b.currency) : "MAD",
        taxRate,
        b.notes ? String(b.notes) : "",
        b.terms ? String(b.terms) : (settings.default_quote_terms ?? ""),
        b.paymentTerms ? String(b.paymentTerms) : (settings.default_payment_terms ?? ""),
        issuedAt.toISOString(),
        expiresAt.toISOString(),
      ],
    );
    res.json({ id, number });
  }));

  app.get(`${API}/quotes/:id`, requireAuth, requirePermission("orders.read"), asyncRoute(async (req: AuthedRequest, res) => {
    const data = await loadQuote(pool, req.params.id);
    if (!data) { res.status(404).json({ error: "Devis introuvable" }); return; }
    const visible = await visibleUserIds(pool, req.authUser);
    if (!canSee(visible, data.quote.owner_user_id as string)) {
      res.status(404).json({ error: "Devis introuvable" }); return;
    }
    res.json(mapQuote(data.quote, data.lines, data.attachments));
  }));

  app.patch(`${API}/quotes/:id`, requireAuth, requirePermission("orders.write"), asyncRoute(async (req: AuthedRequest, res) => {
    const b = req.body || {};
    const data = await loadQuote(pool, req.params.id);
    if (!data) { res.status(404).json({ error: "Devis introuvable" }); return; }
    const visible = await visibleUserIds(pool, req.authUser);
    if (!canSee(visible, data.quote.owner_user_id as string)) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    if (data.quote.status === "signed") {
      res.status(409).json({ error: "Devis signé : non modifiable" }); return;
    }
    await pool.query(
      `UPDATE quotes SET
         title = COALESCE($2, title),
         client_contact = COALESCE($3, client_contact),
         client_email = COALESCE($4, client_email),
         client_address = COALESCE($5, client_address),
         currency = COALESCE($6, currency),
         tax_rate = COALESCE($7, tax_rate),
         notes = COALESCE($8, notes),
         terms = COALESCE($9, terms),
         payment_terms = COALESCE($10, payment_terms),
         expires_at = COALESCE($11, expires_at)
       WHERE id = $1`,
      [
        req.params.id,
        b.title !== undefined ? String(b.title) : null,
        b.clientContact !== undefined ? String(b.clientContact) : null,
        b.clientEmail !== undefined ? String(b.clientEmail) : null,
        b.clientAddress !== undefined ? String(b.clientAddress) : null,
        b.currency !== undefined ? String(b.currency) : null,
        b.taxRate !== undefined ? toNumber(b.taxRate) : null,
        b.notes !== undefined ? String(b.notes) : null,
        b.terms !== undefined ? String(b.terms) : null,
        b.paymentTerms !== undefined ? String(b.paymentTerms) : null,
        b.expiresAt ? new Date(String(b.expiresAt)).toISOString() : null,
      ],
    );
    await recomputeQuoteTotals(pool, req.params.id);
    const refreshed = await loadQuote(pool, req.params.id);
    res.json(refreshed ? mapQuote(refreshed.quote, refreshed.lines, refreshed.attachments) : null);
  }));

  app.post(`${API}/quotes/:id/lines`, requireAuth, requirePermission("orders.write"), asyncRoute(async (req: AuthedRequest, res) => {
    const id = req.params.id;
    const data = await loadQuote(pool, id);
    if (!data) { res.status(404).json({ error: "Devis introuvable" }); return; }
    if (!(await ensureQuoteOwnerVisible(pool, req.authUser, data.quote.owner_user_id as string))) {
      res.status(404).json({ error: "Devis introuvable" }); return;
    }
    if (data.quote.status === "signed") { res.status(409).json({ error: "Devis signé" }); return; }

    const b = req.body || {};
    const quantity = toNumber(b.quantity, 1);
    const unitPrice = toNumber(b.unitPrice);
    const discountPercent = toNumber(b.discountPercent);
    const lineTotal = computeLine({ quantity, unitPrice, discountPercent });
    const lineId = newId("ql");
    const position = data.lines.length;
    await pool.query(
      `INSERT INTO quote_lines (id, quote_id, position, product_id, description, quantity, unit_price, discount_percent, line_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        lineId, id, position,
        b.productId ? String(b.productId) : null,
        String(b.description ?? "").trim() || "Article",
        quantity, unitPrice, discountPercent, lineTotal,
      ],
    );
    await recomputeQuoteTotals(pool, id);
    res.json({ id: lineId });
  }));

  app.patch(`${API}/quotes/:quoteId/lines/:lineId`, requireAuth, requirePermission("orders.write"), asyncRoute(async (req: AuthedRequest, res) => {
    const { quoteId, lineId } = req.params;
    const data = await loadQuote(pool, quoteId);
    if (!data) { res.status(404).json({ error: "Devis introuvable" }); return; }
    if (!(await ensureQuoteOwnerVisible(pool, req.authUser, data.quote.owner_user_id as string))) {
      res.status(404).json({ error: "Devis introuvable" }); return;
    }
    if (data.quote.status === "signed") { res.status(409).json({ error: "Devis signé" }); return; }
    const b = req.body || {};
    const { rows } = await pool.query(`SELECT * FROM quote_lines WHERE id=$1 AND quote_id=$2`, [lineId, quoteId]);
    const cur = rows[0];
    if (!cur) { res.status(404).json({ error: "Ligne introuvable" }); return; }
    const quantity = b.quantity !== undefined ? toNumber(b.quantity, 1) : toNumber(cur.quantity, 1);
    const unitPrice = b.unitPrice !== undefined ? toNumber(b.unitPrice) : toNumber(cur.unit_price);
    const discountPercent = b.discountPercent !== undefined ? toNumber(b.discountPercent) : toNumber(cur.discount_percent);
    const description = b.description !== undefined ? String(b.description) : cur.description;
    const productId = b.productId !== undefined ? (b.productId ? String(b.productId) : null) : cur.product_id;
    const lineTotal = computeLine({ quantity, unitPrice, discountPercent });
    await pool.query(
      `UPDATE quote_lines SET product_id=$2, description=$3, quantity=$4, unit_price=$5, discount_percent=$6, line_total=$7 WHERE id=$1`,
      [lineId, productId, description, quantity, unitPrice, discountPercent, lineTotal],
    );
    await recomputeQuoteTotals(pool, quoteId);
    res.json({ ok: true });
  }));

  app.delete(`${API}/quotes/:quoteId/lines/:lineId`, requireAuth, requirePermission("orders.write"), asyncRoute(async (req: AuthedRequest, res) => {
    const data = await loadQuote(pool, req.params.quoteId);
    if (!data) { res.status(404).json({ error: "Devis introuvable" }); return; }
    if (!(await ensureQuoteOwnerVisible(pool, req.authUser, data.quote.owner_user_id as string))) {
      res.status(404).json({ error: "Devis introuvable" }); return;
    }
    if (data.quote.status === "signed") { res.status(409).json({ error: "Devis signé" }); return; }
    await pool.query(`DELETE FROM quote_lines WHERE id=$1 AND quote_id=$2`, [req.params.lineId, req.params.quoteId]);
    await recomputeQuoteTotals(pool, req.params.quoteId);
    res.json({ ok: true });
  }));

  app.delete(`${API}/quotes/:id`, requireAuth, requirePermission("orders.delete"), asyncRoute(async (req: AuthedRequest, res) => {
    const data = await loadQuote(pool, req.params.id);
    if (!data) { res.status(404).json({ error: "Devis introuvable" }); return; }
    if (data.quote.status === "signed") { res.status(409).json({ error: "Devis signé" }); return; }
    const visible = await visibleUserIds(pool, req.authUser);
    if (!canSee(visible, data.quote.owner_user_id as string)) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    await pool.query(`DELETE FROM quotes WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  }));

  // Generate a public signing link
  app.post(`${API}/quotes/:id/send`, requireAuth, requirePermission("orders.write"), asyncRoute(async (req: AuthedRequest, res) => {
    const data = await loadQuote(pool, req.params.id);
    if (!data) { res.status(404).json({ error: "Devis introuvable" }); return; }
    if (!(await ensureQuoteOwnerVisible(pool, req.authUser, data.quote.owner_user_id as string))) {
      res.status(404).json({ error: "Devis introuvable" }); return;
    }
    if (data.quote.status === "signed") { res.status(409).json({ error: "Devis signé" }); return; }
    const secret = await ensureSignatureSecret(pool);
    const exp = Date.now() + 60 * 86400000;
    const token = signToken(secret, { qid: data.quote.id, exp });
    const link = `${publicBaseUrl()}/quotes/${data.quote.id}/sign/${token}`;
    await pool.query(`UPDATE quotes SET status='sent', sent_at=NOW() WHERE id=$1`, [req.params.id]);

    // Advance the linked prospect in the funnel once a quote has been sent.
    if (data.quote.prospect_id) {
      await pool.query(
        `UPDATE prospects SET status='quoted'
           WHERE id=$1 AND status IN ('new','contacted','qualified')`,
        [data.quote.prospect_id],
      ).catch((e) => logError("quote.prospect_stage_failed", { error: (e as Error).message }));
    }

    const email = (req.body?.email as string | undefined) || (data.quote.client_email as string | undefined) || "";
    if (email && sendEmail) {
      const { rows: settingsRows } = await pool.query(`SELECT quote_email_subject, quote_email_body FROM crm_settings WHERE id='default'`);
      const sset = settingsRows[0] || {};
      const subject = String(sset.quote_email_subject || `Votre devis ${data.quote.number}`)
        .replace(/\{\{number\}\}/g, String(data.quote.number));
      const text = String(sset.quote_email_body || `Veuillez signer votre devis ici : {{link}}`)
        .replace(/\{\{link\}\}/g, link)
        .replace(/\{\{number\}\}/g, String(data.quote.number));
      const html = `<p>${text.replace(/\n/g, "<br>")}</p><p><a href="${link}">${link}</a></p>`;
      await sendEmail(email, subject, html, text).catch((e) => logError("quote.email_failed", { error: (e as Error).message }));
    }

    res.json({ link, status: "sent" });
  }));

  app.get(`${API}/quotes/:id/pdf`, requireAuth, requirePermission("orders.read"), asyncRoute(async (req: AuthedRequest, res) => {
    const data = await loadQuote(pool, req.params.id);
    if (!data) { res.status(404).json({ error: "Devis introuvable" }); return; }
    const visible = await visibleUserIds(pool, req.authUser);
    if (!canSee(visible, data.quote.owner_user_id as string)) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const { rows: sRows } = await pool.query(`SELECT * FROM crm_settings WHERE id='default'`);
    const buf = await generateQuotePdf(mapQuote(data.quote, data.lines, data.attachments), sRows[0] ?? {});
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${data.quote.number}.pdf"`);
    res.send(buf);
  }));

  app.post(`${API}/quotes/:id/cancel`, requireAuth, requirePermission("orders.write"), asyncRoute(async (req: AuthedRequest, res) => {
    const data = await loadQuote(pool, req.params.id);
    if (!data) { res.status(404).json({ error: "Devis introuvable" }); return; }
    if (!(await ensureQuoteOwnerVisible(pool, req.authUser, data.quote.owner_user_id as string))) {
      res.status(404).json({ error: "Devis introuvable" }); return;
    }
    if (data.quote.status === "signed") { res.status(409).json({ error: "Devis signé" }); return; }
    await pool.query(`UPDATE quotes SET status='cancelled' WHERE id=$1 AND status NOT IN ('signed')`, [req.params.id]);
    res.json({ ok: true });
  }));

  // ------ Public signing endpoints (no auth, token-based) ----------------
  app.get(`/api/public/quotes/:id`, asyncRoute(async (req, res) => {
    const token = String(req.query.token || "");
    const secret = await ensureSignatureSecret(pool);
    const payload = verifyToken(secret, token);
    if (!payload || payload.qid !== req.params.id) { res.status(403).json({ error: "Lien invalide ou expiré" }); return; }
    const data = await loadQuote(pool, req.params.id);
    if (!data) { res.status(404).json({ error: "Introuvable" }); return; }
    const q = mapQuote(data.quote, data.lines, data.attachments) as Record<string, unknown>;
    delete q.notes; // hide internal
    res.json(q);
  }));

  app.get(`/api/public/quotes/:id/pdf`, asyncRoute(async (req, res) => {
    const token = String(req.query.token || "");
    const secret = await ensureSignatureSecret(pool);
    const payload = verifyToken(secret, token);
    if (!payload || payload.qid !== req.params.id) { res.status(403).end(); return; }
    const data = await loadQuote(pool, req.params.id);
    if (!data) { res.status(404).end(); return; }
    const { rows: sRows } = await pool.query(`SELECT * FROM crm_settings WHERE id='default'`);
    const buf = await generateQuotePdf(mapQuote(data.quote, data.lines, data.attachments), sRows[0] ?? {});
    res.setHeader("Content-Type", "application/pdf");
    res.send(buf);
  }));

  app.post(`/api/public/quotes/:id/sign`, asyncRoute(async (req, res) => {
    const token = String(req.body?.token || "");
    const secret = await ensureSignatureSecret(pool);
    const payload = verifyToken(secret, token);
    if (!payload || payload.qid !== req.params.id) { res.status(403).json({ error: "Lien invalide" }); return; }
    const data = await loadQuote(pool, req.params.id);
    if (!data) { res.status(404).json({ error: "Introuvable" }); return; }
    if (data.quote.status === "signed") { res.status(409).json({ error: "Déjà signé" }); return; }

    const signedByName = String(req.body?.signedByName || "").trim();
    const signedByEmail = String(req.body?.signedByEmail || "").trim();
    const signatureDataUrl = String(req.body?.signatureDataUrl || "");
    if (!signedByName || !signatureDataUrl.startsWith("data:image/")) {
      res.status(400).json({ error: "Nom et signature requis" }); return;
    }
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.ip || "";

    // Resolve the client this signed quote belongs to. A quote linked only to a
    // prospect means the deal is now won: convert the prospect into a real client
    // so the order (and the quote) attach to an actual client account.
    let clientId: string | null = (data.quote.client_id as string | null) ?? null;
    let clientName = String(data.quote.client_name || "");
    if (!clientId && data.quote.prospect_id) {
      try {
        const { rows: pRows } = await pool.query(
          `SELECT * FROM prospects WHERE id=$1`,
          [data.quote.prospect_id],
        );
        const prospect = pRows[0];
        if (prospect) {
          if (prospect.converted_client_id) {
            clientId = String(prospect.converted_client_id);
          } else {
            const newClientId = newId("client");
            await pool.query(
              `INSERT INTO clients
                 (id, name, type, status, segment, territory_id, owner_user_id,
                  contact_name, phone, email, potential_score, financial_risk, notes)
               VALUES ($1,$2,'client','active','B',$3,$4,$5,$6,$7,$8,'low',$9)`,
              [
                newClientId,
                prospect.name,
                prospect.territory_id,
                prospect.owner_user_id,
                prospect.contact_name ?? "",
                prospect.phone ?? "",
                prospect.email ?? "",
                Math.max(0, Math.min(100, Number(prospect.score) || 0)),
                prospect.notes ?? "",
              ],
            );
            await pool.query(
              `UPDATE prospects
                 SET status='converted', converted_client_id=$2, converted_at=NOW()
               WHERE id=$1`,
              [prospect.id, newClientId],
            );
            await pool.query(
              `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, meta)
               VALUES ($1,$2,'prospect.converted','prospect',$3,$4)`,
              [newId("aud"), null, prospect.id, JSON.stringify({ clientId: newClientId, via: "quote_signature", quoteId: req.params.id })],
            ).catch(() => undefined);
            clientId = newClientId;
          }
        }
      } catch (e) {
        logError("quote.prospect_conversion_failed", { error: (e as Error).message });
      }
    }

    // Create order from quote (now attached to the resolved client when available).
    const orderId = newId("ord");
    await pool.query(
      `INSERT INTO orders (id, client_id, client_name, owner_user_id, territory_id, date, amount, discount, status, approval_status, sync_status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,'draft','pending','not_synced',$8)`,
      [
        orderId,
        clientId,
        clientName,
        data.quote.owner_user_id,
        data.quote.territory_id,
        new Date().toISOString().slice(0, 10),
        toNumber(data.quote.total),
        `Issu du devis ${data.quote.number}`,
      ],
    ).catch((e) => {
      logError("quote.order_creation_failed", { error: (e as Error).message });
    });

    const blobUrl = await uploadSignatureToBlob(signatureDataUrl, req.params.id);
    await pool.query(
      `UPDATE quotes SET
         status='signed', signed_at=NOW(),
         signed_by_name=$2, signed_by_email=$3,
         signature_data_url=$4, signature_url=$5, signature_ip=$6,
         order_id=$7, client_id=COALESCE(client_id, $8)
       WHERE id=$1`,
      [
        req.params.id,
        signedByName,
        signedByEmail,
        blobUrl ? null : signatureDataUrl,
        blobUrl,
        ip,
        orderId,
        clientId,
      ],
    );

    logInfo("quote.signed", { quoteId: req.params.id, by: signedByName, clientId });
    res.json({ ok: true, status: "signed" });
  }));

  app.post(`/api/public/quotes/:id/refuse`, asyncRoute(async (req, res) => {
    const token = String(req.body?.token || "");
    const secret = await ensureSignatureSecret(pool);
    const payload = verifyToken(secret, token);
    if (!payload || payload.qid !== req.params.id) { res.status(403).json({ error: "Lien invalide" }); return; }
    await pool.query(
      `UPDATE quotes SET status='refused', refused_reason=$2 WHERE id=$1 AND status IN ('sent','draft')`,
      [req.params.id, String(req.body?.reason || "").slice(0, 500)],
    );
    res.json({ ok: true });
  }));

  // ------ Quote attachments ----------------------------------------------
  // Upload via raw body. Frontend sends file bytes with X-Filename and X-Visible-To-Client headers.
  app.post(
    `${API}/quotes/:id/attachments`,
    requireAuth,
    requirePermission("orders.write"),
    express.raw({ type: "*/*", limit: "25mb" }),
    asyncRoute(async (req: AuthedRequest, res) => {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        res.status(503).json({ error: "Vercel Blob non configuré (BLOB_READ_WRITE_TOKEN manquant)" });
        return;
      }
      const data = await loadQuote(pool, req.params.id);
      if (!data) { res.status(404).json({ error: "Devis introuvable" }); return; }
      const visible = await visibleUserIds(pool, req.authUser);
      if (!canSee(visible, data.quote.owner_user_id as string)) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const filename = String(req.headers["x-filename"] || "fichier").replace(/[^\w.\-]/g, "_").slice(0, 200);
      const contentType = String(req.headers["content-type"] || "application/octet-stream");
      const visibleToClient = String(req.headers["x-visible-to-client"] || "true") !== "false";
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        res.status(400).json({ error: "Fichier vide" }); return;
      }
      try {
        const { put } = await import("@vercel/blob");
        const { url } = await put(
          `quote-attachments/${req.params.id}/${Date.now()}-${filename}`,
          buf,
          { access: "public", contentType, addRandomSuffix: false },
        );
        const id = newId("att");
        await pool.query(
          `INSERT INTO quote_attachments
             (id, quote_id, name, blob_url, size_bytes, content_type, uploaded_by_user_id, visible_to_client)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, req.params.id, filename, url, buf.length, contentType, req.authUser?.id ?? null, visibleToClient],
        );
        res.json({ id, name: filename, blobUrl: url, sizeBytes: buf.length, contentType, visibleToClient });
      } catch (e) {
        logError("quote.attachment_upload_failed", { error: (e as Error).message });
        res.status(500).json({ error: (e as Error).message });
      }
    }),
  );

  app.delete(
    `${API}/quotes/:quoteId/attachments/:attId`,
    requireAuth,
    requirePermission("orders.write"),
    asyncRoute(async (req: AuthedRequest, res) => {
      const { rows } = await pool.query(
        `SELECT a.blob_url, q.owner_user_id FROM quote_attachments a
           JOIN quotes q ON q.id = a.quote_id
          WHERE a.id = $1 AND a.quote_id = $2`,
        [req.params.attId, req.params.quoteId],
      );
      const row = rows[0];
      if (!row) { res.status(404).json({ error: "PJ introuvable" }); return; }
      const visible = await visibleUserIds(pool, req.authUser);
      if (!canSee(visible, row.owner_user_id)) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      if (process.env.BLOB_READ_WRITE_TOKEN && row.blob_url) {
        try {
          const { del } = await import("@vercel/blob");
          await del(String(row.blob_url));
        } catch (e) {
          logInfo("quote.attachment_blob_del_failed", { error: (e as Error).message });
        }
      }
      await pool.query(`DELETE FROM quote_attachments WHERE id=$1`, [req.params.attId]);
      res.json({ ok: true });
    }),
  );

  app.patch(
    `${API}/quotes/:quoteId/attachments/:attId`,
    requireAuth,
    requirePermission("orders.write"),
    asyncRoute(async (req: AuthedRequest, res) => {
      const visibleToClient = req.body?.visibleToClient;
      if (typeof visibleToClient !== "boolean") {
        res.status(400).json({ error: "visibleToClient booléen requis" }); return;
      }
      await pool.query(
        `UPDATE quote_attachments SET visible_to_client = $3
           WHERE id = $1 AND quote_id = $2`,
        [req.params.attId, req.params.quoteId, visibleToClient],
      );
      res.json({ ok: true });
    }),
  );

  // Public listing of attachments (only those flagged visible_to_client)
  app.get(`/api/public/quotes/:id/attachments`, asyncRoute(async (req, res) => {
    const token = String(req.query.token || "");
    const secret = await ensureSignatureSecret(pool);
    const payload = verifyToken(secret, token);
    if (!payload || payload.qid !== req.params.id) { res.status(403).json({ error: "Lien invalide" }); return; }
    const { rows } = await pool.query(
      `SELECT id, name, blob_url, size_bytes, content_type, created_at
         FROM quote_attachments
        WHERE quote_id = $1 AND visible_to_client = TRUE
        ORDER BY created_at DESC`,
      [req.params.id],
    );
    res.json(rows.map((r) => ({
      id: r.id, name: r.name, blobUrl: r.blob_url,
      sizeBytes: toNumber(r.size_bytes), contentType: r.content_type,
      createdAt: new Date(r.created_at).toISOString(),
    })));
  }));

  // ------ Cron: quote reminders + expiration -----------------------------
  const handleCron = async (_req: Request, res: Response) => {
    const expired = await pool.query(
      `UPDATE quotes SET status='expired'
         WHERE status='sent' AND expires_at IS NOT NULL AND expires_at < NOW()
       RETURNING id`,
    );

    let sent = 0;
    let skipped = 0;
    if (sendEmail) {
      const { rows: dueReminders } = await pool.query(
        `SELECT q.id, q.number, q.client_email, q.title, q.total, q.currency
           FROM quotes q
          WHERE q.status = 'sent'
            AND q.client_email <> ''
            AND q.reminder_count < 3
            AND (q.last_reminder_at IS NULL OR q.last_reminder_at < NOW() - INTERVAL '3 days')
            AND (q.sent_at IS NOT NULL AND q.sent_at < NOW() - INTERVAL '2 days')
          LIMIT 50`,
      );
      const secret = await ensureSignatureSecret(pool);
      const base = publicBaseUrl();
      for (const q of dueReminders) {
        const tok = signToken(secret, { qid: q.id, exp: Date.now() + 60 * 86400000 });
        const link = `${base}/quotes/${q.id}/sign/${tok}`;
        const subject = `Relance : devis ${q.number} en attente de signature`;
        const text = `Bonjour,\n\nVotre devis ${q.number} d'un montant de ${Number(q.total ?? 0).toFixed(2)} ${q.currency} est en attente de signature.\n\nSigner en ligne : ${link}\n\nCordialement.`;
        const html = `<p>Bonjour,</p><p>Votre devis <strong>${q.number}</strong> d'un montant de <strong>${Number(q.total ?? 0).toFixed(2)} ${q.currency}</strong> est en attente de signature.</p><p><a href="${link}">Signer le devis</a></p>`;
        try {
          const ok = await sendEmail(q.client_email, subject, html, text);
          if (ok) {
            await pool.query(
              `UPDATE quotes SET last_reminder_at = NOW(), reminder_count = reminder_count + 1 WHERE id = $1`,
              [q.id],
            );
            sent += 1;
          } else {
            skipped += 1;
          }
        } catch (e) {
          logError("quote.reminder_failed", { id: q.id, error: (e as Error).message });
          skipped += 1;
        }
      }
    }

    logInfo("quote.cron_done", { expired: expired.rowCount ?? 0, sent, skipped });
    res.json({ ok: true, expired: expired.rowCount ?? 0, remindersSent: sent, remindersSkipped: skipped });
  };

  const cronAuth: RequestHandler = (req, res, next) => {
    const expected = process.env.CRON_SECRET;
    const provided = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    // Vercel Cron sends Bearer <CRON_SECRET> if configured; allow without if no secret set (dev only).
    if (expected && provided !== expected) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };

  app.get("/api/cron/quote-reminders", cronAuth, asyncRoute(handleCron));
  app.post("/api/cron/quote-reminders", cronAuth, asyncRoute(handleCron));

  logInfo("crm_flow.routes_mounted", {});
}
