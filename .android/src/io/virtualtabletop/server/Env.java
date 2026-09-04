package io.virtualtabletop.server;

import android.content.Context;
import android.os.Build;

import java.io.File;
import java.util.Map;

/** Where the installation lives and what the downloaded binaries need to find each other. */
final class Env {
  static final int PORT = 8272;
  static final String ROOM = "vtt";
  static final String REPOSITORY = "https://github.com/ArnoldSmith86/virtualtabletop.git";
  static final String BRANCH = "main";

  /** the Termux package repository, the only one that builds Node.js and git for Android */
  static final String PACKAGE_REPOSITORY = "https://packages.termux.dev/apt/termux-main";
  /** the prefix those packages are built for, which is what every path inside them starts with */
  static final String TERMUX_PREFIX = "/data/data/com.termux/files/usr";

  private Env() {
  }

  static File prefix(Context context) {
    return new File(context.getFilesDir(), "usr");
  }

  static File home(Context context) {
    return new File(context.getFilesDir(), "home");
  }

  static File temporary(Context context) {
    return new File(prefix(context), "tmp");
  }

  static File repository(Context context) {
    return new File(context.getFilesDir(), "vtt");
  }

  /** kept out of the clone so that rooms survive an update and git never sees them */
  static File saveDirectory(Context context) {
    return new File(context.getFilesDir(), "save");
  }

  static File binary(Context context, String name) {
    return new File(prefix(context), "bin/" + name);
  }

  static File npm(Context context) {
    return new File(prefix(context), "lib/node_modules/npm/bin/npm-cli.js");
  }

  /** written once the dependencies are in, because a half installed node_modules exists too */
  static File installed(Context context) {
    return new File(prefix(context), "var/ready");
  }

  static boolean isInstalled(Context context) {
    return binary(context, "node").canExecute()
        && new File(repository(context), "server.mjs").isFile()
        && installed(context).isFile();
  }

  /** The name this device has in the package repository, null when it is not built for. */
  static String architecture() {
    for(String abi : Build.SUPPORTED_ABIS) {
      if(abi.equals("arm64-v8a"))
        return "aarch64";
      if(abi.equals("x86_64"))
        return "x86_64";
      if(abi.startsWith("armeabi"))
        return "arm";
      if(abi.equals("x86"))
        return "i686";
    }
    return null;
  }

  static void createDirectories(Context context) {
    prefix(context).mkdirs();
    home(context).mkdirs();
    temporary(context).mkdirs();
    saveDirectory(context).mkdirs();
    new File(saveDirectory(context), "assets").mkdirs();
  }

  /**
   * A command that runs one of the downloaded binaries. They are built for the Termux prefix, so
   * every path they have compiled in - their libraries, git's helpers, templates, attributes and
   * config, and OpenSSL's configuration, modules and certificates - is pointed at this app's
   * prefix through the environment. LD_LIBRARY_PATH wins over the RUNPATH the binaries carry,
   * which is what makes them work outside of Termux at all. It is also what keeps the app away
   * from Termux itself: an installed Termux owns those paths, and reading them from here is
   * refused, which git only warns about but OpenSSL treats as an error.
   */
  static ProcessBuilder command(Context context, File directory, String... command) {
    ProcessBuilder builder = new ProcessBuilder(command);
    builder.directory(directory);
    builder.redirectErrorStream(true);

    String prefix = prefix(context).getAbsolutePath();
    String certificates = prefix + "/etc/tls/cert.pem";
    Map<String, String> environment = builder.environment();
    environment.clear();
    environment.put("PREFIX", prefix);
    environment.put("PATH", prefix + "/bin:/system/bin");
    environment.put("LD_LIBRARY_PATH", prefix + "/lib");
    environment.put("HOME", home(context).getAbsolutePath());
    environment.put("TMPDIR", temporary(context).getAbsolutePath());
    environment.put("SHELL", "/system/bin/sh");
    environment.put("LANG", "en_US.UTF-8");
    environment.put("TERM", "dumb");
    environment.put("PAGER", "cat");
    environment.put("GIT_PAGER", "cat");
    environment.put("GIT_EXEC_PATH", prefix + "/libexec/git-core");
    environment.put("GIT_TEMPLATE_DIR", prefix + "/share/git-core/templates");
    environment.put("GIT_CONFIG_NOSYSTEM", "1");
    environment.put("GIT_ATTR_NOSYSTEM", "1");
    environment.put("GIT_TERMINAL_PROMPT", "0");
    environment.put("GIT_SSL_CAINFO", certificates);
    environment.put("CURL_CA_BUNDLE", certificates);
    environment.put("SSL_CERT_FILE", certificates);
    environment.put("SSL_CERT_DIR", prefix + "/etc/tls/certs");
    environment.put("OPENSSL_CONF", prefix + "/etc/tls/openssl.cnf");
    environment.put("OPENSSL_MODULES", prefix + "/lib/ossl-modules");
    environment.put("OPENSSL_ENGINES", prefix + "/lib/engines-3");
    return builder;
  }
}
