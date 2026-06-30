# ShipFlow — AI-Powered Feature Delivery Platform

ShipFlow automates the entire software feature delivery pipeline — from customer feature request to shipped code — using AI agents at every step. Built as a production-grade SaaS for modern product and engineering teams.

## The Core Loop

```
Feature Request → AI Clarification → PRD → Engineering Tasks → Code → AI Review → Fixes → Re-Review → Human Approval → Ship 🚀
```

## Features

- **Multi-source ingest**: Accept feature requests via in-app form, email, support ticket, or chat API
- **AI-powered discovery**: Agent probes for target users, core pain, success metrics, and scope boundaries
- **Duplicate detection**: AI checks if the requested feature already exists before generating a PRD
- **Automated PRD generation**: Structured PRDs with problem statement, user stories, testable acceptance criteria, edge cases, and success metrics
- **Smart task planning**: PRDs broken into 8–15 tech-stack-aware Kanban engineering tasks with complexity estimates
- **Real GitHub integration**: Live PR tracking via webhooks, diff fetching with Octokit, review comments posted back to GitHub
- **QA validation pass**: Each acceptance criterion checked individually (PASS/FAIL/PARTIAL) before general code review
- **AI code review**: PRs reviewed against PRD requirements, security, performance, edge cases — with WHY explanations for every issue
- **Fix loop**: Issues returned to developers, code re-reviewed automatically on new commits
- **Release readiness AI**: Checks task completion, blocker count, and review history before human approval
- **Human approval gate**: Reviewers see full PRD, tasks, PRs, AI review history, and a 5-item checklist before approving
- **Multi-tenant SaaS**: Workspaces with isolated users, projects, repos, billing, and review history
- **Razorpay billing**: Free / Pro / Enterprise plans with AI credit limits and repository limits
- **Workflow progress**: Step-level visibility into running AI workflows (shown in real-time in the UI)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| API | tRPC v11 (end-to-end type safety) |
| Database | PostgreSQL + Prisma ORM |
| Auth | BetterAuth (email/password + GitHub OAuth) |
| UI | Shadcn UI + Tailwind CSS |
| AI | AI SDK (Vercel) + Google Gemini 1.5 Flash |
| Async workflows | Inngest |
| GitHub | Octokit + GitHub App + Webhooks |
| Billing | Razorpay |
| Monorepo | Turborepo + pnpm workspaces |
| Deployment | Vercel |

## Architecture

```
shipflow/
├── apps/
│   └── web/                         # Next.js app (all pages + API routes)
│       └── src/
│           ├── app/
│           │   ├── (auth)/          # /sign-in, /sign-up
│           │   ├── (app)/           # Authenticated app shell
│           │   │   ├── dashboard/   # Workspace dashboard
│           │   │   └── w/[slug]/    # Per-workspace pages
│           │   │       ├── page.tsx            # Workspace home
│           │   │       ├── projects/           # Project list + feature requests
│           │   │       │   └── [projectId]/
│           │   │       │       └── features/[featureId]/  # Full feature workflow page
│           │   │       ├── github/             # GitHub integration + repos
│           │   │       ├── reviews/            # AI review history
│           │   │       ├── billing/            # Plan management
│           │   │       └── settings/           # Workspace + member management
│           │   ├── api/trpc/        # tRPC HTTP handler
│           │   ├── api/auth/        # BetterAuth handler
│           │   ├── api/inngest/     # Inngest serve endpoint
│           │   └── api/webhooks/
│           │       ├── github/      # GitHub webhook handler (PR events)
│           │       └── razorpay/    # Razorpay payment webhook
│           ├── components/          # Sidebar, KanbanBoard, UI primitives
│           ├── lib/                 # trpc client, auth client, utils
│           └── providers/           # TRPCProvider, ThemeProvider
│
└── packages/
    ├── api/                         # tRPC routers + Inngest workflows
    │   └── src/
    │       ├── routers/             # workspace, project, featureRequest, prd,
    │       │                        # task, repository, review, release, billing
    │       ├── workflows/           # Inngest functions:
    │       │   ├── featureRequest.ts  # Discovery + clarification
    │       │   ├── prd.ts             # PRD generation
    │       │   ├── tasks.ts           # Task generation
    │       │   ├── review.ts          # AI code review + QA validation
    │       │   ├── release.ts         # Release readiness check
    │       │   └── repository.ts      # Repository analysis
    │       ├── trpc.ts              # tRPC init + context + session middleware
    │       ├── auth.ts              # BetterAuth config (Prisma adapter)
    │       ├── github.ts            # Octokit helpers (diff, comment, PR list)
    │       └── inngest.ts           # Inngest client
    └── db/
        ├── prisma/schema.prisma     # Complete database schema
        └── src/index.ts            # Prisma client singleton
```

## Database Schema

### Core relations

```
Workspace → WorkspaceMember → User
Workspace → Project → FeatureRequest → PRD → EngineeringTask
Workspace → Repository → PullRequest → AIReview → ReviewIssue
FeatureRequest → Release (human approval + shipping)
Workspace → GithubInstallation (GitHub App install)
Workspace → Billing (plan, credits, limits)
```

### Key models

| Model | Purpose |
|-------|---------|
| `FeatureRequest` | Central entity. Holds status, AI conversation (`aiMessages` JSON), links to PRD and Release |
| `PRD` | Structured requirements: problem, goals, nonGoals, userStories, acceptanceCriteria, edgeCases, successMetrics |
| `EngineeringTask` | Kanban cards with priority (LOW/MEDIUM/HIGH/CRITICAL) and status (TODO/IN_PROGRESS/DONE) |
| `PullRequest` | GitHub PR data synced via webhooks |
| `AIReview` | Review result: verdict (APPROVED/NEEDS_CHANGES/BLOCKED), requirementsCoverage %, status |
| `ReviewIssue` | Individual issues: category, severity (BLOCKING/NON_BLOCKING), description, suggestion |
| `Release` | Approval gate: readinessReport JSON, readinessScore, approvedAt, status |
| `Billing` | Plan, aiCreditsUsed/Limit, repoLimit, Razorpay IDs |

### Feature Status State Machine

```
DISCOVERY → PRD_GENERATING → PRD_READY → PLANNING → IN_DEVELOPMENT
         → IN_REVIEW → FIX_NEEDED → (back to IN_REVIEW on new commits)
         → HUMAN_REVIEW → APPROVED → SHIPPED
                       → REJECTED
```

See `packages/db/prisma/schema.prisma` for complete schema with all enums.

## Setup Instructions

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL database (local or cloud)
- GitHub App (for repository integration)
- Google AI API key (Gemini)
- Inngest account (free tier works for development)
- Razorpay account (test keys for development)

### 1. Clone and install

```bash
git clone https://github.com/your-org/shipflow
cd shipflow
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example apps/web/.env.local
# Fill in all values — see Environment Variables section below
```

### 3. Set up the database

```bash
cd packages/db
npx prisma migrate dev --name init   # Create tables
npx prisma generate                   # Generate Prisma client
```

Or push schema directly (no migration history):

```bash
npx prisma db push
```

### 4. Run development server

```bash
pnpm dev
```

### 5. Start Inngest dev server (separate terminal)

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Visit `http://localhost:3000`

## Environment Variables

```env
# ── Database ──────────────────────────────────────────────────────────────
DATABASE_URL="postgresql://user:password@localhost:5432/shipflow"

# ── Auth (BetterAuth) ─────────────────────────────────────────────────────
BETTER_AUTH_SECRET="generate-with: openssl rand -base64 32"
BETTER_AUTH_URL="http://localhost:3000"

# ── GitHub OAuth (BetterAuth social login) ────────────────────────────────
GITHUB_CLIENT_ID="your-oauth-app-client-id"
GITHUB_CLIENT_SECRET="your-oauth-app-client-secret"

# ── GitHub App (repository integration + webhooks) ────────────────────────
GITHUB_APP_ID="123456"
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_WEBHOOK_SECRET="your-webhook-secret"
GITHUB_APP_CLIENT_ID="Iv1.xxxxxxxxxxxxxxxx"
GITHUB_APP_CLIENT_SECRET="your-github-app-oauth-client-secret"

# ── AI (Google Gemini via AI SDK) ─────────────────────────────────────────
GOOGLE_GENERATIVE_AI_API_KEY="AIzaSy..."

# ── Inngest ───────────────────────────────────────────────────────────────
INNGEST_EVENT_KEY="your-inngest-event-key"
INNGEST_SIGNING_KEY="signkey-prod-..."

# ── Razorpay ──────────────────────────────────────────────────────────────
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="your-razorpay-secret"
RAZORPAY_WEBHOOK_SECRET="your-razorpay-webhook-secret"

# ── Public (exposed to browser) ───────────────────────────────────────────
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_..."
NEXT_PUBLIC_GITHUB_APP_NAME="your-github-app-slug"
```

## GitHub Integration Setup

### Creating the GitHub App

1. Go to **GitHub Settings → Developer Settings → GitHub Apps → New GitHub App**
2. Fill in:
   - **App name**: e.g., `ShipFlow`
   - **Homepage URL**: your app URL
   - **Callback URL**: `https://your-domain.com/api/github/callback`
   - **Post-installation URL**: `https://your-domain.com/api/github/callback`
   - **Webhook URL**: `https://your-domain.com/api/webhooks/github`
   - **Webhook secret**: run `openssl rand -hex 20` and save it
3. Set **Permissions**:
   - Repository → Contents: **Read**
   - Repository → Pull requests: **Read & write**
   - Repository → Issues: **Read & write**
4. Subscribe to **Events**: Pull request, Push
5. Click **Create GitHub App**
6. Generate a **Private Key** and download the `.pem` file
7. Note the **App ID** from the app settings page

### Configuring the environment

```bash
# App ID
GITHUB_APP_ID=123456

# Private key (replace actual newlines with \n)
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"

# Webhook secret (from step 2)
GITHUB_APP_WEBHOOK_SECRET="your-secret"

# OAuth credentials (from the app's OAuth tab)
GITHUB_APP_CLIENT_ID="Iv1.xxxx"
GITHUB_APP_CLIENT_SECRET="xxxx"
```

### How webhooks work

The GitHub webhook handler at `/api/webhooks/github` processes:
- `installation.created` → saves `GithubInstallation` record to DB
- `installation.deleted` → removes the installation from DB
- `pull_request.opened/reopened` → creates/updates `PullRequest` record, detects linked feature from branch name, triggers AI review via Inngest
- `pull_request.synchronize` → detects new commits, re-triggers AI review workflow, moves feature from FIX_NEEDED → IN_REVIEW

All webhook payloads are verified via HMAC-SHA256 signature before processing.

## Inngest Workflow Explanation

ShipFlow uses Inngest for all long-running AI processes. Each function is durable — if a step fails, Inngest retries it automatically. Progress of each step is written to `FeatureRequest.aiMessages` and shown in the UI in real time.

| Inngest Function | Event Trigger | Steps |
|-----------------|---------------|-------|
| `feature-request-created` | `feature-request/created` | Analyze request → detect BUILD/EDUCATE/DUPLICATE → generate clarifying questions → save to DB |
| `feature-request-message` | `feature-request/message` | Parse conversation history → generate contextual response → detect PRD readiness |
| `prd-generate` | `prd/generate` | Load context → AI generates structured PRD (7 sections) → save to DB → update status |
| `tasks-generate` | `tasks/generate` | Load PRD + repo tech stack → AI generates 8–15 tasks → save to Kanban board |
| `repository-analyze` | `repository/analyze` | Fetch repo metadata from GitHub → AI analyzes tech stack, conventions, review checklist → save to repo metadata |
| `review-run` | `review/run` | Fetch PR + PRD → download live diff → QA validation (per-AC pass/fail) → code review → save issues → post GitHub comment → update feature status → decrement AI credits |
| `pr-synchronize` | `github/pull_request.synchronize` | Create new AIReview record → trigger `review/run` |
| `release-readiness` | `release/readiness-check` | Load feature + tasks + PRs → analyze completion and blockers → AI release recommendation → save readiness report |

### Workflow step visibility

Each `step.run()` call writes the current step name to `FeatureRequest.aiMessages` as a `{ role: "workflow", step, steps[] }` entry. The UI polls every 1.5s during active workflows and shows a real-time step tracker with completed/active/pending indicators. The workflow entry is removed when the workflow completes.

## AI Features Implemented

All AI features use **Google Gemini 1.5 Flash** via the Vercel AI SDK (`@ai-sdk/google`).

### 1. Requirement Clarification (`routers/featureRequest.ts` — `create` + `sendMessage`)

When a feature request is created, the AI:
- Detects if the feature already exists in ShipFlow (DUPLICATE)
- Determines if the user needs education about existing functionality (EDUCATE)
- Otherwise marks it as BUILD and generates targeted clarifying questions

The `sendMessage` clarification agent probes for 6 specific gaps — one question at a time:
1. Target users (who, how many)
2. Core pain (specific problem, current workaround)
3. Success metrics (measurable numbers)
4. Scope boundaries (what's explicitly out of scope)
5. Edge cases (failure modes, concurrent access)
6. Priority and deadline

Sets `readyForPRD=true` only when target users are named, pain is specific, and at least 2 measurable success criteria exist.

### 2. PRD Generation (`workflows/prd.ts` + `routers/featureRequest.ts`)

Generates a structured 7-section PRD with per-section quality standards:
- **Problem statement**: WHO/WHAT/WHY with measurable impact
- **Goals**: Specific and time-bound (e.g., "Reduce p99 latency from 2s to 200ms by Q3")
- **Non-goals**: 3–5 items explicitly out of scope to prevent scope creep
- **User stories**: "As a [role], I want to [action], so that [measurable benefit]"
- **Acceptance criteria**: Binary pass/fail, testable by QA (Given/When/Then format)
- **Edge cases**: Feature-specific (concurrent access, empty states, permission boundaries, rate limits)
- **Success metrics**: Baseline + target + measurement method + timeframe

### 3. Task Generation (`workflows/tasks.ts` + `routers/task.ts`)

Generates 8–15 engineering tasks from a PRD:
- Pulls the connected repository's tech stack from the AI analysis metadata
- Creates tech-stack-aware tasks (e.g., "Add tRPC mutation for X" not just "add API endpoint")
- Assigns complexity (XS/S/M/L/XL) and dependency ordering
- Covers: DB schema, API layer, frontend components, error handling, tests (unit + integration), edge cases

### 4. Repository Analysis (`workflows/repository.ts`)

When a repository is connected, the AI:
- Fetches real metadata from GitHub (languages, root files, `package.json` dependencies)
- Produces: tech stack, frameworks, architecture pattern, testing setup, CI/CD presence
- Generates a `reviewChecklist` — items the AI reviewer should always check for this repo, with WHY
- Generates `recommendations` — specific actionable improvements with WHY they matter for this stack

Output is stored in `Repository.metadata` and used to enrich task generation and code reviews.

### 5. QA Validation (`workflows/review.ts` — `qa-validation` step)

A dedicated QA pass that runs **before** the general code review:
- For each acceptance criterion in the PRD, determines PASS / FAIL / PARTIAL
- Requires **evidence**: the specific file/line that proves PASS, or exactly what's missing for FAIL/PARTIAL
- Failing ACs become `ACCEPTANCE_CRITERIA` BLOCKING issues with WHY explanations
- Results are merged into the main review issue list

### 6. AI Code Review (`workflows/review.ts` — `run-review` step)

After QA validation, runs a comprehensive code review:
- Reviews security vulnerabilities, performance regressions, unhandled edge cases, missing error handling
- For every issue: explains **WHY it is a problem and what breaks in production**
- Provides **specific, actionable fixes** (with example code when helpful)
- Categorizes: BLOCKING (must fix before merge) vs NON_BLOCKING (should fix, can merge)
- Calculates `requirementsCoverage` percentage
- Posts a formatted review comment directly to the GitHub PR via Octokit
- Updates feature status: APPROVED → HUMAN_REVIEW, NEEDS_CHANGES/BLOCKED → FIX_NEEDED

### 7. Release Readiness Check (`workflows/release.ts`)

Before human approval, the AI:
- Checks task completion rate and lists any CRITICAL-priority tasks still in TODO
- Checks open blocking issues from the latest AI review
- Verifies that at least one PR has been reviewed
- Produces: readiness score (0–100), specific blockers with WHY they are production risks, warnings, recommendation (SHIP/HOLD/FIX_REQUIRED)
- Output is shown in the Release tab for human reviewers

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — features, workflow steps, pricing |
| `/sign-in`, `/sign-up` | Authentication (email/password or GitHub OAuth) |
| `/onboarding` | Create first workspace (redirects after auth) |
| `/dashboard` | All workspaces for the logged-in user |
| `/w/[slug]` | Workspace dashboard with recent activity |
| `/w/[slug]/projects` | Project list |
| `/w/[slug]/projects/[id]` | Feature request list (filterable by status) |
| `/w/[slug]/projects/[id]/features/[id]` | Feature workflow — 5 tabs: Discovery, PRD, Tasks, Development, Release |
| `/w/[slug]/github` | GitHub App installation + connected repositories |
| `/w/[slug]/github/[repoId]/pulls` | PR list + manual AI review trigger |
| `/w/[slug]/reviews` | Workspace-wide AI review history |
| `/w/[slug]/reviews/[reviewId]` | Full review with all issues, suggestions, categories |
| `/w/[slug]/billing` | Plan management, AI credits usage, Razorpay upgrade |
| `/w/[slug]/settings` | Workspace settings + RBAC member management |

## Deployment

### Vercel (recommended)

1. Import the repository to Vercel
2. Set all environment variables in the Vercel dashboard
3. Add a PostgreSQL database (Vercel Postgres, Neon, or Supabase)
4. Set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to your production domain
5. Update the GitHub App's **Webhook URL** and **Callback URL** to your production domain
6. Connect Inngest to production via the Inngest Cloud dashboard

```bash
# Sync Inngest functions after deploy
npx inngest-cli@latest deploy --url https://your-app.vercel.app/api/inngest
```

### Database migration

```bash
# On first deploy (or after schema changes)
DATABASE_URL="your-prod-url" npx prisma migrate deploy
```

## Billing Plans

| Plan | Price | AI Reviews/month | Repositories | Feature Requests/month |
|------|-------|------------------|--------------|----------------------|
| Free | ₹0 | 10 | 1 | 10 |
| Pro | ₹1,999/mo | 100 | 10 | Unlimited |
| Enterprise | ₹9,999/mo | Unlimited | Unlimited | Unlimited |

Billing is handled via Razorpay. Payment flow: `createOrder` tRPC mutation → Razorpay checkout modal → `verifyPayment` with HMAC-SHA256 signature validation → plan upgrade in DB.

## License

MIT
