# VirtualTabletop on Android

A small app that turns an Android phone into a VirtualTabletop server: it fetches Node.js, git
and this repository once, then runs the server offline and shows the address of the `vtt` room in
a notification, so everyone in the same WiFi - or connected to the phone's hotspot - can play.

It automates what the Termux instructions in the main README do by hand, without needing Termux.

## Using it

| Button | What it does |
| --- | --- |
| **Update** | Installs or updates git, Node.js and the clone, then runs `npm install --omit=dev`. The only step that needs a connection. It runs in the foreground service with a wake lock, so it keeps going while the screen is off, and it can be pressed again to carry on after a lost connection. |
| **Start server** | Runs `node server.mjs` in a foreground service. Enabled once Update has finished. |
| **Quit** | Shuts the server down (the rooms are saved) and closes the app. |

While the server runs, the notification shows `http://<address>:8272/vtt` with three actions:
**Open** hands the address to the browser, **Share** to any other app, and **Quit** stops
everything. The address is the hotspot's when tethering is on and the WiFi one otherwise, and it
follows along when the phone changes network.

Rooms are saved outside of the clone (in `save/` next to it), so they survive every update.

## Building

The app has no libraries and a single activity, so the Android SDK build tools are enough - there
is no Gradle, no wrapper and nothing to download at build time. That keeps the build as small as
the APK it produces, which is around 50 KB.

Needed: a JDK and the Android SDK with build tools and a platform of API 28 or newer.

```
ANDROID_HOME=~/Android/Sdk .android/build-apk.sh
```

The APK lands in `.android/out/`, signed with a self-signed key the script creates on first use
(`.android/keystore.jks`, kept out of git - keep it if you want to install updates over an
existing installation). Install it with `adb install -r .android/out/VirtualTabletop-*.apk` or by
opening the file on the phone.

The `Android APK` workflow builds it on demand and attaches the result to the run. It also runs
`.android/test/` first: `XzTest` compresses samples with the `xz` command line tool and requires
the decoder in `Xz.java` to hand them back byte for byte. It needs a JDK and `xz` and no device,
which is why it is the one part of the app a workflow can check.

Every run of the workflow signs with a key of its own, so two artifacts cannot be installed over
each other - uninstall the old one first, or build locally where `keystore.jks` is kept.

## How it works

* **Where the binaries come from.** Termux is the only project that builds Node.js and git for
  Android, so the app installs its packages (`git`, `nodejs-lts`, `npm` and their dependencies)
  straight from `packages.termux.dev`, checking each one against the SHA-256 of the repository
  index. Together they are about 35 MB, the clone and `node_modules` another 750 MB.
* **What is cloned, and how it survives a broken connection.** Only the tip of `main`, shallow and
  single-branch and without tags. The clone keeps no reflog and prunes right away, so an update
  replaces that one snapshot instead of piling up the ones before it. Git cannot resume a clone
  that broke, so the app does not take it in one piece: it clones with `--filter=blob:none`, which
  is a few megabytes, and then fills the file contents in with `git sparse-checkout add`, a group
  of directories of about a thousand files at a time. Every group that arrived stays in the clone,
  so pressing **Update** again continues where it stopped. The last group turns the checkout back
  into an ordinary one (`sparse-checkout disable`), which is also what tells a later update that
  the clone is complete.
* **What is verified.** Each package is checked against the SHA-256 the repository index states,
  and a package the index does not state one for is an error. The index itself is trusted on TLS
  alone: `apt` would verify `InRelease` against Termux's GPG key, which this app has no keyring
  for. A compromised mirror or CDN therefore means code execution on the phone where real Termux
  would refuse - a deliberate trade-off for an app that ships no libraries, and worth knowing.
  Beyond that, every xz block is held against the number of bytes its header says it decodes to.
* **Making them run outside of Termux.** The packages are built for
  `/data/data/com.termux/files/usr` and are unpacked into the app's own prefix instead. Every path
  they carry compiled in is pointed back at that prefix through the environment (`Env.command`):
  `LD_LIBRARY_PATH` is searched before the RUNPATH of a binary, and git's helpers, templates,
  config and CA bundle all have environment variables of their own.
* **Unpacking without dependencies.** A Debian package is an `ar` archive around a
  `data.tar.xz`, and Android has no xz decoder in its API, so `Xz.java` decodes the xz container
  and its LZMA2 filter itself.
* **Why it targets API 28.** Android refuses to execute files an app has written into its own
  data directory once the app targets API 29 or newer. Termux stays at 28 for the same reason.
  The app still installs and runs on current Android versions. It needs API 24 or newer, which is
  what the Termux packages are built for.
* **Which Node.js.** The version is read from `.github/workflows/production-environment.yml` in
  the clone, so it follows the repository rather than the app. The Termux repository only ever
  offers the current release and the current long term support one, so an older version than
  those lands on the closest available and the log says so.
* **Devices.** `aarch64`, `arm`, `x86_64` and `i686` are all built for by the repository.
* **The address the server bakes in.** `EXTERNALURL` is read when the server starts. The
  notification follows the phone from WiFi to hotspot and back, but the links the server itself
  writes into shared saves keep the address it started on - restart the server after a network
  change if those matter.
* **The notification.** On Android 13 and newer the app asks for the notification permission when
  the server is first started. Declining it hides the notification, which is the only place the
  address, **Open**, **Share** and **Quit** live; the app screen still works.

## Branding

`res/drawable/vtt_logo.xml`, `ic_launcher.xml`, `ic_launcher_foreground.xml` and
`ic_notification.xml` are conversions of `assets/branding/logo.svg` and
`assets/branding/favicon.svg` - the vector format Android uses takes the same path data. The
colors are the ones `client/css/layout.css` defines.
