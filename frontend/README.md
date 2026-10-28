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
