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
  | "visits.read"
  | "visits.write"
  | "opportunities.read"
  | "opportunities.write"
  | "orders.read"
  | "orders.write"
  | "orders.approve"
  | "products.read"
  | "products.write"
  | "targets.read"
  | "insights.read"
  | "routes.read"
  | "assistant.read"
  | "roles.read"
  | "integrations.read"
  | "settings.read"
  | "settings.write"
  | "notifications.read"
  | "notifications.write";

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

export interface Company {
  id: string;
  name: string;
  vertical: string;
  currency: string;
  timezone: string;
  country: string;
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
}

export interface UserPreferences {
  userId: string;
  emailNotifications: boolean;
  weeklyDigest: boolean;
  autoSync: boolean;
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
