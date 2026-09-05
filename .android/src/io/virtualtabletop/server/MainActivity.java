package io.virtualtabletop.server;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.util.Linkify;
import android.util.TypedValue;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * The screen. The card says what is going on, the console below it carries the output, and the
 * big button is always the next thing to do: install, then start the server, then open the room.
 */
public class MainActivity extends Activity implements AppState.Listener {
  private static MainActivity shown;

  private final Handler handler = new Handler(Looper.getMainLooper());

  private TextView state;
  private TextView detail;
  private TextView log;
  private ScrollView logScroll;
  private ProgressBar progress;
  private Button primary;
  private Button secondary;
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
    primary = (Button)findViewById(R.id.primary);
    secondary = (Button)findViewById(R.id.secondary);
    quit = (Button)findViewById(R.id.quit);

    primary.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        if(ServerService.isRunning())
          open();
        else
          service(Env.isInstalled(MainActivity.this) ? ServerService.ACTION_START : ServerService.ACTION_UPDATE);
        render();
      }
    });

    secondary.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        if(ServerService.isRunning())
          share();
        else
          service(ServerService.ACTION_UPDATE);
        render();
      }
    });

    quit.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        // a press that would interrupt players or a download is asked about first, an idle app
        // simply closes
        if(ServerService.isRunning() || ServerService.isStarting())
          confirm(R.string.confirm_quit_running);
        else if(AppState.isWorking())
          confirm(R.string.confirm_quit_working);
        else {
          finishAndRemoveTask();
          System.exit(0);
        }
      }
    });

    detail.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        if(ServerService.isRunning())
          open();
      }
    });
  }

  @Override
  protected void onResume() {
    super.onResume();
    shown = this;
    AppState.listen(this, true);
    render();
  }

  @Override
  protected void onPause() {
    AppState.listen(this, false);
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

  private void service(String action) {
    startService(new Intent(this, ServerService.class).setAction(action));
  }

  private void open() {
    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(ServerService.url())));
  }

  private void share() {
    Intent address = new Intent(Intent.ACTION_SEND).setType("text/plain")
        .putExtra(Intent.EXTRA_TEXT, ServerService.url());
    startActivity(Intent.createChooser(address, getString(R.string.share_title)));
  }

  private void confirm(int message) {
    new AlertDialog.Builder(this)
        .setTitle(R.string.confirm_quit_title)
        .setMessage(message)
        .setNegativeButton(android.R.string.cancel, null)
        .setPositiveButton(R.string.quit, new DialogInterface.OnClickListener() {
          @Override
          public void onClick(DialogInterface dialog, int button) {
            service(ServerService.ACTION_QUIT);
            render();
          }
        })
        .show();
  }

  private void render() {
    boolean running = ServerService.isRunning();
    boolean starting = ServerService.isStarting();
    boolean working = AppState.isWorking();
    boolean installed = Env.isInstalled(this);
    // while a run is going on the marker it reads from is away for a moment, so the wording
    // follows what the run set out to do rather than the state of the moment
    boolean first = working ? ServerService.isInstalling() : !installed;
    String failure = running || starting || working ? null : AppState.failure();

    state.setTextColor(getColor(failure == null ? R.color.text : R.color.negative));
    // the address is what the whole app is there to produce, so it is the one line the card
    // states at full strength rather than as a remark under the heading
    detail.setTextColor(getColor(running ? R.color.text : R.color.text_dim));
    detail.setTextSize(TypedValue.COMPLEX_UNIT_SP, running ? 18 : 14);
    detail.setContentDescription(null);

    if(running) {
      state.setText(R.string.state_running);
      detail.setText(ServerService.url());
      detail.setContentDescription(getString(R.string.address_description));
    } else if(starting) {
      state.setText(R.string.state_starting);
      detail.setText(getString(R.string.hint_starting));
    } else if(working) {
      state.setText(first ? R.string.state_installing : R.string.state_updating);
      detail.setText(AppState.step());
    } else if(failure != null) {
      state.setText(installed ? R.string.state_update_failed : R.string.state_install_failed);
      detail.setText(getString(R.string.hint_failed, failure,
          getString(installed ? R.string.update : R.string.install)));
    } else if(installed) {
      state.setText(R.string.state_ready);
      detail.setText(R.string.hint_ready);
    } else {
      state.setText(R.string.state_not_installed);
      detail.setText(R.string.hint_not_installed);
    }

    // the big button carries the next step rather than the state, which the card above says
    primary.setText(running ? R.string.open : installed ? R.string.start_server : R.string.install);
    primary.setEnabled(running || !(working || starting));
    secondary.setText(running ? R.string.share : R.string.update);
    // there is nothing to update before the first installation, so the row is the way out alone
    secondary.setVisibility(installed || running ? View.VISIBLE : View.GONE);
    secondary.setEnabled(running || !(working || starting));

    int percent = AppState.percent();
    // kept in the layout while there is nothing to show, so the buttons do not move under a
    // finger when a run starts or ends
    progress.setVisibility(working || starting ? View.VISIBLE : View.INVISIBLE);
    progress.setIndeterminate(starting || percent == AppState.UNKNOWN);
    if(percent != AppState.UNKNOWN)
      progress.setProgress(percent);

    // as long as nothing has been run, the console holds the introduction instead of output
    String output = AppState.log();
    final boolean introduction = output.length() == 0;
    log.setTypeface(introduction ? Typeface.DEFAULT : Typeface.MONOSPACE);
    log.setTextSize(TypedValue.COMPLEX_UNIT_SP, introduction ? 14 : 12);
    log.setTextColor(getColor(introduction ? R.color.text : R.color.text_dim));
    // only the introduction is linkified - running it over every log update would be wasteful
    log.setAutoLinkMask(introduction ? Linkify.WEB_URLS : 0);
    // whether the console is showing its last line right now, which is the only case where it
    // may jump to the new one: someone who scrolled up is reading and stays where they are
    final boolean atEnd = logScroll.getScrollY() + logScroll.getHeight() >= log.getBottom();
    log.setText(introduction ? introduction() : output);
    logScroll.post(new Runnable() {
      @Override
      public void run() {
        if(introduction)
          logScroll.fullScroll(View.FOCUS_UP);
        else if(atEnd)
          logScroll.fullScroll(View.FOCUS_DOWN);
      }
    });
  }

  /**
   * The introduction, with the storage an installation takes filled in, followed by a warning
   * when the phone has little more room than that left.
   */
  private String introduction() {
    String text = getString(R.string.introduction, Env.size(Env.REQUIRED_BYTES));
    if(Env.storageIsTight(this))
      text += "\n\n" + getString(R.string.storage_warning,
          Env.size(Env.freeBytes(this)), Env.size(Env.REQUIRED_BYTES));
    return text;
  }
}
