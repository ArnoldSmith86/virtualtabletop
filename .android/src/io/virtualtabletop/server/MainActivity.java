package io.virtualtabletop.server;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

/** The three buttons: install or update the server, start it, and stop everything again. */
public class MainActivity extends Activity implements AppState.Listener {
  private static MainActivity shown;

  private final Handler handler = new Handler(Looper.getMainLooper());

  private TextView state;
  private TextView detail;
  private TextView log;
  private ScrollView logScroll;
  private ProgressBar progress;
  private Button start;
  private Button update;
  private Button quit;

  /** Lets the service close the app once it has shut the server down. */
  static void close() {
    if(shown != null)
      shown.finishAndRemoveTask();
  }

  @Override
  protected void onCreate(Bundle bundle) {
    super.onCreate(bundle);
    setContentView(R.layout.main);

    state = (TextView)findViewById(R.id.state);
    detail = (TextView)findViewById(R.id.detail);
    log = (TextView)findViewById(R.id.log);
    logScroll = (ScrollView)findViewById(R.id.logScroll);
    progress = (ProgressBar)findViewById(R.id.progress);
    start = (Button)findViewById(R.id.start);
    update = (Button)findViewById(R.id.update);
    quit = (Button)findViewById(R.id.quit);

    start.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        startService(new Intent(MainActivity.this, ServerService.class).setAction(ServerService.ACTION_START));
        render();
      }
    });

    update.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        Installer.start(MainActivity.this);
      }
    });

    quit.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        if(ServerService.isRunning()) {
          startService(new Intent(MainActivity.this, ServerService.class).setAction(ServerService.ACTION_QUIT));
        } else {
          finishAndRemoveTask();
          System.exit(0);
        }
      }
    });

    detail.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        if(ServerService.isRunning())
          startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(ServerService.url())));
      }
    });
  }

  @Override
  protected void onResume() {
    super.onResume();
    shown = this;
    AppState.listen(this);
    render();
  }

  @Override
  protected void onPause() {
    AppState.listen(null);
    super.onPause();
  }

  @Override
  protected void onDestroy() {
    if(shown == this)
      shown = null;
    super.onDestroy();
  }

  @Override
  public void stateChanged() {
    handler.post(new Runnable() {
      @Override
      public void run() {
        render();
      }
    });
  }

  private void render() {
    boolean running = ServerService.isRunning();
    boolean working = AppState.isWorking();
    boolean installed = Env.isInstalled(this);

    if(running) {
      state.setText(R.string.server_running);
      detail.setText(ServerService.url());
    } else if(working) {
      state.setText(R.string.state_updating);
      detail.setText(AppState.step());
    } else if(installed) {
      state.setText(R.string.state_ready);
      detail.setText(R.string.hint_ready);
    } else {
      state.setText(R.string.state_not_installed);
      detail.setText(R.string.hint_not_installed);
    }

    start.setText(running ? R.string.server_running : R.string.start_server);
    start.setEnabled(installed && !running && !working);
    update.setEnabled(!running && !working);
    quit.setEnabled(!working);
    progress.setVisibility(working ? View.VISIBLE : View.GONE);

    log.setText(AppState.log());
    logScroll.post(new Runnable() {
      @Override
      public void run() {
        logScroll.fullScroll(View.FOCUS_DOWN);
      }
    });
  }
}
