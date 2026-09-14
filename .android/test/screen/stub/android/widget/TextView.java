package android.widget;
import android.view.View;
public class TextView extends View {
  public CharSequence text = "";
  public int links;
  public void setText(CharSequence text) { this.text = text; }
  public void setText(int id) { this.text = io.virtualtabletop.server.R.NAMES[id]; }
  public CharSequence getText() { return text; }
  public void setTypeface(android.graphics.Typeface typeface) { }
  public void setTextSize(int unit, float size) { }
  public void setAutoLinkMask(int mask) { links = mask; }
  public int color;
  public void setTextColor(int value) { color = value; }
}
