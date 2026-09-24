import android.content.Harness;
import android.content.Intent;

import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;

/** Drives ServerService with stubbed Android classes and a shell script standing in for node. */
public class ServiceTest {
  static Class<?> service;
  static Object instance;
  static int checks;

  public static void main(String[] args) throws Exception {
    service = Class.forName("io.virtualtabletop.server.ServerService");
    instance = service.getDeclaredConstructor().newInstance();

    send("io.virtualtabletop.server.START");
    check("the server does not count as running before it said Listening on", !running() && starting());
    check("the screen says what it is doing", step().startsWith("Starting the server on http://192.168.1.20:8272/vtt"));
    check("the notification says it is starting", log().contains("\"VirtualTabletop is starting\""));

    waitFor("the server to report its port", true);
    check("it is running once it did", running() && !starting());
    check("the address it was given is the one of the phone", log().contains("EXTERNALURL=http://192.168.1.20:8272"));
    check("the notification hands out the address",
        said("\"VirtualTabletop is running\" / \"http://192.168.1.20:8272/vtt\" [Open Share Quit]"));
    int pid = pid();

    say("a connectivity change that changed nothing");
    Harness.receiver.onReceive(null, new Intent());
    Thread.sleep(3000);
    check("the server was left alone", running() && pid() == pid);

    say("the phone lost its network for a moment");
    address(null);
    Harness.receiver.onReceive(null, new Intent());
    Thread.sleep(3000);
    check("the server was left alone", running() && pid() == pid);

    say("the hotspot came up, so the phone has another address");
    address("192.168.43.1");
    Harness.receiver.onReceive(null, new Intent());
    waitFor("the server to go down", false);
    check("a toast says what is happening",
        said("toast: The network changed - restarting the server on http://192.168.43.1:8272/vtt"));
    check("and so does the notification",
        said("\"VirtualTabletop is starting\" / \"The network changed - restarting the server on http://192.168.43.1:8272/vtt\""));
    waitFor("the server to come back", true);
    check("it runs on the new address", pid() != pid && url().equals("http://192.168.43.1:8272/vtt"));
    check("and was told about it", log().contains("EXTERNALURL=http://192.168.43.1:8272"));

    say("the server died on its own");
    Runtime.getRuntime().exec(new String[] { "kill", "-9", String.valueOf(pid()) }).waitFor();
    waitFor("the app to notice", false);
    check("nothing is left running", !running() && !starting());
    check("the screen is told that the server stopped rather than falling back to the ready state",
        serverFailed() && failure().startsWith("The server stopped: "));

    say("the server exits before it ever listens - an occupied port, say");
    node("#!/bin/sh\necho 'Error: listen EADDRINUSE: address already in use :::8272'\nexit 1\n");
    send("io.virtualtabletop.server.START");
    waitForFailure();
    check("what it said last is kept",
        serverFailed() && failure().equals("The server stopped before it was ready: "
            + "Error: listen EADDRINUSE: address already in use :::8272"));

    say("the server exits before it listens and says nothing at all");
    node("#!/bin/sh\nexit 3\n");
    send("io.virtualtabletop.server.START");
    waitForFailure();
    check("the status it ended with stands in for it",
        failure().equals("The server stopped before it was ready: it ended with code 3"));

    say("node is not there at all - a half finished installation");
    new File(System.getProperty("testDir"), "files/usr/bin/node").delete();
    send("io.virtualtabletop.server.START");
    waitForFailure();
    check("what the shell said about it is kept", serverFailed() && failure().contains("not found"));

    say("the clone the server lives in is gone, so nothing can even be launched");
    File clone = new File(System.getProperty("testDir"), "files/vtt");
    File away = new File(System.getProperty("testDir"), "files/vtt-away");
    clone.renameTo(away);
    send("io.virtualtabletop.server.START");
    waitForFailure();
    check("the screen says that it could not be started",
        serverFailed() && failure().startsWith("The server could not be started"));
    away.renameTo(clone);

    say("a new attempt starts with a clean screen");
    node("#!/bin/sh\ntrap 'exit 0' TERM\necho \"Listening on $PORT\"\nwhile true; do sleep 0.2; done\n");
    send("io.virtualtabletop.server.START");
    waitFor("the server to come back", true);
    check("the failure of the attempt before is forgotten", failure() == null && !serverFailed());

    System.out.println("\n" + checks + " checks passed");
    // the last server is still up, and nothing would reap it once this process is gone
    Runtime.getRuntime().exec(new String[] { "kill", String.valueOf(pid()) }).waitFor();
    System.exit(0);
  }

  static void send(String action) throws Exception {
    Method start = service.getMethod("onStartCommand", Intent.class, int.class, int.class);
    start.invoke(instance, new Intent(action), 0, 0);
  }

  static boolean running() throws Exception {
    return (Boolean)accessible(service, "isRunning").invoke(null);
  }

  static boolean starting() throws Exception {
    return (Boolean)accessible(service, "isStarting").invoke(null);
  }

  static String url() throws Exception {
    return (String)accessible(service, "url").invoke(null);
  }

  static String failure() throws Exception {
    return (String)accessible(Class.forName("io.virtualtabletop.server.AppState"), "failure").invoke(null);
  }

  static boolean serverFailed() throws Exception {
    return (Boolean)accessible(Class.forName("io.virtualtabletop.server.AppState"), "serverFailed").invoke(null);
  }

  /** Replaces the script that stands in for node, so that it can fail in a chosen way. */
  static void node(String script) throws Exception {
    File binary = new File(System.getProperty("testDir"), "files/usr/bin/node");
    binary.getParentFile().mkdirs();
    Files.write(binary.toPath(), script.getBytes("UTF-8"));
    binary.setExecutable(true);
  }

  static String step() throws Exception {
    Method step = Class.forName("io.virtualtabletop.server.AppState").getDeclaredMethod("step");
    step.setAccessible(true);
    return (String)step.invoke(null);
  }

  static String log() throws Exception {
    Method log = Class.forName("io.virtualtabletop.server.AppState").getDeclaredMethod("log");
    log.setAccessible(true);
    return android.app.Log.text + "\n" + log.invoke(null);
  }

  static void address(String address) throws Exception {
    Field current = Class.forName("io.virtualtabletop.server.Network").getDeclaredField("current");
    current.setAccessible(true);
    current.set(null, address);
  }

  static int pid() throws Exception {
    File file = new File(System.getProperty("testDir"), "files/usr/tmp/server.pid");
    if(!file.isFile())
      return -1;
    return Integer.parseInt(new String(Files.readAllBytes(file.toPath()), "UTF-8").trim());
  }

  /**
   * Whether the app has said something, waited for rather than read once: the state a check like
   * this follows is set a moment before the line about it is written.
   */
  static boolean said(String what) throws Exception {
    for(int waited = 0; waited < 5000; waited += 50) {
      if(log().contains(what))
        return true;
      Thread.sleep(50);
    }
    return false;
  }

  /** Waits for the app to have recorded why the server is not running. */
  static void waitForFailure() throws Exception {
    for(int waited = 0; waited < 15000; waited += 100) {
      if(failure() != null && !running() && !starting())
        return;
      Thread.sleep(100);
    }
    throw new IllegalStateException("waited in vain for the reason to be recorded");
  }

  /** Waits for the server to be up or down, and fails the test when it never gets there. */
  static void waitFor(String what, boolean up) throws Exception {
    for(int waited = 0; waited < 15000; waited += 100) {
      if(running() == up && (!up || pid() > 0))
        return;
      Thread.sleep(100);
    }
    throw new IllegalStateException("waited in vain for " + what);
  }

  static Method accessible(Class<?> owner, String name) throws Exception {
    Method method = owner.getDeclaredMethod(name);
    method.setAccessible(true);
    return method;
  }

  static void say(String what) {
    System.out.println("\n" + what);
  }

  static void check(String what, boolean passed) {
    if(!passed)
      throw new IllegalStateException("FAILED: " + what);
    checks++;
    System.out.println("  ok: " + what);
  }
}
