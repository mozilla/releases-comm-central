/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { Color } = ChromeUtils.import("resource://gre/modules/Color.jsm");

var EXPORTED_SYMBOLS = ["TagUtils"];

var TagUtils = {
  loadTagsIntoCSS,
  addTagToAllDocumentSheets,
  isColorContrastEnough,
};

function loadTagsIntoCSS(aDocument) {
  let tagSheet = findTagColorSheet(aDocument);
  let tagArray = MailServices.tags.getAllTags();
  for (let tag of tagArray) {
    // tag.key is the internal key, like "$label1" for "Important".
    // For user defined keys with non-ASCII characters, key is
    // the MUTF-7 encoded name.
    addTagToSheet(tag.key, tag.color, tagSheet);
  }
}

function addTagToAllDocumentSheets(aKey, aColor) {
  for (let nextWin of Services.wm.getEnumerator("mail:3pane", true)) {
    addTagToSheet(aKey, aColor, findTagColorSheet(nextWin.document));
  }

  for (let nextWin of Services.wm.getEnumerator("mailnews:search", true)) {
    addTagToSheet(aKey, aColor, findTagColorSheet(nextWin.document));
  }
}

function addTagToSheet(aKey, aColor, aSheet) {
  if (!aSheet) {
    return;
  }

  // Add rules to sheet.
  let selector = MailServices.tags.getSelectorForKey(aKey);
  let ruleString1 =
    "treechildren::-moz-tree-row(" +
    selector +
    ", selected, focus) { background-color: " +
    aColor +
    " !important; }";
  let ruleString2 =
    "treechildren::-moz-tree-cell-text(" +
    selector +
    ") { color: " +
    aColor +
    "; }";
  let textColor = "black";
  if (!isColorContrastEnough(aColor)) {
    textColor = "white";
  }
  let ruleString3 =
    "treechildren::-moz-tree-cell-text(" +
    selector +
    ", selected, focus) { color: " +
    textColor +
    " }";
  let ruleString4 =
    "treechildren::-moz-tree-image(" +
    selector +
    ", selected, focus)," +
    "treechildren::-moz-tree-twisty(" +
    selector +
    ", selected, focus) { --select-focus-text-color: " +
    textColor +
    "; }";
  try {
    aSheet.insertRule(ruleString1, aSheet.cssRules.length);
    aSheet.insertRule(ruleString2, aSheet.cssRules.length);
    aSheet.insertRule(ruleString3, aSheet.cssRules.length);
    aSheet.insertRule(ruleString4, aSheet.cssRules.length);
  } catch (ex) {
    aSheet.ownerNode.addEventListener(
      "load",
      () => addTagToSheet(aKey, aColor, aSheet),
      { once: true }
    );
  }
}

function findTagColorSheet(aDocument) {
  const cssUri = "chrome://messenger/skin/tagColors.css";
  let tagSheet = null;
  for (let sheet of aDocument.styleSheets) {
    if (sheet.href == cssUri) {
      tagSheet = sheet;
      break;
    }
  }
  if (!tagSheet) {
    Cu.reportError("TagUtils.findTagColorSheet: tagColors.css not found");
  }
  return tagSheet;
}

/* Checks if black writing on 'aColor' background has enough contrast */
function isColorContrastEnough(aColor) {
  // Zero-pad the number just to make sure that it is 8 digits.
  let colorHex = ("00000000" + aColor).substr(-8);
  let colorArray = colorHex.match(/../g);
  let [, cR, cG, cB] = colorArray.map(val => parseInt(val, 16));
  return new Color(cR, cG, cB).isContrastRatioAcceptable(
    new Color(0, 0, 0),
    "AAA"
  );
}
