package io.virtualtabletop.server;
/** the state the screen reads off the service, staged by the test */
public class ServerService {
  public static final String ACTION_START = "io.virtualtabletop.server.START";
  public static final String ACTION_UPDATE = "io.virtualtabletop.server.UPDATE";
  public static final String ACTION_QUIT = "io.virtualtabletop.server.QUIT";
  static boolean running;
  static boolean starting;
  static boolean installing;
  static boolean isRunning() { return running; }
  static boolean isStarting() { return starting; }
  static boolean isInstalling() { return installing; }
  static String url() { return "http://192.168.1.20:8272/vtt"; }
}
