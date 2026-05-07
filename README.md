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
- Set specific monthly payment dates for precise date-based payoff simulations
- **Live balance calculation** — balances are dynamically calculated on page load by simulating all payment cycles from the card's last-updated date to today; no manual tracking required
- Payment allocation prioritises the APR balance first, then balance transfers
- When all balance transfers are paid off, monthly payments automatically step up to the post-offer payment
- Edit any card to snapshot the current live balance as the new baseline
- Portfolio summary shows combined live debt, total monthly payments, and projected payoff timeline

### Budget & Finances
- **Income tracking** — add salary and additional income sources
- **Shared household bills** — add full bill amounts with configurable split percentage (50/50, 100%, 33%); your share is calculated automatically
- **Monthly expenses** — add personal fixed costs; flag any item as "Amex" to include it in the credit card projection
- **Leftover budget** — automatically calculated: Total Income − My share of bills − Monthly expenses − Debt monthly payments
- **Spending pie chart** — assign budget categories (with custom colours) to bills and expenses; a live conic-gradient pie chart shows your breakdown
- **Amex credit card tracker**:
  - Log recurring monthly card charges (subscriptions etc.)
  - Set a "day-to-day" budget by adding an Amex-flagged expense (e.g. £400 for food/fuel/leisure)
  - **Grocery shop tracker** — log individual shops with a name, total bill, and your personal portion; date-stamped
  - **Expected statement** = recurring payments + day-to-day budget + full grocery totals (partner pays back their share)
  - **My portion** = recurring + day-to-day + my grocery share only
  - Warning banner displayed when your grocery portion exceeds your day-to-day Amex budget

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
| GET | `/api/budget` | Fetch all budget data in one call |
| POST/PUT/DELETE | `/api/budget/incomes/:id?` | Manage income sources |
| POST/PUT/DELETE | `/api/budget/categories/:id?` | Manage budget categories |
| POST/PUT/DELETE | `/api/budget/shared-bills/:id?` | Manage shared household bills |
| POST/PUT/DELETE | `/api/budget/expenses/:id?` | Manage monthly expenses |
| POST/PUT/DELETE | `/api/budget/amex/recurring/:id?` | Manage recurring Amex payments |
| POST/PUT/DELETE | `/api/budget/amex/grocery/:id?` | Manage grocery shop entries |

All endpoints except register, login, and the calendar feed require an `Authorization: Bearer <token>` header.
