"use client";

import { useState, useRef, useEffect } from "react";

type Reminder = {
  id: string;
  type: string;
  message: string;
  fire_at: string | null;
  status: string;
  sent_at: string | null;
};

type Item = {
  id: string;
  name: string;
  type: string;
  department: string;
  status: string;
  key_date: string | null;
  // Legacy fields (still used by contracts/assets until migrated)
  purchase_price: number | null;
  currency: string | null;
  billing_cycle: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  vendor: string | null;
  assigned_to_name: string | null;
  needs_review: boolean;
  confidence: string | null;
  created_at: string;
  // Joined employee data (optional)
  employees?: {
    employee_name: string;
    role: string;
    employee_department: string | null;
    employment_type: string;
    employment_status: string;
    joining_date: string;
    probation_end: string | null;
    last_working_day: string | null;
    manager_name: string | null;
  }[];
  // Joined contract data (optional)
  contracts?: {
    contract_name: string;
    contract_type: string;
    vendor: string;
    annual_value: number | null;
    currency: string | null;
    billing_cycle: string | null;
    auto_renews: boolean;
    signatory: string | null;
  }[];
  // Joined asset data (optional)
  assets?: {
    asset_name: string;
    vendor: string;
    purchase_price: number | null;
    currency: string | null;
    assigned_to: string | null;
    model: string | null;
    condition: string | null;
    warranty_expiry: string | null;
  }[];
  // Joined reminders (optional)
  reminders?: Reminder[];
};

function getStatusColor(item: Item) {
  const today = new Date();
  // Use key_date first, fall back to legacy fields during transition
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

function daysLabel(date: string | null) {
  if (!date) return null;
  const days = Math.floor(
    (new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `${days}d remaining`;
}

function formatPrice(price: number | null, currency: string | null) {
  if (!price) return null;
  const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : (currency ?? "");
  return `${sym}${price.toLocaleString()}`;
}

function formatEmploymentType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function ReminderPopover({ reminders, isNew }: { reminders: Reminder[]; isNew?: boolean }) {
  const [open, setOpen] = useState(false);
  const [ringing, setRinging] = useState(false);
  const prevSnapshot = useRef(JSON.stringify(reminders.map((r) => r.id + r.status).sort()));
  const ref = useRef<HTMLDivElement>(null);

  // Detect any change to reminders (count, status updates, new ones)
  useEffect(() => {
    const snapshot = JSON.stringify(reminders.map((r) => r.id + r.status).sort());
    if (snapshot !== prevSnapshot.current) {
      prevSnapshot.current = snapshot;
      setRinging(true);
      const t = setTimeout(() => setRinging(false), 5000);
      return () => clearTimeout(t);
    }
  }, [reminders]);

  // Also ring on initial mount if isNew
  useEffect(() => {
    if (isNew) {
      setRinging(true);
      const t = setTimeout(() => setRinging(false), 5000);
      return () => clearTimeout(t);
    }
  }, [isNew]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (reminders.length === 0) return null;

  // Find max days for bar scaling
  const daysArr = reminders.map((r) => daysUntil(r.fire_at)).filter((d): d is number => d !== null);
  const maxDays = Math.max(...daysArr, 1);

  return (
    <div ref={ref} className="relative">
      <style>{`
        @keyframes bellRing {
          0%, 100% { transform: rotate(0deg) scale(1); }
          5% { transform: rotate(15deg) scale(1.3); }
          10% { transform: rotate(-15deg) scale(1.3); }
          15% { transform: rotate(12deg) scale(1.25); }
          20% { transform: rotate(-12deg) scale(1.25); }
          25% { transform: rotate(8deg) scale(1.2); }
          30% { transform: rotate(-8deg) scale(1.2); }
          35% { transform: rotate(4deg) scale(1.1); }
          40% { transform: rotate(-4deg) scale(1.1); }
          45% { transform: rotate(0deg) scale(1.05); }
          50%, 100% { transform: rotate(0deg) scale(1); }
        }
      `}</style>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="relative p-1 rounded-md transition-colors hover:bg-white/5"
        title="Show associated alerts"
        style={ringing ? { animation: "bellRing 1.5s ease-in-out infinite" } : undefined}
      >
        <svg className={`w-4 h-4 ${ringing ? "text-orange-400" : "text-zinc-500"} transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {(ringing || isNew) && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-400" />
        )}
        <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[8px] flex items-center justify-center font-bold ${ringing ? "bg-orange-500 text-white" : "bg-zinc-700 text-zinc-300"}`}>
          {reminders.length}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-8 z-50 w-72 rounded-xl border border-white/10 bg-[#111118] shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-white/5 bg-white/3">
            <span className="text-xs font-medium text-zinc-400">{reminders.length} alert{reminders.length > 1 ? "s" : ""}</span>
          </div>
          <div className="px-3 py-2 space-y-2 max-h-48 overflow-y-auto">
            {reminders.map((r) => {
              const days = daysUntil(r.fire_at);
              const barWidth = days !== null && days >= 0 ? Math.max(4, (days / maxDays) * 100) : 0;
              const isSent = r.status === "sent";
              const isPast = days !== null && days < 0;

              return (
                <div key={r.id} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs truncate ${isSent ? "text-zinc-600 line-through" : "text-zinc-300"}`}>
                      {r.message}
                    </span>
                    <span className={`text-[10px] flex-shrink-0 ${isPast ? "text-red-400" : isSent ? "text-zinc-600" : "text-zinc-500"}`}>
                      {isSent ? "Sent" : days !== null ? (isPast ? `${Math.abs(days)}d ago` : `${days}d`) : "—"}
                    </span>
                  </div>
                  {!isSent && days !== null && days >= 0 && (
                    <div className="h-1 rounded-full bg-white/5">
                      <div
                        className={`h-1 rounded-full ${days <= 7 ? "bg-red-500" : days <= 30 ? "bg-yellow-400" : "bg-emerald-500"}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ItemCard({ item, highlightReminders }: { item: Item; highlightReminders?: boolean }) {
  const checkDate = item.key_date ?? item.renewal_date ?? item.expiry_date;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const color = mounted ? getStatusColor(item) : "green";
  const label = mounted ? daysLabel(checkDate) : null;
  const emp = item.employees?.[0];
  const con = item.contracts?.[0];
  const ast = item.assets?.[0];
  const reminders = item.reminders ?? [];

  const dotCls =
    color === "red"
      ? "bg-red-500"
      : color === "amber"
      ? "bg-yellow-400"
      : "bg-emerald-500";

  const badgeCls =
    color === "red"
      ? "status-red"
      : color === "amber"
      ? "status-amber"
      : "status-green";

  return (
    <div className="rounded-xl border border-white/5 bg-white/3 px-4 py-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotCls}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">
              {emp ? emp.employee_name : con ? con.contract_name : ast ? ast.asset_name : item.name}
            </span>
            {emp && emp.employment_status !== "active" && (
              <span className="text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full px-2 py-0.5 capitalize">
                {emp.employment_status.replace("_", " ")}
              </span>
            )}
            {con?.auto_renews && (
              <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5">
                Auto-renews
              </span>
            )}
            {item.needs_review && (
              <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full px-2 py-0.5">
                Needs review
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {emp ? (
              <>
                <span className="text-xs text-zinc-500">{emp.role}</span>
                {emp.employee_department && (
                  <span className="text-xs text-zinc-600">· {emp.employee_department}</span>
                )}
                <span className="text-xs text-zinc-600">· {formatEmploymentType(emp.employment_type)}</span>
                {emp.manager_name && (
                  <span className="text-xs text-zinc-600">· Manager: {emp.manager_name}</span>
                )}
              </>
            ) : con ? (
              <>
                <span className="text-xs text-zinc-500">{con.vendor}</span>
                {con.billing_cycle && (
                  <span className="text-xs text-zinc-600">· {con.billing_cycle.replace("_", " ")}</span>
                )}
                {con.contract_type && con.contract_type !== "contract" && (
                  <span className="text-xs text-zinc-600 capitalize">· {con.contract_type}</span>
                )}
                {con.signatory && (
                  <span className="text-xs text-zinc-600">· Signed: {con.signatory}</span>
                )}
              </>
            ) : ast ? (
              <>
                <span className="text-xs text-zinc-500">{ast.vendor}</span>
                {ast.model && (
                  <span className="text-xs text-zinc-600">· {ast.model}</span>
                )}
                {ast.assigned_to && (
                  <span className="text-xs text-zinc-600">→ {ast.assigned_to}</span>
                )}
                {ast.condition && (
                  <span className="text-xs text-zinc-600 capitalize">· {ast.condition}</span>
                )}
              </>
            ) : (
              <>
                {item.vendor && <span className="text-xs text-zinc-500">{item.vendor}</span>}
                {item.assigned_to_name && (
                  <span className="text-xs text-zinc-500">→ {item.assigned_to_name}</span>
                )}
                {item.billing_cycle && (
                  <span className="text-xs text-zinc-600 capitalize">{item.billing_cycle.replace("_", " ")}</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {!emp && formatPrice(con?.annual_value ?? ast?.purchase_price ?? item.purchase_price, con?.currency ?? ast?.currency ?? item.currency) && (
          <span className="text-sm text-zinc-400">
            {formatPrice(con?.annual_value ?? ast?.purchase_price ?? item.purchase_price, con?.currency ?? ast?.currency ?? item.currency)}
          </span>
        )}
        {label && (
          <span className={`text-xs rounded-full px-2.5 py-1 ${badgeCls}`}>{label}</span>
        )}
        {reminders.length > 0 && (
          <ReminderPopover reminders={reminders} isNew={highlightReminders} />
        )}
      </div>
    </div>
  );
}
