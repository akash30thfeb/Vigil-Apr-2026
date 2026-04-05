import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";

type Item = {
  id: string;
  name: string;
  type: string;
  department: string;
  key_date: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  status: string;
  needs_review: boolean;
  vendor: string | null;
};

const DEPT_STYLE: Record<string, { background: string; borderColor: string }> = {
  it:         { background: "rgba(56, 189, 248, 0.06)",  borderColor: "rgba(56, 189, 248, 0.12)" },
  contracts:  { background: "rgba(167, 139, 250, 0.06)", borderColor: "rgba(167, 139, 250, 0.12)" },
  hr:         { background: "rgba(45, 212, 191, 0.06)",  borderColor: "rgba(45, 212, 191, 0.12)" },
  operations: { background: "rgba(251, 113, 133, 0.06)", borderColor: "rgba(251, 113, 133, 0.12)" },
};

function getStatusColor(item: Item) {
  const today = new Date();
  const checkDate = item.key_date ?? item.renewal_date ?? item.expiry_date;
  if (!checkDate) return "green";
  const days = Math.floor(
    (new Date(checkDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days < 0) return "red";
  if (days <= 7) return "red";
  if (days <= 60) return "amber";
  return "green";
}

function StatusDot({ color }: { color: string }) {
  const cls =
    color === "red"
      ? "bg-red-500"
      : color === "amber"
      ? "bg-yellow-400"
      : "bg-emerald-400";
  return <span className={`w-2 h-2 rounded-full inline-block ${cls}`} />;
}

function daysLabel(date: string | null) {
  if (!date) return null;
  const days = Math.floor(
    (new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  return `${days}d remaining`;
}

export default async function DashboardPage() {
  const { orgId } = await auth();

  const { data: items } = await supabaseAdmin
    .from("items")
    .select("*")
    .eq("org_id", orgId ?? "demo")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const allItems: Item[] = items ?? [];

  const departments = [
    { key: "it", label: "IT Assets", href: "/dashboard/it" },
    { key: "contracts", label: "Contracts", href: "/dashboard/contracts" },
    { key: "hr", label: "HR", href: "/dashboard/hr" },
  ];

  const urgent = allItems.filter((i) => {
    const color = getStatusColor(i);
    return color === "red" || color === "amber";
  });

  const urgentIds = new Set(urgent.map((i) => i.id));
  const healthy = allItems.filter((i) => !urgentIds.has(i.id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Overview</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {allItems.length} items tracked across {departments.length} departments
        </p>
      </div>

      {/* Department cards */}
      <div className="grid grid-cols-3 gap-4">
        {departments.map((dept) => {
          const deptItems = allItems.filter((i) => i.department === dept.key);
          const redCount = deptItems.filter((i) => getStatusColor(i) === "red").length;
          const amberCount = deptItems.filter((i) => getStatusColor(i) === "amber").length;

          return (
            <Link
              key={dept.key}
              href={dept.href}
              className="rounded-2xl border border-white/5 bg-white/3 p-5 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-zinc-300">{dept.label}</span>
                <span className="text-xs text-zinc-500">{deptItems.length} items</span>
              </div>
              <div className="flex gap-3">
                {redCount > 0 && (
                  <span className="text-xs status-red rounded-full px-2 py-0.5">
                    {redCount} critical
                  </span>
                )}
                {amberCount > 0 && (
                  <span className="text-xs status-amber rounded-full px-2 py-0.5">
                    {amberCount} warning
                  </span>
                )}
                {redCount === 0 && amberCount === 0 && deptItems.length > 0 && (
                  <span className="text-xs status-green rounded-full px-2 py-0.5">
                    All clear
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Urgent items */}
      {urgent.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Needs attention
          </h2>
          <div className="space-y-2">
            {urgent.map((item) => {
              const color = getStatusColor(item);
              const date = item.key_date ?? item.renewal_date ?? item.expiry_date;
              const deptStyle = DEPT_STYLE[item.department] ?? { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.05)" };
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border px-4 py-3"
                  style={deptStyle}
                >
                  <div className="flex items-center gap-3">
                    <StatusDot color={color} />
                    <div>
                      <span className="text-sm text-white">{item.name}</span>
                      {item.vendor && (
                        <span className="text-xs text-zinc-500 ml-2">{item.vendor}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-xs ${
                      color === "red" ? "text-red-400" : "text-yellow-400"
                    }`}
                  >
                    {daysLabel(date)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All items */}
      <div>
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          All items
        </h2>
        {allItems.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <p className="text-lg mb-2">Nothing tracked yet.</p>
            <Link href="/" className="text-sm text-white hover:underline">
              Tell Vigil about something →
            </Link>
          </div>
        ) : healthy.length === 0 ? null : (
          <div className="space-y-2">
            {healthy.map((item) => {
              const color = getStatusColor(item);
              const date = item.key_date ?? item.renewal_date ?? item.expiry_date;
              const deptStyle = DEPT_STYLE[item.department] ?? { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.05)" };
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border px-4 py-3"
                  style={deptStyle}
                >
                  <div className="flex items-center gap-3">
                    <StatusDot color={color} />
                    <div>
                      <span className="text-sm text-white">{item.name}</span>
                      <span className="text-xs text-zinc-600 ml-2 capitalize">
                        {item.department} · {item.type}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500">{daysLabel(date)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
