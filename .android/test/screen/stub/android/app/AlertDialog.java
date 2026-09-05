package android.app;
import android.content.Context;
import android.content.DialogInterface;
/** records the dialog a press asked for, and answers it the way the test says */
public class AlertDialog {
  public static String lastMessage;
  public static boolean confirm = true;

  public static class Builder {
    private int message;
    private DialogInterface.OnClickListener positive;
    public Builder(Context context) { }
    public Builder setTitle(int title) { return this; }
    public Builder setMessage(int message) { this.message = message; return this; }
    public Builder setNegativeButton(int label, DialogInterface.OnClickListener listener) { return this; }
    public Builder setPositiveButton(int label, DialogInterface.OnClickListener listener) {
      positive = listener;
      return this;
    }
    public void show() {
      lastMessage = io.virtualtabletop.server.R.NAMES[message];
      if(confirm && positive != null)
        positive.onClick(null, 0);
    }
  }
}
