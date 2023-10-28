/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gToolboxDocument = null;
var gToolbox = null;
var gCurrentDragOverItem = null;
var gToolboxChanged = false;
var gToolboxSheet = false;
var gPaletteBox = null;

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

function onLoad() {
  if ("arguments" in window && window.arguments[0]) {
    InitWithToolbox(window.arguments[0]);
    repositionDialog(window);
  } else if (window.frameElement && "toolbox" in window.frameElement) {
    gToolboxSheet = true;
    InitWithToolbox(window.frameElement.toolbox);
    repositionDialog(window.frameElement.panel);
  }
}

function InitWithToolbox(aToolbox) {
  gToolbox = aToolbox;
  dispatchCustomizationEvent("beforecustomization");
  gToolboxDocument = gToolbox.ownerDocument;
  gToolbox.customizing = true;
  forEachCustomizableToolbar(function (toolbar) {
    toolbar.setAttribute("customizing", "true");
  });
  gPaletteBox = document.getElementById("palette-box");

  var elts = getRootElements();
  for (let i = 0; i < elts.length; i++) {
    elts[i].addEventListener("dragstart", onToolbarDragStart, true);
    elts[i].addEventListener("dragover", onToolbarDragOver, true);
    elts[i].addEventListener("dragleave", onToolbarDragLeave, true);
    elts[i].addEventListener("drop", onToolbarDrop, true);
  }

  initDialog();
}

function onClose() {
  if (!gToolboxSheet) {
    window.close();
  } else {
    finishToolbarCustomization();
  }
}

function onUnload() {
  if (!gToolboxSheet) {
    finishToolbarCustomization();
  }
}

function finishToolbarCustomization() {
  removeToolboxListeners();
  unwrapToolbarItems();
  persistCurrentSets();
  gToolbox.customizing = false;
  forEachCustomizableToolbar(function (toolbar) {
    toolbar.removeAttribute("customizing");
  });

  notifyParentComplete();
}

function initDialog() {
  var mode = gToolbox.getAttribute("mode");
  document.getElementById("modelist").value = mode;
  var smallIconsCheckbox = document.getElementById("smallicons");
  smallIconsCheckbox.checked = gToolbox.getAttribute("iconsize") == "small";
  if (mode == "text") {
    smallIconsCheckbox.disabled = true;
  }

  if (AppConstants.MOZ_APP_NAME == "thunderbird") {
    document.getElementById("showTitlebar").checked =
      !Services.prefs.getBoolPref("mail.tabs.drawInTitlebar");
    if (
      window.opener &&
      window.opener.document.documentElement.getAttribute("windowtype") ==
        "mail:3pane"
    ) {
      document.getElementById("titlebarSettings").hidden = false;
    }
  }

  // Build up the palette of other items.
  buildPalette();

  // Wrap all the items on the toolbar in toolbarpaletteitems.
  wrapToolbarItems();
}

function repositionDialog(aWindow) {
  // Position the dialog touching the bottom of the toolbox and centered with
  // it.
  if (!aWindow) {
    return;
  }

  var width;
  if (aWindow != window) {
    width = aWindow.getBoundingClientRect().width;
  } else if (document.documentElement.hasAttribute("width")) {
    width = document.documentElement.getAttribute("width");
  } else {
    width = parseInt(document.documentElement.style.width);
  }
  var boundingRect = gToolbox.getBoundingClientRect();
  var screenX = gToolbox.screenX + (boundingRect.width - width) / 2;
  var screenY = gToolbox.screenY + boundingRect.height;

  aWindow.moveTo(screenX, screenY);
}

function removeToolboxListeners() {
  var elts = getRootElements();
  for (let i = 0; i < elts.length; i++) {
    elts[i].removeEventListener("dragstart", onToolbarDragStart, true);
    elts[i].removeEventListener("dragover", onToolbarDragOver, true);
    elts[i].removeEventListener("dragleave", onToolbarDragLeave, true);
    elts[i].removeEventListener("drop", onToolbarDrop, true);
  }
}

/**
 * Invoke a callback on the toolbox to notify it that the dialog is done
 * and going away.
 */
function notifyParentComplete() {
  if ("customizeDone" in gToolbox) {
    gToolbox.customizeDone(gToolboxChanged);
  }
  dispatchCustomizationEvent("aftercustomization");
}

function toolboxChanged(aType) {
  gToolboxChanged = true;
  if ("customizeChange" in gToolbox) {
    gToolbox.customizeChange(aType);
  }
  dispatchCustomizationEvent("customizationchange");
}

function dispatchCustomizationEvent(aEventName) {
  var evt = document.createEvent("Events");
  evt.initEvent(aEventName, true, true);
  gToolbox.dispatchEvent(evt);
}

/**
 * Persist the current set of buttons in all customizable toolbars to
 * localstore.
 */
function persistCurrentSets() {
  if (!gToolboxChanged || gToolboxDocument.defaultView.closed) {
    return;
  }

  forEachCustomizableToolbar(function (toolbar) {
    // Calculate currentset and store it in the attribute.
    var currentSet = toolbar.currentSet;
    toolbar.setAttribute("currentset", currentSet);
    Services.xulStore.persist(toolbar, "currentset");
  });
}

/**
 * Wraps all items in all customizable toolbars in a toolbox.
 */
function wrapToolbarItems() {
  forEachCustomizableToolbar(function (toolbar) {
    for (const item of toolbar.children) {
      if (AppConstants.platform == "macosx") {
        if (
          item.firstElementChild &&
          item.firstElementChild.localName == "menubar"
        ) {
          return;
        }
      }
      if (isToolbarItem(item)) {
        const wrapper = wrapToolbarItem(item);
        cleanupItemForToolbar(item, wrapper);
      }
    }
  });
}

function getRootElements() {
  if (window.frameElement && "externalToolbars" in window.frameElement) {
    return [gToolbox].concat(window.frameElement.externalToolbars);
  }
  if ("arguments" in window && window.arguments[1].length > 0) {
    return [gToolbox].concat(window.arguments[1]);
  }
  return [gToolbox];
}

/**
 * Unwraps all items in all customizable toolbars in a toolbox.
 */
function unwrapToolbarItems() {
  const elts = getRootElements();
  for (let i = 0; i < elts.length; i++) {
    const paletteItems = elts[i].getElementsByTagName("toolbarpaletteitem");
    let paletteItem;
    while ((paletteItem = paletteItems.item(0)) != null) {
      const toolbarItem = paletteItem.firstElementChild;
      restoreItemForToolbar(toolbarItem, paletteItem);
      paletteItem.parentNode.replaceChild(toolbarItem, paletteItem);
    }
  }
}

/**
 * Creates a wrapper that can be used to contain a toolbaritem and prevent
 * it from receiving UI events.
 */
function createWrapper(aId, aDocument) {
  const wrapper = aDocument.createXULElement("toolbarpaletteitem");

  wrapper.id = "wrapper-" + aId;
  return wrapper;
}

/**
 * Wraps an item that has been cloned from a template and adds
 * it to the end of the palette.
 */
function wrapPaletteItem(aPaletteItem) {
  var wrapper = createWrapper(aPaletteItem.id, document);

  wrapper.appendChild(aPaletteItem);

  // XXX We need to call this AFTER the palette item has been appended
  // to the wrapper or else we crash dropping certain buttons on the
  // palette due to removal of the command and disabled attributes - JRH
  cleanUpItemForPalette(aPaletteItem, wrapper);

  gPaletteBox.appendChild(wrapper);
}

/**
 * Wraps an item that is currently on a toolbar and replaces the item
 * with the wrapper. This is not used when dropping items from the palette,
 * only when first starting the dialog and wrapping everything on the toolbars.
 */
function wrapToolbarItem(aToolbarItem) {
  var wrapper = createWrapper(aToolbarItem.id, gToolboxDocument);

  wrapper.flex = aToolbarItem.flex;

  aToolbarItem.parentNode.replaceChild(wrapper, aToolbarItem);

  wrapper.appendChild(aToolbarItem);

  return wrapper;
}

/**
 * Get the list of ids for the current set of items on each toolbar.
 */
function getCurrentItemIds() {
  var currentItems = {};
  forEachCustomizableToolbar(function (toolbar) {
    var child = toolbar.firstElementChild;
    while (child) {
      if (isToolbarItem(child)) {
        currentItems[child.id] = 1;
      }
      child = child.nextElementSibling;
    }
  });
  return currentItems;
}

/**
 * Builds the palette of draggable items that are not yet in a toolbar.
 */
function buildPalette() {
  // Empty the palette first.
  while (gPaletteBox.lastElementChild) {
    gPaletteBox.lastChild.remove();
  }

  // Add the toolbar separator item.
  var templateNode = document.createXULElement("toolbarseparator");
  templateNode.id = "separator";
  wrapPaletteItem(templateNode);

  // Add the toolbar spring item.
  templateNode = document.createXULElement("toolbarspring");
  templateNode.id = "spring";
  templateNode.flex = 1;
  wrapPaletteItem(templateNode);

  // Add the toolbar spacer item.
  templateNode = document.createXULElement("toolbarspacer");
  templateNode.id = "spacer";
  templateNode.flex = 1;
  wrapPaletteItem(templateNode);

  var currentItems = getCurrentItemIds();
  templateNode = gToolbox.palette.firstElementChild;
  while (templateNode) {
    // Check if the item is already in a toolbar before adding it to the
    // palette, but do not add back separators, springs and spacers - we do
    // not want them duplicated.
    if (!isSpecialItem(templateNode) && !(templateNode.id in currentItems)) {
      var paletteItem = document.importNode(templateNode, true);
      wrapPaletteItem(paletteItem);
    }

    templateNode = templateNode.nextElementSibling;
  }
}

/**
 * Makes sure that an item that has been cloned from a template
 * is stripped of any attributes that may adversely affect its
 * appearance in the palette.
 */
function cleanUpItemForPalette(aItem, aWrapper) {
  aWrapper.setAttribute("place", "palette");
  setWrapperType(aItem, aWrapper);

  if (aItem.hasAttribute("title")) {
    aWrapper.setAttribute("title", aItem.getAttribute("title"));
  } else if (aItem.hasAttribute("label")) {
    aWrapper.setAttribute("title", aItem.getAttribute("label"));
  } else if (isSpecialItem(aItem)) {
    var stringBundle = document.getElementById("stringBundle");
    // Remove the common "toolbar" prefix to generate the string name.
    var title = stringBundle.getString(aItem.localName.slice(7) + "Title");
    aWrapper.setAttribute("title", title);
  }
  aWrapper.setAttribute("tooltiptext", aWrapper.getAttribute("title"));

  // Remove attributes that screw up our appearance.
  aItem.removeAttribute("command");
  aItem.removeAttribute("observes");
  aItem.removeAttribute("type");
  aItem.removeAttribute("width");
  aItem.removeAttribute("checked");
  aItem.removeAttribute("collapsed");

  aWrapper.querySelectorAll("[disabled]").forEach(function (aNode) {
    aNode.removeAttribute("disabled");
  });
}

/**
 * Makes sure that an item that has been cloned from a template
 * is stripped of all properties that may adversely affect its
 * appearance in the toolbar.  Store critical properties on the
 * wrapper so they can be put back on the item when we're done.
 */
function cleanupItemForToolbar(aItem, aWrapper) {
  setWrapperType(aItem, aWrapper);
  aWrapper.setAttribute("place", "toolbar");

  if (aItem.hasAttribute("command")) {
    aWrapper.setAttribute("itemcommand", aItem.getAttribute("command"));
    aItem.removeAttribute("command");
  }

  if (aItem.hasAttribute("collapsed")) {
    aWrapper.setAttribute("itemcollapsed", aItem.getAttribute("collapsed"));
    aItem.removeAttribute("collapsed");
  }

  if (aItem.checked) {
    aWrapper.setAttribute("itemchecked", "true");
    aItem.checked = false;
  }

  if (aItem.disabled) {
    aWrapper.setAttribute("itemdisabled", "true");
    aItem.disabled = false;
  }
}

/**
 * Restore all the properties that we stripped off above.
 */
function restoreItemForToolbar(aItem, aWrapper) {
  if (aWrapper.hasAttribute("itemdisabled")) {
    aItem.disabled = true;
  }

  if (aWrapper.hasAttribute("itemchecked")) {
    aItem.checked = true;
  }

  if (aWrapper.hasAttribute("itemcollapsed")) {
    const collapsed = aWrapper.getAttribute("itemcollapsed");
    aItem.setAttribute("collapsed", collapsed);
  }

  if (aWrapper.hasAttribute("itemcommand")) {
    const commandID = aWrapper.getAttribute("itemcommand");
    aItem.setAttribute("command", commandID);

    // XXX Bug 309953 - toolbarbuttons aren't in sync with their commands after customizing
    const command = gToolboxDocument.getElementById(commandID);
    if (command && command.hasAttribute("disabled")) {
      aItem.setAttribute("disabled", command.getAttribute("disabled"));
    }
  }
}

function setWrapperType(aItem, aWrapper) {
  if (aItem.localName == "toolbarseparator") {
    aWrapper.setAttribute("type", "separator");
  } else if (aItem.localName == "toolbarspring") {
    aWrapper.setAttribute("type", "spring");
  } else if (aItem.localName == "toolbarspacer") {
    aWrapper.setAttribute("type", "spacer");
  } else if (aItem.localName == "toolbaritem" && aItem.firstElementChild) {
    aWrapper.setAttribute("type", aItem.firstElementChild.localName);
  }
}

function setDragActive(aItem, aValue) {
  var node = aItem;
  var direction = window.getComputedStyle(aItem).direction;
  var value = direction == "ltr" ? "left" : "right";
  if (aItem.localName == "toolbar") {
    node = aItem.lastElementChild;
    value = direction == "ltr" ? "right" : "left";
  }

  if (!node) {
    return;
  }

  if (aValue) {
    if (!node.hasAttribute("dragover")) {
      node.setAttribute("dragover", value);
    }
  } else {
    node.removeAttribute("dragover");
  }
}

/**
 * Restore the default set of buttons to fixed toolbars,
 * remove all custom toolbars, and rebuild the palette.
 */
function restoreDefaultSet() {
  // Unwrap the items on the toolbar.
  unwrapToolbarItems();

  // Remove all of the customized toolbars.
  var child = gToolbox.lastElementChild;
  while (child) {
    if (child.hasAttribute("customindex")) {
      var thisChild = child;
      child = child.previousElementSibling;
      thisChild.currentSet = "__empty";
      gToolbox.removeChild(thisChild);
    } else {
      child = child.previousElementSibling;
    }
  }

  // Restore the defaultset for fixed toolbars.
  forEachCustomizableToolbar(function (toolbar) {
    var defaultSet = toolbar.getAttribute("defaultset");
    if (defaultSet) {
      toolbar.currentSet = defaultSet;
    }
  });

  // Restore the default icon size and mode.
  document.getElementById("smallicons").checked = updateIconSize() == "small";
  document.getElementById("modelist").value = updateToolbarMode();

  // Now rebuild the palette.
  buildPalette();

  // Now re-wrap the items on the toolbar.
  wrapToolbarItems();

  toolboxChanged("reset");
}

function updateIconSize(aSize) {
  return updateToolboxProperty("iconsize", aSize, "large");
}

function updateTitlebar() {
  const titlebarCheckbox = document.getElementById("showTitlebar");
  Services.prefs.setBoolPref(
    "mail.tabs.drawInTitlebar",
    !titlebarCheckbox.checked
  );

  // Bring the customizeToolbar window to front (on linux it's behind the main
  // window). Otherwise the customization window gets left in the background.
  setTimeout(() => window.focus(), 100);
}

function updateToolbarMode(aModeValue) {
  var mode = updateToolboxProperty("mode", aModeValue, "icons");

  var iconSizeCheckbox = document.getElementById("smallicons");
  iconSizeCheckbox.disabled = mode == "text";

  return mode;
}

function updateToolboxProperty(aProp, aValue, aToolkitDefault) {
  var toolboxDefault =
    gToolbox.getAttribute("default" + aProp) || aToolkitDefault;

  gToolbox.setAttribute(aProp, aValue || toolboxDefault);
  Services.xulStore.persist(gToolbox, aProp);

  forEachCustomizableToolbar(function (toolbar) {
    var toolbarDefault =
      toolbar.getAttribute("default" + aProp) || toolboxDefault;
    if (
      toolbar.getAttribute("lock" + aProp) == "true" &&
      toolbar.getAttribute(aProp) == toolbarDefault
    ) {
      return;
    }

    toolbar.setAttribute(aProp, aValue || toolbarDefault);
    Services.xulStore.persist(toolbar, aProp);
  });

  toolboxChanged(aProp);

  return aValue || toolboxDefault;
}

function forEachCustomizableToolbar(callback) {
  if (window.frameElement && "externalToolbars" in window.frameElement) {
    Array.from(window.frameElement.externalToolbars)
      .filter(isCustomizableToolbar)
      .forEach(callback);
  } else if ("arguments" in window && window.arguments[1].length > 0) {
    Array.from(window.arguments[1])
      .filter(isCustomizableToolbar)
      .forEach(callback);
  }
  Array.from(gToolbox.children).filter(isCustomizableToolbar).forEach(callback);
}

function isCustomizableToolbar(aElt) {
  return (
    aElt.localName == "toolbar" && aElt.getAttribute("customizable") == "true"
  );
}

function isSpecialItem(aElt) {
  return (
    aElt.localName == "toolbarseparator" ||
    aElt.localName == "toolbarspring" ||
    aElt.localName == "toolbarspacer"
  );
}

function isToolbarItem(aElt) {
  return (
    aElt.localName == "toolbarbutton" ||
    aElt.localName == "toolbaritem" ||
    aElt.localName == "toolbarseparator" ||
    aElt.localName == "toolbarspring" ||
    aElt.localName == "toolbarspacer"
  );
}

// Drag and Drop observers

function onToolbarDragLeave(aEvent) {
  if (isUnwantedDragEvent(aEvent)) {
    return;
  }

  if (gCurrentDragOverItem) {
    setDragActive(gCurrentDragOverItem, false);
  }
}

function onToolbarDragStart(aEvent) {
  var item = aEvent.target;
  while (item && item.localName != "toolbarpaletteitem") {
    if (item.localName == "toolbar") {
      return;
    }
    item = item.parentNode;
  }

  item.setAttribute("dragactive", "true");

  var dt = aEvent.dataTransfer;
  var documentId = gToolboxDocument.documentElement.id;
  dt.setData("text/toolbarwrapper-id/" + documentId, item.firstElementChild.id);
  dt.effectAllowed = "move";
}

function onToolbarDragOver(aEvent) {
  if (isUnwantedDragEvent(aEvent)) {
    return;
  }

  var documentId = gToolboxDocument.documentElement.id;
  if (
    !aEvent.dataTransfer.types.includes(
      "text/toolbarwrapper-id/" + documentId.toLowerCase()
    )
  ) {
    return;
  }

  var toolbar = aEvent.target;
  var dropTarget = aEvent.target;
  while (toolbar && toolbar.localName != "toolbar") {
    dropTarget = toolbar;
    toolbar = toolbar.parentNode;
  }

  // Make sure we are dragging over a customizable toolbar.
  if (!toolbar || !isCustomizableToolbar(toolbar)) {
    gCurrentDragOverItem = null;
    return;
  }

  var previousDragItem = gCurrentDragOverItem;

  if (dropTarget.localName == "toolbar") {
    gCurrentDragOverItem = dropTarget;
  } else {
    gCurrentDragOverItem = null;

    var direction = window.getComputedStyle(dropTarget.parentNode).direction;
    var boundingRect = dropTarget.getBoundingClientRect();
    var dropTargetCenter = boundingRect.x + boundingRect.width / 2;
    var dragAfter;
    if (direction == "ltr") {
      dragAfter = aEvent.clientX > dropTargetCenter;
    } else {
      dragAfter = aEvent.clientX < dropTargetCenter;
    }

    if (dragAfter) {
      gCurrentDragOverItem = dropTarget.nextElementSibling;
      if (!gCurrentDragOverItem) {
        gCurrentDragOverItem = toolbar;
      }
    } else {
      gCurrentDragOverItem = dropTarget;
    }
  }

  if (previousDragItem && gCurrentDragOverItem != previousDragItem) {
    setDragActive(previousDragItem, false);
  }

  setDragActive(gCurrentDragOverItem, true);

  aEvent.preventDefault();
  aEvent.stopPropagation();
}

function onToolbarDrop(aEvent) {
  if (isUnwantedDragEvent(aEvent)) {
    return;
  }

  if (!gCurrentDragOverItem) {
    return;
  }

  setDragActive(gCurrentDragOverItem, false);

  var documentId = gToolboxDocument.documentElement.id;
  var draggedItemId = aEvent.dataTransfer.getData(
    "text/toolbarwrapper-id/" + documentId
  );
  if (gCurrentDragOverItem.id == draggedItemId) {
    return;
  }

  var toolbar = aEvent.target;
  while (toolbar.localName != "toolbar") {
    toolbar = toolbar.parentNode;
  }

  var draggedPaletteWrapper = document.getElementById(
    "wrapper-" + draggedItemId
  );
  if (!draggedPaletteWrapper) {
    // The wrapper has been dragged from the toolbar.
    // Get the wrapper from the toolbar document and make sure that
    // it isn't being dropped on itself.
    const wrapper = gToolboxDocument.getElementById("wrapper-" + draggedItemId);
    if (wrapper == gCurrentDragOverItem) {
      return;
    }

    // Don't allow non-removable kids (e.g., the menubar) to move.
    if (wrapper.firstElementChild.getAttribute("removable") != "true") {
      return;
    }

    // Remove the item from its place in the toolbar.
    wrapper.remove();

    // Determine which toolbar we are dropping on.
    var dropToolbar = null;
    if (gCurrentDragOverItem.localName == "toolbar") {
      dropToolbar = gCurrentDragOverItem;
    } else {
      dropToolbar = gCurrentDragOverItem.parentNode;
    }

    // Insert the item into the toolbar.
    if (gCurrentDragOverItem != dropToolbar) {
      dropToolbar.insertBefore(wrapper, gCurrentDragOverItem);
    } else {
      dropToolbar.appendChild(wrapper);
    }
  } else {
    // The item has been dragged from the palette

    // Create a new wrapper for the item. We don't know the id yet.
    const wrapper = createWrapper("", gToolboxDocument);

    // Ask the toolbar to clone the item's template, place it inside the wrapper, and insert it in the toolbar.
    var newItem = toolbar.insertItem(
      draggedItemId,
      gCurrentDragOverItem == toolbar ? null : gCurrentDragOverItem,
      wrapper
    );

    // Prepare the item and wrapper to look good on the toolbar.
    cleanupItemForToolbar(newItem, wrapper);
    wrapper.id = "wrapper-" + newItem.id;
    wrapper.flex = newItem.flex;

    // Remove the wrapper from the palette.
    if (
      draggedItemId != "separator" &&
      draggedItemId != "spring" &&
      draggedItemId != "spacer"
    ) {
      gPaletteBox.removeChild(draggedPaletteWrapper);
    }
  }

  gCurrentDragOverItem = null;

  toolboxChanged();
}

function onPaletteDragOver(aEvent) {
  if (isUnwantedDragEvent(aEvent)) {
    return;
  }
  var documentId = gToolboxDocument.documentElement.id;
  if (
    aEvent.dataTransfer.types.includes(
      "text/toolbarwrapper-id/" + documentId.toLowerCase()
    )
  ) {
    aEvent.preventDefault();
  }
}

function onPaletteDrop(aEvent) {
  if (isUnwantedDragEvent(aEvent)) {
    return;
  }
  var documentId = gToolboxDocument.documentElement.id;
  var itemId = aEvent.dataTransfer.getData(
    "text/toolbarwrapper-id/" + documentId
  );

  var wrapper = gToolboxDocument.getElementById("wrapper-" + itemId);
  if (wrapper) {
    // Don't allow non-removable kids (e.g., the menubar) to move.
    if (wrapper.firstElementChild.getAttribute("removable") != "true") {
      return;
    }

    var wrapperType = wrapper.getAttribute("type");
    if (
      wrapperType != "separator" &&
      wrapperType != "spacer" &&
      wrapperType != "spring"
    ) {
      restoreItemForToolbar(wrapper.firstElementChild, wrapper);
      wrapPaletteItem(document.importNode(wrapper.firstElementChild, true));
      gToolbox.palette.appendChild(wrapper.firstElementChild);
    }

    // The item was dragged out of the toolbar.
    wrapper.remove();
  }

  toolboxChanged();
}

function isUnwantedDragEvent(aEvent) {
  try {
    if (
      Services.prefs.getBoolPref("toolkit.customization.unsafe_drag_events")
    ) {
      return false;
    }
  } catch (ex) {}

  // Discard drag events that originated from a separate window to
  // prevent content->chrome privilege escalations.
  const mozSourceNode = aEvent.dataTransfer.mozSourceNode;
  // mozSourceNode is null in the dragStart event handler or if
  // the drag event originated in an external application.
  if (!mozSourceNode) {
    return true;
  }
  const sourceWindow = mozSourceNode.ownerGlobal;
  return sourceWindow != window && sourceWindow != gToolboxDocument.defaultView;
}
