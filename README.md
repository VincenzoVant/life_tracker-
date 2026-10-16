# life_tracker

Life Tracker is a personal planner and tracker that runs on your own Mac. It keeps your studies, startup work, workouts, meals and goals in one local SQLite database, plans your weeks around a fixed schedule, and can mirror the plan to Google Calendar. Nothing leaves your machine except calendar sync and your own phone access.

The full design is in [the spec](docs/superpowers/specs/2026-10-12-life-tracker-design.md).

## Requirements

- Node 22 or newer.
- macOS for the background service. The app itself runs anywhere Node does.

## Install

```sh
npm install
```

## Develop

```sh
npm run dev
```

Open `http://localhost:5173`. The web app runs on 5173 and talks to the API on 4280.

## Test

```sh
npm test            # vitest, all workspaces
npm run typecheck   # tsc -b shared server web
```

## Run in production

```sh
npm run build
node --import tsx server/src/index.ts
```

The app is served at `http://127.0.0.1:4280`. The server serves the built web app from `web/dist`. The first visit shows the setup screen where you choose a PIN.

## Set up your week

Planning is set up per area, under **Areas**. The planner uses all of it when you plan from the Week tab.

- **This week**: projects for the week (a course to study for, startup work, fun projects, relax time) with hours, priority and preferred times, plus your startup hours and free evenings.
- **Classes**: your fixed class and work schedule on a weekly grid, with the buffer kept free before and after each class.
- **Studies**: courses and weekly study hours, when you can study and when you prefer to.
- **Workouts**: how often and how long, when you can go, preferred times, and the buffer before and after a workout.
- **Meals**: breakfast, lunch and dinner times (different on some days if you like), meal prep, the weekly menu and nutrition goals.
- **Startup**: tasks, milestones and when you work on it.

Settings keeps your day (sleep, earliest and latest block, minimum gap, daily maximum), evenings, timezone, Google Calendar, backups and security.

## Data directory and environment variables

All data lives in one directory, `~/LifeTracker` by default.

| Variable | Default | Meaning |
| --- | --- | --- |
| `LT_DATA_DIR` | `~/LifeTracker` | Where the database, logs, backups and secrets live. |
| `LT_PORT` | `4280` | Port the server listens on. |
| `LT_PUBLIC_ORIGIN` | unset | An extra allowed origin, for example your Tailscale URL. Needed for phone access. |

Inside the data directory:

- `data.db` (plus `data.db-wal` and `data.db-shm` while running): the database.
- `backups/`: daily copies named `data-YYYY-MM-DD.db`.
- `logs/`: server logs.
- `secrets/`: Google client file and tokens. Never backed up.

## Run as a service

The service is a macOS LaunchAgent (`com.lifetracker.server`). It builds the app, starts the server at login and restarts it if it crashes.

```sh
npm run service:install     # build, write the plist, start the service
npm run service:status      # running or not, plus a health check
npm run service:restart     # restart the running service (does not rebuild)
npm run service:uninstall   # stop the service and remove the plist
```

After changing code, run `npm run build && npm run service:restart`. To change options (port, data folder, public origin), run `npm run service:install` again with the new options.

Options go after `--`:

```sh
npm run service:install -- --port 4280 --data-dir ~/LifeTracker --public-origin https://<mac>.<tailnet>.ts.net
```

Add `--dry-run` to print the plist and the commands without running them. `node scripts/service.mjs --help` lists every option. The service runs the code in the folder you installed it from. Reinstall if you move the folder.

## Phone access

See [docs/setup-phone.md](docs/setup-phone.md). It uses Tailscale, so the server is never exposed to the public internet.

## Google Calendar

See [docs/setup-google.md](docs/setup-google.md). You connect once, from the Mac.

## Backups and restore

The server backs up the database every day at 03:00 (in your timezone) into `<data dir>/backups/` and keeps the last 14. In Settings, use **Back up now** for an extra copy.

To restore:

1. `npm run service:uninstall`
2. Copy the backup you want, for example `data-2026-10-12.db`, to `~/LifeTracker/data.db`.
3. Delete `~/LifeTracker/data.db-wal` and `~/LifeTracker/data.db-shm`.
4. `npm run service:install`

`secrets/` is not in backups. After restoring on a new Mac, put `google-client.json` back and reconnect Google Calendar.

## Logs

Server logs are in `<data dir>/logs/`, which is `~/LifeTracker/logs/` by default.

- `server.N.log`: rotated at 5 MB. The last 5 files are kept.
- `current.log`: a symlink that always points at the active file. Use `tail -f ~/LifeTracker/logs/current.log`.
- `launchd.out.log` and `launchd.err.log`: output captured by the service. Check `launchd.err.log` if the server will not start.

Logs record the method, path, status and duration of API requests. They never record request bodies, cookies or query strings.

## Project layout

- `shared/`: types and logic shared by the server and the web app.
- `server/`: the API, SQLite database, planner, Google Calendar sync and scheduled jobs. Entry point `server/src/index.ts`.
- `web/`: the React app, built into `web/dist`.
- `scripts/service.mjs`: LaunchAgent install, status, restart and uninstall.
- `docs/`: setup guides and the manual test checklist. Specs and plans are in `docs/superpowers/`.

## Roadmap

1. [Stage 1: Foundation and tracking](docs/superpowers/plans/2026-10-12-stage-1-foundation-tracking.md)
2. [Stage 2: Planner](docs/superpowers/plans/2026-10-12-stage-2-planner.md)
3. [Stage 3: Google Calendar](docs/superpowers/plans/2026-10-12-stage-3-google-calendar.md)
4. [Stage 4: Quick-add and replan](docs/superpowers/plans/2026-10-12-stage-4-quick-add-replan.md)
5. [Stage 5: Phone and polish](docs/superpowers/plans/2026-10-12-stage-5-phone-polish.md)

Manual end-to-end checks: [docs/manual-e2e.md](docs/manual-e2e.md).
