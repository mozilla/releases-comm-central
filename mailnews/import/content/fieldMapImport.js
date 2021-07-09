/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var importService;
var fieldMap = null;
var gRecordNum = 0;
var addInterface = null;
var dialogResult = null;
var gPreviousButton;
var gNextButton;
var gMoveUpButton;
var gMoveDownButton;
var gListbox;
var gSkipFirstRecordButton;

document.addEventListener("dialogaccept", FieldImportOKButton);

function OnLoadFieldMapImport() {
  top.importService = Cc["@mozilla.org/import/import-service;1"].getService(
    Ci.nsIImportService
  );

  // We need a field map object...
  // assume we have one passed in? or just make one?
  if (window.arguments && window.arguments[0]) {
    top.fieldMap = window.arguments[0].fieldMap;
    top.addInterface = window.arguments[0].addInterface;
    top.dialogResult = window.arguments[0].result;
  }
  if (top.fieldMap == null) {
    top.fieldMap = top.importService.CreateNewFieldMap();
    top.fieldMap.DefaultFieldMap(top.fieldMap.numMozFields);
  }

  gMoveUpButton = document.getElementById("upButton");
  gMoveDownButton = document.getElementById("downButton");
  gPreviousButton = document.getElementById("previous");
  gNextButton = document.getElementById("next");
  gListbox = document.getElementById("fieldList");
  gSkipFirstRecordButton = document.getElementById("skipFirstRecord");

  // Set the state of the skip first record button
  gSkipFirstRecordButton.checked = top.fieldMap.skipFirstRecord;

  ListFields();
  browseDataPreview(1);
  gListbox.selectedItem = gListbox.getItemAtIndex(0);
  disableMoveButtons();
}

function IndexInMap(index) {
  var count = top.fieldMap.mapSize;
  for (var i = 0; i < count; i++) {
    if (top.fieldMap.GetFieldMap(i) == index) {
      return true;
    }
  }

  return false;
}

function ListFields() {
  if (top.fieldMap == null) {
    return;
  }

  // Add rows for every mapped field.
  let count = top.fieldMap.mapSize;
  for (let i = 0; i < count; i++) {
    let index = top.fieldMap.GetFieldMap(i);
    if (index == -1) {
      continue;
    }
    AddFieldToList(
      top.fieldMap.GetFieldDescription(index),
      index,
      top.fieldMap.GetFieldActive(i)
    );
  }

  // Add rows every possible field we don't already have a row for.
  count = top.fieldMap.numMozFields;
  for (let i = 0; i < count; i++) {
    if (!IndexInMap(i)) {
      AddFieldToList(top.fieldMap.GetFieldDescription(i), i, false);
    }
  }

  // Add dummy rows if the data has more fields than Thunderbird does.
  let data = top.addInterface.GetData("sampleData-0");
  if (!(data instanceof Ci.nsISupportsString)) {
    return;
  }
  count = data.data.split("\n").length;
  for (let i = gListbox.itemCount; i < count; i++) {
    AddFieldToList(null, -1, false);
  }
}

function CreateField(name, index, on) {
  var item = document.createXULElement("richlistitem");
  item.setAttribute("align", "center");
  item.setAttribute("field-index", index);
  item.setAttribute("allowevents", "true");

  var checkboxCell = document.createXULElement("hbox");
  checkboxCell.setAttribute("style", "width: var(--column1width)");
  let checkbox = document.createXULElement("checkbox");
  if (!name) {
    checkbox.disabled = true;
  } else if (on) {
    checkbox.setAttribute("checked", "true");
  }
  checkboxCell.appendChild(checkbox);

  var firstCell = document.createXULElement("label");
  firstCell.setAttribute("style", "width: var(--column2width)");
  firstCell.setAttribute("value", name || "");

  var secondCell = document.createXULElement("label");
  secondCell.setAttribute("class", "importsampledata");
  secondCell.setAttribute("flex", "1");

  item.appendChild(checkboxCell);
  item.appendChild(firstCell);
  item.appendChild(secondCell);
  return item;
}

function AddFieldToList(name, index, on) {
  var item = CreateField(name, index, on);
  gListbox.appendChild(item);
}

// The "Move Up/Move Down" buttons should move the items in the left column
// up/down but the values in the right column should not change.
function moveItem(up) {
  var selectedItem = gListbox.selectedItem;
  var swapPartner = up
    ? gListbox.getPreviousItem(selectedItem, 1)
    : gListbox.getNextItem(selectedItem, 1);

  var tmpLabel = swapPartner.lastElementChild.getAttribute("value");
  swapPartner.lastElementChild.setAttribute(
    "value",
    selectedItem.lastElementChild.getAttribute("value")
  );
  selectedItem.lastElementChild.setAttribute("value", tmpLabel);

  var newItemPosition = up ? selectedItem.nextElementSibling : selectedItem;
  gListbox.insertBefore(swapPartner, newItemPosition);
  gListbox.ensureElementIsVisible(selectedItem);
  disableMoveButtons();
}

function disableMoveButtons() {
  var selectedIndex = gListbox.selectedIndex;
  gMoveUpButton.disabled = selectedIndex == 0;
  gMoveDownButton.disabled = selectedIndex == gListbox.getRowCount() - 1;
}

function ShowSampleData(data) {
  var fields = data.split("\n");
  for (var i = 0; i < gListbox.getRowCount(); i++) {
    gListbox
      .getItemAtIndex(i)
      .lastElementChild.setAttribute(
        "value",
        i < fields.length ? fields[i] : ""
      );
  }
}

function FetchSampleData(num) {
  if (!top.addInterface) {
    return false;
  }

  var data = top.addInterface.GetData("sampleData-" + num);
  if (!(data instanceof Ci.nsISupportsString)) {
    return false;
  }
  ShowSampleData(data.data);
  return true;
}

/**
 * Handle the command event of #next and #previous buttons.
 *
 * @param {Event} event - The command event of #next or #previous button.
 */
function nextPreviousOnCommand(event) {
  browseDataPreview(event.target.id == "next" ? 1 : -1);
}

/**
 * Browse the import data preview by moving to the next or previous record.
 * Also handle the disabled status of the #next and #previous buttons at the
 * first or last record.
 *
 * @param {integer} step - How many records to move forwards or backwards.
 *   Used by the #next and #previous buttons with step of 1 or -1.
 */
function browseDataPreview(step) {
  gRecordNum += step;
  if (FetchSampleData(gRecordNum - 1)) {
    document.l10n.setAttributes(
      document.getElementById("labelRecordNumber"),
      "import-ab-csv-preview-record-number",
      {
        recordNumber: gRecordNum,
      }
    );
  }

  gPreviousButton.disabled = gRecordNum == 1;
  gNextButton.disabled =
    addInterface.GetData("sampleData-" + gRecordNum) == null;
}

function FieldImportOKButton() {
  var max = gListbox.getRowCount();
  // Ensure field map is the right size
  top.fieldMap.SetFieldMapSize(max);

  for (let i = 0; i < max; i++) {
    let fIndex = gListbox.getItemAtIndex(i).getAttribute("field-index");
    let on = gListbox
      .getItemAtIndex(i)
      .querySelector("checkbox")
      .getAttribute("checked");
    top.fieldMap.SetFieldMap(i, fIndex);
    top.fieldMap.SetFieldActive(i, on == "true");
  }

  top.fieldMap.skipFirstRecord = gSkipFirstRecordButton.checked;

  top.dialogResult.ok = true;
}
