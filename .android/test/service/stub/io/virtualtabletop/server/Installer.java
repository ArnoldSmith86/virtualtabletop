package io.virtualtabletop.server;

import android.content.Context;

final class Installer {
  static void start(Context context, Runnable whenDone) {
    whenDone.run();
  }
}
