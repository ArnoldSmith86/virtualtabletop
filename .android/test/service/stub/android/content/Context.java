package android.content;
import java.io.File;
public class Context {
  public static final String NOTIFICATION_SERVICE = "notification";
  public static final String POWER_SERVICE = "power";
  public Object getSystemService(String name) {
    if(POWER_SERVICE.equals(name)) return new android.os.PowerManager();
    return new android.app.NotificationManager();
  }
  public File getFilesDir() { return new File(System.getProperty("testDir"), "files"); }
  public String getString(int id) { return io.virtualtabletop.server.R.NAMES[id]; }
  public String getString(int id, Object... arguments) { return String.format(getString(id), arguments); }
  public int getColor(int id) { return 0; }
  public void startService(Intent intent) { }
  public Intent registerReceiver(BroadcastReceiver receiver, IntentFilter filter) { Harness.receiver = receiver; return null; }
  public void unregisterReceiver(BroadcastReceiver receiver) { Harness.receiver = null; }
}
