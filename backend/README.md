# VBSPU Dashboard – Backend

Express API for the VBSPU VC Dashboard.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The server runs on `http://localhost:5000` by default (`PORT` in `.env`).

## Structure

```
src/
├── config/        Environment config (dotenv)
├── controllers/   Request handlers
├── routes/        Route definitions, mounted under /api
├── services/      Business logic
├── middleware/    404 and error handlers
├── utils/         Shared helpers (ApiError)
├── app.js         Express app
└── server.js      Entry point
```

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/health` | Health check |
| POST   | `/api/auth/login` | `{ email, password }` → `{ token, email, expiresAt }` (10 failed tries per IP in 15 min, then 429) |
| GET    | `/api/auth/me` | Signed-in user for the token |
| GET    | `/api/dashboard/summary` | Live dashboard figures from the university database (cached 5 min, loaded at startup) |
| GET    | `/api/dashboard/details/:key` | Breakdown shown on a stat card's section page (`totalStudents`, `affiliatedColleges`, `facultyAndStaff`, `pendingApprovals`, `activeGrievances`, `examsInProgress`, `passedStudents`); 404 for other keys |
| GET    | `/api/dashboard/exam-status` | Exam status of every affiliated college this session: online (exam result declared, practical and internal marks all done) or pending with reasons |
| GET    | `/api/dashboard/enrollment-by-type` | UG and PG students per session, for the enrollment chart |
| GET    | `/api/dashboard/course-status` | Online/pending course counts per college (second database, PU_2026) |
| GET    | `/api/dashboard/course-status/:code` | Course-wise exam status for one college: students, theory, practical and internal marks, result |

## Login

Every `/api/dashboard/*` call needs `Authorization: Bearer <token>` from `/api/auth/login`. Accounts live in `.env` (`AUTH_USERS`, passwords stored as scrypt hashes, never in the database). Add or change one with:

```
npm run add-user -- someone@example.com
```

It asks for the password without showing it and creates `AUTH_SECRET` on first use. Restart the API afterwards. Tokens last `AUTH_TOKEN_HOURS` (default 8); changing `AUTH_SECRET` signs everyone out.

## Database

Two SQL Servers are read: the main university database (`DB_*`) and PU_2026 (`DB2_*`), which holds course-wise nominal rolls (`STU_NOMINAL`), marks (`STUDENT_MARKS`) and results (`STUDENTRESULT*`) for the course-wise exam status.

SQL Server, configured with `DB_*` in `.env` (see `.env.example`). Only aggregate `SELECT` queries are run, over a read-only-intent connection; nothing is inserted, updated or deleted, and personal columns are never selected.

All figures cover only colleges in **Ghazipur and Jaunpur** (`M_College.District`). Every table is limited to those colleges through its college code; the district list is in `src/services/scope.js`. Results are cached for 30 minutes (`DASHBOARD_CACHE_SECONDS`) and saved in `.cache/` (git-ignored), so a restart answers at once. An expired value is still served while it refreshes in the background, and refreshes run one query at a time to keep load off the shared database.

| Table | Used for |
| ----- | -------- |
| `Student_Data`, `M_Session` | Total students in the latest session vs the previous one, enrollment trend per session |
| `M_College` | Affiliated colleges, colleges per district |
| `PU_Evaluators_Final` | Faculty & Staff (registered evaluators, vs a year ago), pending evaluator approvals |
| `Grievance` | Active grievances, monthly received/resolved trend, activity feed |
| `ExamAttendance` | Exams in the current session, answer scripts (present) |
| `STUDENTRESULT_UG_NEP`, `STUDENTRESULT_PG_NEP`, `STUDENTRESULT_SEM_Online` | Students passed (Scholarship Applications card), gross pass % per session from 2023-24 |
| `PHD_Data_24` | Ph.D. scholars |
| `TblExamUploadSummary` | Activity feed: published results |
