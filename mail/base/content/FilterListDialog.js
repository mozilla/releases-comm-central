/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PluralForm } = ChromeUtils.importESModule(
  "resource:///modules/PluralForm.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

window.addEventListener("load", onLoad);
window.addEventListener("unload", onFilterUnload);
window.addEventListener("close", event => {
  if (!onFilterClose()) {
    event.preventDefault();
  }
});

var gFilterListMsgWindow = null;
var gCurrentFilterList;
var gServerMenu = null;
var gFilterListbox = null;
var gEditButton = null;
var gDeleteButton = null;
var gCopyToNewButton = null;
var gTopButton = null;
var gUpButton = null;
var gDownButton = null;
var gBottomButton = null;
var gSearchBox = null;
var gRunFiltersFolder = null;
var gRunFiltersButton = null;

var gFilterBundle = null;

var msgMoveMotion = {
  Up: 0,
  Down: 1,
  Top: 2,
  Bottom: 3,
};

var gStatusFeedback = {
  progressMeterVisible: false,

  showStatusString(status) {
    document.getElementById("statusText").setAttribute("value", status);
  },
  startMeteors() {
    // change run button to be a stop button
    gRunFiltersButton.setAttribute(
      "label",
      gRunFiltersButton.getAttribute("stoplabel")
    );
    gRunFiltersButton.setAttribute(
      "accesskey",
      gRunFiltersButton.getAttribute("stopaccesskey")
    );

    if (!this.progressMeterVisible) {
      document
        .getElementById("statusbar-progresspanel")
        .removeAttribute("collapsed");
      this.progressMeterVisible = true;
    }

    document.getElementById("statusbar-icon").removeAttribute("value");
  },
  stopMeteors() {
    try {
      // change run button to be a stop button
      gRunFiltersButton.setAttribute(
        "label",
        gRunFiltersButton.getAttribute("runlabel")
      );
      gRunFiltersButton.setAttribute(
        "accesskey",
        gRunFiltersButton.getAttribute("runaccesskey")
      );

      if (this.progressMeterVisible) {
        document.getElementById("statusbar-progresspanel").collapsed = true;
        this.progressMeterVisible = true;
      }
    } catch (ex) {
      // can get here if closing window when running filters
    }
  },
  showProgress(percentage) {},
  closeWindow() {},
};

var filterEditorQuitObserver = {
  observe(aSubject, aTopic, aData) {
    // Check whether or not we want to veto the quit request (unless another
    // observer already did.
    if (
      aTopic == "quit-application-requested" &&
      aSubject instanceof Ci.nsISupportsPRBool &&
      !aSubject.data
    ) {
      aSubject.data = !onFilterClose();
    }
  },
};

function onLoad() {
  gFilterListMsgWindow = Cc[
    "@mozilla.org/messenger/msgwindow;1"
  ].createInstance(Ci.nsIMsgWindow);
  gFilterListMsgWindow.domWindow = window;
  gFilterListMsgWindow.statusFeedback = gStatusFeedback;

  gServerMenu = document.getElementById("serverMenu");
  gFilterListbox = document.getElementById("filterList");
  gEditButton = document.getElementById("editButton");
  gDeleteButton = document.getElementById("deleteButton");
  gCopyToNewButton = document.getElementById("copyToNewButton");
  gTopButton = document.getElementById("reorderTopButton");
  gUpButton = document.getElementById("reorderUpButton");
  gDownButton = document.getElementById("reorderDownButton");
  gBottomButton = document.getElementById("reorderBottomButton");
  gSearchBox = document.getElementById("searchBox");
  gRunFiltersFolder = document.getElementById("runFiltersFolder");
  gRunFiltersButton = document.getElementById("runFiltersButton");
  gFilterBundle = document.getElementById("bundle_filter");

  updateButtons();

  initNewToolbarButtons(document.querySelector("#newButton toolbarbutton"));
  initNewToolbarButtons(document.querySelector("#newButton dropmarker"));
  document
    .getElementById("filterActionButtons")
    .addEventListener("keypress", event => onFilterActionButtonKeyPress(event));

  processWindowArguments(window.arguments[0]);

  // Don't change width after initial layout, so buttons stay within the dialog.
  gRunFiltersFolder.style.maxWidth =
    gRunFiltersFolder.getBoundingClientRect().width + "px";

  Services.obs.addObserver(
    filterEditorQuitObserver,
    "quit-application-requested"
  );
}
/**
 * Set up the toolbarbutton to have an index and an EvenListener for proper
 * keyboard navigation.
 *
 * @param {XULElement} newToolbarbutton - The toolbarbutton that needs to be
 *   initialized.
 */
function initNewToolbarButtons(newToolbarbutton) {
  newToolbarbutton.setAttribute("tabindex", "0");
  newToolbarbutton.setAttribute(
    "id",
    newToolbarbutton.parentNode.id + newToolbarbutton.tagName
  );
}

/**
 * Processes arguments sent to this dialog when opened or refreshed.
 *
 * @param aArguments  An object having members representing the arguments.
 *                    { arg1: value1, arg2: value2, ... }
 */
function processWindowArguments(aArguments) {
  // If a specific folder was requested, try to select it
  // if we don't already show its server.
  if (
    !gServerMenu._folder ||
    ("folder" in aArguments &&
      aArguments.folder != gServerMenu._folder &&
      aArguments.folder.rootFolder != gServerMenu._folder)
  ) {
    let wantedFolder;
    if ("folder" in aArguments) {
      wantedFolder = aArguments.folder;
    }

    // Get the folder where filters should be defined, if that server
    // can accept filters.
    let firstItem = getFilterFolderForSelection(wantedFolder);

    // If the selected server cannot have filters, get the default server
    // If the default server cannot have filters, check all accounts
    // and get a server that can have filters.
    if (!firstItem) {
      firstItem = getServerThatCanHaveFilters().rootFolder;
    }

    if (firstItem) {
      setFilterFolder(firstItem);
    }

    if (wantedFolder) {
      setRunFolder(wantedFolder);
    }
  } else {
    // If we didn't change folder still redraw the list
    // to show potential new filters if we were called for refresh.
    rebuildFilterList();
  }

  // If a specific filter was requested, try to select it.
  if ("filter" in aArguments) {
    selectFilter(aArguments.filter);
  }
}

/**
 * This is called from OpenOrFocusWindow() if the dialog is already open.
 * New filters could have been created by operations outside the dialog.
 *
 * @param aArguments  An object of arguments having the same format
 *                    as window.arguments[0].
 */
function refresh(aArguments) {
  // As we really don't know what has changed, clear the search box
  // undonditionally so that the changed/added filters are surely visible.
  resetSearchBox();

  processWindowArguments(aArguments);
}

function CanRunFiltersAfterTheFact(aServer) {
  // filter after the fact is implement using search
  // so if you can't search, you can't filter after the fact
  return aServer.canSearchMessages;
}

/**
 * Change the root server for which we are managing filters.
 *
 * @param msgFolder The nsIMsgFolder server containing filters
 *                  (or a folder for NNTP server).
 */
function setFilterFolder(msgFolder) {
  if (!msgFolder || msgFolder == gServerMenu._folder) {
    return;
  }

  // Save the current filters to disk before switching because
  // the dialog may be closed and we'll lose current filters.
  if (gCurrentFilterList) {
    gCurrentFilterList.saveToDefaultFile();
  }

  // Setting this attribute should go away in bug 473009.
  gServerMenu._folder = msgFolder;
  // Calling this should go away in bug 802609.
  gServerMenu.menupopup.selectFolder(msgFolder);

  // Calling getEditableFilterList will detect any errors in msgFilterRules.dat,
  // backup the file, and alert the user.
  gCurrentFilterList = msgFolder.getEditableFilterList(gFilterListMsgWindow);
  rebuildFilterList();

  // Select the first item in the list, if there is one.
  if (gFilterListbox.itemCount > 0) {
    gFilterListbox.selectItem(gFilterListbox.getItemAtIndex(0));
  }

  // This will get the deferred to account root folder, if server is deferred.
  // We intentionally do this after setting the current server, as we want
  // that to refer to the rootFolder for the actual server, not the
  // deferred-to server, as current server is really a proxy for the
  // server whose filters we are editing. But below here we are managing
  // where the filters will get applied, which is on the deferred-to server.
  msgFolder = msgFolder.server.rootMsgFolder;

  // root the folder picker to this server
  const runMenu = gRunFiltersFolder.menupopup;
  runMenu._teardown();
  runMenu._parentFolder = msgFolder;
  runMenu._ensureInitialized();

  const canFilterAfterTheFact = CanRunFiltersAfterTheFact(msgFolder.server);
  gRunFiltersFolder.disabled = !canFilterAfterTheFact;
  gRunFiltersButton.disabled = !canFilterAfterTheFact;
  document.getElementById("folderPickerPrefix").disabled =
    !canFilterAfterTheFact;

  if (canFilterAfterTheFact) {
    let wantedFolder = null;
    // For a given server folder, get the default run target folder or show
    // "Choose Folder".
    if (!msgFolder.isServer) {
      wantedFolder = msgFolder;
    } else {
      try {
        switch (msgFolder.server.type) {
          case "nntp":
            // For NNTP select the subscribed newsgroup.
            wantedFolder = gServerMenu._folder;
            break;
          case "rss":
            // Show "Choose Folder" for feeds.
            wantedFolder = null;
            break;
          case "imap":
          case "pop3":
          case "none":
            // Find Inbox for IMAP and POP or Local Folders,
            // show "Choose Folder" if not found.
            wantedFolder = msgFolder.rootFolder.getFolderWithFlags(
              Ci.nsMsgFolderFlags.Inbox
            );
            break;
          default:
            // For other account types we don't know what's good to select,
            // so show "Choose Folder".
            wantedFolder = null;
        }
      } catch (e) {
        console.error(
          "Failed to select a suitable folder to run filters on: " + e
        );
        wantedFolder = null;
      }
    }

    // Select a useful first folder for the server.
    setRunFolder(wantedFolder);
  }
}

/**
 * Select a folder on which filters are to be run.
 *
 * @param aFolder     nsIMsgFolder folder to select.
 */
function setRunFolder(aFolder) {
  // Setting this attribute should go away in bug 473009.
  gRunFiltersFolder._folder = aFolder;
  // Calling this should go away in bug 802609.
  gRunFiltersFolder.menupopup.selectFolder(gRunFiltersFolder._folder);
  updateButtons();
}

/**
 * Toggle enabled state of a filter, in both the filter properties and the UI.
 *
 * @param aFilterItem  an item (row) of the filter list to be toggled
 */
function toggleFilter(aFilterItem, aSetForEvent) {
  const filter = aFilterItem._filter;
  if (filter.unparseable && !filter.enabled) {
    Services.prompt.alert(
      window,
      null,
      gFilterBundle.getFormattedString("cannotEnableIncompatFilter", [
        document.getElementById("bundle_brand").getString("brandShortName"),
      ])
    );
    return;
  }
  filter.enabled = aSetForEvent === undefined ? !filter.enabled : aSetForEvent;

  // Now update the checkbox
  if (aSetForEvent === undefined) {
    aFilterItem.firstElementChild.nextElementSibling.checked = filter.enabled;
  }
  // For accessibility set the checked state on listitem
  aFilterItem.setAttribute("aria-checked", filter.enabled);
}

/**
 * Selects a specific filter in the filter list.
 * The listbox view is scrolled to the corresponding item.
 *
 * @param aFilter  The nsIMsgFilter to select.
 *
 * @returns true/false indicating whether the filter was found and selected.
 */
function selectFilter(aFilter) {
  if (currentFilter() == aFilter) {
    return true;
  }

  resetSearchBox(aFilter);

  const filterCount = gCurrentFilterList.filterCount;
  for (let i = 0; i < filterCount; i++) {
    if (gCurrentFilterList.getFilterAt(i) == aFilter) {
      gFilterListbox.ensureIndexIsVisible(i);
      gFilterListbox.selectedIndex = i;
      return true;
    }
  }
  return false;
}

/**
 * Returns the currently selected filter. If multiple filters are selected,
 * returns the first one. If none are selected, returns null.
 */
function currentFilter() {
  const currentItem = gFilterListbox.selectedItem;
  return currentItem ? currentItem._filter : null;
}

function onEditFilter() {
  if (gEditButton.disabled) {
    return;
  }

  const selectedFilter = currentFilter();
  if (!selectedFilter) {
    return;
  }

  const args = { filter: selectedFilter, filterList: gCurrentFilterList };

  window.openDialog(
    "chrome://messenger/content/FilterEditor.xhtml",
    "FilterEditor",
    "chrome,modal,titlebar,resizable,centerscreen",
    args
  );

  if ("refresh" in args && args.refresh) {
    // reset search if edit was okay (name change might lead to hidden entry!)
    resetSearchBox(selectedFilter);
    rebuildFilterList();
  }
}

/**
 * Handler function for the 'New...' buttons.
 * Opens the filter dialog for creating a new filter.
 */
function onNewFilter() {
  calculatePositionAndShowCreateFilterDialog({});
}

/**
 * Handler function for the 'Copy...' button.
 * Opens the filter dialog for copying the selected filter.
 */
function onCopyToNewFilter() {
  if (gCopyToNewButton.disabled) {
    return;
  }

  const selectedFilter = currentFilter();
  if (!selectedFilter) {
    return;
  }

  const args = { copiedFilter: selectedFilter };

  calculatePositionAndShowCreateFilterDialog(args);
}

/**
 * Calculates the position for inserting the new filter,
 * and then displays the create dialog.
 *
 * @param args  The object containing the arguments for the dialog,
 *              passed to the filterEditorOnLoad() function.
 *              It will be augmented with the insertion position
 *              and global filters list properties by this function.
 */
function calculatePositionAndShowCreateFilterDialog(args) {
  const selectedFilter = currentFilter();
  // If no filter is selected use the first position.
  let position = 0;
  if (selectedFilter) {
    // Get the position in the unfiltered list.
    // - this is where the new filter should be inserted!
    const filterCount = gCurrentFilterList.filterCount;
    for (let i = 0; i < filterCount; i++) {
      if (gCurrentFilterList.getFilterAt(i) == selectedFilter) {
        position = i;
        break;
      }
    }
  }
  args.filterPosition = position;

  args.filterList = gCurrentFilterList;

  window.openDialog(
    "chrome://messenger/content/FilterEditor.xhtml",
    "FilterEditor",
    "chrome,modal,titlebar,resizable,centerscreen",
    args
  );

  if ("refresh" in args && args.refresh) {
    // On success: reset the search box if necessary!
    resetSearchBox(args.newFilter);
    rebuildFilterList();

    // Select the new filter, it is at the position of previous selection.
    gFilterListbox.selectItem(gFilterListbox.getItemAtIndex(position));
    if (currentFilter() != args.newFilter) {
      console.error("Filter created at an unexpected position!");
    }
  }
}

/**
 * Delete selected filters.
 *  'Selected' is not to be confused with active (checkbox checked)
 */
function onDeleteFilter() {
  if (gDeleteButton.disabled) {
    return;
  }

  const items = gFilterListbox.selectedItems;
  if (!items.length) {
    return;
  }

  const checkValue = { value: false };
  if (
    Services.prefs.getBoolPref("mailnews.filters.confirm_delete") &&
    Services.prompt.confirmEx(
      window,
      null,
      gFilterBundle.getString("deleteFilterConfirmation"),
      Services.prompt.STD_YES_NO_BUTTONS,
      "",
      "",
      "",
      gFilterBundle.getString("dontWarnAboutDeleteCheckbox"),
      checkValue
    )
  ) {
    return;
  }

  if (checkValue.value) {
    Services.prefs.setBoolPref("mailnews.filters.confirm_delete", false);
  }

  // Save filter position before the first selected one.
  let newSelectionIndex = gFilterListbox.selectedIndex - 1;

  // Must reverse the loop, as the items list shrinks when we delete.
  for (let index = items.length - 1; index >= 0; --index) {
    const item = items[index];
    gCurrentFilterList.removeFilter(item._filter);
    item.remove();
  }
  updateCountBox();

  // Select filter above previously selected if one existed, otherwise the first one.
  if (newSelectionIndex == -1 && gFilterListbox.itemCount > 0) {
    newSelectionIndex = 0;
  }
  if (newSelectionIndex > -1) {
    gFilterListbox.selectedIndex = newSelectionIndex;
    updateViewPosition(-1);
  }
}

/**
 * Move filter one step up in visible list.
 */
function onUp(event) {
  moveFilter(msgMoveMotion.Up);
}

/**
 * Move filter one step down in visible list.
 */
function onDown(event) {
  moveFilter(msgMoveMotion.Down);
}

/**
 * Move filter to bottom for long filter lists.
 */
function onTop(evt) {
  moveFilter(msgMoveMotion.Top);
}

/**
 * Move filter to top for long filter lists.
 */
function onBottom(evt) {
  moveFilter(msgMoveMotion.Bottom);
}

/**
 * Moves a singular selected filter up or down either 1 increment or to the
 * top/bottom. This acts on the visible filter list only which means that:
 *
 * - when moving up or down "1" the filter may skip one or more other
 *   filters (which are currently not visible) - this will also lead
 *   to the "related" filters (e.g search filters containing 'moz')
 *   being grouped more closely together
 * - moveTop / moveBottom
 *   this is currently moving to the top/bottom of the absolute list
 *   but it would be better if it moved "just as far as necessary"
 *   which would further "compact" related filters
 *
 * @param motion
 *   msgMoveMotion.Up, msgMoveMotion.Down, msgMoveMotion.Top, msgMoveMotion.Bottom
 */
function moveFilter(motion) {
  // At the moment, do not allow moving groups of filters.
  const selectedFilter = currentFilter();
  if (!selectedFilter) {
    return;
  }

  var relativeStep = 0;
  var moveFilterNative = null;

  switch (motion) {
    case msgMoveMotion.Top:
      if (selectedFilter) {
        gCurrentFilterList.removeFilter(selectedFilter);
        gCurrentFilterList.insertFilterAt(0, selectedFilter);
        rebuildFilterList();
      }
      return;
    case msgMoveMotion.Bottom:
      if (selectedFilter) {
        gCurrentFilterList.removeFilter(selectedFilter);
        gCurrentFilterList.insertFilterAt(
          gCurrentFilterList.filterCount,
          selectedFilter
        );
        rebuildFilterList();
      }
      return;
    case msgMoveMotion.Up:
      relativeStep = -1;
      moveFilterNative = Ci.nsMsgFilterMotion.up;
      break;
    case msgMoveMotion.Down:
      relativeStep = +1;
      moveFilterNative = Ci.nsMsgFilterMotion.down;
      break;
  }

  if (!gSearchBox.value) {
    // use legacy move filter code: up, down; only if searchBox is empty
    moveCurrentFilter(moveFilterNative);
    return;
  }

  const nextIndex = gFilterListbox.selectedIndex + relativeStep;
  const nextFilter = gFilterListbox.getItemAtIndex(nextIndex)._filter;

  gCurrentFilterList.removeFilter(selectedFilter);

  // Find the index of the filter we want to insert at.
  let newIndex = -1;
  const filterCount = gCurrentFilterList.filterCount;
  for (let i = 0; i < filterCount; i++) {
    if (gCurrentFilterList.getFilterAt(i) == nextFilter) {
      newIndex = i;
      break;
    }
  }

  if (motion == msgMoveMotion.Down) {
    newIndex += relativeStep;
  }

  gCurrentFilterList.insertFilterAt(newIndex, selectedFilter);

  rebuildFilterList();
}

function viewLog() {
  var args = { filterList: gCurrentFilterList };

  window.openDialog(
    "chrome://messenger/content/viewLog.xhtml",
    "FilterLog",
    "chrome,modal,titlebar,resizable,centerscreen",
    args
  );
}

function onFilterUnload() {
  gCurrentFilterList.saveToDefaultFile();
  Services.obs.removeObserver(
    filterEditorQuitObserver,
    "quit-application-requested"
  );

  gFilterListMsgWindow.closeWindow();
}

function onFilterClose() {
  if (
    gRunFiltersButton.getAttribute("label") ==
    gRunFiltersButton.getAttribute("stoplabel")
  ) {
    const promptTitle = gFilterBundle.getString("promptTitle");
    const promptMsg = gFilterBundle.getString("promptMsg");
    const stopButtonLabel = gFilterBundle.getString("stopButtonLabel");
    const continueButtonLabel = gFilterBundle.getString("continueButtonLabel");

    const result = Services.prompt.confirmEx(
      window,
      promptTitle,
      promptMsg,
      Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1,
      continueButtonLabel,
      stopButtonLabel,
      null,
      null,
      { value: 0 }
    );

    if (result) {
      gFilterListMsgWindow.StopUrls();
    } else {
      return false;
    }
  }

  return true;
}

function runSelectedFilters() {
  // if run button has "stop" label, do stop.
  if (
    gRunFiltersButton.getAttribute("label") ==
    gRunFiltersButton.getAttribute("stoplabel")
  ) {
    gFilterListMsgWindow.StopUrls();
    return;
  }

  const folder =
    gRunFiltersFolder._folder || gRunFiltersFolder.selectedItem._folder;
  if (!folder) {
    return;
  }

  const filterList = MailServices.filters.getTempFilterList(folder);

  // make sure the tmp filter list uses the real filter list log stream
  filterList.loggingEnabled = gCurrentFilterList.loggingEnabled;
  filterList.logStream = gCurrentFilterList.logStream;

  let index = 0;
  for (const item of gFilterListbox.selectedItems) {
    filterList.insertFilterAt(index++, item._filter);
  }

  MailServices.filters.applyFiltersToFolders(
    filterList,
    [folder],
    gFilterListMsgWindow
  );
}

function moveCurrentFilter(motion) {
  const filter = currentFilter();
  if (!filter) {
    return;
  }

  gCurrentFilterList.moveFilter(filter, motion);
  rebuildFilterList();
}

/**
 * Redraws the list of filters. Takes the search box value into account.
 *
 * This function should perform very fast even in case of high number of filters.
 * Therefore there are some optimizations (e.g. listelement.itemChildren[] instead of
 * list.getItemAtIndex()), that favour speed vs. semantical perfection.
 */
function rebuildFilterList() {
  // Get filters that match the search box.
  const aTempFilterList = onFindFilter();

  let searchBoxFocus = false;
  let activeElement = document.activeElement;

  // Find if the currently focused element is a child inside the search box
  // (probably html:input). Traverse up the parents until the first element
  // with an ID is found. If it is not searchBox, return false.
  while (activeElement != null) {
    if (activeElement == gSearchBox) {
      searchBoxFocus = true;
      break;
    } else if (activeElement.id) {
      searchBoxFocus = false;
      break;
    }
    activeElement = activeElement.parentNode;
  }

  // Make a note of which filters were previously selected
  const selectedNames = [];
  for (let i = 0; i < gFilterListbox.selectedItems.length; i++) {
    selectedNames.push(gFilterListbox.selectedItems[i]._filter.filterName);
  }

  // Save scroll position so we can try to restore it later.
  // Doesn't work when the list is rebuilt after search box condition changed.
  const firstVisibleRowIndex = gFilterListbox.getIndexOfFirstVisibleRow();

  // listbox.xml seems to cache the value of the first selected item in a
  // range at _selectionStart. The old value though is now obsolete,
  // since we will recreate all of the elements. We need to clear this,
  // and one way to do this is with a call to clearSelection. This might be
  // ugly from an accessibility perspective, since it fires an onSelect event.
  gFilterListbox.clearSelection();

  let listitem, nameCell, enabledCell, filter;
  const filterCount = gCurrentFilterList.filterCount;
  const listitemCount = gFilterListbox.itemCount;
  let listitemIndex = 0;
  const tempFilterListLength = aTempFilterList ? aTempFilterList.length - 1 : 0;
  for (let i = 0; i < filterCount; i++) {
    if (aTempFilterList && listitemIndex > tempFilterListLength) {
      break;
    }

    filter = gCurrentFilterList.getFilterAt(i);
    if (aTempFilterList && aTempFilterList[listitemIndex] != i) {
      continue;
    }

    if (listitemCount > listitemIndex) {
      // If there is a free existing listitem, reuse it.
      // Use .itemChildren[] instead of .getItemAtIndex() as it is much faster.
      listitem = gFilterListbox.itemChildren[listitemIndex];
      nameCell = listitem.firstElementChild;
      enabledCell = nameCell.nextElementSibling;
    } else {
      // If there are not enough listitems in the list, create a new one.
      listitem = document.createXULElement("richlistitem");
      listitem.setAttribute("align", "center");
      listitem.setAttribute("role", "checkbox");
      nameCell = document.createXULElement("label");
      nameCell.setAttribute("flex", "1");
      nameCell.setAttribute("crop", "end");
      enabledCell = document.createXULElement("checkbox");
      enabledCell.setAttribute("style", "padding-inline-start: 25px;");
      enabledCell.addEventListener("CheckboxStateChange", onFilterClick, true);
      listitem.appendChild(nameCell);
      listitem.appendChild(enabledCell);
      gFilterListbox.appendChild(listitem);
      // We have to attach this listener to the listitem, even though we only care
      // about clicks on the enabledCell. However, attaching to that item doesn't
      // result in any events actually getting received.
      listitem.addEventListener("dblclick", onFilterDoubleClick, true);
    }
    // For accessibility set the label on listitem.
    listitem.setAttribute("label", filter.filterName);
    // Set the listitem values to represent the current filter.
    nameCell.setAttribute("value", filter.filterName);
    if (filter.enabled) {
      enabledCell.setAttribute("checked", "true");
    } else {
      enabledCell.removeAttribute("checked");
    }
    listitem.setAttribute("aria-checked", filter.enabled);
    listitem._filter = filter;

    if (selectedNames.includes(filter.filterName)) {
      gFilterListbox.addItemToSelection(listitem);
    }

    listitemIndex++;
  }
  // Remove any superfluous listitems, if the number of filters shrunk.
  for (let i = listitemCount - 1; i >= listitemIndex; i--) {
    gFilterListbox.lastChild.remove();
  }

  updateViewPosition(firstVisibleRowIndex);
  updateCountBox();

  // If before rebuilding the list the searchbox was focused, focus it again.
  // In any other case, focus the list.
  if (searchBoxFocus) {
    gSearchBox.focus();
  } else {
    gFilterListbox.focus();
  }
}

function updateViewPosition(firstVisibleRowIndex) {
  if (firstVisibleRowIndex == -1) {
    firstVisibleRowIndex = gFilterListbox.getIndexOfFirstVisibleRow();
  }

  // Restore to the extent possible the scroll position.
  if (firstVisibleRowIndex && gFilterListbox.itemCount) {
    gFilterListbox.ensureElementIsVisible(
      gFilterListbox.getItemAtIndex(
        Math.min(firstVisibleRowIndex, gFilterListbox.itemCount - 1)
      ),
      true
    );
  }

  if (gFilterListbox.selectedCount) {
    // Make sure that at least the first selected item is visible.
    gFilterListbox.ensureElementIsVisible(gFilterListbox.selectedItems[0]);

    // The current item should be the first selected item, so that keyboard
    // selection extension can work.
    gFilterListbox.currentItem = gFilterListbox.selectedItems[0];
  }

  updateButtons();
}

/**
 * Try to only enable buttons that make sense
 *  - moving filters is currently only enabled for single selection
 *    also movement is restricted by searchBox and current selection position
 *  - edit only for single filters
 *  - delete / run only for one or more selected filters
 */
function updateButtons() {
  var numFiltersSelected = gFilterListbox.selectedItems.length;
  var oneFilterSelected = numFiltersSelected == 1;

  // "edit" is disabled when not exactly one filter is selected
  // or if we couldn't parse that filter
  let disabled = !oneFilterSelected || currentFilter().unparseable;
  gEditButton.disabled = disabled;

  // "copy" is the same as "edit"
  gCopyToNewButton.disabled = disabled;

  // "delete" only disabled when no filters are selected
  gDeleteButton.disabled = !numFiltersSelected;

  // we can run multiple filters on a folder
  // so only disable this UI if no filters are selected
  document.getElementById("folderPickerPrefix").disabled = !numFiltersSelected;
  gRunFiltersFolder.disabled = !numFiltersSelected;
  gRunFiltersButton.disabled =
    !numFiltersSelected || !gRunFiltersFolder._folder;
  // "up" and "top" enabled only if one filter is selected, and it's not the first
  // don't use gFilterListbox.currentIndex here, it's buggy when we've just changed the
  // children in the list (via rebuildFilterList)
  disabled = !(
    oneFilterSelected &&
    gFilterListbox.getSelectedItem(0) != gFilterListbox.getItemAtIndex(0)
  );
  gUpButton.disabled = disabled;
  gTopButton.disabled = disabled;

  // "down" and "bottom" enabled only if one filter is selected,
  // and it's not the last one
  disabled = !(
    oneFilterSelected &&
    gFilterListbox.selectedIndex < gFilterListbox.itemCount - 1
  );
  gDownButton.disabled = disabled;
  gBottomButton.disabled = disabled;
}

/**
 * Given a selected folder, returns the folder where filters should
 *  be defined (the root folder except for news) if the server can
 *  accept filters.
 *
 * @param   nsIMsgFolder aFolder - selected folder, from window args
 * @returns an nsIMsgFolder where the filter is defined
 */
function getFilterFolderForSelection(aFolder) {
  const rootFolder =
    aFolder && aFolder.server ? aFolder.server.rootFolder : null;
  if (rootFolder && rootFolder.isServer && rootFolder.server.canHaveFilters) {
    return aFolder.server.type == "nntp" ? aFolder : rootFolder;
  }

  return null;
}

/**
 * If the selected server cannot have filters, get the default server.
 * If the default server cannot have filters, check all accounts
 * and get a server that can have filters.
 *
 * @returns an nsIMsgIncomingServer
 */
function getServerThatCanHaveFilters() {
  const defaultAccount = MailServices.accounts.defaultAccount;
  if (defaultAccount) {
    const defaultIncomingServer = defaultAccount.incomingServer;
    // Check to see if default server can have filters.
    if (defaultIncomingServer.canHaveFilters) {
      return defaultIncomingServer;
    }
  }

  // If it cannot, check all accounts to find a server
  // that can have filters.
  return MailServices.accounts.allServers.find(server => server.canHaveFilters);
}

function onFilterClick(event) {
  // This is called after the clicked checkbox changed state
  // so this.checked is the right state we want to toggle to.
  toggleFilter(this.parentNode, this.checked);
}

function onFilterDoubleClick(event) {
  // we only care about button 0 (left click) events
  if (event.button != 0) {
    return;
  }

  onEditFilter();
}

/**
 * Handles the keypress event on the filter list dialog.
 *
 * @param {Event} event - The keypress DOMEvent.
 */
function onFilterActionButtonKeyPress(event) {
  if (
    event.key == "Enter" ||
    (event.key == " " && event.target.hasAttribute("type"))
  ) {
    event.preventDefault();

    if (
      event.target.classList.contains("toolbarbutton-menubutton-dropmarker")
    ) {
      document
        .getElementById("newFilterMenupopup")
        .openPopup(event.target.parentNode, "after_end", {
          triggerEvent: event,
        });
      return;
    }
    event.target.click();
  }
}

function onFilterListKeyPress(aEvent) {
  if (aEvent.keyCode) {
    switch (aEvent.keyCode) {
      case KeyEvent.DOM_VK_INSERT:
        if (!document.getElementById("newButton").disabled) {
          onNewFilter();
        }
        break;
      case KeyEvent.DOM_VK_DELETE:
        if (!document.getElementById("deleteButton").disabled) {
          onDeleteFilter();
        }
        break;
      case KeyEvent.DOM_VK_RETURN:
        if (!document.getElementById("editButton").disabled) {
          onEditFilter();
        }
        break;
    }
  } else if (!aEvent.ctrlKey && !aEvent.altKey && !aEvent.metaKey) {
    switch (aEvent.charCode) {
      case KeyEvent.DOM_VK_SPACE:
        for (const item of gFilterListbox.selectedItems) {
          toggleFilter(item);
        }
        break;
      default:
        gSearchBox.focus();
        gSearchBox.value = String.fromCharCode(aEvent.charCode);
    }
  }
}

/**
 * Decides if the given filter matches the given keyword.
 *
 * @param  aFilter   nsIMsgFilter to check
 * @param  aKeyword  the string to find in the filter name
 *
 * @returns True if the filter name contains the searched keyword.
            Otherwise false. In the future this may be extended to match
            other filter attributes.
 */
function filterSearchMatch(aFilter, aKeyword) {
  return aFilter.filterName.toLocaleLowerCase().includes(aKeyword);
}

/**
 * Called from rebuildFilterList when the list needs to be redrawn.
 *
 * @returns Uses the search term in search box, to produce an array of
 *          row (filter) numbers (indexes) that match the search term.
 */
function onFindFilter() {
  const keyWord = gSearchBox.value.toLocaleLowerCase();

  // If searchbox is empty, just return and let rebuildFilterList
  // create an unfiltered list.
  if (!keyWord) {
    return null;
  }

  // Rematch everything in the list, remove what doesn't match the search box.
  const rows = gCurrentFilterList.filterCount;
  const matchingFilterList = [];
  // Use the full gCurrentFilterList, not the filterList listbox,
  // which may already be filtered.
  for (let i = 0; i < rows; i++) {
    if (filterSearchMatch(gCurrentFilterList.getFilterAt(i), keyWord)) {
      matchingFilterList.push(i);
    }
  }

  return matchingFilterList;
}

/**
 * Clear the search term in the search box if needed.
 *
 * @param aFilter  If this nsIMsgFilter matches the search term,
 *                 do not reset the box. If this is null,
 *                 reset unconditionally.
 */
function resetSearchBox(aFilter) {
  const keyword = gSearchBox.value.toLocaleLowerCase();
  if (keyword && (!aFilter || !filterSearchMatch(aFilter, keyword))) {
    gSearchBox.reset();
  }
}

/**
 * Display "1 item",  "11 items" or "4 of 10" if list is filtered via search box.
 */
function updateCountBox() {
  const countBox = document.getElementById("countBox");
  const sum = gCurrentFilterList.filterCount;
  const len = gFilterListbox.itemCount;

  if (len == sum) {
    // "N items"
    countBox.value = PluralForm.get(
      len,
      gFilterBundle.getString("filterCountItems")
    ).replace("#1", len);
    return;
  }

  // "N of M"
  countBox.value = gFilterBundle.getFormattedString(
    "filterCountVisibleOfTotal",
    [len, sum]
  );
}
