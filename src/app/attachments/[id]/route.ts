import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Redirects to a short-lived signed URL, only if RLS lets this user see the attachment.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: att } = await supabase.from("attachments").select("path").eq("id", id).single();
  if (!att) return new NextResponse("Not found", { status: 404 });

  const { data } = await supabase.storage.from("receipts").createSignedUrl(att.path, 60);
  if (!data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
