package android.os;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
/** one thread for everything posted, which is what the main looper is */
public class Handler {
  private static final ScheduledThreadPoolExecutor main = new ScheduledThreadPoolExecutor(1);
  private static final Map<Runnable, List<Future<?>>> pending = new HashMap<>();
  public Handler(Looper looper) { }
  public void post(Runnable task) { postDelayed(task, 0); }
  public synchronized void postDelayed(Runnable task, long milliseconds) {
    List<Future<?>> futures = pending.get(task);
    if(futures == null)
      pending.put(task, futures = new ArrayList<>());
    futures.add(main.schedule(task, milliseconds, TimeUnit.MILLISECONDS));
  }
  public synchronized void removeCallbacks(Runnable task) {
    List<Future<?>> futures = pending.remove(task);
    if(futures != null)
      for(Future<?> future : futures)
        future.cancel(false);
  }
}
