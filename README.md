# Medfellow Finance

Payments and finance management for Medfellow Academy. See [PLAN.md](PLAN.md) for the original plan.

## What it does

| Area | Features |
|---|---|
| **Money In** | Receipts from students and others, any mode (UPI / bank / cash / card / gateway / cheque), screenshot upload, cash goes to the cash box automatically, Finance assigns bank accounts |
| **Students & fees** | Negotiated fee per student, discount, installments (equal or custom), pending and overdue tracking, edit plans later (logged) |
| **GST invoices** | One-click invoice from a receipt, CGST+SGST or IGST by state, yearly numbering `MFA/2026-27/0001`, print / save as PDF |
| **Money Out** | Payment requests with bill upload, per-department approval limit, Owner approval, Finance marks paid from an account, cancel, soft delete |
| **Vendors & staff** | Payee list with total paid |
| **Dashboard** | Month in/out/net, 6-month trend, department split, account balances, pending approvals, overdue fees |
| **Reports** | Filter by period and department, by department / category / month / mode, GST summary, cash book, Excel (CSV) export, print |
| **Budgets** | Monthly budget per department vs paid and pending spend |
| **Reconciliation** | Tick entries against the bank statement, compare balances |
| **Import** | Upload `.xlsx` / `.csv` of past records with row-by-row validation |
| **Audit log** | Who changed what and when (Owner) |

## Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In the **SQL editor** run, in order:
   1. [supabase/migrations/0001_foundation.sql](supabase/migrations/0001_foundation.sql)
   2. [supabase/migrations/0002_money.sql](supabase/migrations/0002_money.sql)
3. **Authentication → Providers → Email**: turn off "Confirm email".
4. Copy `.env.example` to `.env.local` and fill in the three values from **Project Settings → API**.
5. Run:

```bash
npm install
npm run dev
```

6. Open http://localhost:3000 and **Create account**. The first account becomes the Owner. Everyone after is inactive until the Owner activates them (or the Owner uses **Users → Create user**).
7. As Owner: **Settings → Company & GST** (GSTIN, state, SAC code, rate), **Accounts** (bank accounts with opening balances), **Departments** (approval limits), then create users.

## Roles

| Role | Access |
|---|---|
| Owner | Everything, approves payments, users, audit log |
| Finance | Everything except approvals, users and audit log |
| Department head | Their own department's entries, budget view |
| Department user | Only entries they created. Sales users also manage students, fee plans and invoices |
| Viewer / CA | Read-only across the company, exports |

Access rules are enforced in the database (row level security), not just hidden in the menu.

## Approval flow

`Request → (auto-approved if within the department limit, or Owner approves) → Finance marks paid → Reconciled`.
Payments created by the Owner are auto-approved. Leave a department's limit empty for no approval needed.

## Notes

- Money is stored in paise to avoid rounding errors.
- The SAC code `999293` and GST rate 18% are starting values. Confirm both with your CA.
- Fee plans are created from the Students page; the importer handles the money in/out ledger.
