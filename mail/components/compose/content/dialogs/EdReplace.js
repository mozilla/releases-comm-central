/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from EdDialogCommon.js */

var gReplaceDialog; // Quick access to document/form elements.
var gFindInst; // nsIWebBrowserFind that we're going to use
var gFindService; // Global service which remembers find params
var gEditor; // the editor we're using

window.addEventListener("load", () => {
  onLoad();
});

document.addEventListener("dialogaccept", event => {
  onFindNext();
  event.preventDefault();
});

function onLoad() {
  // Get the xul <editor> element:
  const editorElement = window.arguments[0];

  gEditor = editorElement.getEditor(editorElement.contentWindow);

  // Get the nsIWebBrowserFind service:
  gFindInst = editorElement.webBrowserFind;

  // get the find service, which stores global find state
  gFindService = Cc["@mozilla.org/find/find_service;1"].getService(
    Ci.nsIFindService
  );

  // Create gReplaceDialog object and initialize.
  gReplaceDialog = {};
  gReplaceDialog.findInput = document.getElementById("dialog.findInput");
  gReplaceDialog.replaceInput = document.getElementById("dialog.replaceInput");
  gReplaceDialog.caseSensitive = document.getElementById(
    "dialog.caseSensitive"
  );
  gReplaceDialog.wrap = document.getElementById("dialog.wrap");
  gReplaceDialog.searchBackwards = document.getElementById(
    "dialog.searchBackwards"
  );
  gReplaceDialog.findNext = document.getElementById("findNext");
  gReplaceDialog.replace = document.getElementById("replace");
  gReplaceDialog.replaceAndFind = document.getElementById("replaceAndFind");
  gReplaceDialog.replaceAll = document.getElementById("replaceAll");

  // Fill dialog.
  // Set initial dialog field contents.
  // Set initial dialog field contents. Use the gFindInst attributes first,
  // this is necessary for window.find()
  gReplaceDialog.findInput.value = gFindInst.searchString
    ? gFindInst.searchString
    : gFindService.searchString;
  gReplaceDialog.replaceInput.value = gFindService.replaceString;
  gReplaceDialog.caseSensitive.checked = gFindInst.matchCase
    ? gFindInst.matchCase
    : gFindService.matchCase;
  gReplaceDialog.wrap.checked = gFindInst.wrapFind
    ? gFindInst.wrapFind
    : gFindService.wrapFind;
  gReplaceDialog.searchBackwards.checked = gFindInst.findBackwards
    ? gFindInst.findBackwards
    : gFindService.findBackwards;

  doEnabling();

  if (gReplaceDialog.findInput.value) {
    gReplaceDialog.findInput.select();
  } else {
    gReplaceDialog.findInput.focus();
  }
}

function saveFindData() {
  // Set data attributes per user input.
  if (gFindService) {
    gFindService.searchString = gReplaceDialog.findInput.value;
    gFindService.matchCase = gReplaceDialog.caseSensitive.checked;
    gFindService.wrapFind = gReplaceDialog.wrap.checked;
    gFindService.findBackwards = gReplaceDialog.searchBackwards.checked;
  }
}

function setUpFindInst() {
  gFindInst.searchString = gReplaceDialog.findInput.value;
  gFindInst.matchCase = gReplaceDialog.caseSensitive.checked;
  gFindInst.wrapFind = gReplaceDialog.wrap.checked;
  gFindInst.findBackwards = gReplaceDialog.searchBackwards.checked;
}

async function onFindNext() {
  // Transfer dialog contents to the find service.
  saveFindData();
  // set up the find instance
  setUpFindInst();

  // Search.
  const result = gFindInst.findNext();
  if (result) {
    return;
  }

  const [title, message] = await document.l10n.formatValues([
    "not-found-alert-title",
    "not-found-alert-message",
  ]);
  Services.prompt.alert(window, title, message);

  gReplaceDialog.findInput.select();
  gReplaceDialog.findInput.focus();
}

function onReplace() {
  // Does the current selection match the find string?
  var selection = gEditor.selection;

  var selStr = selection.toString();
  var specStr = gReplaceDialog.findInput.value;
  if (!gReplaceDialog.caseSensitive.checked) {
    selStr = selStr.toLowerCase();
    specStr = specStr.toLowerCase();
  }
  // Unfortunately, because of whitespace we can't just check
  // whether (selStr == specStr), but have to loop ourselves.
  // N chars of whitespace in specStr can match any M >= N in selStr.
  var matches = true;
  var specLen = specStr.length;
  var selLen = selStr.length;
  if (selLen < specLen) {
    matches = false;
  } else {
    var specArray = specStr.match(/\S+|\s+/g);
    var selArray = selStr.match(/\S+|\s+/g);
    if (specArray.length != selArray.length) {
      matches = false;
    } else {
      for (var i = 0; i < selArray.length; i++) {
        if (selArray[i] != specArray[i]) {
          if (/\S/.test(selArray[i][0]) || /\S/.test(specArray[i][0])) {
            // not a space chunk -- match fails
            matches = false;
            break;
          } else if (selArray[i].length < specArray[i].length) {
            // if it's a space chunk then we only care that sel be
            // at least as long as spec
            matches = false;
            break;
          }
        }
      }
    }
  }

  // If the current selection doesn't match the pattern,
  // then we want to find the next match, but not do the replace.
  // That's what most other apps seem to do.
  // So here, just return.
  if (!matches) {
    return false;
  }

  // Transfer dialog contents to the find service.
  saveFindData();

  // For reverse finds, need to remember the caret position
  // before current selection
  var newRange;
  if (gReplaceDialog.searchBackwards.checked && selection.rangeCount > 0) {
    newRange = selection.getRangeAt(0).cloneRange();
    newRange.collapse(true);
  }

  // nsPlaintextEditor::InsertText fails if the string is empty,
  // so make that a special case:
  var replStr = gReplaceDialog.replaceInput.value;
  if (replStr == "") {
    gEditor.deleteSelection(gEditor.eNone, gEditor.eStrip);
  } else {
    gEditor.insertText(replStr);
  }

  // For reverse finds, need to move caret just before the replaced text
  if (gReplaceDialog.searchBackwards.checked && newRange) {
    gEditor.selection.removeAllRanges();
    gEditor.selection.addRange(newRange);
  }

  return true;
}

function onReplaceAll() {
  const findStr = gReplaceDialog.findInput.value;
  const repStr = gReplaceDialog.replaceInput.value;

  // Transfer dialog contents to the find service.
  saveFindData();

  const finder = Cc["@mozilla.org/embedcomp/rangefind;1"]
    .createInstance()
    .QueryInterface(Ci.nsIFind);

  finder.caseSensitive = gReplaceDialog.caseSensitive.checked;
  finder.findBackwards = gReplaceDialog.searchBackwards.checked;

  // We want the whole operation to be undoable in one swell foop,
  // so start a transaction:
  gEditor.beginTransaction();

  // and to make sure we close the transaction, guard against exceptions:
  try {
    // We'll need a range for the whole document:
    const wholeDocRange = gEditor.document.createRange();
    const rootNode = gEditor.rootElement;
    wholeDocRange.selectNodeContents(rootNode);

    // selecRange (aStartPoint) must always be <= endPt (aEndPoint) in document
    // order. For forward search, selecRange starts at doc start and advances
    // after each replacement; endPt stays at doc end. For backward search,
    // selecRange stays at doc start (the stop boundary) and endPt retreats to
    // the start of each found match so the next scan covers the remaining range.
    let selecRange = gEditor.document.createRange();
    selecRange.setStart(
      wholeDocRange.startContainer,
      wholeDocRange.startOffset
    );
    selecRange.setEnd(wholeDocRange.startContainer, wholeDocRange.startOffset);

    let endPt = gEditor.document.createRange();
    endPt.setStart(wholeDocRange.endContainer, wholeDocRange.endOffset);
    endPt.setEnd(wholeDocRange.endContainer, wholeDocRange.endOffset);

    let foundRange;
    const searchRange = wholeDocRange.cloneRange();
    while (
      (foundRange = finder.Find(findStr, searchRange, selecRange, endPt)) !=
      null
    ) {
      gEditor.selection.removeAllRanges();
      gEditor.selection.addRange(foundRange);

      if (gReplaceDialog.searchBackwards.checked) {
        endPt = foundRange.cloneRange();
        endPt.setEnd(endPt.startContainer, endPt.startOffset);
      }

      // nsPlaintextEditor::InsertText fails if the string is empty,
      // so make that a special case:
      if (repStr == "") {
        gEditor.deleteSelection(gEditor.eNone, gEditor.eStrip);
      } else {
        gEditor.insertText(repStr);
      }

      if (!gReplaceDialog.searchBackwards.checked) {
        const selection = gEditor.selection;
        if (selection.rangeCount <= 0) {
          return;
        }
        selecRange = selection.getRangeAt(0).cloneRange();
      }
    }
  } finally {
    gEditor.endTransaction();
  }
}

function doEnabling() {
  var findStr = gReplaceDialog.findInput.value;
  gReplaceDialog.enabled = findStr;
  gReplaceDialog.findNext.disabled = !findStr;
  gReplaceDialog.replace.disabled = !findStr;
  gReplaceDialog.replaceAndFind.disabled = !findStr;
  gReplaceDialog.replaceAll.disabled = !findStr;
}
