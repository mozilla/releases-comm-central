/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for IMAP nsIProtocolHandler implementations.
 */
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var defaultProtocolFlags =
  Ci.nsIProtocolHandler.URI_NORELATIVE |
  Ci.nsIProtocolHandler.URI_FORBIDS_AUTOMATIC_DOCUMENT_REPLACEMENT |
  Ci.nsIProtocolHandler.URI_DANGEROUS_TO_LOAD |
  Ci.nsIProtocolHandler.ALLOWS_PROXY |
  Ci.nsIProtocolHandler.URI_FORBIDS_COOKIE_ACCESS |
  Ci.nsIProtocolHandler.ORIGIN_IS_FULL_SPEC;

var protocols = [
  {
    protocol: "imap",
    urlSpec: "imap://user@localhost/",
    defaultPort: Ci.nsIImapUrl.DEFAULT_IMAP_PORT,
  },
  // XXX Imaps protocol not available via nsIProtocolHandler yet.
  // {
  //   protocol: "imaps",
  //   urlSpec: "iamps://user@localhost/",
  //   defaultPort: Ci.nsIImapUrl.DEFAULT_IMAPS_PORT,
  // },
];

function run_test() {
  // We need a server to match the urlSpecs above.
  createLocalIMAPServer();

  for (var part = 0; part < protocols.length; ++part) {
    print("protocol: " + protocols[part].protocol);

    var pH = Cc[
      "@mozilla.org/network/protocol;1?name=" + protocols[part].protocol
    ].createInstance(Ci.nsIProtocolHandler);

    Assert.equal(pH.scheme, protocols[part].protocol);
    Assert.equal(pH.defaultPort, protocols[part].defaultPort);
    Assert.equal(pH.protocolFlags, defaultProtocolFlags);

    // Whip through some of the ports to check we get the right results.
    // IMAP allows connecting to any port.
    for (let i = 0; i < 1024; ++i) {
      Assert.ok(pH.allowPort(i, ""));
    }

    // Check we get a URI when we ask for one
    var uri = Services.io.newURI(protocols[part].urlSpec);

    uri.QueryInterface(Ci.nsIImapUrl);

    Assert.equal(uri.spec, protocols[part].urlSpec);
  }
}
