package io.virtualtabletop.server;

import android.system.ErrnoException;
import android.system.Os;

import java.io.BufferedInputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Unpacks a Debian package into the app's own prefix. Termux builds its packages for
 * /data/data/com.termux/files/usr, so every path in them starts with that and gets moved to
 * where this app may write - the binaries find their way back through the environment
 * {@link Env#command} sets up.
 */
final class Deb {
  /** what a phone has no use for, left out to save a good part of the download's disk space */
  private static final String[] SKIPPED = { "share/man/", "share/doc/", "share/info/", "share/locale/" };

  private Deb() {
  }

  static void unpack(File file, String termuxPrefix, File prefix) throws IOException {
    InputStream in = new BufferedInputStream(new FileInputStream(file), 1 << 16);
    try {
      seekToData(in);
      unpackTar(new Xz(in), termuxPrefix, prefix);
    } finally {
      in.close();
    }
  }

  /** Reads the ar table of contents up to the payload of the package. */
  private static void seekToData(InputStream in) throws IOException {
    byte[] magic = new byte[8];
    readFully(in, magic, magic.length);
    if(!new String(magic, "US-ASCII").equals("!<arch>\n"))
      throw new IOException("not a Debian package");

    byte[] header = new byte[60];
    while(true) {
      try {
        readFully(in, header, header.length);
      } catch(EOFException e) {
        throw new IOException("the package has no data.tar.xz");
      }
      String name = new String(header, 0, 16, "US-ASCII").trim();
      if(name.endsWith("/"))
        name = name.substring(0, name.length() - 1);
      long size = Long.parseLong(new String(header, 48, 10, "US-ASCII").trim());
      if(name.equals("data.tar.xz"))
        return;
      skipFully(in, size + (size & 1));
    }
  }

  private static void unpackTar(InputStream in, String termuxPrefix, File prefix) throws IOException {
    String strip = termuxPrefix.replaceFirst("^/", "") + "/";
    byte[] header = new byte[512];
    String longName = null;
    String longLink = null;

    while(true) {
      readFully(in, header, header.length);
      if(isEmpty(header))
        return;

      char type = header[156] == 0 ? '0' : (char)header[156];
      long size = octal(header, 124, 12);
      String name = longName != null ? longName : name(header);
      String link = longLink != null ? longLink : text(header, 157, 100);
      longName = null;
      longLink = null;

      if(type == 'L' || type == 'K') {
        // GNU tar stores a path that does not fit into the header in its own entry
        String value = new String(readData(in, size), "UTF-8").replaceFirst("\0.*", "");
        if(type == 'L')
          longName = value;
        else
          longLink = value;
        continue;
      }

      File target = target(name, strip, prefix);
      if(target == null) {
        skipFully(in, padded(size));
        continue;
      }

      int mode = (int)octal(header, 100, 8);
      if(type == '5') {
        makeDirectory(target, mode);
      } else if(type == '2') {
        makeDirectory(target.getParentFile(), 0755);
        symlink(rewrite(link, termuxPrefix, prefix), target);
      } else if(type == '0') {
        makeDirectory(target.getParentFile(), 0755);
        write(in, size, target, mode);
        skipFully(in, padded(size) - size);
        continue;
      } else {
        // dropping an entry silently would install a package with files simply missing, and the
        // first sign of that would be a puzzling error out of git or node much later
        throw new IOException("unsupported tar entry '" + type + "' for " + name);
      }
      skipFully(in, padded(size));
    }
  }

  /** Points a link that leads into the Termux prefix at ours instead. */
  private static String rewrite(String link, String termuxPrefix, File prefix) {
    if(!link.startsWith(termuxPrefix + "/"))
      return link;
    return new File(prefix, link.substring(termuxPrefix.length() + 1)).getAbsolutePath();
  }

  private static File target(String name, String strip, File prefix) {
    if(name.startsWith("./"))
      name = name.substring(2);
    if(name.startsWith("/"))
      name = name.substring(1);
    if(!name.startsWith(strip))
      return null;

    String relative = name.substring(strip.length());
    if(relative.isEmpty() || relative.contains(".."))
      return null;
    for(String skipped : SKIPPED)
      if(relative.startsWith(skipped))
        return null;
    return new File(prefix, relative);
  }

  private static void write(InputStream in, long size, File target, int mode) throws IOException {
    if(target.exists() && !target.delete())
      throw new IOException("cannot replace " + target);

    OutputStream out = new FileOutputStream(target);
    try {
      byte[] buffer = new byte[1 << 16];
      while(size > 0) {
        int count = in.read(buffer, 0, (int)Math.min(buffer.length, size));
        if(count == -1)
          throw new EOFException("truncated package");
        out.write(buffer, 0, count);
        size -= count;
      }
    } finally {
      out.close();
    }
    chmod(target, mode);
  }

  private static void makeDirectory(File directory, int mode) throws IOException {
    if(!directory.isDirectory() && !directory.mkdirs())
      throw new IOException("cannot create " + directory);
    chmod(directory, mode | 0700);
  }

  private static void symlink(String link, File target) throws IOException {
    if(target.exists() && !target.delete())
      throw new IOException("cannot replace " + target);
    try {
      Os.symlink(link, target.getAbsolutePath());
    } catch(ErrnoException e) {
      throw new IOException("cannot link " + target + " to " + link, e);
    }
  }

  private static void chmod(File file, int mode) throws IOException {
    try {
      Os.chmod(file.getAbsolutePath(), mode & 07777);
    } catch(ErrnoException e) {
      throw new IOException("cannot set the mode of " + file, e);
    }
  }

  private static String name(byte[] header) {
    String name = text(header, 0, 100);
    String directory = text(header, 345, 155);
    return directory.isEmpty() ? name : directory + "/" + name;
  }

  private static String text(byte[] header, int offset, int length) {
    int end = offset;
    while(end < offset + length && header[end] != 0)
      end++;
    try {
      return new String(header, offset, end - offset, "UTF-8");
    } catch(IOException e) {
      return "";
    }
  }

  private static long octal(byte[] header, int offset, int length) {
    long value = 0;
    for(int i = offset; i < offset + length; i++) {
      if(header[i] == 0 || header[i] == ' ')
        continue;
      value = value * 8 + (header[i] - '0');
    }
    return value;
  }

  private static long padded(long size) {
    return (size + 511) / 512 * 512;
  }

  private static boolean isEmpty(byte[] header) {
    for(byte b : header)
      if(b != 0)
        return false;
    return true;
  }

  private static byte[] readData(InputStream in, long size) throws IOException {
    byte[] data = new byte[(int)size];
    readFully(in, data, data.length);
    skipFully(in, padded(size) - size);
    return data;
  }

  private static void readFully(InputStream in, byte[] buffer, int length) throws IOException {
    int offset = 0;
    while(length > 0) {
      int count = in.read(buffer, offset, length);
      if(count == -1)
        throw new EOFException("truncated archive");
      offset += count;
      length -= count;
    }
  }

  private static void skipFully(InputStream in, long count) throws IOException {
    byte[] buffer = new byte[1 << 13];
    while(count > 0) {
      int read = in.read(buffer, 0, (int)Math.min(buffer.length, count));
      if(read == -1)
        throw new EOFException("truncated archive");
      count -= read;
    }
  }
}
