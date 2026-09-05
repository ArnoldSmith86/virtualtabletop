import android.app.AlertDialog;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;

import io.virtualtabletop.server.Stage;

import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * Renders the main screen off a device: it drives the real MainActivity against stub views and
 * prints what every state ends up showing, then checks the parts a phone would otherwise be
 * needed for - which button is the one to press, what survives a failed install, and that a
 * press that would interrupt players or a download asks first.
 */
public class MainTest {
  private static final Class<?> ACTIVITY = activityClass();
  private static int failures;

  public static void main(String[] arguments) throws Exception {
    new File(System.getProperty("testDir") + "/files").mkdirs();

    Stage.reset();
    Stage.installed(false);
    Object screen = show("Nothing installed, 8 GB free", 8000L * 1000 * 1000);
    check(text(screen, "state").equals("Not installed yet"), "the card says that nothing is installed");
    check(button(screen, "primary").text.equals("Install"), "the big button is Install");
    check(button(screen, "primary").enabled, "and it can be pressed");
    check(button(screen, "secondary").visibility == View.GONE, "there is nothing to update yet, so Update is away");
    check(button(screen, "quit").enabled, "Quit can be pressed");
    check(text(screen, "log").contains("about 1.1 GB of storage"), "the console states what an installation takes");
    check(text(screen, "log").contains("Termux"), "the console thanks Termux");
    check(!text(screen, "log").contains("free on this phone"), "a phone with room to spare is not warned");
    press(screen, "primary");
    check("io.virtualtabletop.server.UPDATE".equals(Context.lastService), "pressing it starts the installation");

    Stage.reset();
    screen = show("Nothing installed, 300 MB free", 300L * 1000 * 1000);
    check(text(screen, "log").contains("Only 300 MB of storage are free"), "a phone that is nearly full is warned");

    Stage.reset();
    Stage.working(true, true);
    Stage.step("Downloading VirtualTabletop - part 7 of 15");
    screen = show("Installing", 8000L * 1000 * 1000);
    check(text(screen, "state").equals("Installing"), "the card says what is going on");
    check(!button(screen, "primary").enabled, "the big button waits");
    check(button(screen, "quit").enabled, "but Quit is still a way out");
    check(((ProgressBar)view(screen, "progress")).visibility == View.VISIBLE, "the progress bar is shown");
    AlertDialog.lastMessage = null;
    press(screen, "quit");
    check(AlertDialog.lastMessage != null && AlertDialog.lastMessage.startsWith("The download stops"),
        "pressing Quit during a download asks first");
    check("io.virtualtabletop.server.QUIT".equals(Context.lastService), "and quits once it is confirmed");

    Stage.reset();
    Stage.failed("git exited with 128");
    screen = show("The installation failed", 8000L * 1000 * 1000);
    check(text(screen, "state").equals("The installation stopped"), "the card says that it failed");
    check(((TextView)view(screen, "state")).color == io.virtualtabletop.server.R.color.negative,
        "in the colour of a failure");
    check(text(screen, "detail").contains("git exited with 128"), "and what went wrong");
    check(text(screen, "detail").contains("Press Install again"), "and what to do about it");

    Stage.reset();
    Stage.installed(true);
    Stage.serverFailed("The server stopped before it was ready: Error: listen EADDRINUSE :::8272");
    screen = show("The server did not come up", 8000L * 1000 * 1000);
    check(text(screen, "state").equals("The server stopped"), "the card says that the server is not running");
    check(((TextView)view(screen, "state")).color == io.virtualtabletop.server.R.color.negative,
        "in the colour of a failure");
    check(text(screen, "detail").contains("EADDRINUSE"), "and what the server said before it went");
    check(text(screen, "detail").contains("Press Start server to try again"), "and what to do about it");
    check(button(screen, "primary").text.equals("Start server") && button(screen, "primary").enabled,
        "the big button offers another attempt");

    Stage.reset();
    Stage.installed(true);
    screen = show("Installed and idle", 8000L * 1000 * 1000);
    check(text(screen, "state").equals("Ready to play"), "the card says it is ready");
    check(button(screen, "primary").text.equals("Start server"), "the big button is Start server");
    check(button(screen, "secondary").visibility == View.VISIBLE
        && button(screen, "secondary").text.equals("Update"), "Update is offered next to Quit");
    press(screen, "primary");
    check("io.virtualtabletop.server.START".equals(Context.lastService), "pressing it starts the server");

    Stage.reset();
    Stage.installed(true);
    Stage.server(false, true);
    screen = show("Starting the server", 8000L * 1000 * 1000);
    check(text(screen, "state").equals("Starting the server"), "the card says the server is coming up");
    check(text(screen, "detail").contains("few seconds"), "and how long that takes");
    check(!button(screen, "primary").enabled, "the big button waits");

    Stage.reset();
    Stage.installed(true);
    Stage.server(true, false);
    screen = show("The server runs", 8000L * 1000 * 1000);
    check(text(screen, "state").equals("Players open this address"), "the card names the address for what it is");
    check(text(screen, "detail").startsWith("http://"), "and shows it");
    check(String.valueOf(view(screen, "detail").description).contains("Open the room"),
        "which a screen reader is told about");
    check(button(screen, "primary").text.equals("Open") && button(screen, "primary").enabled,
        "the big button opens the room");
    check(button(screen, "secondary").text.equals("Share") && button(screen, "secondary").enabled,
        "and Share sits next to it");
    Context.lastActivity = null;
    press(screen, "primary");
    check("android.intent.action.VIEW".equals(Context.lastActivity), "pressing Open hands the address to the browser");
    press(screen, "secondary");
    check("android.intent.action.SEND".equals(Context.lastActivity), "pressing Share offers it to other apps");
    AlertDialog.lastMessage = null;
    press(screen, "quit");
    check(AlertDialog.lastMessage != null && AlertDialog.lastMessage.startsWith("The server stops"),
        "quitting while players are connected asks first");

    System.out.println(failures == 0 ? "\nall checks passed" : "\n" + failures + " checks failed");
    System.exit(failures == 0 ? 0 : 1);
  }

  private static Object show(String title, long free) throws Exception {
    Context.Files.usable = free;
    Object screen = ACTIVITY.getConstructor().newInstance();
    call(screen, "onCreate", Bundle.class, null);
    call(screen, "onResume", null, null);

    System.out.println("=== " + title + " ===");
    System.out.println("card:      " + text(screen, "state"));
    System.out.println("           " + text(screen, "detail").replace("\n", "\n           "));
    System.out.println("buttons:   [" + button(screen, "primary").text + "]"
        + (button(screen, "primary").enabled ? "" : " (disabled)")
        + (button(screen, "secondary").visibility == View.GONE ? ""
            : "  [" + button(screen, "secondary").text + "]"
              + (button(screen, "secondary").enabled ? "" : " (disabled)"))
        + "  [" + button(screen, "quit").text + "]");
    System.out.println("console:   " + text(screen, "log").replace("\n", "\n           "));
    call(screen, "onPause", null, null);
    System.out.println();
    return screen;
  }

  private static void check(boolean passed, String what) {
    System.out.println((passed ? "ok   " : "FAIL ") + what);
    if(!passed)
      failures++;
  }

  private static void press(Object screen, String name) {
    View button = view(screen, name);
    button.listener.onClick(button);
  }

  private static String text(Object screen, String name) {
    return String.valueOf(((TextView)view(screen, name)).getText());
  }

  private static Button button(Object screen, String name) {
    return (Button)view(screen, name);
  }

  private static View view(Object screen, String name) {
    try {
      Field field = ACTIVITY.getDeclaredField(name);
      field.setAccessible(true);
      return (View)field.get(screen);
    } catch(Exception e) {
      throw new RuntimeException(e);
    }
  }

  private static void call(Object screen, String name, Class<?> parameter, Object argument) throws Exception {
    Method method = parameter == null ? ACTIVITY.getDeclaredMethod(name) : ACTIVITY.getDeclaredMethod(name, parameter);
    method.setAccessible(true);
    if(parameter == null)
      method.invoke(screen);
    else
      method.invoke(screen, argument);
  }

  private static Class<?> activityClass() {
    try {
      return Class.forName("io.virtualtabletop.server.MainActivity");
    } catch(ClassNotFoundException e) {
      throw new RuntimeException(e);
    }
  }
}
