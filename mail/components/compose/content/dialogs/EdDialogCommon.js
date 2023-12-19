/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Each editor window must include this file

/* import-globals-from ../editorUtilities.js */
/* globals InitDialog, ChangeLinkLocation, ValidateData */

// Object to attach commonly-used widgets (all dialogs should use this)
var gDialog = {};

var gHaveDocumentUrl = false;
var gValidationError = false;

// Use for 'defaultIndex' param in InitPixelOrPercentMenulist
const gPixel = 0;
const gPercent = 1;

const gMaxPixels = 100000; // Used for image size, borders, spacing, and padding
// Gecko code uses 1000 for maximum rowspan, colspan
// Also, editing performance is really bad above this
const gMaxRows = 1000;
const gMaxColumns = 1000;
const gMaxTableSize = 1000000; // Width or height of table or cells

// A XUL element with id="location" for managing
// dialog location relative to parent window
var gLocation;

// The element being edited - so AdvancedEdit can have access to it
var globalElement;

/* Validate contents of an input field
 *
 *  inputWidget    The 'input' element for the the attribute's value
 *  listWidget     The 'menulist' XUL element for choosing "pixel" or "percent"
 *                  May be null when no pixel/percent is used.
 *  minVal         minimum allowed for input widget's value
 *  maxVal         maximum allowed for input widget's value
 *                 (when "listWidget" is used, maxVal is used for "pixel" maximum,
 *                  100% is assumed if "percent" is the user's choice)
 *  element        The DOM element that we set the attribute on. May be null.
 *  attName        Name of the attribute to set.  May be null or ignored if "element" is null
 *  mustHaveValue  If true, error dialog is displayed if "value" is empty string
 *
 *  This calls "ValidateNumberRange()", which puts up an error dialog to inform the user.
 *    If error, we also:
 *      Shift focus and select contents of the inputWidget,
 *      Switch to appropriate panel of tabbed dialog if user implements "SwitchToValidate()",
 *      and/or will expand the dialog to full size if "More / Fewer" feature is implemented
 *
 *  Returns the "value" as a string, or "" if error or input contents are empty
 *  The global "gValidationError" variable is set true if error was found
 */
function ValidateNumber(
  inputWidget,
  listWidget,
  minVal,
  maxVal,
  element,
  attName,
  mustHaveValue
) {
  if (!inputWidget) {
    gValidationError = true;
    return "";
  }

  // Global error return value
  gValidationError = false;
  var maxLimit = maxVal;
  var isPercent = false;

  var numString = TrimString(inputWidget.value);
  if (numString || mustHaveValue) {
    if (listWidget) {
      isPercent = listWidget.selectedIndex == 1;
    }
    if (isPercent) {
      maxLimit = 100;
    }

    // This method puts up the error message
    numString = ValidateNumberRange(numString, minVal, maxLimit, mustHaveValue);
    if (!numString) {
      // Switch to appropriate panel for error reporting
      SwitchToValidatePanel();

      // Error - shift to offending input widget
      SetTextboxFocus(inputWidget);
      gValidationError = true;
    } else {
      if (isPercent) {
        numString += "%";
      }
      if (element) {
        GetCurrentEditor().setAttributeOrEquivalent(
          element,
          attName,
          numString,
          true
        );
      }
    }
  } else if (element) {
    GetCurrentEditor().removeAttributeOrEquivalent(element, attName, true);
  }
  return numString;
}

/* Validate contents of an input field
 *
 *  value          number to validate
 *  minVal         minimum allowed for input widget's value
 *  maxVal         maximum allowed for input widget's value
 *                 (when "listWidget" is used, maxVal is used for "pixel" maximum,
 *                  100% is assumed if "percent" is the user's choice)
 *  mustHaveValue  If true, error dialog is displayed if "value" is empty string
 *
 *  If inputWidget's value is outside of range, or is empty when "mustHaveValue" = true,
 *      an error dialog is popuped up to inform the user. The focus is shifted
 *      to the inputWidget.
 *
 *  Returns the "value" as a string, or "" if error or input contents are empty
 *  The global "gValidationError" variable is set true if error was found
 */
function ValidateNumberRange(value, minValue, maxValue, mustHaveValue) {
  // Initialize global error flag
  gValidationError = false;
  value = TrimString(String(value));

  // We don't show error for empty string unless caller wants to
  if (!value && !mustHaveValue) {
    return "";
  }

  var numberStr = "";

  if (value.length > 0) {
    // Extract just numeric characters
    var number = Number(value.replace(/\D+/g, ""));
    if (number >= minValue && number <= maxValue) {
      // Return string version of the number
      return String(number);
    }
    numberStr = String(number);
  }

  var message = "";

  if (numberStr.length > 0) {
    // We have a number from user outside of allowed range
    message = GetString("ValidateRangeMsg");
    message = message.replace(/%n%/, numberStr);
    message += "\n ";
  }
  message += GetString("ValidateNumberMsg");

  // Replace variable placeholders in message with number values
  message = message.replace(/%min%/, minValue).replace(/%max%/, maxValue);
  ShowInputErrorMessage(message);

  // Return an empty string to indicate error
  gValidationError = true;
  return "";
}

function SetTextboxFocusById(id) {
  SetTextboxFocus(document.getElementById(id));
}

function SetTextboxFocus(input) {
  if (input) {
    input.focus();
  }
}

function ShowInputErrorMessage(message) {
  Services.prompt.alert(window, GetString("InputError"), message);
  window.focus();
}

// Get the text appropriate to parent container
//  to determine what a "%" value is referring to.
// elementForAtt is element we are actually setting attributes on
//  (a temporary copy of element in the doc to allow canceling),
//  but elementInDoc is needed to find parent context in document
function GetAppropriatePercentString(elementForAtt, elementInDoc) {
  var editor = GetCurrentEditor();
  try {
    var name = elementForAtt.nodeName.toLowerCase();
    if (name == "td" || name == "th") {
      return GetString("PercentOfTable");
    }

    // Check if element is within a table cell
    if (editor.getElementOrParentByTagName("td", elementInDoc)) {
      return GetString("PercentOfCell");
    }
    return GetString("PercentOfWindow");
  } catch (e) {
    return "";
  }
}

function ClearListbox(listbox) {
  if (listbox) {
    listbox.clearSelection();
    while (listbox.hasChildNodes()) {
      listbox.lastChild.remove();
    }
  }
}

function forceInteger(elementID) {
  var editField = document.getElementById(elementID);
  if (!editField) {
    return;
  }

  var stringIn = editField.value;
  if (stringIn && stringIn.length > 0) {
    // Strip out all nonnumeric characters
    stringIn = stringIn.replace(/\D+/g, "");
    if (!stringIn) {
      stringIn = "";
    }

    // Write back only if changed
    if (stringIn != editField.value) {
      editField.value = stringIn;
    }
  }
}

function InitPixelOrPercentMenulist(
  elementForAtt,
  elementInDoc,
  attribute,
  menulistID,
  defaultIndex
) {
  if (!defaultIndex) {
    defaultIndex = gPixel;
  }

  // var size  = elementForAtt.getAttribute(attribute);
  var size = GetHTMLOrCSSStyleValue(elementForAtt, attribute, attribute);
  var menulist = document.getElementById(menulistID);
  var pixelItem;
  var percentItem;

  if (!menulist) {
    dump("NO MENULIST found for ID=" + menulistID + "\n");
    return size;
  }

  menulist.removeAllItems();
  pixelItem = menulist.appendItem(GetString("Pixels"));

  if (!pixelItem) {
    return 0;
  }

  percentItem = menulist.appendItem(
    GetAppropriatePercentString(elementForAtt, elementInDoc)
  );
  if (size && size.length > 0) {
    // Search for a "%" or "px"
    if (size.includes("%")) {
      // Strip out the %
      size = size.substr(0, size.indexOf("%"));
      if (percentItem) {
        menulist.selectedItem = percentItem;
      }
    } else {
      if (size.includes("px")) {
        // Strip out the px
        size = size.substr(0, size.indexOf("px"));
      }
      menulist.selectedItem = pixelItem;
    }
  } else {
    menulist.selectedIndex = defaultIndex;
  }

  return size;
}

function onAdvancedEdit() {
  // First validate data from widgets in the "simpler" property dialog
  if (ValidateData()) {
    // Set true if OK is clicked in the Advanced Edit dialog
    window.AdvancedEditOK = false;
    // Open the AdvancedEdit dialog, passing in the element to be edited
    //  (the copy named "globalElement")
    window.openDialog(
      "chrome://messenger/content/messengercompose/EdAdvancedEdit.xhtml",
      "_blank",
      "chrome,close,titlebar,modal,resizable=yes",
      "",
      globalElement
    );
    window.focus();
    if (window.AdvancedEditOK) {
      // Copy edited attributes to the dialog widgets:
      InitDialog();
    }
  }
}

function getColor(ColorPickerID) {
  var colorPicker = document.getElementById(ColorPickerID);
  var color;
  if (colorPicker) {
    // Extract color from colorPicker and assign to colorWell.
    color = colorPicker.getAttribute("color");
    if (color && color == "") {
      return null;
    }
    // Clear color so next if it's called again before
    //  color picker is actually used, we dedect the "don't set color" state
    colorPicker.setAttribute("color", "");
  }

  return color;
}

function setColorWell(ColorWellID, color) {
  var colorWell = document.getElementById(ColorWellID);
  if (colorWell) {
    if (!color || color == "") {
      // Don't set color (use default)
      // Trigger change to not show color swatch
      colorWell.setAttribute("default", "true");
      // Style in CSS sets "background-color",
      //   but color won't clear unless we do this:
      colorWell.removeAttribute("style");
    } else {
      colorWell.removeAttribute("default");
      // Use setAttribute so colorwell can be a XUL element, such as button
      colorWell.setAttribute("style", "background-color:" + color);
    }
  }
}

function SwitchToValidatePanel() {
  // no default implementation
  // Only EdTableProps.js currently implements this
}

/**
 * @returns {Promise} URL spec of the file chosen, or null
 */
function GetLocalFileURL(filterType) {
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  var fileType = "html";

  if (filterType == "img") {
    fp.init(window, GetString("SelectImageFile"), Ci.nsIFilePicker.modeOpen);
    fp.appendFilters(Ci.nsIFilePicker.filterImages);
    fileType = "image";
  } else if (filterType.startsWith("html")) {
    // Current usage of this is in Link dialog,
    //  where we always want HTML first
    fp.init(window, GetString("OpenHTMLFile"), Ci.nsIFilePicker.modeOpen);

    // When loading into Composer, direct user to prefer HTML files and text files,
    //   so we call separately to control the order of the filter list
    fp.appendFilters(Ci.nsIFilePicker.filterHTML);
    fp.appendFilters(Ci.nsIFilePicker.filterText);

    // Link dialog also allows linking to images
    if (filterType.includes("img", 1)) {
      fp.appendFilters(Ci.nsIFilePicker.filterImages);
    }
  }
  // Default or last filter is "All Files"
  fp.appendFilters(Ci.nsIFilePicker.filterAll);

  // set the file picker's current directory to last-opened location saved in prefs
  SetFilePickerDirectory(fp, fileType);

  return new Promise(resolve => {
    fp.open(rv => {
      if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
        resolve(null);
        return;
      }
      SaveFilePickerDirectory(fp, fileType);
      resolve(fp.fileURL.spec);
    });
  });
}

function SetWindowLocation() {
  gLocation = document.getElementById("location");
  if (gLocation) {
    const screenX = Math.max(
      0,
      Math.min(
        window.opener.screenX + Number(gLocation.getAttribute("offsetX")),
        screen.availWidth - window.outerWidth
      )
    );
    const screenY = Math.max(
      0,
      Math.min(
        window.opener.screenY + Number(gLocation.getAttribute("offsetY")),
        screen.availHeight - window.outerHeight
      )
    );
    window.moveTo(screenX, screenY);
  }
}

function SaveWindowLocation() {
  if (gLocation) {
    gLocation.setAttribute("offsetX", window.screenX - window.opener.screenX);
    gLocation.setAttribute("offsetY", window.screenY - window.opener.screenY);
  }
}

function onCancel() {
  SaveWindowLocation();
}

var IsBlockParent = [
  "applet",
  "blockquote",
  "body",
  "center",
  "dd",
  "div",
  "form",
  "li",
  "noscript",
  "object",
  "td",
  "th",
];

var NotAnInlineParent = [
  "col",
  "colgroup",
  "dl",
  "dir",
  "menu",
  "ol",
  "table",
  "tbody",
  "tfoot",
  "thead",
  "tr",
  "ul",
];

function FillLinkMenulist(linkMenulist, headingsArray) {
  var editor = GetCurrentEditor();
  try {
    var treeWalker = editor.document.createTreeWalker(
      editor.document,
      1,
      null,
      true
    );
    var headingList = [];
    var anchorList = []; // for sorting
    var anchorMap = {}; // for weeding out duplicates and making heading anchors unique
    var anchor;
    var i;
    for (
      var element = treeWalker.nextNode();
      element;
      element = treeWalker.nextNode()
    ) {
      // grab headings
      // Skip headings that already have a named anchor as their first child
      //  (this may miss nearby anchors, but at least we don't insert another
      //   under the same heading)
      if (
        HTMLHeadingElement.isInstance(element) &&
        element.textContent &&
        !(
          HTMLAnchorElement.isInstance(element.firstChild) &&
          element.firstChild.name
        )
      ) {
        headingList.push(element);
      }

      // grab named anchors
      if (HTMLAnchorElement.isInstance(element) && element.name) {
        anchor = "#" + element.name;
        if (!(anchor in anchorMap)) {
          anchorList.push({ anchor, sortkey: anchor.toLowerCase() });
          anchorMap[anchor] = true;
        }
      }

      // grab IDs
      if (element.id) {
        anchor = "#" + element.id;
        if (!(anchor in anchorMap)) {
          anchorList.push({ anchor, sortkey: anchor.toLowerCase() });
          anchorMap[anchor] = true;
        }
      }
    }
    // add anchor for headings
    for (i = 0; i < headingList.length; i++) {
      var heading = headingList[i];

      // Use just first 40 characters, don't add "...",
      //  and replace whitespace with "_" and strip non-word characters
      anchor =
        "#" +
        ConvertToCDATAString(
          TruncateStringAtWordEnd(heading.textContent, 40, false)
        );

      // Append "_" to any name already in the list
      while (anchor in anchorMap) {
        anchor += "_";
      }
      anchorList.push({ anchor, sortkey: anchor.toLowerCase() });
      anchorMap[anchor] = true;

      // Save nodes in an array so we can create anchor node under it later
      headingsArray[anchor] = heading;
    }
    const menuItems = [];
    if (anchorList.length) {
      // case insensitive sort
      anchorList.sort((a, b) => {
        if (a.sortkey < b.sortkey) {
          return -1;
        }
        if (a.sortkey > b.sortkey) {
          return 1;
        }
        return 0;
      });
      for (i = 0; i < anchorList.length; i++) {
        menuItems.push(createMenuItem(anchorList[i].anchor));
      }
    } else {
      // Don't bother with named anchors in Mail.
      if (editor && editor.flags & Ci.nsIEditor.eEditorMailMask) {
        linkMenulist.removeAttribute("enablehistory");
        return;
      }
      const item = createMenuItem(GetString("NoNamedAnchorsOrHeadings"));
      item.setAttribute("disabled", "true");
      menuItems.push(item);
    }
    window.addEventListener("contextmenu", event => {
      if (document.getElementById("datalist-menuseparator")) {
        return;
      }
      const menuseparator = document.createXULElement("menuseparator");
      menuseparator.setAttribute("id", "datalist-menuseparator");
      document.getElementById("textbox-contextmenu").appendChild(menuseparator);
      for (const menuitem of menuItems) {
        document.getElementById("textbox-contextmenu").appendChild(menuitem);
      }
    });
  } catch (e) {}
}

function createMenuItem(label) {
  var menuitem = document.createXULElement("menuitem");
  menuitem.setAttribute("label", label);
  menuitem.addEventListener("click", event => {
    gDialog.hrefInput.value = label;
    ChangeLinkLocation();
  });
  return menuitem;
}

// Shared by Image and Link dialogs for the "Choose" button for links
function chooseLinkFile() {
  GetLocalFileURL("html, img").then(fileURL => {
    gDialog.hrefInput.value = fileURL;

    // Do stuff specific to a particular dialog
    // (This is defined separately in Image and Link dialogs)
    ChangeLinkLocation();
  });
}
