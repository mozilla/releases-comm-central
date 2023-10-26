/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { LDAPServer } = ChromeUtils.import(
  "resource://testing-common/LDAPServer.jsm"
);

const autocompleteService = Cc[
  "@mozilla.org/autocomplete/search;1?name=addrbook"
].getService(Ci.nsIAutoCompleteSearch);
const jsonFile = do_get_file("data/ldap_contacts.json");
const replicationService = Cc[
  "@mozilla.org/addressbook/ldap-replication-service;1"
].getService(Ci.nsIAbLDAPReplicationService);

add_task(async () => {
  LDAPServer.open();
  const ldapContacts = await IOUtils.readJSON(jsonFile.path);

  const bookPref = MailServices.ab.newAddressBook(
    "XPCShell",
    `ldap://localhost:${LDAPServer.port}/people??sub?(objectclass=*)`,
    0
  );
  const book = MailServices.ab.getDirectoryFromId(bookPref);
  book.QueryInterface(Ci.nsIAbLDAPDirectory);
  equal(book.replicationFileName, "ldap.sqlite");

  Services.prefs.setCharPref("ldap_2.autoComplete.directoryServer", bookPref);
  Services.prefs.setBoolPref("ldap_2.autoComplete.useDirectory", true);

  registerCleanupFunction(async () => {
    LDAPServer.close();
  });

  let progressResolve;
  let progressPromise = new Promise(resolve => (progressResolve = resolve));
  const progressListener = {
    onStateChange(webProgress, request, stateFlags, status) {
      if (stateFlags & Ci.nsIWebProgressListener.STATE_START) {
        info("replication started");
      }
      if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
        info("replication ended");
        progressResolve();
      }
    },
    onProgressChange(
      webProgress,
      request,
      currentSelfProgress,
      maxSelfProgress,
      currentTotalProgress,
      maxTotalProgress
    ) {},
    onLocationChange(webProgress, request, location, flags) {},
    onStatusChange(webProgress, request, status, message) {},
    onSecurityChange(webProgress, request, state) {},
    onContentBlockingEvent(webProgress, request, event) {},
  };

  replicationService.startReplication(book, progressListener);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();

  await LDAPServer.read(LDAPServer.SearchRequest);
  for (const contact of Object.values(ldapContacts)) {
    LDAPServer.writeSearchResultEntry(contact);
  }
  LDAPServer.writeSearchResultDone();

  await progressPromise;
  equal(book.replicationFileName, "ldap.sqlite");

  Services.io.offline = true;

  let cards = book.childCards;
  deepEqual(cards.map(c => c.displayName).sort(), [
    "Eurus Holmes",
    "Greg Lestrade",
    "Irene Adler",
    "Jim Moriarty",
    "John Watson",
    "Mary Watson",
    "Molly Hooper",
    "Mrs Hudson",
    "Mycroft Holmes",
    "Sherlock Holmes",
  ]);

  await new Promise(resolve => {
    autocompleteService.startSearch("molly", '{"type":"addr_to"}', null, {
      onSearchResult(search, result) {
        equal(result.matchCount, 1);
        equal(result.getValueAt(0), "Molly Hooper <molly@bakerstreet.invalid>");
        resolve();
      },
    });
  });
  await new Promise(resolve => {
    autocompleteService.startSearch("watson", '{"type":"addr_to"}', null, {
      onSearchResult(search, result) {
        equal(result.matchCount, 2);
        equal(result.getValueAt(0), "John Watson <john@bakerstreet.invalid>");
        equal(result.getValueAt(1), "Mary Watson <mary@bakerstreet.invalid>");
        resolve();
      },
    });
  });

  // Do it again with different information from the server. Ensure we have the new information.

  progressPromise = new Promise(resolve => (progressResolve = resolve));
  replicationService.startReplication(book, progressListener);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.eurus);
  LDAPServer.writeSearchResultEntry(ldapContacts.mary);
  LDAPServer.writeSearchResultEntry(ldapContacts.molly);
  LDAPServer.writeSearchResultDone();

  await progressPromise;
  equal(book.replicationFileName, "ldap.sqlite");

  cards = book.childCards;
  deepEqual(cards.map(c => c.displayName).sort(), [
    "Eurus Holmes",
    "Mary Watson",
    "Molly Hooper",
  ]);

  // Do it again but cancel. Ensure we still have the old information.

  progressPromise = new Promise(resolve => (progressResolve = resolve));
  replicationService.startReplication(book, progressListener);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.john);
  LDAPServer.writeSearchResultEntry(ldapContacts.sherlock);
  LDAPServer.writeSearchResultEntry(ldapContacts.mrs_hudson);
  replicationService.cancelReplication(book);

  await progressPromise;

  cards = book.childCards;
  deepEqual(cards.map(c => c.displayName).sort(), [
    "Eurus Holmes",
    "Mary Watson",
    "Molly Hooper",
  ]);
});
