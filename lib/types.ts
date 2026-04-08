import { z } from "zod";

// ============================================================
// Shared schemas
// ============================================================

export const ReminderSchema = z.object({
  type: z.enum([
    "expiry_warning",
    "renewal_warning",
    "roi_checkin",
    "anniversary",
    "custom",
  ]),
  message: z.string(),
  days_before: z.number().nullable().optional(),
  fire_at: z.string().nullable().optional(),
  recurrence: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
}).refine(
  (r) => r.days_before != null || r.fire_at != null,
  { message: "Each reminder must have days_before or fire_at" }
);

// Thin base — what goes into the items index table
export const ItemBaseSchema = z.object({
  action: z.enum(["create", "update"]).default("create"),
  name: z.string().min(2).max(200),
  type: z.enum(["asset", "software", "subscription", "contract", "employee", "milestone"]),
  department: z.enum(["it", "contracts", "hr", "operations"]),
  raw_log: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  reminders: z.array(ReminderSchema).default([]),
});

// ============================================================
// Employee domain schema
// ============================================================

export const EMPLOYEE_DEPARTMENTS = [
  "IT",
  "People Functions",
  "Sales",
  "Engineering",
  "Data Analytics",
  "Data Science",
] as const;

export const EMPLOYEE_ROLES_BY_DEPT: Record<string, string[]> = {
  "Engineering": ["Software Engineer", "QA Engineer", "DevOps Engineer", "Engineering Manager", "Tech Lead"],
  "Data Analytics": ["Data Analyst", "BI Analyst", "Analytics Manager"],
  "Data Science": ["Data Scientist", "ML Engineer", "Research Scientist"],
  "IT": ["IT Support", "Systems Administrator", "IT Manager", "Security Analyst"],
  "People Functions": ["HR Manager", "Recruiter", "People Partner", "L&D Specialist"],
  "Sales": ["Account Executive", "SDR", "Sales Manager", "Solutions Consultant"],
};

export const EmployeeDataSchema = ItemBaseSchema.extend({
  type: z.literal("employee"),
  department: z.literal("hr"),

  // Required fields
  employee_name: z.string().min(1),
  role: z.string().min(1),
  joining_date: z.string().min(1), // ISO date
  employment_type: z.enum(["full_time", "external_consultant", "intern"]),
  employee_department: z.enum(EMPLOYEE_DEPARTMENTS),
  employment_status: z.enum(["active", "notice_period", "exited"]).default("active"),

  // Conditional: required if exiting/exited
  last_working_day: z.string().nullable().optional(),

  // Optional
  probation_end: z.string().nullable().optional(),
  manager_name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
}).refine(
  (d) => {
    if (d.employment_status === "notice_period" || d.employment_status === "exited") {
      return d.last_working_day != null;
    }
    return true;
  },
  { message: "last_working_day is required when employment_status is notice_period or exited" }
);

// ============================================================
// Contract domain schema
// ============================================================

export const CONTRACT_TYPES = ["contract", "subscription", "software"] as const;

export const ContractDataSchema = ItemBaseSchema.extend({
  type: z.enum(CONTRACT_TYPES),
  department: z.literal("contracts"),

  // Required fields
  contract_name: z.string().min(1),
  vendor: z.string().min(1),

  // At least one date required (validated via refine)
  expiry_date: z.string().nullable().optional(),
  renewal_date: z.string().nullable().optional(),

  // Optional
  annual_value: z.number().nullable().optional(),
  currency: z.string().default("GBP"),
  billing_cycle: z.enum(["one_off", "monthly", "annual"]).nullable().optional(),
  start_date: z.string().nullable().optional(),
  notice_period_days: z.number().nullable().optional(),
  auto_renews: z.boolean().default(false),
  signatory: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
}).refine(
  (d) => d.expiry_date != null || d.renewal_date != null,
  { message: "At least one of expiry_date or renewal_date is required" }
);

// ============================================================
// Asset domain schema
// ============================================================

export const AssetDataSchema = ItemBaseSchema.extend({
  type: z.literal("asset"),
  department: z.literal("it"),

  // Required fields
  asset_name: z.string().min(1),
  vendor: z.string().min(1),
  purchase_date: z.string().min(1), // ISO date

  // Optional
  purchase_price: z.number().nullable().optional(),
  currency: z.string().default("GBP"),
  assigned_to: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  condition: z.enum(["new", "good", "fair", "poor"]).nullable().optional(),
  warranty_months: z.number().nullable().optional(),
  warranty_expiry: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ============================================================
// Legacy flat schema (used by milestones etc.)
// ============================================================

export const ItemDataSchema = z.object({
  action: z.enum(["create", "update"]).default("create"),
  name: z.string().min(2).max(200),
  type: z.enum(["asset", "software", "subscription", "contract", "employee", "milestone"]),
  department: z.enum(["it", "contracts", "hr", "operations"]),
  purchase_price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  billing_cycle: z.enum(["one_off", "monthly", "annual"]).nullable().optional(),
  purchase_date: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  renewal_date: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  assigned_to_name: z.string().nullable().optional(),
  reminders: z.array(ReminderSchema).default([]),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  raw_log: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
}).refine(
  (d) => !(d.purchase_price != null && d.currency == null),
  { message: "currency is required when purchase_price is present" }
);

// ============================================================
// Discriminated validator — routes to the right schema by type
// ============================================================

export function validateItemData(raw: unknown) {
  const base = ItemBaseSchema.safeParse(raw);
  if (!base.success) return base;

  switch (base.data.type) {
    case "employee":
      return EmployeeDataSchema.safeParse(raw);
    case "contract":
    case "subscription":
    case "software":
      return ContractDataSchema.safeParse(raw);
    case "asset":
      return AssetDataSchema.safeParse(raw);
    default:
      return ItemDataSchema.safeParse(raw); // milestone etc
  }
}

// ============================================================
// Types
// ============================================================

export type ItemBase = z.infer<typeof ItemBaseSchema>;
export type EmployeeData = z.infer<typeof EmployeeDataSchema>;
export type ContractData = z.infer<typeof ContractDataSchema>;
export type AssetData = z.infer<typeof AssetDataSchema>;
export type ItemData = z.infer<typeof ItemDataSchema>;
export type Reminder = z.infer<typeof ReminderSchema>;
