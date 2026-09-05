package android.system;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Paths;
import java.nio.file.attribute.PosixFilePermission;
import java.util.HashSet;
import java.util.Set;
/** what the phone does to a path, done with java.nio instead */
public final class Os {
  public static void symlink(String link, String target) throws ErrnoException {
    try {
      Files.createSymbolicLink(Paths.get(target), Paths.get(link));
    } catch(IOException e) {
      throw new ErrnoException(e.toString());
    }
  }
  public static void chmod(String path, int mode) throws ErrnoException {
    Set<PosixFilePermission> permissions = new HashSet<PosixFilePermission>();
    if((mode & 0400) != 0) permissions.add(PosixFilePermission.OWNER_READ);
    if((mode & 0200) != 0) permissions.add(PosixFilePermission.OWNER_WRITE);
    if((mode & 0100) != 0) permissions.add(PosixFilePermission.OWNER_EXECUTE);
    if((mode & 0040) != 0) permissions.add(PosixFilePermission.GROUP_READ);
    if((mode & 0010) != 0) permissions.add(PosixFilePermission.GROUP_EXECUTE);
    if((mode & 0004) != 0) permissions.add(PosixFilePermission.OTHERS_READ);
    if((mode & 0001) != 0) permissions.add(PosixFilePermission.OTHERS_EXECUTE);
    try {
      Files.setPosixFilePermissions(Paths.get(path), permissions);
    } catch(IOException e) {
      throw new ErrnoException(e.toString());
    }
  }
  /** the path itself rather than what it leads to, which is the whole point of it here */
  public static Object lstat(String path) throws ErrnoException {
    if(!Files.exists(Paths.get(path), LinkOption.NOFOLLOW_LINKS))
      throw new ErrnoException("no such file: " + path);
    return new File(path);
  }
}
