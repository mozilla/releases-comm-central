/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Contains various functions commonly used in testing mailnews search.

/**
 * TestSearch: Class to test number of search hits
 *
 * @param {nsIMsgFolder} aFolder - The folder to search
 * @param {string|integer} aValue - value used for the search
 *                   The interpretation of aValue depends on aAttrib. It
 *                   defaults to string, but for certain attributes other
 *                   types are used.
 *                   WARNING: not all attributes have been tested.
 *
 * @param {nsMsgSearchAttrib} aAttrib - Attribute for the search (Ci.nsMsgSearchAttrib.Size, etc.)
 * @param {nsMsgSearchOp} aOp - Operation for the search (Ci.nsMsgSearchOp.Contains, etc.)
 * @param {integer} aHitCount - Expected number of search hits
 * @param {Function} onDone - Function to call on completion of search
 * @param {string} aCustomId - Id string for the custom action, if aAttrib is Custom
 * @param {string} aArbitraryHeader - For OtherHeader case, header.
 * @param {string|integer} aHdrProperty - For HdrProperty and Uint32HdrProperty case
 *
 */
function TestSearch(
  aFolder,
  aValue,
  aAttrib,
  aOp,
  aHitCount,
  onDone,
  aCustomId,
  aArbitraryHeader,
  aHdrProperty
) {
  var searchListener = {
    onSearchHit() {
      hitCount++;
    },
    onSearchDone() {
      print("Finished search does " + aHitCount + " equal " + hitCount + "?");
      searchSession = null;
      Assert.equal(aHitCount, hitCount);
      if (onDone) {
        onDone();
      }
    },
    onNewSearch() {
      hitCount = 0;
    },
  };

  // define and initiate the search session

  var hitCount;
  var searchSession = Cc[
    "@mozilla.org/messenger/searchSession;1"
  ].createInstance(Ci.nsIMsgSearchSession);
  searchSession.addScopeTerm(Ci.nsMsgSearchScope.offlineMail, aFolder);
  var searchTerm = searchSession.createTerm();
  searchTerm.attrib = aAttrib;

  var value = searchTerm.value;
  // This is tricky - value.attrib must be set before actual values
  value.attrib = aAttrib;
  if (aAttrib == Ci.nsMsgSearchAttrib.JunkPercent) {
    value.junkPercent = aValue;
  } else if (aAttrib == Ci.nsMsgSearchAttrib.Priority) {
    value.priority = aValue;
  } else if (aAttrib == Ci.nsMsgSearchAttrib.Date) {
    value.date = aValue;
  } else if (
    aAttrib == Ci.nsMsgSearchAttrib.MsgStatus ||
    aAttrib == Ci.nsMsgSearchAttrib.FolderFlag ||
    aAttrib == Ci.nsMsgSearchAttrib.Uint32HdrProperty
  ) {
    value.status = aValue;
  } else if (aAttrib == Ci.nsMsgSearchAttrib.MessageKey) {
    value.msgKey = aValue;
  } else if (aAttrib == Ci.nsMsgSearchAttrib.Size) {
    value.size = aValue;
  } else if (aAttrib == Ci.nsMsgSearchAttrib.AgeInDays) {
    value.age = aValue;
  } else if (aAttrib == Ci.nsMsgSearchAttrib.JunkStatus) {
    value.junkStatus = aValue;
  } else if (aAttrib == Ci.nsMsgSearchAttrib.HasAttachmentStatus) {
    value.status = Ci.nsMsgMessageFlags.Attachment;
  } else {
    value.str = aValue;
  }
  searchTerm.value = value;
  searchTerm.op = aOp;
  searchTerm.booleanAnd = false;
  if (aAttrib == Ci.nsMsgSearchAttrib.Custom) {
    searchTerm.customId = aCustomId;
  } else if (aAttrib == Ci.nsMsgSearchAttrib.OtherHeader) {
    searchTerm.arbitraryHeader = aArbitraryHeader;
  } else if (
    aAttrib == Ci.nsMsgSearchAttrib.HdrProperty ||
    aAttrib == Ci.nsMsgSearchAttrib.Uint32HdrProperty
  ) {
    searchTerm.hdrProperty = aHdrProperty;
  }

  searchSession.appendTerm(searchTerm);
  searchSession.registerListener(searchListener);
  searchSession.search(null);
}

/*
 * Test search validity table Available and Enabled settings
 *
 * @param aScope:  search scope (Ci.nsMsgSearchScope.offlineMail, etc.)
 * @param aOp:     search operation (Ci.nsMsgSearchOp.Contains, etc.)
 * @param aAttrib: search attribute (Ci.nsMsgSearchAttrib.Size, etc.)
 * @param aValue:  expected value (true/false) for Available and Enabled
 */
const gValidityManager = Cc[
  "@mozilla.org/mail/search/validityManager;1"
].getService(Ci.nsIMsgSearchValidityManager);

function testValidityTable(aScope, aOp, aAttrib, aValue) {
  var validityTable = gValidityManager.getTable(aScope);
  var isAvailable = validityTable.getAvailable(aAttrib, aOp);
  var isEnabled = validityTable.getEnabled(aAttrib, aOp);
  if (aValue) {
    Assert.ok(isAvailable);
    Assert.ok(isEnabled);
  } else {
    Assert.ok(!isAvailable);
    Assert.ok(!isEnabled);
  }
}
