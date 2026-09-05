import android.content.Context;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;

/**
 * The parts of the installer a phone is not needed for: the clone, which is taken in pieces so
 * that it survives a connection or a phone that gives up in the middle of it, and the unpacking
 * of a package over whatever an earlier installation left lying around. It clones from a
 * repository the test builds itself, with the machine's own git.
 */
public class InstallerTest {
  private static final File DIRECTORY = new File(System.getProperty("testDir"));
  private static final File ORIGIN = new File(DIRECTORY, "origin");
  private static final File CLONE = new File(DIRECTORY, "files/vtt");
  /** enough files in enough directories that the clone is filled in as more than one group */
  private static final int DIRECTORIES = 6;
  private static final int FILES = 260;

  private static Class<?> installerClass;
  private static Object installer;
  private static int checks;

  public static void main(String[] arguments) throws Exception {
    installerClass = Class.forName("io.virtualtabletop.server.Installer");
    Constructor<?> constructor = installerClass.getDeclaredConstructor(Context.class);
    constructor.setAccessible(true);
    installer = constructor.newInstance(new Context());

    try {
      locks();
      cloning();
      unpacking();
    } catch(Throwable e) {
      Throwable cause = e instanceof InvocationTargetException ? e.getCause() : e;
      System.out.println("\n" + cause);
      System.out.println("\nwhat the installer said:\n" + log());
      System.exit(1);
    }

    System.out.println("\n" + checks + " checks passed");
  }

  /** Whatever an interrupted git left behind has to go, wherever in the clone it lies. */
  private static void locks() throws Exception {
    say("a git that was killed left its lock files behind");
    File git = new File(DIRECTORY, "locks/.git");
    File[] locks = {
      new File(git, "index.lock"),
      new File(git, "info/sparse-checkout.lock"),
      new File(git, "refs/heads/main.lock"),
      new File(git, "objects/pack/tmp_pack_ab12cd"),
    };
    File[] kept = {
      new File(git, "config"),
      new File(git, "info/sparse-checkout"),
      new File(git, "objects/pack/pack-ab12cd.pack"),
    };
    for(File file : locks)
      touch(file);
    for(File file : kept)
      touch(file);

    call("releaseLocks", File.class, git.getParentFile());
    for(File file : locks)
      check("it is gone: .git/" + git.toURI().relativize(file.toURI()).getPath(), !file.exists());
    for(File file : kept)
      check("it is still there: .git/" + git.toURI().relativize(file.toURI()).getPath(), file.exists());
  }

  /** The clone, from nothing, over an existing one, and out of an interrupted one. */
  private static void cloning() throws Exception {
    buildOrigin();

    say("nothing is installed yet");
    call("updateClone", null, null);
    check("the whole repository was checked out", files(CLONE) == DIRECTORIES * FILES + 1);
    check("and it is an ordinary clone rather than a sparse one",
        !option("core.sparseCheckout").equals("true"));

    say("an installation that is already there is updated");
    commit("another.txt", "one more file");
    call("updateClone", null, null);
    check("the new commit arrived", new File(CLONE, "another.txt").isFile());
    check("and the checkout is still complete", files(CLONE) == DIRECTORIES * FILES + 2);

    say("the phone was killed while a group was downloading");
    remove(CLONE);
    git(DIRECTORY, "clone", "--depth", "1", "--single-branch", "--no-tags", "--filter=blob:none",
        "--sparse", "--branch", "main", "file://" + ORIGIN.getAbsolutePath(), CLONE.getAbsolutePath());
    // what git holds while it fetches and checks a group out, for as long as that takes
    File lock = new File(CLONE, ".git/info/sparse-checkout.lock");
    touch(lock);
    touch(new File(CLONE, ".git/objects/pack/tmp_pack_ef34"));
    check("the clone is a partial one", files(CLONE) < DIRECTORIES * FILES);

    call("updateClone", null, null);
    check("pressing Update again finishes it instead of dying on the lock",
        files(CLONE) == DIRECTORIES * FILES + 2);
    check("and the lock is gone", !lock.exists());
  }

  /** A package is unpacked over what the installation before it put in the same places. */
  private static void unpacking() throws Exception {
    File prefix = new File(DIRECTORY, "prefix");
    File missing = new File(prefix, "lib/libnode.so");
    File binary = new File(prefix, "bin/node");
    binary.getParentFile().mkdirs();
    missing.getParentFile().mkdirs();

    say("a link of an earlier installation points at a file that is no longer there");
    Files.createSymbolicLink(binary.toPath(), missing.toPath());
    write("the new binary", binary);
    check("the entry took the place of the link",
        !Files.isSymbolicLink(binary.toPath()) && read(binary).equals("the new binary"));
    check("rather than being written through it to where it pointed", !missing.exists());

    say("a link of an earlier installation leads out of the prefix");
    File outside = new File(DIRECTORY, "outside");
    outside.mkdirs();
    File away = new File(prefix, "etc");
    Files.createSymbolicLink(away.toPath(), outside.toPath());
    check("an entry that would land there is refused",
        refused("inside", new File(away, "passwd"), prefix));
    check("while one that stays inside is not", !refused("inside", new File(prefix, "bin/git"), prefix));
  }

  /** A repository with enough files that the installer has to fill it in as several groups. */
  private static void buildOrigin() throws Exception {
    ORIGIN.mkdirs();
    git(ORIGIN, "-c", "init.defaultBranch=main", "init", "--quiet");
    // a local clone only hands out a commit without its file contents when it is allowed to
    git(ORIGIN, "config", "uploadpack.allowFilter", "true");
    for(int directory = 0; directory < DIRECTORIES; directory++)
      for(int file = 0; file < FILES; file++)
        touch(new File(ORIGIN, "part" + directory + "/file" + file + ".txt"));
    commit("README.md", "the repository the installer clones");
  }

  private static void commit(String name, String content) throws Exception {
    Files.write(new File(ORIGIN, name).toPath(), content.getBytes("UTF-8"));
    git(ORIGIN, "add", "-A");
    git(ORIGIN, "-c", "user.email=test@virtualtabletop.io", "-c", "user.name=test",
        "commit", "--quiet", "-m", name);
  }

  private static void git(File directory, String... arguments) throws Exception {
    String[] command = new String[arguments.length + 1];
    command[0] = "git";
    System.arraycopy(arguments, 0, command, 1, arguments.length);
    ProcessBuilder builder = new ProcessBuilder(command);
    builder.directory(directory);
    builder.redirectErrorStream(true);
    builder.redirectOutput(new File(DIRECTORY, "git.log"));
    int status = builder.start().waitFor();
    if(status != 0)
      throw new IOException("git " + arguments[0] + " exited with " + status + ", see "
          + new File(DIRECTORY, "git.log"));
  }

  /** A setting of the clone, which is how the installer itself tells a sparse checkout. */
  private static String option(String key) throws Exception {
    git(CLONE, "config", "--default", "", "--get", key);
    return read(new File(DIRECTORY, "git.log")).trim();
  }

  /** The files of a checkout, which is what says whether the clone is complete. */
  private static int files(File directory) {
    int count = 0;
    File[] children = directory.listFiles();
    if(children == null)
      return 0;
    for(File child : children) {
      if(child.getName().equals(".git"))
        continue;
      count += child.isDirectory() ? files(child) : 1;
    }
    return count;
  }

  private static void touch(File file) throws IOException {
    file.getParentFile().mkdirs();
    if(!file.exists())
      Files.write(file.toPath(), new byte[0]);
  }

  private static void remove(File file) throws IOException {
    File[] children = file.listFiles();
    if(children != null && !Files.isSymbolicLink(file.toPath()))
      for(File child : children)
        remove(child);
    Files.deleteIfExists(file.toPath());
  }

  private static String read(File file) throws IOException {
    return new String(Files.readAllBytes(file.toPath()), "UTF-8");
  }

  /** Unpacks one file entry of a package, which is what the installer does with every one of them. */
  private static void write(String content, File target) throws Exception {
    byte[] bytes = content.getBytes("UTF-8");
    Method method = Class.forName("io.virtualtabletop.server.Deb")
        .getDeclaredMethod("write", InputStream.class, long.class, File.class, int.class);
    method.setAccessible(true);
    method.invoke(null, new ByteArrayInputStream(bytes), (long)bytes.length, target, 0755);
  }

  /** Whether the unpacker refuses to put an entry where the arguments say. */
  private static boolean refused(String name, File target, File prefix) throws Exception {
    Method method = Class.forName("io.virtualtabletop.server.Deb")
        .getDeclaredMethod(name, File.class, File.class);
    method.setAccessible(true);
    try {
      method.invoke(null, target, prefix);
      return false;
    } catch(InvocationTargetException e) {
      if(!(e.getCause() instanceof IOException))
        throw e;
      return true;
    }
  }

  private static void call(String name, Class<?> parameter, Object argument) throws Exception {
    Method method = parameter == null ? installerClass.getDeclaredMethod(name)
        : installerClass.getDeclaredMethod(name, parameter);
    method.setAccessible(true);
    if(parameter == null)
      method.invoke(installer);
    else
      method.invoke(installer, argument);
  }

  private static String log() throws Exception {
    Method method = Class.forName("io.virtualtabletop.server.AppState").getDeclaredMethod("log");
    method.setAccessible(true);
    return String.valueOf(method.invoke(null));
  }

  private static void say(String what) {
    System.out.println("\n" + what);
  }

  private static void check(String what, boolean passed) {
    if(!passed)
      throw new IllegalStateException("FAILED: " + what);
    checks++;
    System.out.println("  ok: " + what);
  }
}
