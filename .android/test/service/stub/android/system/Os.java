package android.system;
public final class Os {
  public static void kill(int pid, int signal) throws ErrnoException {
    android.app.Log.say("kill " + pid);
    try {
      new ProcessBuilder("kill", "-" + signal, String.valueOf(pid)).start().waitFor();
    } catch(Exception e) {
      throw new ErrnoException(e.toString());
    }
  }
}
