import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { INTAKE_SYSTEM_PROMPT } from "@/lib/agent-prompts";
import { validateItemData } from "@/lib/types";
import type { EmployeeData, ContractData, AssetData, ItemData } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

type Message = { role: "user" | "assistant"; content: string };

function extractItemData(text: string) {
  const match = text.match(/ITEM_DATA_START\s*([\s\S]*?)\s*ITEM_DATA_END/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractReminderData(text: string) {
  const match = text.match(/REMINDER_DATA_START\s*([\s\S]*?)\s*REMINDER_DATA_END/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function stripDataBlocks(text: string) {
  return text
    .replace(/ITEM_DATA_START[\s\S]*?ITEM_DATA_END/g, "")
    .replace(/REMINDER_DATA_START[\s\S]*?REMINDER_DATA_END/g, "")
    .trim();
}

// ============================================================
// Employee write path (Phase 1 — domain table is source of truth)
// ============================================================

async function writeEmployee(
  item: EmployeeData,
  orgId: string,
  userId: string,
  existingItemId?: string
) {
  const needsReview = item.confidence === "low";
  const isUpdate = item.action === "update" && !!existingItemId;

  // Compute key_date: probation_end for active, last_working_day for exiting
  const keyDate =
    item.employment_status === "active"
      ? item.probation_end ?? null
      : item.last_working_day ?? null;

  let itemId: string;

  if (isUpdate && existingItemId) {
    // Update items index
    const { error: updateError } = await supabaseAdmin
      .from("items")
      .update({
        name: item.name,
        key_date: keyDate,
        raw_log: item.raw_log,
        confidence: item.confidence,
        needs_review: needsReview,
        // Legacy dual-write (remove after all dashboards migrated)
        start_date: item.joining_date,
        expiry_date: item.probation_end ?? item.last_working_day ?? null,
        assigned_to_name: item.manager_name ?? "Diana Davis",
        metadata: {
          job_title: item.role,
          employment_type: item.employment_type,
          manager_name: item.manager_name,
        },
      })
      .eq("id", existingItemId);

    if (updateError) {
      console.error("Failed to update item:", updateError);
      return null;
    }
    itemId = existingItemId;

    // Update employees domain table
    const { error: empError } = await supabaseAdmin
      .from("employees")
      .update({
        employee_name: item.employee_name,
        role: item.role,
        joining_date: item.joining_date,
        employment_type: item.employment_type,
        department: item.employee_department,
        employment_status: item.employment_status,
        last_working_day: item.last_working_day ?? null,
        probation_end: item.probation_end ?? null,
        manager_name: item.manager_name ?? null,
        notes: item.notes ?? null,
      })
      .eq("item_id", existingItemId);

    if (empError) {
      console.error("Failed to update employee:", empError);
    }
  } else {
    // Insert into items index (thin)
    const { data: inserted, error: itemError } = await supabaseAdmin
      .from("items")
      .insert({
        org_id: orgId,
        created_by: userId,
        name: item.name,
        type: "employee",
        department: "hr",
        status: "active",
        key_date: keyDate,
        raw_log: item.raw_log,
        confidence: item.confidence,
        needs_review: needsReview,
        // Legacy dual-write (remove after all dashboards migrated)
        start_date: item.joining_date,
        expiry_date: item.probation_end ?? item.last_working_day ?? null,
        assigned_to_name: item.manager_name ?? "Diana Davis",
        metadata: {
          job_title: item.role,
          employment_type: item.employment_type,
          manager_name: item.manager_name,
        },
      })
      .select("id")
      .single();

    if (itemError) {
      console.error("Failed to write item:", itemError);
      return null;
    }
    itemId = inserted.id;

    // Insert into employees domain table (source of truth)
    const { error: empError } = await supabaseAdmin
      .from("employees")
      .insert({
        item_id: itemId,
        employee_name: item.employee_name,
        role: item.role,
        joining_date: item.joining_date,
        employment_type: item.employment_type,
        department: item.employee_department,
        employment_status: item.employment_status,
        last_working_day: item.last_working_day ?? null,
        probation_end: item.probation_end ?? null,
        manager_name: item.manager_name ?? null,
        notes: item.notes ?? null,
      });

    if (empError) {
      console.error("Failed to write employee:", empError);
    }
  }

  return itemId;
}

// ============================================================
// Contract write path (Phase 2 — domain table is source of truth)
// ============================================================

async function writeContract(
  item: ContractData,
  orgId: string,
  userId: string,
  existingItemId?: string
) {
  const needsReview = item.confidence === "low";
  const isUpdate = item.action === "update" && !!existingItemId;

  // key_date = LEAST(expiry_date, renewal_date)
  const r = item.renewal_date ? new Date(item.renewal_date).getTime() : Infinity;
  const e = item.expiry_date ? new Date(item.expiry_date).getTime() : Infinity;
  const earliest = Math.min(r, e);
  const keyDate = earliest === Infinity ? null : new Date(earliest).toISOString().split("T")[0];

  let itemId: string;

  if (isUpdate && existingItemId) {
    const { error: updateError } = await supabaseAdmin
      .from("items")
      .update({
        name: item.name,
        key_date: keyDate,
        raw_log: item.raw_log,
        confidence: item.confidence,
        needs_review: needsReview,
        // Legacy dual-write
        vendor: item.vendor,
        purchase_price: item.annual_value,
        currency: item.currency,
        billing_cycle: item.billing_cycle,
        start_date: item.start_date,
        expiry_date: item.expiry_date,
        renewal_date: item.renewal_date,
      })
      .eq("id", existingItemId);

    if (updateError) {
      console.error("Failed to update item:", updateError);
      return null;
    }
    itemId = existingItemId;

    const { error: cError } = await supabaseAdmin
      .from("contracts")
      .update({
        contract_name: item.contract_name,
        contract_type: item.type,
        vendor: item.vendor,
        currency: item.currency ?? "GBP",
        billing_cycle: item.billing_cycle ?? null,
        start_date: item.start_date ?? null,
        expiry_date: item.expiry_date ?? null,
        renewal_date: item.renewal_date ?? null,
        annual_value: item.annual_value ?? null,
        notice_period_days: item.notice_period_days ?? null,
        auto_renews: item.auto_renews ?? false,
        signatory: item.signatory ?? null,
        notes: item.notes ?? null,
      })
      .eq("item_id", existingItemId);

    if (cError) {
      console.error("Failed to update contract:", cError);
    }
  } else {
    const { data: inserted, error: itemError } = await supabaseAdmin
      .from("items")
      .insert({
        org_id: orgId,
        created_by: userId,
        name: item.name,
        type: item.type,
        department: "contracts",
        status: "active",
        key_date: keyDate,
        raw_log: item.raw_log,
        confidence: item.confidence,
        needs_review: needsReview,
        // Legacy dual-write
        vendor: item.vendor,
        purchase_price: item.annual_value,
        currency: item.currency,
        billing_cycle: item.billing_cycle,
        start_date: item.start_date,
        expiry_date: item.expiry_date,
        renewal_date: item.renewal_date,
        assigned_to_name: item.signatory ?? null,
      })
      .select("id")
      .single();

    if (itemError) {
      console.error("Failed to write item:", itemError);
      return null;
    }
    itemId = inserted.id;

    const { error: cError } = await supabaseAdmin
      .from("contracts")
      .insert({
        item_id: itemId,
        contract_name: item.contract_name,
        contract_type: item.type,
        vendor: item.vendor,
        currency: item.currency ?? "GBP",
        billing_cycle: item.billing_cycle ?? null,
        start_date: item.start_date ?? null,
        expiry_date: item.expiry_date ?? null,
        renewal_date: item.renewal_date ?? null,
        annual_value: item.annual_value ?? null,
        notice_period_days: item.notice_period_days ?? null,
        auto_renews: item.auto_renews ?? false,
        signatory: item.signatory ?? null,
        notes: item.notes ?? null,
      });

    if (cError) {
      console.error("Failed to write contract:", cError);
    }
  }

  return itemId;
}

// ============================================================
// Asset write path (Phase 3 — domain table is source of truth)
// ============================================================

async function writeAsset(
  item: AssetData,
  orgId: string,
  userId: string,
  existingItemId?: string
) {
  const needsReview = item.confidence === "low";
  const isUpdate = item.action === "update" && !!existingItemId;
  const keyDate = item.warranty_expiry ?? null;

  let itemId: string;

  if (isUpdate && existingItemId) {
    const { error: updateError } = await supabaseAdmin
      .from("items")
      .update({
        name: item.name,
        key_date: keyDate,
        raw_log: item.raw_log,
        confidence: item.confidence,
        needs_review: needsReview,
        // Legacy dual-write
        vendor: item.vendor,
        purchase_price: item.purchase_price,
        currency: item.currency,
        purchase_date: item.purchase_date,
        expiry_date: item.warranty_expiry,
        assigned_to_name: item.assigned_to,
      })
      .eq("id", existingItemId);

    if (updateError) {
      console.error("Failed to update item:", updateError);
      return null;
    }
    itemId = existingItemId;

    const { error: aError } = await supabaseAdmin
      .from("assets")
      .update({
        asset_name: item.asset_name,
        vendor: item.vendor,
        purchase_date: item.purchase_date,
        purchase_price: item.purchase_price ?? null,
        currency: item.currency ?? "GBP",
        assigned_to: item.assigned_to ?? null,
        serial_number: item.serial_number ?? null,
        model: item.model ?? null,
        manufacturer: item.vendor,
        condition: item.condition ?? null,
        warranty_months: item.warranty_months ?? null,
        warranty_expiry: item.warranty_expiry ?? null,
        notes: item.notes ?? null,
      })
      .eq("item_id", existingItemId);

    if (aError) {
      console.error("Failed to update asset:", aError);
    }
  } else {
    const { data: inserted, error: itemError } = await supabaseAdmin
      .from("items")
      .insert({
        org_id: orgId,
        created_by: userId,
        name: item.name,
        type: "asset",
        department: "it",
        status: "active",
        key_date: keyDate,
        raw_log: item.raw_log,
        confidence: item.confidence,
        needs_review: needsReview,
        // Legacy dual-write
        vendor: item.vendor,
        purchase_price: item.purchase_price,
        currency: item.currency,
        purchase_date: item.purchase_date,
        expiry_date: item.warranty_expiry,
        assigned_to_name: item.assigned_to,
      })
      .select("id")
      .single();

    if (itemError) {
      console.error("Failed to write item:", itemError);
      return null;
    }
    itemId = inserted.id;

    const { error: aError } = await supabaseAdmin
      .from("assets")
      .insert({
        item_id: itemId,
        asset_name: item.asset_name,
        vendor: item.vendor,
        purchase_date: item.purchase_date,
        purchase_price: item.purchase_price ?? null,
        currency: item.currency ?? "GBP",
        assigned_to: item.assigned_to ?? null,
        serial_number: item.serial_number ?? null,
        model: item.model ?? null,
        manufacturer: item.vendor,
        condition: item.condition ?? null,
        warranty_months: item.warranty_months ?? null,
        warranty_expiry: item.warranty_expiry ?? null,
        notes: item.notes ?? null,
      });

    if (aError) {
      console.error("Failed to write asset:", aError);
    }
  }

  return itemId;
}

// ============================================================
// Legacy write path (milestones etc.)
// ============================================================

async function writeLegacyItem(
  item: ItemData,
  orgId: string,
  userId: string,
  existingItemId?: string
) {
  const needsReview = item.confidence === "low";
  const isUpdate = item.action === "update" && !!existingItemId;

  // Compute key_date based on type
  let keyDate: string | null = null;
  if (item.type === "contract" || item.type === "subscription" || item.type === "software") {
    const r = item.renewal_date ? new Date(item.renewal_date).getTime() : Infinity;
    const e = item.expiry_date ? new Date(item.expiry_date).getTime() : Infinity;
    const earliest = Math.min(r, e);
    keyDate = earliest === Infinity ? null : new Date(earliest).toISOString().split("T")[0];
  } else if (item.type === "asset") {
    keyDate = item.expiry_date ?? null;
  }

  let itemId: string;

  if (isUpdate && existingItemId) {
    const { error: updateError } = await supabaseAdmin
      .from("items")
      .update({
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
        key_date: keyDate,
      })
      .eq("id", existingItemId);

    if (updateError) {
      console.error("Failed to update item:", updateError);
      return null;
    }
    itemId = existingItemId;
  } else {
    const { data: inserted, error: itemError } = await supabaseAdmin
      .from("items")
      .insert({
        org_id: orgId,
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
        key_date: keyDate,
      })
      .select("id")
      .single();

    if (itemError) {
      console.error("Failed to write item:", itemError);
      return null;
    }
    itemId = inserted.id;

    // Extension tables (legacy — will be refactored in Phases 2 & 3)
    const meta = item.metadata ?? {};

    if (item.type === "asset" && item.department === "it") {
      await supabaseAdmin.from("assets").insert({
        item_id: itemId,
        serial_number: meta.serial_number ?? null,
        model: meta.model ?? null,
        manufacturer: item.vendor ?? null,
        condition: meta.condition ?? null,
        warranty_months: meta.warranty_months ?? null,
        warranty_expiry: item.expiry_date ?? null,
      });
    }

    if (item.type === "contract" || item.type === "subscription" || item.type === "software") {
      await supabaseAdmin.from("contracts").insert({
        item_id: itemId,
        annual_value: item.purchase_price ?? null,
        notice_period_days: meta.notice_period_days ?? null,
        auto_renews: meta.auto_renews ?? false,
        signatory: meta.signatory ?? null,
      });
    }
  }

  return itemId;
}

// ============================================================
// Main POST handler
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    const body = await req.json();
    const messages: Message[] = body.messages ?? [];

    if (!messages.length) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: INTAKE_SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    const rawItemData = extractItemData(rawText);
    const cleanMessage = stripDataBlocks(rawText);

    if (rawItemData) {
      // Validate using discriminated validator
      const parsed = validateItemData(rawItemData);

      if (parsed.success) {
        const item = parsed.data;
        const safeOrgId = orgId ?? "demo";
        const safeUserId = userId ?? "anonymous";

        // Duplicate / lookup check
        const isUpdate = item.action === "update";
        let existingItem: { id: string; name: string } | undefined;

        // Try exact name match first
        const { data: exactMatch } = await supabaseAdmin
          .from("items")
          .select("id, name")
          .eq("org_id", safeOrgId)
          .ilike("name", item.name)
          .limit(1);

        existingItem = exactMatch?.[0];

        // For employees, also try matching by employee_name in domain table
        if (!existingItem && item.type === "employee") {
          const empData = item as EmployeeData;
          const { data: empMatch } = await supabaseAdmin
            .from("employees")
            .select("item_id, items!inner(id, name, org_id)")
            .ilike("employee_name", empData.employee_name)
            .limit(1);

          if (empMatch?.[0]) {
            const matched = empMatch[0] as unknown as { item_id: string; items: { id: string; name: string; org_id: string } };
            if (matched.items.org_id === safeOrgId) {
              existingItem = { id: matched.items.id, name: matched.items.name };
            }
          }
        }

        // Partial name match fallback (e.g. "Priya Sharma" matches "Priya Sharma — ML Engineer")
        if (!existingItem) {
          const { data: partialMatch } = await supabaseAdmin
            .from("items")
            .select("id, name")
            .eq("org_id", safeOrgId)
            .ilike("name", `%${item.name}%`)
            .limit(1);

          existingItem = partialMatch?.[0];
        }

        if (existingItem && !isUpdate) {
          return NextResponse.json({
            message: `"${item.name}" already exists in your logbook. Did you want to update the existing record instead?`,
            item_logged: false,
            duplicate: true,
          });
        }

        if (isUpdate && !existingItem) {
          return NextResponse.json({
            message: `I couldn't find an existing record matching "${item.name}". Could you double-check the name? If this is a new record, let me know and I'll create it.`,
            item_logged: false,
          });
        }

        // Route to the right write path
        let itemId: string | null = null;

        if (item.type === "employee") {
          itemId = await writeEmployee(
            item as EmployeeData,
            safeOrgId,
            safeUserId,
            isUpdate ? existingItem?.id : undefined
          );
        } else if (item.type === "contract" || item.type === "subscription" || item.type === "software") {
          itemId = await writeContract(
            item as ContractData,
            safeOrgId,
            safeUserId,
            isUpdate ? existingItem?.id : undefined
          );
        } else if (item.type === "asset") {
          itemId = await writeAsset(
            item as AssetData,
            safeOrgId,
            safeUserId,
            isUpdate ? existingItem?.id : undefined
          );
        } else {
          itemId = await writeLegacyItem(
            item as ItemData,
            safeOrgId,
            safeUserId,
            isUpdate ? existingItem?.id : undefined
          );
        }

        if (!itemId) {
          return NextResponse.json({ message: cleanMessage, item_logged: false });
        }

        // Write reminders
        const holdReminders = item.confidence === "low";
        if (!holdReminders && item.reminders.length > 0) {
          // Determine base date for days_before computation
          let baseDate: string | null = null;
          if (item.type === "employee") {
            const emp = item as EmployeeData;
            baseDate = emp.probation_end ?? emp.last_working_day ?? emp.joining_date;
          } else if (item.type === "contract" || item.type === "subscription" || item.type === "software") {
            const con = item as ContractData;
            baseDate = con.renewal_date ?? con.expiry_date ?? con.start_date ?? null;
          } else if (item.type === "asset") {
            const ast = item as AssetData;
            baseDate = ast.warranty_expiry ?? ast.purchase_date;
          } else {
            const legacy = item as ItemData;
            baseDate = legacy.renewal_date ?? legacy.expiry_date ?? legacy.start_date ?? legacy.purchase_date ?? null;
          }

          const reminderRows = item.reminders.map((r) => {
            let fireAt: string | null = r.fire_at ?? null;

            if (fireAt) {
              // Agent outputs times in IST — append offset so Date parses correctly on UTC servers (Vercel)
              if (!/[Z+\-]\d/.test(fireAt)) {
                fireAt = new Date(fireAt + "+05:30").toISOString();
              }
            } else if (r.days_before != null && baseDate) {
              const d = new Date(baseDate);
              d.setDate(d.getDate() - r.days_before);
              fireAt = d.toISOString();
            }

            return {
              item_id: itemId!,
              org_id: safeOrgId,
              type: r.type,
              message: r.message,
              days_before: r.days_before ?? null,
              fire_at: fireAt,
              status: "scheduled",
            };
          });

          const { error: reminderError } = await supabaseAdmin
            .from("reminders")
            .insert(reminderRows);

          if (reminderError) {
            console.error("Failed to write reminders:", reminderError);
          }
        }

        return NextResponse.json({
          message: cleanMessage,
          item_logged: true,
          item_id: itemId,
          department: item.department,
          item_name: item.name,
        });
      } else {
        console.error("ITEM_DATA validation failed:", parsed.error);
        return NextResponse.json({ message: cleanMessage, item_logged: false });
      }
    }

    // Handle REMINDER_DATA — adding reminders to an already-saved item
    const rawReminderData = extractReminderData(rawText);
    if (rawReminderData) {
      const safeOrgId = orgId ?? "demo";
      const itemName: string = rawReminderData.item_name ?? "";
      const reminders: { type: string; message: string; days_before?: number | null; fire_at?: string | null }[] =
        rawReminderData.reminders ?? [];

      if (itemName && reminders.length > 0) {
        // Look up the item
        const { data: match } = await supabaseAdmin
          .from("items")
          .select("id")
          .eq("org_id", safeOrgId)
          .ilike("name", `%${itemName}%`)
          .limit(1);

        const itemId = match?.[0]?.id;

        if (itemId) {
          // Look up item details for redirect
          const { data: itemDetails } = await supabaseAdmin
            .from("items")
            .select("name, department")
            .eq("id", itemId)
            .single();

          const reminderRows = reminders.map((r) => ({
            item_id: itemId,
            org_id: safeOrgId,
            type: r.type ?? "custom",
            message: r.message,
            days_before: r.days_before ?? null,
            fire_at: r.fire_at
              ? (/[Z+\-]\d/.test(r.fire_at)
                  ? new Date(r.fire_at).toISOString()
                  : new Date(r.fire_at + "+05:30").toISOString())
              : null,
            status: "scheduled",
          }));

          const { error: reminderError } = await supabaseAdmin
            .from("reminders")
            .insert(reminderRows);

          if (reminderError) {
            console.error("Failed to write follow-up reminders:", reminderError);
          } else {
            return NextResponse.json({
              message: cleanMessage,
              item_logged: false,
              reminders_added: true,
              item_id: itemId,
              department: itemDetails?.department ?? "dashboard",
              item_name: itemDetails?.name ?? itemName,
            });
          }
        }
      }
    }

    return NextResponse.json({ message: cleanMessage, item_logged: false });
  } catch (error) {
    console.error("/api/chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
