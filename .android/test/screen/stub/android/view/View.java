package android.view;
public class View {
  public static final int VISIBLE = 0;
  public static final int INVISIBLE = 4;
  public static final int GONE = 8;
  public static final int FOCUS_UP = 33;
  public static final int FOCUS_DOWN = 130;
  public interface OnClickListener {
    void onClick(View view);
  }
  public boolean enabled = true;
  public int visibility = VISIBLE;
  public OnClickListener listener;
  public void setOnClickListener(OnClickListener listener) { this.listener = listener; }
  public void setEnabled(boolean enabled) { this.enabled = enabled; }
  public void setVisibility(int visibility) { this.visibility = visibility; }
  public void post(Runnable runnable) { runnable.run(); }
  public int getScrollY() { return 0; }
  public int getHeight() { return 0; }
  public int getBottom() { return 0; }
  public void setContentDescription(CharSequence description) { this.description = description; }
  public CharSequence description;
}
