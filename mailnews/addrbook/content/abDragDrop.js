/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mail/components/addrbook/content/abCommon.js */
/* import-globals-from ../../../mail/components/compose/content/addressingWidgetOverlay.js */
/* import-globals-from abResultsPane.js */

var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

// Returns the load context for the current window
function getLoadContext() {
  return window.docShell.QueryInterface(Ci.nsILoadContext);
}

var abFlavorDataProvider = {
  QueryInterface: ChromeUtils.generateQI(["nsIFlavorDataProvider"]),

  getFlavorData(aTransferable, aFlavor, aData) {
    if (aFlavor == "application/x-moz-file-promise") {
      var primitive = {};
      aTransferable.getTransferData("text/vcard", primitive);
      var vCard = primitive.value.QueryInterface(Ci.nsISupportsString).data;
      aTransferable.getTransferData(
        "application/x-moz-file-promise-dest-filename",
        primitive
      );
      var leafName = primitive.value.QueryInterface(Ci.nsISupportsString).data;
      aTransferable.getTransferData(
        "application/x-moz-file-promise-dir",
        primitive
      );
      var localFile = primitive.value.QueryInterface(Ci.nsIFile).clone();
      localFile.append(leafName);

      var ofStream = Cc[
        "@mozilla.org/network/file-output-stream;1"
      ].createInstance(Ci.nsIFileOutputStream);
      ofStream.init(localFile, -1, -1, 0);
      var converter = Cc[
        "@mozilla.org/intl/converter-output-stream;1"
      ].createInstance(Ci.nsIConverterOutputStream);
      converter.init(ofStream, null);
      converter.writeString(vCard);
      converter.close();

      aData.value = localFile;
    }
  },
};

let abResultsPaneObserver = {
  onDragStart(event) {
    let selectedRows = GetSelectedRows();

    if (!selectedRows) {
      return;
    }

    let selectedAddresses = GetSelectedAddresses();

    event.dataTransfer.setData("moz/abcard", selectedRows);
    event.dataTransfer.setData("moz/abcard", selectedRows);
    event.dataTransfer.setData("text/x-moz-address", selectedAddresses);
    event.dataTransfer.setData("text/unicode", selectedAddresses);

    let card = GetSelectedCard();
    if (card && card.displayName && !card.isMailList) {
      try {
        // A card implementation may throw NS_ERROR_NOT_IMPLEMENTED.
        // Don't break drag-and-drop if that happens.
        let vCard = card.translateTo("vcard");
        event.dataTransfer.setData("text/vcard", decodeURIComponent(vCard));
        event.dataTransfer.setData(
          "application/x-moz-file-promise-dest-filename",
          card.displayName + ".vcf"
        );
        event.dataTransfer.setData(
          "application/x-moz-file-promise-url",
          "data:text/vcard," + vCard
        );
        event.dataTransfer.setData(
          "application/x-moz-file-promise",
          abFlavorDataProvider
        );
      } catch (ex) {
        Cu.reportError(ex);
      }
    }

    event.dataTransfer.effectAllowed = "copyMove";
    // a drag targeted at a tree should instead use the treechildren so that
    // the current selection is used as the drag feedback
    event.dataTransfer.addElement(event.target);
    event.stopPropagation();
  },
};

var dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);

var abDirTreeObserver = {
  /**
   * canDrop - determine if the tree will accept the dropping of a item
   * onto it.
   *
   * Note 1: We don't allow duplicate mailing list names, therefore copy
   * is not allowed for mailing lists.
   * Note 2: Mailing lists currently really need a card in the parent
   * address book, therefore only moving to an address book is allowed.
   *
   * The possibilities:
   *
   *   anything          -> same place             = Not allowed
   *   anything          -> read only directory    = Not allowed
   *   mailing list      -> mailing list           = Not allowed
   *     (nested mailing lists are suppported, we could start to allow
   *     this, but not between address books)
   *   address book card -> different address book = MOVE or COPY
   *   address book card -> mailing list           = COPY only
   *   (cards currently have to exist outside list for list to work correctly)
   *   mailing list      -> different address book = MOVE only
   *   (lists currently need to have unique names)
   *   card in mailing list -> parent mailing list = Not allowed
   *   card in mailing list -> other mailing list  = MOVE or COPY
   *   card in mailing list -> other address book  = MOVE or COPY
   *   read only directory item -> anywhere        = COPY only
   */
  canDrop(index, orientation, dataTransfer) {
    if (orientation != Ci.nsITreeView.DROP_ON) {
      return false;
    }
    if (!dataTransfer.types.includes("moz/abcard")) {
      return false;
    }

    let targetURI = gDirectoryTreeView.getDirectoryAtIndex(index).URI;

    let srcURI = getSelectedDirectoryURI();

    // We cannot allow copy/move to "All Address Books".
    if (targetURI == kAllDirectoryRoot + "?") {
      return false;
    }

    // The same place case
    if (targetURI == srcURI) {
      return false;
    }

    // determine if we dragging from a mailing list on a directory x to the parent (directory x).
    // if so, don't allow the drop
    if (srcURI.startsWith(targetURI)) {
      return false;
    }

    // check if we can write to the target directory
    // e.g. LDAP is readonly currently
    var targetDirectory = GetDirectoryFromURI(targetURI);

    if (targetDirectory.readOnly) {
      return false;
    }

    var dragSession = dragService.getCurrentSession();
    if (!dragSession) {
      return false;
    }

    // If target directory is a mailing list, then only allow copies.
    if (targetDirectory.isMailList) {
      dragSession.dragAction = Ci.nsIDragService.DRAGDROP_ACTION_COPY;
    }

    // Go through the cards checking to see if one of them is a mailing list
    // (if we are attempting a copy) - we can't copy mailing lists as
    // that would give us duplicate names which isn't allowed at the
    // moment.
    var draggingMailList = false;

    // The data contains the a string of "selected rows", eg.: "1,2".
    var rows = dataTransfer
      .getData("moz/abcard")
      .split(",")
      .map(j => parseInt(j, 10));

    for (let row of rows) {
      // For read-only directories, only allow copy operations.
      if (
        gAbView.getDirectoryFromRow(row).readOnly &&
        dragSession.dragAction != Ci.nsIDragService.DRAGDROP_ACTION_COPY
      ) {
        return false;
      }
      let card = gAbView.getCardFromRow(row);
      if (!card.UID) {
        Cu.reportError(new Error("Card must have a UID to be dropped here."));
        return false;
      }
      if (card.isMailList) {
        draggingMailList = true;
      }
    }

    // The rest of the cases - allow cards for copy or move, but don't allow
    // dragging mailing lists (at least for now). Dragging to another ab causes
    // dataloss.
    if (draggingMailList) {
      return false;
    }

    dragSession.canDrop = true;
    return true;
  },

  /**
   * onDrop - we don't need to check again for correctness as the
   * tree view calls canDrop just before calling onDrop.
   *
   */
  onDrop(index, orientation, dataTransfer) {
    var dragSession = dragService.getCurrentSession();
    if (!dragSession) {
      return;
    }
    if (!dataTransfer.types.includes("moz/abcard")) {
      return;
    }

    let targetURI = gDirectoryTreeView.getDirectoryAtIndex(index).URI;
    let srcURI = getSelectedDirectoryURI();

    // The data contains the a string of "selected rows", eg.: "1,2".
    var rows = dataTransfer
      .getData("moz/abcard")
      .split(",")
      .map(j => parseInt(j, 10));
    var numrows = rows.length;

    var result;
    // needToCopyCard is used for whether or not we should be creating
    // copies of the cards in a mailing list in a different address book
    // - it's not for if we are moving or not.
    var needToCopyCard = true;
    if (srcURI.length > targetURI.length) {
      result = srcURI.split(targetURI);
      if (result[0] != srcURI) {
        // src directory is a mailing list on target directory, no need to copy card
        needToCopyCard = false;
      }
    } else {
      result = targetURI.split(srcURI);
      if (result[0] != targetURI) {
        // target directory is a mailing list on src directory, no need to copy card
        needToCopyCard = false;
      }
    }

    // if we still think we have to copy the card,
    // check if srcURI and targetURI are mailing lists on same directory
    // if so, we don't have to copy the card
    if (needToCopyCard) {
      var targetParentURI = GetParentDirectoryFromMailingListURI(targetURI);
      if (
        targetParentURI &&
        targetParentURI == GetParentDirectoryFromMailingListURI(srcURI)
      ) {
        needToCopyCard = false;
      }
    }

    var directory = GetDirectoryFromURI(targetURI);

    // Only move if we are not transferring to a mail list
    var actionIsMoving =
      dragSession.dragAction & dragSession.DRAGDROP_ACTION_MOVE &&
      !directory.isMailList;

    let cardsToCopy = [];
    for (let j = 0; j < numrows; j++) {
      cardsToCopy.push(gAbView.getCardFromRow(rows[j]));
    }
    for (let card of cardsToCopy) {
      if (card.isMailList) {
        // This check ensures we haven't slipped through by mistake
        if (needToCopyCard && actionIsMoving) {
          directory.addMailList(GetDirectoryFromURI(card.mailListURI));
        }
      } else {
        let srcDirectory = null;
        if (srcURI == kAllDirectoryRoot + "?" && actionIsMoving) {
          srcDirectory = MailServices.ab.getDirectoryFromUID(card.directoryUID);
        }

        directory.dropCard(card, needToCopyCard);

        // This is true only if srcURI is "All ABs" and action is moving.
        if (srcDirectory) {
          srcDirectory.deleteCards([card]);
        }
      }
    }

    var cardsTransferredText;

    // If we are moving, but not moving to a directory, then delete the
    // selected cards and display the appropriate text
    if (actionIsMoving && srcURI != kAllDirectoryRoot + "?") {
      // If we have moved the cards, then delete them as well.
      gAbView.deleteSelectedCards();
    }

    if (actionIsMoving) {
      cardsTransferredText = PluralForm.get(
        numrows,
        gAddressBookBundle.getFormattedString("contactsMoved", [numrows])
      );
    } else {
      cardsTransferredText = PluralForm.get(
        numrows,
        gAddressBookBundle.getFormattedString("contactsCopied", [numrows])
      );
    }

    document.getElementById("statusText").label = cardsTransferredText;
  },

  onToggleOpenState() {},

  onCycleHeader(colID, elt) {},

  onCycleCell(row, colID) {},

  onSelectionChanged() {},

  onPerformAction(action) {},

  onPerformActionOnRow(action, row) {},

  onPerformActionOnCell(action, row, colID) {},
};

function DragAddressOverTargetControl(event) {
  var dragSession = gDragService.getCurrentSession();

  if (!dragSession.isDataFlavorSupported("text/x-moz-address")) {
    return;
  }

  var trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  trans.init(getLoadContext());
  trans.addDataFlavor("text/x-moz-address");

  var canDrop = true;

  for (var i = 0; i < dragSession.numDropItems; ++i) {
    dragSession.getData(trans, i);
    var dataObj = {};
    var bestFlavor = {};
    try {
      trans.getAnyTransferData(bestFlavor, dataObj);
    } catch (ex) {
      canDrop = false;
      break;
    }
  }
  dragSession.canDrop = canDrop;
}
