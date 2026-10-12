# Google Calendar setup

Life Tracker writes your plan to its own calendar called "Life Tracker" and reads your other calendars as busy time. You create your own Google Cloud OAuth client. This takes about 10 minutes and is done once.

The app asks for three scopes:

- `https://www.googleapis.com/auth/calendar.app.created` (create and edit only the Life Tracker calendar)
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly` (list your calendars)
- `https://www.googleapis.com/auth/calendar.events.readonly` (read events on the calendars you pick as busy)

## Steps

1. Go to https://console.cloud.google.com and create a project, for example "Life Tracker".
2. In APIs & Services, Library, search for **Google Calendar API** and click Enable.
3. Open APIs & Services, OAuth consent screen.
   1. Choose user type **External**.
   2. Fill in the app name and your email.
   3. Add your own Google account as a test user.
   4. Add the three scopes listed above.
   5. **Publish the app** (set it to "In production"). In Testing mode, refresh tokens expire after 7 days and you would have to reconnect every week.
   6. Expect an "unverified app" warning when you sign in. Click **Advanced**, then continue to the app. This is normal for a personal app.
4. Open APIs & Services, Credentials. Create credentials, OAuth client ID, application type **Desktop app**.
5. Download the JSON file and save it as `~/LifeTracker/secrets/google-client.json`. If you set `LT_DATA_DIR`, use `<LT_DATA_DIR>/secrets/google-client.json` instead.
   ```sh
   mkdir -p ~/LifeTracker/secrets
   mv ~/Downloads/client_secret_*.json ~/LifeTracker/secrets/google-client.json
   ```
   The file must have an `installed` section with `client_id` and `client_secret`. Desktop app clients do.
6. Restart the server so it sees the file: `npm run service:restart`. If you run it by hand, stop it and start `node --import tsx server/src/index.ts` again.
7. On the Mac, open `http://127.0.0.1:4280/settings` and click **Connect Google Calendar**. Sign in and allow all three permissions.
8. In Settings, Google, choose which calendars count as busy time.

Connecting only works from the Mac, on `127.0.0.1`, `localhost` or `[::1]`. The tokens are saved in `secrets/google.json` with owner-only permissions.

## Troubleshooting

**`invalid_grant`, or a "reconnect Google" banner.** Google no longer accepts the saved refresh token. This happens if you revoked access, changed your Google password, or left the app in Testing mode for more than 7 days. On the Mac, click **Reconnect** in the banner (or in Settings, Google Calendar). Queued changes are sent after you reconnect. If it keeps happening, check that the app is published ("In production").

**"Google didn't grant offline access".** A permission was unticked. Connect again and allow every requested permission.

**The Life Tracker calendar was deleted.** A banner tells you the calendar is gone. Use its recreate button. The app creates a new calendar and sends your committed blocks again.

**"Connect Google from the Mac" (connecting from the phone is not allowed).** Connecting is limited to loopback addresses on purpose. On the phone the app shows "Connect on your Mac (http://127.0.0.1:4280)" as text instead of a link. Open `http://127.0.0.1:4280/settings` on the Mac itself, not through Tailscale or the phone.

**"Google client file not found".** The file is missing, is not at `<data dir>/secrets/google-client.json`, or is not a Desktop app client. Check the path and restart the server.

**"Google sign-in expired".** The sign-in must finish within 10 minutes. Click Connect again.
