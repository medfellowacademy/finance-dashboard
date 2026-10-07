import { toPaise } from "@/lib/money";

export type ScheduleItem = { due_date: string; amount_paise: number };

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Equal installments; the last one absorbs the rounding remainder. */
export function equalSchedule(payable: number, count: number, firstDue: string, everyDays: number): ScheduleItem[] {
  const base = Math.floor(payable / count);
  return Array.from({ length: count }, (_, i) => ({
    due_date: addDays(firstDue, i * everyDays),
    amount_paise: i === count - 1 ? payable - base * (count - 1) : base,
  }));
}

/** Parses lines like "2026-11-05, 15000" or "2026-11-05 15000". */
export function parseCustomSchedule(text: string): ScheduleItem[] | string {
  const items: ScheduleItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d{4}-\d{2}-\d{2})[\s,;:]+([\d.,]+)$/);
    if (!m) return `Cannot read line "${line}". Use: YYYY-MM-DD, amount`;
    const amount = toPaise(m[2].replace(/,/g, ""));
    if (!(amount > 0)) return `Amount must be greater than zero in "${line}"`;
    items.push({ due_date: m[1], amount_paise: amount });
  }
  return items.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

/** Allocates paid money to installments in order (oldest first). */
export function allocate(
  installments: { id: string; seq: number; due_date: string; amount_paise: number }[],
  paid: number,
  today: string,
) {
  let left = paid;
  return [...installments]
    .sort((a, b) => a.seq - b.seq)
    .map((i) => {
      const covered = Math.min(left, Number(i.amount_paise));
      left -= covered;
      const status =
        covered >= Number(i.amount_paise) ? "paid" : i.due_date < today ? "overdue" : covered > 0 ? "partial" : "pending";
      return { ...i, covered, status };
    });
}
