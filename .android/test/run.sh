#!/bin/sh
# Runs everything about the app that can be tested without a phone: the xz decoder against the
# xz command line tool, the installer against a repository built on the spot, the server's state
# machine, and the screen the app draws. All four compile the real classes out of .android/src
# against stubs of the Android ones, so they need nothing but a JDK - javac and java out of
# JAVA_HOME when it is set, from the path otherwise - git, and node, which turns res/values into
# the R the tests read the app's texts out of.
#
# Usage: [JAVA_HOME=<jdk>] .android/test/run.sh [xz|installer|service|screen ...]
set -e
here=$(cd "$(dirname "$0")" && pwd)
android=$(dirname "$here")
out=$android/out/test
javac=${JAVA_HOME:+$JAVA_HOME/bin/}javac
java=${JAVA_HOME:+$JAVA_HOME/bin/}java

# the ids and texts aapt2 would generate, so a test that reads a string reads the shipped one
generated=$out/generated
mkdir -p "$generated/io/virtualtabletop/server"
node "$here/generate-R.js" "$android/res/values/strings.xml" "$generated/io/virtualtabletop/server/R.java"

xz() {
  rm -rf "$out/xz" && mkdir -p "$out/xz"
  $javac -nowarn -d "$out/xz" "$android/src/io/virtualtabletop/server/Xz.java" \
    "$here/xz/io/virtualtabletop/server/XzTest.java"
  $java -cp "$out/xz" io.virtualtabletop.server.XzTest
}

installer() {
  rm -rf "$out/installer" && mkdir -p "$out/installer/classes" "$out/installer/files"
  $javac -nowarn -d "$out/installer/classes" $(find "$here/installer/stub" -name '*.java') \
    "$here/installer/InstallerTest.java" \
    "$android/src/io/virtualtabletop/server/Installer.java" \
    "$android/src/io/virtualtabletop/server/Packages.java" \
    "$android/src/io/virtualtabletop/server/Deb.java" \
    "$android/src/io/virtualtabletop/server/Xz.java" \
    "$android/src/io/virtualtabletop/server/AppState.java"
  $java -DtestDir="$out/installer" -cp "$out/installer/classes" InstallerTest
}

service() {
  rm -rf "$out/service" && mkdir -p "$out/service/classes" "$out/service/files/usr/bin" \
    "$out/service/files/usr/tmp" "$out/service/files/vtt" "$out/service/files/save"
  cp "$here/service/node" "$out/service/files/usr/bin/node"
  chmod +x "$out/service/files/usr/bin/node"
  $javac -nowarn -d "$out/service/classes" $(find "$here/service/stub" "$generated" -name '*.java') \
    "$here/service/ServiceTest.java" \
    "$android/src/io/virtualtabletop/server/ServerService.java" \
    "$android/src/io/virtualtabletop/server/AppState.java"
  $java -DtestDir="$out/service" -cp "$out/service/classes" ServiceTest
}

screen() {
  rm -rf "$out/screen" && mkdir -p "$out/screen/classes"
  $javac -nowarn -d "$out/screen/classes" $(find "$here/screen/stub" "$generated" -name '*.java') \
    "$here/screen/MainTest.java" \
    "$android/src/io/virtualtabletop/server/MainActivity.java" \
    "$android/src/io/virtualtabletop/server/Env.java" \
    "$android/src/io/virtualtabletop/server/AppState.java"
  $java -DtestDir="$out/screen" -cp "$out/screen/classes" MainTest
}

for suite in ${*:-xz installer service screen}; do
  echo "=== $suite ==="
  $suite
done
