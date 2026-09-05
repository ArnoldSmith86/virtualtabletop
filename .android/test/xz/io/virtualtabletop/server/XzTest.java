package io.virtualtabletop.server;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;

/**
 * Holds the xz decoder of the app against the xz command line tool: every sample is compressed by
 * xz and has to come back out of Xz byte for byte. A JDK and xz are all this needs, which makes it
 * the part of the app a workflow can test - everything else needs a phone.
 */
public final class XzTest {
  /** the settings the packages could be compressed with, including several blocks in a stream */
  private static final String[][] OPTIONS = {
    { "-0" },
    { "-6" },
    { "-9" },
    { "--check=none" },
    { "--check=crc32" },
    { "--check=crc64" },
    { "--check=sha256" },
    { "-1", "--block-size=65536" },
    { "-6", "-T2", "--block-size=100000" }
  };

  private static File directory;
  private static int decoded;

  private XzTest() {
  }

  public static void main(String[] arguments) throws Exception {
    directory = File.createTempFile("xztest", "");
    directory.delete();
    directory.mkdirs();

    for(byte[] sample : samples())
      for(String[] options : OPTIONS)
        roundTrip(sample, options);
    truncatedIsRefused();

    System.out.println(decoded + " xz streams decoded byte for byte, a truncated one was refused");
  }

  private static List<byte[]> samples() {
    List<byte[]> samples = new ArrayList<>();
    samples.add(new byte[0]);
    samples.add(new byte[] { 'x' });
    samples.add(repeated(70000));
    samples.add(random(300000));
    samples.add(mixed(500000));
    return samples;
  }

  /** compresses well and is longer than the 64 KiB an LZMA2 chunk holds */
  private static byte[] repeated(int length) {
    StringBuilder text = new StringBuilder();
    while(text.length() < length)
      text.append("the quick brown fox jumps over the lazy dog ").append(text.length()).append('\n');
    return text.substring(0, length).getBytes();
  }

  /** does not compress at all, so the encoder stores the chunks as they are */
  private static byte[] random(int length) {
    byte[] bytes = new byte[length];
    new Random(7).nextBytes(bytes);
    return bytes;
  }

  /** runs of both, which is what a package of binaries and text actually looks like */
  private static byte[] mixed(int length) {
    byte[] bytes = new byte[length];
    byte[] noise = random(length);
    byte[] text = repeated(length);
    for(int at = 0; at < length; at++)
      bytes[at] = (at / 9973) % 2 == 0 ? text[at] : noise[at];
    return bytes;
  }

  private static void roundTrip(byte[] sample, String[] options) throws Exception {
    File compressed = compress(sample, options);
    byte[] back = decode(new FileInputStream(compressed));
    if(!Arrays.equals(sample, back))
      throw new AssertionError("xz " + Arrays.toString(options) + " of " + sample.length
          + " bytes came back as " + back.length + " bytes that differ");
    decoded++;
  }

  /** A stream that stops in the middle has to be an error rather than a shorter file. */
  private static void truncatedIsRefused() throws Exception {
    byte[] sample = mixed(500000);
    File compressed = compress(sample, new String[] { "-6", "-T2", "--block-size=100000" });
    byte[] bytes = read(new FileInputStream(compressed));
    byte[] cut = Arrays.copyOf(bytes, bytes.length / 2);
    try {
      decode(new ByteArrayInputStream(cut));
    } catch(IOException e) {
      return;
    }
    throw new AssertionError("a stream cut in half decoded without an error");
  }

  private static File compress(byte[] sample, String[] options) throws Exception {
    File plain = new File(directory, "sample");
    File compressed = new File(directory, "sample.xz");
    OutputStream out = new FileOutputStream(plain);
    try {
      out.write(sample);
    } finally {
      out.close();
    }

    List<String> command = new ArrayList<>();
    command.add("xz");
    command.addAll(Arrays.asList(options));
    command.add("-c");
    ProcessBuilder builder = new ProcessBuilder(command);
    builder.redirectInput(plain);
    builder.redirectOutput(compressed);
    builder.redirectError(ProcessBuilder.Redirect.INHERIT);
    if(builder.start().waitFor() != 0)
      throw new IOException("xz " + Arrays.toString(options) + " failed");
    return compressed;
  }

  /** Reads through the decoder in both of the ways an InputStream can be read from. */
  private static byte[] decode(InputStream stream) throws IOException {
    InputStream xz = new Xz(stream);
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    byte[] buffer = new byte[7777];
    boolean single = false;
    while(true) {
      if(single) {
        int value = xz.read();
        if(value == -1)
          break;
        bytes.write(value);
      } else {
        int count = xz.read(buffer, 0, buffer.length);
        if(count == -1)
          break;
        bytes.write(buffer, 0, count);
      }
      single = !single;
    }
    stream.close();
    return bytes.toByteArray();
  }

  private static byte[] read(InputStream stream) throws IOException {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    byte[] buffer = new byte[1 << 16];
    int count;
    try {
      while((count = stream.read(buffer)) != -1)
        bytes.write(buffer, 0, count);
    } finally {
      stream.close();
    }
    return bytes.toByteArray();
  }
}
