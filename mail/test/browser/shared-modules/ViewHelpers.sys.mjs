/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Module to help debugging view wrapper issues. */

export function dump_view_state(aViewWrapper, aDoNotDumpContents) {
  if (aViewWrapper.dbView == null) {
    dump("no nsIMsgDBView instance!\n");
    return;
  }
  if (!aDoNotDumpContents) {
    dump_view_contents(aViewWrapper);
  }
  dump("View: " + aViewWrapper.dbView + "\n");
  dump(
    "  View Type: " +
      _lookupValueNameInInterface(
        aViewWrapper.dbView.viewType,
        Ci.nsMsgViewType
      ) +
      "   " +
      "View Flags: " +
      aViewWrapper.dbView.viewFlags +
      "\n"
  );
  dump(
    "  Sort Type: " +
      _lookupValueNameInInterface(
        aViewWrapper.dbView.sortType,
        Ci.nsMsgViewSortType
      ) +
      "   " +
      "Sort Order: " +
      _lookupValueNameInInterface(
        aViewWrapper.dbView.sortOrder,
        Ci.nsMsgViewSortOrder
      ) +
      "\n"
  );
  dump(aViewWrapper.search.prettyString());
}

var WHITESPACE = "                                              ";
var MSG_VIEW_FLAG_DUMMY = 0x20000000;

export function dump_view_contents(aViewWrapper) {
  const dbView = aViewWrapper.dbView;
  const treeView = aViewWrapper.dbView.QueryInterface(Ci.nsITreeView);
  const rowCount = treeView.rowCount;

  dump("********* Current View Contents\n");
  for (let iViewIndex = 0; iViewIndex < rowCount; iViewIndex++) {
    const level = treeView.getLevel(iViewIndex);
    const flags = dbView.getFlagsAt(iViewIndex);
    const msgHdr = dbView.getMsgHdrAt(iViewIndex);

    let s = WHITESPACE.substr(0, level * 2);
    if (treeView.isContainer(iViewIndex)) {
      s += treeView.isContainerOpen(iViewIndex) ? "- " : "+ ";
    } else {
      s += ". ";
    }
    // s += treeView.getCellText(iViewIndex, )
    if (flags & MSG_VIEW_FLAG_DUMMY) {
      s += "dummy: ";
    }
    s += dbView.cellTextForColumn(iViewIndex, "subject");
    s += " [" + msgHdr.folder.prettyName + "," + msgHdr.messageKey + "]";

    dump(s + "\n");
  }
  dump("********* end view contents\n");
}

function _lookupValueNameInInterface(aValue, aInterface) {
  for (const key in aInterface) {
    const value = aInterface[key];
    if (value == aValue) {
      return key;
    }
  }
  return "unknown: " + aValue;
}
