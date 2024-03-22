/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from abResultsPane.js */

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

const abResultsPaneObserver = {
  onDragStart(event) {
    const selectedRows = GetSelectedRows();

    if (!selectedRows) {
      return;
    }

    const selectedAddresses = GetSelectedAddresses();

    event.dataTransfer.setData("moz/abcard", selectedRows);
    event.dataTransfer.setData("moz/abcard", selectedRows);
    event.dataTransfer.setData("text/x-moz-address", selectedAddresses);
    event.dataTransfer.setData("text/plain", selectedAddresses);

    const card = GetSelectedCard();
    if (card && card.displayName && !card.isMailList) {
      try {
        // A card implementation may throw NS_ERROR_NOT_IMPLEMENTED.
        // Don't break drag-and-drop if that happens.
        const vCard = card.translateTo("vcard");
        event.dataTransfer.setData("text/vcard", decodeURIComponent(vCard));
        event.dataTransfer.setData(
          "application/x-moz-file-promise-dest-filename",
          `${card.displayName}.vcf`.replace(/(.{74}).*(.{10})$/u, "$1...$2")
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
        console.error(ex);
      }
    }

    event.dataTransfer.effectAllowed = "copyMove";
    // a drag targeted at a tree should instead use the treechildren so that
    // the current selection is used as the drag feedback
    event.dataTransfer.addElement(event.target);
    event.stopPropagation();
  },
};

function DragAddressOverTargetControl() {
  var dragSession = Cc["@mozilla.org/widget/dragservice;1"]
    .getService(Ci.nsIDragService)
    .getCurrentSession();

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
