# My Life — Setup Guide

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
git remote add origin https://github.com/YOUR_USERNAME/my-life.git
git push -u origin main
```

### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
2. Set the **Root Directory** to `/` (the repo root)
3. Add these **Environment Variables** in Vercel's dashboard:
   - `DATABASE_URL` — your Neon connection string
   - `JWT_SECRET` — your JWT secret
   - `REGISTRATION_CODE` — your invite code
4. Deploy!

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

## API Summary

### Auth & Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register with invite code · rate limited |
| POST | /api/auth/login | No | Login → returns JWT · rate limited |
| PUT | /api/auth/update-password | Yes | Change password |
| GET | /api/users/me | Yes | Get own profile |
| PUT | /api/users/me | Yes | Update name/email |

### Tasks
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | /api/tasks | Yes | List (filterable) / create tasks |
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

*The calendar feed authenticates via a signed query-string token as calendar apps cannot send `Authorization` headers.

### Task filtering (`GET /api/tasks`)
| Param | Values | Notes |
|-------|--------|-------|
| `status` | `TODO`, `IN_PROGRESS`, `DONE` | |
| `priority` | `LOW`, `MEDIUM`, `HIGH` | |
| `categoryId` | category ID | Includes tasks tagged with any subcategory of that category |
| `shared` | `true` / `false` | Filter shared vs own tasks |
