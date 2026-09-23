package android.content;
import java.io.File;
public class Context {
  public File getFilesDir() { return new File(System.getProperty("testDir"), "files"); }
  public Context getApplicationContext() { return this; }
}
