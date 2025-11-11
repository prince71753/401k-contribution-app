# 401(k) Contribution App (Themed)

Single-page app to manage 401(k) contributions with a tiny Node http backend (no dependencies).
The UI uses the uploaded theme CSS so it visually matches the target site.

## Run locally
```bash
cd 401k-contribution-app
npm start
# open http://localhost:3000
```


## Project Structure Overview
.
├─ server.js                  # Node HTTP server (ESM)
├─ package.json               #  start script, package info
├─ data/
│  └─ settings.json           # mock database
└─ public/
   ├─ index.html              # UI
   ├─ theme.css               # styles (teal theme + sliders/buttons)
   └─ app.js                  # frontend logic (fetches APIs)

## Notes
- No `node_modules` required.
- Theme styles come from `public/theme.css` (combined from provided CSS). Fonts fallback gracefully if remote files aren't present. 
- APIs: `GET/POST /api/settings`, `GET /api/ytd`, `GET /api/projection`.
