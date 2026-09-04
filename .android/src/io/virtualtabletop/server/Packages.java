package io.virtualtabletop.server;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.GZIPInputStream;

/** The index of the package repository: what it offers, what depends on what, and downloading it. */
final class Packages {
  private static final int TIMEOUT = 30000;

  static final class Package {
    final String name;
    final String version;
    final String path;
    final String sha256;
    final long size;
    final List<String[]> dependencies;

    private Package(String name, String version, String path, String sha256, long size, List<String[]> dependencies) {
      this.name = name;
      this.version = version;
      this.path = path;
      this.sha256 = sha256;
      this.size = size;
      this.dependencies = dependencies;
    }

    /** the major version, with the Debian epoch and revision the repository adds cut off */
    int major() {
      String number = version.replaceFirst("^\\d+:", "").replaceFirst("[^\\d].*", "");
      return number.isEmpty() ? 0 : Integer.parseInt(number);
    }
  }

  private final Map<String, Package> packages;

  private Packages(Map<String, Package> packages) {
    this.packages = packages;
  }

  static Packages fetch(String architecture) throws IOException {
    String url = Env.PACKAGE_REPOSITORY + "/dists/stable/main/binary-" + architecture + "/Packages.gz";
    Map<String, Package> packages = new HashMap<>();
    InputStream stream = new GZIPInputStream(open(url).getInputStream(), 1 << 16);
    BufferedReader reader = new BufferedReader(new InputStreamReader(stream, "UTF-8"), 1 << 16);
    try {
      Map<String, String> fields = new HashMap<>();
      String line;
      while((line = reader.readLine()) != null) {
        if(line.isEmpty()) {
          add(packages, fields);
          fields.clear();
        } else if(!line.startsWith(" ")) {
          int colon = line.indexOf(':');
          if(colon > 0)
            fields.put(line.substring(0, colon), line.substring(colon + 1).trim());
        }
      }
      add(packages, fields);
    } finally {
      reader.close();
    }
    if(packages.isEmpty())
      throw new IOException("the package index for " + architecture + " is empty");
    return new Packages(packages);
  }

  private static void add(Map<String, Package> packages, Map<String, String> fields) {
    String name = fields.get("Package");
    String path = fields.get("Filename");
    if(name == null || path == null)
      return;
    long size = 0;
    try {
      size = Long.parseLong(fields.get("Size"));
    } catch(RuntimeException e) {
      // an index entry without a size only costs the download its progress
    }
    packages.put(name, new Package(name, String.valueOf(fields.get("Version")), path,
        fields.get("SHA256"), size, dependencies(fields.get("Depends"))));
  }

  /** What a package needs, one entry per dependency, each holding the names that satisfy it. */
  private static List<String[]> dependencies(String depends) {
    List<String[]> result = new ArrayList<>();
    if(depends == null)
      return result;
    for(String dependency : depends.split(",")) {
      String[] alternatives = dependency.split("\\|");
      for(int i = 0; i < alternatives.length; i++)
        alternatives[i] = alternatives[i].replaceFirst("\\(.*", "").trim();
      result.add(alternatives);
    }
    return result;
  }

  Package get(String name) throws IOException {
    Package result = packages.get(name);
    if(result == null)
      throw new IOException("the repository has no package " + name);
    return result;
  }

  /**
   * A package and everything it needs, dependencies first. Where a dependency names alternatives
   * - npm takes either release of Node.js - one that is installed already wins, so that asking
   * for npm does not pull in the other release next to it.
   */
  List<Package> withDependencies(String name, Set<String> installed) throws IOException {
    Map<String, Package> collected = new LinkedHashMap<>();
    collect(get(name), collected, installed);
    return new ArrayList<>(collected.values());
  }

  private void collect(Package current, Map<String, Package> collected, Set<String> installed) {
    if(collected.containsKey(current.name))
      return;
    collected.put(current.name, current);
    for(String[] alternatives : current.dependencies) {
      Package dependency = choose(alternatives, installed);
      // a name that resolves to nothing is provided by another package and comes with it
      if(dependency != null)
        collect(dependency, collected, installed);
    }
  }

  private Package choose(String[] alternatives, Set<String> installed) {
    for(String name : alternatives)
      if(installed.contains(name) && packages.containsKey(name))
        return packages.get(name);
    for(String name : alternatives)
      if(packages.containsKey(name))
        return packages.get(name);
    return null;
  }

  /**
   * Node.js in the major version asked for. The repository only ever offers the current release
   * and the current long term support one, so an older version than those - and the workflow does
   * ask for one - lands on the oldest that is available.
   */
  Package node(int major) throws IOException {
    List<Package> candidates = new ArrayList<>();
    candidates.add(get("nodejs-lts"));
    candidates.add(get("nodejs"));

    Package best = null;
    for(Package candidate : candidates) {
      if(candidate.major() == major)
        return candidate;
      if(best == null || Math.abs(candidate.major() - major) < Math.abs(best.major() - major))
        best = candidate;
    }
    return best;
  }

  /** Downloads a package and checks it against the index before it gets unpacked. */
  void download(Package current, File target) throws IOException {
    HttpURLConnection connection = open(Env.PACKAGE_REPOSITORY + "/" + current.path);
    InputStream in = new BufferedInputStream(connection.getInputStream(), 1 << 16);
    OutputStream out = new FileOutputStream(target);
    MessageDigest digest = digest();
    try {
      byte[] buffer = new byte[1 << 16];
      long total = 0;
      int percent = -1;
      int count;
      while((count = in.read(buffer)) != -1) {
        out.write(buffer, 0, count);
        digest.update(buffer, 0, count);
        total += count;
        if(current.size > 0 && (int)(total * 10 / current.size) != percent) {
          percent = (int)(total * 10 / current.size);
          AppState.step("Downloading " + current.name + " " + current.version + " (" + percent * 10 + "%)");
        }
      }
    } finally {
      out.close();
      in.close();
    }

    String checksum = hexadecimal(digest.digest());
    if(current.sha256 != null && !current.sha256.equalsIgnoreCase(checksum))
      throw new IOException(current.name + " does not match the checksum of the repository");
  }

  private static HttpURLConnection open(String url) throws IOException {
    HttpURLConnection connection = (HttpURLConnection)new URL(url).openConnection();
    connection.setConnectTimeout(TIMEOUT);
    connection.setReadTimeout(TIMEOUT);
    if(connection.getResponseCode() != HttpURLConnection.HTTP_OK)
      throw new IOException(url + " answered " + connection.getResponseCode());
    return connection;
  }

  private static MessageDigest digest() throws IOException {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch(Exception e) {
      throw new IOException("SHA-256 is not available", e);
    }
  }

  private static String hexadecimal(byte[] bytes) {
    StringBuilder text = new StringBuilder();
    for(byte b : bytes)
      text.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
    return text.toString();
  }
}
