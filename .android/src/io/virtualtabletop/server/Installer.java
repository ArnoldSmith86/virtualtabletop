package io.virtualtabletop.server;

import android.content.Context;
import android.os.Build;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Everything the Update button does: fetch git and Node.js from the package repository, clone or
 * pull VirtualTabletop and install its dependencies. Only this needs a connection - afterwards
 * the server runs offline.
 */
final class Installer implements Runnable {
  private static final Pattern NODE_VERSION = Pattern.compile("node-version:\\s*'?\"?(\\d+)");

  private static Thread thread;

  private final Context context;
  private final Map<String, String> installed = new HashMap<>();

  private Installer(Context context) {
    this.context = context;
  }

  static synchronized void start(Context context) {
    if(thread != null && thread.isAlive())
      return;
    thread = new Thread(new Installer(context.getApplicationContext()), "installer");
    thread.start();
  }

  @Override
  public void run() {
    AppState.working(true);
    try {
      update();
    } catch(Exception e) {
      AppState.log("Update failed: " + describe(e));
    } finally {
      AppState.working(false);
    }
  }

  private void update() throws Exception {
    String architecture = Env.architecture();
    if(architecture == null)
      throw new IOException("no packages are built for " + Build.SUPPORTED_ABIS[0]);
    Env.createDirectories(context);
    readInstalled();

    AppState.step("Reading the package index for " + architecture);
    Packages packages = Packages.fetch(architecture);

    install(packages, "git");
    updateClone();

    int wanted = workflowNodeVersion();
    Packages.Package node = packages.node(wanted);
    if(wanted > 0 && node.major() != wanted)
      AppState.log("Node.js " + wanted + " is not built for Android, taking " + node.name + " " + node.version);
    install(packages, node.name);
    install(packages, "npm");
    installDependencies();

    AppState.step("Up to date - the server can be started");
  }

  /** Installs a package and its dependencies, skipping the ones already at the offered version. */
  private void install(Packages packages, String name) throws IOException {
    for(Packages.Package current : packages.withDependencies(name, installed.keySet())) {
      if(current.version.equals(installed.get(current.name)))
        continue;
      File file = new File(Env.temporary(context), "package.deb");
      packages.download(current, file);
      AppState.step("Unpacking " + current.name + " " + current.version);
      Deb.unpack(file, Env.TERMUX_PREFIX, Env.prefix(context));
      file.delete();
      installed.put(current.name, current.version);
      writeInstalled();
    }
  }

  private void updateClone() throws IOException, InterruptedException {
    File clone = Env.repository(context);
    String git = Env.binary(context, "git").getAbsolutePath();
    if(new File(clone, ".git").isDirectory()) {
      AppState.step("Pulling VirtualTabletop");
      run(clone, git, "fetch", "--depth", "1", "origin", Env.BRANCH);
      run(clone, git, "reset", "--hard", "FETCH_HEAD");
      // shallow fetches leave the objects of the previous state behind
      run(clone, git, "gc", "--auto", "--quiet");
    } else {
      AppState.step("Cloning VirtualTabletop");
      run(context.getFilesDir(), git, "clone", "--depth", "1", "--single-branch",
          "--branch", Env.BRANCH, Env.REPOSITORY, clone.getAbsolutePath());
    }
  }

  private void installDependencies() throws IOException, InterruptedException {
    AppState.step("Installing the server dependencies");
    run(Env.repository(context), Env.binary(context, "node").getAbsolutePath(),
        Env.npm(context).getAbsolutePath(), "install", "--omit=dev", "--ignore-scripts",
        "--no-audit", "--no-fund", "--no-progress");
  }

  /**
   * The Node.js version the production environment workflow tests the server with, read out of
   * the clone so that it stays in step with the repository instead of with this app.
   */
  private int workflowNodeVersion() {
    File workflow = new File(Env.repository(context), ".github/workflows/production-environment.yml");
    try {
      BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(workflow), "UTF-8"));
      try {
        String line;
        while((line = reader.readLine()) != null) {
          Matcher matcher = NODE_VERSION.matcher(line);
          if(matcher.find()) {
            int major = Integer.parseInt(matcher.group(1));
            AppState.log("The production environment workflow uses Node.js " + major + ".x");
            return major;
          }
        }
      } finally {
        reader.close();
      }
    } catch(Exception e) {
      // without the workflow file the newest long term support version is as good a choice
    }
    return -1;
  }

  private void run(File directory, String... command) throws IOException, InterruptedException {
    Process process = Env.command(context, directory, command).start();
    BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), "UTF-8"));
    try {
      String line;
      while((line = reader.readLine()) != null)
        AppState.log(line);
    } finally {
      reader.close();
    }
    int status = process.waitFor();
    if(status != 0)
      throw new IOException(new File(command[0]).getName() + " exited with " + status);
  }

  /** The versions that are unpacked, so that an update only downloads what has changed. */
  private void readInstalled() {
    installed.clear();
    try {
      BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(versions()), "UTF-8"));
      try {
        String line;
        while((line = reader.readLine()) != null) {
          String[] parts = line.split(" ", 2);
          if(parts.length == 2)
            installed.put(parts[0], parts[1]);
        }
      } finally {
        reader.close();
      }
    } catch(IOException e) {
      // nothing installed yet
    }
  }

  private void writeInstalled() throws IOException {
    versions().getParentFile().mkdirs();
    Writer writer = new OutputStreamWriter(new FileOutputStream(versions()), "UTF-8");
    try {
      for(Map.Entry<String, String> entry : installed.entrySet())
        writer.write(entry.getKey() + " " + entry.getValue() + "\n");
    } finally {
      writer.close();
    }
  }

  private File versions() {
    return new File(Env.prefix(context), "var/installed");
  }

  private static String describe(Exception e) {
    return e.getMessage() == null ? e.toString() : e.getMessage();
  }
}
