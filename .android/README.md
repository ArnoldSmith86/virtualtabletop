# VirtualTabletop on Android

A small app that turns an Android phone into a VirtualTabletop server: it fetches Node.js, git
and this repository once, then runs the server offline and shows the address of the `vtt` room in
a notification, so everyone in the same WiFi - or connected to the phone's hotspot - can play.

It does by itself what the Termux instructions used to describe by hand, without needing Termux.

The built app is committed as [`VirtualTabletop.apk`](VirtualTabletop.apk), which is what the
Android section of the main README links to. Refresh it whenever anything under `.android/`
changes:

    ANDROID_HOME=~/Android/Sdk .android/build-apk.sh
    cp .android/out/VirtualTabletop-*.apk .android/VirtualTabletop.apk

Everyone who builds signs with a self-signed key of their own, so a refreshed APK usually cannot
be installed over the one before it - uninstall first. Committing `keystore.jks` (or keeping it
somewhere the release comes from) would be what makes updates install over each other.

## Using it

The card at the top says what is going on; the big button below the console is always the next
step rather than the state, which is what makes the first launch a single obvious press.

| Button | What it does |
| --- | --- |
| **Install**, then **Start server**, then **Open** | The one big button. *Install* fetches git, Node.js and the clone and runs `npm install --omit=dev` - the only step that needs a connection, running in the foreground service with a wake lock so it keeps going while the screen is off, and pressing it again after a lost connection carries on. *Start server* runs `node server.mjs`; the card says *Starting the server* until the server reports the port it listens on. *Open* hands the address to the browser. |
| **Update** / **Share** | The outline button next to *Quit*. It updates an existing installation, and offers the address to any other app while the server runs. Before the first installation there is nothing to update, so it is not there. |
| **Quit** | Shuts the server down (the rooms are saved) and closes the app. While players are connected or a download is running it asks first. |

While the server runs, the notification shows `http://<address>:8272/vtt` with the same three
actions the screen offers: **Open** hands the address to the browser, **Share** to any other app,
and **Quit** stops everything; while something is downloading it shows how far it has come. The
address is the hotspot's when tethering is on and the WiFi one otherwise, and the server is
restarted on the new one when the phone changes network.

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
  index. Together they are about 35 MB to download and 170 MB unpacked; with the clone,
  `node_modules` and the caches git and npm leave behind, a finished installation occupies about
  1.1 GB, which is the number the introduction on the empty console states. The app compares it
  against the free space and warns when the phone has less than 400 MB to spare on top of it -
  both on that screen and in the log when an installation starts.
* **What is cloned, and how it survives a broken connection.** Only the tip of `main`, shallow and
  single-branch and without tags. The clone keeps no reflog and prunes right away, so an update
  replaces that one snapshot instead of piling up the ones before it. Git cannot resume a clone
  that broke, so the app does not take it in one piece: it clones with `--filter=blob:none`, which
  is a few megabytes, and then fills the file contents in with `git sparse-checkout add`, a group
  of directories of about a thousand files at a time. Every group that arrived stays in the clone,
  so pressing the button again continues where it stopped. The last group turns the checkout back
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
  The app still installs and runs on current Android versions. It needs API 24 - Android 7.0 - or
  newer, which is what the Termux packages are built for.
* **Which Node.js.** The version is read from `.github/workflows/production-environment.yml` in
  the clone, so it follows the repository rather than the app. The Termux repository only ever
  offers the current release and the current long term support one, so an older version than
  those lands on the closest available and the log says so.
* **Devices.** The repository builds every package for `aarch64`, `arm`, `x86_64` and `i686`, so
  `arm64-v8a`, `armeabi-v7a`, `x86_64` and `x86` devices and emulators are all covered. A device
  whose ABI is none of those is told that instead of installing anything.
* **A screen that survives a rotation.** The logo is given a height rather than the screen's
  width (`values/dimens.xml`, and a smaller one in `values-land/`), so a wide and short screen
  does not turn it into a banner that pushes the console and the buttons off the bottom. The
  console is the only part that grows and shrinks with the room that is left.
* **When the server counts as running.** Node takes a few seconds to come up on a phone, and it
  can still fail on the way - an occupied port, a half finished installation. The app therefore
  says *Starting the server* until the server has printed that it is listening, and only then
  shows the address and offers to open or share it.
* **The address the server bakes in.** `EXTERNALURL` is read when the server starts, so an
  address that changes underneath a running server is wrong in every link it hands out. The app
  watches for that - a connectivity broadcast, plus a look every 15 seconds, because turning the
  hotspot on and off does not always broadcast anything - and restarts the server on the new
  address, with a toast saying so. Every switch between two networks has a moment with no address
  at all, which is waited out rather than restarted on.
* **The notification.** On Android 13 and newer the app asks for the notification permission when
  the server is first started. Declining it hides the notification, which is the only place the
  address, **Open**, **Share** and **Quit** live; the app screen still works.

## Branding

`res/drawable/vtt_logo.xml`, `ic_launcher.xml`, `ic_launcher_foreground.xml` and
`ic_notification.xml` are conversions of `assets/branding/logo.svg` and
`assets/branding/favicon.svg` - the vector format Android uses takes the same path data. The
colors are the ones `client/css/layout.css` defines.
