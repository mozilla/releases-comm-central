/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This test does not use glodaTestHelper because:
 * 1) We need to do things as part of the test without gloda having remotely
 *    thought about opening the database.
 * 2) We expect and desire that the logger produce a warning and glodaTestHelper
 *    takes the view that warnings = death.
 *
 * We do use the rest of the test infrastructure though.
 */

// -- Do configure the gloda prefs though...
// Yes to indexing.
Services.prefs.setBoolPref("mailnews.database.global.indexer.enabled", true);
// No to a sweep we don't control.
Services.prefs.setBoolPref(
  "mailnews.database.global.indexer.perform_initial_sweep",
  false
);

// We'll start with this datastore ID, and make sure it gets overwritten
// when the index is rebuilt.
var kDatastoreIDPref = "mailnews.database.global.datastore.id";
var kOriginalDatastoreID = "47e4bad6-fedc-4931-bf3f-d2f4146ac63e";
Services.prefs.setCharPref(kDatastoreIDPref, kOriginalDatastoreID);

/**
 * Create an illegal=corrupt database and make sure that we log a message and
 * still end up happy.
 */
add_task(function test_corrupt_databases_get_reported_and_blown_away() {
  // - Get the file path.
  const dbFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  dbFile.append("global-messages-db.sqlite");

  // - Protect dangerous people from themselves.
  // (There should not be a database at this point; if there is one, we are
  // not in the sandbox profile we expect.  I wouldn't bother except we're
  // going out of our way to write gibberish whereas gloda accidentally
  // opening a valid database is bad but not horrible.)
  if (dbFile.exists()) {
    do_throw("There should not be a database at this point.");
  }

  // - Create the file.
  dump("Creating gibberish file\n");
  const ostream = Cc[
    "@mozilla.org/network/file-output-stream;1"
  ].createInstance(Ci.nsIFileOutputStream);
  ostream.init(dbFile, -1, -1, 0);
  const fileContents = "I'm in ur database not being a database.\n";
  ostream.write(fileContents, fileContents.length);
  ostream.close();

  // - Init gloda, get warnings.
  dump("Init gloda\n");
  var { Gloda } = ChromeUtils.importESModule(
    "resource:///modules/gloda/GlodaPublic.sys.mjs"
  );
  dump("Gloda inited, checking\n");

  // - Make sure the datastore has an actual database.
  const { GlodaDatastore } = ChromeUtils.importESModule(
    "resource:///modules/gloda/GlodaDatastore.sys.mjs"
  );

  // Make sure that the datastoreID was overwritten
  Assert.notEqual(Gloda.datastoreID, kOriginalDatastoreID);
  // And for good measure, make sure that the pref was also overwritten
  const currentDatastoreID = Services.prefs.getCharPref(kDatastoreIDPref);
  Assert.notEqual(currentDatastoreID, kOriginalDatastoreID);
  // We'll also ensure that the Gloda.datastoreID matches the one stashed
  // in prefs...
  Assert.equal(currentDatastoreID, Gloda.datastoreID);
  // And finally, we'll make sure that the datastoreID is a string with length
  // greater than 0.
  Assert.equal(typeof Gloda.datastoreID, "string");
  Assert.ok(Gloda.datastoreID.length > 0);

  if (!GlodaDatastore.asyncConnection) {
    do_throw("No database connection suggests no database!");
  }
});
