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

| Method | Path          | Description  |
| ------ | ------------- | ------------ |
| GET    | `/api/health` | Health check |
