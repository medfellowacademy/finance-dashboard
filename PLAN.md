# Medfellow Academy – Finance & Payments Manager (Plan)

## 1. Goal
One place to record and track **every rupee in and out** of Medfellow Academy, split by department, with clear approvals, proof (receipts), and reports for the owner.

## 2. Core idea
Everything is a **Transaction**: either **Money IN** (received) or **Money OUT** (paid). Each transaction belongs to a **Department** and a **Category**, has an **Account** (bank / UPI / cash), and carries proof attachments. All dashboards and reports are views over this one ledger.

## 3. Money IN (received)
| Source | Details tracked |
|---|---|
| **Sales department – student/course payments** | Student/lead name, phone, course/batch, total fee, amount received, mode (UPI/bank/cash/card/gateway), reference no., received by (sales person), date, screenshot |
| **Installments** | Fee plan per student: due dates, paid vs pending, auto "overdue" flag, reminder list |
| **Other income** | Sponsorship, refunds received, interest, misc (category-based) |

Sales extras: per-salesperson collection totals, commission calculation (optional later), pending-fees follow-up list.

## 4. Money OUT (paid)
| Type | Examples |
|---|---|
| **Department payments** | Salaries/stipends, faculty/trainer payouts, marketing ad spend, content team, tech team |
| **Operations payments** | Platform/software subscriptions, hosting, zoom/tools, vendor bills, rent, internet |
| **Company expenses** | Office, travel, legal/CA fees, taxes (GST/TDS), insurance |
| **Miscellaneous** | One-off / uncategorised payments (must still carry a reason + proof) |

Each payment: payee (vendor/person), department, category, amount, tax (GST/TDS optional), mode, reference no., invoice/receipt upload, requested by, approved by, status.

**Payment workflow (recommended):** `Requested → Approved → Paid → Reconciled` (rejected/cancelled possible). Small amounts can auto-approve under a limit you set.

## 5. Master data
- **Departments:** Sales, Operations, Marketing, Academics/Faculty, Tech, HR/Admin, Finance (editable)
- **Categories** (tree under each department/type)
- **Accounts:** bank accounts, UPI IDs, cash box, payment-gateway wallet (opening balance each)
- **Parties:** students, vendors, employees/faculty
- **Courses/Batches** and **fee plans**

## 6. Users & roles
| Role | Can do |
|---|---|
| **Owner/Admin** | Everything, approve payments, see all reports, manage users |
| **Finance/Accountant** | Enter/edit transactions, reconcile, reports |
| **Sales** | Add received payments, see only own entries + pending fees |
| **Department head** | Raise payment requests, see own department's spend vs budget |
| **Viewer/CA** | Read-only + export |

Every edit/delete is **audit-logged** (who, when, old → new value). Deletes are soft-deletes.

## 7. Screens
1. **Dashboard** – this month in/out/net, account balances, pending approvals, overdue fees, department-wise spend chart, 6-month trend
2. **Money In** – list, filters, add receipt, student fee tracker
3. **Money Out** – list, filters, payment requests, approval queue
4. **Departments** – each dept's spend, budget vs actual
5. **Accounts** – balances, transfers between accounts, statement upload & reconcile
6. **Parties** – students / vendors / staff with their full payment history
7. **Reports** – daily cash book, monthly P&L-style summary, category report, dept report, pending receivables/payables, GST/TDS summary; export to Excel/PDF
8. **Settings** – users, departments, categories, accounts, approval limits

## 8. Suggested tech stack
- **Frontend:** Next.js + React + Tailwind (works on laptop and phone browser)
- **Backend/DB:** Supabase (Postgres, login, role-based security, file storage for receipts) – already connected in your tools
- **Charts:** Recharts; **Export:** Excel (xlsx) + PDF
- Currency **INR**, Indian number format, financial year Apr–Mar
- Hosting: Vercel (free tier to start)

## 9. Data model (main tables)
`users, roles` · `departments, categories` · `accounts` · `parties (student|vendor|employee)` · `courses, fee_plans, installments` · `transactions (type in/out, amount, date, account, department, category, party, mode, reference, status, created_by, approved_by)` · `attachments` · `payment_requests/approvals` · `budgets` · `audit_log`

Rule: amounts stored in paise (integers) – no rounding errors; account balance = opening + Σ in − Σ out.

## 10. Build phases
| Phase | Scope | Result |
|---|---|---|
| **1 – Foundation** | Login, roles, departments, categories, accounts | App skeleton, secure |
| **2 – Money In** | Receipts, student fee plans, installments, pending/overdue list | Sales team can record collections |
| **3 – Money Out** | Payments, vendors, receipts upload, approval workflow | All outgoing tracked |
| **4 – Dashboard & Reports** | Dashboard, dept reports, cash book, Excel/PDF export | Owner visibility |
| **5 – Control** | Budgets, bank reconciliation, audit log views, alerts | Tight control |
| **6 – Extras (optional)** | Razorpay/UPI auto-capture, bulk import from Excel, WhatsApp reminders, salary/payroll, GST filing helper | Automation |

Phase 1–4 = usable MVP.

## 11. Decisions (from your answers)
| Topic | Decision | Effect on the plan |
|---|---|---|
| Users | Sales, IT, HR, Finance, Operations departments each have users | One role per department; each person sees only their own department's data. Finance and Owner see everything |
| Student fees | Negotiated per student, installments common, charges can change | No fixed course price. The fee plan is set per student (total, discount, installments) and can be edited later with the change logged. Installment schedule and partial payments are core |
| Collection modes | UPI, bank transfer, cash, card and gateway | Payment mode is required on every receipt. Cash is tracked as its own account |
| GST | GST invoices/receipts needed | Phase 2 adds GST invoice generation: company GSTIN, state, SAC code, rate, CGST/SGST/IGST split, invoice numbering, PDF. Confirm rate and SAC code with your CA |
| Salaries | Recorded as simple payments | No payroll or PF module. Salary is a payment category under the department |
| Existing data | Excel/Sheets data exists | Import is moved up to Phase 2. We need to see the sheets first |
| Department heads | See only their own department | Row-level access rules in the database |
| Approval limits | Yes | Configurable limit per department. Payments above it go to the Owner for approval |
| Bank accounts | Multiple accounts plus cash | Number of accounts still to confirm |
| Platform | Web only | Responsive web app, no mobile app |

### Phase changes
- **Phase 2 (Money In)** now includes negotiated per-student fee plans, GST invoices and the Excel import.
- **Phase 3 (Money Out)** now includes per-department approval limits.
- Payroll is dropped from Phase 6.

## 12. Still open
1. How many bank accounts and cash points do you have? (Your answer was "yes".)
2. Please share a sample of the existing Excel/Sheets files (remove sensitive data if needed) so the import can be designed.
3. Your company GSTIN and registered state, and whether all courses carry the same GST rate.
4. The approval limit amount, and whether it differs by department.
5. Do you have a Razorpay account now? If yes, auto-capture of payments can be added later.

## 13. Original questions (answered above)
1. How many people will use it, and who is in each role (Sales, finance, you)?
2. Student fees: fixed price per course, or negotiated per student? Installments common?
3. Do you collect through Razorpay/payment gateway, or mostly UPI/bank transfer/cash?
4. Do you need GST invoices/receipts generated, or only record-keeping?
5. Salaries: record simply as payments, or full payroll (PF/TDS)?
6. Do you have existing data in Excel/Google Sheets to import?
7. Should department heads see only their own department?
8. Do you want approval limits (e.g. payments above ₹10,000 need owner approval)?
9. Multiple bank accounts / cash handling – how many?
10. Web only, or also a mobile app later?
