package android.app;
import android.content.Context;
import android.content.Intent;
public class PendingIntent {
  public static final int FLAG_UPDATE_CURRENT = 1;
  public static final int FLAG_IMMUTABLE = 2;
  public static PendingIntent getActivity(Context context, int request, Intent intent, int flags) { return new PendingIntent(); }
  public static PendingIntent getService(Context context, int request, Intent intent, int flags) { return new PendingIntent(); }
}
