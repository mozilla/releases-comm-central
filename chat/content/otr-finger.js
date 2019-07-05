/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Services} = ChromeUtils.import("resource:///modules/imServices.jsm");
const {OTR} = ChromeUtils.import("resource:///modules/OTR.jsm");
const {Localization} = ChromeUtils.import("resource://gre/modules/Localization.jsm");

const syncL10n = new Localization([
  "messenger/otr/finger.ftl",
], true);

var [account] = window.arguments;

var gFingers;
var fingerTreeView = {
  selection: null,
  rowCount: 0,
  setTree(tree) {},
  getImageSrc(row, column) {},
  getProgressMode(row, column) {},
  getCellValue(row, column) {},
  getCellText(row, column) {
    let finger = gFingers[row];
    switch (column.id) {
      case "verified": {
        let id = finger.trust ? "finger-yes" : "finger-no";
        return syncL10n.formatValueSync(id);
      }
      default:
        return finger[column.id] || "";
    }
  },
  isSeparator(index) { return false; },
  isSorted() { return false; },
  isContainer(index) { return false; },
  cycleHeader(column) {},
  getRowProperties(row) { return ""; },
  getColumnProperties(column) { return ""; },
  getCellProperties(row, column) { return ""; },
};

function getSelections(tree) {
  let selections = [];
  let selection = tree.view.selection;
  if (selection) {
    let count = selection.getRangeCount();
    let min = {};
    let max = {};
    for (let i = 0; i < count; i++) {
      selection.getRangeAt(i, min, max);
      for (let k = min.value; k <= max.value; k++) {
        if (k != -1)
          selections[selections.length] = k;
      }
    }
  }
  return selections;
}

var fingerTree;
var otrFinger = {
  onload() {
    fingerTree = document.getElementById("fingerTree");
    gFingers = OTR.knownFingerprints(account);
    fingerTreeView.rowCount = gFingers.length;
    fingerTree.view = fingerTreeView;
  },

  select() {
    let selections = getSelections(fingerTree);
    document.getElementById("remove").disabled = !selections.length;
  },

  remove() {
    fingerTreeView.selection.selectEventsSuppressed = true;
    // mark fingers for removal
    getSelections(fingerTree).forEach(function(sel) {
      gFingers[sel].purge = true;
    });
    this.commonRemove();
  },

  removeAll() {
    let confirmAllTitle = syncL10n.formatValueSync("finger-remove-all-title");
    let confirmAllText = syncL10n.formatValueSync("finger-remove-all-message");

    let buttonPressed =
      Services.prompt.confirmEx(window, confirmAllTitle, confirmAllText,
        Services.prompt.BUTTON_POS_1_DEFAULT +
          Services.prompt.STD_OK_CANCEL_BUTTONS +
          Services.prompt.BUTTON_DELAY_ENABLE,
        0, 0, 0, null, {});
    if (buttonPressed != 0) {
      return;
    }

    for (let j = 0; j < gFingers.length; j++) {
      gFingers[j].purge = true;
    }
    this.commonRemove();
  },

  commonRemove() {
    // OTR.forgetFingerprints will null out removed fingers.
    let removalComplete = OTR.forgetFingerprints(gFingers);
    for (let j = 0; j < gFingers.length; j++) {
      if (gFingers[j] === null) {
        let k = j;
        while (k < gFingers.length && gFingers[k] === null) {
          k++;
        }
        gFingers.splice(j, k - j);
        fingerTreeView.rowCount -= k - j;
        fingerTree.rowCountChanged(j, j - k);  // negative
      }
    }
    fingerTreeView.selection.selectEventsSuppressed = false;
    if (!removalComplete) {
      let infoTitle = syncL10n.formatValueSync("finger-subset-title");
      let infoText = syncL10n.formatValueSync("finger-subset-message");
      Services.prompt.alert(window, infoTitle, infoText);
    }
  },
};
