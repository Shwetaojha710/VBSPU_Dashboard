# VBSPU Dashboard

Vice-Chancellor (VC) dashboard for VBSPU. The repository contains a separate Angular frontend and a Node.js/Express backend API.

## Structure

```
VBSPU_Dashboard/
├── frontend/   Angular 19 app (VC Dashboard UI)
├── backend/    Express API (routes, controllers, services, middleware, config, utils)
├── .gitignore
└── README.md
```

- **frontend/** – Angular app. Calls the API under `/api`; in development, `proxy.conf.json` forwards `/api` to the backend at `http://localhost:5000`. The UI will follow the [Figma design](https://www.figma.com/design/IJnkp8hOtvfJXkcQMbnGkd/Untitled?node-id=496-2&p=f&t=kXwf6U2cJmr70ZCi-0).
- **backend/** – Express API with `dotenv` configuration. Currently exposes `GET /api/health`. No database is connected yet.

## Prerequisites

- Node.js 20.11+ (tested with 20.15.0) and npm 10+

## Installation

```bash
cd backend
npm install
cp .env.example .env

cd ../frontend
npm install
```

## Running locally

Backend (http://localhost:5000):

```bash
cd backend
npm run dev     # auto-restarts on change
# or
npm start
```

Frontend (http://localhost:4200):

```bash
cd frontend
npm start
```

| Service      | URL                              |
| ------------ | -------------------------------- |
| Frontend     | http://localhost:4200            |
| Backend API  | http://localhost:5000/api        |
| Health check | http://localhost:5000/api/health |

## Build

```bash
cd frontend
npm run build   # output in frontend/dist/
```

## Git

The repository is at the project root (do not run `git init` inside `frontend/` or `backend/`).

```bash
git clone https://github.com/Shwetaojha710/VBSPU_Dashboard.git
cd VBSPU_Dashboard
git checkout -b feature/<name>
```

`node_modules/`, `.env` files, logs and build output are ignored via `.gitignore`. Only `.env.example` is committed.
