package android.content;
import java.io.File;
public class Context {
  /** a files directory that reports whatever free space a test wants to stage */
  public static class Files extends File {
    public static long usable = 64L * 1000 * 1000 * 1000;
    public Files(String path) { super(path); }
    @Override public long getUsableSpace() { return usable; }
  }
  public File getFilesDir() { return new Files(System.getProperty("testDir") + "/files"); }
  public String getString(int id) { return io.virtualtabletop.server.R.NAMES[id]; }
  public String getString(int id, Object... arguments) { return String.format(getString(id), arguments); }
  public CharSequence getText(int id) { return getString(id); }
  public int getColor(int id) { return id; }
  public static String lastService;
  public static String lastActivity;
  public void startService(Intent intent) { lastService = intent.action; }
  public void startActivity(Intent intent) { lastActivity = intent.action; }
}
