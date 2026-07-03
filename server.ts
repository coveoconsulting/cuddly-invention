import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { Pool } from "pg";
import type {
  ApprovalStatus,
  AssistantResponse,
  Client,
  Company,
  DashboardAlert,
  DashboardSnapshot,
  GeoPoint,
  IntegrationItem,
  ManagerOverview,
  NotificationItem,
  Opportunity,
  Order,
  OrderStatus,
  PermissionKey,
  PipelineStage,
  PriorityLevel,
  Product,
  RoleDefinition,
  RoleKey,
  RolesResponse,
  SessionPayload,
  SyncStatus,
  TargetProgress,
  TeamSummary,
  Territory,
  UserPreferences,
  UserSummary,
  Visit,
  VisitStatus,
  Prospect,
  ProspectStatus,
  ProspectLeadSource,
  Activity,
  ActivityType,
  CampaignItem,
  CaseItem,
  ContractItem,
  DocumentItem,
  OrderLine,
  SalesCallItem,
  SubscriptionPlan,
} from "./src/types.js";
import {
  normalizeLeadSource,
  buildFieldIntake,
  applyFieldIntakePatch,
} from "./src/lib/prospect-intake.js";

dotenv.config();

type NodeEnv = "development" | "production" | "test";

type AppConfig = {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  host: string;
  trustProxy: boolean;
  requestBodyLimit: string;
  logLevel: "info" | "error" | "silent";
  sessionSecret: string;
  appTimeZone: string;
  databaseUrl: string | null;
  bootstrap: {
    adminEmail: string | null;
    adminPassword: string | null;
    adminName: string;
    companyName: string;
    companyVertical: string;
    companyCurrency: string;
    companyCountry: string;
    defaultTerritory: string;
  };
};

function parseNodeEnv(value: string | undefined): NodeEnv {
  const normalized = value?.trim();
  if (!normalized || normalized === "development") {
    return "development";
  }
  if (normalized === "production" || normalized === "test") {
    return normalized;
  }
  throw new Error(`NODE_ENV invalide: ${normalized}`);
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function resolvePort(value: string | undefined) {
  const candidate = Number(value ?? "3000");
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65535) {
    throw new Error(`PORT invalide: ${value ?? ""}`);
  }
  return candidate;
}

function resolveLogLevel(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "error" || normalized === "silent") {
    return normalized;
  }
  return "info";
}

function resolveAppConfig(): AppConfig {
  const nodeEnv = parseNodeEnv(process.env.NODE_ENV);
  const isProduction = nodeEnv === "production";
  const sessionSecret = process.env.SESSION_SECRET?.trim() || "";
  const rawDatabaseUrl =
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    null;
  const databaseUrl = rawDatabaseUrl
    ? rawDatabaseUrl.replace(/([?&])channel_binding=require(&|$)/g, (_match, prefix, suffix) =>
        suffix === "&" ? prefix : "",
      )
    : null;

  if (isProduction && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET doit contenir au moins 32 caracteres en production.");
  }

  return {
    nodeEnv,
    isProduction,
    port: resolvePort(process.env.PORT),
    host: process.env.HOST?.trim() || "0.0.0.0",
    trustProxy: parseBooleanEnv(process.env.TRUST_PROXY, isProduction),
    requestBodyLimit: process.env.REQUEST_BODY_LIMIT?.trim() || "1mb",
    logLevel: resolveLogLevel(process.env.LOG_LEVEL),
    sessionSecret: sessionSecret || "clerivo-local-secret",
    appTimeZone: process.env.APP_TIMEZONE?.trim() || "Africa/Casablanca",
    databaseUrl,
    bootstrap: {
      adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || null,
      adminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || null,
      adminName: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Platform Admin",
      companyName: process.env.BOOTSTRAP_COMPANY_NAME?.trim() || "coveoconsulting",
      companyVertical:
        process.env.BOOTSTRAP_COMPANY_VERTICAL?.trim() || "CRM multi-activité",
      companyCurrency: process.env.BOOTSTRAP_COMPANY_CURRENCY?.trim() || "MAD",
      companyCountry: process.env.BOOTSTRAP_COMPANY_COUNTRY?.trim() || "Morocco",
      defaultTerritory:
        process.env.BOOTSTRAP_DEFAULT_TERRITORY?.trim() || "Territoire principal",
    },
  };
}

const appConfig = resolveAppConfig();
const PORT = appConfig.port;
const API_PREFIX = "/api/v1";
const SESSION_COOKIE = appConfig.isProduction ? "__Host-clerivo_session" : "clerivo_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60;
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() || null;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL?.trim() || process.env.VERCEL_URL?.trim() || "";
const SUBSCRIPTION_PLANS: SubscriptionPlan[] = ["essentiel", "professionnel", "enterprise", "sur_mesure"];

function resolvePublicBaseUrl(req: Request) {
  if (APP_PUBLIC_URL) {
    return APP_PUBLIC_URL.startsWith("http") ? APP_PUBLIC_URL : `https://${APP_PUBLIC_URL}`;
  }
  const proto = (req.headers["x-forwarded-proto"] as string) || (req.protocol ?? "https");
  const host = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string) || "";
  return `${proto}://${host}`;
}

function isSubscriptionPlan(value: string): value is SubscriptionPlan {
  return SUBSCRIPTION_PLANS.includes(value as SubscriptionPlan);
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) {
    logInfo("email.skipped", { to, subject, reason: "RESEND_API_KEY missing" });
    return false;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html, text }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logError("email.send_failed", { to, subject, status: response.status, body: body.slice(0, 300) });
    return false;
  }
  logInfo("email.sent", { to, subject });
  return true;
}

function createResetToken(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({ userId, purpose: "reset", exp: Date.now() + RESET_TOKEN_TTL_MS }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", appConfig.sessionSecret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function parseResetToken(token: string | undefined) {
  if (!token) {
    return null;
  }
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = crypto
    .createHmac("sha256", appConfig.sessionSecret)
    .update(payload)
    .digest("base64url");
  if (!safeEqual(signature, expected)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId: string;
      purpose: string;
      exp: number;
    };
    if (decoded.purpose !== "reset" || decoded.exp <= Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    })
  : null;

type DbUser = {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  title: string;
  role: RoleKey;
  teamId?: string;
  territoryIds: string[];
  active: boolean;
  passwordHash: string;
  avatarUrl?: string | null;
};

type AuditLog = {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

type Database = {
  company: Company;
  roles: RoleDefinition[];
  teams: TeamSummary[];
  territories: Territory[];
  users: DbUser[];
  clients: Client[];
  visits: Visit[];
  opportunities: Opportunity[];
  orders: Order[];
  products: Product[];
  targets: Array<{
    id: string;
    ownerUserId: string;
    periodLabel: string;
    revenueGoal: number;
    visitsGoal: number;
    opportunitiesGoal: number;
    ordersGoal: number;
  }>;
  integrations: IntegrationItem[];
  notifications: Array<NotificationItem & { userId: string }>;
  preferences: UserPreferences[];
  auditLogs: AuditLog[];
  prospects: Prospect[];
  activities: Activity[];
  documents: DocumentItem[];
  orderLines: OrderLine[];
  contracts: ContractItem[];
  cases: CaseItem[];
  campaigns: CampaignItem[];
  calls: SalesCallItem[];
};

type AuthenticatedRequest = Request & {
  requestId?: string;
  authUser?: DbUser;
  sessionPayload?: SessionPayload;
};

const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: "super_admin",
    label: "Super administrateur",
    description: "Accès plateforme complet : gère l'abonnement, les paramètres et tous les utilisateurs.",
    permissions: [
      "dashboard.read",
      "clients.read", "clients.write", "clients.delete",
      "visits.read", "visits.write",
      "opportunities.read", "opportunities.write",
      "orders.read", "orders.write", "orders.approve", "orders.delete",
      "products.read", "products.write", "products.delete",
      "targets.read", "targets.write",
      "insights.read",
      "routes.read",
      "assistant.read",
      "roles.read", "roles.write",
      "users.write",
      "audit.read",
      "integrations.read",
      "settings.read", "settings.write",
      "notifications.read", "notifications.write",
      "prospects.delete", "contracts.delete", "cases.delete",
      "campaigns.delete", "calls.delete", "activities.delete",
      "approvals.write",
    ],
  },
  {
    key: "admin",
    label: "Admin entreprise",
    description: "Administre les utilisateurs, les zones, les integrations et les parametres.",
    permissions: [
      "dashboard.read",
      "clients.read", "clients.write", "clients.delete",
      "visits.read", "visits.write",
      "opportunities.read", "opportunities.write",
      "orders.read", "orders.write", "orders.approve", "orders.delete",
      "products.read", "products.write", "products.delete",
      "targets.read", "targets.write",
      "insights.read",
      "routes.read",
      "assistant.read",
      "roles.read", "roles.write",
      "users.write",
      "audit.read",
      "integrations.read",
      "settings.read", "settings.write",
      "notifications.read", "notifications.write",
      "prospects.delete", "contracts.delete", "cases.delete",
      "campaigns.delete", "calls.delete", "activities.delete",
      "approvals.write",
    ],
  },
  {
    key: "director",
    label: "Responsable / Directeur commercial",
    description: "Gère les chefs d'équipe et est garant des résultats. Pilote le pipeline global et les objectifs.",
    permissions: [
      "dashboard.read",
      "clients.read",
      "visits.read",
      "opportunities.read",
      "orders.read", "orders.approve",
      "products.read",
      "targets.read", "targets.write",
      "insights.read",
      "routes.read",
      "assistant.read",
      "roles.read",
      "audit.read",
      "integrations.read",
      "settings.read",
      "notifications.read", "notifications.write",
      "approvals.write",
    ],
  },
  {
    key: "manager",
    label: "Chef de projet / d'équipe",
    description: "Encadre les commerciaux de son équipe, valide les remises et commandes, et pilote le portefeuille régional.",
    permissions: [
      "dashboard.read",
      "clients.read", "clients.write",
      "visits.read", "visits.write",
      "opportunities.read", "opportunities.write",
      "orders.read", "orders.write", "orders.approve",
      "products.read",
      "targets.read", "targets.write",
      "insights.read",
      "routes.read",
      "assistant.read",
      "roles.read",
      "integrations.read",
      "settings.read", "settings.write",
      "notifications.read", "notifications.write",
      "approvals.write",
    ],
  },
  {
    key: "sales_rep",
    label: "Commercial",
    description: "Gère ses clients, prospects, visites, devis, opportunités et commandes.",
    permissions: [
      "dashboard.read",
      "clients.read",
      "clients.write",
      "visits.read",
      "visits.write",
      "opportunities.read",
      "opportunities.write",
      "orders.read",
      "orders.write",
      "products.read",
      "targets.read",
      "routes.read",
      "assistant.read",
      "settings.read",
      "notifications.read",
      "notifications.write",
    ],
  },
  {
    key: "finance",
    label: "Finance et recouvrement",
    description: "Suit les commandes sensibles, les encours et les validations financieres.",
    permissions: [
      "dashboard.read",
      "clients.read",
      "orders.read", "orders.approve",
      "targets.read",
      "insights.read",
      "assistant.read",
      "settings.read", "settings.write",
      "notifications.read", "notifications.write",
      "approvals.write",
    ],
  },
  {
    key: "logistics",
    label: "Logistique et stock",
    description: "Maintient le catalogue et les stocks de disponibilite.",
    permissions: [
      "dashboard.read",
      "orders.read",
      "products.read",
      "products.write",
      "routes.read",
      "settings.read",
      "notifications.read",
      "notifications.write",
    ],
  },
  {
    key: "support",
    label: "Support qualite",
    description: "Traite les incidents et les points de blocage terrain.",
    permissions: [
      "dashboard.read",
      "clients.read",
      "visits.read",
      "orders.read",
      "assistant.read",
      "settings.read",
      "notifications.read",
      "notifications.write",
    ],
  },
  {
    key: "viewer",
    label: "Lecture seule",
    description: "Acces lecture seule aux indicateurs et tableaux de bord.",
    permissions: [
      "dashboard.read",
      "clients.read",
      "visits.read",
      "opportunities.read",
      "orders.read",
      "products.read",
      "targets.read",
      "insights.read",
      "routes.read",
      "notifications.read",
      "notifications.write",
    ],
  },
];

const POWER_ROLES = new Set<RoleKey>(["super_admin", "admin", "director"]);
const GLOBAL_READ_ROLES = new Set<RoleKey>([
  "super_admin",
  "admin",
  "director",
  "finance",
  "logistics",
  "support",
  "viewer",
]);

type DataStore = {
  init(): Promise<void>;
  read(): Promise<Database>;
  mutate(mutator: (db: Database) => void | Promise<void>): Promise<void>;
};

function cloneDatabase(db: Database) {
  return structuredClone(db);
}

async function resolveMigrationsDir() {
  if (process.env.migrationsDir?.trim()) {
    return path.resolve(process.env.migrationsDir.trim());
  }
  const candidates = [
    path.join(process.cwd(), "migrations"),
    path.join(process.cwd(), "..", "migrations"),
    "/var/task/migrations",
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return candidates[0];
}

async function runMigrations(pool: Pool) {
  const migrationsDir = await resolveMigrationsDir();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  let files: string[] = [];
  try {
    files = (await fs.readdir(migrationsDir))
      .filter((name) => name.endsWith(".sql"))
      .sort();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      throw new Error(
        `Repertoire de migrations introuvable: ${migrationsDir}. Verifiez le packaging du deploiement.`,
      );
    }
    throw error;
  }

  if (files.length === 0) {
    throw new Error("Aucune migration SQL trouvee.");
  }

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [
      version,
    ]);
    if ((existing.rowCount ?? 0) > 0) {
      continue;
    }
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
      await client.query("COMMIT");
      logInfo("db.migration_applied", { version });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (/[",\n\r;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv<T>(rows: T[], columns: Array<{ key: string; get: (row: T) => unknown }>): string {
  const header = columns.map((column) => csvCell(column.key)).join(";");
  const lines = rows.map((row) => columns.map((column) => csvCell(column.get(row))).join(";"));
  return [header, ...lines].join("\r\n");
}

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("﻿" + csv);
}

function wantsCsv(req: Request) {
  return String(req.query.format || "").toLowerCase() === "csv";
}

function rowsEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function toDateOrNull(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function numberOrZero(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

type PgClient = import("pg").PoolClient;

function resolvePgSsl(connectionString: string): boolean | { rejectUnauthorized: boolean } {
  const override = process.env.PGSSL?.trim().toLowerCase();
  if (override === "disable" || override === "false" || override === "0") {
    return false;
  }
  if (override === "no-verify") {
    return { rejectUnauthorized: false };
  }
  if (override === "verify" || override === "true" || override === "1") {
    return { rejectUnauthorized: true };
  }
  let host = "";
  try {
    host = new URL(connectionString).hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return false;
  }
  const managedHosts = [
    ".neon.tech",
    ".vercel-storage.com",
    ".supabase.co",
    ".supabase.com",
    ".rds.amazonaws.com",
    ".render.com",
    ".railway.app",
    ".heroku.com",
    ".azure.com",
    ".cockroachlabs.cloud",
  ];
  if (managedHosts.some((suffix) => host.endsWith(suffix))) {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

class PostgresDatabase implements DataStore {
  readonly pool: Pool;
  private initPromise: Promise<void> | null = null;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX || "3"),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 30_000,
      ssl: resolvePgSsl(connectionString),
    });
    this.pool.on("error", (error) => {
      logError("db.pool_error", { error: serializeError(error) });
    });
  }

  async init() {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await runMigrations(this.pool);
        await this.bootstrapIfEmpty();
      })();
    }
    await this.initPromise;
  }

  async read() {
    await this.init();
    const client = await this.pool.connect();
    try {
      return await this.loadDatabase(client);
    } finally {
      client.release();
    }
  }

  async mutate(mutator: (db: Database) => void | Promise<void>) {
    await this.init();
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const before = await this.loadDatabase(client);
        const after = cloneDatabase(before);
        await mutator(after);
        await this.persistDiff(client, before, after);
        await client.query("COMMIT");
        return;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        const code = (error as { code?: string }).code;
        if (code === "40001" && attempt < maxAttempts) {
          logInfo("db.mutate_retry", { attempt, code });
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  private async bootstrapIfEmpty() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(7235128710)");
      const result = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM companies",
      );
      if (Number(result.rows[0]?.count ?? "0") > 0) {
        await client.query("COMMIT");
        return;
      }
      const seed = appConfig.isProduction
        ? createProductionBootstrapDatabase()
        : createSeedDatabase();
      await this.persistDiff(client, emptyDatabaseShape(), seed);
      await client.query("COMMIT");
      logInfo("db.bootstrap_completed", {
        company: seed.company.name,
        users: seed.users.length,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async loadDatabase(client: PgClient): Promise<Database> {
    const [
      companies,
      territories,
      teams,
      users,
      userTerritories,
      clients,
      visits,
      opportunities,
      orders,
      orderLines,
      products,
      targets,
      integrations,
      notifications,
      preferences,
      auditLogs,
      prospects,
      activities,
      documents,
      contracts,
      cases,
      campaigns,
      calls,
    ] = await Promise.all([
      client.query(`SELECT * FROM companies`),
      client.query(`SELECT * FROM territories`),
      client.query(`SELECT * FROM teams`),
      client.query(`SELECT * FROM users`),
      client.query(`SELECT user_id, territory_id, position FROM user_territories`),
      client.query(`SELECT * FROM clients`),
      client.query(`SELECT * FROM visits`),
      client.query(`SELECT * FROM opportunities`),
      client.query(`SELECT * FROM orders`),
      client.query(`SELECT * FROM order_lines`),
      client.query(`SELECT * FROM products`),
      client.query(`SELECT * FROM targets`),
      client.query(`SELECT * FROM integrations`),
      client.query(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 400`),
      client.query(`SELECT * FROM user_preferences`),
      client.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500`),
      client.query(`SELECT * FROM prospects ORDER BY created_at DESC LIMIT 1000`),
      client.query(`SELECT * FROM activities ORDER BY created_at DESC LIMIT 1000`),
      client.query(`SELECT * FROM documents ORDER BY created_at DESC LIMIT 1000`),
      client.query(`SELECT * FROM contracts ORDER BY created_at DESC LIMIT 1000`),
      client.query(`SELECT * FROM cases ORDER BY updated_at DESC LIMIT 1000`),
      client.query(`SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 1000`),
      client.query(`SELECT * FROM sales_calls ORDER BY scheduled_at DESC LIMIT 1000`),
    ]);

    const territoriesByUser = new Map<string, string[]>();
    for (const row of [...userTerritories.rows].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    )) {
      const list = territoriesByUser.get(row.user_id) ?? [];
      list.push(row.territory_id);
      territoriesByUser.set(row.user_id, list);
    }

    const company: Company = companies.rows[0]
      ? {
          id: companies.rows[0].id,
          name: companies.rows[0].name,
          vertical: companies.rows[0].vertical,
          currency: companies.rows[0].currency,
          timezone: companies.rows[0].timezone,
          country: companies.rows[0].country,
          plan: (companies.rows[0].plan as SubscriptionPlan) ?? "essentiel",
          planSeats: Number(companies.rows[0].plan_seats ?? 1),
          planStartedAt: companies.rows[0].plan_started_at
            ? new Date(companies.rows[0].plan_started_at).toISOString()
            : null,
          planNotes: companies.rows[0].plan_notes ?? "",
        }
      : {
          id: "company-unknown",
          name: "",
          vertical: "",
          currency: "MAD",
          timezone: appConfig.appTimeZone,
          country: "",
          plan: "essentiel",
          planSeats: 1,
          planStartedAt: null,
          planNotes: "",
        };

    const territoryLabel = new Map<string, string>(
      territories.rows.map((row) => [row.id, row.label as string]),
    );
    const userName = new Map<string, string>(
      users.rows.map((row) => [row.id, row.name as string]),
    );
    const productName = new Map<string, string>(
      products.rows.map((row) => [row.id, row.name as string]),
    );
    const linesByOrder = new Map<string, OrderLine[]>();
    for (const row of orderLines.rows) {
      const line: OrderLine = {
        id: row.id,
        orderId: row.order_id,
        productId: row.product_id ?? null,
        productName: row.product_name || (row.product_id ? productName.get(row.product_id) : "") || "",
        quantity: numberOrZero(row.quantity),
        unitPrice: numberOrZero(row.unit_price),
        discountPercent: numberOrZero(row.discount_percent),
        lineTotal: numberOrZero(row.line_total),
      };
      const list = linesByOrder.get(line.orderId) ?? [];
      list.push(line);
      linesByOrder.set(line.orderId, list);
    }

    return {
      company,
      roles: ROLE_DEFINITIONS,
      teams: teams.rows.map((row) => ({
        id: row.id,
        name: row.name,
        managerUserId: row.manager_user_id ?? "",
      })),
      territories: territories.rows.map((row) => ({
        id: row.id,
        label: row.label,
        region: row.region,
      })),
      users: users.rows.map((row) => ({
        id: row.id,
        name: row.name,
        initials: row.initials,
        email: row.email,
        phone: row.phone ?? "",
        title: row.title ?? "",
        role: row.role as RoleKey,
        teamId: row.team_id ?? undefined,
        territoryIds: territoriesByUser.get(row.id) ?? [],
        active: row.active,
        passwordHash: row.password_hash,
        avatarUrl: row.avatar_url ?? null,
      })),
      clients: clients.rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        status: row.status,
        segment: row.segment,
        address: row.address ?? "",
        city: row.city ?? "",
        zone: row.zone ?? "",
        territoryId: row.territory_id,
        territoryLabel: territoryLabel.get(row.territory_id) ?? "",
        ownerUserId: row.owner_user_id,
        ownerName: userName.get(row.owner_user_id) ?? "",
        contactName: row.contact_name ?? "",
        phone: row.phone ?? "",
        email: row.email ?? "",
        potentialScore: row.potential_score,
        financialRisk: row.financial_risk,
        lastVisit: toDateOrNull(row.last_visit),
        nextVisit: toDateOrNull(row.next_visit),
        notes: row.notes ?? "",
        ice: row.ice ?? "",
        taxId: row.tax_id ?? "",
        rc: row.rc ?? "",
        fiscalAddress: row.fiscal_address ?? "",
        fiscalCity: row.fiscal_city ?? "",
      })),
      visits: visits.rows.map((row) => ({
        id: row.id,
        clientId: row.client_id ?? undefined,
        clientName: row.client_name,
        address: row.address ?? "",
        city: row.city ?? "",
        objective: row.objective ?? "",
        scheduledDate: toDateOrNull(row.scheduled_date) ?? "",
        startTime: row.start_time,
        endTime: row.end_time,
        status: row.status,
        ownerUserId: row.owner_user_id,
        ownerName: userName.get(row.owner_user_id) ?? "",
        territoryId: row.territory_id,
        territoryLabel: territoryLabel.get(row.territory_id) ?? "",
        report: row.report ?? "",
        nextAction: row.next_action ?? "",
        checkInAt: toIsoOrNull(row.check_in_at),
        checkOutAt: toIsoOrNull(row.check_out_at),
        checkInLocation:
          row.check_in_lat !== null && row.check_in_lng !== null
            ? { lat: Number(row.check_in_lat), lng: Number(row.check_in_lng) }
            : null,
        checkOutLocation:
          row.check_out_lat !== null && row.check_out_lng !== null
            ? { lat: Number(row.check_out_lat), lng: Number(row.check_out_lng) }
            : null,
      })),
      opportunities: opportunities.rows.map((row) => ({
        id: row.id,
        clientId: row.client_id ?? undefined,
        clientName: row.client_name,
        amount: numberOrZero(row.amount),
        probability: row.probability,
        stage: row.stage,
        expectedClose: toDateOrNull(row.expected_close) ?? "",
        priority: row.priority,
        nextAction: row.next_action ?? "",
        ownerUserId: row.owner_user_id,
        ownerName: userName.get(row.owner_user_id) ?? "",
        territoryId: row.territory_id,
        territoryLabel: territoryLabel.get(row.territory_id) ?? "",
        lossReason: row.loss_reason ?? undefined,
        updatedAt: toIsoOrNull(row.updated_at) ?? undefined,
      })),
      orders: orders.rows.map((row) => ({
        id: row.id,
        clientId: row.client_id ?? undefined,
        clientName: row.client_name,
        ownerUserId: row.owner_user_id,
        ownerName: userName.get(row.owner_user_id) ?? "",
        territoryId: row.territory_id,
        territoryLabel: territoryLabel.get(row.territory_id) ?? "",
        date: toDateOrNull(row.date) ?? "",
        amount: numberOrZero(row.amount),
        discount: numberOrZero(row.discount),
        status: row.status,
        approvalStatus: row.approval_status,
        syncStatus: row.sync_status,
        notes: row.notes ?? "",
        lines: linesByOrder.get(row.id) ?? [],
      })),
      products: products.rows.map((row) => ({
        id: row.id,
        name: row.name,
        ref: row.ref,
        category: row.category ?? "",
        price: numberOrZero(row.price),
        stock: row.stock,
        status: row.status,
        image: row.image ?? undefined,
        description: row.description ?? "",
      })),
      targets: targets.rows.map((row) => ({
        id: row.id,
        ownerUserId: row.owner_user_id,
        periodLabel: row.period_label,
        revenueGoal: numberOrZero(row.revenue_goal),
        visitsGoal: row.visits_goal,
        opportunitiesGoal: row.opportunities_goal,
        ordersGoal: row.orders_goal,
      })),
      integrations: integrations.rows.map((row) => ({
        id: row.id,
        name: row.name,
        provider: row.provider,
        scope: row.scope ?? "",
        status: row.status,
        lastSyncAt: toIsoOrNull(row.last_sync_at),
        description: row.description ?? "",
        endpointUrl: row.endpoint_url ?? "",
        lastError: row.last_error ?? "",
      })),
      notifications: notifications.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        body: row.body ?? "",
        level: row.level,
        read: row.read,
        link: row.link ?? undefined,
        createdAt: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
      })),
      preferences: preferences.rows.map((row) => ({
        userId: row.user_id,
        emailNotifications: row.email_notifications,
        weeklyDigest: row.weekly_digest,
        autoSync: row.auto_sync,
      })),
      auditLogs: auditLogs.rows.map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id ?? "",
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        createdAt: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
        meta: row.meta ?? undefined,
      })),
      prospects: prospects.rows.map((row) => ({
        id: row.id,
        name: row.name,
        contactName: row.contact_name ?? "",
        phone: row.phone ?? "",
        email: row.email ?? "",
        source: row.source ?? "",
        team: row.team ?? "field",
        leadSource: row.lead_source ?? "societe",
        need: row.need ?? "",
        solutionFit: row.solution_fit ?? "",
        // Field intake
        address: row.address ?? "",
        zone: row.zone ?? "",
        establishmentType: row.establishment_type ?? "",
        potential: row.potential ?? null,
        competitor: row.competitor ?? "",
        nextVisitAt: toIsoOrNull(row.next_visit_at),
        status: row.status,
        score: row.score,
        ownerUserId: row.owner_user_id,
        ownerName: userName.get(row.owner_user_id) ?? "",
        territoryId: row.territory_id,
        territoryLabel: territoryLabel.get(row.territory_id) ?? "",
        notes: row.notes ?? "",
        convertedClientId: row.converted_client_id ?? null,
        convertedAt: toIsoOrNull(row.converted_at),
        createdAt: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
      })),
      activities: activities.rows.map((row) => ({
        id: row.id,
        type: row.type,
        subject: row.subject,
        content: row.content ?? "",
        ownerUserId: row.owner_user_id,
        ownerName: userName.get(row.owner_user_id) ?? "",
        clientId: row.client_id ?? null,
        opportunityId: row.opportunity_id ?? null,
        prospectId: row.prospect_id ?? null,
        dueDate: toIsoOrNull(row.due_date),
        completedAt: toIsoOrNull(row.completed_at),
        createdAt: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
      })),
      documents: documents.rows.map((row) => ({
        id: row.id,
        name: row.name,
        blobUrl: row.blob_url,
        sizeBytes: Number(row.size_bytes) || 0,
        contentType: row.content_type ?? "",
        uploadedByUserId: row.uploaded_by_user_id,
        uploadedByName: userName.get(row.uploaded_by_user_id) ?? "",
        clientId: row.client_id ?? null,
        orderId: row.order_id ?? null,
        opportunityId: row.opportunity_id ?? null,
        signedAt: toIsoOrNull(row.signed_at),
        signedByName: row.signed_by_name ?? null,
        createdAt: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
      })),
      orderLines: orderLines.rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        productId: row.product_id ?? null,
        productName: row.product_name || (row.product_id ? productName.get(row.product_id) : "") || "",
        quantity: numberOrZero(row.quantity),
        unitPrice: numberOrZero(row.unit_price),
        discountPercent: numberOrZero(row.discount_percent),
        lineTotal: numberOrZero(row.line_total),
      })),
      contracts: contracts.rows.map((row) => ({
        id: row.id,
        number: row.number,
        clientId: row.client_id ?? null,
        clientName: row.client_name,
        ownerUserId: row.owner_user_id,
        ownerName: userName.get(row.owner_user_id) ?? "",
        status: row.status,
        startDate: toDateOrNull(row.start_date) ?? "",
        endDate: toDateOrNull(row.end_date) ?? "",
        renewalDate: toDateOrNull(row.renewal_date),
        amount: numberOrZero(row.amount),
        currency: row.currency ?? company.currency,
        notes: row.notes ?? "",
        createdAt: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
      })),
      cases: cases.rows.map((row) => ({
        id: row.id,
        title: row.title,
        clientId: row.client_id ?? null,
        clientName: row.client_name,
        ownerUserId: row.owner_user_id,
        ownerName: userName.get(row.owner_user_id) ?? "",
        status: row.status,
        priority: row.priority,
        category: row.category ?? "",
        description: row.description ?? "",
        resolution: row.resolution ?? "",
        dueAt: toIsoOrNull(row.due_at),
        createdAt: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
        updatedAt: toIsoOrNull(row.updated_at) ?? new Date().toISOString(),
      })),
      campaigns: campaigns.rows.map((row) => ({
        id: row.id,
        name: row.name,
        channel: row.channel,
        status: row.status,
        audience: row.audience ?? "",
        ownerUserId: row.owner_user_id,
        ownerName: userName.get(row.owner_user_id) ?? "",
        scheduledAt: toIsoOrNull(row.scheduled_at),
        sentCount: Number(row.sent_count ?? 0),
        responseCount: Number(row.response_count ?? 0),
        notes: row.notes ?? "",
        createdAt: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
      })),
      calls: calls.rows.map((row) => ({
        id: row.id,
        subject: row.subject,
        phone: row.phone ?? "",
        clientId: row.client_id ?? null,
        clientName: row.client_name,
        ownerUserId: row.owner_user_id,
        ownerName: userName.get(row.owner_user_id) ?? "",
        status: row.status,
        scheduledAt: toIsoOrNull(row.scheduled_at) ?? new Date().toISOString(),
        durationSeconds: Number(row.duration_seconds ?? 0),
        outcome: row.outcome ?? "",
        notes: row.notes ?? "",
        createdAt: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
      })),
    };
  }

  private async persistDiff(client: PgClient, before: Database, after: Database) {
    if (!rowsEqual(before.company, after.company)) {
      await client.query(
        `INSERT INTO companies (id, name, vertical, currency, timezone, country, plan, plan_seats, plan_started_at, plan_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           vertical = EXCLUDED.vertical,
           currency = EXCLUDED.currency,
           timezone = EXCLUDED.timezone,
           country = EXCLUDED.country,
           plan = EXCLUDED.plan,
           plan_seats = EXCLUDED.plan_seats,
           plan_started_at = EXCLUDED.plan_started_at,
           plan_notes = EXCLUDED.plan_notes`,
        [
          after.company.id,
          after.company.name,
          after.company.vertical,
          after.company.currency,
          after.company.timezone,
          after.company.country,
          after.company.plan ?? "essentiel",
          after.company.planSeats ?? 1,
          after.company.planStartedAt ?? new Date().toISOString(),
          after.company.planNotes ?? "",
        ],
      );
    }

    await syncRows(client, "territories", before.territories, after.territories, (row) => ({
      keys: ["id", "label", "region"],
      values: [row.id, row.label, row.region],
      id: row.id,
    }));

    await syncRows(client, "teams", before.teams, after.teams, (row) => ({
      keys: ["id", "name", "manager_user_id"],
      values: [row.id, row.name, row.managerUserId || null],
      id: row.id,
    }));

    await syncRows(
      client,
      "users",
      before.users.map(({ territoryIds: _unused, ...rest }) => rest),
      after.users.map(({ territoryIds: _unused, ...rest }) => rest),
      (row) => ({
        keys: [
          "id",
          "name",
          "initials",
          "email",
          "phone",
          "title",
          "role",
          "team_id",
          "active",
          "password_hash",
          "avatar_url",
        ],
        values: [
          row.id,
          row.name,
          row.initials,
          row.email,
          row.phone ?? "",
          row.title ?? "",
          row.role,
          row.teamId ?? null,
          row.active,
          row.passwordHash,
          row.avatarUrl ?? null,
        ],
        id: row.id,
      }),
    );

    await syncUserTerritories(client, before.users, after.users);

    await syncRows(client, "clients", before.clients, after.clients, (row) => ({
      keys: [
        "id",
        "name",
        "type",
        "status",
        "segment",
        "address",
        "city",
        "zone",
        "territory_id",
        "owner_user_id",
        "contact_name",
        "phone",
        "email",
        "potential_score",
        "financial_risk",
        "last_visit",
        "next_visit",
        "notes",
        "ice",
        "tax_id",
        "rc",
        "fiscal_address",
        "fiscal_city",
      ],
      values: [
        row.id,
        row.name,
        row.type,
        row.status,
        row.segment,
        row.address ?? "",
        row.city ?? "",
        row.zone ?? "",
        row.territoryId,
        row.ownerUserId,
        row.contactName ?? "",
        row.phone ?? "",
        row.email ?? "",
        row.potentialScore ?? 0,
        row.financialRisk ?? "low",
        row.lastVisit ?? null,
        row.nextVisit ?? null,
        row.notes ?? "",
        row.ice ?? "",
        row.taxId ?? "",
        row.rc ?? "",
        row.fiscalAddress ?? "",
        row.fiscalCity ?? "",
      ],
      id: row.id,
    }));

    await syncRows(client, "visits", before.visits, after.visits, (row) => ({
      keys: [
        "id",
        "client_id",
        "client_name",
        "address",
        "city",
        "objective",
        "scheduled_date",
        "start_time",
        "end_time",
        "status",
        "owner_user_id",
        "territory_id",
        "report",
        "next_action",
        "check_in_at",
        "check_out_at",
        "check_in_lat",
        "check_in_lng",
        "check_out_lat",
        "check_out_lng",
      ],
      values: [
        row.id,
        row.clientId ?? null,
        row.clientName,
        row.address ?? "",
        row.city ?? "",
        row.objective ?? "",
        row.scheduledDate,
        row.startTime ?? "09:00",
        row.endTime ?? "10:00",
        row.status,
        row.ownerUserId,
        row.territoryId,
        row.report ?? "",
        row.nextAction ?? "",
        row.checkInAt ?? null,
        row.checkOutAt ?? null,
        row.checkInLocation?.lat ?? null,
        row.checkInLocation?.lng ?? null,
        row.checkOutLocation?.lat ?? null,
        row.checkOutLocation?.lng ?? null,
      ],
      id: row.id,
    }));

    await syncRows(client, "opportunities", before.opportunities, after.opportunities, (row) => ({
      keys: [
        "id",
        "client_id",
        "client_name",
        "amount",
        "probability",
        "stage",
        "expected_close",
        "priority",
        "next_action",
        "owner_user_id",
        "territory_id",
        "loss_reason",
      ],
      values: [
        row.id,
        row.clientId ?? null,
        row.clientName,
        row.amount ?? 0,
        row.probability ?? 0,
        row.stage,
        row.expectedClose,
        row.priority,
        row.nextAction ?? "",
        row.ownerUserId,
        row.territoryId,
        row.lossReason ?? null,
      ],
      id: row.id,
    }));

    await syncRows(client, "orders", before.orders, after.orders, (row) => ({
      keys: [
        "id",
        "client_id",
        "client_name",
        "owner_user_id",
        "territory_id",
        "date",
        "amount",
        "discount",
        "status",
        "approval_status",
        "sync_status",
        "notes",
      ],
      values: [
        row.id,
        row.clientId ?? null,
        row.clientName,
        row.ownerUserId,
        row.territoryId,
        row.date,
        row.amount ?? 0,
        row.discount ?? 0,
        row.status,
        row.approvalStatus,
        row.syncStatus ?? "not_synced",
        row.notes ?? "",
      ],
      id: row.id,
    }));

    await syncRows(client, "order_lines", before.orderLines, after.orderLines, (row) => ({
      keys: [
        "id",
        "order_id",
        "product_id",
        "product_name",
        "quantity",
        "unit_price",
        "discount_percent",
        "line_total",
      ],
      values: [
        row.id,
        row.orderId,
        row.productId ?? null,
        row.productName,
        row.quantity,
        row.unitPrice,
        row.discountPercent,
        row.lineTotal,
      ],
      id: row.id,
    }));

    await syncRows(client, "products", before.products, after.products, (row) => ({
      keys: [
        "id",
        "name",
        "ref",
        "category",
        "price",
        "stock",
        "status",
        "image",
        "description",
      ],
      values: [
        row.id,
        row.name,
        row.ref,
        row.category ?? "",
        row.price ?? 0,
        row.stock ?? 0,
        row.status,
        row.image ?? null,
        row.description ?? "",
      ],
      id: row.id,
    }));

    await syncRows(client, "targets", before.targets, after.targets, (row) => ({
      keys: [
        "id",
        "owner_user_id",
        "period_label",
        "revenue_goal",
        "visits_goal",
        "opportunities_goal",
        "orders_goal",
      ],
      values: [
        row.id,
        row.ownerUserId,
        row.periodLabel,
        row.revenueGoal ?? 0,
        row.visitsGoal ?? 0,
        row.opportunitiesGoal ?? 0,
        row.ordersGoal ?? 0,
      ],
      id: row.id,
    }));

    await syncRows(client, "integrations", before.integrations, after.integrations, (row) => ({
      keys: ["id", "name", "provider", "scope", "status", "last_sync_at", "description", "endpoint_url", "last_error"],
      values: [
        row.id,
        row.name,
        row.provider,
        row.scope ?? "",
        row.status,
        row.lastSyncAt ?? null,
        row.description ?? "",
        row.endpointUrl ?? "",
        row.lastError ?? "",
      ],
      id: row.id,
    }));

    await syncRows(
      client,
      "notifications",
      before.notifications,
      after.notifications,
      (row) => ({
        keys: ["id", "user_id", "title", "body", "level", "read", "link", "created_at"],
        values: [
          row.id,
          row.userId,
          row.title,
          row.body ?? "",
          row.level,
          row.read,
          row.link ?? null,
          row.createdAt,
        ],
        id: row.id,
      }),
    );

    await syncRows(
      client,
      "user_preferences",
      before.preferences,
      after.preferences,
      (row) => ({
        keys: ["user_id", "email_notifications", "weekly_digest", "auto_sync"],
        values: [row.userId, row.emailNotifications, row.weeklyDigest, row.autoSync],
        id: row.userId,
      }),
      "user_id",
    );

    await syncRows(client, "audit_logs", before.auditLogs, after.auditLogs, (row) => ({
      keys: ["id", "actor_user_id", "action", "entity_type", "entity_id", "meta", "created_at"],
      values: [
        row.id,
        row.actorUserId || null,
        row.action,
        row.entityType,
        row.entityId,
        row.meta ? JSON.stringify(row.meta) : null,
        row.createdAt,
      ],
      id: row.id,
    }));

    await syncRows(client, "prospects", before.prospects, after.prospects, (row) => ({
      keys: [
        "id",
        "name",
        "contact_name",
        "phone",
        "email",
        "source",
        "team",
        "lead_source",
        "need",
        "solution_fit",
        "address",
        "zone",
        "establishment_type",
        "potential",
        "competitor",
        "next_visit_at",
        "status",
        "score",
        "owner_user_id",
        "territory_id",
        "notes",
        "converted_client_id",
        "converted_at",
      ],
      values: [
        row.id,
        row.name,
        row.contactName ?? "",
        row.phone ?? "",
        row.email ?? "",
        row.source ?? "",
        row.team ?? "field",
        row.leadSource ?? "societe",
        row.need ?? "",
        row.solutionFit ?? "",
        row.address ?? "",
        row.zone ?? "",
        row.establishmentType ?? "",
        row.potential ?? null,
        row.competitor ?? "",
        row.nextVisitAt ?? null,
        row.status,
        row.score ?? 50,
        row.ownerUserId,
        row.territoryId,
        row.notes ?? "",
        row.convertedClientId ?? null,
        row.convertedAt ?? null,
      ],
      id: row.id,
    }));

    await syncRows(client, "activities", before.activities, after.activities, (row) => ({
      keys: [
        "id",
        "type",
        "subject",
        "content",
        "owner_user_id",
        "client_id",
        "opportunity_id",
        "prospect_id",
        "due_date",
        "completed_at",
        "created_at",
      ],
      values: [
        row.id,
        row.type,
        row.subject,
        row.content ?? "",
        row.ownerUserId,
        row.clientId ?? null,
        row.opportunityId ?? null,
        row.prospectId ?? null,
        row.dueDate ?? null,
        row.completedAt ?? null,
        row.createdAt,
      ],
      id: row.id,
    }));

    await syncRows(client, "documents", before.documents, after.documents, (row) => ({
      keys: [
        "id",
        "name",
        "blob_url",
        "size_bytes",
        "content_type",
        "uploaded_by_user_id",
        "client_id",
        "order_id",
        "opportunity_id",
        "signed_at",
        "signed_by_name",
        "created_at",
      ],
      values: [
        row.id,
        row.name,
        row.blobUrl,
        row.sizeBytes ?? 0,
        row.contentType ?? "",
        row.uploadedByUserId,
        row.clientId ?? null,
        row.orderId ?? null,
        row.opportunityId ?? null,
        row.signedAt ?? null,
        row.signedByName ?? null,
        row.createdAt,
      ],
      id: row.id,
    }));

    await syncRows(client, "contracts", before.contracts, after.contracts, (row) => ({
      keys: [
        "id",
        "number",
        "client_id",
        "client_name",
        "owner_user_id",
        "status",
        "start_date",
        "end_date",
        "renewal_date",
        "amount",
        "currency",
        "notes",
        "created_at",
      ],
      values: [
        row.id,
        row.number,
        row.clientId ?? null,
        row.clientName,
        row.ownerUserId,
        row.status,
        row.startDate,
        row.endDate,
        row.renewalDate ?? null,
        row.amount,
        row.currency,
        row.notes,
        row.createdAt,
      ],
      id: row.id,
    }));

    await syncRows(client, "cases", before.cases, after.cases, (row) => ({
      keys: [
        "id",
        "title",
        "client_id",
        "client_name",
        "owner_user_id",
        "status",
        "priority",
        "category",
        "description",
        "resolution",
        "due_at",
        "created_at",
        "updated_at",
      ],
      values: [
        row.id,
        row.title,
        row.clientId ?? null,
        row.clientName,
        row.ownerUserId,
        row.status,
        row.priority,
        row.category,
        row.description,
        row.resolution,
        row.dueAt ?? null,
        row.createdAt,
        row.updatedAt,
      ],
      id: row.id,
    }));

    await syncRows(client, "campaigns", before.campaigns, after.campaigns, (row) => ({
      keys: [
        "id",
        "name",
        "channel",
        "status",
        "audience",
        "owner_user_id",
        "scheduled_at",
        "sent_count",
        "response_count",
        "notes",
        "created_at",
      ],
      values: [
        row.id,
        row.name,
        row.channel,
        row.status,
        row.audience,
        row.ownerUserId,
        row.scheduledAt ?? null,
        row.sentCount,
        row.responseCount,
        row.notes,
        row.createdAt,
      ],
      id: row.id,
    }));

    await syncRows(client, "sales_calls", before.calls, after.calls, (row) => ({
      keys: [
        "id",
        "subject",
        "phone",
        "client_id",
        "client_name",
        "owner_user_id",
        "status",
        "scheduled_at",
        "duration_seconds",
        "outcome",
        "notes",
        "created_at",
      ],
      values: [
        row.id,
        row.subject,
        row.phone,
        row.clientId ?? null,
        row.clientName,
        row.ownerUserId,
        row.status,
        row.scheduledAt,
        row.durationSeconds,
        row.outcome,
        row.notes,
        row.createdAt,
      ],
      id: row.id,
    }));
  }
}

type RowSpec = { keys: string[]; values: unknown[]; id: string };

async function syncRows<T>(
  client: PgClient,
  table: string,
  before: T[],
  after: T[],
  toSpec: (row: T) => RowSpec,
  idColumn = "id",
) {
  const beforeSpecs = new Map(before.map((row) => {
    const spec = toSpec(row);
    return [spec.id, spec];
  }));
  const afterEntries = after.map((row) => ({ row, spec: toSpec(row) }));
  const afterIds = new Set(afterEntries.map((entry) => entry.spec.id));

  const inserts: T[] = [];
  const updates: T[] = [];
  const deletes: string[] = [];

  for (const { row, spec } of afterEntries) {
    const previous = beforeSpecs.get(spec.id);
    if (!previous) {
      inserts.push(row);
    } else if (!rowsEqual(previous.values, spec.values)) {
      updates.push(row);
    }
  }
  for (const id of beforeSpecs.keys()) {
    if (!afterIds.has(id)) {
      deletes.push(id);
    }
  }

  if (deletes.length > 0) {
    await client.query(
      `DELETE FROM ${table} WHERE ${idColumn} = ANY($1::text[])`,
      [deletes],
    );
  }

  for (const row of inserts) {
    const spec = toSpec(row);
    const placeholders = spec.keys.map((_, index) => `$${index + 1}`).join(", ");
    await client.query(
      `INSERT INTO ${table} (${spec.keys.join(", ")}) VALUES (${placeholders})`,
      spec.values,
    );
  }

  for (const row of updates) {
    const spec = toSpec(row);
    const assignments = spec.keys
      .filter((key) => key !== idColumn)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(", ");
    const updateValues = [
      spec.id,
      ...spec.keys.filter((key) => key !== idColumn).map((key) => {
        const indexOfKey = spec.keys.indexOf(key);
        return spec.values[indexOfKey];
      }),
    ];
    await client.query(
      `UPDATE ${table} SET ${assignments} WHERE ${idColumn} = $1`,
      updateValues,
    );
  }
}

async function syncUserTerritories(client: PgClient, before: DbUser[], after: DbUser[]) {
  type Pair = { userId: string; territoryId: string; position: number };
  const flatten = (users: DbUser[]): Pair[] =>
    users.flatMap((user) =>
      user.territoryIds.map((territoryId, index) => ({
        userId: user.id,
        territoryId,
        position: index,
      })),
    );

  const key = (pair: Pair) => `${pair.userId}|${pair.territoryId}`;
  const beforePairs = new Map(flatten(before).map((pair) => [key(pair), pair]));
  const afterPairs = new Map(flatten(after).map((pair) => [key(pair), pair]));

  const toDelete: Pair[] = [];
  const toUpsert: Pair[] = [];

  for (const [k, pair] of afterPairs) {
    const previous = beforePairs.get(k);
    if (!previous || previous.position !== pair.position) {
      toUpsert.push(pair);
    }
  }
  for (const [k, pair] of beforePairs) {
    if (!afterPairs.has(k)) {
      toDelete.push(pair);
    }
  }

  for (const pair of toDelete) {
    await client.query(
      `DELETE FROM user_territories WHERE user_id = $1 AND territory_id = $2`,
      [pair.userId, pair.territoryId],
    );
  }
  for (const pair of toUpsert) {
    await client.query(
      `INSERT INTO user_territories (user_id, territory_id, position)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, territory_id) DO UPDATE SET position = EXCLUDED.position`,
      [pair.userId, pair.territoryId, pair.position],
    );
  }
}

function emptyDatabaseShape(): Database {
  return {
    company: {
      id: "",
      name: "",
      vertical: "",
      currency: "",
      timezone: "",
      country: "",
      plan: "essentiel",
      planSeats: 1,
      planStartedAt: null,
      planNotes: "",
    },
    roles: ROLE_DEFINITIONS,
    teams: [],
    territories: [],
    users: [],
    clients: [],
    visits: [],
    opportunities: [],
    orders: [],
    products: [],
    targets: [],
    integrations: [],
    notifications: [],
    preferences: [],
    auditLogs: [],
    prospects: [],
    activities: [],
    documents: [],
    orderLines: [],
    contracts: [],
    cases: [],
    campaigns: [],
    calls: [],
  };
}

if (!appConfig.databaseUrl) {
  throw new Error(
    "DATABASE_URL (ou POSTGRES_URL) est obligatoire. Cette application fonctionne uniquement avec Postgres.",
  );
}

const store = new PostgresDatabase(appConfig.databaseUrl);

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
}

function writeLog(level: "info" | "error", event: string, meta: Record<string, unknown> = {}) {
  if (appConfig.logLevel === "silent") {
    return;
  }
  if (appConfig.logLevel === "error" && level !== "error") {
    return;
  }
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...meta,
  });
  if (level === "error") {
    console.error(payload);
    return;
  }
  console.log(payload);
}

function logInfo(event: string, meta: Record<string, unknown> = {}) {
  writeLog("info", event, meta);
}

function logError(event: string, meta: Record<string, unknown> = {}) {
  writeLog("error", event, meta);
}

function currentBusinessDate(timeZone = appConfig.appTimeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function buildApiErrorPayload(req: AuthenticatedRequest, message: string) {
  return req.requestId ? { error: message, requestId: req.requestId } : { error: message };
}

function asyncRoute<TRequest extends Request = Request>(
  handler: (req: TRequest, res: Response, next: NextFunction) => Promise<void> | void,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req as TRequest, res, next)).catch(next);
  };
}

type RateLimitOptions = {
  name: string;
  windowMs: number;
  max: number;
  key: (req: Request) => string;
  message: string;
};

function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();

    if (buckets.size > 5000) {
      Array.from(buckets.entries()).forEach(([key, value]) => {
        if (value.resetAt <= now) {
          buckets.delete(key);
        }
      });
    }

    const bucketKey = `${options.name}:${options.key(req)}`;
    const current = buckets.get(bucketKey);

    if (!current || current.resetAt <= now) {
      buckets.set(bucketKey, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      next();
      return;
    }

    if (current.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json(buildApiErrorPayload(req as AuthenticatedRequest, options.message));
      return;
    }

    current.count += 1;
    next();
  };
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(":");
  if (!salt || !expected) {
    return false;
  }
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return safeEqual(actual, expected);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSessionToken(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      exp: Date.now() + SESSION_TTL_MS,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", appConfig.sessionSecret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function parseSessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = crypto
    .createHmac("sha256", appConfig.sessionSecret)
    .update(payload)
    .digest("base64url");
  if (!safeEqual(signature, expected)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId: string;
      exp: number;
    };
    if (decoded.exp <= Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader?: string) {
  const parsed: Record<string, string> = {};
  if (!cookieHeader) {
    return parsed;
  }
  cookieHeader.split(";").forEach((entry) => {
    const [rawKey, ...rawValue] = entry.trim().split("=");
    if (!rawKey) {
      return;
    }
    parsed[rawKey] = decodeURIComponent(rawValue.join("="));
  });
  return parsed;
}

function sessionCookieAttributes(maxAgeSeconds: number) {
  return [
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    appConfig.isProduction ? "Secure" : null,
    "Priority=High",
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function setSessionCookie(res: Response, token: string) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${sessionCookieAttributes(
      SESSION_TTL_MS / 1000,
    )}`,
  );
}

function clearSessionCookie(res: Response) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; ${sessionCookieAttributes(0)}`,
  );
}

function getRoleDefinition(role: RoleKey) {
  return ROLE_DEFINITIONS.find((entry) => entry.key === role) || ROLE_DEFINITIONS[0];
}

function territoryLabelMap(db: Database) {
  return new Map(db.territories.map((territory) => [territory.id, territory.label]));
}

function teamLabelMap(db: Database) {
  return new Map(db.teams.map((team) => [team.id, team.name]));
}

function buildUserSummary(db: Database, user: DbUser): UserSummary {
  const territories = territoryLabelMap(db);
  const teams = teamLabelMap(db);
  const role = getRoleDefinition(user.role);
  return {
    id: user.id,
    name: user.name,
    initials: user.initials,
    email: user.email,
    phone: user.phone,
    role: user.role,
    roleLabel: role.label,
    title: user.title,
    teamId: user.teamId,
    teamName: user.teamId ? teams.get(user.teamId) : undefined,
    territoryIds: user.territoryIds,
    territoryLabels: user.territoryIds.map((territoryId) => territories.get(territoryId) || territoryId),
    active: user.active,
    avatarUrl: user.avatarUrl ?? null,
  };
}

function buildSessionPayload(db: Database, user: DbUser): SessionPayload {
  const permissions = getRoleDefinition(user.role).permissions;
  const unreadNotifications = db.notifications.filter((item) => item.userId === user.id && !item.read).length;
  return {
    company: db.company,
    user: buildUserSummary(db, user),
    permissions,
    unreadNotifications,
  };
}

function hasPermission(user: DbUser, permission: PermissionKey) {
  return getRoleDefinition(user.role).permissions.includes(permission);
}

function getVisibleUserIds(db: Database, user: DbUser) {
  if (GLOBAL_READ_ROLES.has(user.role)) {
    return new Set(db.users.filter((entry) => entry.active).map((entry) => entry.id));
  }
  if (user.role === "manager") {
    return new Set(
      db.users
        .filter((entry) => entry.active && entry.teamId && entry.teamId === user.teamId)
        .map((entry) => entry.id),
    );
  }
  return new Set([user.id]);
}

function canSeeEntity(db: Database, user: DbUser, entity: { ownerUserId: string; territoryId: string }) {
  if (GLOBAL_READ_ROLES.has(user.role)) {
    return true;
  }
  if (user.role === "manager") {
    const visibleUsers = getVisibleUserIds(db, user);
    return visibleUsers.has(entity.ownerUserId);
  }
  return entity.ownerUserId === user.id;
}

function canSeeOwner(db: Database, user: DbUser, ownerUserId: string) {
  if (GLOBAL_READ_ROLES.has(user.role)) {
    return true;
  }
  return getVisibleUserIds(db, user).has(ownerUserId);
}

function addAuditLog(db: Database, actorUserId: string, action: string, entityType: string, entityId: string, meta?: Record<string, unknown>) {
  db.auditLogs.unshift({
    id: crypto.randomUUID(),
    actorUserId,
    action,
    entityType,
    entityId,
    createdAt: new Date().toISOString(),
    meta,
  });
  db.auditLogs = db.auditLogs.slice(0, 500);
}

function createNotification(db: Database, payload: Omit<NotificationItem, "id" | "createdAt"> & { userId: string }) {
  db.notifications.unshift({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...payload,
  });
  db.notifications = db.notifications.slice(0, 400);
}

function sumOrders(orders: Order[]) {
  return orders.reduce((total, order) => total + order.amount, 0);
}

function sumPipeline(opportunities: Opportunity[]) {
  return opportunities
    .filter((opportunity) => opportunity.stage !== "won" && opportunity.stage !== "lost")
    .reduce((total, opportunity) => total + opportunity.amount, 0);
}

function probabilityForStage(stage: PipelineStage) {
  switch (stage) {
    case "qualification":
      return 20;
    case "proposal":
      return 50;
    case "negotiation":
      return 75;
    case "won":
      return 100;
    case "lost":
      return 0;
    default:
      return 20;
  }
}

function getVisibleClients(db: Database, user: DbUser) {
  return db.clients.filter((client) => canSeeEntity(db, user, client));
}

function getVisibleVisits(db: Database, user: DbUser) {
  return db.visits.filter((visit) => canSeeEntity(db, user, visit));
}

function getVisibleOpportunities(db: Database, user: DbUser) {
  return db.opportunities.filter((opportunity) => canSeeEntity(db, user, opportunity));
}

function getVisibleOrders(db: Database, user: DbUser) {
  return db.orders.filter((order) => canSeeEntity(db, user, order));
}

function buildOrderLines(db: Database, orderId: string, input: unknown): OrderLine[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((rawLine) => {
      const line = rawLine as Record<string, unknown>;
      const product = line.productId
        ? db.products.find((entry) => entry.id === String(line.productId))
        : undefined;
      const quantity = Math.max(0.001, toNumber(line.quantity, 1));
      const unitPrice = Math.max(0, toNumber(line.unitPrice, product?.price ?? 0));
      const discountPercent = Math.max(0, Math.min(100, toNumber(line.discountPercent, 0)));
      const productName = String(line.productName || product?.name || "Article").trim();
      return {
        id: line.id ? String(line.id) : `ol-${crypto.randomUUID()}`,
        orderId,
        productId: product?.id ?? (line.productId ? String(line.productId) : null),
        productName,
        quantity,
        unitPrice,
        discountPercent,
        lineTotal: Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100,
      } satisfies OrderLine;
    })
    .filter((line) => line.productName && line.quantity > 0);
}

function getVisibleTargets(db: Database, user: DbUser): TargetProgress[] {
  const visibleUsers = getVisibleUserIds(db, user);
  const visits = getVisibleVisits(db, user);
  const orders = getVisibleOrders(db, user);
  const opportunities = getVisibleOpportunities(db, user);

  return db.targets
    .filter((target) => visibleUsers.has(target.ownerUserId))
    .map((target) => {
      const owner = db.users.find((entry) => entry.id === target.ownerUserId);
      const ownerName = owner ? owner.name : target.ownerUserId;
      const revenueActual = sumOrders(orders.filter((order) => order.ownerUserId === target.ownerUserId && order.status !== "cancelled"));
      const visitsActual = visits.filter((visit) => visit.ownerUserId === target.ownerUserId && visit.status === "completed").length;
      const opportunitiesActual = opportunities.filter(
        (opportunity) => opportunity.ownerUserId === target.ownerUserId && opportunity.stage !== "lost",
      ).length;
      const ordersActual = orders.filter((order) => order.ownerUserId === target.ownerUserId).length;
      return {
        ...target,
        ownerName,
        revenueActual,
        visitsActual,
        opportunitiesActual,
        ordersActual,
      };
    });
}

function buildDashboard(db: Database, user: DbUser): DashboardSnapshot {
  const today = currentBusinessDate(db.company.timezone || appConfig.appTimeZone);
  const clients = getVisibleClients(db, user);
  const visits = getVisibleVisits(db, user);
  const opportunities = getVisibleOpportunities(db, user);
  const orders = getVisibleOrders(db, user);
  const notifications = db.notifications.filter((item) => item.userId === user.id);
  const todayVisits = visits
    .filter((visit) => visit.scheduledDate === today)
    .sort((left, right) => left.startTime.localeCompare(right.startTime));

  const alerts: DashboardAlert[] = [];
  const overdueOpportunities = opportunities.filter(
    (opportunity) =>
      opportunity.stage !== "won" &&
      opportunity.stage !== "lost" &&
      opportunity.expectedClose < today,
  );
  const lowStockProducts = db.products.filter((product) => product.stock <= 10).slice(0, 4);
  const pendingApprovals = orders.filter((order) => order.approvalStatus === "pending");

  overdueOpportunities.slice(0, 2).forEach((opportunity) => {
    alerts.push({
      id: opportunity.id,
      level: "warning",
      title: "Opportunite en retard",
      description: `${opportunity.clientName} devait avancer avant le ${opportunity.expectedClose}.`,
      link: "/pipeline",
    });
  });

  pendingApprovals.slice(0, 2).forEach((order) => {
    alerts.push({
      id: order.id,
      level: "critical",
      title: "Validation de commande requise",
      description: `${order.clientName} attend une validation de remise sur ${order.id}.`,
      link: "/orders",
    });
  });

  lowStockProducts.slice(0, 2).forEach((product) => {
    alerts.push({
      id: product.id,
      level: "warning",
      title: "Stock faible",
      description: `${product.name} n'a plus que ${product.stock} unites disponibles.`,
      link: "/products",
    });
  });

  return {
    company: db.company,
    me: buildUserSummary(db, user),
    kpis: {
      totalClients: clients.length,
      activeOpportunities: opportunities.filter((item) => item.stage !== "won" && item.stage !== "lost").length,
      pipelineAmount: sumPipeline(opportunities),
      monthlyOrdersAmount: sumOrders(orders.filter((order) => order.status !== "cancelled")),
      todayVisits: todayVisits.length,
      completedVisits: todayVisits.filter((visit) => visit.status === "completed").length,
      pendingApprovals: pendingApprovals.length,
      unreadNotifications: notifications.filter((item) => !item.read).length,
    },
    todayVisits: todayVisits.slice(0, 6),
    recentOrders: [...orders]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 5),
    focusOpportunities: [...opportunities]
      .filter((opportunity) => opportunity.stage !== "won" && opportunity.stage !== "lost")
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 5),
    lowStockProducts,
    alerts: alerts.slice(0, 6),
  };
}

function buildManagerOverview(db: Database, user: DbUser): ManagerOverview {
  const today = currentBusinessDate(db.company.timezone || appConfig.appTimeZone);
  const visibleUsers = getVisibleUserIds(db, user);
  const visits = getVisibleVisits(db, user);
  const orders = getVisibleOrders(db, user);
  const opportunities = getVisibleOpportunities(db, user);
  const clients = getVisibleClients(db, user);

  const teamMembers = [...visibleUsers]
    .map((userId) => {
      const member = db.users.find((entry) => entry.id === userId);
      if (!member) {
        return null;
      }
      return {
        userId,
        name: member.name,
        roleLabel: getRoleDefinition(member.role).label,
        visitsCompleted: visits.filter((visit) => visit.ownerUserId === userId && visit.status === "completed").length,
        ordersAmount: sumOrders(orders.filter((order) => order.ownerUserId === userId && order.status !== "cancelled")),
        pipelineAmount: sumPipeline(opportunities.filter((opportunity) => opportunity.ownerUserId === userId)),
      };
    })
    .filter(Boolean) as ManagerOverview["teamMembers"];

  const territoryCoverage = db.territories
    .map((territory) => ({
      territoryLabel: territory.label,
      clients: clients.filter((client) => client.territoryId === territory.id).length,
      visits: visits.filter((visit) => visit.territoryId === territory.id).length,
      revenue: sumOrders(orders.filter((order) => order.territoryId === territory.id)),
    }))
    .filter((entry) => entry.clients > 0 || entry.visits > 0 || entry.revenue > 0);

  return {
    teamMembers,
    pendingApprovals: orders.filter((order) => order.approvalStatus === "pending"),
    blockedOpportunities: opportunities.filter(
      (opportunity) =>
        opportunity.stage !== "won" &&
        opportunity.stage !== "lost" &&
        (opportunity.priority === "critical" || opportunity.expectedClose < today),
    ),
    territoryCoverage,
  };
}

function findUserByEmail(db: Database, email: string) {
  return db.users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase());
}

function findUserById(db: Database, userId: string) {
  return db.users.find((user) => user.id === userId);
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeStage(stage: unknown): PipelineStage {
  const allowed: PipelineStage[] = ["qualification", "proposal", "negotiation", "won", "lost"];
  return allowed.includes(stage as PipelineStage) ? (stage as PipelineStage) : "qualification";
}

function normalizeVisitStatus(status: unknown): VisitStatus {
  const allowed: VisitStatus[] = ["planned", "in_progress", "completed", "missed", "cancelled"];
  return allowed.includes(status as VisitStatus) ? (status as VisitStatus) : "planned";
}

function normalizeOrderStatus(status: unknown): OrderStatus {
  const allowed: OrderStatus[] = ["draft", "awaiting_approval", "confirmed", "delivered", "cancelled"];
  return allowed.includes(status as OrderStatus) ? (status as OrderStatus) : "draft";
}

function normalizeContractStatus(status: unknown) {
  const allowed = ["draft", "active", "renewal_due", "expired", "cancelled"] as const;
  return allowed.includes(status as typeof allowed[number]) ? status as typeof allowed[number] : "draft";
}

function normalizeCaseStatus(status: unknown) {
  const allowed = ["open", "pending", "resolved", "closed"] as const;
  return allowed.includes(status as typeof allowed[number]) ? status as typeof allowed[number] : "open";
}

function normalizeCampaignStatus(status: unknown) {
  const allowed = ["draft", "scheduled", "running", "completed", "paused"] as const;
  return allowed.includes(status as typeof allowed[number]) ? status as typeof allowed[number] : "draft";
}

function normalizeCampaignChannel(channel: unknown) {
  const allowed = ["email", "sms", "whatsapp", "phone"] as const;
  return allowed.includes(channel as typeof allowed[number]) ? channel as typeof allowed[number] : "email";
}

function normalizeCallStatus(status: unknown) {
  const allowed = ["planned", "completed", "missed"] as const;
  return allowed.includes(status as typeof allowed[number]) ? status as typeof allowed[number] : "planned";
}

function normalizePriority(priority: unknown): PriorityLevel {
  const allowed: PriorityLevel[] = ["low", "medium", "high", "critical"];
  return allowed.includes(priority as PriorityLevel) ? (priority as PriorityLevel) : "medium";
}

function resolveOwner(db: Database, actor: DbUser, requestedOwnerUserId?: unknown) {
  if (!requestedOwnerUserId || !POWER_ROLES.has(actor.role)) {
    return actor;
  }
  const requested = findUserById(db, String(requestedOwnerUserId));
  return requested || actor;
}

function resolveVisibleOwner(db: Database, actor: DbUser, requestedOwnerUserId?: unknown) {
  if (!requestedOwnerUserId) {
    return actor;
  }
  const visibleUserIds = getVisibleUserIds(db, actor);
  const requested = findUserById(db, String(requestedOwnerUserId));
  if (requested && visibleUserIds.has(requested.id)) {
    return requested;
  }
  return actor;
}

function resolveTerritory(db: Database, actor: DbUser, requestedTerritoryId?: unknown) {
  const allowedIds = POWER_ROLES.has(actor.role)
    ? db.territories.map((territory) => territory.id)
    : actor.territoryIds;
  const territoryId = requestedTerritoryId && allowedIds.includes(String(requestedTerritoryId))
    ? String(requestedTerritoryId)
    : actor.territoryIds[0] || db.territories[0].id;
  const territory = db.territories.find((entry) => entry.id === territoryId) || db.territories[0];
  return territory;
}

function buildFallbackAssistantText(db: Database, user: DbUser, message: string): AssistantResponse {
  const dashboard = buildDashboard(db, user);
  const topOpportunity = dashboard.focusOpportunities[0];
  const lowStock = dashboard.lowStockProducts[0];
  const pendingApproval = getVisibleOrders(db, user).find((order) => order.approvalStatus === "pending");
  const lowered = message.toLowerCase();

  if (lowered.includes("pipeline") || lowered.includes("opportun")) {
    return {
      text: topOpportunity
        ? `Priorite pipeline: ${topOpportunity.clientName} pour ${topOpportunity.amount.toLocaleString("fr-FR")} ${db.company.currency}. Prochaine action recommandee: ${topOpportunity.nextAction}. Ensuite, traiter ${dashboard.kpis.activeOpportunities} opportunites actives et solder celles dont l'echeance est depassee.`
        : "Le pipeline est vide. Creez d'abord une opportunite qualifiee avec un montant, une echeance et une prochaine action.",
    };
  }

  if (lowered.includes("stock") || lowered.includes("produit")) {
    return {
      text: lowStock
        ? `Alerte stock: ${lowStock.name} n'a plus que ${lowStock.stock} unites. Action conseillee: informer le terrain, prioriser les commandes deja engagees et verifier l'approvisionnement avant toute nouvelle promesse client.`
        : "Aucun stock critique n'est remonte actuellement. Le catalogue ne presente pas de rupture immediate.",
    };
  }

  if (lowered.includes("commande") || lowered.includes("remise")) {
    return {
      text: pendingApproval
        ? `Commande sensible en attente: ${pendingApproval.id} pour ${pendingApproval.clientName}. Tant que la remise reste non approuvee, ne confirmez pas la commande. Verifiez le niveau de marge puis faites valider par le manager ou la finance.`
        : "Aucune commande sensible n'est actuellement bloquee. Vous pouvez continuer la saisie et la confirmation selon les regles de remise.",
    };
  }

  return {
    text: `Resume du portefeuille: ${dashboard.kpis.totalClients} clients visibles, ${dashboard.kpis.activeOpportunities} opportunites actives, ${dashboard.kpis.todayVisits} visites aujourd'hui et ${dashboard.kpis.pendingApprovals} validations en attente. Commencez par vos alertes critiques, puis traitez ${topOpportunity ? topOpportunity.clientName : "la prochaine opportunite a forte valeur"} et securisez les comptes a risque.`,
  };
}

const requireAuth: RequestHandler = (req, res, next) => {
  void (async () => {
    const db = await store.read();
    const cookies = parseCookies(req.headers.cookie);
    const session = parseSessionToken(cookies[SESSION_COOKIE]);
    if (!session) {
      clearSessionCookie(res);
      res.status(401).json({ error: "Session invalide" });
      return;
    }
    const user = findUserById(db, session.userId);
    if (!user || !user.active) {
      clearSessionCookie(res);
      res.status(401).json({ error: "Utilisateur indisponible" });
      return;
    }
    (req as AuthenticatedRequest).authUser = user;
    (req as AuthenticatedRequest).sessionPayload = buildSessionPayload(db, user);
    next();
  })().catch(next);
};

function requirePermission(permission: PermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Session requise" });
      return;
    }
    if (!hasPermission(req.authUser, permission)) {
      res.status(403).json({ error: "Acces refuse" });
      return;
    }
    next();
  };
}

export async function createApp(options: { serveFrontend?: boolean } = {}) {
  await store.init();
  const serveFrontend = options.serveFrontend ?? true;

  const app = express();
  const loginRateLimiter = createRateLimiter({
    name: "auth.login",
    windowMs: 1000 * 60 * 15,
    max: 10,
    key: (req) => {
      const email = String((req as Request & { body?: { email?: string } }).body?.email || "")
        .trim()
        .toLowerCase();
      return `${req.ip}:${email || "anonymous"}`;
    },
    message: "Trop de tentatives de connexion. Reessayez plus tard.",
  });
  const assistantRateLimiter = createRateLimiter({
    name: "assistant.chat",
    windowMs: 1000 * 60,
    max: 30,
    key: (req) => (req as AuthenticatedRequest).authUser?.id || req.ip,
    message: "Limite de requetes atteinte pour l'assistant.",
  });

  app.disable("x-powered-by");
  app.set("trust proxy", appConfig.trustProxy);

  app.use((req: AuthenticatedRequest, res, next) => {
    req.requestId = req.headers["x-request-id"]?.toString().slice(0, 128) || crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    const startedAt = Date.now();
    res.on("finish", () => {
      if (req.path === "/healthz" || req.path === "/readyz") {
        return;
      }
      logInfo("http.request", {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        ip: req.ip,
      });
    });
    next();
  });

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (appConfig.isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  app.use((req, res, next) => {
    if (req.originalUrl.startsWith(API_PREFIX)) {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  app.use(
    express.json({
      limit: appConfig.requestBodyLimit,
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );

  app.get(`${API_PREFIX}/keepalive`, asyncRoute(async (_req, res) => {
    try {
      await store.ping();
    } catch (error) {
      logError("keepalive.db_failed", { error: serializeError(error) });
      res.status(500).json({ ok: false });
      return;
    }
    res.json({ ok: true, ts: new Date().toISOString() });
  }));

  const cronAuth: RequestHandler = (req, res, next) => {
    const expected = process.env.CRON_SECRET;
    const provided = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (expected && provided !== expected) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };

  const runOpsCron = asyncRoute(async (_req: Request, res: Response) => {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    let lateVisits = 0;
    let staleOpps = 0;
    let contractsExpiring = 0;
    let casesIgnored = 0;

    await store.mutate((db) => {
      const todayIso = now.toISOString().slice(0, 10);

      db.visits.forEach((visit) => {
        if (
          visit.status === "planned" &&
          visit.scheduledDate < todayIso
        ) {
          lateVisits += 1;
          createNotification(db, {
            userId: visit.ownerUserId,
            title: "Visite en retard",
            body: `${visit.clientName} - prévue le ${visit.scheduledDate}`,
            level: "warning",
            read: false,
            link: `/visits/${visit.id}`,
          });
        }
      });

      db.opportunities.forEach((opp) => {
        if (opp.stage === "won" || opp.stage === "lost") return;
        const updatedField = (opp as { updatedAt?: string }).updatedAt;
        const refDate = new Date(updatedField || opp.expectedClose || now.toISOString());
        const ageDays = (now.getTime() - refDate.getTime()) / dayMs;
        if (ageDays > 30) {
          staleOpps += 1;
          createNotification(db, {
            userId: opp.ownerUserId,
            title: "Opportunité stagnante",
            body: `${opp.clientName} - sans mouvement depuis ${Math.round(ageDays)}j`,
            level: "warning",
            read: false,
            link: "/pipeline",
          });
        }
      });

      db.contracts.forEach((contract) => {
        if (!contract.endDate || contract.status === "expired" || contract.status === "cancelled") return;
        const endDate = new Date(contract.endDate);
        const daysToEnd = (endDate.getTime() - now.getTime()) / dayMs;
        if (daysToEnd > 0 && daysToEnd < 60) {
          contractsExpiring += 1;
          createNotification(db, {
            userId: contract.ownerUserId,
            title: "Contrat à renouveler",
            body: `${contract.clientName} - fin le ${contract.endDate}`,
            level: "info",
            read: false,
            link: "/contracts",
          });
        }
      });

      db.cases.forEach((caseItem) => {
        if (caseItem.status === "resolved" || caseItem.status === "closed") return;
        const updatedAt = new Date(caseItem.updatedAt || caseItem.createdAt);
        const ageDays = (now.getTime() - updatedAt.getTime()) / dayMs;
        if (ageDays > 7) {
          casesIgnored += 1;
          createNotification(db, {
            userId: caseItem.ownerUserId,
            title: "Ticket sans réponse",
            body: `${caseItem.title} - ${Math.round(ageDays)}j sans mise à jour`,
            level: "critical",
            read: false,
            link: "/cases",
          });
        }
      });
    });

    res.json({ ok: true, lateVisits, staleOpps, contractsExpiring, casesIgnored });
  });

  app.get("/api/cron/ops-digest", cronAuth, runOpsCron);
  app.post("/api/cron/ops-digest", cronAuth, runOpsCron);

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      environment: appConfig.nodeEnv,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get("/readyz", asyncRoute(async (_req, res) => {
    try {
      await store.ping();
      res.json({
        status: "ready",
        database: "ready",
        environment: appConfig.nodeEnv,
      });
    } catch (error) {
      logError("readyz.db_failed", { error: serializeError(error) });
      res.status(503).json({
        status: "degraded",
        database: "unreachable",
        environment: appConfig.nodeEnv,
      });
    }
  }));

  app.get(`${API_PREFIX}/auth/session`, requireAuth, (req: AuthenticatedRequest, res) => {
    res.json(req.sessionPayload);
  });

  app.post(
    `${API_PREFIX}/auth/login`,
    loginRateLimiter,
    asyncRoute(async (req, res) => {
      const db = await store.read();
      const email = String(req.body?.email || "").trim();
      const password = String(req.body?.password || "");
      const user = findUserByEmail(db, email);

      if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: "Identifiants invalides" });
        return;
      }

      setSessionCookie(res, createSessionToken(user.id));
      res.json(buildSessionPayload(db, user));
    }),
  );

  app.post(`${API_PREFIX}/auth/logout`, requireAuth, (_req: AuthenticatedRequest, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.post(
    `${API_PREFIX}/auth/forgot-password`,
    loginRateLimiter,
    asyncRoute(async (req, res) => {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!email.includes("@")) {
        res.json({ ok: true });
        return;
      }
      const db = await store.read();
      const user = findUserByEmail(db, email);
      if (user && user.active) {
        const token = createResetToken(user.id);
        const base = resolvePublicBaseUrl(req);
        const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;
        const subject = "Reinitialisation de votre mot de passe";
        const html = `<p>Bonjour ${user.name},</p><p>Vous avez demande la reinitialisation de votre mot de passe sur <strong>${db.company.name}</strong>.</p><p><a href="${link}">Cliquez ici pour definir un nouveau mot de passe</a> (lien valable 1 heure).</p><p>Si vous n'avez pas demande cette reinitialisation, ignorez cet email.</p>`;
        const text = `Reinitialisation : ${link}\n\nValable 1 heure.`;
        await sendEmail(user.email, subject, html, text).catch((error) => {
          logError("auth.reset_email_failed", { userId: user.id, error: serializeError(error) });
        });
      }
      res.json({ ok: true });
    }),
  );

  app.post(
    `${API_PREFIX}/auth/reset-password`,
    asyncRoute(async (req, res) => {
      const token = String(req.body?.token || "");
      const newPassword = String(req.body?.newPassword || "");
      const decoded = parseResetToken(token);
      if (!decoded) {
        res.status(400).json({ error: "Lien invalide ou expire" });
        return;
      }
      if (newPassword.length < 12) {
        res.status(400).json({ error: "Le mot de passe doit contenir au moins 12 caracteres." });
        return;
      }
      const newHash = hashPassword(newPassword);
      let userFound = false;
      await store.mutate((db) => {
        const target = db.users.find((entry) => entry.id === decoded.userId);
        if (!target) {
          return;
        }
        userFound = true;
        target.passwordHash = newHash;
        addAuditLog(db, target.id, "user.password_reset", "user", target.id);
      });
      if (!userFound) {
        res.status(400).json({ error: "Utilisateur introuvable" });
        return;
      }
      res.json({ ok: true });
    }),
  );

  app.post(
    `${API_PREFIX}/auth/password`,
    requireAuth,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      if (newPassword.length < 12) {
        res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 12 caracteres." });
        return;
      }
      if (!verifyPassword(currentPassword, actor.passwordHash)) {
        res.status(401).json({ error: "Mot de passe actuel invalide" });
        return;
      }
      const newHash = hashPassword(newPassword);
      await store.mutate((db) => {
        const target = db.users.find((entry) => entry.id === actor.id);
        if (!target) {
          return;
        }
        target.passwordHash = newHash;
        addAuditLog(db, actor.id, "user.password_changed", "user", actor.id);
      });
      res.json({ ok: true });
    }),
  );

  app.get(
    `${API_PREFIX}/dashboard`,
    requireAuth,
    requirePermission("dashboard.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      res.json(buildDashboard(db, req.authUser!));
    }),
  );

  app.get(
    `${API_PREFIX}/clients`,
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const query = String(req.query.q || "").trim().toLowerCase();
      let clients = getVisibleClients(db, req.authUser!);
      if (query) {
        clients = clients.filter((client) =>
          [client.name, client.contactName, client.email, client.phone, client.city, client.zone]
            .some((field) => field && field.toLowerCase().includes(query)),
        );
      }
      clients = clients.sort((left, right) => left.name.localeCompare(right.name));
      const limit = Math.min(Math.max(Number(req.query.limit) || 0, 0), 500);
      if (limit > 0) {
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        clients = clients.slice(offset, offset + limit);
      }
      if (wantsCsv(req)) {
        const csv = rowsToCsv(clients, [
          { key: "id", get: (row) => row.id },
          { key: "nom", get: (row) => row.name },
          { key: "type", get: (row) => row.type },
          { key: "statut", get: (row) => row.status },
          { key: "segment", get: (row) => row.segment },
          { key: "contact", get: (row) => row.contactName },
          { key: "email", get: (row) => row.email },
          { key: "telephone", get: (row) => row.phone },
          { key: "ville", get: (row) => row.city },
          { key: "territoire", get: (row) => row.territoryLabel },
          { key: "commercial", get: (row) => row.ownerName },
          { key: "score", get: (row) => row.potentialScore },
          { key: "risque", get: (row) => row.financialRisk },
        ]);
        sendCsv(res, "comptes.csv", csv);
        return;
      }
      res.json(clients);
    }),
  );

  app.post(
    `${API_PREFIX}/clients`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let createdClient: Client | null = null;
      await store.mutate((db) => {
        const owner = resolveOwner(db, actor, req.body?.ownerUserId);
        const territory = resolveTerritory(db, actor, req.body?.territoryId);
        createdClient = {
          id: `client-${crypto.randomUUID()}`,
          name: String(req.body?.name || "").trim() || "Nouveau compte",
          type: req.body?.type === "prospect" ? "prospect" : "client",
          status: "active",
          segment: ["A", "B", "C"].includes(req.body?.segment) ? req.body.segment : "B",
          address: String(req.body?.address || "").trim() || "Adresse a completer",
          city: String(req.body?.city || "").trim() || territory.region,
          zone: String(req.body?.zone || "").trim() || territory.label,
          territoryId: territory.id,
          territoryLabel: territory.label,
          ownerUserId: owner.id,
          ownerName: owner.name,
          contactName: String(req.body?.contactName || "").trim() || "Contact a definir",
          phone: String(req.body?.phone || "").trim() || "-",
          email: String(req.body?.email || "").trim() || "-",
          potentialScore: Math.max(0, Math.min(100, toNumber(req.body?.potentialScore, 55))),
          financialRisk: ["low", "medium", "high"].includes(req.body?.financialRisk)
            ? req.body.financialRisk
            : "low",
          lastVisit: null,
          nextVisit: null,
          notes: String(req.body?.notes || "").trim(),
          ice: String(req.body?.ice || "").trim(),
          taxId: String(req.body?.taxId || "").trim(),
          rc: String(req.body?.rc || "").trim(),
          fiscalAddress: String(req.body?.fiscalAddress || "").trim(),
          fiscalCity: String(req.body?.fiscalCity || "").trim(),
        };
        db.clients.push(createdClient);
        addAuditLog(db, actor.id, "client.created", "client", createdClient.id, {
          ownerUserId: owner.id,
        });
      });
      res.status(201).json(createdClient);
    }),
  );

  app.patch(
    `${API_PREFIX}/clients/:id`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: Client | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.clients.findIndex((client) => client.id === req.params.id);
        if (index === -1 || !canSeeEntity(db, actor, db.clients[index])) {
          notFound = true;
          return;
        }
        const current = db.clients[index];
        db.clients[index] = {
          ...current,
          name: req.body?.name !== undefined ? String(req.body.name).trim() || current.name : current.name,
          address: req.body?.address !== undefined ? String(req.body.address).trim() : current.address,
          city: req.body?.city !== undefined ? String(req.body.city).trim() : current.city,
          zone: req.body?.zone !== undefined ? String(req.body.zone).trim() : current.zone,
          contactName: req.body?.contactName !== undefined ? String(req.body.contactName).trim() : current.contactName,
          phone: req.body?.phone !== undefined ? String(req.body.phone).trim() : current.phone,
          email: req.body?.email !== undefined ? String(req.body.email).trim() : current.email,
          notes: req.body?.notes !== undefined ? String(req.body.notes).trim() : current.notes,
          segment: ["A", "B", "C"].includes(req.body?.segment) ? req.body.segment : current.segment,
          status: ["active", "inactive", "blocked"].includes(req.body?.status) ? req.body.status : current.status,
          potentialScore: req.body?.potentialScore !== undefined
            ? Math.max(0, Math.min(100, toNumber(req.body.potentialScore, current.potentialScore)))
            : current.potentialScore,
          financialRisk: ["low", "medium", "high"].includes(req.body?.financialRisk)
            ? req.body.financialRisk
            : current.financialRisk,
          ice: req.body?.ice !== undefined ? String(req.body.ice).trim() : current.ice,
          taxId: req.body?.taxId !== undefined ? String(req.body.taxId).trim() : current.taxId,
          rc: req.body?.rc !== undefined ? String(req.body.rc).trim() : current.rc,
          fiscalAddress: req.body?.fiscalAddress !== undefined ? String(req.body.fiscalAddress).trim() : current.fiscalAddress,
          fiscalCity: req.body?.fiscalCity !== undefined ? String(req.body.fiscalCity).trim() : current.fiscalCity,
        };
        updated = db.clients[index];
        addAuditLog(db, actor.id, "client.updated", "client", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Client introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/visits`,
    requireAuth,
    requirePermission("visits.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const query = String(req.query.q || "").trim().toLowerCase();
      let visits = getVisibleVisits(db, req.authUser!);
      if (query) {
        visits = visits.filter((visit) =>
          [visit.clientName, visit.objective, visit.city, visit.address]
            .some((field) => field && field.toLowerCase().includes(query)),
        );
      }
      const status = String(req.query.status || "").trim();
      if (status) {
        visits = visits.filter((visit) => visit.status === status);
      }
      visits = visits.sort((left, right) => {
        const dateCompare = left.scheduledDate.localeCompare(right.scheduledDate);
        return dateCompare !== 0 ? dateCompare : left.startTime.localeCompare(right.startTime);
      });
      const limit = Math.min(Math.max(Number(req.query.limit) || 0, 0), 500);
      if (limit > 0) {
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        visits = visits.slice(offset, offset + limit);
      }
      if (wantsCsv(req)) {
        const csv = rowsToCsv(visits, [
          { key: "id", get: (row) => row.id },
          { key: "date", get: (row) => row.scheduledDate },
          { key: "creneau", get: (row) => `${row.startTime}-${row.endTime}` },
          { key: "client", get: (row) => row.clientName },
          { key: "ville", get: (row) => row.city },
          { key: "objectif", get: (row) => row.objective },
          { key: "statut", get: (row) => row.status },
          { key: "commercial", get: (row) => row.ownerName },
          { key: "territoire", get: (row) => row.territoryLabel },
          { key: "compte_rendu", get: (row) => row.report || "" },
        ]);
        sendCsv(res, "visites.csv", csv);
        return;
      }
      res.json(visits);
    }),
  );

  app.get(
    `${API_PREFIX}/visits/:id`,
    requireAuth,
    requirePermission("visits.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const visit = db.visits.find((entry) => entry.id === req.params.id);
      if (!visit || !canSeeEntity(db, req.authUser!, visit)) {
        res.status(404).json({ error: "Visite introuvable" });
        return;
      }
      res.json(visit);
    }),
  );

  app.post(
    `${API_PREFIX}/visits`,
    requireAuth,
    requirePermission("visits.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let createdVisit: Visit | null = null;
      await store.mutate((db) => {
        const owner = resolveOwner(db, actor, req.body?.ownerUserId);
        const territory = resolveTerritory(db, actor, req.body?.territoryId);
        const linkedClient = req.body?.clientId
          ? db.clients.find((client) => client.id === req.body.clientId)
          : db.clients.find((client) => client.name === req.body?.clientName);
        createdVisit = {
          id: `visit-${crypto.randomUUID()}`,
          clientId: linkedClient?.id,
          clientName: linkedClient?.name || String(req.body?.clientName || "").trim() || "Compte a qualifier",
          address: linkedClient?.address || String(req.body?.address || "").trim() || "Adresse a confirmer",
          city: linkedClient?.city || String(req.body?.city || "").trim() || territory.region,
          objective: String(req.body?.objective || "").trim() || "Visite terrain",
          scheduledDate: String(req.body?.scheduledDate || currentBusinessDate(db.company.timezone)),
          startTime: String(req.body?.startTime || "09:00"),
          endTime: String(req.body?.endTime || "10:00"),
          status: "planned",
          ownerUserId: owner.id,
          ownerName: owner.name,
          territoryId: territory.id,
          territoryLabel: territory.label,
          report: "",
          nextAction: "",
          checkInAt: null,
          checkOutAt: null,
          checkInLocation: null,
          checkOutLocation: null,
        };
        db.visits.push(createdVisit);
        if (linkedClient) {
          linkedClient.nextVisit = createdVisit.scheduledDate;
        }
        addAuditLog(db, actor.id, "visit.created", "visit", createdVisit.id);
      });
      res.status(201).json(createdVisit);
    }),
  );

  app.patch(
    `${API_PREFIX}/visits/:id`,
    requireAuth,
    requirePermission("visits.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updatedVisit: Visit | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.visits.findIndex((visit) => visit.id === req.params.id);
        if (index === -1 || !canSeeEntity(db, actor, db.visits[index])) {
          notFound = true;
          return;
        }
        const nextStatus = req.body?.status ? normalizeVisitStatus(req.body.status) : db.visits[index].status;
        db.visits[index] = {
          ...db.visits[index],
          objective: req.body?.objective ? String(req.body.objective).trim() : db.visits[index].objective,
          report: req.body?.report !== undefined ? String(req.body.report).trim() : db.visits[index].report,
          nextAction:
            req.body?.nextAction !== undefined ? String(req.body.nextAction).trim() : db.visits[index].nextAction,
          status: nextStatus,
        };
        updatedVisit = db.visits[index];
        const client = db.clients.find((entry) => entry.id === db.visits[index].clientId);
        if (client && nextStatus === "completed") {
          client.lastVisit = db.visits[index].scheduledDate;
          client.nextVisit = db.visits[index].nextAction ? db.visits[index].scheduledDate : client.nextVisit;
        }
        addAuditLog(db, actor.id, "visit.updated", "visit", req.params.id, { status: nextStatus });
      });
      if (notFound) {
        res.status(404).json({ error: "Visite introuvable" });
        return;
      }
      res.json(updatedVisit);
    }),
  );

  app.post(
    `${API_PREFIX}/visits/:id/check-in`,
    requireAuth,
    requirePermission("visits.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: Visit | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const visit = db.visits.find((entry) => entry.id === req.params.id);
        if (!visit || !canSeeEntity(db, actor, visit)) {
          notFound = true;
          return;
        }
        visit.status = "in_progress";
        visit.checkInAt = new Date().toISOString();
        visit.checkInLocation = req.body?.location || null;
        updated = visit;
        addAuditLog(db, actor.id, "visit.checkin", "visit", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Visite introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.post(
    `${API_PREFIX}/visits/:id/check-out`,
    requireAuth,
    requirePermission("visits.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: Visit | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const visit = db.visits.find((entry) => entry.id === req.params.id);
        if (!visit || !canSeeEntity(db, actor, visit)) {
          notFound = true;
          return;
        }
        visit.status = "completed";
        visit.checkOutAt = new Date().toISOString();
        visit.checkOutLocation = req.body?.location || null;
        if (req.body?.report !== undefined) {
          visit.report = String(req.body.report).trim();
        }
        if (req.body?.nextAction !== undefined) {
          visit.nextAction = String(req.body.nextAction).trim();
        }
        updated = visit;
        const client = visit.clientId ? db.clients.find((entry) => entry.id === visit.clientId) : null;
        if (client) {
          client.lastVisit = visit.scheduledDate;
        }
        addAuditLog(db, actor.id, "visit.checkout", "visit", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Visite introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/opportunities`,
    requireAuth,
    requirePermission("opportunities.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const opportunities = getVisibleOpportunities(db, req.authUser!).sort(
        (left, right) => right.amount - left.amount,
      );
      if (wantsCsv(req)) {
        const csv = rowsToCsv(opportunities, [
          { key: "id", get: (row) => row.id },
          { key: "client", get: (row) => row.clientName },
          { key: "stage", get: (row) => row.stage },
          { key: "montant", get: (row) => row.amount },
          { key: "probabilite", get: (row) => row.probability },
          { key: "cloture_prevue", get: (row) => row.expectedClose },
          { key: "priorite", get: (row) => row.priority },
          { key: "prochaine_action", get: (row) => row.nextAction },
          { key: "commercial", get: (row) => row.ownerName },
          { key: "territoire", get: (row) => row.territoryLabel },
        ]);
        sendCsv(res, "pipeline.csv", csv);
        return;
      }
      res.json(opportunities);
    }),
  );

  app.post(
    `${API_PREFIX}/opportunities`,
    requireAuth,
    requirePermission("opportunities.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let created: Opportunity | null = null;
      await store.mutate((db) => {
        const owner = resolveOwner(db, actor, req.body?.ownerUserId);
        const territory = resolveTerritory(db, actor, req.body?.territoryId);
        const stage = normalizeStage(req.body?.stage);
        created = {
          id: `opp-${crypto.randomUUID()}`,
          clientId: req.body?.clientId ? String(req.body.clientId) : undefined,
          clientName: String(req.body?.clientName || "").trim() || "Compte a qualifier",
          amount: toNumber(req.body?.amount, 0),
          probability:
            req.body?.probability !== undefined
              ? toNumber(req.body?.probability, 20)
              : probabilityForStage(stage),
          stage,
          expectedClose: String(req.body?.expectedClose || "2026-06-30"),
          priority: ["low", "medium", "high", "critical"].includes(req.body?.priority)
            ? (req.body.priority as PriorityLevel)
            : "medium",
          nextAction: String(req.body?.nextAction || "").trim() || "Planifier la prochaine action",
          ownerUserId: owner.id,
          ownerName: owner.name,
          territoryId: territory.id,
          territoryLabel: territory.label,
          lossReason: stage === "lost" ? String(req.body?.lossReason || "Motif non renseigne") : undefined,
          updatedAt: new Date().toISOString(),
        };
        db.opportunities.push(created);
        addAuditLog(db, actor.id, "opportunity.created", "opportunity", created.id);
      });
      res.status(201).json(created);
    }),
  );

  app.patch(
    `${API_PREFIX}/opportunities/:id`,
    requireAuth,
    requirePermission("opportunities.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: Opportunity | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.opportunities.findIndex((entry) => entry.id === req.params.id);
        if (index === -1 || !canSeeEntity(db, actor, db.opportunities[index])) {
          notFound = true;
          return;
        }
        const current = db.opportunities[index];
        const stage = req.body?.stage ? normalizeStage(req.body.stage) : current.stage;
        db.opportunities[index] = {
          ...current,
          clientName: req.body?.clientName ? String(req.body.clientName).trim() : current.clientName,
          amount: req.body?.amount !== undefined ? toNumber(req.body.amount, current.amount) : current.amount,
          probability:
            req.body?.probability !== undefined ? toNumber(req.body.probability, current.probability) : current.probability,
          stage,
          expectedClose: req.body?.expectedClose ? String(req.body.expectedClose) : current.expectedClose,
          priority: req.body?.priority ? (req.body.priority as PriorityLevel) : current.priority,
          nextAction: req.body?.nextAction !== undefined ? String(req.body.nextAction).trim() : current.nextAction,
          lossReason:
            stage === "lost"
              ? String(req.body?.lossReason || current.lossReason || "Motif non renseigne")
              : current.lossReason,
          updatedAt: new Date().toISOString(),
        };
        updated = db.opportunities[index];
        addAuditLog(db, actor.id, "opportunity.updated", "opportunity", req.params.id, { stage });
      });
      if (notFound) {
        res.status(404).json({ error: "Opportunite introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.patch(
    `${API_PREFIX}/opportunities/:id/stage`,
    requireAuth,
    requirePermission("opportunities.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      const nextStage = normalizeStage(req.body?.stage);
      let updated: Opportunity | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.opportunities.findIndex((entry) => entry.id === req.params.id);
        if (index === -1 || !canSeeEntity(db, actor, db.opportunities[index])) {
          notFound = true;
          return;
        }
        db.opportunities[index] = {
          ...db.opportunities[index],
          stage: nextStage,
          probability: probabilityForStage(nextStage),
          lossReason:
            nextStage === "lost"
              ? String(req.body?.lossReason || db.opportunities[index].lossReason || "Motif a qualifier")
              : undefined,
          updatedAt: new Date().toISOString(),
        };
        updated = db.opportunities[index];
        addAuditLog(db, actor.id, "opportunity.stage_updated", "opportunity", req.params.id, {
          stage: nextStage,
        });
      });
      if (notFound) {
        res.status(404).json({ error: "Opportunite introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/orders`,
    requireAuth,
    requirePermission("orders.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const orders = getVisibleOrders(db, req.authUser!).sort((left, right) =>
        right.date.localeCompare(left.date),
      );
      if (wantsCsv(req)) {
        const csv = rowsToCsv(orders, [
          { key: "id", get: (row) => row.id },
          { key: "date", get: (row) => row.date },
          { key: "client", get: (row) => row.clientName },
          { key: "montant", get: (row) => row.amount },
          { key: "remise_pct", get: (row) => row.discount },
          { key: "statut", get: (row) => row.status },
          { key: "validation", get: (row) => row.approvalStatus },
          { key: "sync", get: (row) => row.syncStatus },
          { key: "commercial", get: (row) => row.ownerName },
          { key: "territoire", get: (row) => row.territoryLabel },
        ]);
        sendCsv(res, "commandes.csv", csv);
        return;
      }
      res.json(orders);
    }),
  );

  app.post(
    `${API_PREFIX}/orders`,
    requireAuth,
    requirePermission("orders.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let created: Order | null = null;
      await store.mutate((db) => {
        const owner = resolveOwner(db, actor, req.body?.ownerUserId);
        const territory = resolveTerritory(db, actor, req.body?.territoryId);
        const discount = Math.max(0, toNumber(req.body?.discount, 0));
        const id = `ORD-${new Date().getFullYear()}-${String(db.orders.length + 1).padStart(4, "0")}`;
        const orderLines = buildOrderLines(db, id, req.body?.lines);
        const linesAmount = orderLines.reduce((total, line) => total + line.lineTotal, 0);
        const amount = linesAmount > 0 ? linesAmount : toNumber(req.body?.amount, 0);
        const approvalRequired = discount > 5 || amount > 20000;
        const approvalStatus: ApprovalStatus = approvalRequired
          ? hasPermission(actor, "orders.approve")
            ? "approved"
            : "pending"
          : "not_required";
        const status: OrderStatus =
          approvalStatus === "pending" ? "awaiting_approval" : normalizeOrderStatus(req.body?.status || "draft");
        const syncStatus: SyncStatus = status === "confirmed" ? "queued" : "not_synced";

        created = {
          id,
          clientId: req.body?.clientId ? String(req.body.clientId) : undefined,
          clientName: String(req.body?.clientName || "").trim() || "Client non renseigne",
          ownerUserId: owner.id,
          ownerName: owner.name,
          territoryId: territory.id,
          territoryLabel: territory.label,
          date: String(req.body?.date || currentBusinessDate(db.company.timezone)),
          amount,
          discount,
          status,
          approvalStatus,
          syncStatus,
          notes: String(req.body?.notes || "").trim(),
          lines: orderLines,
        };
        db.orders.unshift(created);
        db.orderLines.unshift(...orderLines);
        addAuditLog(db, actor.id, "order.created", "order", created.id, {
          discount,
          approvalStatus,
          lines: orderLines.length,
        });

        if (approvalStatus === "pending") {
          db.users
            .filter((entry) => entry.role === "manager" || entry.role === "finance")
            .forEach((approver) => {
              createNotification(db, {
                userId: approver.id,
                title: "Validation de remise requise",
                body: `${created!.id} pour ${created!.clientName} attend une validation.`,
                level: "critical",
                read: false,
                link: "/orders",
              });
            });
        }
      });
      res.status(201).json(created);
    }),
  );

  app.patch(
    `${API_PREFIX}/orders/:id`,
    requireAuth,
    requirePermission("orders.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: Order | null = null;
      let notFound = false;
      let locked = false;
      await store.mutate((db) => {
        const index = db.orders.findIndex((order) => order.id === req.params.id);
        if (index === -1 || !canSeeEntity(db, actor, db.orders[index])) {
          notFound = true;
          return;
        }
        const current = db.orders[index];
        if (current.status !== "draft" && current.status !== "awaiting_approval") {
          locked = true;
          return;
        }
        const orderLines = req.body?.lines !== undefined
          ? buildOrderLines(db, current.id, req.body.lines)
          : db.orderLines.filter((line) => line.orderId === current.id);
        const linesAmount = orderLines.reduce((total, line) => total + line.lineTotal, 0);
        const amount = linesAmount > 0
          ? linesAmount
          : Math.max(0, toNumber(req.body?.amount, current.amount));
        const discount = req.body?.discount !== undefined
          ? Math.max(0, Math.min(100, toNumber(req.body.discount, current.discount)))
          : current.discount;
        const approvalRequired = discount > 5 || amount > 20000;
        const approvalStatus: ApprovalStatus = approvalRequired
          ? hasPermission(actor, "orders.approve") ? "approved" : "pending"
          : "not_required";
        db.orders[index] = {
          ...current,
          clientId: req.body?.clientId !== undefined ? String(req.body.clientId || "") || undefined : current.clientId,
          clientName: req.body?.clientName !== undefined ? String(req.body.clientName).trim() || current.clientName : current.clientName,
          date: req.body?.date !== undefined ? String(req.body.date) : current.date,
          amount,
          discount,
          status: approvalStatus === "pending" ? "awaiting_approval" : "draft",
          approvalStatus,
          syncStatus: "not_synced",
          notes: req.body?.notes !== undefined ? String(req.body.notes).trim() : current.notes,
          lines: orderLines,
        };
        if (req.body?.lines !== undefined) {
          db.orderLines = db.orderLines.filter((line) => line.orderId !== current.id);
          db.orderLines.unshift(...orderLines);
        }
        updated = db.orders[index];
        addAuditLog(db, actor.id, "order.updated", "order", current.id, {
          amount,
          discount,
          lines: orderLines.length,
        });
      });
      if (notFound) {
        res.status(404).json({ error: "Commande introuvable" });
        return;
      }
      if (locked) {
        res.status(409).json({ error: "Seules les commandes brouillon ou en attente peuvent etre modifiees" });
        return;
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/orders/:id/pdf`,
    requireAuth,
    requirePermission("orders.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const order = db.orders.find((entry) => entry.id === req.params.id);
      if (!order || !canSeeEntity(db, req.authUser!, order)) {
        res.status(404).json({ error: "Commande introuvable" });
        return;
      }
      const PdfKit = (await import("pdfkit")).default;
      const doc = new PdfKit({ size: "A4", margin: 50 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${order.id}.pdf"`);
      doc.pipe(res);

      doc.fontSize(20).text(db.company.name, { align: "left" });
      doc.fontSize(10).fillColor("#555").text(db.company.vertical);
      doc.moveDown(0.5);
      doc.fillColor("#000").fontSize(16).text(`Commande ${order.id}`, { align: "right" });
      doc.fontSize(10).fillColor("#555").text(`Date : ${order.date}`, { align: "right" });
      doc.moveDown(1.5);

      doc.fillColor("#000").fontSize(12).text("Client", { underline: true });
      doc.fontSize(11).text(order.clientName);
      doc.moveDown(0.5);
      doc.fontSize(11).text(`Territoire : ${order.territoryLabel || "-"}`);
      doc.text(`Commercial : ${order.ownerName || "-"}`);
      doc.moveDown(1.5);

      doc.fontSize(12).text("Detail", { underline: true });
      doc.moveDown(0.3);
      const lines = db.orderLines.filter((line) => line.orderId === order.id);
      if (lines.length > 0) {
        for (const line of lines) {
          doc.fontSize(10).text(
            `${line.productName} - ${line.quantity} x ${line.unitPrice.toFixed(2)} (${line.discountPercent}% remise) = ${line.lineTotal.toFixed(2)} ${db.company.currency}`,
          );
        }
        doc.moveDown(0.4);
      }
      doc.fontSize(11).text(`Montant HT : ${order.amount.toLocaleString("fr-FR")} ${db.company.currency}`);
      doc.text(`Remise appliquee : ${order.discount}%`);
      doc.text(`Statut : ${order.status}`);
      doc.text(`Validation : ${order.approvalStatus}`);
      if (order.notes) {
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor("#444").text("Notes :");
        doc.fillColor("#000").fontSize(11).text(order.notes, { width: 480 });
      }
      doc.moveDown(2);
      doc.fontSize(9).fillColor("#888").text(`Document genere le ${new Date().toLocaleString("fr-FR")}`);
      doc.end();
    }),
  );

  app.patch(
    `${API_PREFIX}/orders/:id/status`,
    requireAuth,
    requirePermission("orders.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: Order | null = null;
      let notFound = false;
      let forbidden = false;
      await store.mutate((db) => {
        const index = db.orders.findIndex((order) => order.id === req.params.id);
        if (index === -1 || !canSeeEntity(db, actor, db.orders[index])) {
          notFound = true;
          return;
        }
        const nextStatus = normalizeOrderStatus(req.body?.status);
        if ((nextStatus === "confirmed" || req.body?.approvalStatus === "approved") && !hasPermission(actor, "orders.approve")) {
          forbidden = true;
          return;
        }
        db.orders[index] = {
          ...db.orders[index],
          status: nextStatus,
          approvalStatus:
            req.body?.approvalStatus && hasPermission(actor, "orders.approve")
              ? (req.body.approvalStatus as ApprovalStatus)
              : db.orders[index].approvalStatus,
          syncStatus: nextStatus === "confirmed" ? "queued" : db.orders[index].syncStatus,
        };
        if (nextStatus === "confirmed") {
          db.orders[index].syncStatus = "synced";
        }
        updated = db.orders[index];
        addAuditLog(db, actor.id, "order.status_updated", "order", req.params.id, { status: nextStatus });
      });
      if (notFound) {
        res.status(404).json({ error: "Commande introuvable" });
        return;
      }
      if (forbidden) {
        res.status(403).json({ error: "Validation interdite pour ce role" });
        return;
      }
      if (updated && updated.status === "confirmed") {
        const db = await store.read();
        const owner = db.users.find((u) => u.id === updated!.ownerUserId);
        if (owner?.email) {
          const subject = `Commande confirmée : ${updated.id}`;
          const html = `<p>Bonjour ${owner.name},</p><p>Votre commande pour <strong>${updated.clientName}</strong> est confirmée.</p><p>Montant : ${updated.amount} ${db.company.currency}</p>`;
          const text = `Commande ${updated.id} confirmée pour ${updated.clientName} (${updated.amount} ${db.company.currency})`;
          await sendEmail(owner.email, subject, html, text).catch((error) =>
            logError("order.confirmation_email_failed", { orderId: updated!.id, error: serializeError(error) }),
          );
        }
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/approvals`,
    requireAuth,
    requirePermission("orders.approve"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const actor = req.authUser!;
      const pending = db.orders.filter(
        (order) => order.approvalStatus === "pending" && canSeeEntity(db, actor, order),
      );
      res.json(pending);
    }),
  );

  const updateApproval = async (
    actor: DbUser,
    orderId: string,
    decision: "approved" | "rejected",
    reason: string,
  ) => {
    let updated: Order | null = null;
    let notFound = false;
    await store.mutate((db) => {
      const index = db.orders.findIndex((order) => order.id === orderId);
      if (index === -1 || !canSeeEntity(db, actor, db.orders[index])) {
        notFound = true;
        return;
      }
      const order = db.orders[index];
      order.approvalStatus = decision;
      if (decision === "approved") {
        order.status = order.status === "draft" || order.status === "awaiting_approval" ? "confirmed" : order.status;
        order.syncStatus = "synced";
      } else {
        order.status = "cancelled";
      }
      addAuditLog(db, actor.id, `order.${decision}`, "order", orderId, { reason });
      updated = order;
    });
    return { updated, notFound };
  };

  const notifyApprovalDecision = async (order: Order, decision: "approved" | "rejected", reason: string) => {
    const db = await store.read();
    const owner = db.users.find((u) => u.id === order.ownerUserId);
    if (!owner) return;
    await store.mutate((dbInner) => {
      createNotification(dbInner, {
        userId: owner.id,
        title: decision === "approved" ? "Commande validée" : "Commande refusée",
        body: `${order.clientName} - ${order.amount} ${db.company.currency}${reason ? ` (${reason})` : ""}`,
        level: decision === "approved" ? "info" : "warning",
        read: false,
        link: "/orders",
      });
    });
    if (owner.email) {
      const subject = decision === "approved"
        ? `Commande validée : ${order.id}`
        : `Commande refusée : ${order.id}`;
      const html = `<p>Bonjour ${owner.name},</p><p>La commande pour <strong>${order.clientName}</strong> a été ${decision === "approved" ? "validée" : "refusée"}.</p>${reason ? `<p>Motif : ${reason}</p>` : ""}`;
      const text = `Commande ${order.id} ${decision === "approved" ? "validée" : "refusée"}${reason ? `. Motif: ${reason}` : ""}`;
      await sendEmail(owner.email, subject, html, text).catch((error) =>
        logError("approval.email_failed", { orderId: order.id, error: serializeError(error) }),
      );
    }
  };

  app.post(
    `${API_PREFIX}/approvals/:id/approve`,
    requireAuth,
    requirePermission("approvals.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      const reason = String(req.body?.reason || "");
      const { updated, notFound } = await updateApproval(actor, req.params.id, "approved", reason);
      if (notFound) {
        res.status(404).json({ error: "Commande introuvable" });
        return;
      }
      if (updated) await notifyApprovalDecision(updated, "approved", reason);
      res.json(updated);
    }),
  );

  app.post(
    `${API_PREFIX}/approvals/:id/reject`,
    requireAuth,
    requirePermission("approvals.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      const reason = String(req.body?.reason || "");
      const { updated, notFound } = await updateApproval(actor, req.params.id, "rejected", reason);
      if (notFound) {
        res.status(404).json({ error: "Commande introuvable" });
        return;
      }
      if (updated) await notifyApprovalDecision(updated, "rejected", reason);
      res.json(updated);
    }),
  );

  const makeDelete = <K extends "clients" | "prospects" | "products" | "orders" | "contracts" | "cases" | "campaigns" | "calls" | "activities">(
    routePath: string,
    permission: PermissionKey,
    collection: K,
    entityType: string,
  ) => {
    app.delete(
      routePath,
      requireAuth,
      requirePermission(permission),
      asyncRoute(async (req: AuthenticatedRequest, res) => {
        const actor = req.authUser!;
        let notFound = false;
        await store.mutate((db) => {
          const list = db[collection] as Array<{ id: string }>;
          const index = list.findIndex((entry) => entry.id === req.params.id);
          if (index === -1) {
            notFound = true;
            return;
          }
          const entity = list[index] as { id: string; ownerUserId?: string };
          if (entity.ownerUserId && !canSeeEntity(db, actor, entity as never)) {
            notFound = true;
            return;
          }
          list.splice(index, 1);
          if (collection === "orders") {
            db.orderLines = db.orderLines.filter((line) => line.orderId !== req.params.id);
          }
          addAuditLog(db, actor.id, `${entityType}.deleted`, entityType, req.params.id);
        });
        if (notFound) {
          res.status(404).json({ error: "Entité introuvable" });
          return;
        }
        res.status(204).end();
      }),
    );
  };

  makeDelete(`${API_PREFIX}/clients/:id`, "clients.delete", "clients", "client");
  makeDelete(`${API_PREFIX}/prospects/:id`, "prospects.delete", "prospects", "prospect");
  makeDelete(`${API_PREFIX}/products/:id`, "products.delete", "products", "product");
  makeDelete(`${API_PREFIX}/orders/:id`, "orders.delete", "orders", "order");
  makeDelete(`${API_PREFIX}/contracts/:id`, "contracts.delete", "contracts", "contract");
  makeDelete(`${API_PREFIX}/cases/:id`, "cases.delete", "cases", "case");
  makeDelete(`${API_PREFIX}/campaigns/:id`, "campaigns.delete", "campaigns", "campaign");
  makeDelete(`${API_PREFIX}/calls/:id`, "calls.delete", "calls", "call");
  makeDelete(`${API_PREFIX}/activities/:id`, "activities.delete", "activities", "activity");

  app.get(
    `${API_PREFIX}/products`,
    requireAuth,
    requirePermission("products.read"),
    asyncRoute(async (_req: AuthenticatedRequest, res) => {
      const db = await store.read();
      res.json(db.products);
    }),
  );

  app.post(
    `${API_PREFIX}/products`,
    requireAuth,
    requirePermission("products.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let created: Product | null = null;
      let duplicate = false;
      await store.mutate((db) => {
        const ref = String(req.body?.ref || "").trim();
        if (db.products.some((product) => product.ref.toLowerCase() === ref.toLowerCase())) {
          duplicate = true;
          return;
        }
        created = {
          id: `product-${crypto.randomUUID()}`,
          name: String(req.body?.name || "").trim() || "Nouveau produit",
          ref: ref || `REF-${db.products.length + 1}`,
          category: String(req.body?.category || "").trim(),
          price: Math.max(0, toNumber(req.body?.price, 0)),
          stock: Math.max(0, toNumber(req.body?.stock, 0)),
          status: req.body?.status === "inactive" ? "inactive" : "active",
          image: req.body?.image ? String(req.body.image) : undefined,
          description: String(req.body?.description || "").trim(),
        };
        db.products.unshift(created);
        addAuditLog(db, actor.id, "product.created", "product", created.id, { ref: created.ref });
      });
      if (duplicate) {
        res.status(409).json({ error: "Reference produit deja utilisee" });
        return;
      }
      res.status(201).json(created);
    }),
  );

  app.patch(
    `${API_PREFIX}/products/:id`,
    requireAuth,
    requirePermission("products.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: Product | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.products.findIndex((product) => product.id === req.params.id);
        if (index === -1) {
          notFound = true;
          return;
        }
        const current = db.products[index];
        db.products[index] = {
          ...current,
          name: req.body?.name !== undefined ? String(req.body.name).trim() : current.name,
          ref: req.body?.ref !== undefined ? String(req.body.ref).trim() : current.ref,
          category: req.body?.category !== undefined ? String(req.body.category).trim() : current.category,
          price: req.body?.price !== undefined ? Math.max(0, toNumber(req.body.price, current.price)) : current.price,
          stock: req.body?.stock !== undefined ? Math.max(0, toNumber(req.body.stock, current.stock)) : current.stock,
          status: req.body?.status === "inactive" ? "inactive" : req.body?.status === "active" ? "active" : current.status,
          image: req.body?.image !== undefined ? String(req.body.image || "") || undefined : current.image,
          description: req.body?.description !== undefined ? String(req.body.description).trim() : current.description,
        };
        updated = db.products[index];
        addAuditLog(db, actor.id, "product.updated", "product", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Produit introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.patch(
    `${API_PREFIX}/products/:id/stock`,
    requireAuth,
    requirePermission("products.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: Product | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.products.findIndex((product) => product.id === req.params.id);
        if (index === -1) {
          notFound = true;
          return;
        }
        db.products[index].stock = Math.max(0, toNumber(req.body?.stock, db.products[index].stock));
        updated = db.products[index];
        addAuditLog(db, actor.id, "product.stock_updated", "product", req.params.id, {
          stock: updated.stock,
        });
      });
      if (notFound) {
        res.status(404).json({ error: "Produit introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/targets`,
    requireAuth,
    requirePermission("targets.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      res.json(getVisibleTargets(db, req.authUser!));
    }),
  );

  app.post(
    `${API_PREFIX}/targets`,
    requireAuth,
    requirePermission("targets.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let created: Database["targets"][number] | null = null;
      let duplicate = false;
      await store.mutate((db) => {
        const owner = resolveVisibleOwner(db, actor, req.body?.ownerUserId);
        const periodLabel = String(req.body?.periodLabel || "").trim() ||
          new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date());
        if (db.targets.some((target) => target.ownerUserId === owner.id && target.periodLabel === periodLabel)) {
          duplicate = true;
          return;
        }
        created = {
          id: `target-${crypto.randomUUID()}`,
          ownerUserId: owner.id,
          periodLabel,
          revenueGoal: Math.max(0, toNumber(req.body?.revenueGoal, 0)),
          visitsGoal: Math.max(0, Math.round(toNumber(req.body?.visitsGoal, 0))),
          opportunitiesGoal: Math.max(0, Math.round(toNumber(req.body?.opportunitiesGoal, 0))),
          ordersGoal: Math.max(0, Math.round(toNumber(req.body?.ordersGoal, 0))),
        };
        db.targets.unshift(created);
        addAuditLog(db, actor.id, "target.created", "target", created.id, { ownerUserId: owner.id, periodLabel });
      });
      if (duplicate) {
        res.status(409).json({ error: "Objectif deja defini pour ce profil et cette periode" });
        return;
      }
      res.status(201).json(created);
    }),
  );

  app.patch(
    `${API_PREFIX}/targets/:id`,
    requireAuth,
    requirePermission("targets.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: Database["targets"][number] | null = null;
      let notFound = false;
      let duplicate = false;
      await store.mutate((db) => {
        const index = db.targets.findIndex((target) => target.id === req.params.id);
        const visibleUserIds = getVisibleUserIds(db, actor);
        if (index === -1 || !visibleUserIds.has(db.targets[index].ownerUserId)) {
          notFound = true;
          return;
        }
        const current = db.targets[index];
        const owner = req.body?.ownerUserId !== undefined
          ? resolveVisibleOwner(db, actor, req.body.ownerUserId)
          : findUserById(db, current.ownerUserId) || actor;
        const periodLabel = req.body?.periodLabel !== undefined
          ? String(req.body.periodLabel || "").trim() || current.periodLabel
          : current.periodLabel;
        if (db.targets.some((target) => target.id !== current.id && target.ownerUserId === owner.id && target.periodLabel === periodLabel)) {
          duplicate = true;
          return;
        }
        db.targets[index] = {
          ...current,
          ownerUserId: owner.id,
          periodLabel,
          revenueGoal: req.body?.revenueGoal !== undefined ? Math.max(0, toNumber(req.body.revenueGoal, current.revenueGoal)) : current.revenueGoal,
          visitsGoal: req.body?.visitsGoal !== undefined ? Math.max(0, Math.round(toNumber(req.body.visitsGoal, current.visitsGoal))) : current.visitsGoal,
          opportunitiesGoal: req.body?.opportunitiesGoal !== undefined ? Math.max(0, Math.round(toNumber(req.body.opportunitiesGoal, current.opportunitiesGoal))) : current.opportunitiesGoal,
          ordersGoal: req.body?.ordersGoal !== undefined ? Math.max(0, Math.round(toNumber(req.body.ordersGoal, current.ordersGoal))) : current.ordersGoal,
        };
        updated = db.targets[index];
        addAuditLog(db, actor.id, "target.updated", "target", req.params.id, { ownerUserId: owner.id, periodLabel });
      });
      if (notFound) {
        res.status(404).json({ error: "Objectif introuvable" });
        return;
      }
      if (duplicate) {
        res.status(409).json({ error: "Objectif deja defini pour ce profil et cette periode" });
        return;
      }
      res.json(updated);
    }),
  );

  app.delete(
    `${API_PREFIX}/targets/:id`,
    requireAuth,
    requirePermission("targets.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.targets.findIndex((target) => target.id === req.params.id);
        const visibleUserIds = getVisibleUserIds(db, actor);
        if (index === -1 || !visibleUserIds.has(db.targets[index].ownerUserId)) {
          notFound = true;
          return;
        }
        db.targets.splice(index, 1);
        addAuditLog(db, actor.id, "target.deleted", "target", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Objectif introuvable" });
        return;
      }
      res.status(204).end();
    }),
  );

  app.get(
    `${API_PREFIX}/manager/overview`,
    requireAuth,
    requirePermission("insights.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      res.json(buildManagerOverview(db, req.authUser!));
    }),
  );

  app.get(
    `${API_PREFIX}/notifications`,
    requireAuth,
    requirePermission("notifications.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const notifications = db.notifications
        .filter((item) => item.userId === req.authUser!.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      res.json(notifications);
    }),
  );

  app.patch(
    `${API_PREFIX}/notifications/:id/read`,
    requireAuth,
    requirePermission("notifications.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      let updated: (NotificationItem & { userId: string }) | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const notification = db.notifications.find(
          (entry) => entry.id === req.params.id && entry.userId === req.authUser!.id,
        );
        if (!notification) {
          notFound = true;
          return;
        }
        notification.read = true;
        updated = notification;
      });
      if (notFound) {
        res.status(404).json({ error: "Notification introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.post(
    `${API_PREFIX}/notifications/read-all`,
    requireAuth,
    requirePermission("notifications.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let count = 0;
      await store.mutate((db) => {
        db.notifications
          .filter((entry) => entry.userId === actor.id && !entry.read)
          .forEach((entry) => {
            entry.read = true;
            count += 1;
          });
      });
      res.json({ ok: true, count });
    }),
  );

  app.get(
    `${API_PREFIX}/roles`,
    requireAuth,
    requirePermission("roles.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const visibleUsers = GLOBAL_READ_ROLES.has(req.authUser!.role)
        ? db.users
        : db.users.filter((entry) => entry.teamId && entry.teamId === req.authUser!.teamId);
      const payload: RolesResponse = {
        roles: db.roles,
        users: visibleUsers.map((user) => buildUserSummary(db, user)),
        teams: db.teams,
        currentPermissions: getRoleDefinition(req.authUser!.role).permissions,
      };
      res.json(payload);
    }),
  );

  app.post(
    `${API_PREFIX}/users`,
    requireAuth,
    requirePermission("users.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      const email = String(req.body?.email || "").trim().toLowerCase();
      const name = String(req.body?.name || "").trim();
      const role = String(req.body?.role || "sales_rep");
      const password = String(req.body?.password || "");
      const allowedRoles: RoleKey[] = [
        "admin",
        "director",
        "manager",
        "sales_rep",
        "finance",
        "logistics",
        "support",
        "viewer",
      ];
      if (!email.includes("@") || name.length < 2) {
        res.status(400).json({ error: "Email ou nom invalide" });
        return;
      }
      if (password.length < 12) {
        res.status(400).json({ error: "Le mot de passe doit contenir au moins 12 caracteres." });
        return;
      }
      if (!allowedRoles.includes(role as RoleKey)) {
        res.status(400).json({ error: "Role inconnu" });
        return;
      }
      const territoryIds = Array.isArray(req.body?.territoryIds)
        ? req.body.territoryIds.map(String).filter(Boolean)
        : [];
      const passwordHash = hashPassword(password);
      let conflict = false;
      let createdSummary: UserSummary | null = null;
      await store.mutate((db) => {
        if (findUserByEmail(db, email)) {
          conflict = true;
          return;
        }
        const validTerritories = territoryIds.filter((id) =>
          db.territories.some((territory) => territory.id === id),
        );
        const fallbackTerritories = validTerritories.length
          ? validTerritories
          : db.territories.slice(0, 1).map((territory) => territory.id);
        const newUser: DbUser = {
          id: `user-${crypto.randomUUID()}`,
          name,
          initials: initialsFromName(name) || name.slice(0, 2).toUpperCase(),
          email,
          phone: String(req.body?.phone || "").trim(),
          title: String(req.body?.title || "").trim(),
          role: role as RoleKey,
          teamId: req.body?.teamId ? String(req.body.teamId) : undefined,
          territoryIds: fallbackTerritories,
          active: true,
          passwordHash,
        };
        db.users.push(newUser);
        db.preferences.push(defaultPreferences(newUser.id));
        addAuditLog(db, actor.id, "user.created", "user", newUser.id, { email, role });
        createdSummary = buildUserSummary(db, newUser);
      });
      if (conflict) {
        res.status(409).json({ error: "Un utilisateur avec cet email existe deja" });
        return;
      }
      if (createdSummary) {
        const base = resolvePublicBaseUrl(req);
        const subject = `Bienvenue sur ${appConfig.bootstrap.companyName}`;
        const html = `<p>Bonjour ${name},</p><p>Un compte ${role} vient d'etre cree pour vous sur le CRM.</p><p>Connexion : <a href="${base}/login">${base}/login</a></p><p>Email : <strong>${email}</strong><br/>Mot de passe initial : ${password}</p><p>Pensez a le changer dans Parametres apres votre premiere connexion.</p>`;
        const text = `Compte cree sur ${appConfig.bootstrap.companyName}.\nConnexion : ${base}/login\nEmail: ${email}\nMot de passe initial: ${password}`;
        await sendEmail(email, subject, html, text).catch((error) => {
          logError("user.invite_email_failed", { userId: createdSummary?.id, error: serializeError(error) });
        });
      }
      res.status(201).json(createdSummary);
    }),
  );

  app.patch(
    `${API_PREFIX}/users/:id`,
    requireAuth,
    requirePermission("users.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      const targetId = req.params.id;
      let updated: UserSummary | null = null;
      let notFound = false;
      let conflict = false;
      const allowedRoles: RoleKey[] = [
        "admin", "director", "manager", "sales_rep",
        "finance", "logistics", "support", "viewer",
      ];
      await store.mutate((db) => {
        const user = db.users.find((entry) => entry.id === targetId);
        if (!user) {
          notFound = true;
          return;
        }
        if (req.body?.email !== undefined) {
          const email = String(req.body.email).trim().toLowerCase();
          if (email && email !== user.email) {
            if (db.users.some((u) => u.email === email && u.id !== user.id)) {
              conflict = true;
              return;
            }
            user.email = email;
          }
        }
        if (req.body?.name !== undefined) {
          user.name = String(req.body.name).trim() || user.name;
          user.initials = initialsFromName(user.name) || user.initials;
        }
        if (req.body?.phone !== undefined) user.phone = String(req.body.phone).trim();
        if (req.body?.title !== undefined) user.title = String(req.body.title).trim();
        if (req.body?.role !== undefined && allowedRoles.includes(req.body.role)) {
          user.role = req.body.role as RoleKey;
        }
        if (req.body?.teamId !== undefined) {
          user.teamId = req.body.teamId ? String(req.body.teamId) : undefined;
        }
        if (Array.isArray(req.body?.territoryIds)) {
          user.territoryIds = req.body.territoryIds
            .map(String)
            .filter((id: string) => db.territories.some((t) => t.id === id));
        }
        if (typeof req.body?.active === "boolean") {
          if (!req.body.active && user.id === actor.id) {
            conflict = true;
            return;
          }
          user.active = req.body.active;
        }
        updated = buildUserSummary(db, user);
        addAuditLog(db, actor.id, "user.updated", "user", user.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Utilisateur introuvable" });
        return;
      }
      if (conflict) {
        res.status(409).json({ error: "Conflit : email déjà utilisé ou auto-désactivation interdite" });
        return;
      }
      res.json(updated);
    }),
  );

  app.delete(
    `${API_PREFIX}/users/:id`,
    requireAuth,
    requirePermission("users.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      const targetId = req.params.id;
      if (targetId === actor.id) {
        res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte" });
        return;
      }
      let notFound = false;
      let blocked = false;
      await store.mutate((db) => {
        const index = db.users.findIndex((entry) => entry.id === targetId);
        if (index === -1) {
          notFound = true;
          return;
        }
        if (db.users[index].role === "super_admin") {
          blocked = true;
          return;
        }
        db.users.splice(index, 1);
        addAuditLog(db, actor.id, "user.deleted", "user", targetId);
      });
      if (notFound) {
        res.status(404).json({ error: "Utilisateur introuvable" });
        return;
      }
      if (blocked) {
        res.status(403).json({ error: "Impossible de supprimer un super administrateur" });
        return;
      }
      res.status(204).end();
    }),
  );

  app.get(
    `${API_PREFIX}/audit-logs`,
    requireAuth,
    requirePermission("audit.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      if (!POWER_ROLES.has(actor.role)) {
        res.status(403).json({ error: "Acces refuse" });
        return;
      }
      const db = await store.read();
      const userMap = new Map(db.users.map((user) => [user.id, user.name]));
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
      const entityType = String(req.query.entityType || "").trim();
      let logs = db.auditLogs;
      if (entityType) {
        logs = logs.filter((entry) => entry.entityType === entityType);
      }
      res.json(
        logs.slice(0, limit).map((entry) => ({
          ...entry,
          actorName: userMap.get(entry.actorUserId) || entry.actorUserId,
        })),
      );
    }),
  );

  // ----- Prospects ---------------------------------------------------------

  app.get(
    `${API_PREFIX}/prospects`,
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const actor = req.authUser!;
      const query = String(req.query.q || "").trim().toLowerCase();
      const statusFilter = String(req.query.status || "").trim();
      let prospects = db.prospects.filter((prospect) =>
        canSeeEntity(db, actor, { ownerUserId: prospect.ownerUserId, territoryId: prospect.territoryId }),
      );
      if (query) {
        prospects = prospects.filter((prospect) =>
          [prospect.name, prospect.contactName, prospect.email, prospect.phone].some(
            (field) => field && field.toLowerCase().includes(query),
          ),
        );
      }
      if (statusFilter) {
        prospects = prospects.filter((prospect) => prospect.status === statusFilter);
      }
      if (wantsCsv(req)) {
        const csv = rowsToCsv(prospects, [
          { key: "id", get: (row) => row.id },
          { key: "nom", get: (row) => row.name },
          { key: "contact", get: (row) => row.contactName },
          { key: "email", get: (row) => row.email },
          { key: "telephone", get: (row) => row.phone },
          { key: "equipe", get: (row) => row.team },
          { key: "canal", get: (row) => row.leadSource },
          { key: "source", get: (row) => row.source },
          { key: "besoin", get: (row) => row.need },
          // Terrain
          { key: "adresse", get: (row) => row.address },
          { key: "secteur", get: (row) => row.zone },
          { key: "type_etablissement", get: (row) => row.establishmentType },
          { key: "potentiel", get: (row) => row.potential ?? "" },
          { key: "concurrence", get: (row) => row.competitor },
          { key: "prochaine_visite", get: (row) => row.nextVisitAt ?? "" },
          { key: "statut", get: (row) => row.status },
          { key: "score", get: (row) => row.score },
          { key: "commercial", get: (row) => row.ownerName },
          { key: "converti_le", get: (row) => row.convertedAt || "" },
          { key: "client_id", get: (row) => row.convertedClientId || "" },
        ]);
        sendCsv(res, "prospects.csv", csv);
        return;
      }
      res.json(prospects);
    }),
  );

  app.post(
    `${API_PREFIX}/prospects`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let created: Prospect | null = null;
      await store.mutate((db) => {
        const owner = resolveOwner(db, actor, req.body?.ownerUserId);
        const territory = resolveTerritory(db, actor, req.body?.territoryId);
        const status = ["new", "contacted", "qualified", "quoted", "negotiation", "lost"].includes(req.body?.status)
          ? (req.body.status as ProspectStatus)
          : "new";
        const leadSource: ProspectLeadSource = normalizeLeadSource(req.body?.leadSource);
        const intake = buildFieldIntake(req.body);
        const prospect: Prospect = {
          id: `prospect-${crypto.randomUUID()}`,
          name: String(req.body?.name || "").trim() || "Nouveau prospect",
          contactName: String(req.body?.contactName || "").trim(),
          phone: String(req.body?.phone || "").trim(),
          email: String(req.body?.email || "").trim(),
          source: String(req.body?.source || "").trim(),
          team: "field",
          leadSource,
          ...intake,
          need: String(req.body?.need || "").trim(),
          solutionFit: String(req.body?.solutionFit || "").trim(),
          status,
          score: Math.max(0, Math.min(100, toNumber(req.body?.score, 50))),
          ownerUserId: owner.id,
          ownerName: owner.name,
          territoryId: territory.id,
          territoryLabel: territory.label,
          notes: String(req.body?.notes || "").trim(),
          convertedClientId: null,
          convertedAt: null,
          createdAt: new Date().toISOString(),
        };
        db.prospects.unshift(prospect);
        addAuditLog(db, actor.id, "prospect.created", "prospect", prospect.id);
        created = prospect;
      });
      res.status(201).json(created);
    }),
  );

  app.patch(
    `${API_PREFIX}/prospects/:id`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: Prospect | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.prospects.findIndex((entry) => entry.id === req.params.id);
        if (index === -1 || !canSeeEntity(db, actor, {
          ownerUserId: db.prospects[index].ownerUserId,
          territoryId: db.prospects[index].territoryId,
        })) {
          notFound = true;
          return;
        }
        const current = db.prospects[index];
        const intake = applyFieldIntakePatch(current, req.body);
        db.prospects[index] = {
          ...current,
          name: req.body?.name !== undefined ? String(req.body.name).trim() : current.name,
          contactName: req.body?.contactName !== undefined ? String(req.body.contactName).trim() : current.contactName,
          phone: req.body?.phone !== undefined ? String(req.body.phone).trim() : current.phone,
          email: req.body?.email !== undefined ? String(req.body.email).trim() : current.email,
          source: req.body?.source !== undefined ? String(req.body.source).trim() : current.source,
          leadSource: req.body?.leadSource !== undefined
            ? normalizeLeadSource(req.body.leadSource)
            : current.leadSource,
          ...intake,
          need: req.body?.need !== undefined ? String(req.body.need).trim() : current.need,
          solutionFit: req.body?.solutionFit !== undefined ? String(req.body.solutionFit).trim() : current.solutionFit,
          status: ["new", "contacted", "qualified", "quoted", "negotiation", "converted", "lost"].includes(req.body?.status)
            ? (req.body.status as ProspectStatus)
            : current.status,
          score: req.body?.score !== undefined ? Math.max(0, Math.min(100, toNumber(req.body.score, current.score))) : current.score,
          notes: req.body?.notes !== undefined ? String(req.body.notes).trim() : current.notes,
        };
        updated = db.prospects[index];
        addAuditLog(db, actor.id, "prospect.updated", "prospect", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Prospect introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.post(
    `${API_PREFIX}/prospects/:id/convert`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let resultClient: Client | null = null;
      let notFound = false;
      let alreadyConverted = false;
      await store.mutate((db) => {
        const prospect = db.prospects.find((entry) => entry.id === req.params.id);
        if (!prospect || !canSeeEntity(db, actor, { ownerUserId: prospect.ownerUserId, territoryId: prospect.territoryId })) {
          notFound = true;
          return;
        }
        if (prospect.convertedClientId) {
          alreadyConverted = true;
          return;
        }
        const newClient: Client = {
          id: `client-${crypto.randomUUID()}`,
          name: prospect.name,
          type: "client",
          status: "active",
          segment: "B",
          address: prospect.address ?? "",
          city: "",
          zone: prospect.zone ?? "",
          territoryId: prospect.territoryId,
          territoryLabel: prospect.territoryLabel,
          ownerUserId: prospect.ownerUserId,
          ownerName: prospect.ownerName,
          contactName: prospect.contactName,
          phone: prospect.phone,
          email: prospect.email,
          potentialScore: prospect.score,
          financialRisk: "low",
          lastVisit: null,
          nextVisit: null,
          notes: prospect.notes,
        };
        db.clients.push(newClient);
        prospect.status = "converted";
        prospect.convertedClientId = newClient.id;
        prospect.convertedAt = new Date().toISOString();
        addAuditLog(db, actor.id, "prospect.converted", "prospect", prospect.id, { clientId: newClient.id });
        resultClient = newClient;
      });
      if (notFound) {
        res.status(404).json({ error: "Prospect introuvable" });
        return;
      }
      if (alreadyConverted) {
        res.status(409).json({ error: "Prospect deja converti" });
        return;
      }
      res.json({ client: resultClient });
    }),
  );

  // ----- Activities --------------------------------------------------------

  app.get(
    `${API_PREFIX}/activities`,
    requireAuth,
    requirePermission("visits.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const actor = req.authUser!;
      const clientId = String(req.query.clientId || "").trim();
      const opportunityId = String(req.query.opportunityId || "").trim();
      const prospectId = String(req.query.prospectId || "").trim();
      const visibleUsers = getVisibleUserIds(db, actor);
      let activities = db.activities.filter((entry) =>
        GLOBAL_READ_ROLES.has(actor.role) || visibleUsers.has(entry.ownerUserId),
      );
      if (clientId) activities = activities.filter((entry) => entry.clientId === clientId);
      if (opportunityId) activities = activities.filter((entry) => entry.opportunityId === opportunityId);
      if (prospectId) activities = activities.filter((entry) => entry.prospectId === prospectId);
      activities = activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json(activities.slice(0, 200));
    }),
  );

  app.post(
    `${API_PREFIX}/activities`,
    requireAuth,
    requirePermission("visits.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let created: Activity | null = null;
      await store.mutate((db) => {
        const allowedTypes: ActivityType[] = ["call", "email", "note", "task", "meeting"];
        const type = allowedTypes.includes(req.body?.type) ? (req.body.type as ActivityType) : "note";
        const activity: Activity = {
          id: `act-${crypto.randomUUID()}`,
          type,
          subject: String(req.body?.subject || "").trim() || "Sans titre",
          content: String(req.body?.content || "").trim(),
          ownerUserId: actor.id,
          ownerName: actor.name,
          clientId: req.body?.clientId ? String(req.body.clientId) : null,
          opportunityId: req.body?.opportunityId ? String(req.body.opportunityId) : null,
          prospectId: req.body?.prospectId ? String(req.body.prospectId) : null,
          dueDate: req.body?.dueDate ? String(req.body.dueDate) : null,
          completedAt: req.body?.completedAt ? String(req.body.completedAt) : null,
          createdAt: new Date().toISOString(),
        };
        db.activities.unshift(activity);
        addAuditLog(db, actor.id, "activity.created", "activity", activity.id, { type });
        created = activity;
      });
      res.status(201).json(created);
    }),
  );

  app.patch(
    `${API_PREFIX}/activities/:id`,
    requireAuth,
    requirePermission("visits.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: Activity | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.activities.findIndex((entry) => entry.id === req.params.id);
        if (index === -1) {
          notFound = true;
          return;
        }
        const current = db.activities[index];
        db.activities[index] = {
          ...current,
          subject: req.body?.subject !== undefined ? String(req.body.subject).trim() : current.subject,
          content: req.body?.content !== undefined ? String(req.body.content).trim() : current.content,
          dueDate: req.body?.dueDate !== undefined ? String(req.body.dueDate) : current.dueDate,
          completedAt: req.body?.completedAt === null ? null : req.body?.completedAt
            ? String(req.body.completedAt)
            : current.completedAt,
        };
        updated = db.activities[index];
        addAuditLog(db, actor.id, "activity.updated", "activity", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Activite introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  // ----- Reports / Analytics ----------------------------------------------

  app.get(
    `${API_PREFIX}/reports/summary`,
    requireAuth,
    requirePermission("insights.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const actor = req.authUser!;
      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();
      const ownerUserId = String(req.query.ownerUserId || "").trim();
      const territoryId = String(req.query.territoryId || "").trim();

      const inRange = (dateValue: string | null | undefined) => {
        if (!dateValue) return true;
        const slice = dateValue.slice(0, 10);
        if (from && slice < from) return false;
        if (to && slice > to) return false;
        return true;
      };
      const matchOwner = (ownerId: string) => !ownerUserId || ownerId === ownerUserId;
      const matchTerritory = (tid: string) => !territoryId || tid === territoryId;

      const clients = getVisibleClients(db, actor).filter(
        (c) => matchOwner(c.ownerUserId) && matchTerritory(c.territoryId),
      );
      const visits = getVisibleVisits(db, actor).filter(
        (v) => inRange(v.scheduledDate) && matchOwner(v.ownerUserId) && matchTerritory(v.territoryId),
      );
      const orders = getVisibleOrders(db, actor).filter(
        (o) => inRange(o.date) && matchOwner(o.ownerUserId) && matchTerritory(o.territoryId),
      );
      const opportunities = getVisibleOpportunities(db, actor).filter(
        (o) => matchOwner(o.ownerUserId) && matchTerritory(o.territoryId),
      );
      const territories = territoryId
        ? db.territories.filter((t) => t.id === territoryId)
        : db.territories;

      const revenueByTerritory = territories.map((territory) => ({
        territory: territory.label,
        revenue: orders
          .filter((order) => order.territoryId === territory.id && order.status !== "cancelled")
          .reduce((total, order) => total + order.amount, 0),
        clients: clients.filter((client) => client.territoryId === territory.id).length,
      }));

      const pipelineByStage = (["qualification", "proposal", "negotiation", "won", "lost"] as PipelineStage[]).map(
        (stage) => ({
          stage,
          amount: opportunities
            .filter((opportunity) => opportunity.stage === stage)
            .reduce((total, opportunity) => total + opportunity.amount, 0),
          count: opportunities.filter((opportunity) => opportunity.stage === stage).length,
        }),
      );

      const monthBuckets = new Map<string, number>();
      orders
        .filter((order) => order.status !== "cancelled")
        .forEach((order) => {
          const month = order.date.slice(0, 7);
          monthBuckets.set(month, (monthBuckets.get(month) ?? 0) + order.amount);
        });
      const revenueByMonth = Array.from(monthBuckets.entries())
        .sort(([leftMonth], [rightMonth]) => leftMonth.localeCompare(rightMonth))
        .slice(-12)
        .map(([month, revenue]) => ({ month, revenue }));

      const visitStats = {
        total: visits.length,
        completed: visits.filter((visit) => visit.status === "completed").length,
        cancelled: visits.filter((visit) => visit.status === "cancelled").length,
        missed: visits.filter((visit) => visit.status === "missed").length,
      };

      const topClients = [...clients]
        .map((client) => ({
          id: client.id,
          name: client.name,
          revenue: orders
            .filter((order) => order.clientId === client.id && order.status !== "cancelled")
            .reduce((total, order) => total + order.amount, 0),
        }))
        .filter((entry) => entry.revenue > 0)
        .sort((left, right) => right.revenue - left.revenue)
        .slice(0, 10);

      res.json({
        revenueByTerritory,
        pipelineByStage,
        revenueByMonth,
        visitStats,
        topClients,
        kpis: {
          totalClients: clients.length,
          totalOrders: orders.length,
          totalRevenue: orders.filter((order) => order.status !== "cancelled").reduce((total, order) => total + order.amount, 0),
          activePipeline: pipelineByStage.filter((entry) => entry.stage !== "won" && entry.stage !== "lost").reduce((total, entry) => total + entry.amount, 0),
        },
      });
    }),
  );

  app.get(
    `${API_PREFIX}/reports/forecast`,
    requireAuth,
    requirePermission("insights.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const actor = req.authUser!;
      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();
      const stageWeight: Record<PipelineStage, number> = {
        qualification: 0.2,
        proposal: 0.5,
        negotiation: 0.75,
        won: 1,
        lost: 0,
      };
      const opportunities = getVisibleOpportunities(db, actor).filter((opp) => {
        if (opp.stage === "lost") return false;
        if (from && opp.expectedClose < from) return false;
        if (to && opp.expectedClose > to) return false;
        return true;
      });

      const monthBuckets = new Map<string, { gross: number; weighted: number; count: number }>();
      opportunities.forEach((opp) => {
        const month = (opp.expectedClose || new Date().toISOString()).slice(0, 7);
        const bucket = monthBuckets.get(month) ?? { gross: 0, weighted: 0, count: 0 };
        const weight = stageWeight[opp.stage] * (opp.probability / 100 || 1);
        bucket.gross += opp.amount;
        bucket.weighted += opp.amount * weight;
        bucket.count += 1;
        monthBuckets.set(month, bucket);
      });

      const monthly = Array.from(monthBuckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, value]) => ({
          month,
          gross: Math.round(value.gross),
          weighted: Math.round(value.weighted),
          count: value.count,
        }));

      res.json({
        currency: db.company.currency,
        monthly,
        totals: {
          gross: monthly.reduce((sum, entry) => sum + entry.gross, 0),
          weighted: monthly.reduce((sum, entry) => sum + entry.weighted, 0),
          count: monthly.reduce((sum, entry) => sum + entry.count, 0),
        },
      });
    }),
  );

  // ----- Global search ----------------------------------------------------

  app.get(
    `${API_PREFIX}/search`,
    requireAuth,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const actor = req.authUser!;
      const query = String(req.query.q || "").trim().toLowerCase();
      if (query.length < 2) {
        res.json({ clients: [], prospects: [], visits: [], opportunities: [], orders: [] });
        return;
      }
      const limit = 5;
      const matches = (value: string | undefined | null) =>
        Boolean(value && value.toLowerCase().includes(query));

      const clients = getVisibleClients(db, actor)
        .filter((entry) => matches(entry.name) || matches(entry.contactName) || matches(entry.email) || matches(entry.phone) || matches(entry.city))
        .slice(0, limit)
        .map((entry) => ({ id: entry.id, label: entry.name, sub: entry.city || entry.contactName || "", path: `/clients/${entry.id}` }));

      const prospects = db.prospects
        .filter((entry) => canSeeEntity(db, actor, { ownerUserId: entry.ownerUserId, territoryId: entry.territoryId }))
        .filter((entry) => matches(entry.name) || matches(entry.contactName) || matches(entry.email))
        .slice(0, limit)
        .map((entry) => ({ id: entry.id, label: entry.name, sub: entry.status, path: `/prospects/${entry.id}` }));

      const visits = getVisibleVisits(db, actor)
        .filter((entry) => matches(entry.clientName) || matches(entry.objective) || matches(entry.city))
        .slice(0, limit)
        .map((entry) => ({ id: entry.id, label: entry.clientName, sub: `${entry.scheduledDate} · ${entry.objective || ""}`, path: `/visits/${entry.id}` }));

      const opportunities = getVisibleOpportunities(db, actor)
        .filter((entry) => matches(entry.clientName) || matches(entry.nextAction))
        .slice(0, limit)
        .map((entry) => ({ id: entry.id, label: entry.clientName, sub: `${entry.stage} · ${entry.amount.toLocaleString("fr-FR")}`, path: "/pipeline" }));

      const orders = getVisibleOrders(db, actor)
        .filter((entry) => matches(entry.id) || matches(entry.clientName))
        .slice(0, limit)
        .map((entry) => ({ id: entry.id, label: entry.id, sub: entry.clientName, path: "/orders" }));

      res.json({ clients, prospects, visits, opportunities, orders });
    }),
  );

  // ----- Blob uploads + documents -----------------------------------------

  app.post(
    `${API_PREFIX}/uploads/blob`,
    requireAuth,
    express.raw({ type: "*/*", limit: "25mb" }),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const body = req.body as Buffer | undefined;
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        res.status(503).json({ error: "Vercel Blob non configure (BLOB_READ_WRITE_TOKEN manquant)" });
        return;
      }
      if (!body || !Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "Fichier vide" });
        return;
      }
      const filename = String(req.headers["x-filename"] || "fichier")
        .replace(/[^\w.\-]/g, "_")
        .slice(0, 160);
      const contentType = String(req.headers["content-type"] || "application/octet-stream");
      const folder = String(req.query.folder || "uploads").replace(/[^\w\-]/g, "").slice(0, 40) || "uploads";
      const { put } = await import("@vercel/blob");
      const { url } = await put(`${folder}/${Date.now()}-${filename}`, body, {
        access: "public",
        contentType,
        addRandomSuffix: true,
      });
      res.status(201).json({ url, name: filename, sizeBytes: body.length, contentType });
    }),
  );

  app.get(
    `${API_PREFIX}/documents`,
    requireAuth,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const actor = req.authUser!;
      const clientId = String(req.query.clientId || "").trim();
      const orderId = String(req.query.orderId || "").trim();
      let documents = db.documents;
      if (clientId) documents = documents.filter((doc) => doc.clientId === clientId);
      if (orderId) documents = documents.filter((doc) => doc.orderId === orderId);
      if (!GLOBAL_READ_ROLES.has(actor.role)) {
        const visibleUsers = getVisibleUserIds(db, actor);
        documents = documents.filter((doc) => visibleUsers.has(doc.uploadedByUserId));
      }
      res.json(documents.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200));
    }),
  );

  app.post(
    `${API_PREFIX}/documents`,
    requireAuth,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      const blobUrl = String(req.body?.blobUrl || "").trim();
      const name = String(req.body?.name || "").trim();
      if (!blobUrl || !name) {
        res.status(400).json({ error: "name et blobUrl requis" });
        return;
      }
      let created: DocumentItem | null = null;
      await store.mutate((db) => {
        const doc: DocumentItem = {
          id: `doc-${crypto.randomUUID()}`,
          name,
          blobUrl,
          sizeBytes: toNumber(req.body?.sizeBytes, 0),
          contentType: String(req.body?.contentType || ""),
          uploadedByUserId: actor.id,
          uploadedByName: actor.name,
          clientId: req.body?.clientId ? String(req.body.clientId) : null,
          orderId: req.body?.orderId ? String(req.body.orderId) : null,
          opportunityId: req.body?.opportunityId ? String(req.body.opportunityId) : null,
          signedAt: null,
          signedByName: null,
          createdAt: new Date().toISOString(),
        };
        db.documents.unshift(doc);
        addAuditLog(db, actor.id, "document.uploaded", "document", doc.id, { name });
        created = doc;
      });
      res.status(201).json(created);
    }),
  );

  app.post(
    `${API_PREFIX}/documents/upload`,
    requireAuth,
    express.raw({ type: "*/*", limit: "25mb" }),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      const body = req.body as Buffer | undefined;
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        res.status(503).json({ error: "Vercel Blob non configure (BLOB_READ_WRITE_TOKEN manquant)" });
        return;
      }
      if (!body || !Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "Fichier vide" });
        return;
      }
      const filename = String(req.headers["x-filename"] || "document")
        .replace(/[^\w.\-]/g, "_")
        .slice(0, 160);
      const contentType = String(req.headers["content-type"] || "application/octet-stream");
      const { put } = await import("@vercel/blob");
      const { url } = await put(`documents/${Date.now()}-${filename}`, body, {
        access: "public",
        contentType,
        addRandomSuffix: true,
      });
      let created: DocumentItem | null = null;
      await store.mutate((db) => {
        const doc: DocumentItem = {
          id: `doc-${crypto.randomUUID()}`,
          name: String(req.headers["x-document-name"] || filename),
          blobUrl: url,
          sizeBytes: body.length,
          contentType,
          uploadedByUserId: actor.id,
          uploadedByName: actor.name,
          clientId: req.headers["x-client-id"] ? String(req.headers["x-client-id"]) : null,
          orderId: req.headers["x-order-id"] ? String(req.headers["x-order-id"]) : null,
          opportunityId: req.headers["x-opportunity-id"] ? String(req.headers["x-opportunity-id"]) : null,
          signedAt: null,
          signedByName: null,
          createdAt: new Date().toISOString(),
        };
        db.documents.unshift(doc);
        addAuditLog(db, actor.id, "document.uploaded", "document", doc.id, { name: doc.name });
        created = doc;
      });
      res.status(201).json(created);
    }),
  );

  app.get(
    `${API_PREFIX}/integrations`,
    requireAuth,
    requirePermission("integrations.read"),
    asyncRoute(async (_req: AuthenticatedRequest, res) => {
      const db = await store.read();
      res.json(db.integrations);
    }),
  );

  app.patch(
    `${API_PREFIX}/integrations/:id`,
    requireAuth,
    requirePermission("integrations.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: IntegrationItem | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.integrations.findIndex((entry) => entry.id === req.params.id);
        if (index === -1) {
          notFound = true;
          return;
        }
        db.integrations[index] = {
          ...db.integrations[index],
          status: req.body?.status === "connected" || req.body?.status === "configured" || req.body?.status === "attention"
            ? req.body.status
            : db.integrations[index].status,
          endpointUrl: req.body?.endpointUrl !== undefined ? String(req.body.endpointUrl).trim() : db.integrations[index].endpointUrl,
          description: req.body?.description !== undefined ? String(req.body.description).trim() : db.integrations[index].description,
          lastError: req.body?.lastError !== undefined ? String(req.body.lastError).trim() : db.integrations[index].lastError,
        };
        updated = db.integrations[index];
        addAuditLog(db, actor.id, "integration.updated", "integration", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Integration introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.post(
    `${API_PREFIX}/integrations/:id/sync`,
    requireAuth,
    requirePermission("integrations.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: IntegrationItem | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.integrations.findIndex((entry) => entry.id === req.params.id);
        if (index === -1) {
          notFound = true;
          return;
        }
        db.integrations[index] = {
          ...db.integrations[index],
          status: "connected",
          lastSyncAt: new Date().toISOString(),
          lastError: "",
        };
        updated = db.integrations[index];
        addAuditLog(db, actor.id, "integration.sync_requested", "integration", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Integration introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/contracts`,
    requireAuth,
    requirePermission("orders.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const items = db.contracts
        .filter((item) => canSeeOwner(db, req.authUser!, item.ownerUserId))
        .sort((left, right) => (left.renewalDate || left.endDate).localeCompare(right.renewalDate || right.endDate));
      res.json(items);
    }),
  );

  app.post(
    `${API_PREFIX}/contracts`,
    requireAuth,
    requirePermission("orders.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let created: ContractItem | null = null;
      await store.mutate((db) => {
        const owner = resolveOwner(db, actor, req.body?.ownerUserId);
        created = {
          id: `ctr-${crypto.randomUUID()}`,
          number: String(req.body?.number || `CTR-${new Date().getFullYear()}-${String(db.contracts.length + 1).padStart(4, "0")}`),
          clientId: req.body?.clientId ? String(req.body.clientId) : null,
          clientName: String(req.body?.clientName || "").trim() || "Client non renseigne",
          ownerUserId: owner.id,
          ownerName: owner.name,
          status: normalizeContractStatus(req.body?.status),
          startDate: String(req.body?.startDate || currentBusinessDate(db.company.timezone)),
          endDate: String(req.body?.endDate || currentBusinessDate(db.company.timezone)),
          renewalDate: req.body?.renewalDate ? String(req.body.renewalDate) : null,
          amount: Math.max(0, toNumber(req.body?.amount, 0)),
          currency: db.company.currency,
          notes: String(req.body?.notes || "").trim(),
          createdAt: new Date().toISOString(),
        };
        db.contracts.unshift(created);
        addAuditLog(db, actor.id, "contract.created", "contract", created.id);
      });
      res.status(201).json(created);
    }),
  );

  app.patch(
    `${API_PREFIX}/contracts/:id`,
    requireAuth,
    requirePermission("orders.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: ContractItem | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.contracts.findIndex((item) => item.id === req.params.id);
        if (index === -1 || !canSeeOwner(db, actor, db.contracts[index].ownerUserId)) {
          notFound = true;
          return;
        }
        const current = db.contracts[index];
        db.contracts[index] = {
          ...current,
          status: req.body?.status !== undefined ? normalizeContractStatus(req.body.status) : current.status,
          renewalDate: req.body?.renewalDate !== undefined ? String(req.body.renewalDate || "") || null : current.renewalDate,
          endDate: req.body?.endDate !== undefined ? String(req.body.endDate) : current.endDate,
          amount: req.body?.amount !== undefined ? Math.max(0, toNumber(req.body.amount, current.amount)) : current.amount,
          notes: req.body?.notes !== undefined ? String(req.body.notes).trim() : current.notes,
        };
        updated = db.contracts[index];
        addAuditLog(db, actor.id, "contract.updated", "contract", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Contrat introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/cases`,
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      res.json(
        db.cases
          .filter((item) => canSeeOwner(db, req.authUser!, item.ownerUserId))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      );
    }),
  );

  app.post(
    `${API_PREFIX}/cases`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let created: CaseItem | null = null;
      await store.mutate((db) => {
        const owner = resolveOwner(db, actor, req.body?.ownerUserId);
        const now = new Date().toISOString();
        created = {
          id: `case-${crypto.randomUUID()}`,
          title: String(req.body?.title || "").trim() || "Nouveau dossier",
          clientId: req.body?.clientId ? String(req.body.clientId) : null,
          clientName: String(req.body?.clientName || "").trim() || "Client non renseigne",
          ownerUserId: owner.id,
          ownerName: owner.name,
          status: normalizeCaseStatus(req.body?.status),
          priority: normalizePriority(req.body?.priority),
          category: String(req.body?.category || "").trim(),
          description: String(req.body?.description || "").trim(),
          resolution: "",
          dueAt: req.body?.dueAt ? String(req.body.dueAt) : null,
          createdAt: now,
          updatedAt: now,
        };
        db.cases.unshift(created);
        addAuditLog(db, actor.id, "case.created", "case", created.id);
      });
      res.status(201).json(created);
    }),
  );

  app.patch(
    `${API_PREFIX}/cases/:id`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: CaseItem | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.cases.findIndex((item) => item.id === req.params.id);
        if (index === -1 || !canSeeOwner(db, actor, db.cases[index].ownerUserId)) {
          notFound = true;
          return;
        }
        const current = db.cases[index];
        db.cases[index] = {
          ...current,
          status: req.body?.status !== undefined ? normalizeCaseStatus(req.body.status) : current.status,
          priority: req.body?.priority !== undefined ? normalizePriority(req.body.priority) : current.priority,
          resolution: req.body?.resolution !== undefined ? String(req.body.resolution).trim() : current.resolution,
          dueAt: req.body?.dueAt !== undefined ? String(req.body.dueAt || "") || null : current.dueAt,
          updatedAt: new Date().toISOString(),
        };
        updated = db.cases[index];
        addAuditLog(db, actor.id, "case.updated", "case", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Dossier introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/campaigns`,
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      res.json(
        db.campaigns
          .filter((item) => canSeeOwner(db, req.authUser!, item.ownerUserId))
          .sort((left, right) => (right.scheduledAt || right.createdAt).localeCompare(left.scheduledAt || left.createdAt)),
      );
    }),
  );

  app.post(
    `${API_PREFIX}/campaigns`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let created: CampaignItem | null = null;
      await store.mutate((db) => {
        const owner = resolveOwner(db, actor, req.body?.ownerUserId);
        created = {
          id: `camp-${crypto.randomUUID()}`,
          name: String(req.body?.name || "").trim() || "Nouvelle campagne",
          channel: normalizeCampaignChannel(req.body?.channel),
          status: normalizeCampaignStatus(req.body?.status),
          audience: String(req.body?.audience || "").trim(),
          ownerUserId: owner.id,
          ownerName: owner.name,
          scheduledAt: req.body?.scheduledAt ? String(req.body.scheduledAt) : null,
          sentCount: Math.max(0, toNumber(req.body?.sentCount, 0)),
          responseCount: Math.max(0, toNumber(req.body?.responseCount, 0)),
          notes: String(req.body?.notes || "").trim(),
          createdAt: new Date().toISOString(),
        };
        db.campaigns.unshift(created);
        addAuditLog(db, actor.id, "campaign.created", "campaign", created.id);
      });
      res.status(201).json(created);
    }),
  );

  app.patch(
    `${API_PREFIX}/campaigns/:id`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: CampaignItem | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.campaigns.findIndex((item) => item.id === req.params.id);
        if (index === -1 || !canSeeOwner(db, actor, db.campaigns[index].ownerUserId)) {
          notFound = true;
          return;
        }
        const current = db.campaigns[index];
        db.campaigns[index] = {
          ...current,
          status: req.body?.status !== undefined ? normalizeCampaignStatus(req.body.status) : current.status,
          scheduledAt: req.body?.scheduledAt !== undefined ? String(req.body.scheduledAt || "") || null : current.scheduledAt,
          sentCount: req.body?.sentCount !== undefined ? Math.max(0, toNumber(req.body.sentCount, current.sentCount)) : current.sentCount,
          responseCount: req.body?.responseCount !== undefined ? Math.max(0, toNumber(req.body.responseCount, current.responseCount)) : current.responseCount,
          notes: req.body?.notes !== undefined ? String(req.body.notes).trim() : current.notes,
        };
        updated = db.campaigns[index];
        addAuditLog(db, actor.id, "campaign.updated", "campaign", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Campagne introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/calls`,
    requireAuth,
    requirePermission("clients.read"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      res.json(
        db.calls
          .filter((item) => canSeeOwner(db, req.authUser!, item.ownerUserId))
          .sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt)),
      );
    }),
  );

  app.post(
    `${API_PREFIX}/calls`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let created: SalesCallItem | null = null;
      await store.mutate((db) => {
        const owner = resolveOwner(db, actor, req.body?.ownerUserId);
        created = {
          id: `call-${crypto.randomUUID()}`,
          subject: String(req.body?.subject || "").trim() || "Appel commercial",
          phone: String(req.body?.phone || "").trim(),
          clientId: req.body?.clientId ? String(req.body.clientId) : null,
          clientName: String(req.body?.clientName || "").trim() || "Contact non renseigne",
          ownerUserId: owner.id,
          ownerName: owner.name,
          status: normalizeCallStatus(req.body?.status),
          scheduledAt: String(req.body?.scheduledAt || new Date().toISOString()),
          durationSeconds: Math.max(0, toNumber(req.body?.durationSeconds, 0)),
          outcome: String(req.body?.outcome || "").trim(),
          notes: String(req.body?.notes || "").trim(),
          createdAt: new Date().toISOString(),
        };
        db.calls.unshift(created);
        addAuditLog(db, actor.id, "call.created", "call", created.id);
      });
      res.status(201).json(created);
    }),
  );

  app.patch(
    `${API_PREFIX}/calls/:id`,
    requireAuth,
    requirePermission("clients.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: SalesCallItem | null = null;
      let notFound = false;
      await store.mutate((db) => {
        const index = db.calls.findIndex((item) => item.id === req.params.id);
        if (index === -1 || !canSeeOwner(db, actor, db.calls[index].ownerUserId)) {
          notFound = true;
          return;
        }
        const current = db.calls[index];
        db.calls[index] = {
          ...current,
          status: req.body?.status !== undefined ? normalizeCallStatus(req.body.status) : current.status,
          scheduledAt: req.body?.scheduledAt !== undefined ? String(req.body.scheduledAt) : current.scheduledAt,
          durationSeconds: req.body?.durationSeconds !== undefined ? Math.max(0, toNumber(req.body.durationSeconds, current.durationSeconds)) : current.durationSeconds,
          outcome: req.body?.outcome !== undefined ? String(req.body.outcome).trim() : current.outcome,
          notes: req.body?.notes !== undefined ? String(req.body.notes).trim() : current.notes,
        };
        updated = db.calls[index];
        addAuditLog(db, actor.id, "call.updated", "call", req.params.id);
      });
      if (notFound) {
        res.status(404).json({ error: "Appel introuvable" });
        return;
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/settings/profile`,
    requireAuth,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      res.json(buildUserSummary(db, req.authUser!));
    }),
  );

  app.patch(
    `${API_PREFIX}/settings/profile`,
    requireAuth,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: UserSummary | null = null;
      await store.mutate((db) => {
        const user = findUserById(db, actor.id)!;
        user.name = req.body?.name ? String(req.body.name).trim() : user.name;
        user.phone = req.body?.phone ? String(req.body.phone).trim() : user.phone;
        user.email = req.body?.email ? String(req.body.email).trim() : user.email;
        user.initials = user.name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((token) => token[0]?.toUpperCase() || "")
          .join("");
        updated = buildUserSummary(db, user);
        addAuditLog(db, actor.id, "user.profile_updated", "user", actor.id);
      });
      res.json(updated);
    }),
  );

  app.post(
    `${API_PREFIX}/settings/avatar`,
    requireAuth,
    requirePermission("settings.write"),
    express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "5mb" }),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      const body = req.body as Buffer | undefined;
      if (!body || !Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "Image vide ou format non supporté (png/jpeg/webp)" });
        return;
      }
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        res.status(503).json({ error: "Vercel Blob non configuré (BLOB_READ_WRITE_TOKEN manquant)" });
        return;
      }
      const contentType = String(req.headers["content-type"] || "image/png");
      const ext = contentType.split("/")[1] || "png";
      try {
        const { put } = await import("@vercel/blob");
        const { url } = await put(`avatars/${actor.id}.${ext}`, body, {
          access: "public",
          contentType,
          addRandomSuffix: true,
        });
        let updated: UserSummary | null = null;
        await store.mutate((db) => {
          const user = findUserById(db, actor.id);
          if (!user) return;
          user.avatarUrl = url;
          updated = buildUserSummary(db, user);
          addAuditLog(db, actor.id, "user.avatar_updated", "user", actor.id);
        });
        res.json(updated);
      } catch (error) {
        logError("user.avatar_upload_failed", { error: serializeError(error) });
        res.status(500).json({ error: "Upload impossible" });
      }
    }),
  );

  app.delete(
    `${API_PREFIX}/settings/avatar`,
    requireAuth,
    requirePermission("settings.write"),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let previousUrl: string | null = null;
      let updated: UserSummary | null = null;
      await store.mutate((db) => {
        const user = findUserById(db, actor.id);
        if (!user) return;
        previousUrl = user.avatarUrl ?? null;
        user.avatarUrl = null;
        updated = buildUserSummary(db, user);
        addAuditLog(db, actor.id, "user.avatar_removed", "user", actor.id);
      });
      if (previousUrl && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const { del } = await import("@vercel/blob");
          await del(previousUrl);
        } catch (error) {
          logInfo("user.avatar_blob_del_failed", { error: serializeError(error) });
        }
      }
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/billing/plan`,
    requireAuth,
    asyncRoute(async (_req, res) => {
      const db = await store.read();
      res.json({
        plan: db.company.plan,
        planSeats: db.company.planSeats,
        planStartedAt: db.company.planStartedAt,
        planNotes: db.company.planNotes,
      });
    }),
  );

  app.patch(
    `${API_PREFIX}/billing/plan`,
    requireAuth,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      if (actor.role !== "super_admin" && actor.role !== "admin") {
        res.status(403).json({ error: "Réservé aux administrateurs." });
        return;
      }
      const newPlan = String(req.body?.plan || "");
      if (!isSubscriptionPlan(newPlan)) {
        res.status(400).json({ error: "Plan invalide" });
        return;
      }
      const planSeats = req.body?.planSeats !== undefined ? Math.max(1, Number(req.body.planSeats) || 1) : null;
      const planNotes = req.body?.planNotes !== undefined ? String(req.body.planNotes).slice(0, 1000) : null;
      await store.mutate((db) => {
        db.company = {
          ...db.company,
          plan: newPlan as SubscriptionPlan,
          planSeats: planSeats ?? db.company.planSeats,
          planNotes: planNotes ?? db.company.planNotes,
          planStartedAt: db.company.plan !== newPlan ? new Date().toISOString() : db.company.planStartedAt,
        };
        addAuditLog(db, actor.id, "company.plan_changed", "company", db.company.id, { plan: newPlan });
      });
      const refreshed = await store.read();
      res.json({
        plan: refreshed.company.plan,
        planSeats: refreshed.company.planSeats,
        planStartedAt: refreshed.company.planStartedAt,
        planNotes: refreshed.company.planNotes,
      });
    }),
  );

  app.get(
    `${API_PREFIX}/settings/preferences`,
    requireAuth,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const preferences =
        db.preferences.find((entry) => entry.userId === req.authUser!.id) || defaultPreferences(req.authUser!.id);
      res.json(preferences);
    }),
  );

  app.patch(
    `${API_PREFIX}/settings/preferences`,
    requireAuth,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const actor = req.authUser!;
      let updated: UserPreferences | null = null;
      await store.mutate((db) => {
        const index = db.preferences.findIndex((entry) => entry.userId === actor.id);
        const payload: UserPreferences = {
          userId: actor.id,
          emailNotifications: Boolean(req.body?.emailNotifications),
          weeklyDigest: Boolean(req.body?.weeklyDigest),
          autoSync: Boolean(req.body?.autoSync),
        };
        if (index === -1) {
          db.preferences.push(payload);
        } else {
          db.preferences[index] = payload;
        }
        updated = payload;
        addAuditLog(db, actor.id, "user.preferences_updated", "user", actor.id);
      });
      res.json(updated);
    }),
  );

  app.post(
    `${API_PREFIX}/ai/chat`,
    requireAuth,
    requirePermission("assistant.read"),
    assistantRateLimiter,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const db = await store.read();
      const user = req.authUser!;
      const message = String(req.body?.message || "").trim();
      const history = Array.isArray(req.body?.history) ? req.body.history : [];

      if (!message) {
        res.status(400).json({ error: "Message vide" });
        return;
      }

      if (!ai) {
        res.json(buildFallbackAssistantText(db, user, message));
        return;
      }

      try {
        const dashboard = buildDashboard(db, user);
        const visibleClients = getVisibleClients(db, user);
        const visibleOrders = getVisibleOrders(db, user);
        const visibleOpportunities = getVisibleOpportunities(db, user);

        const context = `
Entreprise: ${db.company.name}
Vertical: ${db.company.vertical}
Utilisateur: ${user.name} (${getRoleDefinition(user.role).label})
Territoires: ${buildUserSummary(db, user).territoryLabels.join(", ")}
Clients visibles: ${visibleClients.length}
Opportunites actives: ${dashboard.kpis.activeOpportunities}
Pipeline visible: ${dashboard.kpis.pipelineAmount} ${db.company.currency}
Commandes visibles: ${visibleOrders.length}
Top opportunites: ${visibleOpportunities
  .slice(0, 3)
  .map((item) => `${item.clientName} - ${item.amount} ${db.company.currency} - ${item.stage}`)
  .join(" | ")}
Alertes: ${dashboard.alerts.map((alert) => alert.title).join(" | ")}
`;

        const contents = history
          .map((entry: { role?: string; text?: string }) => ({
            role: entry.role === "user" ? "user" : "model",
            parts: [{ text: entry.text || "" }],
          }))
          .slice(-10);

        contents.push({
          role: "user",
          parts: [{ text: message }],
        });

        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: `Tu es un copilote commercial terrain. Reponds uniquement en francais. Sois precis, actionnable et aligné sur le contexte suivant:\n${context}`,
            temperature: 0.4,
          },
        });

        res.json({ text: response.text || buildFallbackAssistantText(db, user, message).text });
      } catch (error) {
        logError("assistant.request_failed", {
          requestId: req.requestId,
          userId: user.id,
          error: serializeError(error),
        });
        res.json(buildFallbackAssistantText(db, user, message));
      }
    }),
  );

  // ----- Saisie vocale → CRM (Groq, modèles ouverts: Whisper + Llama) -------
  // Tout passe par Groq (free tier, modèles open-weight). Aucune écriture ici :
  // ces endpoints retournent un transcript + des actions PROPOSÉES que l'UI fait
  // confirmer à l'utilisateur avant d'appeler les endpoints d'écriture existants.
  const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim() || null;
  const GROQ_LLM_MODEL = process.env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile";
  const GROQ_STT_MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";
  const GROQ_BASE = "https://api.groq.com/openai/v1";

  // Audio → texte via Whisper hébergé sur Groq.
  app.post(
    `${API_PREFIX}/ai/transcribe`,
    requireAuth,
    requirePermission("assistant.read"),
    assistantRateLimiter,
    express.raw({ type: "*/*", limit: "25mb" }),
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      if (!GROQ_API_KEY) {
        res.status(503).json({ error: "Transcription indisponible (GROQ_API_KEY manquante)" });
        return;
      }
      const body = req.body as Buffer | undefined;
      if (!body || !Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "Audio vide" });
        return;
      }
      const contentType = String(req.headers["content-type"] || "audio/webm");
      const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("wav") ? "wav" : contentType.includes("mpeg") ? "mp3" : "webm";
      // Whisper language hint (fr/ar/en). Darija is transcribed as Arabic ("ar");
      // the dialect nuance is handled downstream by the voice-intake LLM prompt.
      const langParam = String((req.query?.lang as string) || "fr").toLowerCase();
      const sttLang = ["fr", "ar", "en"].includes(langParam) ? langParam : "fr";
      try {
        const form = new FormData();
        form.append("file", new Blob([body], { type: contentType }), `audio.${ext}`);
        form.append("model", GROQ_STT_MODEL);
        form.append("language", sttLang);
        form.append("response_format", "json");
        const r = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
          body: form,
        });
        if (!r.ok) {
          const detail = await r.text().catch(() => "");
          logError("ai.transcribe_failed", { status: r.status, detail: detail.slice(0, 500) });
          res.status(502).json({ error: "Transcription échouée" });
          return;
        }
        const data = (await r.json()) as { text?: string };
        res.json({ text: (data.text || "").trim() });
      } catch (error) {
        logError("ai.transcribe_error", { error: serializeError(error) });
        res.status(502).json({ error: "Transcription échouée" });
      }
    }),
  );

  // Texte (instruction du commercial) → actions CRM structurées et PROPOSÉES.
  app.post(
    `${API_PREFIX}/ai/voice-intake`,
    requireAuth,
    requirePermission("assistant.read"),
    assistantRateLimiter,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      const text = String(req.body?.text || "").trim();
      const entityName = String(req.body?.entityName || "").trim();
      const langHint = String(req.body?.lang || "fr").toLowerCase();
      const currency = (await store.read()).company.currency || "MAD";
      // Human-readable source language for the prompt. Darija = Moroccan dialect
      // (may arrive transliterated in Latin script or in Arabic script).
      const spokenLanguage =
        langHint === "darija"
          ? "en darija (arabe dialectal marocain, éventuellement translittéré en lettres latines)"
          : langHint === "ar"
            ? "en arabe standard"
            : langHint === "en"
              ? "en anglais"
              : "en français";
      if (!text) {
        res.status(400).json({ error: "Texte vide" });
        return;
      }
      if (!GROQ_API_KEY) {
        res.status(503).json({ error: "Assistant vocal indisponible (GROQ_API_KEY manquante)" });
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const system = `Tu es un assistant CRM pour une force de vente terrain au Maroc. La note est dictée par un commercial ${spokenLanguage}. Comprends-la quelle que soit la langue, mais rédige TOUJOURS tes sorties (summary, need, solutionFit, subject, email) EN FRANÇAIS propre et professionnel pour le manager. Tu extrais des actions structurées. Réponds UNIQUEMENT en JSON valide, sans texte autour, avec EXACTEMENT ce schéma:
{
  "summary": "résumé d'une phrase en français",
  "qualification": { "need": "besoin détecté ou ''", "solutionFit": "adéquation avec notre offre ou ''" },
  "schedule": { "type": "call|meeting|task", "subject": "intitulé court", "dateTime": "ISO 8601 ou ''" } | null,
  "opportunityAmount": nombre ou null,
  "email": { "subject": "objet", "body": "corps du mail prêt à envoyer" } | null,
  "createQuote": booléen
}
Règles: la date du jour est ${today}. Devise: ${currency}. Convertis les dates relatives ("avant vendredi", "demain") en ISO. Si une info est absente, mets '' ou null. Ne fabrique jamais d'information. ${entityName ? `Le prospect/client concerné est: "${entityName}".` : ""}`;
      try {
        const r = await fetch(`${GROQ_BASE}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: GROQ_LLM_MODEL,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: text },
            ],
          }),
        });
        if (!r.ok) {
          const detail = await r.text().catch(() => "");
          logError("ai.voice_intake_failed", { status: r.status, detail: detail.slice(0, 500) });
          res.status(502).json({ error: "Analyse échouée" });
          return;
        }
        const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content || "{}";
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          res.status(502).json({ error: "Réponse IA illisible" });
          return;
        }
        res.json({ transcript: text, actions: parsed });
      } catch (error) {
        logError("ai.voice_intake_error", { error: serializeError(error) });
        res.status(502).json({ error: "Analyse échouée" });
      }
    }),
  );

  const { mountWhatsAppRoutes } = await import("./whatsapp.js");
  mountWhatsAppRoutes(app, {
    pool: store.pool,
    requireAuth,
    requirePermission,
    asyncRoute,
    logInfo,
    logError,
  });
  const { mountCrmFlowRoutes } = await import("./crm-flow.js");
  mountCrmFlowRoutes(app, {
    pool: store.pool,
    requireAuth,
    requirePermission,
    asyncRoute,
    logInfo,
    logError,
    publicBaseUrl: () => APP_PUBLIC_URL.startsWith("http")
      ? APP_PUBLIC_URL
      : (APP_PUBLIC_URL ? `https://${APP_PUBLIC_URL}` : ""),
    sendEmail,
  });

  app.use(API_PREFIX, (req: AuthenticatedRequest, res) => {
    res.status(404).json(buildApiErrorPayload(req, "Route API introuvable"));
  });

  if (serveFrontend) {
    if (!appConfig.isProduction) {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      try {
        await fs.access(path.join(distPath, "index.html"));
      } catch {
        throw new Error("Assets de production introuvables. Lancez `npm run build` avant `npm run start`.");
      }
      app.use(
        express.static(distPath, {
          index: false,
          maxAge: "1d",
        }),
      );
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.use(
    ((error: unknown, req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (res.headersSent) {
        next(error);
        return;
      }

      const details = error as { status?: number; type?: string };
      const isInvalidJson =
        error instanceof SyntaxError && details.status === 400 && details.type === "entity.parse.failed";
      const statusCode = isInvalidJson ? 400 : details.status && details.status >= 400 ? details.status : 500;
      const message =
        statusCode === 400
          ? "Payload JSON invalide"
          : statusCode >= 500
            ? "Erreur interne du serveur"
            : error instanceof Error
              ? error.message
              : "Erreur inconnue";

      logError("http.request_failed", {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode,
        error: serializeError(error),
      });

      if (req.originalUrl.startsWith(API_PREFIX)) {
        res.status(statusCode).json(buildApiErrorPayload(req, message));
        return;
      }

      res.status(statusCode).send(message);
    }) as ErrorRequestHandler,
  );

  return app;
}

export async function startServer() {
  const app = await createApp({ serveFrontend: true });

  const server = app.listen(PORT, appConfig.host, () => {
    logInfo("server.started", {
      host: appConfig.host,
      port: PORT,
      environment: appConfig.nodeEnv,
    });
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logInfo("server.shutdown_requested", { signal });
    const forceExitTimer = setTimeout(() => {
      logError("server.shutdown_timeout", { signal });
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();
    server.close((error) => {
      clearTimeout(forceExitTimer);
      if (error) {
        logError("server.shutdown_failed", {
          signal,
          error: serializeError(error),
        });
        process.exit(1);
        return;
      }
      logInfo("server.shutdown_completed", { signal });
      process.exit(0);
    });
  };

  (["SIGINT", "SIGTERM"] as const).forEach((signal) => {
    process.once(signal, () => shutdown(signal));
  });
}

function defaultPreferences(userId: string): UserPreferences {
  return {
    userId,
    emailNotifications: true,
    weeklyDigest: false,
    autoSync: true,
  };
}

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() || "")
    .join("");
}

function createProductionBootstrapDatabase(): Database {
  if (!appConfig.bootstrap.adminEmail || !appConfig.bootstrap.adminPassword) {
    throw new Error(
      "Base absente en production: renseignez BOOTSTRAP_ADMIN_EMAIL et BOOTSTRAP_ADMIN_PASSWORD pour initialiser un compte admin.",
    );
  }
  if (appConfig.bootstrap.adminPassword.length < 12) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD doit contenir au moins 12 caracteres.");
  }

  const territoryId = "territory-primary";
  const adminId = "user-admin";

  return {
    company: {
      id: "company-clerivo",
      name: appConfig.bootstrap.companyName,
      vertical: appConfig.bootstrap.companyVertical,
      currency: appConfig.bootstrap.companyCurrency,
      timezone: appConfig.appTimeZone,
      country: appConfig.bootstrap.companyCountry,
      plan: "essentiel",
      planSeats: 1,
      planStartedAt: new Date().toISOString(),
      planNotes: "",
    },
    roles: ROLE_DEFINITIONS,
    teams: [],
    territories: [
      {
        id: territoryId,
        label: appConfig.bootstrap.defaultTerritory,
        region: appConfig.bootstrap.companyCountry,
      },
    ],
    users: [
      {
        id: adminId,
        name: appConfig.bootstrap.adminName,
        initials: initialsFromName(appConfig.bootstrap.adminName),
        email: appConfig.bootstrap.adminEmail,
        phone: "",
        title: "Administrateur",
        role: "admin",
        territoryIds: [territoryId],
        active: true,
        passwordHash: hashPassword(appConfig.bootstrap.adminPassword),
      },
    ],
    clients: [],
    visits: [],
    opportunities: [],
    orders: [],
    products: [],
    targets: [],
    integrations: [],
    notifications: [],
    preferences: [defaultPreferences(adminId)],
    auditLogs: [],
    prospects: [],
    activities: [],
    documents: [],
    orderLines: [],
    contracts: [],
    cases: [],
    campaigns: [],
    calls: [],
  };
}

function createSeedDatabase(): Database {
  const territories: Territory[] = [
    { id: "zone-principale", label: "Zone principale", region: "Maroc" },
  ];

  const users: DbUser[] = [
    {
      id: "user-sales",
      name: "Anas SENHAJI",
      initials: "AS",
      email: "anas.senhaji@crm.local",
      phone: "",
      title: "Commercial terrain",
      role: "sales_rep",
      territoryIds: territories.map((territory) => territory.id),
      active: true,
      passwordHash:
        "93b936ba61563979d84b7f26b7f41a38:68615361e2f7d579ff98780bafaed705351ec6201427731bd67f8d9055b83b34dbd982c15788d0e444484d1a6c0c7975dffc4cf71a8dd0b146afe82487350891",
    },
  ];

  return {
    company: {
      id: "company-terrain",
      name: "coveoconsulting",
      vertical: "CRM multi-activité",
      currency: "MAD",
      timezone: appConfig.appTimeZone,
      country: "Morocco",
      plan: "essentiel",
      planSeats: 5,
      planStartedAt: new Date().toISOString(),
      planNotes: "",
    },
    roles: ROLE_DEFINITIONS,
    teams: [],
    territories,
    users,
    clients: [],
    visits: [],
    opportunities: [],
    orders: [],
    products: [],
    targets: [],
    integrations: [],
    notifications: [],
    preferences: users.map((user) => defaultPreferences(user.id)),
    auditLogs: [],
    prospects: [],
    activities: [],
    documents: [],
    orderLines: [],
    contracts: [],
    cases: [],
    campaigns: [],
    calls: [],
  };
}

function createLegacyDemoDatabase(): Database {
  const company: Company = {
    id: "company-atlas",
    name: "coveoconsulting",
    vertical: "Distribution commerciale terrain",
    currency: "MAD",
    timezone: appConfig.appTimeZone,
    country: "Morocco",
    plan: "professionnel",
    planSeats: 10,
    planStartedAt: new Date().toISOString(),
    planNotes: "",
  };

  const territories: Territory[] = [
    { id: "casablanca", label: "Casablanca Centre", region: "Casablanca" },
    { id: "rabat", label: "Rabat et Sale", region: "Rabat" },
    { id: "marrakech", label: "Marrakech Sud", region: "Marrakech" },
  ];

  const teams: TeamSummary[] = [{ id: "team-north", name: "Equipe Nord", managerUserId: "user-manager" }];

  const users: DbUser[] = [
    {
      id: "user-admin",
      name: "Nadia Benali",
      initials: "NB",
      email: "admin@atlas.local",
      phone: "+212600100100",
      title: "Admin entreprise",
      role: "admin",
      teamId: "team-north",
      territoryIds: territories.map((territory) => territory.id),
      active: true,
      passwordHash: hashPassword("demo123"),
    },
    {
      id: "user-director",
      name: "Omar Alaoui",
      initials: "OA",
      email: "direction@atlas.local",
      phone: "+212600100101",
      title: "Directeur commercial",
      role: "director",
      teamId: "team-north",
      territoryIds: territories.map((territory) => territory.id),
      active: true,
      passwordHash: hashPassword("demo123"),
    },
    {
      id: "user-manager",
      name: "Sara El Idrissi",
      initials: "SE",
      email: "manager@atlas.local",
      phone: "+212600100102",
      title: "Manager commercial",
      role: "manager",
      teamId: "team-north",
      territoryIds: ["casablanca", "rabat"],
      active: true,
      passwordHash: hashPassword("demo123"),
    },
    {
      id: "user-sales",
      name: "Yassine Tazi",
      initials: "YT",
      email: "terrain@atlas.local",
      phone: "+212600100103",
      title: "Commercial terrain",
      role: "sales_rep",
      teamId: "team-north",
      territoryIds: ["casablanca"],
      active: true,
      passwordHash: hashPassword("demo123"),
    },
    {
      id: "user-sales-2",
      name: "Salma Ouali",
      initials: "SO",
      email: "salma@atlas.local",
      phone: "+212600100104",
      title: "Commercial terrain",
      role: "sales_rep",
      teamId: "team-north",
      territoryIds: ["rabat"],
      active: true,
      passwordHash: hashPassword("demo123"),
    },
    {
      id: "user-finance",
      name: "Hicham Finance",
      initials: "HF",
      email: "finance@atlas.local",
      phone: "+212600100105",
      title: "Finance et recouvrement",
      role: "finance",
      territoryIds: territories.map((territory) => territory.id),
      active: true,
      passwordHash: hashPassword("demo123"),
    },
  ];

  const clients: Client[] = [
    {
      id: "client-1",
      name: "Parapharmacie Anfa",
      type: "client",
      status: "active",
      segment: "A",
      address: "Boulevard Anfa, Casablanca",
      city: "Casablanca",
      zone: "Anfa",
      territoryId: "casablanca",
      territoryLabel: "Casablanca Centre",
      ownerUserId: "user-sales",
      ownerName: "Yassine Tazi",
      contactName: "Mme Khadija Rahmani",
      phone: "+212522100001",
      email: "anfa@client.ma",
      potentialScore: 88,
      financialRisk: "low",
      lastVisit: "2026-06-05",
      nextVisit: "2026-06-11",
      notes: "Compte prioritaire pour les commandes mensuelles.",
    },
    {
      id: "client-2",
      name: "Superette Palmier",
      type: "client",
      status: "active",
      segment: "B",
      address: "Maarif Extension, Casablanca",
      city: "Casablanca",
      zone: "Maarif",
      territoryId: "casablanca",
      territoryLabel: "Casablanca Centre",
      ownerUserId: "user-sales",
      ownerName: "Yassine Tazi",
      contactName: "M. Hamza Berrada",
      phone: "+212522100002",
      email: "palmier@client.ma",
      potentialScore: 65,
      financialRisk: "medium",
      lastVisit: "2026-06-02",
      nextVisit: "2026-06-09",
      notes: "Risque de remise agressive sur le prochain devis.",
    },
    {
      id: "client-3",
      name: "Maison Bien-Etre Rabat",
      type: "prospect",
      status: "active",
      segment: "A",
      address: "Agdal, Rabat",
      city: "Rabat",
      zone: "Agdal",
      territoryId: "rabat",
      territoryLabel: "Rabat et Sale",
      ownerUserId: "user-sales-2",
      ownerName: "Salma Ouali",
      contactName: "Mme Rim Saidi",
      phone: "+212537100003",
      email: "bienetre@prospect.ma",
      potentialScore: 91,
      financialRisk: "low",
      lastVisit: null,
      nextVisit: "2026-06-10",
      notes: "Prospect chaud en attente de proposition commerciale.",
    },
    {
      id: "client-4",
      name: "Market Al Wifaq",
      type: "client",
      status: "blocked",
      segment: "B",
      address: "Hay Riad, Rabat",
      city: "Rabat",
      zone: "Hay Riad",
      territoryId: "rabat",
      territoryLabel: "Rabat et Sale",
      ownerUserId: "user-sales-2",
      ownerName: "Salma Ouali",
      contactName: "M. Youssef Lahlou",
      phone: "+212537100004",
      email: "wifaq@client.ma",
      potentialScore: 52,
      financialRisk: "high",
      lastVisit: "2026-05-22",
      nextVisit: null,
      notes: "Blocage financier en cours.",
    },
    {
      id: "client-5",
      name: "Boutique Atlas Sud",
      type: "prospect",
      status: "inactive",
      segment: "C",
      address: "Gueliz, Marrakech",
      city: "Marrakech",
      zone: "Gueliz",
      territoryId: "marrakech",
      territoryLabel: "Marrakech Sud",
      ownerUserId: "user-admin",
      ownerName: "Nadia Benali",
      contactName: "Mme Ibtissam Fassi",
      phone: "+212524100005",
      email: "atlas.sud@prospect.ma",
      potentialScore: 40,
      financialRisk: "low",
      lastVisit: null,
      nextVisit: null,
      notes: "Zone a relancer en phase 2.",
    },
  ];

  const visits: Visit[] = [
    {
      id: "visit-1",
      clientId: "client-1",
      clientName: "Parapharmacie Anfa",
      address: "Boulevard Anfa, Casablanca",
      city: "Casablanca",
      objective: "Negociation de reassort et validation de visibilite rayon",
      scheduledDate: "2026-06-09",
      startTime: "09:00",
      endTime: "10:00",
      status: "in_progress",
      ownerUserId: "user-sales",
      ownerName: "Yassine Tazi",
      territoryId: "casablanca",
      territoryLabel: "Casablanca Centre",
      report: "",
      nextAction: "",
      checkInAt: "2026-06-09T09:02:00.000Z",
      checkOutAt: null,
      checkInLocation: { lat: 33.589886, lng: -7.603869 },
      checkOutLocation: null,
    },
    {
      id: "visit-2",
      clientId: "client-2",
      clientName: "Superette Palmier",
      address: "Maarif Extension, Casablanca",
      city: "Casablanca",
      objective: "Collecte de commande et verification des prix terrain",
      scheduledDate: "2026-06-09",
      startTime: "11:15",
      endTime: "12:00",
      status: "planned",
      ownerUserId: "user-sales",
      ownerName: "Yassine Tazi",
      territoryId: "casablanca",
      territoryLabel: "Casablanca Centre",
      report: "",
      nextAction: "",
      checkInAt: null,
      checkOutAt: null,
      checkInLocation: null,
      checkOutLocation: null,
    },
    {
      id: "visit-3",
      clientId: "client-3",
      clientName: "Maison Bien-Etre Rabat",
      address: "Agdal, Rabat",
      city: "Rabat",
      objective: "Qualification du besoin et cadrage de proposition",
      scheduledDate: "2026-06-10",
      startTime: "10:00",
      endTime: "11:00",
      status: "planned",
      ownerUserId: "user-sales-2",
      ownerName: "Salma Ouali",
      territoryId: "rabat",
      territoryLabel: "Rabat et Sale",
      report: "",
      nextAction: "",
      checkInAt: null,
      checkOutAt: null,
      checkInLocation: null,
      checkOutLocation: null,
    },
    {
      id: "visit-4",
      clientId: "client-4",
      clientName: "Market Al Wifaq",
      address: "Hay Riad, Rabat",
      city: "Rabat",
      objective: "Revue blocage financier et plan de recouvrement",
      scheduledDate: "2026-06-08",
      startTime: "15:30",
      endTime: "16:15",
      status: "completed",
      ownerUserId: "user-sales-2",
      ownerName: "Salma Ouali",
      territoryId: "rabat",
      territoryLabel: "Rabat et Sale",
      report: "Client alerte sur echeances. Recouvrement a prioriser avant nouvelle livraison.",
      nextAction: "Faire valider un echeancier par la finance.",
      checkInAt: "2026-06-08T15:32:00.000Z",
      checkOutAt: "2026-06-08T16:10:00.000Z",
      checkInLocation: { lat: 34.017652, lng: -6.84165 },
      checkOutLocation: { lat: 34.017652, lng: -6.84165 },
    },
  ];

  const opportunities: Opportunity[] = [
    {
      id: "opp-1",
      clientId: "client-1",
      clientName: "Parapharmacie Anfa",
      amount: 42000,
      probability: 78,
      stage: "negotiation",
      expectedClose: "2026-06-16",
      priority: "high",
      nextAction: "Faire valider la remise de 7% avec le manager.",
      ownerUserId: "user-sales",
      ownerName: "Yassine Tazi",
      territoryId: "casablanca",
      territoryLabel: "Casablanca Centre",
    },
    {
      id: "opp-2",
      clientId: "client-2",
      clientName: "Superette Palmier",
      amount: 18500,
      probability: 45,
      stage: "proposal",
      expectedClose: "2026-06-14",
      priority: "medium",
      nextAction: "Envoyer proposition mise a jour avant la visite de midi.",
      ownerUserId: "user-sales",
      ownerName: "Yassine Tazi",
      territoryId: "casablanca",
      territoryLabel: "Casablanca Centre",
    },
    {
      id: "opp-3",
      clientId: "client-3",
      clientName: "Maison Bien-Etre Rabat",
      amount: 50000,
      probability: 25,
      stage: "qualification",
      expectedClose: "2026-06-28",
      priority: "critical",
      nextAction: "Identifier le decideur final et confirmer le budget.",
      ownerUserId: "user-sales-2",
      ownerName: "Salma Ouali",
      territoryId: "rabat",
      territoryLabel: "Rabat et Sale",
    },
    {
      id: "opp-4",
      clientId: "client-4",
      clientName: "Market Al Wifaq",
      amount: 15000,
      probability: 0,
      stage: "lost",
      expectedClose: "2026-06-01",
      priority: "high",
      nextAction: "Attendre deblocage financier.",
      ownerUserId: "user-sales-2",
      ownerName: "Salma Ouali",
      territoryId: "rabat",
      territoryLabel: "Rabat et Sale",
      lossReason: "Blocage finance et concurrence prix.",
    },
    {
      id: "opp-5",
      clientName: "Grand Comptoir Sud",
      amount: 62000,
      probability: 100,
      stage: "won",
      expectedClose: "2026-06-07",
      priority: "high",
      nextAction: "Suivre la premiere livraison.",
      ownerUserId: "user-manager",
      ownerName: "Sara El Idrissi",
      territoryId: "casablanca",
      territoryLabel: "Casablanca Centre",
    },
  ];

  const orders: Order[] = [
    {
      id: "ORD-2026-0001",
      clientId: "client-1",
      clientName: "Parapharmacie Anfa",
      ownerUserId: "user-sales",
      ownerName: "Yassine Tazi",
      territoryId: "casablanca",
      territoryLabel: "Casablanca Centre",
      date: "2026-06-09",
      amount: 14500,
      discount: 3,
      status: "confirmed",
      approvalStatus: "not_required",
      syncStatus: "synced",
      notes: "Commande reappro gamme principale.",
    },
    {
      id: "ORD-2026-0002",
      clientId: "client-2",
      clientName: "Superette Palmier",
      ownerUserId: "user-sales",
      ownerName: "Yassine Tazi",
      territoryId: "casablanca",
      territoryLabel: "Casablanca Centre",
      date: "2026-06-08",
      amount: 23000,
      discount: 8,
      status: "awaiting_approval",
      approvalStatus: "pending",
      syncStatus: "not_synced",
      notes: "Remise proposee pour conserver le compte.",
    },
    {
      id: "ORD-2026-0003",
      clientId: "client-4",
      clientName: "Market Al Wifaq",
      ownerUserId: "user-sales-2",
      ownerName: "Salma Ouali",
      territoryId: "rabat",
      territoryLabel: "Rabat et Sale",
      date: "2026-06-06",
      amount: 8700,
      discount: 0,
      status: "draft",
      approvalStatus: "not_required",
      syncStatus: "not_synced",
      notes: "Commande bloquee tant que la finance ne debloque pas le compte.",
    },
  ];

  const products: Product[] = [
    {
      id: "product-1",
      name: "Pack hygiene dermo 250ml",
      ref: "DER-250",
      category: "Hygiene",
      price: 119,
      stock: 48,
      status: "active",
      description: "Rotation rapide sur les points de vente segment A.",
      image: "https://images.unsplash.com/photo-1526947425960-945c6e72858f?q=80&w=640",
    },
    {
      id: "product-2",
      name: "Serum reparation intense",
      ref: "DER-301",
      category: "Soin",
      price: 189,
      stock: 9,
      status: "active",
      description: "Produit a forte marge, suivi serré sur le stock terrain.",
      image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?q=80&w=640",
    },
    {
      id: "product-3",
      name: "Display promo comptoir",
      ref: "MER-100",
      category: "Merchandising",
      price: 450,
      stock: 3,
      status: "active",
      description: "Support de visibilite pour activation en point de vente.",
      image: "https://images.unsplash.com/photo-1515169067868-5387ec356754?q=80&w=640",
    },
    {
      id: "product-4",
      name: "Pack solaire ete",
      ref: "SUN-202",
      category: "Saisonnier",
      price: 229,
      stock: 0,
      status: "active",
      description: "Produit actuellement en rupture depot.",
      image: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=640",
    },
  ];

  const targets = [
    {
      id: "target-1",
      ownerUserId: "user-sales",
      periodLabel: "Juin 2026",
      revenueGoal: 60000,
      visitsGoal: 18,
      opportunitiesGoal: 8,
      ordersGoal: 10,
    },
    {
      id: "target-2",
      ownerUserId: "user-sales-2",
      periodLabel: "Juin 2026",
      revenueGoal: 55000,
      visitsGoal: 16,
      opportunitiesGoal: 7,
      ordersGoal: 9,
    },
    {
      id: "target-3",
      ownerUserId: "user-manager",
      periodLabel: "Juin 2026",
      revenueGoal: 120000,
      visitsGoal: 30,
      opportunitiesGoal: 15,
      ordersGoal: 18,
    },
  ];

  const integrations: IntegrationItem[] = [
    {
      id: "integration-erp",
      name: "ERP central",
      provider: "Odoo",
      scope: "Clients, commandes, tarifs",
      status: "connected",
      lastSyncAt: "2026-06-09T08:55:00.000Z",
      description: "Synchronise les comptes, commandes et statuts de facturation.",
    },
    {
      id: "integration-stock",
      name: "Stock depot",
      provider: "Warehouse API",
      scope: "Disponibilite produit",
      status: "connected",
      lastSyncAt: "2026-06-09T08:40:00.000Z",
      description: "Expose les niveaux de stock et les alertes de rupture.",
    },
    {
      id: "integration-maps",
      name: "Cartographie terrain",
      provider: "Mapbox",
      scope: "Itineraires et check-in",
      status: "configured",
      lastSyncAt: null,
      description: "Pret pour le calcul de tournee et la geolocalisation.",
    },
    {
      id: "integration-mail",
      name: "Messagerie commerciale",
      provider: "Microsoft 365",
      scope: "Relances et envois clients",
      status: "attention",
      lastSyncAt: "2026-06-07T18:10:00.000Z",
      description: "Connexion a reverifier avant automatisation des relances.",
    },
  ];

  const notifications: Array<NotificationItem & { userId: string }> = [
    {
      id: "notif-1",
      userId: "user-sales",
      title: "Validation de remise en attente",
      body: "La commande ORD-2026-0002 attend un accord manager.",
      level: "critical",
      read: false,
      createdAt: "2026-06-09T08:05:00.000Z",
      link: "/orders",
    },
    {
      id: "notif-2",
      userId: "user-manager",
      title: "Risque pipeline",
      body: "Maison Bien-Etre Rabat n'a pas encore confirme son budget.",
      level: "warning",
      read: false,
      createdAt: "2026-06-09T07:50:00.000Z",
      link: "/pipeline",
    },
    {
      id: "notif-3",
      userId: "user-finance",
      title: "Compte bloque a traiter",
      body: "Market Al Wifaq reste bloque avant nouvelle commande.",
      level: "critical",
      read: false,
      createdAt: "2026-06-08T17:30:00.000Z",
      link: "/orders",
    },
  ];

  const preferences = users.map((user) => defaultPreferences(user.id));

  return {
    company,
    roles: ROLE_DEFINITIONS,
    teams,
    territories,
    users,
    clients,
    visits,
    opportunities,
    orders,
    products,
    targets,
    integrations,
    notifications,
    preferences,
    auditLogs: [],
    prospects: [],
    activities: [],
    documents: [],
    orderLines: [],
    contracts: [],
    cases: [],
    campaigns: [],
    calls: [],
  };
}

process.on("unhandledRejection", (error) => {
  logError("process.unhandled_rejection", {
    error: serializeError(error),
  });
});

process.on("uncaughtException", (error) => {
  logError("process.uncaught_exception", {
    error: serializeError(error),
  });
  process.exit(1);
});
