export const fmtDate = (d: string | null | undefined): string =>
  d
    ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

/** First day of the month as YYYY-MM-01 for an ISO date or YYYY-MM string. */
export const monthStart = (d: string): string => d.slice(0, 7) + "-01";

export const monthLabel = (d: string): string =>
  new Date(d.slice(0, 7) + "-01T00:00:00").toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });

export const PAYMENT_MODES = ["upi", "bank", "cash", "card", "gateway", "cheque"] as const;
export const MODE_LABEL: Record<string, string> = {
  upi: "UPI",
  bank: "Bank transfer",
  cash: "Cash",
  card: "Card",
  gateway: "Payment gateway",
  cheque: "Cheque",
};

export const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  requested: "Awaiting approval",
  approved: "Approved – to pay",
  paid: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];
