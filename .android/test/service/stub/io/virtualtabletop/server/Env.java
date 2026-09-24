package io.virtualtabletop.server;

import android.content.Context;

import java.io.File;
import java.util.Map;

/** the real one, with the phone's paths pointed at a directory of the test */
final class Env {
  static final int PORT = 8272;
  static final String ROOM = "vtt";

  static File prefix(Context context) {
    return new File(context.getFilesDir(), "usr");
  }

  static File temporary(Context context) {
    return new File(prefix(context), "tmp");
  }

  static File repository(Context context) {
    return new File(context.getFilesDir(), "vtt");
  }

  static File saveDirectory(Context context) {
    return new File(context.getFilesDir(), "save");
  }

  static File binary(Context context, String name) {
    return new File(prefix(context), "bin/" + name);
  }

  static boolean isInstalled(Context context) {
    return true;
  }

  static ProcessBuilder command(Context context, File directory, String... command) {
    // the phone's shell is not where a Linux machine keeps it
    for(int i = 0; i < command.length; i++)
      if(command[i].equals("/system/bin/sh"))
        command[i] = "/bin/sh";
    ProcessBuilder builder = new ProcessBuilder(command);
    builder.directory(directory);
    builder.redirectErrorStream(true);
    Map<String, String> environment = builder.environment();
    environment.clear();
    environment.put("PATH", "/usr/bin:/bin");
    return builder;
  }
}
