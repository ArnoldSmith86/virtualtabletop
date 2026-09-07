package io.virtualtabletop.server;

import android.content.Context;

import java.io.File;

/** the real one, with the phone's paths and the repository pointed at directories of the test */
final class Env {
  static final String TERMUX_PREFIX = "/data/data/com.termux/files/usr";
  static final String PACKAGE_REPOSITORY = "https://packages.termux.dev/apt/termux-main";
  static final String BRANCH = "main";
  static final long REQUIRED_BYTES = 1100L * 1000 * 1000;
  /** a repository of the test rather than GitHub, so that a clone is a matter of seconds */
  static String REPOSITORY = "file://" + new File(System.getProperty("testDir"), "origin").getAbsolutePath();

  static File prefix(Context context) {
    return new File(context.getFilesDir(), "usr");
  }

  static File temporary(Context context) {
    return new File(prefix(context), "tmp");
  }

  static File repository(Context context) {
    return new File(context.getFilesDir(), "vtt");
  }

  static File installed(Context context) {
    return new File(prefix(context), "var/installed");
  }

  static File npm(Context context) {
    return new File(prefix(context), "lib/node_modules/npm/bin/npm-cli.js");
  }

  static boolean isInstalled(Context context) {
    return false;
  }

  static String architecture() {
    return "aarch64";
  }

  static long freeBytes(Context context) {
    return REQUIRED_BYTES;
  }

  static boolean storageIsTight(Context context) {
    return false;
  }

  static String size(long bytes) {
    return bytes + " bytes";
  }

  static void createDirectories(Context context) {
    temporary(context).mkdirs();
  }

  /** the machine's git, standing in for the one the app downloads onto the phone */
  static File binary(Context context, String name) {
    for(String directory : System.getenv("PATH").split(File.pathSeparator)) {
      File binary = new File(directory, name);
      if(binary.canExecute())
        return binary;
    }
    return new File("/usr/bin/" + name);
  }

  static ProcessBuilder command(Context context, File directory, String... command) {
    ProcessBuilder builder = new ProcessBuilder(command);
    builder.directory(directory);
    builder.redirectErrorStream(true);
    return builder;
  }
}
