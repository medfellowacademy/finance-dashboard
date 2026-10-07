import "server-only";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 8 * 1024 * 1024;

/** Stores a receipt/invoice file in the private "receipts" bucket and links it to a transaction. */
export async function saveAttachment(transactionId: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_BYTES) throw new Error("Attachment is larger than 8 MB");

  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${transactionId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("receipts").upload(path, file, {
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);
  const { error: rowError } = await supabase
    .from("attachments")
    .insert({ transaction_id: transactionId, path, file_name: file.name });
  if (rowError) throw new Error(rowError.message);
}
