import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import type { Order, Opportunity, RolesResponse, UserSummary, Visit } from "../types";
import { asArray, getJson } from "../lib/api";
import { Badge } from "../components/ui";
import { formatCurrency } from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";

type MemberStats = {
  user: UserSummary;
  visitsCompleted: number;
  visitsTotal: number;
  ordersAmount: number;
  pipelineAmount: number;
  opportunitiesOpen: number;
};

export function TeamView() {
  const { company } = useWorkspace();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<string>("all");

  const load = async () => {
    setIsLoading(true);
    try {
      const [rolesPayload, visitsPayload, ordersPayload, oppsPayload] = await Promise.all([
        getJson<unknown>("/api/v1/roles"),
        getJson<unknown>("/api/v1/visits"),
        getJson<unknown>("/api/v1/orders"),
        getJson<unknown>("/api/v1/opportunities"),
      ]);
      const rolesData = rolesPayload as Partial<RolesResponse>;
      setUsers(asArray<UserSummary>(rolesData?.users));
      setVisits(asArray<Visit>(visitsPayload));
      setOrders(asArray<Order>(ordersPayload));
      setOpportunities(asArray<Opportunity>(oppsPayload));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const members: MemberStats[] = useMemo(() => {
    return users
      .filter((user) => user.active)
      .filter((user) => filterRole === "all" || user.role === filterRole)
      .map((user) => {
        const userVisits = visits.filter((visit) => visit.ownerUserId === user.id);
        const userOrders = orders.filter((order) => order.ownerUserId === user.id && order.status !== "cancelled");
        const userOpps = opportunities.filter((opp) => opp.ownerUserId === user.id);
        return {
          user,
          visitsCompleted: userVisits.filter((visit) => visit.status === "completed").length,
          visitsTotal: userVisits.length,
          ordersAmount: userOrders.reduce((total, order) => total + order.amount, 0),
          pipelineAmount: userOpps
            .filter((opp) => opp.stage !== "won" && opp.stage !== "lost")
            .reduce((total, opp) => total + opp.amount, 0),
          opportunitiesOpen: userOpps.filter((opp) => opp.stage !== "won" && opp.stage !== "lost").length,
        };
      })
      .sort((left, right) => right.ordersAmount - left.ordersAmount);
  }, [users, visits, orders, opportunities, filterRole]);

  const distinctRoles = useMemo(() => {
    const set = new Set(users.map((user) => user.role));
    return Array.from(set);
  }, [users]);

  const currency = company?.currency || "MAD";

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div>
        <p className="text-sm text-secondary">Pilotage</p>
        <h1 className="mt-1 text-3xl font-black text-on-surface">Équipe</h1>
        <p className="mt-1 text-sm text-secondary">Performance par utilisateur sur le périmètre visible.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilterRole("all")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            filterRole === "all" ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-white text-secondary"
          }`}
        >
          Tous ({users.filter((user) => user.active).length})
        </button>
        {distinctRoles.map((role) => {
          const count = users.filter((user) => user.active && user.role === role).length;
          return (
            <button
              key={role}
              type="button"
              onClick={() => setFilterRole(role)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                filterRole === role ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-white text-secondary"
              }`}
            >
              {role} ({count})
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">
          Chargement des membres...
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center text-secondary">
          <Users className="h-8 w-8" />
          <p className="text-sm">Aucun membre visible.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-sm">
            <thead className="border-b border-outline-variant bg-surface">
              <tr className="text-left text-xs uppercase tracking-wider text-secondary">
                <th className="px-4 py-3">Membre</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Visites</th>
                <th className="px-4 py-3">Pipeline</th>
                <th className="px-4 py-3 text-right">CA</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.user.id} className="border-b border-outline-variant/40 last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                        {member.user.initials}
                      </div>
                      <div>
                        <p className="font-semibold text-on-surface">{member.user.name}</p>
                        <p className="text-[11px] text-secondary">{member.user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="neutral">{member.user.roleLabel}</Badge>
                    {member.user.teamName ? (
                      <p className="mt-1 text-[11px] text-secondary">{member.user.teamName}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-on-surface">
                      {member.visitsCompleted}/{member.visitsTotal}
                    </p>
                    <p className="text-[11px] text-secondary">terminées</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-on-surface">
                      {formatCurrency(member.pipelineAmount, currency)}
                    </p>
                    <p className="text-[11px] text-secondary">{member.opportunitiesOpen} ouvertes</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-bold text-on-surface">
                      {formatCurrency(member.ordersAmount, currency)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
