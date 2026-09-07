package android.content;
public class Intent {
  public static final String ACTION_SEND = "send";
  public static final String ACTION_VIEW = "view";
  public static final String EXTRA_TEXT = "text";
  public static final int FLAG_ACTIVITY_NEW_TASK = 1;
  private String action;
  public Intent() { }
  public Intent(String action) { this.action = action; }
  public Intent(String action, android.net.Uri uri) { this.action = action; }
  public Intent(Context context, Class<?> target) { }
  public String getAction() { return action; }
  public Intent setAction(String action) { this.action = action; return this; }
  public Intent setType(String type) { return this; }
  public Intent putExtra(String name, String value) { return this; }
  public Intent addFlags(int flags) { return this; }
  public static Intent createChooser(Intent intent, String title) { return intent; }
}
