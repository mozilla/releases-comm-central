/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Regression test for loading an IMAP server whose saved namespace has a
 * prefix containing a comma, as stored after a server answered NAMESPACE with
 * such a prefix.
 */

add_task(function loadServerWithCommaInNamespace() {
  const key = "server99";
  Services.prefs.setCharPref(`mail.server.${key}.type`, "imap");
  Services.prefs.setCharPref(`mail.server.${key}.hostname`, "localhost");
  Services.prefs.setCharPref(`mail.server.${key}.userName`, "user");
  Services.prefs.setCharPref(`mail.server.${key}.namespace.personal`, '"x,"');
  Services.prefs.setCharPref(`mail.server.${key}.namespace.public`, '"a,","b"');

  const server = MailServices.accounts
    .getIncomingServer(key)
    .QueryInterface(Ci.nsIImapIncomingServer);
  Assert.equal(
    server.personalNamespace,
    '"x,"',
    "personal namespace should be kept"
  );
  Assert.equal(
    server.publicNamespace,
    '"a,","b"',
    "public namespace should be kept"
  );
});
