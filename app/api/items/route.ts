import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ItemDataSchema } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { orgId } = await auth();
  const { searchParams } = new URL(req.url);
  const department = searchParams.get("department");
  const status = searchParams.get("status");

  let query = supabaseAdmin
    .from("items")
    .select("*")
    .eq("org_id", orgId ?? "demo")
    .order("created_at", { ascending: false });

  if (department) query = query.eq("department", department);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = ItemDataSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const item = parsed.data;
  const needsReview = item.confidence === "low";

  // Duplicate check
  const { data: existing } = await supabaseAdmin
    .from("items")
    .select("id")
    .eq("org_id", orgId ?? "demo")
    .ilike("name", item.name)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: `"${item.name}" already exists in your logbook.` },
      { status: 409 }
    );
  }

  const { data: newItem, error: itemError } = await supabaseAdmin
    .from("items")
    .insert({
      org_id: orgId ?? "demo",
      created_by: userId,
      name: item.name,
      type: item.type,
      department: item.department,
      purchase_price: item.purchase_price,
      currency: item.currency ?? "GBP",
      billing_cycle: item.billing_cycle,
      purchase_date: item.purchase_date,
      start_date: item.start_date,
      expiry_date: item.expiry_date,
      renewal_date: item.renewal_date,
      vendor: item.vendor,
      assigned_to_name: item.assigned_to_name,
      metadata: item.metadata,
      raw_log: item.raw_log,
      confidence: item.confidence,
      needs_review: needsReview,
      status: "active",
    })
    .select("id")
    .single();

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  // Write reminders
  if (!needsReview && item.reminders.length > 0 && newItem) {
    const reminderRows = item.reminders.map((r) => {
      let fireAt: string | null = r.fire_at ?? null;
      if (!fireAt && r.days_before != null) {
        const baseDate =
          item.renewal_date ??
          item.expiry_date ??
          item.start_date ??
          item.purchase_date;
        if (baseDate) {
          const d = new Date(baseDate);
          d.setDate(d.getDate() - r.days_before);
          fireAt = d.toISOString();
        }
      }
      return {
        item_id: newItem.id,
        org_id: orgId ?? "demo",
        type: r.type,
        message: r.message,
        days_before: r.days_before ?? null,
        fire_at: fireAt,
        status: "scheduled",
      };
    });

    await supabaseAdmin.from("reminders").insert(reminderRows);
  }

  return NextResponse.json({ id: newItem?.id }, { status: 201 });
}
