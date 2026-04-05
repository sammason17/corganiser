# Organiser App

A personal task and project organiser for two users, built with React, Node/Express, and PostgreSQL (Neon). Tasks, projects, and categories are private by default and can be selectively shared between users.

## Stack

- **Frontend** — React + Vite + Tailwind CSS
- **Backend** — Express (Vercel Serverless Functions)
- **Database** — PostgreSQL via [Neon](https://neon.tech)
- **ORM** — Prisma
- **Auth** — JWT access tokens + bcrypt

## Features

- Private tasks with status (To Do / In Progress / Done), priority, due dates, and multi-project/category assignment
- Shared tasks, projects, and categories visible across both users
- Per-task notes log — append-only updates with timestamps and author
- Time logging per task with running totals
- Invite-code-protected registration (only people with the code can sign up)
- Board and list views with filtering by status, priority, project, and category

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

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register with invite code |
| POST | `/api/auth/login` | Login → JWT token |
| PUT | `/api/auth/update-password` | Change password |
| GET/PUT | `/api/users/me` | View / update profile |
| GET/POST | `/api/tasks` | List / create tasks |
| GET/PUT/DELETE | `/api/tasks/:id` | Manage a task |
| POST | `/api/tasks/:id/updates` | Add a note to a task |
| POST | `/api/tasks/:id/time-logs` | Log time on a task |
| GET/POST | `/api/projects` | List / create projects |
| GET/PUT/DELETE | `/api/projects/:id` | Manage a project |
| GET/POST | `/api/categories` | List / create categories |
| PUT/DELETE | `/api/categories/:id` | Manage a category |

All endpoints except register and login require an `Authorization: Bearer <token>` header.
