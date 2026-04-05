import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ItemList } from "@/components/ItemList";

export default async function ITPage() {
  const { orgId } = await auth();

  const { data: items } = await supabaseAdmin
    .from("items")
    .select(`
      id, name, type, department, status, key_date,
      purchase_price, currency, billing_cycle,
      expiry_date, renewal_date, vendor, assigned_to_name,
      needs_review, confidence, created_at,
      assets (
        asset_name, vendor, purchase_date, purchase_price, currency,
        assigned_to, serial_number, model, condition,
        warranty_months, warranty_expiry, notes
      ),
      reminders (id, type, message, fire_at, status, sent_at)
    `)
    .eq("org_id", orgId ?? "demo")
    .eq("department", "it")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">IT Assets</h1>
        <p className="text-zinc-500 text-sm mt-1">{items?.length ?? 0} items tracked</p>
      </div>
      <ItemList items={(items as never[]) ?? []} />
    </div>
  );
}
