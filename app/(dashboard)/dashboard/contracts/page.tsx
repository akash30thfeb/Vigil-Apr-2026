import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ItemList } from "@/components/ItemList";

export default async function ContractsPage() {
  const { orgId } = await auth();

  const { data: items } = await supabaseAdmin
    .from("items")
    .select(`
      id, name, type, department, status, key_date,
      purchase_price, currency, billing_cycle,
      expiry_date, renewal_date, vendor, assigned_to_name,
      needs_review, confidence, created_at,
      contracts (
        contract_name, contract_type, vendor, currency, billing_cycle,
        start_date, expiry_date, renewal_date, annual_value,
        notice_period_days, auto_renews, signatory, notes
      ),
      reminders (id, type, message, fire_at, status, sent_at)
    `)
    .eq("org_id", orgId ?? "demo")
    .eq("department", "contracts")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Contracts</h1>
        <p className="text-zinc-500 text-sm mt-1">{items?.length ?? 0} items tracked</p>
      </div>
      <ItemList items={(items as never[]) ?? []} />
    </div>
  );
}
