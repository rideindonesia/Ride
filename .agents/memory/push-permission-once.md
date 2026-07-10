---
name: Push notification permission — ask once
description: Why usePushNotification must not auto-prompt on every dashboard mount.
---
The push hook (`usePushNotification`) runs on each dashboard mount. Calling
`Notification.requestPermission()` unconditionally re-shows the browser's
"izinkan notifikasi" prompt every time the component remounts (re-login, navigate
into a feature then back), which users perceive as spam.

**Rule:** Read `Notification.permission` first.
- `granted` → register SW + subscribe silently (no prompt).
- `denied` → stop.
- `default` → request ONLY if not asked before; persist a `ride-push-asked` flag in
  localStorage and set it before asking, so a dismissed prompt is never re-shown.

**Why:** Browsers keep permission at "default" when the user dismisses without
choosing, so an unguarded per-mount request loops forever.

**How to apply:** Any future "enable notifications" UX (e.g. the bell icon) should
call requestPermission only from an explicit user gesture, and may clear/ignore the
flag intentionally — but never restore unconditional auto-prompting on mount.
