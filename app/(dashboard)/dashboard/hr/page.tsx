import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ItemList } from "@/components/ItemList";

export default async function HRPage() {
  const { orgId } = await auth();

  const { data: items } = await supabaseAdmin
    .from("items")
    .select(`
      id, name, type, department, status, key_date,
      purchase_price, currency, billing_cycle,
      expiry_date, renewal_date, vendor, assigned_to_name,
      needs_review, confidence, created_at,
      employees (
        employee_name, role, department, employment_type,
        employment_status, joining_date, probation_end,
        last_working_day, manager_name, notes
      ),
      reminders (id, type, message, fire_at, status, sent_at)
    `)
    .eq("org_id", orgId ?? "demo")
    .eq("department", "hr")
    .order("created_at", { ascending: false });

  // Map the joined data — rename employees.department to employee_department
  const mapped = items?.map((item) => ({
    ...item,
    employees: item.employees?.map((e: Record<string, unknown>) => ({
      ...e,
      employee_department: e.department,
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">HR</h1>
        <p className="text-zinc-500 text-sm mt-1">{mapped?.length ?? 0} records tracked</p>
      </div>
      <ItemList items={(mapped as never[]) ?? []} />
    </div>
  );
}
