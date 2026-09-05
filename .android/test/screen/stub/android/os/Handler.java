package android.os;
public class Handler {
  public Handler(Looper looper) { }
  public void post(Runnable runnable) { runnable.run(); }
}
