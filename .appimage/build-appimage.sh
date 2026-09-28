#!/usr/bin/env bash
# Build VirtualTabletop as an AppImage with Tk and shell launchers.

set -e
APPIMG="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$APPIMG/.." && pwd)"
cd "$ROOT"

LIGHT=""
NO_NPM=""
KEEP_APPDIR=""
for arg; do
  [[ "$arg" == --light ]] && LIGHT=1
  [[ "$arg" == --no-npm ]] && NO_NPM=1
  [[ "$arg" == --keep-appdir ]] && KEEP_APPDIR=1
done

APP="VirtualTabletop"
GIT_HASH=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "nogit")
TEMP="$APPIMG/temp"
OUT="$APPIMG/out"
APPDIR="$TEMP/${APP}.AppDir"
NODE_VERSION="20.18.0"
NODE_ARCH="linux-x64-musl"
ALPINE_VERSION="v3.20"
GCC_VERSION="13.2.1_git20240309-r1"

download_verified() {
  local url="$1" output="$2" hash="$3"
  if [[ ! -f "$output" ]] || ! echo "$hash  $output" | sha256sum -c --status; then
    curl -fsSL "$url" -o "$output"
  fi
  echo "$hash  $output" | sha256sum -c --status
}

mkdir -p "$TEMP" "$OUT"

echo "Building ${APP} ${GIT_HASH} AppImage"

rm -rf "${APPDIR}"
mkdir -p "${APPDIR}"/usr/bin
mkdir -p "${APPDIR}"/usr/lib
mkdir -p "${APPDIR}"/vtt

NODE_TAR="node-v${NODE_VERSION}-${NODE_ARCH}.tar.xz"
NODE_TAR_PATH="$TEMP/$NODE_TAR"
download_verified "https://unofficial-builds.nodejs.org/download/release/v${NODE_VERSION}/${NODE_TAR}" "$NODE_TAR_PATH" 757bba0adff8eaadfa7f9be2c87a35d5010ac3f71b5527e57385218c806a4fa4
echo "Extracting Node.js..."
tar -xf "$NODE_TAR_PATH" -C "$TEMP"
NODE_DIR=$(basename "$NODE_TAR" .tar.xz)
cp "$TEMP/$NODE_DIR/bin/node" "${APPDIR}/usr/bin/node-real"
rm -rf "$TEMP/$NODE_DIR"

ALPINE_BASE="https://dl-cdn.alpinelinux.org/alpine/${ALPINE_VERSION}/main/x86_64"
MUSL_APK="$TEMP/musl-1.2.5-r3.apk"
LIBGCC_APK="$TEMP/libgcc-${GCC_VERSION}.apk"
LIBSTDCXX_APK="$TEMP/libstdc++-${GCC_VERSION}.apk"
download_verified "$ALPINE_BASE/$(basename "$MUSL_APK")" "$MUSL_APK" 70705bdeb1a8d54ee1ec7ce3b06f176206f4f3b105d86cf5576d74b8277adfa0
download_verified "$ALPINE_BASE/$(basename "$LIBGCC_APK")" "$LIBGCC_APK" f348d99e10b5267566afe6f80861661b08cb5aa43a6d4d1c8f1792b5001d0995
download_verified "$ALPINE_BASE/$(basename "$LIBSTDCXX_APK")" "$LIBSTDCXX_APK" af0fe894ef5051116e321bf4753a10fffa85abc2b71f30b2e949467775421ace
tar -xOzf "$MUSL_APK" lib/ld-musl-x86_64.so.1 > "${APPDIR}/usr/lib/ld-musl-x86_64.so.1"
tar -xOzf "$LIBGCC_APK" usr/lib/libgcc_s.so.1 > "${APPDIR}/usr/lib/libgcc_s.so.1"
tar -xOzf "$LIBSTDCXX_APK" usr/lib/libstdc++.so.6.0.32 > "${APPDIR}/usr/lib/libstdc++.so.6.0.32"
ln -s libstdc++.so.6.0.32 "${APPDIR}/usr/lib/libstdc++.so.6"
chmod +x "${APPDIR}/usr/lib/ld-musl-x86_64.so.1"

cat > "${APPDIR}/usr/bin/node" << 'NODE'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "$0")")/.."
exec "$HERE/lib/ld-musl-x86_64.so.1" --library-path "$HERE/lib" "$HERE/bin/node-real" "$@"
NODE
chmod +x "${APPDIR}/usr/bin/node"

echo "Copying VirtualTabletop..."
for d in assets client server validator; do
  [[ -d "$d" ]] && cp -a "$d" "${APPDIR}/vtt/"
done
[[ -z "$LIGHT" ]] && [[ -d library ]] && cp -a library "${APPDIR}/vtt/"
for f in server.mjs config.json config.template.json package.json package-lock.json; do
  [[ -f "$f" ]] && cp -a "$f" "${APPDIR}/vtt/"
done

cd "${APPDIR}/vtt"
if [[ -z "$NO_NPM" ]]; then
  PATH="$(pwd)/../usr/bin:$PATH" npm install --omit=dev --ignore-scripts 2>/dev/null || PATH="$(pwd)/../usr/bin:$PATH" npm install --omit=dev
fi
cd "$ROOT"

cp "$APPIMG/launcher.py" "${APPDIR}/"
chmod +x "${APPDIR}/launcher.py"
cp "$APPIMG/launcher.sh" "${APPDIR}/"
chmod +x "${APPDIR}/launcher.sh"

ICON_SRC=""
for p in client/i/branding/android-512.png assets/branding/android-512.png assets/branding/favicon.svg; do
  if [[ -f "$p" ]]; then
    ICON_SRC="$p"
    break
  fi
done
if [[ -n "$ICON_SRC" ]]; then
  cp "$ICON_SRC" "${APPDIR}/${APP}.${ICON_SRC##*.}"
else
  echo "No icon found, using placeholder"
  touch "${APPDIR}/${APP}.png"
fi
mkdir -p "${APPDIR}/usr/share/icons/hicolor/256x256/apps"
if [[ -f "${APPDIR}/${APP}.png" ]]; then
  cp "${APPDIR}/${APP}.png" "${APPDIR}/usr/share/icons/hicolor/256x256/apps/${APP}.png"
fi

cat > "${APPDIR}/${APP}.desktop" << EOF
[Desktop Entry]
Name=VirtualTabletop
Comment=Virtual surface for board, dice and card games
Exec=AppRun
Icon=${APP}
Type=Application
Categories=Game;
EOF

cat > "${APPDIR}/AppRun" << 'APPRUN'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "$0")")"
export APPDIR="$HERE"
export PATH="$HERE/usr/bin:$PATH"
export XDG_DATA_DIRS="$HERE/usr/share:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
cd "$HERE"
if command -v python3 >/dev/null 2>&1 && python3 -c 'import tkinter' >/dev/null 2>&1; then
  exec python3 launcher.py
fi
if [[ -n "${DISPLAY:-}" ]] && command -v xterm >/dev/null 2>&1; then
  exec xterm -T VirtualTabletop -e "$HERE/launcher.sh"
fi
exec "$HERE/launcher.sh"
APPRUN
chmod +x "${APPDIR}/AppRun"

APPIMAGETOOL="$TEMP/appimagetool-1.9.1-x86_64.AppImage"
RUNTIME="$TEMP/runtime-20251108-x86_64"
download_verified "https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage" "$APPIMAGETOOL" ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0
download_verified "https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64" "$RUNTIME" 2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d
chmod +x "$APPIMAGETOOL"

[[ -n "$LIGHT" ]] && SUFFIX="-nolibrary" || SUFFIX=""
OUTPUT_NAME="${APP}-${GIT_HASH}${SUFFIX}-x86_64.AppImage"
OUTPUT="$OUT/$OUTPUT_NAME"
ARCH=x86_64 "$APPIMAGETOOL" --appimage-extract-and-run -n --runtime-file "$RUNTIME" "$APPDIR" "$OUTPUT"
chmod +x "$OUTPUT"

[[ -z "$KEEP_APPDIR" ]] && rm -rf "${APPDIR}"

echo "Created $OUTPUT"
echo "Run: $OUTPUT"
