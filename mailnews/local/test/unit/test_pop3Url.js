/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that pop3: and pop: URIs can be created from their spec.
 */

add_task(function test_newPop3URI() {
  const uri = Services.io.newURI("pop3://localhost:1110");
  Assert.ok(
    uri instanceof Ci.nsIMsgMailNewsUrl,
    "uri should be a nsIMsgMailNewsUrl"
  );
  Assert.equal(uri.scheme, "pop3");
  Assert.equal(uri.host, "localhost");
  Assert.equal(uri.port, 1110);
});

add_task(function test_popURIRoundTrip() {
  const spec =
    "pop://user@localhost:1110/?uidl=UIDL1&number=1&folderURI=mailbox://user@localhost/Inbox";
  const uri = Services.io.newURI(spec);
  Assert.ok(
    uri instanceof Ci.nsIMsgMailNewsUrl,
    "uri should be a nsIMsgMailNewsUrl"
  );
  Assert.equal(uri.spec, spec, "spec should survive a round-trip");
});
