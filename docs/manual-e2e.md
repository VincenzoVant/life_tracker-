# Manual end-to-end checklist

Run this against a throwaway Google account or a test calendar, never your real one. Tick each step only when the expected result happens. Steps 1-10 cover Stage 3 (Google), 11-12 cover Stage 4 (quick-add and replan), 13-18 cover Stage 5 (phone). Setup: [setup-google.md](setup-google.md), [setup-phone.md](setup-phone.md).

## Google (Stage 3)

- [ ] 1. **Connect.** On the Mac, open `http://127.0.0.1:4280/settings` and click Connect Google Calendar. Allow all permissions.
  Expected: you return to Settings and it shows Google as connected. `secrets/google.json` exists.
- [ ] 2. **Calendar created.** Open Google Calendar in a browser.
  Expected: a calendar named "Life Tracker" appears. Settings lists your other calendars so you can pick busy ones.
- [ ] 3. **Commit a week.** Plan and commit a week.
  Expected: the blocks appear as events in the Life Tracker calendar, colored by category. The sync badge returns to idle.
- [ ] 4. **Done does not sync.** Mark several blocks done.
  Expected: nothing changes in Google.
- [ ] 5. **Move in Google.** Drag one event to a new time in Google, then click Sync now.
  Expected: the block moves in the app, and the change appears in the "Changes from Google" feed.
- [ ] 6. **Delete in Google.** Delete one event in Google, then click Sync now.
  Expected: the block is removed from the app.
- [ ] 7. **Conflict.** Add an event on a busy (primary) calendar that overlaps a block, then click Sync now.
  Expected: a conflict banner appears naming the block.
- [ ] 8. **Offline queue.** Turn Wi-Fi off. Edit two blocks.
  Expected: the sync badge shows pending changes. Turn Wi-Fi on: the queue flushes, the badge clears and Google shows the edits.
- [ ] 9. **Revoke.** At https://myaccount.google.com/permissions remove access for the app. Make an edit, or click Sync now.
  Expected: a reconnect banner appears. Click Connect Google Calendar again: the banner clears and queued changes flush.
- [ ] 10. **Calendar deleted.** Delete the Life Tracker calendar in Google, then click Sync now.
  Expected: a banner says the calendar is gone. Click recreate: a new Life Tracker calendar appears with your committed blocks.

## Quick-add and replan (Stage 4)

- [ ] 11. **Quick-add.** With Google connected and a week committed, quick-add "Drinks" for tonight.
  Expected: a summary shows the evening study block moved and "Drinks" added. Click Apply. In Google, the moved event and the new "Drinks" event are both there.
- [ ] 12. **Replan around a conflict.** Add an overlapping event to the primary calendar, click Sync now, then click Replan around this.
  Expected: a summary of changes appears. Click Apply: the overlapping block moves clear of the event and Google shows the new time. The conflict banner is gone.

## Phone (Stage 5)

Do these on the iPhone over your Tailscale URL.

- [ ] 13. **Install the PWA.** Open the URL in Safari, then Share, Add to Home Screen. Open the new icon.
  Expected: the app opens full screen with its own icon, without Safari bars.
- [ ] 14. **Log in.** Enter your PIN.
  Expected: the Today screen loads. A wrong PIN is rejected with an error.
- [ ] 15. **Quick-add from the phone.** Open Quick add and add something for tonight.
  Expected: a change summary appears. Tap Apply: the plan updates on the phone and in Google Calendar.
- [ ] 16. **Daily review.** Open Review and mark today's blocks done or skipped.
  Expected: the statuses save and Today and the Dashboard reflect them.
- [ ] 17. **Offline screen.** Put the Mac to sleep, then switch back to the phone app.
  Expected: the phone shows the offline screen. Wake the Mac and return to the app: it recovers by itself without a reinstall.
- [ ] 18. **Backup now.** In Settings, Backups, tap Back up now.
  Expected: it reports success, and a new `data-YYYY-MM-DD.db` file appears in `~/LifeTracker/backups/`.
