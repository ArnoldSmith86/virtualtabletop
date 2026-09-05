package android.widget;
public class Toast {
  public static final int LENGTH_LONG = 1;
  private final String text;
  private Toast(String text) { this.text = text; }
  public static Toast makeText(android.content.Context context, String text, int duration) { return new Toast(text); }
  public void show() { android.app.Log.say("toast: " + text); }
}
