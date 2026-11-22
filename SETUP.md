# Corganiser — Setup Guide

## Prerequisites
- Node.js v18+
- A [Neon](https://neon.tech) PostgreSQL database (free tier is fine)
- A [Vercel](https://vercel.com) account (for deployment)

---

## Local Development

### 1. Install dependencies

```bash
# Root (API + Prisma)
npm install

# Frontend
cd client && npm install && cd ..
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `DATABASE_URL` — your Neon connection string
- `JWT_SECRET` — run `openssl rand -base64 48` to generate one
- `REGISTRATION_CODE` — the invite code you'll share with your partner

### 3. Push the database schema

```bash
npm run db:push
```

This creates all tables in your Neon database.

### 4. Start the dev server

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

### 5. Register your first account

Visit http://localhost:5173/register and use your `REGISTRATION_CODE` to create an account.

---

## Deploying to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
# Create a repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/corganiser.git
git push -u origin main
```

### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
2. Set the **Root Directory** to `/` (the repo root)
3. Add these **Environment Variables** in Vercel's dashboard:
   - `DATABASE_URL` — your Neon connection string
   - `JWT_SECRET` — your JWT secret
   - `REGISTRATION_CODE` — your invite code
   - `RESEND_API_KEY` — your Resend API key
   - `RESEND_FROM_EMAIL` — sender address e.g. `Corganiser <noreply@corganiser.co.uk>`
   - `TRUELAYER_CLIENT_ID` — your TrueLayer client ID
   - `TRUELAYER_CLIENT_SECRET` — your TrueLayer client secret
   - `TRUELAYER_ENV` — `live` or `sandbox`
   - `TRUELAYER_REDIRECT_URI` — (optional) explicit redirect URI e.g. `https://your-domain.vercel.app/api/truelayer/callback`
   - `CRON_SECRET` — secret string for securing Vercel Cron requests
   - `APP_URL` — your production frontend URL (e.g. `https://your-domain.vercel.app`)
4. In TrueLayer Console, add your Redirect URI:
   - `https://your-domain.vercel.app/api/truelayer/callback`
5. Deploy!

### 3. Run migrations on production

After deploying, run once in your local terminal (pointing at the production DB):

```bash
DATABASE_URL="your-neon-url" npm run db:push
```

Or use Neon's dashboard to verify the tables were created.

---

## Security

### Rate limiting
Login and register endpoints are rate-limited to **10 requests per IP per 15 minutes** using `express-rate-limit`. Exceeding the limit returns a `429 Too Many Requests` response.

> **Vercel note:** The rate limiter uses an in-memory store, so counters reset per serverless function instance. It works reliably in local development and provides partial protection in production. Vercel's built-in network-layer DDoS protection handles large volumetric attacks in production.

### Registration
Signup requires a `REGISTRATION_CODE` env var — only people with the code can create an account.

---

## Apple Calendar

Each user can subscribe to a live ICS feed of their tasks with due dates. To set it up:

1. Go to **Settings** in the app
2. Click **Get calendar link**
3. Click **Subscribe in Apple Calendar** — iOS/macOS will prompt to confirm

Tasks appear as all-day events on their due date. Apple Calendar refreshes roughly every hour; pull to refresh to force it. Works with any ICS-compatible app (Apple Calendar, Google Calendar, Outlook).

The feed token is a signed JWT valid for 1 year. Generate a new one from Settings at any time.

---

## Workout Planner

The workout module is self-contained and does not affect tasks or categories.

### Getting started
1. Navigate to **Workouts** in the sidebar
2. Go to **Exercise Library** → create your exercises (add YouTube/Vimeo video links for form guides)
3. Create a new **Plan** — choose days per week, configure each day type (Upper/Lower/Full Body/Cardio/Rest), and assign exercises with optional target sets/reps/weight
4. **Activate** the plan from the plans list
5. On the Workouts page, your active plan's days appear as cards — tap any day to start a workout

### Active workout flow
- Each exercise is shown one at a time with the last recorded values pre-filled
- Enter your actual sets, reps, and weight, then mark the exercise complete
- Set a rest timer (in minutes) — a beep sounds when time is up
- Work through all exercises; last values are saved automatically for next session

### Exercise categories & body areas
Default categories (Strength, Cardio, Mobility, HIIT, Flexibility) and body areas (Chest, Back, Shoulders, Arms, Legs, Core, Full Body) are auto-created on first use. You can add your own from the exercise creation form.

---

## Household & Family Sharing

Corganiser features a multi-tenant family model allowing multiple households to use the same instance independently.

### How it works
- **Membership**: Each user belongs to a `Family` as either `OWNER` or `MEMBER`.
- **Invite codes**: The household owner can copy or regenerate a unique family invite code (e.g. `FAM-XYZ123`). New or existing users can enter this code to join the household.
- **Data isolation**: Shared tasks (`isShared: true`), shared household bills, food shops, credit card live sync connections, and settlement emails are strictly isolated to members of that specific family.
- **Management UI**:
  - **Settings → Household**: View members, copy/regenerate invite code, rename household, or join a different household.
  - **Budget page**: Click the **Household** header button to view and manage the household roster without leaving the finance dashboard.

---

## Debt Calculator (DebtFlow)

Track and simulate payoff schedules across multiple credit cards and balance transfers.

- **Dynamic daily balances**: Tracks daily balances using the Average Daily Balance (ADB) method between statement dates and payment dates.
- **0% Balance transfer promotions**: Configure promotional 0% interest end dates and future payment step-ups.
- **Waterfall payoff allocation**: Simulates payments directed towards high APR interest balances first, then balance transfers.
- **Snapshot & recalculation**: Edit any card to snapshot the current balance as the new baseline.

---

## Budget & Shared Credit Card Statement Calculator

### Monthly Budget & Live Credit Card Budget Monitor
- **Income & fixed expenses**: Income, fixed monthly expenses, and shared household bills with custom split percentages (50/50, 100%, 33%).
- **Live Credit Card Budget Monitor**:
  - Connect up to two personal cards (**Primary** and **Secondary**) via TrueLayer Open Banking, isolated from the household shared settlement card.
  - Set a monthly **Budget Allowance** ceiling to monitor discretionary spending in real time.
  - **Statement Date Calculation**:
    - **Fixed day of month**: Statement closes on a specific day each month (e.g. 19th).
    - **Days before payment date**: Statement closing day is calculated relative to payment due date (e.g. 14 days prior).
    - Purchases on or before closing date count towards that statement; spending from the next day rolls into the new cycle.
  - **Statement Gap Deduction**: Automatically subtracts unpaid previous statement amounts from live bank balances during the closing-to-payment gap window.
  - **Credit Card Bills Deduction**: Automatically deducts recurring card subscriptions and card-flagged monthly expenses from live balances.
  - **Overspend alerts**: Visual spend velocity bar and banner alert when discretionary spend exceeds allowance.

### Shared Statement Calculator & Live Sync
- **Dynamic member & cardholder resolution**: Cardholder name is extracted directly from TrueLayer Open Banking (`name_on_card` / `display_name`). The calculator dynamically maps household members into "Who Paid?" selectors, computes individual balance splits, and addresses settlement emails to the exact resolved family members without hardcoded names.
- **TrueLayer live sync**: Automatically polls supplementary credit card transactions for each billing cycle (closing on the 19th).
  > **Note on Card Providers**: Designed around monthly statement cycles (closing on the 19th, settling on the 24th). If other providers share statement metadata via TrueLayer in the future, the polling logic can be adapted accordingly.
- **Automated settlement cron**: Runs on the **24th at 09:00 UTC** via Vercel Cron, giving a 5-day clearance window for pending authorizations and delayed merchant charges.
- **Resend email dispatch**: Automatically dispatches pre-statement reminders on the 18th and finalized itemized settlement summaries on the 24th using `noreply@corganiser.co.uk`.
- **Manual override**: If merchant discrepancies occur, leads can click **Manual Override** on any past export to adjust the statement spend. The system recalculates splits, updates records (`isOverridden: true`), and sends an amended settlement email to the family.

---

## API Summary

### Auth & Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register with registration code · rate limited |
| POST | /api/auth/login | No | Login → returns JWT · rate limited |
| PUT | /api/auth/update-password | Yes | Change password |
| GET | /api/users/me | Yes | Get own profile |
| PUT | /api/users/me | Yes | Update name/email |

### Tasks
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | /api/tasks | Yes | List (filterable) / create tasks (shared tasks scoped to family) |
| GET/PUT/DELETE | /api/tasks/:id | Yes | Read / update / delete task |
| GET/POST | /api/tasks/:id/updates | Yes | Notes log |
| GET/POST | /api/tasks/:id/time-logs | Yes | Time logging |

### Categories
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | /api/categories | Yes | List top-level categories with nested children / create |
| PUT/DELETE | /api/categories/:id | Yes | Update or delete category |

### Calendar
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/calendar/token | Yes | Generate a 1-year calendar feed token |
| GET | /api/calendar/feed?token= | No* | ICS feed for calendar apps |

### Workout Planner
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | /api/workout/exercise-categories | Yes | List / create exercise categories |
| PUT/DELETE | /api/workout/exercise-categories/:id | Yes | Update / delete category |
| GET/POST | /api/workout/body-areas | Yes | List / create body areas |
| PUT/DELETE | /api/workout/body-areas/:id | Yes | Update / delete body area |
| GET/POST | /api/workout/exercises | Yes | List / create exercises |
| GET/PUT/DELETE | /api/workout/exercises/:id | Yes | Read / update / delete exercise |
| GET/POST | /api/workout/plans | Yes | List / create workout plans |
| GET/PUT/DELETE | /api/workout/plans/:id | Yes | Read / update / delete plan |
| PATCH | /api/workout/plans/:id/activate | Yes | Set as the active plan |
| PATCH | /api/workout/day-exercises/:id/complete | Yes | Record completion (saves last sets/reps/weight) |

### Debt Calculator (DebtFlow)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | /api/debt/cards | Yes | List / create debt cards (with balance transfers) |
| PUT/DELETE | /api/debt/cards/:id | Yes | Update or delete debt card |

### Budget & Finances
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/budget/all | Yes | Fetch all budget data in one call |
| PUT | /api/budget/allowance | Yes | Update credit card allowance limit |
| POST/PUT/DELETE | /api/budget/incomes/:id? | Yes | Manage income sources |
| POST/PUT/DELETE | /api/budget/categories/:id? | Yes | Manage budget categories |
| POST/PUT/DELETE | /api/budget/shared-bills/:id? | Yes | Manage shared household bills |
| POST/PUT/DELETE | /api/budget/expenses/:id? | Yes | Manage monthly expenses |
| POST/PUT/DELETE | /api/budget/primary-card/recurring/:id? | Yes | Manage primary card recurring |
| POST/PUT/DELETE | /api/budget/primary-card/grocery/:id? | Yes | Manage grocery shops |
| POST/PUT/DELETE | /api/budget/secondary-cards/:id? | Yes | Manage secondary cards expenses |
| GET | /api/budget/calculator/state | Yes | Fetch live calculator state, active family members, and resolved cardholder names |
| GET/POST/DELETE | /api/budget/calculator/shops/:id? | Yes | Manage shared food shops (scoped to family) |
| GET/PUT | /api/budget/calculator/statement | Yes | Read / update statement amount for family |
| GET/POST | /api/budget/calculator/exports | Yes | View and create duplicate-safe exports for family |
| POST | /api/budget/calculator/exports/:id/override | Yes | Manually override exported month & re-send amended email to family |
| POST | /api/budget/calculator/settle | Yes | Settle month, dispatch emails strictly to family, and reset |

### Household & Family Sharing
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/family/current | Yes | Get current family details, members list, and invite code |
| POST | /api/family/join | Yes | Join a family using an invite code |
| PUT | /api/family/name | Yes | Rename the family (Owner only) |
| POST | /api/family/invite-code/regenerate | Yes | Regenerate family invite code (Owner only) |
| DELETE | /api/family/members/:userId | Yes | Remove a member from the family (Owner only) |

### TrueLayer Open Banking
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/truelayer/status | Yes | Current sync state, consent remaining, and card configs for shared, primary, and secondary cards |
| GET | /api/truelayer/auth-url | Yes | Generate OAuth authorization URL (`cardType = 'shared' \| 'primary' \| 'secondary'`) |
| GET/POST | /api/truelayer/callback | No* | OAuth callback to exchange authorization code and link to designated card slot |
| GET | /api/truelayer/cards | Yes | List cards connected under designated account (`cardType = 'shared' \| 'primary' \| 'secondary'`) |
| POST | /api/truelayer/config | Yes | Update card selection, statement date type (fixed vs days prior), closing day, and payment due day |
| GET | /api/truelayer/live-monitor | Yes | Aggregated live metrics, statement gap deductions, bill subtractions, and budget burn rate across cards |
| POST | /api/truelayer/sync-now | Yes | On-demand statement check & settlement for household shared card |
| POST | /api/truelayer/disconnect | Yes | Disconnect TrueLayer and clear tokens (`cardType = 'shared' \| 'primary' \| 'secondary' \| 'all'`) |

### Scheduled Crons
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/cron/precheck | Yes* | 18th pre-statement check reminder across active families |
| GET | /api/cron/settlement | Yes* | 24th monthly settlement & email runner across active families |

*\*The calendar feed authenticates via a signed query-string token. TrueLayer OAuth callback authenticates via OAuth state token. Cron endpoints authenticate via `Authorization: Bearer <CRON_SECRET>`.*

### Task filtering (`GET /api/tasks`)
| Param | Values | Notes |
|-------|--------|-------|
| `status` | `TODO`, `IN_PROGRESS`, `DONE` | |
| `priority` | `LOW`, `MEDIUM`, `HIGH` | |
| `categoryId` | category ID | Includes tasks tagged with any subcategory of that category |
| `shared` | `true` / `false` | Filter shared vs own tasks |
