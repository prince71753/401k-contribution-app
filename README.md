# 401(k) Contribution App (Themed)

Single-page app to manage 401(k) contributions with a tiny Node http backend (no dependencies).
The UI uses the uploaded theme CSS so it visually matches the target site.

## Instructions
1) Install Node.js (pick one)

macOS (Homebrew):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"  # if you don't have brew
brew update
brew install node
node -v && npm -v
```

Ubuntu/Debian:
```bash
sudo apt update
sudo apt install -y nodejs npm
node -v && npm -v
```

Alternative (cross-platform) using nvm:
```bash
# install nvm (follow on-screen output to source your shell profile)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install --lts
node -v && npm -v
```

2) Clone and run
```bash
git clone <YOUR_REPO_URL> 401k-contribution-app
cd 401k-contribution-app

# If package.json has a start script (recommended)
npm start

# OR run directly with Node if you prefer
# node server.js
```

Now open: http://localhost:3000


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
