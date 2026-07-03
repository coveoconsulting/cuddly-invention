export type RoleKey =
  | "super_admin"
  | "admin"
  | "director"
  | "manager"
  | "sales_rep"
  | "finance"
  | "logistics"
  | "support"
  | "viewer";

export type PermissionKey =
  | "dashboard.read"
  | "clients.read"
  | "clients.write"
  | "clients.delete"
  | "visits.read"
  | "visits.write"
  | "opportunities.read"
  | "opportunities.write"
  | "orders.read"
  | "orders.write"
  | "orders.approve"
  | "orders.delete"
  | "products.read"
  | "products.write"
  | "products.delete"
  | "targets.read"
  | "targets.write"
  | "insights.read"
  | "routes.read"
  | "assistant.read"
  | "roles.read"
  | "roles.write"
  | "users.write"
  | "audit.read"
  | "integrations.read"
  | "settings.read"
  | "settings.write"
  | "notifications.read"
  | "notifications.write"
  | "prospects.delete"
  | "contracts.delete"
  | "cases.delete"
  | "campaigns.delete"
  | "calls.delete"
  | "activities.delete"
  | "approvals.write"
  // --- Phase 0 foundations: post-sale & ops permission contract ---
  | "pricing.read"
  | "pricing.write"
  | "discounts.approve"
  | "stock.read"
  | "stock.adjust"
  | "delivery.read"
  | "delivery.write"
  | "delivery.pod"
  | "payments.read"
  | "payments.write"
  | "collections.write"
  | "credit.override"
  | "invoices.read"
  | "invoices.write"
  | "compliance.read"
  | "routes.optimize"
  | "insights.benchmark";

export type ClientType = "prospect" | "client";
export type ClientStatus = "active" | "inactive" | "blocked";
export type Segment = "A" | "B" | "C";
export type RiskLevel = "low" | "medium" | "high";

export type VisitStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "missed"
  | "cancelled";

export type OrderStatus =
  | "draft"
  | "awaiting_approval"
  | "confirmed"
  | "delivered"
  | "cancelled";

export type ApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

export type SyncStatus = "not_synced" | "queued" | "synced";

export type PipelineStage =
  | "qualification"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export type PriorityLevel = "low" | "medium" | "high" | "critical";

export type NotificationLevel = "info" | "warning" | "critical";

export type SubscriptionPlan = "essentiel" | "professionnel" | "enterprise" | "sur_mesure";

export type PlanFeature =
  | "contacts"
  | "pipeline"
  | "visits"
  | "orders"
  | "quotes"
  | "whatsapp"
  | "click_to_call"
  | "assistant_ai"
  | "advanced_reports"
  | "automations"
  | "unlimited_integrations"
  // --- Phase 0 foundations: feature flags for the new modules ---
  | "pricing_engine"
  | "stock"
  | "delivery"
  | "payments_collections"
  | "compliance_ma"
  | "whatsapp_automation"
  | "voice_darija"
  | "pos_map"
  | "smart_routes"
  | "trust_score"
  | "manager_copilot"
  | "benchmark";

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  essentiel: "Essentiel",
  professionnel: "Professionnel",
  enterprise: "Enterprise",
  sur_mesure: "Sur mesure",
};

export const PLAN_FEATURES: Record<SubscriptionPlan, PlanFeature[]> = {
  essentiel: ["contacts", "pipeline", "visits", "orders", "click_to_call", "quotes", "whatsapp", "assistant_ai", "advanced_reports"],
  professionnel: ["contacts", "pipeline", "visits", "orders", "quotes", "whatsapp", "click_to_call"],
  enterprise: [
    "contacts", "pipeline", "visits", "orders", "quotes", "whatsapp", "click_to_call",
    "assistant_ai", "advanced_reports", "automations", "unlimited_integrations",
    "pricing_engine", "stock", "delivery", "payments_collections", "compliance_ma",
    "whatsapp_automation", "voice_darija", "pos_map", "smart_routes",
    "trust_score", "manager_copilot", "benchmark",
  ],
  sur_mesure: [
    "contacts", "pipeline", "visits", "orders", "quotes", "whatsapp", "click_to_call",
    "assistant_ai", "advanced_reports", "automations", "unlimited_integrations",
    "pricing_engine", "stock", "delivery", "payments_collections", "compliance_ma",
    "whatsapp_automation", "voice_darija", "pos_map", "smart_routes",
    "trust_score", "manager_copilot", "benchmark",
  ],
};

export function planHasFeature(plan: SubscriptionPlan | undefined, feature: PlanFeature): boolean {
  if (!plan) return false;
  return PLAN_FEATURES[plan].includes(feature);
}

export interface Company {
  id: string;
  name: string;
  vertical: string;
  currency: string;
  timezone: string;
  country: string;
  plan: SubscriptionPlan;
  planSeats: number;
  planStartedAt: string | null;
  planNotes: string;
}

export interface Territory {
  id: string;
  label: string;
  region: string;
}

export interface RoleDefinition {
  key: RoleKey;
  label: string;
  description: string;
  permissions: PermissionKey[];
}

export interface TeamSummary {
  id: string;
  name: string;
  managerUserId: string;
}

export interface UserSummary {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  role: RoleKey;
  roleLabel: string;
  title: string;
  teamId?: string;
  teamName?: string;
  territoryIds: string[];
  territoryLabels: string[];
  active: boolean;
  avatarUrl?: string | null;
}

export interface SessionPayload {
  company: Company;
  user: UserSummary;
  permissions: PermissionKey[];
  unreadNotifications: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Client {
  id: string;
  name: string;
  type: ClientType;
  status: ClientStatus;
  segment: Segment;
  address: string;
  city: string;
  zone: string;
  territoryId: string;
  territoryLabel: string;
  ownerUserId: string;
  ownerName: string;
  contactName: string;
  phone: string;
  email: string;
  potentialScore: number;
  financialRisk: RiskLevel;
  lastVisit?: string | null;
  nextVisit?: string | null;
  notes?: string;
  // --- Phase 0 foundations: Morocco legal identifiers (compliance_ma) ---
  // Optional so existing records/seeds remain valid; surfaced on the account file.
  ice?: string; // Identifiant Commun de l'Entreprise
  taxId?: string; // IF — Identifiant Fiscal
  rc?: string; // Registre du Commerce
  fiscalAddress?: string;
  fiscalCity?: string;
}

export interface Visit {
  id: string;
  clientId?: string;
  clientName: string;
  address: string;
  city: string;
  objective: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: VisitStatus;
  ownerUserId: string;
  ownerName: string;
  territoryId: string;
  territoryLabel: string;
  report?: string;
  nextAction?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkInLocation?: GeoPoint | null;
  checkOutLocation?: GeoPoint | null;
}

export interface Opportunity {
  id: string;
  clientId?: string;
  clientName: string;
  amount: number;
  probability: number;
  stage: PipelineStage;
  expectedClose: string;
  priority: PriorityLevel;
  nextAction: string;
  ownerUserId: string;
  ownerName: string;
  territoryId: string;
  territoryLabel: string;
  lossReason?: string;
  // Last update — used to flag deals that are stalling in a stage.
  updatedAt?: string;
}

export interface Order {
  id: string;
  clientId?: string;
  clientName: string;
  ownerUserId: string;
  ownerName: string;
  territoryId: string;
  territoryLabel: string;
  date: string;
  amount: number;
  discount: number;
  status: OrderStatus;
  approvalStatus: ApprovalStatus;
  syncStatus: SyncStatus;
  notes?: string;
  lines?: OrderLine[];
}

export interface OrderLine {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
}

export interface Product {
  id: string;
  name: string;
  ref: string;
  category: string;
  price: number;
  stock: number;
  status: "active" | "inactive";
  image?: string;
  description: string;
}

export interface TargetProgress {
  id: string;
  ownerUserId: string;
  ownerName: string;
  periodLabel: string;
  revenueGoal: number;
  visitsGoal: number;
  opportunitiesGoal: number;
  ordersGoal: number;
  revenueActual: number;
  visitsActual: number;
  opportunitiesActual: number;
  ordersActual: number;
}

export interface TeamMemberPerformance {
  userId: string;
  name: string;
  roleLabel: string;
  visitsCompleted: number;
  ordersAmount: number;
  pipelineAmount: number;
}

export interface ManagerOverview {
  teamMembers: TeamMemberPerformance[];
  pendingApprovals: Order[];
  blockedOpportunities: Opportunity[];
  territoryCoverage: Array<{
    territoryLabel: string;
    clients: number;
    visits: number;
    revenue: number;
  }>;
}

export interface DashboardAlert {
  id: string;
  level: NotificationLevel;
  title: string;
  description: string;
  link?: string;
}

export interface DashboardSnapshot {
  company: Company;
  me: UserSummary;
  kpis: {
    totalClients: number;
    activeOpportunities: number;
    pipelineAmount: number;
    monthlyOrdersAmount: number;
    todayVisits: number;
    completedVisits: number;
    pendingApprovals: number;
    unreadNotifications: number;
  };
  todayVisits: Visit[];
  recentOrders: Order[];
  focusOpportunities: Opportunity[];
  lowStockProducts: Product[];
  alerts: DashboardAlert[];
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  level: NotificationLevel;
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface IntegrationItem {
  id: string;
  name: string;
  provider: string;
  scope: string;
  status: "connected" | "configured" | "attention";
  lastSyncAt?: string | null;
  description: string;
  endpointUrl?: string;
  lastError?: string;
}

export interface UserPreferences {
  userId: string;
  emailNotifications: boolean;
  weeklyDigest: boolean;
  autoSync: boolean;
}

export type ProspectStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "quoted"
  | "negotiation"
  | "converted"
  | "lost";

// --- Phase 0 foundations: unified commercial lifecycle (the tunnel spine) ---
// Derived (never stored): computed from the dominant entity state so the dashboard,
// map, routes, copilot and reminders all speak the same language. See src/lib/lifecycle.ts.
export type LifecycleStage =
  | "prospect" // lead capté, pas encore contacté
  | "contacted" // premier contact établi
  | "qualified" // besoin qualifié
  | "opportunity" // opportunité ouverte au pipeline
  | "quoted" // devis envoyé
  | "signed" // devis signé
  | "client" // converti en compte client
  | "order" // commande passée
  | "delivery" // en cours de livraison
  | "payment" // paiement / recouvrement en cours
  | "recurring" // client actif, visites récurrentes
  | "lost"; // perdu (branche terminale)

// Which sales force created/owns the lead.
export type ProspectTeam = "call_center" | "field";

// Structured channel the lead came in through.
export type ProspectLeadSource = "societe" | "appel" | "rdv" | "mail" | "rs";

// Estimated potential of a field-prospected outlet (terrain métier).
export type ProspectPotential = "low" | "medium" | "high";

// Single source of truth for the whitelists — reused by the server validation and
// the intake form so the two never drift apart.
export const PROSPECT_LEAD_SOURCES: ProspectLeadSource[] = ["societe", "appel", "rdv", "mail", "rs"];
export const PROSPECT_POTENTIALS: ProspectPotential[] = ["low", "medium", "high"];

// Lead sources offered for field prospecting.
export const FIELD_LEAD_SOURCES: ProspectLeadSource[] = ["societe", "rdv", "rs"];

/** Field-prospecting capture (this product is the terrain app). */
export interface ProspectFieldIntake {
  address: string;
  zone: string;
  establishmentType: string;
  potential: ProspectPotential | null;
  competitor: string;
  nextVisitAt: string | null;
}

export interface Prospect extends ProspectFieldIntake {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  source: string;
  team: ProspectTeam;
  leadSource: ProspectLeadSource;
  need: string;
  solutionFit: string;
  status: ProspectStatus;
  score: number;
  ownerUserId: string;
  ownerName: string;
  territoryId: string;
  territoryLabel: string;
  notes: string;
  convertedClientId?: string | null;
  convertedAt?: string | null;
  createdAt: string;
}

export type ActivityType =
  | "call" | "email" | "note" | "task" | "meeting"
  // --- Phase 0 foundations: post-sale timeline event types ---
  | "quote" | "order" | "delivery" | "payment"
  | "collection" | "stock" | "return" | "visit_report";

export interface Activity {
  id: string;
  type: ActivityType;
  subject: string;
  content: string;
  ownerUserId: string;
  ownerName: string;
  clientId?: string | null;
  opportunityId?: string | null;
  prospectId?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  blobUrl: string;
  sizeBytes: number;
  contentType: string;
  uploadedByUserId: string;
  uploadedByName: string;
  clientId?: string | null;
  orderId?: string | null;
  opportunityId?: string | null;
  signedAt?: string | null;
  signedByName?: string | null;
  createdAt: string;
}

export interface RolesResponse {
  roles: RoleDefinition[];
  users: UserSummary[];
  teams: TeamSummary[];
  currentPermissions: PermissionKey[];
}

export interface AssistantResponse {
  text: string;
}

export interface ApiErrorPayload {
  error: string;
  details?: string;
}

export type WhatsAppDirection = "inbound" | "outbound";
export type WhatsAppStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "received";
export type WhatsAppMessageType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "sticker"
  | "template"
  | "location"
  | "reaction"
  | "system";

export interface WhatsAppContact {
  id: string;
  phone: string;
  displayName: string;
  profileName: string;
  clientId: string | null;
  prospectId: string | null;
  linkedName: string | null;
  assignedUserId: string | null;
  assignedName: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  unreadCount: number;
  lastBody: string;
  lastType: WhatsAppMessageType | null;
}

export interface WhatsAppAgent {
  id: string;
  name: string;
  initials: string;
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  category: string;
  status: string;
  body: string;
}

export interface WhatsAppMessage {
  id: string;
  contactId: string;
  waMessageId: string | null;
  direction: WhatsAppDirection;
  type: WhatsAppMessageType;
  body: string;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaFilename: string | null;
  templateName: string | null;
  status: WhatsAppStatus;
  errorMessage: string | null;
  sentByUserId: string | null;
  createdAt: string;
}

export interface WhatsAppSettings {
  phoneNumberId: string;
  businessAccountId: string;
  displayPhoneNumber: string;
  verifyToken: string;
  defaultLanguage: string;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  webhookUrl: string;
}

export type QuoteStatus = "draft" | "sent" | "signed" | "refused" | "expired" | "cancelled";

export interface QuoteLine {
  id: string;
  position: number;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
}

export interface QuoteAttachment {
  id: string;
  name: string;
  blobUrl: string;
  sizeBytes: number;
  contentType: string;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  visibleToClient: boolean;
  createdAt: string;
}

export interface Quote {
  id: string;
  number: string;
  clientId: string | null;
  prospectId: string | null;
  opportunityId: string | null;
  ownerUserId: string;
  ownerName: string;
  territoryId: string;
  status: QuoteStatus;
  title: string;
  clientName: string;
  clientContact: string;
  clientEmail: string;
  clientAddress: string;
  currency: string;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  notes: string;
  terms: string;
  paymentTerms: string;
  issuedAt: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  signedAt: string | null;
  signedByName: string | null;
  signedByEmail: string | null;
  signatureDataUrl: string | null;
  signatureUrl: string | null;
  refusedReason: string | null;
  orderId: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: QuoteLine[];
  attachments: QuoteAttachment[];
}

export type CommentEntityType =
  | "client" | "prospect" | "opportunity" | "quote" | "order" | "visit";

export interface CommentItem {
  id: string;
  entityType: CommentEntityType;
  entityId: string;
  authorUserId: string;
  authorName: string;
  authorInitials: string;
  body: string;
  pinned: boolean;
  createdAt: string;
}

export interface CrmSettings {
  quoteNumberPrefix: string;
  quoteNumberCounter: number;
  quoteValidityDays: number;
  defaultTaxRate: number;
  defaultPaymentTerms: string;
  defaultQuoteTerms: string;
  legalMentions: string;
  quoteEmailSubject: string;
  quoteEmailBody: string;
}

export interface ClientDetailPayload {
  client: Client & { ownerName: string; territoryLabel: string };
  visits: Array<{ id: string; scheduledDate: string; status: VisitStatus; objective: string }>;
  opportunities: Array<{ id: string; stage: PipelineStage; amount: number; expectedClose: string; priority: PriorityLevel }>;
  orders: Array<{ id: string; date: string; amount: number; status: OrderStatus; approvalStatus: ApprovalStatus }>;
  documents: Array<{ id: string; name: string; blobUrl: string; sizeBytes: number; createdAt: string; signedAt: string | null }>;
  quotes: Array<{ id: string; number: string; status: QuoteStatus; total: number; currency: string; issuedAt: string | null; signedAt: string | null }>;
}

export interface ProspectDetailPayload {
  prospect: Prospect;
  activities: Array<{ id: string; type: ActivityType; subject: string; content: string; dueDate: string | null; completedAt: string | null; createdAt: string }>;
  quotes: Array<{ id: string; number: string; status: QuoteStatus; total: number; currency: string; issuedAt: string | null; signedAt: string | null }>;
}

export type ContractStatus = "draft" | "active" | "renewal_due" | "expired" | "cancelled";
export type CaseStatus = "open" | "pending" | "resolved" | "closed";
export type CampaignStatus = "draft" | "scheduled" | "running" | "completed" | "paused";
export type CallStatus = "planned" | "completed" | "missed";

// Standardized click-to-call outcomes (stored in SalesCallItem.outcome).
// Kept short (the métier recommends 5–7 dispositions that cover ~90% of calls).
export type CallDisposition =
  | "answered" // joint, échange réalisé
  | "no_answer" // ne répond pas (NRP)
  | "voicemail" // répondeur / message laissé
  | "gatekeeper" // barrage secrétaire
  | "not_interested" // pas intéressé
  | "callback" // à rappeler (créneau convenu)
  | "appointment"; // RDV obtenu

export const CALL_DISPOSITIONS: CallDisposition[] = [
  "answered", "no_answer", "voicemail", "gatekeeper", "not_interested", "callback", "appointment",
];

// Dispositions that mean "the call did not connect" → logged as a missed call.
export const MISSED_CALL_DISPOSITIONS: CallDisposition[] = ["no_answer", "voicemail", "gatekeeper"];

export interface ContractItem {
  id: string;
  number: string;
  clientId: string | null;
  clientName: string;
  ownerUserId: string;
  ownerName: string;
  status: ContractStatus;
  startDate: string;
  endDate: string;
  renewalDate: string | null;
  amount: number;
  currency: string;
  notes: string;
  createdAt: string;
}

export interface CaseItem {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string;
  ownerUserId: string;
  ownerName: string;
  status: CaseStatus;
  priority: PriorityLevel;
  category: string;
  description: string;
  resolution: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignItem {
  id: string;
  name: string;
  channel: "email" | "sms" | "whatsapp" | "phone";
  status: CampaignStatus;
  audience: string;
  ownerUserId: string;
  ownerName: string;
  scheduledAt: string | null;
  sentCount: number;
  responseCount: number;
  notes: string;
  createdAt: string;
}

export interface SalesCallItem {
  id: string;
  subject: string;
  phone: string;
  clientId: string | null;
  clientName: string;
  ownerUserId: string;
  ownerName: string;
  status: CallStatus;
  scheduledAt: string;
  durationSeconds: number;
  outcome: string;
  notes: string;
  createdAt: string;
}
