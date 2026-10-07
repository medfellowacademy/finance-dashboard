"use client";

import { useActionState } from "react";
import { importLedger, type ImportState } from "./actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importLedger, null);
  return (
    <form action={action} className="card space-y-3">
      <input type="file" name="file" accept=".xlsx,.csv" required className="input" />
      <button disabled={pending} className="btn-primary">{pending ? "Importing…" : "Import"}</button>
      {state && (
        <div className={`rounded-md p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          <p className="font-medium">{state.message}</p>
          {state.errors && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
              {state.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
