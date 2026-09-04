package io.virtualtabletop.server;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * What the activity shows. The installer and the server both run outside of it - the installer on
 * its own thread, the server in a foreground service that outlives the activity - so both write
 * here and whoever is on screen renders it.
 */
final class AppState {
  interface Listener {
    void stateChanged();
  }

  private static final int MAXIMUM_LINES = 400;

  private static final Deque<String> lines = new ArrayDeque<>();
  private static String step = "";
  private static boolean working;
  private static Listener listener;

  private AppState() {
  }

  static synchronized void listen(Listener newListener) {
    listener = newListener;
  }

  /** Appends output of git, npm or the server. */
  static synchronized void log(String text) {
    for(String line : text.split("\n")) {
      lines.addLast(line);
      if(lines.size() > MAXIMUM_LINES)
        lines.removeFirst();
    }
    changed();
  }

  /** Names what is going on right now, which is shown above the log as well. */
  static synchronized void step(String text) {
    step = text;
    log(text);
  }

  static synchronized void working(boolean isWorking) {
    working = isWorking;
    if(!isWorking)
      step = "";
    changed();
  }

  static synchronized boolean isWorking() {
    return working;
  }

  static synchronized String step() {
    return step;
  }

  static synchronized String log() {
    StringBuilder text = new StringBuilder();
    for(String line : lines) {
      if(text.length() > 0)
        text.append('\n');
      text.append(line);
    }
    return text.toString();
  }

  static synchronized void changed() {
    if(listener != null)
      listener.stateChanged();
  }
}
