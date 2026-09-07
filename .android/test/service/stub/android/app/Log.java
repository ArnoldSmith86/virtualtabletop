package android.app;
/** every stub that would touch the phone prints here instead, so the test can read it back */
public final class Log {
  public static final StringBuilder text = new StringBuilder();
  public static synchronized void say(String line) {
    text.append(line).append('\n');
    System.out.println("  [android] " + line);
  }
}
