package io.virtualtabletop.server;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * What the activity shows. The installer and the server both run outside of it, in a foreground
 * service that outlives the activity, so both write here and whoever is on screen renders it.
 */
final class AppState {
  interface Listener {
    void stateChanged();
  }

  private static final int MAXIMUM_LINES = 400;

  /** a percentage of -1 means that how long something takes is not known */
  static final int UNKNOWN = -1;

  private static final Deque<String> lines = new ArrayDeque<>();
  private static final List<Listener> listeners = new ArrayList<>();
  private static String step = "";
  private static boolean working;
  private static int percent = UNKNOWN;
  private static boolean lastLineIsProgress;

  private AppState() {
  }

  static synchronized void listen(Listener listener, boolean wanted) {
    listeners.remove(listener);
    if(wanted)
      listeners.add(listener);
  }

  /** Appends output of git, npm or the server. */
  static synchronized void log(String text) {
    for(String line : text.split("\n")) {
      lines.addLast(line);
      if(lines.size() > MAXIMUM_LINES)
        lines.removeFirst();
    }
    lastLineIsProgress = false;
    changed();
  }

  /**
   * Overwrites the last line instead of appending, which is how git and npm draw a counter that
   * counts up: they end such a line with a carriage return rather than a newline.
   */
  static synchronized void progress(String text) {
    if(lastLineIsProgress && !lines.isEmpty())
      lines.removeLast();
    lines.addLast(text);
    lastLineIsProgress = true;
    changed();
  }

  /** Names what is going on right now, which is shown above the log as well. */
  static synchronized void step(String text) {
    step = text;
    log(text);
  }

  static synchronized void percent(int value) {
    percent = value;
    changed();
  }

  static synchronized void working(boolean isWorking) {
    working = isWorking;
    percent = UNKNOWN;
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

  static synchronized int percent() {
    return percent;
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
    for(Listener listener : new ArrayList<>(listeners))
      listener.stateChanged();
  }
}
