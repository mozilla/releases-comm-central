/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from editor.js */

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

// Each editor window must include this file
// Variables  shared by all dialogs:

var gStringBundle;
var gFilePickerDirectory;

/** *********** Message dialogs */

// Optional: Caller may supply text to substitute for "Ok" and/or "Cancel"
function ConfirmWithTitle(title, message, okButtonText, cancelButtonText) {
  const okFlag = okButtonText
    ? Services.prompt.BUTTON_TITLE_IS_STRING
    : Services.prompt.BUTTON_TITLE_OK;
  const cancelFlag = cancelButtonText
    ? Services.prompt.BUTTON_TITLE_IS_STRING
    : Services.prompt.BUTTON_TITLE_CANCEL;

  return (
    Services.prompt.confirmEx(
      window,
      title,
      message,
      okFlag * Services.prompt.BUTTON_POS_0 +
        cancelFlag * Services.prompt.BUTTON_POS_1,
      okButtonText,
      cancelButtonText,
      null,
      null,
      { value: 0 }
    ) == 0
  );
}

/** *********** String Utilities */

function GetString(name) {
  if (!gStringBundle) {
    try {
      gStringBundle = Services.strings.createBundle(
        "chrome://messenger/locale/messengercompose/editor.properties"
      );
    } catch (ex) {}
  }
  if (gStringBundle) {
    try {
      return gStringBundle.GetStringFromName(name);
    } catch (e) {}
  }
  return null;
}

function GetFormattedString(aName, aVal) {
  if (!gStringBundle) {
    try {
      gStringBundle = Services.strings.createBundle(
        "chrome://messenger/locale/messengercompose/editor.properties"
      );
    } catch (ex) {}
  }
  if (gStringBundle) {
    try {
      return gStringBundle.formatStringFromName(aName, [aVal]);
    } catch (e) {}
  }
  return null;
}

function TrimStringLeft(string) {
  if (!string) {
    return "";
  }
  return string.trimLeft();
}

function TrimStringRight(string) {
  if (!string) {
    return "";
  }
  return string.trimRight();
}

// Remove whitespace from both ends of a string
function TrimString(string) {
  if (!string) {
    return "";
  }
  return string.trim();
}

function TruncateStringAtWordEnd(string, maxLength, addEllipses) {
  // Return empty if string is null, undefined, or the empty string
  if (!string) {
    return "";
  }

  // We assume they probably don't want whitespace at the beginning
  string = string.trimLeft();
  if (string.length <= maxLength) {
    return string;
  }

  // We need to truncate the string to maxLength or fewer chars
  if (addEllipses) {
    maxLength -= 3;
  }
  string = string.replace(RegExp("(.{0," + maxLength + "})\\s.*"), "$1");

  if (string.length > maxLength) {
    string = string.slice(0, maxLength);
  }

  if (addEllipses) {
    string += "...";
  }
  return string;
}

// Replace all whitespace characters with supplied character
// E.g.: Use charReplace = " ", to "unwrap" the string by removing line-end chars
//       Use charReplace = "_" when you don't want spaces (like in a URL)
function ReplaceWhitespace(string, charReplace) {
  return string.trim().replace(/\s+/g, charReplace);
}

// Replace whitespace with "_" and allow only HTML CDATA
//   characters: "a"-"z","A"-"Z","0"-"9", "_", ":", "-", ".",
//   and characters above ASCII 127
function ConvertToCDATAString(string) {
  return string
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\.\-\:\u0080-\uFFFF]+/g, "");
}

function GetSelectionAsText() {
  try {
    return GetCurrentEditor().outputToString(
      "text/plain",
      Ci.nsIDocumentEncoder.OutputSelectionOnly
    );
  } catch (e) {}

  return "";
}

/** *********** Get Current Editor and associated interfaces or info */

function GetCurrentEditor() {
  // Get the active editor from the <editor> tag
  // XXX This will probably change if we support > 1 editor in main Composer window
  //      (e.g. a plaintext editor for HTMLSource)

  // For dialogs: Search up parent chain to find top window with editor
  var editor;
  try {
    var editorElement = GetCurrentEditorElement();
    editor = editorElement.getEditor(editorElement.contentWindow);

    // Do QIs now so editor users won't have to figure out which interface to use
    // Using "instanceof" does the QI for us.
    editor instanceof Ci.nsIHTMLEditor;
  } catch (e) {
    dump(e) + "\n";
  }

  return editor;
}

function GetCurrentTableEditor() {
  var editor = GetCurrentEditor();
  return editor && editor instanceof Ci.nsITableEditor ? editor : null;
}

function GetCurrentEditorElement() {
  var tmpWindow = window;

  do {
    // Get the <editor> element(s)
    const editorItem = tmpWindow.document.querySelector("editor");

    // This will change if we support > 1 editor element
    if (editorItem) {
      return editorItem;
    }

    tmpWindow = tmpWindow.opener;
  } while (tmpWindow);

  return null;
}

function GetCurrentCommandManager() {
  try {
    return GetCurrentEditorElement().commandManager;
  } catch (e) {
    dump(e) + "\n";
  }

  return null;
}

function GetCurrentEditorType() {
  try {
    return GetCurrentEditorElement().editortype;
  } catch (e) {
    dump(e) + "\n";
  }

  return "";
}

/**
 * Gets the editor's spell checker. Could return null if there are no
 * dictionaries installed.
 *
 * @returns {?nsIInlineSpellChecker}
 */
function GetCurrentEditorSpellChecker() {
  try {
    return GetCurrentEditor().getInlineSpellChecker(true);
  } catch (ex) {}
  return null;
}

function IsHTMLEditor() {
  // We don't have an editorElement, just return false
  if (!GetCurrentEditorElement()) {
    return false;
  }

  var editortype = GetCurrentEditorType();
  switch (editortype) {
    case "html":
    case "htmlmail":
      return true;

    case "text":
    case "textmail":
      return false;

    default:
      dump("INVALID EDITOR TYPE: " + editortype + "\n");
      break;
  }
  return false;
}

function PageIsEmptyAndUntouched() {
  return IsDocumentEmpty() && !IsDocumentModified() && !IsHTMLSourceChanged();
}

function IsInHTMLSourceMode() {
  return gEditorDisplayMode == kDisplayModeSource;
}

// are we editing HTML (i.e. neither in HTML source mode, nor editing a text file)
function IsEditingRenderedHTML() {
  return IsHTMLEditor() && !IsInHTMLSourceMode();
}

function IsDocumentEditable() {
  try {
    return GetCurrentEditor().isDocumentEditable;
  } catch (e) {}
  return false;
}

function IsDocumentEmpty() {
  try {
    return GetCurrentEditor().documentIsEmpty;
  } catch (e) {}
  return false;
}

function IsDocumentModified() {
  try {
    return GetCurrentEditor().documentModified;
  } catch (e) {}
  return false;
}

function IsHTMLSourceChanged() {
  // gSourceTextEditor will not be defined if we're just a text editor.
  return gSourceTextEditor ? gSourceTextEditor.documentModified : false;
}

function newCommandParams() {
  try {
    return Cu.createCommandParams();
  } catch (e) {
    dump("error thrown in newCommandParams: " + e + "\n");
  }
  return null;
}

/** *********** General editing command utilities */

function GetDocumentTitle() {
  try {
    return GetCurrentEditorElement().contentDocument.title;
  } catch (e) {}

  return "";
}

function SetDocumentTitle(title) {
  try {
    GetCurrentEditorElement().contentDocument.title = title;

    // Update window title (doesn't work if called from a dialog)
    if ("UpdateWindowTitle" in window) {
      window.UpdateWindowTitle();
    }
  } catch (e) {}
}

function EditorGetTextProperty(
  property,
  attribute,
  value,
  firstHas,
  anyHas,
  allHas
) {
  try {
    return GetCurrentEditor().getInlinePropertyWithAttrValue(
      property,
      attribute,
      value,
      firstHas,
      anyHas,
      allHas
    );
  } catch (e) {}
}

function EditorSetTextProperty(property, attribute, value) {
  try {
    GetCurrentEditor().setInlineProperty(property, attribute, value);
    if ("gContentWindow" in window) {
      window.gContentWindow.focus();
    }
  } catch (e) {}
}

function EditorRemoveTextProperty(property, attribute) {
  try {
    GetCurrentEditor().removeInlineProperty(property, attribute);
    if ("gContentWindow" in window) {
      window.gContentWindow.focus();
    }
  } catch (e) {}
}

/** *********** Element enbabling/disabling */

// this function takes an elementID and a flag
// if the element can be found by ID, then it is either enabled (by removing "disabled" attr)
// or disabled (setAttribute) as specified in the "doEnable" parameter
function SetElementEnabledById(elementID, doEnable) {
  SetElementEnabled(document.getElementById(elementID), doEnable);
}

function SetElementEnabled(element, doEnable) {
  if (element) {
    if (doEnable) {
      element.removeAttribute("disabled");
    } else {
      element.setAttribute("disabled", "true");
    }
  } else {
    dump("Element  not found in SetElementEnabled\n");
  }
}

/** *********** Services / Prefs */

function GetFileProtocolHandler() {
  const handler = Services.io.getProtocolHandler("file");
  return handler.QueryInterface(Ci.nsIFileProtocolHandler);
}

function SetStringPref(aPrefName, aPrefValue) {
  try {
    Services.prefs.setStringPref(aPrefName, aPrefValue);
  } catch (e) {}
}

// Set initial directory for a filepicker from URLs saved in prefs
function SetFilePickerDirectory(filePicker, fileType) {
  if (filePicker) {
    try {
      // Save current directory so we can reset it in SaveFilePickerDirectory
      gFilePickerDirectory = filePicker.displayDirectory;

      const location = Services.prefs.getComplexValue(
        "editor.lastFileLocation." + fileType,
        Ci.nsIFile
      );
      if (location) {
        filePicker.displayDirectory = location;
      }
    } catch (e) {}
  }
}

// Save the directory of the selected file to prefs
function SaveFilePickerDirectory(filePicker, fileType) {
  if (filePicker && filePicker.file) {
    try {
      var fileDir;
      if (filePicker.file.parent) {
        fileDir = filePicker.file.parent.QueryInterface(Ci.nsIFile);
      }

      Services.prefs.setComplexValue(
        "editor.lastFileLocation." + fileType,
        Ci.nsIFile,
        fileDir
      );

      Services.prefs.savePrefFile(null);
    } catch (e) {}
  }

  // Restore the directory used before SetFilePickerDirectory was called;
  // This reduces interference with Browser and other module directory defaults
  if (gFilePickerDirectory) {
    filePicker.displayDirectory = gFilePickerDirectory;
  }

  gFilePickerDirectory = null;
}

function GetDefaultBrowserColors() {
  var colors = {
    TextColor: 0,
    BackgroundColor: 0,
    LinkColor: 0,
    ActiveLinkColor: 0,
    VisitedLinkColor: 0,
  };
  var useSysColors = Services.prefs.getBoolPref(
    "browser.display.use_system_colors",
    false
  );

  if (!useSysColors) {
    colors.TextColor = Services.prefs.getCharPref(
      "browser.display.foreground_color",
      0
    );
    colors.BackgroundColor = Services.prefs.getCharPref(
      "browser.display.background_color",
      0
    );
  }
  // Use OS colors for text and background if explicitly asked or pref is not set
  if (!colors.TextColor) {
    colors.TextColor = "windowtext";
  }

  if (!colors.BackgroundColor) {
    colors.BackgroundColor = "window";
  }

  colors.LinkColor = Services.prefs.getCharPref("browser.anchor_color");
  colors.ActiveLinkColor = Services.prefs.getCharPref("browser.active_color");
  colors.VisitedLinkColor = Services.prefs.getCharPref("browser.visited_color");

  return colors;
}

/** *********** URL handling */

function TextIsURI(selectedText) {
  return (
    selectedText &&
    /^http:\/\/|^https:\/\/|^file:\/\/|^ftp:\/\/|^about:|^mailto:|^news:|^snews:|^telnet:|^ldap:|^ldaps:|^gopher:|^finger:|^javascript:/i.test(
      selectedText
    )
  );
}

function IsUrlAboutBlank(urlString) {
  return urlString.startsWith("about:blank");
}

// Get the HREF of the page's <base> tag or the document location
// returns empty string if no base href and document hasn't been saved yet
function GetDocumentBaseUrl() {
  try {
    var docUrl;

    // if document supplies a <base> tag, use that URL instead
    const base = GetCurrentEditor().document.querySelector("base");
    if (base) {
      docUrl = base.getAttribute("href");
    }
    if (!docUrl) {
      docUrl = GetDocumentUrl();
    }

    if (!IsUrlAboutBlank(docUrl)) {
      return docUrl;
    }
  } catch (e) {}
  return "";
}

function GetDocumentUrl() {
  try {
    return GetCurrentEditor().document.URL;
  } catch (e) {}
  return "";
}

// Extract the scheme (e.g., 'file', 'http') from a URL string
function GetScheme(urlspec) {
  var resultUrl = TrimString(urlspec);
  // Unsaved document URL has no acceptable scheme yet
  if (!resultUrl || IsUrlAboutBlank(resultUrl)) {
    return "";
  }

  var scheme = "";
  try {
    // This fails if there's no scheme
    scheme = Services.io.extractScheme(resultUrl);
  } catch (e) {}

  return scheme ? scheme.toLowerCase() : "";
}

function GetHost(urlspec) {
  if (!urlspec) {
    return "";
  }

  var host = "";
  try {
    host = Services.io.newURI(urlspec).host;
  } catch (e) {}

  return host;
}

function GetUsername(urlspec) {
  if (!urlspec) {
    return "";
  }

  var username = "";
  try {
    username = Services.io.newURI(urlspec).username;
  } catch (e) {}

  return username;
}

function GetFilename(urlspec) {
  if (!urlspec || IsUrlAboutBlank(urlspec)) {
    return "";
  }

  var filename;

  try {
    const uri = Services.io.newURI(urlspec);
    if (uri) {
      const url = uri.QueryInterface(Ci.nsIURL);
      if (url) {
        filename = url.fileName;
      }
    }
  } catch (e) {}

  return filename ? filename : "";
}

// Return the url without username and password
// Optional output objects return extracted username and password strings
// This uses just string routines via nsIIOServices
function StripUsernamePassword(urlspec, usernameObj, passwordObj) {
  urlspec = TrimString(urlspec);
  if (!urlspec || IsUrlAboutBlank(urlspec)) {
    return urlspec;
  }

  if (usernameObj) {
    usernameObj.value = "";
  }
  if (passwordObj) {
    passwordObj.value = "";
  }

  // "@" must exist else we will never detect username or password
  var atIndex = urlspec.indexOf("@");
  if (atIndex > 0) {
    try {
      const uri = Services.io.newURI(urlspec);
      const username = uri.username;
      const password = uri.password;

      if (usernameObj && username) {
        usernameObj.value = username;
      }
      if (passwordObj && password) {
        passwordObj.value = password;
      }
      if (username) {
        const usernameStart = urlspec.indexOf(username);
        if (usernameStart != -1) {
          return urlspec.slice(0, usernameStart) + urlspec.slice(atIndex + 1);
        }
      }
    } catch (e) {}
  }
  return urlspec;
}

function StripPassword(urlspec, passwordObj) {
  urlspec = TrimString(urlspec);
  if (!urlspec || IsUrlAboutBlank(urlspec)) {
    return urlspec;
  }

  if (passwordObj) {
    passwordObj.value = "";
  }

  // "@" must exist else we will never detect password
  var atIndex = urlspec.indexOf("@");
  if (atIndex > 0) {
    try {
      const password = Services.io.newURI(urlspec).password;

      if (passwordObj && password) {
        passwordObj.value = password;
      }
      if (password) {
        // Find last ":" before "@"
        const colon = urlspec.lastIndexOf(":", atIndex);
        if (colon != -1) {
          // Include the "@"
          return urlspec.slice(0, colon) + urlspec.slice(atIndex);
        }
      }
    } catch (e) {}
  }
  return urlspec;
}

// Version to use when you have an nsIURI object
function StripUsernamePasswordFromURI(uri) {
  var urlspec = "";
  if (uri) {
    try {
      urlspec = uri.spec;
      var userPass = uri.userPass;
      if (userPass) {
        const start = urlspec.indexOf(userPass);
        urlspec =
          urlspec.slice(0, start) + urlspec.slice(start + userPass.length + 1);
      }
    } catch (e) {}
  }
  return urlspec;
}

function InsertUsernameIntoUrl(urlspec, username) {
  if (!urlspec || !username) {
    return urlspec;
  }

  try {
    const URI = Services.io.newURI(
      urlspec,
      GetCurrentEditor().documentCharacterSet
    );
    URI.username = username;
    return URI.spec;
  } catch (e) {}

  return urlspec;
}

function ConvertRGBColorIntoHEXColor(color) {
  if (/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.test(color)) {
    var r = Number(RegExp.$1).toString(16);
    if (r.length == 1) {
      r = "0" + r;
    }
    var g = Number(RegExp.$2).toString(16);
    if (g.length == 1) {
      g = "0" + g;
    }
    var b = Number(RegExp.$3).toString(16);
    if (b.length == 1) {
      b = "0" + b;
    }
    return "#" + r + g + b;
  }

  return color;
}

/** *********** CSS */

function GetHTMLOrCSSStyleValue(element, attrName, cssPropertyName) {
  var value;
  if (Services.prefs.getBoolPref("editor.use_css") && IsHTMLEditor()) {
    value = element.style.getPropertyValue(cssPropertyName);
  }

  if (!value) {
    value = element.getAttribute(attrName);
  }

  if (!value) {
    return "";
  }

  return value;
}

/** *********** Miscellaneous */
// Clone simple JS objects
function Clone(obj) {
  var clone = {};
  for (var i in obj) {
    if (typeof obj[i] == "object") {
      clone[i] = Clone(obj[i]);
    } else {
      clone[i] = obj[i];
    }
  }
  return clone;
}

/**
 * Utility functions to handle shortended data: URLs in EdColorProps.js and EdImageOverlay.js.
 */

/**
 * Is the passed in image URI a shortened data URI?
 *
 * @returns {bool}
 */
function isImageDataShortened(aImageData) {
  return /^data:/i.test(aImageData) && aImageData.includes("…");
}

/**
 * Event handler for Copy or Cut
 *
 * @param aEvent  the event
 */
function onCopyOrCutShortened(aEvent) {
  // Put the original data URI onto the clipboard in case the value
  // is a shortened data URI.
  const field = aEvent.target;
  const startPos = field.selectionStart;
  if (startPos == undefined) {
    return;
  }
  const endPos = field.selectionEnd;
  const selection = field.value.substring(startPos, endPos).trim();

  // Test that a) the user selected the whole value,
  //           b) the value is a data URI,
  //           c) it contains the ellipsis we added. Otherwise it could be
  //              a new value that the user pasted in.
  if (selection == field.value.trim() && isImageDataShortened(selection)) {
    aEvent.clipboardData.setData("text/plain", field.fullDataURI);
    if (aEvent.type == "cut") {
      // We have to cut the selection manually. Since we tested that
      // everything was selected, we can just reset the field.
      field.value = "";
    }
    aEvent.preventDefault();
  }
}

/**
 * Set up element showing an image URI with a shortened version.
 * and add event handler for Copy or Cut.
 *
 * @param aImageData    the data: URL of the image to be shortened.
 *                      Note: Original stored in 'aDialogField.fullDataURI'.
 * @param aDialogField  The field of the dialog to contain the data.
 * @returns {bool} URL was shortened?
 */
function shortenImageData(aImageData, aDialogField) {
  let shortened = false;
  aDialogField.value = aImageData.replace(
    /^(data:.+;base64,)(.*)/i,
    function (match, nonDataPart, dataPart) {
      if (dataPart.length <= 35) {
        return match;
      }

      shortened = true;
      aDialogField.addEventListener("copy", onCopyOrCutShortened);
      aDialogField.addEventListener("cut", onCopyOrCutShortened);
      aDialogField.fullDataURI = aImageData;
      aDialogField.removeAttribute("tooltiptext");
      aDialogField.setAttribute("tooltip", "shortenedDataURI");
      return (
        nonDataPart +
        dataPart.substring(0, 5) +
        "…" +
        dataPart.substring(dataPart.length - 30)
      );
    }
  );
  return shortened;
}

/**
 * Return full data URIs for a shortened element.
 *
 * @param aDialogField  The field of the dialog containing the data.
 */
function restoredImageData(aDialogField) {
  return aDialogField.fullDataURI;
}
