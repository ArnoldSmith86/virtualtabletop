package android.app;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
/** enough of an activity for the screen to be rendered off a device: the views it looks up */
public class Activity extends Context {
  public final java.util.Map<Integer, View> views = new java.util.HashMap<>();
  protected void onCreate(Bundle bundle) { }
  protected void onResume() { }
  protected void onPause() { }
  protected void onDestroy() { }
  public void setContentView(int layout) {
    views.put(io.virtualtabletop.server.R.id.state, new android.widget.TextView());
    views.put(io.virtualtabletop.server.R.id.detail, new android.widget.TextView());
    views.put(io.virtualtabletop.server.R.id.log, new android.widget.TextView());
    views.put(io.virtualtabletop.server.R.id.logScroll, new android.widget.ScrollView());
    views.put(io.virtualtabletop.server.R.id.progress, new android.widget.ProgressBar());
    views.put(io.virtualtabletop.server.R.id.primary, new android.widget.Button());
    views.put(io.virtualtabletop.server.R.id.secondary, new android.widget.Button());
    android.widget.Button quit = new android.widget.Button();
    // the label the layout gives it, which the screen only ever leaves alone
    quit.setText(io.virtualtabletop.server.R.string.quit);
    views.put(io.virtualtabletop.server.R.id.quit, quit);
  }
  public View findViewById(int id) { return views.get(id); }
  public void finishAndRemoveTask() { }
}
