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
| GET    | `/api/dashboard/summary` | Live dashboard figures from the `*_vbspu` tables (cached 5 min) |

## Database

SQL Server, configured with `DB_*` in `.env` (see `.env.example`). Only tables whose names end in `_vbspu` are read, with aggregate `SELECT` queries over a read-only-intent connection:

- `Student_Data_vbspu`: total students (distinct `RegistrationNo`)
- `M_College_vbspu`: affiliated colleges, colleges per district
- `PU_Evaluators_Final_vbspu`: registered evaluators, evaluators pending approval (counts only; personal columns are never selected)
