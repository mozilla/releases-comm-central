/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../editorUtilities.js */
/* import-globals-from EdAdvancedEdit.js */
/* import-globals-from EdDialogCommon.js */

function BuildJSEAttributeNameList() {
  gDialog.AddJSEAttributeNameList.removeAllItems();

  // Get events specific to current element
  var elementName = gElement.localName;
  if (elementName in gJSAttr) {
    var attNames = gJSAttr[elementName];
    var i;
    var popup;
    var sep;

    if (attNames && attNames.length) {
      // Since we don't allow user-editable JS events yet (but we will soon)
      //  simply remove the JS tab to not allow adding JS events
      if (attNames[0] == "noJSEvents") {
        var tab = document.getElementById("tabJSE");
        if (tab) {
          tab.remove();
        }

        return;
      }

      for (i = 0; i < attNames.length; i++) {
        gDialog.AddJSEAttributeNameList.appendItem(attNames[i], attNames[i]);
      }

      popup = gDialog.AddJSEAttributeNameList.firstElementChild;
      if (popup) {
        sep = document.createXULElement("menuseparator");
        if (sep) {
          popup.appendChild(sep);
        }
      }
    }
  }

  // Always add core JS events unless we aborted above
  for (i = 0; i < gCoreJSEvents.length; i++) {
    if (gCoreJSEvents[i] == "-") {
      if (!popup) {
        popup = gDialog.AddJSEAttributeNameList.firstElementChild;
      }

      sep = document.createXULElement("menuseparator");

      if (popup && sep) {
        popup.appendChild(sep);
      }
    } else {
      gDialog.AddJSEAttributeNameList.appendItem(
        gCoreJSEvents[i],
        gCoreJSEvents[i]
      );
    }
  }

  gDialog.AddJSEAttributeNameList.selectedIndex = 0;

  // Use current name and value of first tree item if it exists
  onSelectJSETreeItem();
}

// build attribute list in tree form from element attributes
function BuildJSEAttributeTable() {
  var nodeMap = gElement.attributes;
  if (nodeMap.length > 0) {
    var added = false;
    for (var i = 0; i < nodeMap.length; i++) {
      const name = nodeMap[i].nodeName.toLowerCase();
      if (CheckAttributeNameSimilarity(nodeMap[i].nodeName, JSEAttrs)) {
        // Repeated or non-JS handler, ignore this one and go to next.
        continue;
      }
      if (!name.startsWith("on")) {
        // Attribute isn't an event handler.
        continue;
      }
      var value = gElement.getAttribute(nodeMap[i].nodeName);
      if (AddTreeItem(name, value, "JSEAList", JSEAttrs)) {
        // add item to tree
        added = true;
      }
    }

    // Select first item
    if (added) {
      gDialog.AddJSEAttributeTree.selectedIndex = 0;
    }
  }
}

function onSelectJSEAttribute() {
  if (!gDoOnSelectTree) {
    return;
  }

  gDialog.AddJSEAttributeValueInput.value = GetAndSelectExistingAttributeValue(
    gDialog.AddJSEAttributeNameList.label,
    "JSEAList"
  );
}

function onSelectJSETreeItem() {
  var tree = gDialog.AddJSEAttributeTree;
  if (tree && tree.view.selection.count) {
    // Select attribute name in list
    gDialog.AddJSEAttributeNameList.value = GetTreeItemAttributeStr(
      getSelectedItem(tree)
    );

    // Set value input to that in tree (no need to update this in the tree)
    gUpdateTreeValue = false;
    gDialog.AddJSEAttributeValueInput.value = GetTreeItemValueStr(
      getSelectedItem(tree)
    );
    gUpdateTreeValue = true;
  }
}

function onInputJSEAttributeValue() {
  if (gUpdateTreeValue) {
    var name = TrimString(gDialog.AddJSEAttributeNameList.label);
    var value = TrimString(gDialog.AddJSEAttributeValueInput.value);

    // Update value in the tree list
    // Since we have a non-editable menulist,
    //   we MUST automatically add the event attribute if it doesn't exist
    if (!UpdateExistingAttribute(name, value, "JSEAList") && value) {
      AddTreeItem(name, value, "JSEAList", JSEAttrs);
    }
  }
}

function editJSEAttributeValue(targetCell) {
  if (IsNotTreeHeader(targetCell)) {
    gDialog.AddJSEAttributeValueInput.select();
  }
}

function UpdateJSEAttributes() {
  var JSEAList = document.getElementById("JSEAList");
  var i;

  // remove removed attributes
  for (i = 0; i < JSERAttrs.length; i++) {
    var name = JSERAttrs[i];

    if (gElement.hasAttribute(name)) {
      doRemoveAttribute(name);
    }
  }

  // Add events
  for (i = 0; i < JSEAList.children.length; i++) {
    var item = JSEAList.children[i];

    // set the event handler
    doSetAttribute(GetTreeItemAttributeStr(item), GetTreeItemValueStr(item));
  }
}

function RemoveJSEAttribute() {
  // This differs from HTML and CSS panels:
  // We reselect after removing, because there is not
  //  editable attribute name input, so we can't clear that
  //  like we do in other panels
  var newIndex = gDialog.AddJSEAttributeTree.selectedIndex;

  // We only allow 1 selected item
  if (gDialog.AddJSEAttributeTree.view.selection.count) {
    var item = getSelectedItem(gDialog.AddJSEAttributeTree);

    // Name is the text of the treecell
    var attr = GetTreeItemAttributeStr(item);

    // remove the item from the attribute array
    if (newIndex >= JSEAttrs.length - 1) {
      newIndex--;
    }

    // remove the item from the attribute array
    JSERAttrs[JSERAttrs.length] = attr;
    RemoveNameFromAttArray(attr, JSEAttrs);

    // Remove the item from the tree
    item.remove();

    // Reselect an item
    gDialog.AddJSEAttributeTree.selectedIndex = newIndex;
  }
}
