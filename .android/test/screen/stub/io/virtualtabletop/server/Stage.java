package io.virtualtabletop.server;

import java.io.File;
import java.io.FileOutputStream;

/** what a test stages: the state the service and the installer would have left behind */
public final class Stage {
  private Stage() {
  }

  public static void reset() {
    ServerService.running = false;
    ServerService.starting = false;
    ServerService.installing = false;
    // a run that starts clears the failure of the one before it, and one that ends clears the step
    AppState.working(true);
    AppState.working(false);
    try {
      java.lang.reflect.Field lines = AppState.class.getDeclaredField("lines");
      lines.setAccessible(true);
      ((java.util.Collection<?>)lines.get(null)).clear();
    } catch(Exception e) {
      throw new RuntimeException(e);
    }
  }

  public static void server(boolean running, boolean starting) {
    ServerService.running = running;
    ServerService.starting = starting;
  }

  public static void working(boolean working, boolean installing) {
    ServerService.installing = installing;
    AppState.working(working);
  }

  public static void step(String text) {
    AppState.step(text);
  }

  public static void failed(String message) {
    AppState.failed(message);
  }

  public static void serverFailed(String message) {
    AppState.serverFailed(message);
  }

  /** the three files Env.isInstalled looks for */
  public static void installed(boolean installed) throws Exception {
    File files = new File(System.getProperty("testDir"), "files");
    File[] markers = { new File(files, "usr/bin/node"), new File(files, "vtt/server.mjs"),
        new File(files, "usr/var/ready") };
    for(File marker : markers) {
      if(installed) {
        marker.getParentFile().mkdirs();
        new FileOutputStream(marker).close();
        marker.setExecutable(true);
      } else {
        marker.delete();
      }
    }
  }
}
