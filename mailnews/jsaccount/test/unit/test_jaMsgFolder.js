/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// This tests the additional methods added to JaMsgFolder.cpp that are not
// in nsMsgDBFolder.cpp  Although this code have been done creating the
// delegator class directly, instead we use a JS component as a demo of
// JS override classes.

var { JaBaseMsgFolderProperties } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/testJaBaseMsgFolder.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function run_test() {
  const server = MailServices.accounts.createIncomingServer(
    "foouser",
    "foohost",
    "testja"
  );
  Assert.ok(server instanceof Ci.msgIOverride);

  // If you create a folder object directly, it will complain about not being registered.
  // Use folder-lookup-service instead.
  const testJaMsgFolder = MailUtils.getOrCreateFolder(
    "testja://foouser@foohost/somefolder"
  );
  // let testJaMsgFolder = Cc[JaBaseMsgFolderProperties.contractID]
  //                        .createInstance(Ci.msgIOverride);
  Assert.ok(testJaMsgFolder instanceof Ci.nsIMsgFolder);

  JaBaseMsgFolderProperties.baseInterfaces.forEach(iface => {
    dump("testing interface " + iface + "(" + Ci[iface] + ")\n");
    testJaMsgFolder.QueryInterface(Ci[iface]);
  });

  let db = testJaMsgFolder.msgDatabase;
  Assert.ok(db instanceof Ci.nsIMsgDatabase);

  // Make sure the DB actually works.
  const dbFolder = db.folder;
  Assert.ok(dbFolder instanceof Ci.nsIMsgFolder);
  Assert.equal(dbFolder.URI, "testja://foouser@foohost/somefolder");
  const fi = db.dBFolderInfo;
  Assert.ok(fi instanceof Ci.nsIDBFolderInfo);
  fi.setCharProperty("testProperty", "foobar");
  Assert.equal(fi.getCharProperty("testProperty"), "foobar");
  db.forceClosed();
  db = null;

  // Confirm that we can access XPCOM properties.
}
