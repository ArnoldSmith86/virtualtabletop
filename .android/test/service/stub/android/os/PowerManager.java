package android.os;
public class PowerManager {
  public static final int PARTIAL_WAKE_LOCK = 1;
  public WakeLock newWakeLock(int flags, String tag) { return new WakeLock(tag); }
  public static class WakeLock {
    private final String tag;
    private boolean held;
    WakeLock(String tag) { this.tag = tag; }
    public void acquire() { held = true; android.app.Log.say("wake lock " + tag); }
    public void release() { held = false; android.app.Log.say("wake lock released"); }
    public boolean isHeld() { return held; }
  }
}
