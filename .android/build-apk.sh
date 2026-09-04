#!/usr/bin/env bash
# Build the VirtualTabletop server app for Android. The app has no libraries and a single
# activity, so the Android SDK build tools alone are enough - no Gradle, no wrapper, no
# dependency downloads, which keeps the build as small as the APK it produces.
#
# Needs a JDK and the Android SDK (build tools plus a platform of API 28 or newer):
#   ANDROID_HOME=~/Android/Sdk .android/build-apk.sh

set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
if [[ ! -d "$SDK" ]]; then
  echo "Android SDK not found. Install the command line tools and set ANDROID_HOME."
  exit 1
fi

BUILD_TOOLS="$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)"
# only released platforms, so a preview one lying around in the SDK is not built against
PLATFORM="$(ls -d "$SDK"/platforms/android-* 2>/dev/null | grep -E '/android-[0-9]+$' | sort -V | tail -1)"
if [[ -z "$BUILD_TOOLS" || -z "$PLATFORM" ]]; then
  echo "The SDK has no build tools or no platform. Install them with:"
  echo "  sdkmanager 'build-tools;34.0.0' 'platforms;android-34'"
  exit 1
fi

API="$(basename "$PLATFORM" | sed 's/android-//')"
if [[ "$API" -lt 28 ]]; then
  echo "The newest platform in the SDK is $(basename "$PLATFORM"), the app needs android-28 or newer."
  exit 1
fi

ANDROID_JAR="$PLATFORM/android.jar"
KEYSTORE="$HERE/keystore.jks"
PASSWORD="virtualtabletop"
VERSION="$(git -C "$HERE/.." rev-parse --short HEAD 2>/dev/null || echo nogit)"
# the number of commits, so that a newer build also looks newer to Android
CODE="$(git -C "$HERE/.." rev-list --count HEAD 2>/dev/null || echo 1)"
OUTPUT="$HERE/out/VirtualTabletop-$VERSION.apk"

echo "Building VirtualTabletop $VERSION with $(basename "$BUILD_TOOLS") against $(basename "$PLATFORM")"

rm -rf build
mkdir -p build/generated build/classes build/dex out

# resources first: the generated R.java is what the sources refer to
"$BUILD_TOOLS/aapt2" compile --dir res -o build/resources.zip
"$BUILD_TOOLS/aapt2" link \
  -o build/unsigned.apk \
  -I "$ANDROID_JAR" \
  --manifest AndroidManifest.xml \
  --java build/generated \
  --version-code "$CODE" \
  --version-name "$VERSION" \
  build/resources.zip

javac -nowarn -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -d build/classes \
  $(find src build/generated -name '*.java')

"$BUILD_TOOLS/d8" --release --min-api 24 --lib "$ANDROID_JAR" --output build/dex \
  $(find build/classes -name '*.class')

cp build/unsigned.apk build/app.apk
jar uf build/app.apk -C build/dex classes.dex

# a self signed key is all a sideloaded APK needs, and it must stay the same to allow updates
if [[ ! -f "$KEYSTORE" ]]; then
  echo "Creating a signing key in $KEYSTORE"
  keytool -genkeypair -keystore "$KEYSTORE" -alias virtualtabletop -keyalg RSA -keysize 2048 \
    -validity 10950 -storepass "$PASSWORD" -keypass "$PASSWORD" -dname "CN=VirtualTabletop"
fi

"$BUILD_TOOLS/zipalign" -f 4 build/app.apk build/aligned.apk
"$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$PASSWORD" \
  --key-pass "pass:$PASSWORD" --out "$OUTPUT" build/aligned.apk
rm -f "$OUTPUT.idsig"

echo "Created $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo "Install it with: adb install -r $OUTPUT"
