/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the account manager does not reuse server keys within a session.
 * If the pref `mail.server.serverX.type` exists for a value of X, or it did
 * exist at some point since the start of the session, `serverX` must not be
 * returned by `getUniqueServerKey`.
 */
add_task(function () {
  const { createIncomingServer, getUniqueServerKey, removeIncomingServer } =
    MailServices.accounts;

  // Check we start with a sensible value.

  Assert.equal(getUniqueServerKey(), "server1");

  // Add some prefs and check the value of X rises with them.

  Services.prefs.setStringPref("mail.server.server1.type", "fake");
  Assert.equal(getUniqueServerKey(), "server2");

  Services.prefs.setStringPref("mail.server.server2.type", "fake");
  Assert.equal(getUniqueServerKey(), "server3");

  // Remove the prefs. `server1` and `server2` must not be reused.

  Services.prefs.clearUserPref("mail.server.server1.type");
  Assert.equal(getUniqueServerKey(), "server3");

  Services.prefs.clearUserPref("mail.server.server2.type");
  Assert.equal(getUniqueServerKey(), "server3");

  // Add a pref above the current value. It's acceptable to use values of X
  // below the highest value, as long as they haven't been seen before in this
  // session. There might be servers that existed but were removed in an
  // earlier session.

  Services.prefs.setStringPref("mail.server.server4.type", "fake");
  Assert.equal(getUniqueServerKey(), "server3");

  // Make sure we don't return `server4`.

  Services.prefs.setStringPref("mail.server.server3.type", "fake");
  Assert.equal(getUniqueServerKey(), "server5");

  // Now do the same things again but use actual incoming servers.

  const server5 = createIncomingServer("user5", "host5", "none");
  Assert.equal(server5.key, "server5");
  Assert.equal(getUniqueServerKey(), "server6");

  const server6 = createIncomingServer("user6", "host6", "none");
  Assert.equal(server6.key, "server6");
  Assert.equal(getUniqueServerKey(), "server7");

  removeIncomingServer(server5, false);
  Assert.equal(getUniqueServerKey(), "server7");

  removeIncomingServer(server6, false);
  Assert.equal(getUniqueServerKey(), "server7");

  // Check that creating a server, even if we immediately remove it, means the
  // key won't be used again.

  const server7 = createIncomingServer("user7", "host7", "none");
  removeIncomingServer(server7, false);
  Assert.equal(getUniqueServerKey(), "server8");
});
