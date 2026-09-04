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
 * Runs the server for as long as the notification is up. It is a foreground service so that
 * Android leaves it alone while players are connected, and it is what the Quit button talks to.
 */
public class ServerService extends Service {
  static final String ACTION_START = "io.virtualtabletop.server.START";
  static final String ACTION_QUIT = "io.virtualtabletop.server.QUIT";

  private static final int NOTIFICATION = 1;
  private static final String CHANNEL = "server";
  private static final int SHUTDOWN_MILLISECONDS = 5000;

  private static boolean running;
  private static String url = "";

  private Process server;
  private PowerManager.WakeLock wakeLock;
  private BroadcastReceiver networkReceiver;

  static boolean isRunning() {
    return running;
  }

  static String url() {
    return url;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String action = intent == null ? null : intent.getAction();
    if(ACTION_QUIT.equals(action))
      quit();
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
    shutDown();
    super.onDestroy();
  }

  private void start() {
    running = true;
    url = Network.url();
    startForeground(NOTIFICATION, notification());
    AppState.step("Starting the server on " + url);

    PowerManager power = (PowerManager)getSystemService(Context.POWER_SERVICE);
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "virtualtabletop:server");
    wakeLock.acquire();

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

  /** Asks the server to shut down and gives it time to write the rooms out. */
  private void shutDown() {
    Process process = server;
    server = null;
    if(process == null)
      return;

    AppState.step("Shutting the server down");
    int pid = readPid();
    if(pid > 0) {
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
  }

  private void quit() {
    shutDown();
    stop();
    new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
      @Override
      public void run() {
        MainActivity.close();
        System.exit(0);
      }
    }, 200);
  }

  private void stop() {
    running = false;
    if(networkReceiver != null) {
      unregisterReceiver(networkReceiver);
      networkReceiver = null;
    }
    if(wakeLock != null && wakeLock.isHeld())
      wakeLock.release();
    wakeLock = null;
    shutDown();
    stopForeground(true);
    stopSelf();
    AppState.changed();
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

    Intent share = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url);
    return builder
        .setSmallIcon(R.drawable.ic_notification)
        .setColor(getColor(R.color.vtt_blue))
        .setContentTitle(getString(R.string.notification_title))
        .setContentText(url)
        .setStyle(new Notification.BigTextStyle().bigText(url))
        .setContentIntent(activity(0, new Intent(this, MainActivity.class)))
        .setOngoing(true)
        .setShowWhen(false)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
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
