# My Life

A personal life organiser built with React, Node/Express, and PostgreSQL (Neon). Manage tasks, track time, plan workouts, track monthly finances, and pay off debt — all in one place. Deploy your own instance, set a registration code, and share it with whoever you want.

## Stack

- **Frontend** — React + Vite + Tailwind CSS
- **Backend** — Express (Vercel Serverless Functions)
- **Database** — PostgreSQL via [Neon](https://neon.tech)
- **ORM** — Prisma
- **Auth** — JWT access tokens + bcrypt

## Features

### Tasks
- Private tasks with status (To Do / In Progress / Done), priority, due dates, and multi-category assignment
- Shared tasks and categories visible across both users
- Per-task notes log — append-only updates with timestamps and author
- Time logging per task with running totals
- Board and list views with filtering by status, priority, and category
- Invite-code-protected registration

### Calendar
- Subscribe to a live ICS feed of tasks with due dates in Apple Calendar, Google Calendar, or any ICS-compatible app
- Feed token generated from Settings, valid for 1 year

### Workout Planner
- **Exercise Library** — create exercises with name, YouTube/Vimeo video embed, categories, and body areas
- **Plan Builder** — multi-step wizard: name your plan, set days per week, configure each day and assign exercises with target sets/reps/weight
- **Active Workout** — work through exercises sequentially; view last session values; enter actual sets/reps/weight; rest timer between exercises
- Last-session values stored per exercise

### Debt Calculator (DebtFlow)
- Add and manage credit cards with total balances, APR, and monthly payment amounts
- Track 0% balance transfer offers with exact expiration dates and post-offer payment increases
- Set specific monthly **payment dates** and **statement dates** to pinpoint-calculate interest using the **Average Daily Balance** method, perfectly mirroring real banks
- **Live balance calculation** — balances are dynamically calculated day-by-day from the card's last-updated date to today; no manual tracking required
- Payment allocation prioritises the APR balance first, then balance transfers
- When all balance transfers are paid off, monthly payments automatically step up to the post-offer payment
- Edit any card to snapshot the current live balance as the new baseline
- Portfolio summary shows combined live debt, total monthly payments, and projected payoff timeline

### Budget & Finances
- **Income tracking** — add salary and additional income sources
- **Shared household bills** — add full bill amounts with configurable split percentage (50/50, 100%, 33%); your share is calculated automatically
- **Monthly expenses** — add personal fixed costs; flag any item as "Credit Card" to include it in the credit card projection
- **Leftover budget** — automatically calculated: Total Income − My share of bills − Monthly expenses − Debt monthly payments
- **Spending pie chart** — assign budget categories (with custom colours) to bills and expenses; a live conic-gradient pie chart shows your breakdown
- **Credit Card Projection**:
  - Define an explicit **"Credit Card Allowance"** for your day-to-day spending limit (food, fuel, leisure)
  - Log recurring monthly card charges (subscriptions, bills) with configurable full vs. **personal portion** splits
  - **Grocery shop tracker** — log individual shops with a name, total bill, and your personal portion; date-stamped
  - **Non-Card expenses** — log additional expenses made on other accounts that should still count towards your day-to-day spending limit
  - **Expected statement** = full recurring payments + full grocery totals + fixed card expenses
  - **Financial breakdown** = cleanly isolates your fixed commitments from your flexible day-to-day spend
  - Overspend warning banner strictly monitors your day-to-day spend (grocery portions + non-card) against your Monthly Allowance limit
- **Shared Credit Card Statement Calculator & Automation**:
  - Track shared food/grocery shops between family members with custom covered amounts.
  - **Account Live Sync (TrueLayer)**: Connects the supplementary card account, isolates charges for each billing cycle (20th–19th), and auto-populates the statement spend with zero manual math.
  - > **Note on Card Providers**: The shared calculator and live sync were designed around American Express's monthly statement cycle (closing on the 19th and settling on the 24th). If other credit card providers expose additional statement metadata via TrueLayer Open Banking in the future, the sync service can be extended to poll them; currently, live sync polling is optimized around this cycle.
  - **Settlement Timing & 24th Cron Schedule**:
    - Statements close on the **19th** of each month (covering transactions from the 20th of the previous month to the 19th of the current month).
    - The automated settlement cron runs on the **24th at 09:00 UTC** (`0 9 24 * *`) — giving a 5-day buffer for all weekend purchases, pending authorizations, and delayed merchant charges (e.g. Amazon dispatch-based billing) to fully clear before month-end payday.
  - **Auto-Export & Deduplication**: Archives monthly settlements under default `[Month]-[Year]` format (e.g. `November-2026`) and automatically increments duplicate exports (`November-2026-1`, etc.).
  - **Auto-Reset**: Clears shops and resets the calculator state cleanly for the fresh month once settled.
  - **Automated Email Dispatch (Resend)**:
    - Pre-check reminder email sent to household leads on the 18th before the credit card statement cycle closes on the 19th.
    - Monthly settlement summary email sent strictly to members of that specific family with itemized shop splits and the final amount owed.
  - **True Manual Override**:
    - When viewing any previously exported month, click **Manual Override** to amend the statement spend if an outlier or merchant discrepancy occurs.
    - Live recalculation preview keeps all recorded shared grocery splits intact and updates the final amount owed.
    - Updates the archive record (`isOverridden: true`), displays an `• [Amended]` badge in the UI, and immediately dispatches an amended statement email (`Credit Card Settlement (Amended) — [Month-Year]`) to family members with an amber manual override notice.
  - **Vercel Cron Integration**: Runs automated pre-check (18th) and settlement (24th) crons securely in production via `CRON_SECRET`.
- **Household & Family Sharing**:
  - Multi-tenant household isolation: Users belong to a `Family` with role management (`OWNER`, `MEMBER`) and unique invite codes (e.g. `FAM-XYZ123`).
  - Shared card connections, food shop logs, and settlement summaries are isolated per family — keeping all financial data and email communications strictly private to that household.

## Local Development

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Copy env file and fill in values
cp .env.example .env

# Push schema to database
npm run db:push

# Start dev server
npm run dev
```

Frontend runs at `http://localhost:5173`, API at `http://localhost:3001`.

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `JWT_SECRET` | Long random secret for signing tokens |
| `JWT_EXPIRES_IN` | Token expiry e.g. `7d` |
| `REGISTRATION_CODE` | Invite code required to register |
| `RESEND_API_KEY` | Resend API key for automated emails |
| `RESEND_FROM_EMAIL` | Sender address e.g. `Corganiser <sam@goardr.com>` |
| `TRUELAYER_CLIENT_ID` | TrueLayer Data API client ID |
| `TRUELAYER_CLIENT_SECRET` | TrueLayer Data API client secret |
| `TRUELAYER_ENV` | TrueLayer environment: `live` or `sandbox` |
| `TRUELAYER_REDIRECT_URI` | (Optional) Explicit OAuth redirect URI |
| `CRON_SECRET` | Secret token to authorize Vercel Cron jobs |
| `APP_URL` | Frontend URL for OAuth redirects (e.g. `https://your-domain.vercel.app` or `http://localhost:5173`) |

## Deploying to Vercel

1. Push to GitHub
2. Import the repo in Vercel — set root directory to `/`
3. Add the environment variables above in Vercel's project settings
4. Deploy

> **Note:** After any schema changes, run `npm run db:push` locally (pointing at your production Neon DB) before deploying, so the live database is in sync before the new serverless function goes live.

## API Overview

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register with invite code |
| POST | `/api/auth/login` | Login → JWT token |
| PUT | `/api/auth/update-password` | Change password |
| GET/PUT | `/api/users/me` | View / update profile |

### Tasks & Categories
| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/tasks` | List (filterable) / create tasks |
| GET/PUT/DELETE | `/api/tasks/:id` | Manage a task |
| POST | `/api/tasks/:id/updates` | Add a note to a task |
| POST | `/api/tasks/:id/time-logs` | Log time on a task |
| GET/POST | `/api/categories` | List / create categories |
| PUT/DELETE | `/api/categories/:id` | Manage a category |

### Calendar
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/calendar/token` | Generate calendar feed token |
| GET | `/api/calendar/feed?token=` | ICS feed for calendar apps |

### Workout Planner
| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/workout/exercises` | List / create exercises |
| GET/PUT/DELETE | `/api/workout/exercises/:id` | Manage an exercise |
| GET/POST | `/api/workout/plans` | List / create workout plans |
| GET/PUT/DELETE | `/api/workout/plans/:id` | Manage a plan |
| PATCH | `/api/workout/plans/:id/activate` | Set as active plan |
| PATCH | `/api/workout/day-exercises/:id/complete` | Record exercise completion |

### Debt Calculator
| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/debt/cards` | List / create debt cards (includes balance transfers) |
| PUT/DELETE | `/api/debt/cards/:id` | Manage a debt card |

### Budget & Finances
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/budget/all` | Fetch all budget data in one call |
| PUT | `/api/budget/allowance` | Update the user's credit card allowance limit |
| POST/PUT/DELETE | `/api/budget/incomes/:id?` | Manage income sources |
| POST/PUT/DELETE | `/api/budget/categories/:id?` | Manage budget categories |
| POST/PUT/DELETE | `/api/budget/shared-bills/:id?` | Manage shared household bills |
| POST/PUT/DELETE | `/api/budget/expenses/:id?` | Manage monthly expenses |
| POST/PUT/DELETE | `/api/budget/amex/recurring/:id?` | Manage recurring credit card payments |
| POST/PUT/DELETE | `/api/budget/amex/grocery/:id?` | Manage grocery shop entries |
| POST/PUT/DELETE | `/api/budget/non-amex/:id?` | Manage non-card expenses |
| GET/POST/DELETE | `/api/budget/calculator/shops/:id?` | Manage shared food shops (scoped to family) |
| GET/PUT | `/api/budget/calculator/statement` | Read / update statement amount for family |
| GET/POST | `/api/budget/calculator/exports` | View and create duplicate-safe exports for family |
| POST | `/api/budget/calculator/exports/:id/override` | Manually override exported month & re-send amended email to family |
| POST | `/api/budget/calculator/settle` | Settle month, dispatch emails strictly to family, and reset |

### Household & Family Sharing
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/family/current` | Get current family details, members list, and invite code |
| POST | `/api/family/join` | Join a family using an invite code |
| PUT | `/api/family/name` | Rename the family (Owner only) |
| POST | `/api/family/invite-code/regenerate` | Regenerate family invite code (Owner only) |
| DELETE | `/api/family/members/:userId` | Remove a member from the family (Owner only) |

### TrueLayer Open Banking
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/truelayer/status` | Current sync state and consent remaining for family |
| GET | `/api/truelayer/auth-url` | Generate OAuth authorization URL (encodes familyId in state) |
| GET/POST | `/api/truelayer/callback` | OAuth callback to exchange authorization code and link to family |
| GET | `/api/truelayer/cards` | List cards connected under family account |
| POST | `/api/truelayer/config` | Update card account ID for family |
| POST | `/api/truelayer/sync-now` | On-demand statement check & settlement for family |
| POST | `/api/truelayer/disconnect` | Disconnect TrueLayer and clear tokens for family |

### Scheduled Crons
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/cron/amex-precheck` | 18th pre-statement check reminder across active families (Bearer CRON_SECRET) |
| GET | `/api/cron/amex-settlement` | 24th monthly settlement & email runner across active families (Bearer CRON_SECRET) |

All endpoints except register, login, the calendar feed, and OAuth callback require an `Authorization: Bearer <token>` header.
