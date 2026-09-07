package io.virtualtabletop.server;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;

/**
 * The address the players type into their browsers. Reading it off the network interfaces keeps
 * the app free of the location permission WifiManager would ask for on newer Android versions.
 */
final class Network {
  /** what vendors call the interface of a WiFi hotspot, which takes precedence over being a client */
  private static final String[] HOTSPOT = { "ap", "softap", "swlan", "wlan1", "wl0.1" };
  private static final String[] WIFI = { "wlan", "eth" };

  private Network() {
  }

  /** The address of this phone right now, null while it is on no network at all. */
  static String address() {
    String address = address(HOTSPOT);
    if(address == null)
      address = address(WIFI);
    if(address == null)
      address = address(null);
    return address;
  }

  static String url(String address) {
    return "http://" + (address == null ? "localhost" : address) + ":" + Env.PORT + "/" + Env.ROOM;
  }

  /** The first IPv4 address of an interface whose name starts with one of the given names. */
  private static String address(String[] names) {
    try {
      Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
      if(interfaces == null)
        return null;
      for(NetworkInterface candidate : Collections.list(interfaces)) {
        if(candidate.isLoopback() || !candidate.isUp() || !matches(candidate.getName(), names))
          continue;
        List<InetAddress> addresses = Collections.list(candidate.getInetAddresses());
        for(InetAddress address : addresses)
          if(address instanceof Inet4Address && !address.isLoopbackAddress() && !address.isLinkLocalAddress())
            return address.getHostAddress();
      }
    } catch(Exception e) {
      // an unreadable interface list just means the address stays unknown
    }
    return null;
  }

  private static boolean matches(String name, String[] names) {
    if(names == null)
      return true;
    for(String candidate : names)
      if(name.startsWith(candidate))
        return true;
    return false;
  }
}
