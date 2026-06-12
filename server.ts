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
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
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
} from "./src/types.ts";

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
    bootstrap: {
      adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || null,
      adminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || null,
      adminName: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Platform Admin",
      companyName: process.env.BOOTSTRAP_COMPANY_NAME?.trim() || "Clerivo",
      companyVertical:
        process.env.BOOTSTRAP_COMPANY_VERTICAL?.trim() || "Force commerciale terrain",
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
const DB_PATH = path.join(process.cwd(), "data", "app-db.json");
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
};

type AuthenticatedRequest = Request & {
  requestId?: string;
  authUser?: DbUser;
  sessionPayload?: SessionPayload;
};

const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: "admin",
    label: "Admin entreprise",
    description: "Administre les utilisateurs, les zones, les integrations et les parametres.",
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
      "orders.approve",
      "products.read",
      "products.write",
      "targets.read",
      "insights.read",
      "routes.read",
      "assistant.read",
      "roles.read",
      "integrations.read",
      "settings.read",
      "settings.write",
      "notifications.read",
      "notifications.write",
    ],
  },
  {
    key: "director",
    label: "Directeur commercial",
    description: "Pilote le pipeline global, les objectifs et la performance multi-zone.",
    permissions: [
      "dashboard.read",
      "clients.read",
      "visits.read",
      "opportunities.read",
      "orders.read",
      "orders.approve",
      "products.read",
      "targets.read",
      "insights.read",
      "routes.read",
      "assistant.read",
      "roles.read",
      "integrations.read",
      "settings.read",
      "notifications.read",
      "notifications.write",
    ],
  },
  {
    key: "manager",
    label: "Manager commercial",
    description: "Anime l'equipe terrain, valide les remises et pilote le portefeuille regional.",
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
      "orders.approve",
      "products.read",
      "targets.read",
      "insights.read",
      "routes.read",
      "assistant.read",
      "roles.read",
      "integrations.read",
      "settings.read",
      "settings.write",
      "notifications.read",
      "notifications.write",
    ],
  },
  {
    key: "sales_rep",
    label: "Commercial terrain",
    description: "Gere ses clients, ses visites, ses opportunites et ses commandes.",
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
      "settings.write",
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
      "orders.read",
      "orders.approve",
      "targets.read",
      "insights.read",
      "assistant.read",
      "settings.read",
      "settings.write",
      "notifications.read",
      "notifications.write",
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

const POWER_ROLES = new Set<RoleKey>(["admin", "director"]);
const GLOBAL_READ_ROLES = new Set<RoleKey>([
  "admin",
  "director",
  "finance",
  "logistics",
  "support",
  "viewer",
]);

class JsonDatabase {
  private data: Database | null = null;
  private writeQueue = Promise.resolve();

  async init() {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    try {
      const raw = await fs.readFile(DB_PATH, "utf8");
      this.data = JSON.parse(raw) as Database;
      return;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") {
        this.data = appConfig.isProduction ? createProductionBootstrapDatabase() : createSeedDatabase();
        await this.persist();
        return;
      }
      if (error instanceof SyntaxError) {
        throw new Error(`Le fichier de base locale est invalide: ${DB_PATH}`);
      }
      throw error;
    }
  }

  snapshot() {
    if (!this.data) {
      throw new Error("Database not initialized");
    }
    return this.data;
  }

  async mutate(mutator: (db: Database) => void) {
    const db = this.snapshot();
    mutator(db);
    await this.persist();
  }

  private async persist() {
    const payload = JSON.stringify(this.snapshot(), null, 2);
    const tempPath = `${DB_PATH}.${crypto.randomUUID()}.tmp`;
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          await fs.writeFile(tempPath, payload, "utf8");
          await fs.rename(tempPath, DB_PATH);
        } finally {
          await fs.rm(tempPath, { force: true }).catch(() => undefined);
        }
      });
    await this.writeQueue;
  }
}

const store = new JsonDatabase();

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

function resolveOwner(db: Database, actor: DbUser, requestedOwnerUserId?: unknown) {
  if (!requestedOwnerUserId || !POWER_ROLES.has(actor.role)) {
    return actor;
  }
  const requested = findUserById(db, String(requestedOwnerUserId));
  return requested || actor;
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

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const db = store.snapshot();
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
  req.authUser = user;
  req.sessionPayload = buildSessionPayload(db, user);
  next();
}

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

async function startServer() {
  await store.init();

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

  app.use(express.json({ limit: appConfig.requestBodyLimit }));

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      environment: appConfig.nodeEnv,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get("/readyz", (_req, res) => {
    res.json({
      status: "ready",
      database: "ready",
      environment: appConfig.nodeEnv,
    });
  });

  app.get(`${API_PREFIX}/auth/session`, requireAuth, (req: AuthenticatedRequest, res) => {
    res.json(req.sessionPayload);
  });

  app.post(
    `${API_PREFIX}/auth/login`,
    loginRateLimiter,
    asyncRoute(async (req, res) => {
      const db = store.snapshot();
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

  app.get(
    `${API_PREFIX}/dashboard`,
    requireAuth,
    requirePermission("dashboard.read"),
    (req: AuthenticatedRequest, res) => {
      res.json(buildDashboard(store.snapshot(), req.authUser!));
    },
  );

  app.get(
    `${API_PREFIX}/clients`,
    requireAuth,
    requirePermission("clients.read"),
    (req: AuthenticatedRequest, res) => {
      const clients = getVisibleClients(store.snapshot(), req.authUser!).sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      res.json(clients);
    },
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
        db.clients[index] = {
          ...db.clients[index],
          name: req.body?.name ? String(req.body.name).trim() : db.clients[index].name,
          address: req.body?.address ? String(req.body.address).trim() : db.clients[index].address,
          city: req.body?.city ? String(req.body.city).trim() : db.clients[index].city,
          zone: req.body?.zone ? String(req.body.zone).trim() : db.clients[index].zone,
          contactName: req.body?.contactName ? String(req.body.contactName).trim() : db.clients[index].contactName,
          phone: req.body?.phone ? String(req.body.phone).trim() : db.clients[index].phone,
          email: req.body?.email ? String(req.body.email).trim() : db.clients[index].email,
          notes: req.body?.notes !== undefined ? String(req.body.notes).trim() : db.clients[index].notes,
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
    (req: AuthenticatedRequest, res) => {
      const visits = getVisibleVisits(store.snapshot(), req.authUser!).sort((left, right) => {
        const dateCompare = left.scheduledDate.localeCompare(right.scheduledDate);
        return dateCompare !== 0 ? dateCompare : left.startTime.localeCompare(right.startTime);
      });
      res.json(visits);
    },
  );

  app.get(
    `${API_PREFIX}/visits/:id`,
    requireAuth,
    requirePermission("visits.read"),
    (req: AuthenticatedRequest, res) => {
      const db = store.snapshot();
      const visit = db.visits.find((entry) => entry.id === req.params.id);
      if (!visit || !canSeeEntity(db, req.authUser!, visit)) {
        res.status(404).json({ error: "Visite introuvable" });
        return;
      }
      res.json(visit);
    },
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
    (req: AuthenticatedRequest, res) => {
      const opportunities = getVisibleOpportunities(store.snapshot(), req.authUser!).sort(
        (left, right) => right.amount - left.amount,
      );
      res.json(opportunities);
    },
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
    (req: AuthenticatedRequest, res) => {
      const orders = getVisibleOrders(store.snapshot(), req.authUser!).sort((left, right) =>
        right.date.localeCompare(left.date),
      );
      res.json(orders);
    },
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
        const amount = toNumber(req.body?.amount, 0);
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
          id: `ORD-${new Date().getFullYear()}-${String(db.orders.length + 1).padStart(4, "0")}`,
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
        };
        db.orders.unshift(created);
        addAuditLog(db, actor.id, "order.created", "order", created.id, {
          discount,
          approvalStatus,
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
      res.json(updated);
    }),
  );

  app.get(
    `${API_PREFIX}/products`,
    requireAuth,
    requirePermission("products.read"),
    (_req: AuthenticatedRequest, res) => {
      res.json(store.snapshot().products);
    },
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
    (req: AuthenticatedRequest, res) => {
      res.json(getVisibleTargets(store.snapshot(), req.authUser!));
    },
  );

  app.get(
    `${API_PREFIX}/manager/overview`,
    requireAuth,
    requirePermission("insights.read"),
    (req: AuthenticatedRequest, res) => {
      res.json(buildManagerOverview(store.snapshot(), req.authUser!));
    },
  );

  app.get(
    `${API_PREFIX}/notifications`,
    requireAuth,
    requirePermission("notifications.read"),
    (req: AuthenticatedRequest, res) => {
      const notifications = store
        .snapshot()
        .notifications.filter((item) => item.userId === req.authUser!.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      res.json(notifications);
    },
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

  app.get(
    `${API_PREFIX}/roles`,
    requireAuth,
    requirePermission("roles.read"),
    (req: AuthenticatedRequest, res) => {
      const db = store.snapshot();
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
    },
  );

  app.get(
    `${API_PREFIX}/integrations`,
    requireAuth,
    requirePermission("integrations.read"),
    (_req: AuthenticatedRequest, res) => {
      res.json(store.snapshot().integrations);
    },
  );

  app.get(
    `${API_PREFIX}/settings/profile`,
    requireAuth,
    requirePermission("settings.read"),
    (req: AuthenticatedRequest, res) => {
      res.json(buildUserSummary(store.snapshot(), req.authUser!));
    },
  );

  app.patch(
    `${API_PREFIX}/settings/profile`,
    requireAuth,
    requirePermission("settings.write"),
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

  app.get(
    `${API_PREFIX}/settings/preferences`,
    requireAuth,
    requirePermission("settings.read"),
    (req: AuthenticatedRequest, res) => {
      const db = store.snapshot();
      const preferences =
        db.preferences.find((entry) => entry.userId === req.authUser!.id) || defaultPreferences(req.authUser!.id);
      res.json(preferences);
    },
  );

  app.patch(
    `${API_PREFIX}/settings/preferences`,
    requireAuth,
    requirePermission("settings.write"),
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
      const db = store.snapshot();
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

  app.use(API_PREFIX, (req: AuthenticatedRequest, res) => {
    res.status(404).json(buildApiErrorPayload(req, "Route API introuvable"));
  });

  if (!appConfig.isProduction) {
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
  };
}

function createSeedDatabase(): Database {
  const company: Company = {
    id: "company-atlas",
    name: "Atlas Force Terrain",
    vertical: "Distribution commerciale terrain",
    currency: "MAD",
    timezone: appConfig.appTimeZone,
    country: "Morocco",
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

startServer().catch((error) => {
  logError("server.startup_failed", {
    error: serializeError(error),
  });
  process.exit(1);
});
