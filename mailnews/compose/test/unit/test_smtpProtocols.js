/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for getting smtp urls via the protocol handler.
 */

var defaultProtocolFlags =
  Ci.nsIProtocolHandler.URI_NORELATIVE |
  Ci.nsIProtocolHandler.URI_DANGEROUS_TO_LOAD |
  Ci.nsIProtocolHandler.URI_NON_PERSISTABLE |
  Ci.nsIProtocolHandler.ALLOWS_PROXY |
  Ci.nsIProtocolHandler.URI_FORBIDS_AUTOMATIC_DOCUMENT_REPLACEMENT;

var protocols = [
  {
    protocol: "smtp",
    urlSpec: "smtp://user@localhost/",
    defaultPort: Ci.nsISmtpUrl.DEFAULT_SMTP_PORT,
  },
  {
    protocol: "smtps",
    urlSpec: "smtps://user@localhost/",
    defaultPort: Ci.nsISmtpUrl.DEFAULT_SMTPS_PORT,
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
    for (let i = 0; i < 1024; ++i) {
      Assert.equal(pH.allowPort(i, ""), i == protocols[part].defaultPort);
    }

    // Check we get a URI when we ask for one
    var uri = Services.io.newURI(protocols[part].urlSpec);

    uri.QueryInterface(Ci.nsISmtpUrl);

    Assert.equal(uri.spec, protocols[part].urlSpec);

    try {
      // This call should throw NS_ERROR_NOT_IMPLEMENTED. If it doesn't,
      // then we should implement a new test for it.
      pH.newChannel(uri, null);
      // If it didn't throw, then shout about it.
      do_throw("newChannel not throwing NS_ERROR_NOT_IMPLEMENTED.");
    } catch (ex) {
      Assert.equal(ex.result, Cr.NS_ERROR_NOT_IMPLEMENTED);
    }
  }
}
