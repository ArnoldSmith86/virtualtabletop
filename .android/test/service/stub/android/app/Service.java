package android.app;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
public abstract class Service extends Context {
  public abstract IBinder onBind(Intent intent);
  public int onStartCommand(Intent intent, int flags, int startId) { return 0; }
  public void onDestroy() { }
  public void startForeground(int id, Notification notification) { Log.say("foreground: " + notification); }
  public void stopForeground(boolean remove) { Log.say("foreground gone"); }
  public void stopSelf() { }
  public static final int START_NOT_STICKY = 2;
}
