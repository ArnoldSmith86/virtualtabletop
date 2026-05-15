#!/usr/bin/env bash
# Build VirtualTabletop as an AppImage with Python tkinter launcher.

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
NODE_ARCH="linux-x64"

mkdir -p "$TEMP" "$OUT"

echo "Building ${APP} ${GIT_HASH} AppImage"

rm -rf "${APPDIR}"
mkdir -p "${APPDIR}"/usr/bin
mkdir -p "${APPDIR}"/vtt

NODE_TAR="node-v${NODE_VERSION}-${NODE_ARCH}.tar.xz"
NODE_TAR_PATH="$TEMP/$NODE_TAR"
if [[ ! -f "$NODE_TAR_PATH" ]]; then
  echo "Downloading Node.js ${NODE_VERSION}..."
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}" -o "$NODE_TAR_PATH"
fi
echo "Extracting Node.js..."
tar -xf "$NODE_TAR_PATH" -C "$TEMP"
NODE_DIR=$(basename "$NODE_TAR" .tar.xz)
cp "$TEMP/$NODE_DIR/bin/node" "${APPDIR}/usr/bin/node"
chmod +x "${APPDIR}/usr/bin/node"
rm -rf "$TEMP/$NODE_DIR"

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
exec python3 launcher.py
APPRUN
chmod +x "${APPDIR}/AppRun"

if command -v appimagetool &>/dev/null; then
  APPIMAGETOOL="appimagetool"
  APPIMAGETOOL_ARGS=(-n)
else
  echo "Downloading appimagetool..."
  APPIMAGETOOL="$TEMP/appimagetool-x86_64.AppImage"
  [[ -f "$APPIMAGETOOL" ]] || curl -fsSL "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage" -o "$APPIMAGETOOL"
  chmod +x "$APPIMAGETOOL"
  APPIMAGETOOL_ARGS=(--appimage-extract-and-run -n)
fi

[[ -n "$LIGHT" ]] && SUFFIX="-nolibrary" || SUFFIX=""
OUTPUT_NAME="${APP}-${GIT_HASH}${SUFFIX}-x86_64.AppImage"
OUTPUT="$OUT/$OUTPUT_NAME"
ARCH=x86_64 "$APPIMAGETOOL" "${APPIMAGETOOL_ARGS[@]}" "$APPDIR" "$OUTPUT"
chmod +x "$OUTPUT"

[[ -z "$KEEP_APPDIR" ]] && rm -rf "${APPDIR}"

echo "Created $OUTPUT"
echo "Run: $OUTPUT"
