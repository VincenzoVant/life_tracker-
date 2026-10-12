# Phone setup

You reach the Mac from your iPhone over Tailscale. The server stays on the Mac. Tailscale forwards HTTPS traffic to it, and only devices on your tailnet can reach it.

## Steps

1. Install Tailscale on the Mac and on the iPhone. Sign in to the same account on both.
2. On the Mac, run:
   ```sh
   tailscale serve --bg 4280
   ```
   Then run `tailscale serve status`. Note the URL. It looks like `https://<mac>.<tailnet>.ts.net`.
3. Install (or reinstall) the service with that URL as the allowed origin:
   ```sh
   npm run service:install -- --public-origin https://<mac>.<tailnet>.ts.net
   ```
   Use the exact URL, with `https://` and no path.
4. On the iPhone, open the URL in Safari. Enter your PIN. Tap Share, then **Add to Home Screen**.
5. Keep the Mac reachable. On the Mac go to System Settings, Battery, Options, and turn on "Prevent automatic sleeping on power adapter when the display is off". When travelling with the lid open you can also run `caffeinate -s` in a terminal.
6. iOS does not show the app's manifest shortcuts, so there is no long-press menu. For one-tap quick add, open `/quick-add` in Safari and add it to the Home Screen as its own icon.

You cannot connect Google Calendar from the phone. Do that on the Mac (see [setup-google.md](setup-google.md)).

## Troubleshooting

**The app shows the offline screen.** The phone cannot reach the server. Check that the Mac is awake, that Tailscale is connected on the Mac and on the phone, and run `npm run service:status` on the Mac. The app recovers on its own when you come back to it.

**"Origin not allowed" (a 403 on every action).** The server does not know the URL you are using. Run `npm run service:install -- --public-origin <exact URL>` again with the URL from `tailscale serve status`, then reload.

**PIN lockout.** Five wrong PINs within 15 minutes lock login for 15 minutes. Wait, or run `npm run service:restart` on the Mac. The lockout is kept in memory, so a restart clears it.
