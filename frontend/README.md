# VBSPU Dashboard – Frontend

Angular 19 app for the VBSPU VC Dashboard ([Figma design](https://www.figma.com/design/IJnkp8hOtvfJXkcQMbnGkd/Untitled?node-id=496-2&p=f&t=kXwf6U2cJmr70ZCi-0)).

## Commands

```bash
npm install
npm start        # dev server at http://localhost:4200
npm run build    # production build in dist/
npm test         # unit tests (Karma)
```

During development, requests to `/api` are proxied to the backend at `http://localhost:5000` (see `proxy.conf.json`). The API base URL is configured in `src/environments/`.

## VC Dashboard

The overview (route `/`) recreates the Figma frames "University digital command centre screen 1", "screen 2" and "screen 3" (1672 × 941 each), stacked vertically: scroll down to reach screens 2 and 3. Header and sidebar stay pinned, as they appear on every frame.

- Data: `src/app/dashboard/data/dashboard.data.json` (imported at build time — no HTTP calls, no backend needed)
- Types: `src/app/dashboard/dashboard.models.ts`
- Components: `src/app/dashboard/components/` (header, sidebar, stat card, panels, SVG bar chart, icons)
- Design tokens: CSS variables in `src/styles.scss`
- Assets exported from Figma: `public/assets/images/` (university emblem, VC avatar)
