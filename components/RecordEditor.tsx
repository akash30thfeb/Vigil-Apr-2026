"use client";

import { useState } from "react";

// ============================================================
// Field definitions per type
// ============================================================

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "date" | "number" | "select" | "boolean";
  options?: string[];
  readonly?: boolean;
};

const EMPLOYEE_FIELDS: FieldDef[] = [
  { key: "employee_name", label: "Name", type: "text" },
  { key: "role", label: "Role", type: "text" },
  { key: "department", label: "Department", type: "select", options: ["IT", "People Functions", "Sales", "Engineering", "Data Analytics", "Data Science"] },
  { key: "employment_type", label: "Employment Type", type: "select", options: ["full_time", "external_consultant", "intern"] },
  { key: "employment_status", label: "Status", type: "select", options: ["active", "notice_period", "exited"] },
  { key: "joining_date", label: "Joining Date", type: "date" },
  { key: "probation_end", label: "Probation End", type: "date" },
  { key: "last_working_day", label: "Last Working Day", type: "date" },
  { key: "manager_name", label: "Manager", type: "text" },
  { key: "notes", label: "Notes", type: "text" },
];

const CONTRACT_FIELDS: FieldDef[] = [
  { key: "contract_name", label: "Contract Name", type: "text" },
  { key: "contract_type", label: "Type", type: "select", options: ["contract", "subscription", "software"] },
  { key: "vendor", label: "Vendor", type: "text" },
  { key: "annual_value", label: "Annual Value", type: "number" },
  { key: "currency", label: "Currency", type: "select", options: ["GBP", "USD", "EUR"] },
  { key: "billing_cycle", label: "Billing Cycle", type: "select", options: ["one_off", "monthly", "annual"] },
  { key: "start_date", label: "Start Date", type: "date" },
  { key: "expiry_date", label: "Expiry Date", type: "date" },
  { key: "renewal_date", label: "Renewal Date", type: "date" },
  { key: "notice_period_days", label: "Notice Period (days)", type: "number" },
  { key: "auto_renews", label: "Auto-renews", type: "boolean" },
  { key: "signatory", label: "Signatory", type: "text" },
  { key: "notes", label: "Notes", type: "text" },
];

const ASSET_FIELDS: FieldDef[] = [
  { key: "asset_name", label: "Asset Name", type: "text" },
  { key: "vendor", label: "Vendor", type: "text" },
  { key: "purchase_date", label: "Purchase Date", type: "date" },
  { key: "purchase_price", label: "Price", type: "number" },
  { key: "currency", label: "Currency", type: "select", options: ["GBP", "USD", "EUR"] },
  { key: "assigned_to", label: "Assigned To", type: "text" },
  { key: "serial_number", label: "Serial Number", type: "text" },
  { key: "model", label: "Model", type: "text" },
  { key: "condition", label: "Condition", type: "select", options: ["new", "good", "fair", "poor"] },
  { key: "warranty_months", label: "Warranty (months)", type: "number" },
  { key: "warranty_expiry", label: "Warranty Expiry", type: "date" },
  { key: "notes", label: "Notes", type: "text" },
];

function getFieldDefs(type: string): FieldDef[] {
  if (type === "employee") return EMPLOYEE_FIELDS;
  if (type === "contract" || type === "subscription" || type === "software") return CONTRACT_FIELDS;
  if (type === "asset") return ASSET_FIELDS;
  return [];
}

function formatFieldValue(value: unknown, field: FieldDef): string {
  if (value === null || value === undefined) return "";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "number") return String(value);
  return String(value);
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================
// Component
// ============================================================

type RecordEditorProps = {
  itemId: string;
  itemType: string;
  domainData: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
};

export function RecordEditor({ itemId, itemType, domainData, onClose, onSaved }: RecordEditorProps) {
  const fields = getFieldDefs(itemType);
  const [values, setValues] = useState<Record<string, unknown>>({ ...domainData });
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Track which fields changed
  const changed = fields.filter((f) => {
    const orig = domainData[f.key] ?? null;
    const curr = values[f.key] ?? null;
    return String(orig) !== String(curr);
  });

  function updateField(key: string, raw: string | boolean) {
    setValues((prev) => {
      const field = fields.find((f) => f.key === key);
      let value: unknown = raw;
      if (field?.type === "number" && typeof raw === "string") {
        value = raw === "" ? null : Number(raw);
      }
      if (typeof raw === "string" && raw === "") value = null;
      return { ...prev, [key]: value };
    });
    setConfirming(false);
  }

  async function handleSave() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setSaving(true);
    const changedFields: Record<string, unknown> = {};
    for (const f of changed) {
      changedFields[f.key] = values[f.key] ?? null;
    }

    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: itemType, fields: changedFields }),
      });

      if (res.ok) {
        setToast("Changes saved");
        setConfirming(false);
        setTimeout(() => {
          setToast(null);
          onSaved();
        }, 1500);
      } else {
        setToast("Save failed — try again");
        setConfirming(false);
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast("Save failed — try again");
      setConfirming(false);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#111118] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/3">
        <span className="text-sm font-medium text-white">Edit Record</span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-white transition-colors text-lg leading-none"
        >
          x
        </button>
      </div>

      {/* Fields — two-column grid, label:value side by side per cell */}
      <div className="px-5 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
        {fields.map((field) => {
          const value = values[field.key];
          const isChanged = changed.some((c) => c.key === field.key);

          return (
            <div key={field.key} className={`flex items-center gap-2 ${field.key === "notes" ? "col-span-2" : ""}`}>
              <label className="text-xs text-zinc-500 w-28 flex-shrink-0 text-right">
                {field.label}
                {isChanged && <span className="text-amber-400 ml-1">*</span>}
              </label>

              {field.type === "select" ? (
                <select
                  value={String(value ?? "")}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white outline-none focus:border-white/20"
                >
                  <option value="" className="bg-[#111118]">—</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt} className="bg-[#111118]">
                      {formatLabel(opt)}
                    </option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <button
                  onClick={() => updateField(field.key, !value)}
                  className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                    value
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : "bg-white/5 border-white/10 text-zinc-400"
                  }`}
                >
                  {value ? "Yes" : "No"}
                </button>
              ) : (
                <input
                  type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                  value={formatFieldValue(value, field)}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white outline-none focus:border-white/20 placeholder-zinc-600"
                  readOnly={field.readonly}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 bg-white/2">
        <div>
          {toast && (
            <span className={`text-xs ${toast.includes("failed") ? "text-red-400" : "text-emerald-400"}`}>
              {toast}
            </span>
          )}
          {!toast && changed.length > 0 && (
            <span className="text-xs text-zinc-500">
              {changed.length} field{changed.length > 1 ? "s" : ""} changed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={changed.length === 0 || saving}
            className={`text-xs font-medium rounded-lg px-4 py-1.5 transition-colors disabled:opacity-30 ${
              confirming
                ? "bg-amber-500 text-black hover:bg-amber-400"
                : "bg-white text-black hover:bg-zinc-200"
            }`}
          >
            {saving ? "Saving..." : confirming ? "Confirm Save" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
