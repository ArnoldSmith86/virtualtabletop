package android.app;
public class Notification {
  public static final int PRIORITY_LOW = -1;
  public static final int VISIBILITY_PUBLIC = 1;
  public String title = "";
  public String text = "";
  public String actions = "";
  public String progress = "";
  public String toString() { return "\"" + title + "\" / \"" + text + "\" [" + actions + "]" + progress; }
  public static class Builder {
    private final Notification notification = new Notification();
    public Builder(android.content.Context context, String channel) { }
    public Builder(android.content.Context context) { }
    public Builder setSmallIcon(int icon) { return this; }
    public Builder setColor(int color) { return this; }
    public Builder setContentIntent(PendingIntent intent) { return this; }
    public Builder setOngoing(boolean ongoing) { return this; }
    public Builder setShowWhen(boolean show) { return this; }
    public Builder setVisibility(int visibility) { return this; }
    public Builder setPriority(int priority) { return this; }
    public Builder setContentTitle(String title) { notification.title = title; return this; }
    public Builder setContentText(String text) { notification.text = text; return this; }
    public Builder setStyle(Object style) { return this; }
    public Builder setProgress(int maximum, int value, boolean indeterminate) {
      notification.progress = indeterminate ? " (working)" : " (" + value + "%)";
      return this;
    }
    public Builder addAction(int icon, String title, PendingIntent intent) {
      notification.actions += (notification.actions.isEmpty() ? "" : " ") + title;
      return this;
    }
    public Notification build() { return notification; }
  }
  public static class BigTextStyle {
    public BigTextStyle bigText(String text) { return this; }
  }
}
