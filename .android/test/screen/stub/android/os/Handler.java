package android.os;
import java.util.ArrayList;
import java.util.List;
public class Handler {
  /** what is waiting to be drawn, so that a test can see how much of a burst of output is left */
  public static final List<Runnable> pending = new ArrayList<Runnable>();
  public Handler(Looper looper) { }
  public void post(Runnable runnable) { runnable.run(); }
  public void postDelayed(Runnable runnable, long delay) { pending.add(runnable); }
  public void removeCallbacks(Runnable runnable) { pending.remove(runnable); }
  /** what the looper would do once the delay is over */
  public static void run() {
    List<Runnable> due = new ArrayList<Runnable>(pending);
    pending.clear();
    for(Runnable runnable : due)
      runnable.run();
  }
}
