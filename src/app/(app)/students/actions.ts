"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toPaise } from "@/lib/money";
import { equalSchedule, parseCustomSchedule, type ScheduleItem } from "@/lib/schedule";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;

function readSchedule(f: FormData, payable: number): ScheduleItem[] | string {
  let items: ScheduleItem[] | string;
  if (str(f, "schedule_mode") === "custom") {
    items = parseCustomSchedule(str(f, "custom"));
  } else {
    const count = Math.max(1, Math.min(60, Number(str(f, "count")) || 1));
    const first = str(f, "first_due");
    if (!first) return "Enter the first due date";
    items = equalSchedule(payable, count, first, Math.max(1, Number(str(f, "every_days")) || 30));
  }
  if (typeof items === "string") return items;
  if (items.length === 0) return "Add at least one installment";
  const total = items.reduce((a, i) => a + i.amount_paise, 0);
  if (total !== payable) {
    return `Installments add up to ${(total / 100).toFixed(2)} but the payable fee is ${(payable / 100).toFixed(2)}`;
  }
  return items;
}

export async function createStudentPlan(formData: FormData) {
  const me = await getProfile();
  if (!me.is_active || !(isStaff(me) || me.department_name === "Sales")) redirect("/students");
  const supabase = await createClient();
  const existing = str(formData, "student_id");
  const fail = (m: string): never =>
    redirect(`/students/new?error=${encodeURIComponent(m)}${existing ? `&student=${existing}` : ""}`);

  const total = toPaise(str(formData, "total"));
  const discount = toPaise(str(formData, "discount") || "0");
  if (!(total > 0)) return fail("Enter the course fee");
  if (discount < 0 || discount > total) return fail("Discount cannot be more than the fee");
  const payable = total - discount;
  if (payable <= 0) return fail("Payable fee must be greater than zero");

  const schedule = readSchedule(formData, payable);
  if (typeof schedule === "string") return fail(schedule);

  let studentId = existing;
  if (!studentId) {
    const name = str(formData, "name");
    if (!name) return fail("Student name is required");
    const { data, error } = await supabase
      .from("parties")
      .insert({
        name,
        kind: "student",
        phone: opt(formData, "phone"),
        email: opt(formData, "email"),
        state: opt(formData, "state"),
        gstin: opt(formData, "gstin"),
      })
      .select("id")
      .single();
    if (error || !data) return fail(error?.message ?? "Could not create the student");
    studentId = data.id;
  }

  let courseId: string | null = null;
  const course = str(formData, "course");
  if (course) {
    const found = await supabase.from("courses").select("id").ilike("name", course).maybeSingle();
    if (found.data) courseId = found.data.id;
    else {
      const created = await supabase.from("courses").insert({ name: course }).select("id").single();
      courseId = created.data?.id ?? null;
    }
  }

  const { data: plan, error: planError } = await supabase
    .from("fee_plans")
    .insert({
      student_id: studentId,
      course_id: courseId,
      total_paise: total,
      discount_paise: discount,
      gst_rate: Number(str(formData, "gst_rate")) || 18,
      gst_inclusive: formData.get("gst_inclusive") === "on",
      notes: opt(formData, "notes"),
    })
    .select("id")
    .single();
  if (planError || !plan) return fail(planError?.message ?? "Could not create the fee plan");

  const { error: instError } = await supabase.from("installments").insert(
    schedule.map((s, i) => ({ fee_plan_id: plan.id, seq: i + 1, ...s })),
  );
  if (instError) return fail(instError.message);

  revalidatePath("/students");
  redirect(`/students/${studentId}`);
}

/** Staff: change the fee, discount and installment schedule of a plan (logged in the audit trail). */
export async function updatePlan(formData: FormData) {
  const me = await getProfile();
  if (!isStaff(me)) redirect("/students");
  const supabase = await createClient();
  const planId = str(formData, "plan_id");
  const student = str(formData, "student_id");
  const back = `/students/${student}`;
  const fail = (m: string): never => redirect(`${back}?error=${encodeURIComponent(m)}`);

  const total = toPaise(str(formData, "total"));
  const discount = toPaise(str(formData, "discount") || "0");
  if (!(total > 0) || discount < 0 || discount > total) return fail("Check the fee and discount");
  const payable = total - discount;

  const items = parseCustomSchedule(str(formData, "custom"));
  if (typeof items === "string") return fail(items);
  if (items.reduce((a, i) => a + i.amount_paise, 0) !== payable) {
    return fail("Installments must add up to the payable fee (fee − discount)");
  }

  const { error } = await supabase
    .from("fee_plans")
    .update({
      total_paise: total,
      discount_paise: discount,
      gst_rate: Number(str(formData, "gst_rate")) || 18,
      gst_inclusive: formData.get("gst_inclusive") === "on",
      status: str(formData, "status") || "active",
      notes: opt(formData, "notes"),
    })
    .eq("id", planId);
  if (error) return fail(error.message);

  await supabase.from("installments").delete().eq("fee_plan_id", planId);
  const { error: instError } = await supabase
    .from("installments")
    .insert(items.map((s, i) => ({ fee_plan_id: planId, seq: i + 1, ...s })));
  if (instError) return fail(instError.message);

  revalidatePath(back);
  revalidatePath("/students");
  redirect(back);
}
