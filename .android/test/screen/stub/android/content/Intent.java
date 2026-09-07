package android.content;
public class Intent {
  public String action;
  public Intent(Context context, Class<?> target) { }
  public Intent(String action, android.net.Uri uri) { this.action = action; }
  public static final String ACTION_VIEW = "android.intent.action.VIEW";
  public static final String ACTION_SEND = "android.intent.action.SEND";
  public static final String EXTRA_TEXT = "android.intent.extra.TEXT";
  public Intent(String action) { this.action = action; }
  public Intent setType(String type) { return this; }
  public Intent putExtra(String name, String value) { return this; }
  public static Intent createChooser(Intent intent, CharSequence title) { return intent; }
  public Intent setAction(String action) { this.action = action; return this; }
}
