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

## Installing it for someone

The person may not be technical. Say what you are about to do on their TV before you do it, and let them press the
buttons on the TV.

1. Check `adb` is on the computer (`adb version`). If not, help them install Android's platform-tools.
2. On the TV: Settings → Device Preferences → About → press Build seven times; then Developer options → turn on USB
   debugging and, where the set has it, network debugging (wording differs by brand). Find the TV's IP address under
   Network.
3. `adb connect <ip>:5555`. The TV shows "Allow USB debugging?": they choose Allow (and "Always allow").
4. Download `FreeMyAndroid-TV.apk` from the latest release (`gh release download -R manishb27/freemyandroid-tv`
   or the Releases page) and check its SHA-256 against the release notes.
5. `adb install -r FreeMyAndroid-TV.apk`. It appears in the apps row as Free My Android; open it with
   `adb shell am start -n com.freemyandroid.tv/.MainActivity`.
6. Never change anything else on the TV from here. Cleaning the TV up is the phone tool's job
   (github.com/manishb27/freemyandroid), with its plan and its undo journal.
