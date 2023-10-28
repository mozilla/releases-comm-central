/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Color: "resource://gre/modules/Color.sys.mjs",
});

var EXPORTED_SYMBOLS = ["TagUtils"];

var TagUtils = {
  loadTagsIntoCSS,
  addTagToAllDocumentSheets,
  isColorContrastEnough,
};

function loadTagsIntoCSS(aDocument) {
  const tagSheet = findTagColorSheet(aDocument);
  const tagArray = MailServices.tags.getAllTags();
  for (const tag of tagArray) {
    // tag.key is the internal key, like "$label1" for "Important".
    // For user defined keys with non-ASCII characters, key is
    // the MUTF-7 encoded name.
    addTagToSheet(tag.key, tag.color, tagSheet);
  }
}

function addTagToAllDocumentSheets(aKey, aColor) {
  for (const nextWin of Services.wm.getEnumerator("mail:3pane", true)) {
    addTagToSheet(aKey, aColor, findTagColorSheet(nextWin.document));
  }

  for (const nextWin of Services.wm.getEnumerator("mailnews:search", true)) {
    addTagToSheet(aKey, aColor, findTagColorSheet(nextWin.document));
  }
}

function addTagToSheet(aKey, aColor, aSheet) {
  if (!aSheet) {
    return;
  }

  // Add rules to sheet.
  let ruleString1;
  let ruleString2;
  let ruleString3;
  let ruleString4;
  const selector = MailServices.tags.getSelectorForKey(aKey);
  if (!aColor) {
    ruleString1 =
      ":root[lwt-tree] treechildren::-moz-tree-row(" +
      selector +
      ", selected, focus) { background-color: " +
      "var(--sidebar-highlight-background-color) !important; }";
    ruleString2 =
      "treechildren::-moz-tree-cell-text(" +
      selector +
      ", selected, focus) { color: SelectedItemText !important; }";
    ruleString3 =
      "tree:-moz-lwtheme treechildren::-moz-tree-cell-text(" +
      selector +
      ", selected) { color: currentColor !important; }";
    ruleString4 =
      ":root[lwt-tree] treechildren::-moz-tree-cell-text(" +
      selector +
      ", selected, focus) { color: var(--sidebar-highlight-text-color, " +
      "var(--sidebar-text-color)) !important; }";
  } else {
    ruleString1 =
      "treechildren::-moz-tree-row(" +
      selector +
      ", selected, focus) { background-color: " +
      aColor +
      " !important; outline-color: color-mix(in srgb, " +
      aColor +
      ", black 25%); }";
    ruleString2 =
      "treechildren::-moz-tree-cell-text(" +
      selector +
      ") { color: " +
      aColor +
      "; }";
    let textColor = "black";
    if (!isColorContrastEnough(aColor)) {
      textColor = "white";
    }
    ruleString3 =
      "treechildren::-moz-tree-cell-text(" +
      selector +
      ", selected, focus) { color: " +
      textColor +
      " }";
    ruleString4 =
      "treechildren::-moz-tree-image(" +
      selector +
      ", selected, focus)," +
      "treechildren::-moz-tree-twisty(" +
      selector +
      ", selected, focus) { --select-focus-text-color: " +
      textColor +
      "; }";
  }
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
  for (const sheet of aDocument.styleSheets) {
    if (sheet.href == cssUri) {
      tagSheet = sheet;
      break;
    }
  }
  if (!tagSheet) {
    console.error("TagUtils.findTagColorSheet: tagColors.css not found");
  }
  return tagSheet;
}

/* Checks if black writing on 'aColor' background has enough contrast */
function isColorContrastEnough(aColor) {
  // Is a color set? If not, return "true" to use the default color.
  if (!aColor) {
    return true;
  }
  // Zero-pad the number just to make sure that it is 8 digits.
  const colorHex = ("00000000" + aColor).substr(-8);
  const colorArray = colorHex.match(/../g);
  const [, cR, cG, cB] = colorArray.map(val => parseInt(val, 16));
  return new lazy.Color(cR, cG, cB).isContrastRatioAcceptable(
    new lazy.Color(0, 0, 0),
    "AAA"
  );
}
