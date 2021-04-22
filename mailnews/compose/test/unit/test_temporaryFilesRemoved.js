/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that temporary files for draft are surely removed.
 */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gMsgCompose;
var gExpectedFiles;

var progressListener = {
  onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      do_timeout(0, checkResult);
    }
  },

  onProgressChange(
    aWebProgress,
    aRequest,
    aCurSelfProgress,
    aMaxSelfProgress,
    aCurTotalProgress,
    aMaxTotalProgress
  ) {},
  onLocationChange(aWebProgress, aRequest, aLocation, aFlags) {},
  onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {},
  onSecurityChange(aWebProgress, aRequest, state) {},
  onContentBlockingEvent(aWebProgress, aRequest, aEvent) {},

  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),
};

/**
 * Get the count of temporary files. Because nsIFile.createUnique creates a random
 * file name, we iterate the tmp dir and count the files that match filename
 * patterns.
 */
async function getTemporaryFilesCount() {
  let tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile).path;
  let entries = await IOUtils.getChildren(tmpDir);
  let tempFiles = {
    "nsemail.html": 0, // not actually used by MessageSend.jsm
    "nsemail.eml": 0,
    "nscopy.tmp": 0,
  };
  for (const path of entries) {
    for (let pattern of Object.keys(tempFiles)) {
      let [name, extName] = pattern.split(".");
      if (PathUtils.filename(path).startsWith(name) && path.endsWith(extName)) {
        tempFiles[pattern]++;
      }
    }
  }
  return tempFiles;
}

/**
 * Temp files should be deleted as soon as the draft is finished saving, so the
 * counts should be the same as before.
 */
async function checkResult() {
  let filesCount = await getTemporaryFilesCount();
  for (let [pattern, count] of Object.entries(filesCount)) {
    Assert.equal(
      count,
      gExpectedFiles[pattern],
      `${pattern} should not exists`
    );
  }
  do_test_finished();
}

add_task(async function() {
  gExpectedFiles = await getTemporaryFilesCount();

  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();

  gMsgCompose = Cc["@mozilla.org/messengercompose/compose;1"].createInstance(
    Ci.nsIMsgCompose
  );
  let fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);

  fields.body = "body text";
  // set multipart for nsemail.html
  fields.useMultipartAlternative = true;

  params.composeFields = fields;
  params.format = Ci.nsIMsgCompFormat.HTML;

  gMsgCompose.initialize(params, null, null);

  let identity = getSmtpIdentity(null, getBasicSmtpServer());

  localAccountUtils.rootFolder.createLocalSubfolder("Drafts");

  let progress = Cc["@mozilla.org/messenger/progress;1"].createInstance(
    Ci.nsIMsgProgress
  );
  progress.registerListener(progressListener);

  do_test_pending();

  gMsgCompose.sendMsg(
    Ci.nsIMsgSend.nsMsgSaveAsDraft,
    identity,
    "",
    null,
    progress
  );
});
