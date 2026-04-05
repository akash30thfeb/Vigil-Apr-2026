import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/items/[id] — fetch item + domain data
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { orgId } = await auth();
  const { id } = await params;
  const safeOrgId = orgId ?? "demo";

  const { data: item, error } = await supabaseAdmin
    .from("items")
    .select(`
      id, name, type, department, status, key_date,
      employees (
        employee_name, role, joining_date, employment_type, department,
        employment_status, last_working_day, probation_end, manager_name, notes
      ),
      contracts (
        contract_name, contract_type, vendor, currency, billing_cycle,
        start_date, expiry_date, renewal_date, annual_value,
        notice_period_days, auto_renews, signatory, notes
      ),
      assets (
        asset_name, vendor, purchase_date, purchase_price, currency,
        assigned_to, serial_number, model, condition,
        warranty_months, warranty_expiry, notes
      )
    `)
    .eq("id", id)
    .eq("org_id", safeOrgId)
    .single();

  if (error || !item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item });
}

// PATCH /api/items/[id] — update domain-specific fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { orgId } = await auth();
  const { id } = await params;
  const safeOrgId = orgId ?? "demo";
  const body = await req.json();
  const { type, fields } = body as { type: string; fields: Record<string, unknown> };

  // Verify item belongs to org
  const { data: item, error: lookupError } = await supabaseAdmin
    .from("items")
    .select("id, type, department")
    .eq("id", id)
    .eq("org_id", safeOrgId)
    .single();

  if (lookupError || !item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    if (type === "employee") {
      await updateEmployee(id, fields);
    } else if (type === "contract" || type === "subscription" || type === "software") {
      await updateContract(id, fields);
    } else if (type === "asset") {
      await updateAsset(id, fields);
    }

    // Update items.updated_at
    await supabaseAdmin
      .from("items")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to update item:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

async function updateEmployee(itemId: string, fields: Record<string, unknown>) {
  // Update domain table
  const { error: empError } = await supabaseAdmin
    .from("employees")
    .update(fields)
    .eq("item_id", itemId);

  if (empError) throw empError;

  // Recompute key_date
  const { data: emp } = await supabaseAdmin
    .from("employees")
    .select("employment_status, probation_end, last_working_day, employee_name, manager_name")
    .eq("item_id", itemId)
    .single();

  if (emp) {
    const keyDate =
      emp.employment_status === "active"
        ? emp.probation_end ?? null
        : emp.last_working_day ?? null;

    await supabaseAdmin
      .from("items")
      .update({
        key_date: keyDate,
        assigned_to_name: emp.manager_name ?? "Diana Davis",
      })
      .eq("id", itemId);
  }
}

async function updateContract(itemId: string, fields: Record<string, unknown>) {
  const { error: cError } = await supabaseAdmin
    .from("contracts")
    .update(fields)
    .eq("item_id", itemId);

  if (cError) throw cError;

  // Recompute key_date
  const { data: con } = await supabaseAdmin
    .from("contracts")
    .select("expiry_date, renewal_date, signatory")
    .eq("item_id", itemId)
    .single();

  if (con) {
    const r = con.renewal_date ? new Date(con.renewal_date).getTime() : Infinity;
    const e = con.expiry_date ? new Date(con.expiry_date).getTime() : Infinity;
    const earliest = Math.min(r, e);
    const keyDate = earliest === Infinity ? null : new Date(earliest).toISOString().split("T")[0];

    await supabaseAdmin
      .from("items")
      .update({
        key_date: keyDate,
        assigned_to_name: con.signatory ?? null,
      })
      .eq("id", itemId);
  }
}

async function updateAsset(itemId: string, fields: Record<string, unknown>) {
  const { error: aError } = await supabaseAdmin
    .from("assets")
    .update(fields)
    .eq("item_id", itemId);

  if (aError) throw aError;

  // Recompute key_date
  const { data: ast } = await supabaseAdmin
    .from("assets")
    .select("warranty_expiry, assigned_to")
    .eq("item_id", itemId)
    .single();

  if (ast) {
    await supabaseAdmin
      .from("items")
      .update({
        key_date: ast.warranty_expiry ?? null,
        assigned_to_name: ast.assigned_to ?? null,
      })
      .eq("id", itemId);
  }
}
