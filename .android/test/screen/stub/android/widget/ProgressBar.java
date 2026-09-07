package android.widget;
import android.view.View;
public class ProgressBar extends View {
  public boolean indeterminate;
  public int progress;
  public void setIndeterminate(boolean value) { indeterminate = value; }
  public void setProgress(int value) { progress = value; }
}
