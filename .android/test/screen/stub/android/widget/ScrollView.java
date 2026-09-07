package android.widget;
import android.view.View;
public class ScrollView extends View {
  public int scrolled;
  public void fullScroll(int direction) { scrolled = direction; }
}
