/*
 * Test suite for getting news urls via the protocol handler.
 */

var defaultProtocolFlags =
  Ci.nsIProtocolHandler.URI_NORELATIVE |
  Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE |
  Ci.nsIProtocolHandler.ALLOWS_PROXY |
  Ci.nsIProtocolHandler.URI_FORBIDS_AUTOMATIC_DOCUMENT_REPLACEMENT |
  Ci.nsIProtocolHandler.URI_FORBIDS_COOKIE_ACCESS |
  Ci.nsIProtocolHandler.ORIGIN_IS_FULL_SPEC;

var protocols = [
  {
    protocol: "news",
    urlSpec: "news://user@localhost/",
    defaultPort: Ci.nsINntpIncomingServer.DEFAULT_NNTP_PORT,
  },
  {
    protocol: "snews",
    urlSpec: "snews://user@localhost/",
    defaultPort: Ci.nsINntpIncomingServer.DEFAULT_NNTPS_PORT,
  },
];

function run_test() {
  for (var part = 0; part < protocols.length; ++part) {
    print("protocol: " + protocols[part].protocol);

    var pH = Cc[
      "@mozilla.org/network/protocol;1?name=" + protocols[part].protocol
    ].createInstance(Ci.nsIProtocolHandler);

    Assert.equal(pH.scheme, protocols[part].protocol);
    Assert.equal(
      Services.io.getDefaultPort(pH.scheme),
      protocols[part].defaultPort
    );
    Assert.equal(Services.io.getProtocolFlags(pH.scheme), defaultProtocolFlags);

    // Whip through some of the ports to check we get the right results.
    // NEWS only overrides the restricted port list for its own ports.
    for (let i = 0; i < 1024; ++i) {
      Assert.equal(
        pH.allowPort(i, ""),
        i == Ci.nsINntpIncomingServer.DEFAULT_NNTP_PORT ||
          i == Ci.nsINntpIncomingServer.DEFAULT_NNTPS_PORT,
        "should only allow nntp ports"
      );
    }

    // Check we get a URI when we ask for one
    var uri = Services.io.newURI(protocols[part].urlSpec);

    Assert.equal(uri.spec, protocols[part].urlSpec);
  }
}
