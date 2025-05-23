/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that nsSuiteGlue correctly restores default bookmarks if database is
 * corrupt, nor a JSON backup nor bookmarks.html are available.
 */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "bs",
                                   "@mozilla.org/browser/nav-bookmarks-service;1",
                                   "nsINavBookmarksService");
XPCOMUtils.defineLazyServiceGetter(this, "anno",
                                   "@mozilla.org/browser/annotation-service;1",
                                   "nsIAnnotationService");

var bookmarksObserver = {
  onBeginUpdateBatch: function() {},
  onEndUpdateBatch: function() {
    let itemId = bs.getIdForItemAt(bs.toolbarFolder, 0);
    Assert.notEqual(itemId, -1);
    if (anno.itemHasAnnotation(itemId, "Places/SmartBookmark"))
      continue_test();
  },
  onItemAdded: function() {},
  onItemRemoved: function(id, folder, index, itemType) {},
  onItemChanged: function() {},
  onItemVisited: function(id, visitID, time) {},
  onItemMoved: function() {},
  QueryInterface: ChromeUtils.generateQI([Ci.nsINavBookmarkObserver])
};

function run_test() {
  do_test_pending();

  // Remove bookmarks.html from profile.
  remove_bookmarks_html();
  // Remove JSON backup from profile.
  remove_all_JSON_backups();

  // Remove current database file.
  let db = gProfD.clone();
  db.append("places.sqlite");
  if (db.exists()) {
    db.remove(false);
    Assert.ok(!db.exists());
  }
  // Create a corrupt database.
  let corruptDB = gTestDir.clone();
  corruptDB.append("corruptDB.sqlite");
  corruptDB.copyTo(gProfD, "places.sqlite");
  Assert.ok(db.exists());

  // Initialize nsSuiteGlue before Places.
  Cc["@mozilla.org/suite/suiteglue;1"].getService(Ci.nsISuiteGlue);

  // Initialize Places through the History Service.
  let hs = Cc["@mozilla.org/browser/nav-history-service;1"].
           getService(Ci.nsINavHistoryService);
  // Check the database was corrupt.
  // nsSuiteGlue uses databaseStatus to manage initialization.
  Assert.equal(hs.databaseStatus, hs.DATABASE_STATUS_CORRUPT);

  // The test will continue once import has finished and smart bookmarks
  // have been created.
  bs.addObserver(bookmarksObserver);
}

function continue_test() {
  // Check that default bookmarks have been restored.
  let itemId = bs.getIdForItemAt(bs.toolbarFolder, SMART_BOOKMARKS_ON_TOOLBAR);
  Assert.ok(itemId > 0);
  Assert.equal(bs.getItemTitle(itemId), "SeaMonkey");

  do_test_finished();
}
