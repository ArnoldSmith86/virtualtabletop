package io.virtualtabletop.server;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Runs the server, and the installer, for as long as the notification is up. Both are foreground
 * work with a wake lock so that Android leaves them alone while players are connected or while an
 * update is downloading, and this is what the Quit button talks to.
 */
public class ServerService extends Service implements AppState.Listener {
  static final String ACTION_START = "io.virtualtabletop.server.START";
  static final String ACTION_UPDATE = "io.virtualtabletop.server.UPDATE";
  static final String ACTION_QUIT = "io.virtualtabletop.server.QUIT";

  private static final int NOTIFICATION = 1;
  private static final String CHANNEL = "server";
  private static final int SHUTDOWN_MILLISECONDS = 5000;

  private static boolean running;
  private static boolean installing;
  private static String url = "";

  private Process server;
  private PowerManager.WakeLock wakeLock;
  private BroadcastReceiver networkReceiver;
  private boolean updating;
  private String shown = "";

  static boolean isRunning() {
    return running;
  }

  /** whether the run going on right now is the first installation rather than an update */
  static boolean isInstalling() {
    return installing;
  }

  static String url() {
    return url;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String action = intent == null ? null : intent.getAction();
    if(ACTION_QUIT.equals(action))
      quit();
    else if(ACTION_UPDATE.equals(action))
      update();
    else if(!running)
      start();
    return START_NOT_STICKY;
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public void onDestroy() {
    shutDown(null);
    super.onDestroy();
  }

  /**
   * Runs the installer here rather than in the activity: it takes minutes, and a plain thread in
   * an app the user has switched away from is suspended when the screen goes off and killed when
   * the system needs the memory, which is what turns a long download into a failed one.
   */
  private void update() {
    if(updating || AppState.isWorking())
      return;
    updating = true;
    // what the button said when it was pressed, so that the notification says the same
    installing = !Env.isInstalled(this);
    shown = "";
    startForeground(NOTIFICATION, notification());
    keepAwake("virtualtabletop:update");
    AppState.listen(this, true);
    Installer.start(this, new Runnable() {
      @Override
      public void run() {
        new Handler(Looper.getMainLooper()).post(new Runnable() {
          @Override
          public void run() {
            updated();
          }
        });
      }
    });
  }

  private void updated() {
    updating = false;
    AppState.listen(this, false);
    if(running) {
      notifyNow();
      return;
    }
    letSleep();
    stopForeground(true);
    stopSelf();
    AppState.changed();
  }

  /** Keeps the notification on what the installer is doing at the moment. */
  @Override
  public void stateChanged() {
    if(updating && !shown.equals(AppState.step()))
      notifyNow();
  }

  private void notifyNow() {
    shown = AppState.step();
    NotificationManager manager = (NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
    manager.notify(NOTIFICATION, notification());
  }

  private void start() {
    running = true;
    url = Network.url();
    startForeground(NOTIFICATION, notification());
    AppState.step("Starting the server on " + url);

    keepAwake("virtualtabletop:server");

    networkReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        addressChanged();
      }
    };
    registerReceiver(networkReceiver, new IntentFilter("android.net.conn.CONNECTIVITY_ACTION"));

    try {
      server = launch();
    } catch(IOException e) {
      AppState.step("The server could not be started: " + e.getMessage());
      stop();
      return;
    }
    watch(server);
  }

  /**
   * Starts the server through a shell that leaves its own process id behind, because that is what
   * a clean shutdown needs: the server saves every open room when it is asked to terminate.
   */
  private Process launch() throws IOException {
    File pid = pidFile();
    pid.delete();
    String node = Env.binary(this, "node").getAbsolutePath();
    ProcessBuilder builder = Env.command(this, Env.repository(this), "/system/bin/sh", "-c",
        "echo $$ > " + pid.getAbsolutePath() + "; exec " + node + " server.mjs");
    builder.environment().put("PORT", String.valueOf(Env.PORT));
    builder.environment().put("EXTERNALURL", url.substring(0, url.lastIndexOf('/')));
    builder.environment().put("VTT_SAVE_DIR", Env.saveDirectory(this).getAbsolutePath());
    return builder.start();
  }

  private void watch(final Process process) {
    new Thread(new Runnable() {
      @Override
      public void run() {
        try {
          BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), "UTF-8"));
          try {
            String line;
            while((line = reader.readLine()) != null)
              AppState.log(line);
          } finally {
            reader.close();
          }
          process.waitFor();
        } catch(Exception e) {
          AppState.log("The server output could not be read: " + e);
        }
        if(server == process)
          new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override
            public void run() {
              AppState.step("The server stopped");
              stop();
            }
          });
      }
    }, "server").start();
  }

  /**
   * Asks the server to shut down and gives it time to write the rooms out. The waiting happens on
   * a thread of its own: it takes seconds, and every caller of this is on the one thread that
   * draws the screen.
   */
  private void shutDown(final Runnable whenDown) {
    final Process process = server;
    server = null;
    if(process == null) {
      done(whenDown);
      return;
    }

    AppState.step("Shutting the server down");
    new Thread(new Runnable() {
      @Override
      public void run() {
        int pid = readPid();
        // the pid is the shell the server was started through, and a pid of a process that has
        // already been reaped can belong to something else by now
        if(pid > 0 && isAlive(process)) {
          try {
            Os.kill(pid, OsConstants.SIGTERM);
          } catch(ErrnoException e) {
            AppState.log("The server could not be signalled: " + e.getMessage());
          }
          for(int waited = 0; waited < SHUTDOWN_MILLISECONDS && isAlive(process); waited += 100) {
            try {
              Thread.sleep(100);
            } catch(InterruptedException e) {
              break;
            }
          }
        }
        if(isAlive(process))
          process.destroy();
        done(whenDown);
      }
    }, "shutdown").start();
  }

  private static void done(Runnable whenDown) {
    if(whenDown != null)
      new Handler(Looper.getMainLooper()).post(whenDown);
  }

  private void quit() {
    shutDown(new Runnable() {
      @Override
      public void run() {
        stop();
        MainActivity.close();
        System.exit(0);
      }
    });
  }

  private void stop() {
    running = false;
    if(networkReceiver != null) {
      unregisterReceiver(networkReceiver);
      networkReceiver = null;
    }
    shutDown(null);
    if(updating)
      return;
    letSleep();
    stopForeground(true);
    stopSelf();
    AppState.changed();
  }

  private void keepAwake(String tag) {
    if(wakeLock != null && wakeLock.isHeld())
      return;
    PowerManager power = (PowerManager)getSystemService(Context.POWER_SERVICE);
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, tag);
    wakeLock.acquire();
  }

  private void letSleep() {
    if(wakeLock != null && wakeLock.isHeld())
      wakeLock.release();
    wakeLock = null;
  }

  /** Keeps the notification on the address players have to type in when the network changes. */
  private void addressChanged() {
    String current = Network.url();
    if(current.equals(url))
      return;
    url = current;
    AppState.log("The server is now reachable at " + url);
    NotificationManager manager = (NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
    manager.notify(NOTIFICATION, notification());
    AppState.changed();
  }

  private Notification notification() {
    NotificationManager manager = (NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
    Notification.Builder builder;
    if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(CHANNEL, getString(R.string.notification_channel),
          NotificationManager.IMPORTANCE_LOW);
      channel.setShowBadge(false);
      manager.createNotificationChannel(channel);
      builder = new Notification.Builder(this, CHANNEL);
    } else {
      builder = new Notification.Builder(this);
      builder.setPriority(Notification.PRIORITY_LOW);
    }

    builder
        .setSmallIcon(R.drawable.ic_notification)
        .setColor(getColor(R.color.vtt_blue))
        .setContentIntent(activity(0, new Intent(this, MainActivity.class)))
        .setOngoing(true)
        .setShowWhen(false)
        .setVisibility(Notification.VISIBILITY_PUBLIC);

    if(updating && !running) {
      String step = AppState.step();
      return builder
          .setContentTitle(getString(installing ? R.string.notification_installing : R.string.notification_updating))
          .setContentText(step)
          .setStyle(new Notification.BigTextStyle().bigText(step))
          .build();
    }

    Intent share = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url);
    return builder
        .setContentTitle(getString(R.string.notification_title))
        .setContentText(url)
        .setStyle(new Notification.BigTextStyle().bigText(url))
        .addAction(R.drawable.ic_open, getString(R.string.open),
            activity(1, new Intent(Intent.ACTION_VIEW, Uri.parse(url))))
        .addAction(R.drawable.ic_share, getString(R.string.share),
            activity(2, Intent.createChooser(share, getString(R.string.share_title))))
        .addAction(R.drawable.ic_quit, getString(R.string.quit), PendingIntent.getService(this, 3,
            new Intent(this, ServerService.class).setAction(ACTION_QUIT),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
        .build();
  }

  private PendingIntent activity(int request, Intent intent) {
    return PendingIntent.getActivity(this, request, intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private File pidFile() {
    return new File(Env.temporary(this), "server.pid");
  }

  private int readPid() {
    try {
      BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(pidFile()), "UTF-8"));
      try {
        return Integer.parseInt(reader.readLine().trim());
      } finally {
        reader.close();
      }
    } catch(Exception e) {
      return -1;
    }
  }

  private static boolean isAlive(Process process) {
    try {
      process.exitValue();
      return false;
    } catch(IllegalThreadStateException e) {
      return true;
    }
  }
}
