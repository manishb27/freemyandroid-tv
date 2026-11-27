#!/usr/bin/env bash
# Builds FreeMyAndroid-TV.apk without Gradle: aapt2 -> javac -> d8 -> zipalign -> apksigner.
# Needs JDK 17 and the Android SDK's build-tools 34 and android-34 (found in ~/.jdks and ~/Android/Sdk, or set
# JAVA_HOME and ANDROID_HOME).
#   android/build.sh
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"
AJ="$(ls -d "$SDK"/platforms/android-*/android.jar | sort -V | tail -1)"
JH="${JAVA_HOME:-$(ls -d "$HOME"/.jdks/jdk-17* 2>/dev/null | sort -V | tail -1)}"
[ -x "$JH/bin/javac" ] || { echo "JDK 17 not found: set JAVA_HOME."; exit 1; }
[ -f "$AJ" ] || { echo "Android platform not found: set ANDROID_HOME."; exit 1; }

rm -rf out && mkdir -p out/assets/app out/classes out/res/drawable-nodpi
# The pages (../web) go into the app as they are; the art becomes the icon and the banner.
cp -r ../web/. out/assets/app/
cp art/banner.png art/icon.png out/res/drawable-nodpi/
# The manifest names the television list's packages, so This TV may read them (Android 11's package visibility).
python3 - <<'PY'
import re
ids = re.findall(r'"id":\s*"([^"]+)"', open("../web/tvlist.js", encoding="utf-8").read())
q = "\n        ".join('<package android:name="%s" />' % i for i in ids)
m = open("AndroidManifest.xml", encoding="utf-8").read().replace("<!--TV_LIST-->", q)
open("out/AndroidManifest.xml", "w", encoding="utf-8").write(m)
print("television list:", len(ids), "packages")
PY

"$BT/aapt2" compile --dir out/res -o out/res.zip
"$BT/aapt2" link -o out/base.apk -I "$AJ" --manifest out/AndroidManifest.xml --java out/gen out/res.zip \
  --min-sdk-version 26 --target-sdk-version 33 -A out/assets
"$JH/bin/javac" -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$AJ" -classpath "$AJ" -encoding UTF-8 \
  -d out/classes $(find src out/gen -name '*.java')
JAVA_HOME="$JH" PATH="$JH/bin:$PATH" "$BT/d8" --release --min-api 26 --lib "$AJ" --output out $(find out/classes -name '*.class')
(cd out && zip -qj base.apk classes.dex)
"$BT/zipalign" -f -p 4 out/base.apk out/aligned.apk
# Signed with this checkout's own key, made once. Keep fma-tv.keystore: an update has to be signed with the same one.
if [ ! -f fma-tv.keystore ]; then
  "$JH/bin/keytool" -genkeypair -keystore fma-tv.keystore -alias fma -keyalg RSA -keysize 2048 -validity 20000 \
    -storepass freemyandroid -keypass freemyandroid -dname "CN=Free My Android" >/dev/null 2>&1
fi
JAVA_HOME="$JH" PATH="$JH/bin:$PATH" "$BT/apksigner" sign --ks fma-tv.keystore --ks-pass pass:freemyandroid \
  --key-pass pass:freemyandroid --out FreeMyAndroid-TV.apk out/aligned.apk
echo "Built android/FreeMyAndroid-TV.apk ($(du -h FreeMyAndroid-TV.apk | cut -f1)). Install: adb install -r android/FreeMyAndroid-TV.apk"
