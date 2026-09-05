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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
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
  /** the counter git and npm draw while they work, which is what drives the progress bar */
  private static final Pattern PERCENT = Pattern.compile("(\\d+)%");
  private static final int GROUP_FILES = 1000;

  private static Thread thread;

  private final Context context;
  private final Map<String, String> installed = new HashMap<>();
  private Runnable whenDone;

  private Installer(Context context) {
    this.context = context;
  }

  static synchronized void start(Context context, Runnable whenDone) {
    if(thread != null && thread.isAlive())
      return;
    Installer installer = new Installer(context.getApplicationContext());
    installer.whenDone = whenDone;
    thread = new Thread(installer, "installer");
    thread.start();
  }

  @Override
  public void run() {
    AppState.working(true);
    try {
      update();
    } catch(Exception e) {
      AppState.failed(describe(e));
    } finally {
      AppState.working(false);
      if(whenDone != null)
        whenDone.run();
    }
  }

  private void update() throws Exception {
    String architecture = Env.architecture();
    if(architecture == null)
      throw new IOException("no packages are built for " + Build.SUPPORTED_ABIS[0]);
    // an update only replaces what is there, so the room a whole installation needs is
    // only worth stating while there is none yet
    if(!Env.isInstalled(context))
      AppState.log("A complete installation takes about " + Env.size(Env.REQUIRED_BYTES) + ", and "
          + Env.size(Env.freeBytes(context)) + " is free on this phone"
          + (Env.storageIsTight(context) ? " - that may well not be enough" : ""));
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

  /**
   * The clone, which is the long part of an update. Git cannot resume one that broke, so it is
   * taken in pieces: the commit arrives without any file contents first, which is a few megabytes,
   * and the contents are then filled in one group of directories after another. Every group that
   * arrived stays in the clone, so pressing Update again after a lost connection carries on where
   * it stopped instead of downloading everything a second time.
   */
  private void updateClone() throws IOException, InterruptedException {
    File clone = Env.repository(context);
    String git = Env.binary(context, "git").getAbsolutePath();
    releaseLocks(clone);

    if(!new File(clone, ".git").isDirectory()) {
      AppState.step("Cloning VirtualTabletop");
      // one commit of one branch: no other branch, no tag, no history, and without a reflog
      // nothing keeps the snapshot an update replaces from being pruned
      run(context.getFilesDir(), git, "clone", "-c", "core.logAllRefUpdates=false",
          "-c", "gc.pruneExpire=now", "-c", "core.quotePath=false",
          "--depth", "1", "--single-branch", "--no-tags",
          "--filter=blob:none", "--sparse", "--progress",
          "--branch", Env.BRANCH, Env.REPOSITORY, clone.getAbsolutePath());
    } else if(!"true".equals(option(clone, git, "core.sparseCheckout"))) {
      AppState.step("Pulling VirtualTabletop");
      run(clone, git, "fetch", "--depth", "1", "--no-tags", "--progress", "origin", Env.BRANCH);
      run(clone, git, "reset", "--hard", "FETCH_HEAD");
      // shallow fetches leave the objects of the previous state behind
      run(clone, git, "gc", "--auto", "--quiet");
      return;
    }
    fillIn(clone, git);
  }

  /**
   * Downloads the file contents group by group and hands the finished clone back as an ordinary
   * one. A group that is already in the checkout is skipped, which is what makes this resumable.
   */
  private void fillIn(File clone, String git) throws IOException, InterruptedException {
    List<String> present = read(clone, git, "sparse-checkout", "list");
    List<List<String>> groups = groups(read(clone, git, "ls-tree", "-r", "--name-only", "HEAD"));
    for(int index = 0; index < groups.size(); index++) {
      AppState.percent(100 * index / (groups.size() + 1));
      if(present.containsAll(groups.get(index)))
        continue;
      AppState.step("Downloading VirtualTabletop - part " + (index + 1) + " of " + groups.size());
      List<String> command = new ArrayList<>();
      command.add(git);
      command.add("sparse-checkout");
      command.add("add");
      command.addAll(groups.get(index));
      run(clone, command.toArray(new String[0]));
    }
    AppState.step("Completing the clone");
    run(clone, git, "sparse-checkout", "disable");
    AppState.percent(AppState.UNKNOWN);
  }

  /**
   * The directories of the checkout, packed into groups of roughly a thousand files: small enough
   * that a lost connection only costs the group it was in, large enough that the download is not
   * spent on round trips. A directory that is too large is taken apart into its subdirectories,
   * and the files lying directly in a directory always come with it.
   */
  private List<List<String>> groups(List<String> paths) {
    Map<String, Integer> files = new LinkedHashMap<>();
    Map<String, List<String>> children = new LinkedHashMap<>();
    for(String path : paths) {
      String parent = "";
      for(int cut = path.indexOf('/'); cut > 0; cut = path.indexOf('/', cut + 1)) {
        String directory = path.substring(0, cut);
        Integer count = files.get(directory);
        files.put(directory, count == null ? 1 : count + 1);
        if(count == null) {
          List<String> siblings = children.get(parent);
          if(siblings == null)
            children.put(parent, siblings = new ArrayList<>());
          siblings.add(directory);
        }
        parent = directory;
      }
    }

    List<String> selected = new ArrayList<>();
    select("", files, children, selected);

    List<List<String>> groups = new ArrayList<>();
    List<String> current = new ArrayList<>();
    int size = 0;
    for(String directory : selected) {
      if(!current.isEmpty() && size + files.get(directory) > GROUP_FILES) {
        groups.add(current);
        current = new ArrayList<>();
        size = 0;
      }
      current.add(directory);
      size += files.get(directory);
    }
    if(!current.isEmpty())
      groups.add(current);
    return groups;
  }

  private void select(String directory, Map<String, Integer> files,
      Map<String, List<String>> children, List<String> selected) {
    List<String> below = children.get(directory);
    if(!directory.isEmpty() && (below == null || files.get(directory) <= GROUP_FILES)) {
      selected.add(directory);
      return;
    }
    if(below != null)
      for(String child : below)
        select(child, files, children, selected);
  }

  /** A git that was stopped along with the app leaves its lock files behind. */
  private void releaseLocks(File clone) {
    File[] files = new File(clone, ".git").listFiles();
    if(files == null)
      return;
    for(File file : files)
      if(file.getName().endsWith(".lock"))
        file.delete();
  }

  /** A setting of the clone, empty when it is not set. */
  private String option(File clone, String git, String key) throws IOException, InterruptedException {
    List<String> value = read(clone, git, "config", "--default", "", "--get", key);
    return value.isEmpty() ? "" : value.get(0).trim();
  }

  private void installDependencies() throws IOException, InterruptedException {
    AppState.step("Installing the server dependencies");
    // the marker is what the screen reads "ready to play" from, so it only exists while a run of
    // npm install has actually finished - a half installed node_modules is a directory as well
    Env.installed(context).delete();
    run(Env.repository(context), Env.binary(context, "node").getAbsolutePath(),
        Env.npm(context).getAbsolutePath(), "install", "--omit=dev", "--ignore-scripts",
        "--no-audit", "--no-fund", "--no-progress");
    Env.installed(context).getParentFile().mkdirs();
    new FileOutputStream(Env.installed(context)).close();
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

  /**
   * Runs a command and puts its output on screen. A line that ends in a carriage return is one
   * git or npm means to overwrite - the counter they draw while they work - so it replaces the
   * line before it and moves the progress bar rather than filling the log up.
   */
  private void run(File directory, String... command) throws IOException, InterruptedException {
    Process process = Env.command(context, directory, command).start();
    BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), "UTF-8"));
    try {
      StringBuilder line = new StringBuilder();
      boolean overwritten = false;
      int character;
      while((character = reader.read()) != -1) {
        if(character != '\n' && character != '\r') {
          line.append((char)character);
          continue;
        }
        if(character == '\n' && overwritten && line.length() == 0) {
          overwritten = false;
          continue;
        }
        overwritten = character == '\r';
        if(overwritten)
          progress(line.toString());
        else
          AppState.log(line.toString());
        line.setLength(0);
      }
      if(line.length() > 0)
        AppState.log(line.toString());
    } finally {
      reader.close();
    }
    int status = process.waitFor();
    if(status != 0)
      throw new IOException(new File(command[0]).getName() + " exited with " + status);
  }

  private static void progress(String line) {
    AppState.progress(line);
    Matcher matcher = PERCENT.matcher(line);
    int percent = AppState.UNKNOWN;
    while(matcher.find())
      percent = Integer.parseInt(matcher.group(1));
    if(percent >= 0)
      AppState.percent(Math.min(percent, 100));
  }

  /** Runs a command and hands back what it printed instead of logging it. */
  private List<String> read(File directory, String... command) throws IOException, InterruptedException {
    Process process = Env.command(context, directory, command).start();
    List<String> lines = new ArrayList<>();
    BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), "UTF-8"));
    try {
      String line;
      while((line = reader.readLine()) != null)
        lines.add(line);
    } finally {
      reader.close();
    }
    if(process.waitFor() != 0)
      throw new IOException(new File(command[0]).getName() + " " + command[1] + " failed");
    return lines;
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
