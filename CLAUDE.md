# Free My Android TV: notes for Claude

Free My Android as an ordinary app on an Android TV: package `com.freemyandroid.tv` (confirmed by the owner; keep
it), label "Free My Android". It is not a home screen and must never take Home. The phone tool is a separate repo
(`manishb27/freemyandroid`); this repo holds only the TV app.

- `web/` is the whole UI, also runnable in a desktop browser (`tools/serve.py`), where stand-in apps replace the
  bridge (`window.FMA`, `android/src/.../MainActivity.java`). `mini.js` and the looks are plain ES5-compatible JS;
  keep them that way, older TVs run old WebViews.
- No INTERNET permission, ever. Nothing leaves the TV. This TV only reads package states; switching apps off
  stays with the phone tool on a computer, where every change is journalled with its undo.
- `android/fma-tv.keystore` is not in git and must not be lost: every update needs the same key. The app on the
  owner's OnePlus TV is signed with it.
- `web/tvlist.js` comes from the phone tool's `data/packages/androidtv.json` (`tools/tvlist.py`): regenerate it when
  that list changes.
- State (2026-11-27): installed on the owner's OnePlus Y Series (Android 11) and started without log errors; what it
  shows on that screen, opening apps, This TV and the Back key are not verified yet. Screenshots in `docs/screens/`
  were taken in a browser with sample app names and say so.
- Keep the README honest: "being built" until it has been checked on a television.
