package io.virtualtabletop.server;

/** the address the test hands out, so a network change can be staged */
final class Network {
  static String current = "192.168.1.20";

  static String address() {
    return current;
  }

  static String url(String address) {
    return "http://" + (address == null ? "localhost" : address) + ":" + Env.PORT + "/" + Env.ROOM;
  }
}
