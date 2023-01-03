/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Implementations of nsIControllerCommand for composer commands */

// Linting is disabled in chunks of this file because it contains code that never
// runs in Thunderbird, and references things that don't exist in Thunderbird.

/* import-globals-from editor.js */
/* import-globals-from editorUtilities.js */
/* globals CreatePublishDataFromUrl editPage FormatDirForPublishing getTopWin
   goPreferences nsIPromptService openComposeWindow openNewPrivateWith
   PrintPreviewListener SavePublishDataToPrefs SavePassword savePWObj */

var gComposerJSCommandControllerID = 0;

function SetupHTMLEditorCommands() {
  var commandTable = GetComposerCommandTable();
  if (!commandTable) {
    return;
  }

  // Include everything a text editor does
  SetupTextEditorCommands();

  // dump("Registering HTML editor commands\n");

  commandTable.registerCommand("cmd_renderedHTMLEnabler", nsDummyHTMLCommand);

  commandTable.registerCommand("cmd_grid", nsGridCommand);

  commandTable.registerCommand("cmd_listProperties", nsListPropertiesCommand);
  commandTable.registerCommand("cmd_pageProperties", nsPagePropertiesCommand);
  commandTable.registerCommand("cmd_colorProperties", nsColorPropertiesCommand);
  commandTable.registerCommand("cmd_increaseFontStep", nsIncreaseFontCommand);
  commandTable.registerCommand("cmd_decreaseFontStep", nsDecreaseFontCommand);
  commandTable.registerCommand(
    "cmd_advancedProperties",
    nsAdvancedPropertiesCommand
  );
  commandTable.registerCommand(
    "cmd_objectProperties",
    nsObjectPropertiesCommand
  );
  commandTable.registerCommand(
    "cmd_removeNamedAnchors",
    nsRemoveNamedAnchorsCommand
  );
  commandTable.registerCommand("cmd_editLink", nsEditLinkCommand);

  commandTable.registerCommand("cmd_form", nsFormCommand);
  commandTable.registerCommand("cmd_inputtag", nsInputTagCommand);
  commandTable.registerCommand("cmd_inputimage", nsInputImageCommand);
  commandTable.registerCommand("cmd_textarea", nsTextAreaCommand);
  commandTable.registerCommand("cmd_select", nsSelectCommand);
  commandTable.registerCommand("cmd_button", nsButtonCommand);
  commandTable.registerCommand("cmd_label", nsLabelCommand);
  commandTable.registerCommand("cmd_fieldset", nsFieldSetCommand);
  commandTable.registerCommand("cmd_image", nsImageCommand);
  commandTable.registerCommand("cmd_hline", nsHLineCommand);
  commandTable.registerCommand("cmd_link", nsLinkCommand);
  commandTable.registerCommand("cmd_anchor", nsAnchorCommand);
  commandTable.registerCommand(
    "cmd_insertHTMLWithDialog",
    nsInsertHTMLWithDialogCommand
  );
  commandTable.registerCommand(
    "cmd_insertMathWithDialog",
    nsInsertMathWithDialogCommand
  );
  commandTable.registerCommand("cmd_insertBreak", nsInsertBreakCommand);
  commandTable.registerCommand("cmd_insertBreakAll", nsInsertBreakAllCommand);

  commandTable.registerCommand("cmd_table", nsInsertOrEditTableCommand);
  commandTable.registerCommand("cmd_editTable", nsEditTableCommand);
  commandTable.registerCommand("cmd_SelectTable", nsSelectTableCommand);
  commandTable.registerCommand("cmd_SelectRow", nsSelectTableRowCommand);
  commandTable.registerCommand("cmd_SelectColumn", nsSelectTableColumnCommand);
  commandTable.registerCommand("cmd_SelectCell", nsSelectTableCellCommand);
  commandTable.registerCommand(
    "cmd_SelectAllCells",
    nsSelectAllTableCellsCommand
  );
  commandTable.registerCommand("cmd_InsertTable", nsInsertTableCommand);
  commandTable.registerCommand(
    "cmd_InsertRowAbove",
    nsInsertTableRowAboveCommand
  );
  commandTable.registerCommand(
    "cmd_InsertRowBelow",
    nsInsertTableRowBelowCommand
  );
  commandTable.registerCommand(
    "cmd_InsertColumnBefore",
    nsInsertTableColumnBeforeCommand
  );
  commandTable.registerCommand(
    "cmd_InsertColumnAfter",
    nsInsertTableColumnAfterCommand
  );
  commandTable.registerCommand(
    "cmd_InsertCellBefore",
    nsInsertTableCellBeforeCommand
  );
  commandTable.registerCommand(
    "cmd_InsertCellAfter",
    nsInsertTableCellAfterCommand
  );
  commandTable.registerCommand("cmd_DeleteTable", nsDeleteTableCommand);
  commandTable.registerCommand("cmd_DeleteRow", nsDeleteTableRowCommand);
  commandTable.registerCommand("cmd_DeleteColumn", nsDeleteTableColumnCommand);
  commandTable.registerCommand("cmd_DeleteCell", nsDeleteTableCellCommand);
  commandTable.registerCommand(
    "cmd_DeleteCellContents",
    nsDeleteTableCellContentsCommand
  );
  commandTable.registerCommand("cmd_JoinTableCells", nsJoinTableCellsCommand);
  commandTable.registerCommand("cmd_SplitTableCell", nsSplitTableCellCommand);
  commandTable.registerCommand(
    "cmd_TableOrCellColor",
    nsTableOrCellColorCommand
  );
  commandTable.registerCommand("cmd_NormalizeTable", nsNormalizeTableCommand);
  commandTable.registerCommand("cmd_smiley", nsSetSmiley);
  commandTable.registerCommand("cmd_ConvertToTable", nsConvertToTable);
}

function SetupTextEditorCommands() {
  var commandTable = GetComposerCommandTable();
  if (!commandTable) {
    return;
  }

  // dump("Registering plain text editor commands\n");

  commandTable.registerCommand("cmd_findReplace", nsFindReplaceCommand);
  commandTable.registerCommand("cmd_find", nsFindCommand);
  commandTable.registerCommand("cmd_findNext", nsFindAgainCommand);
  commandTable.registerCommand("cmd_findPrev", nsFindAgainCommand);
  commandTable.registerCommand("cmd_rewrap", nsRewrapCommand);
  commandTable.registerCommand("cmd_spelling", nsSpellingCommand);
  commandTable.registerCommand("cmd_validate", nsValidateCommand);
  commandTable.registerCommand("cmd_insertChars", nsInsertCharsCommand);
}

function SetupComposerWindowCommands() {
  // Don't need to do this if already done
  if (gComposerWindowControllerID) {
    return;
  }

  // Create a command controller and register commands
  //   specific to Web Composer window (file-related commands, HTML Source...)
  //   We can't use the composer controller created on the content window else
  //     we can't process commands when in HTMLSource editor
  // IMPORTANT: For each of these commands, the doCommand method
  //            must first call SetEditMode(gPreviousNonSourceDisplayMode);
  //            to go from HTML Source mode to any other edit mode

  var windowControllers = window.controllers;

  if (!windowControllers) {
    return;
  }

  var commandTable;
  var composerController;
  var editorController;
  try {
    composerController = Cc[
      "@mozilla.org/embedcomp/base-command-controller;1"
    ].createInstance();

    editorController = composerController.QueryInterface(
      Ci.nsIControllerContext
    );

    // Get the nsIControllerCommandTable interface we need to register commands
    var interfaceRequestor = composerController.QueryInterface(
      Ci.nsIInterfaceRequestor
    );
    commandTable = interfaceRequestor.getInterface(
      Ci.nsIControllerCommandTable
    );
  } catch (e) {
    dump("Failed to create composerController\n");
    return;
  }

  if (!commandTable) {
    dump("Failed to get interface for nsIControllerCommandManager\n");
    return;
  }

  // File-related commands
  commandTable.registerCommand("cmd_open", nsOpenCommand);
  commandTable.registerCommand("cmd_save", nsSaveCommand);
  commandTable.registerCommand("cmd_saveAs", nsSaveAsCommand);
  commandTable.registerCommand("cmd_exportToText", nsExportToTextCommand);
  commandTable.registerCommand(
    "cmd_saveAndChangeEncoding",
    nsSaveAndChangeEncodingCommand
  );
  commandTable.registerCommand("cmd_publish", nsPublishCommand);
  commandTable.registerCommand("cmd_publishAs", nsPublishAsCommand);
  commandTable.registerCommand("cmd_publishSettings", nsPublishSettingsCommand);
  commandTable.registerCommand("cmd_revert", nsRevertCommand);
  commandTable.registerCommand("cmd_openRemote", nsOpenRemoteCommand);
  commandTable.registerCommand("cmd_preview", nsPreviewCommand);
  commandTable.registerCommand("cmd_editSendPage", nsSendPageCommand);
  commandTable.registerCommand("cmd_print", nsPrintCommand);
  commandTable.registerCommand("cmd_printpreview", nsPrintPreviewCommand);
  commandTable.registerCommand("cmd_printSetup", nsPrintSetupCommand);
  commandTable.registerCommand("cmd_close", nsCloseCommand);
  commandTable.registerCommand("cmd_preferences", nsPreferencesCommand);

  // Edit Mode commands
  if (GetCurrentEditorType() == "html") {
    commandTable.registerCommand("cmd_NormalMode", nsNormalModeCommand);
    commandTable.registerCommand("cmd_AllTagsMode", nsAllTagsModeCommand);
    commandTable.registerCommand("cmd_HTMLSourceMode", nsHTMLSourceModeCommand);
    commandTable.registerCommand("cmd_PreviewMode", nsPreviewModeCommand);
    commandTable.registerCommand("cmd_FinishHTMLSource", nsFinishHTMLSource);
    commandTable.registerCommand("cmd_CancelHTMLSource", nsCancelHTMLSource);
    commandTable.registerCommand(
      "cmd_updateStructToolbar",
      nsUpdateStructToolbarCommand
    );
  }

  windowControllers.insertControllerAt(0, editorController);

  // Store the controller ID so we can be sure to get the right one later
  gComposerWindowControllerID = windowControllers.getControllerId(
    editorController
  );
}

function GetComposerCommandTable() {
  var controller;
  if (gComposerJSCommandControllerID) {
    try {
      controller = window.content.controllers.getControllerById(
        gComposerJSCommandControllerID
      );
    } catch (e) {}
  }
  if (!controller) {
    // create it
    controller = Cc[
      "@mozilla.org/embedcomp/base-command-controller;1"
    ].createInstance();

    var editorController = controller.QueryInterface(Ci.nsIControllerContext);
    editorController.setCommandContext(GetCurrentEditorElement());
    window.content.controllers.insertControllerAt(0, controller);

    // Store the controller ID so we can be sure to get the right one later
    gComposerJSCommandControllerID = window.content.controllers.getControllerId(
      controller
    );
  }

  if (controller) {
    var interfaceRequestor = controller.QueryInterface(
      Ci.nsIInterfaceRequestor
    );
    return interfaceRequestor.getInterface(Ci.nsIControllerCommandTable);
  }
  return null;
}

/* eslint-disable complexity */
function goUpdateCommandState(command) {
  try {
    var controller = top.document.commandDispatcher.getControllerForCommand(
      command
    );
    if (!(controller instanceof Ci.nsICommandController)) {
      return;
    }

    var params = newCommandParams();
    if (!params) {
      return;
    }

    controller.getCommandStateWithParams(command, params);

    switch (command) {
      case "cmd_bold":
      case "cmd_italic":
      case "cmd_underline":
      case "cmd_var":
      case "cmd_samp":
      case "cmd_code":
      case "cmd_acronym":
      case "cmd_abbr":
      case "cmd_cite":
      case "cmd_strong":
      case "cmd_em":
      case "cmd_superscript":
      case "cmd_subscript":
      case "cmd_strikethrough":
      case "cmd_tt":
      case "cmd_nobreak":
      case "cmd_ul":
      case "cmd_ol":
        pokeStyleUI(command, params.getBooleanValue("state_all"));
        break;

      case "cmd_paragraphState":
      case "cmd_align":
      case "cmd_highlight":
      case "cmd_backgroundColor":
      case "cmd_fontColor":
      case "cmd_fontFace":
      case "cmd_fontSize":
      case "cmd_absPos":
        pokeMultiStateUI(command, params);
        break;

      case "cmd_decreaseZIndex":
      case "cmd_increaseZIndex":
      case "cmd_indent":
      case "cmd_outdent":
      case "cmd_increaseFont":
      case "cmd_decreaseFont":
      case "cmd_increaseFontStep":
      case "cmd_decreaseFontStep":
      case "cmd_removeStyles":
      case "cmd_smiley":
        break;

      default:
        dump("no update for command: " + command + "\n");
    }
  } catch (e) {
    dump(
      "An error occurred updating the " + command + " command: \n" + e + "\n"
    );
  }
}
/* eslint-enable complexity */

function goUpdateComposerMenuItems(commandset) {
  // dump("Updating commands for " + commandset.id + "\n");

  for (var i = 0; i < commandset.childNodes.length; i++) {
    var commandNode = commandset.childNodes[i];
    var commandID = commandNode.id;
    if (commandID) {
      goUpdateCommand(commandID); // enable or disable
      if (commandNode.hasAttribute("state")) {
        goUpdateCommandState(commandID);
      }
    }
  }
}

function goDoCommandParams(command, params) {
  try {
    var controller = top.document.commandDispatcher.getControllerForCommand(
      command
    );
    if (controller && controller.isCommandEnabled(command)) {
      if (controller instanceof Ci.nsICommandController) {
        controller.doCommandWithParams(command, params);

        // the following two lines should be removed when we implement observers
        if (params) {
          controller.getCommandStateWithParams(command, params);
        }
      } else {
        controller.doCommand(command);
      }
      ResetStructToolbar();
    }
  } catch (e) {
    dump("An error occurred executing the " + command + " command\n");
  }
}

function pokeStyleUI(uiID, aDesiredState) {
  try {
    var commandNode = top.document.getElementById(uiID);
    if (!commandNode) {
      return;
    }

    var uiState = "true" == commandNode.getAttribute("state");
    if (aDesiredState != uiState) {
      commandNode.setAttribute("state", aDesiredState ? "true" : "false");
    }
  } catch (e) {
    dump("poking UI for " + uiID + " failed: " + e + "\n");
  }
}

function doStyleUICommand(cmdStr) {
  try {
    var cmdParams = newCommandParams();
    goDoCommandParams(cmdStr, cmdParams);
    if (cmdParams) {
      pokeStyleUI(cmdStr, cmdParams.getBooleanValue("state_all"));
    }

    ResetStructToolbar();
  } catch (e) {}
}

// Copied from jsmime.js.
function stringToTypedArray(buffer) {
  var typedarray = new Uint8Array(buffer.length);
  for (var i = 0; i < buffer.length; i++) {
    typedarray[i] = buffer.charCodeAt(i);
  }
  return typedarray;
}

function pokeMultiStateUI(uiID, cmdParams) {
  try {
    var commandNode = document.getElementById(uiID);
    if (!commandNode) {
      return;
    }

    var isMixed = cmdParams.getBooleanValue("state_mixed");
    var desiredAttrib;
    if (isMixed) {
      desiredAttrib = "mixed";
    } else {
      var valuetype = cmdParams.getValueType("state_attribute");
      if (valuetype == Ci.nsICommandParams.eStringType) {
        desiredAttrib = cmdParams.getCStringValue("state_attribute");
        // Decode UTF-8, for example for font names in Japanese.
        desiredAttrib = new TextDecoder("UTF-8").decode(
          stringToTypedArray(desiredAttrib)
        );
      } else {
        desiredAttrib = cmdParams.getStringValue("state_attribute");
      }
    }

    var uiState = commandNode.getAttribute("state");
    if (desiredAttrib != uiState) {
      commandNode.setAttribute("state", desiredAttrib);
    }
  } catch (e) {}
}

function doStatefulCommand(commandID, newState) {
  var commandNode = document.getElementById(commandID);
  if (commandNode) {
    commandNode.setAttribute("state", newState);
  }
  gContentWindow.focus(); // needed for command dispatch to work

  try {
    var cmdParams = newCommandParams();
    if (!cmdParams) {
      return;
    }

    cmdParams.setStringValue("state_attribute", newState);
    goDoCommandParams(commandID, cmdParams);

    pokeMultiStateUI(commandID, cmdParams);

    ResetStructToolbar();
  } catch (e) {
    dump("error thrown in doStatefulCommand: " + e + "\n");
  }
}

function PrintObject(obj) {
  dump("-----" + obj + "------\n");
  var names = "";
  for (var i in obj) {
    if (i == "value") {
      names += i + ": " + obj.value + "\n";
    } else if (i == "id") {
      names += i + ": " + obj.id + "\n";
    } else {
      names += i + "\n";
    }
  }

  dump(names + "-----------\n");
}

function PrintNodeID(id) {
  PrintObject(document.getElementById(id));
}

var nsDummyHTMLCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // do nothing
    dump("Hey, who's calling the dummy command?\n");
  },
};

var nsOpenCommand = {
  isCommandEnabled(aCommand, dummy) {
    // We can always do this.
    return true;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    var fileType = IsHTMLEditor() ? "html" : "text";
    var title = GetString(IsHTMLEditor() ? "OpenHTMLFile" : "OpenTextFile");

    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, title, nsIFilePicker.modeOpen);

    SetFilePickerDirectory(fp, fileType);

    // Direct user to prefer HTML files and/or text files depending on whether
    // loading into Composer or Text editor, so we call separately to control
    // the order of the filter list.
    if (fileType == "html") {
      fp.appendFilters(nsIFilePicker.filterHTML);
    }
    fp.appendFilters(nsIFilePicker.filterText);
    fp.appendFilters(nsIFilePicker.filterAll);

    fp.open(rv => {
      if (rv == nsIFilePicker.returnCancel) {
        return;
      }
      // editPage checks for already open window and activates it.
      if (fp.fileURL.spec) {
        SaveFilePickerDirectory(fp, fileType);
        editPage(fp.fileURL.spec, fileType);
      }
    });
  },
};

// STRUCTURE TOOLBAR
//
var nsUpdateStructToolbarCommand = {
  isCommandEnabled(aCommand, dummy) {
    UpdateStructToolbar();
    return true;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},
  doCommand(aCommand) {},
};

// ******* File output commands and utilities ******** //
var nsSaveCommand = {
  isCommandEnabled(aCommand, dummy) {
    // Always allow saving when editing a remote document,
    //  otherwise the document modified state would prevent that
    //  when you first open a remote file.
    try {
      var docUrl = GetDocumentUrl();
      return (
        IsDocumentEditable() &&
        (IsDocumentModified() ||
          IsHTMLSourceChanged() ||
          IsUrlAboutBlank(docUrl) ||
          GetScheme(docUrl) != "file")
      );
    } catch (e) {
      return false;
    }
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    var editor = GetCurrentEditor();
    if (editor) {
      if (IsHTMLEditor()) {
        SetEditMode(gPreviousNonSourceDisplayMode);
      }
      SaveDocument(
        IsUrlAboutBlank(GetDocumentUrl()),
        false,
        editor.contentsMIMEType
      );
    }
  },
};

var nsSaveAsCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    var editor = GetCurrentEditor();
    if (editor) {
      if (IsHTMLEditor()) {
        SetEditMode(gPreviousNonSourceDisplayMode);
      }
      SaveDocument(true, false, editor.contentsMIMEType);
    }
  },
};

var nsExportToTextCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    if (GetCurrentEditor()) {
      SetEditMode(gPreviousNonSourceDisplayMode);
      SaveDocument(true, true, "text/plain");
    }
  },
};

var nsSaveAndChangeEncodingCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    SetEditMode(gPreviousNonSourceDisplayMode);
    window.ok = false;
    window.exportToText = false;
    var oldTitle = GetDocumentTitle();
    window.openDialog(
      "chrome://editor/content/EditorSaveAsCharset.xhtml",
      "_blank",
      "chrome,close,titlebar,modal,resizable=yes"
    );

    if (GetDocumentTitle() != oldTitle) {
      UpdateWindowTitle();
    }

    if (window.ok) {
      if (window.exportToText) {
        SaveDocument(true, true, "text/plain");
      } else {
        var editor = GetCurrentEditor();
        SaveDocument(true, false, editor ? editor.contentsMIMEType : null);
      }
    }
  },
};

var nsPublishCommand = {
  isCommandEnabled(aCommand, dummy) {
    if (IsDocumentEditable()) {
      // Always allow publishing when editing a local document,
      //  otherwise the document modified state would prevent that
      //  when you first open any local file.
      try {
        var docUrl = GetDocumentUrl();
        return (
          IsDocumentModified() ||
          IsHTMLSourceChanged() ||
          IsUrlAboutBlank(docUrl) ||
          GetScheme(docUrl) == "file"
        );
      } catch (e) {
        return false;
      }
    }
    return false;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    if (GetCurrentEditor()) {
      let docUrl = GetDocumentUrl();
      let filename = GetFilename(docUrl);
      let publishData;

      // First check pref to always show publish dialog
      let showPublishDialog = Services.prefs.getBoolPref(
        "editor.always_show_publish_dialog"
      );

      if (!showPublishDialog && filename) {
        // Try to get publish data from the document url
        publishData = CreatePublishDataFromUrl(docUrl);

        // If none, use default publishing site? Need a pref for this
        // if (!publishData)
        //  publishData = GetPublishDataFromSiteName(GetDefaultPublishSiteName(), filename);
      }

      if (showPublishDialog || !publishData) {
        // Show the publish dialog
        publishData = {};
        window.ok = false;
        let oldTitle = GetDocumentTitle();
        window.openDialog(
          "chrome://editor/content/EditorPublish.xhtml",
          "_blank",
          "chrome,close,titlebar,modal",
          "",
          "",
          publishData
        );
        if (GetDocumentTitle() != oldTitle) {
          UpdateWindowTitle();
        }

        if (!window.ok) {
          return false;
        }
      }
      if (publishData) {
        SetEditMode(gPreviousNonSourceDisplayMode);
        return Publish(publishData);
      }
    }
    return false;
  },
};

var nsPublishAsCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    if (GetCurrentEditor()) {
      SetEditMode(gPreviousNonSourceDisplayMode);

      window.ok = false;
      var publishData = {};
      var oldTitle = GetDocumentTitle();
      window.openDialog(
        "chrome://editor/content/EditorPublish.xhtml",
        "_blank",
        "chrome,close,titlebar,modal",
        "",
        "",
        publishData
      );
      if (GetDocumentTitle() != oldTitle) {
        UpdateWindowTitle();
      }

      if (window.ok) {
        return Publish(publishData);
      }
    }
    return false;
  },
};

// ------- output utilities   ----- //

// returns a fileExtension string
function GetExtensionBasedOnMimeType(aMIMEType) {
  try {
    var mimeService = null;
    mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);

    var fileExtension = mimeService.getPrimaryExtension(aMIMEType, null);

    // the MIME service likes to give back ".htm" for text/html files,
    // so do a special-case fix here.
    if (fileExtension == "htm") {
      fileExtension = "html";
    }

    return fileExtension;
  } catch (e) {}
  return "";
}

function GetSuggestedFileName(aDocumentURLString, aMIMEType) {
  var extension = GetExtensionBasedOnMimeType(aMIMEType);
  if (extension) {
    extension = "." + extension;
  }

  // check for existing file name we can use
  if (aDocumentURLString && !IsUrlAboutBlank(aDocumentURLString)) {
    try {
      let docURI = Services.io.newURI(
        aDocumentURLString,
        GetCurrentEditor().documentCharacterSet
      );
      docURI = docURI.QueryInterface(Ci.nsIURL);

      // grab the file name
      let url = validateFileName(decodeURIComponent(docURI.fileBaseName));
      if (url) {
        return url + extension;
      }
    } catch (e) {}
  }

  // Check if there is a title we can use to generate a valid filename,
  // if we can't, use the default filename.
  var title =
    validateFileName(GetDocumentTitle()) ||
    GetString("untitledDefaultFilename");
  return title + extension;
}

/**
 * @return {Promise} dialogResult
 */
function PromptForSaveLocation(
  aDoSaveAsText,
  aEditorType,
  aMIMEType,
  aDocumentURLString
) {
  var dialogResult = {};
  dialogResult.filepickerClick = nsIFilePicker.returnCancel;
  dialogResult.resultingURI = "";
  dialogResult.resultingLocalFile = null;

  var fp = null;
  try {
    fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  } catch (e) {}
  if (!fp) {
    return dialogResult;
  }

  // determine prompt string based on type of saving we'll do
  var promptString;
  if (aDoSaveAsText || aEditorType == "text") {
    promptString = GetString("SaveTextAs");
  } else {
    promptString = GetString("SaveDocumentAs");
  }

  fp.init(window, promptString, nsIFilePicker.modeSave);

  // Set filters according to the type of output
  if (aDoSaveAsText) {
    fp.appendFilters(nsIFilePicker.filterText);
  } else {
    fp.appendFilters(nsIFilePicker.filterHTML);
  }
  fp.appendFilters(nsIFilePicker.filterAll);

  // now let's actually set the filepicker's suggested filename
  var suggestedFileName = GetSuggestedFileName(aDocumentURLString, aMIMEType);
  if (suggestedFileName) {
    fp.defaultString = suggestedFileName;
  }

  // set the file picker's current directory
  // assuming we have information needed (like prior saved location)
  try {
    var fileHandler = GetFileProtocolHandler();

    var isLocalFile = true;
    try {
      let docURI = Services.io.newURI(
        aDocumentURLString,
        GetCurrentEditor().documentCharacterSet
      );
      isLocalFile = docURI.schemeIs("file");
    } catch (e) {}

    var parentLocation = null;
    if (isLocalFile) {
      var fileLocation = fileHandler.getFileFromURLSpec(aDocumentURLString); // this asserts if url is not local
      parentLocation = fileLocation.parent;
    }
    if (parentLocation) {
      // Save current filepicker's default location
      if ("gFilePickerDirectory" in window) {
        gFilePickerDirectory = fp.displayDirectory;
      }

      fp.displayDirectory = parentLocation;
    } else {
      // Initialize to the last-used directory for the particular type (saved in prefs)
      SetFilePickerDirectory(fp, aEditorType);
    }
  } catch (e) {}

  return new Promise(resolve => {
    fp.open(rv => {
      dialogResult.filepickerClick = rv;
      if (rv != nsIFilePicker.returnCancel && fp.file) {
        // Allow OK and replace.
        // reset urlstring to new save location
        dialogResult.resultingURIString = fileHandler.getURLSpecFromFile(
          fp.file
        );
        dialogResult.resultingLocalFile = fp.file;
        SaveFilePickerDirectory(fp, aEditorType);
        resolve(dialogResult);
      } else if ("gFilePickerDirectory" in window && gFilePickerDirectory) {
        fp.displayDirectory = gFilePickerDirectory;
        resolve(null);
      }
    });
  });
}

/**
 * If needed, prompt for document title and set the document title to the
 * preferred value.
 * @return true if the title was set up successfully;
 *         false if the user cancelled the title prompt
 */
function PromptAndSetTitleIfNone() {
  if (GetDocumentTitle()) {
    // we have a title; no need to prompt!
    return true;
  }

  let result = { value: null };
  let captionStr = GetString("DocumentTitle");
  let msgStr = GetString("NeedDocTitle") + "\n" + GetString("DocTitleHelp");
  let confirmed = Services.prompt.prompt(
    window,
    captionStr,
    msgStr,
    result,
    null,
    { value: 0 }
  );
  if (confirmed) {
    SetDocumentTitle(TrimString(result.value));
  }

  return confirmed;
}

var gPersistObj;

// Don't forget to do these things after calling OutputFileWithPersistAPI:
// we need to update the uri before notifying listeners
//    if (doUpdateURI)
//      SetDocumentURI(docURI);
//    UpdateWindowTitle();
//    if (!aSaveCopy)
//      editor.resetModificationCount();
// this should cause notification to listeners that document has changed

const webPersist = Ci.nsIWebBrowserPersist;
function OutputFileWithPersistAPI(
  editorDoc,
  aDestinationLocation,
  aRelatedFilesParentDir,
  aMimeType
) {
  gPersistObj = null;
  var editor = GetCurrentEditor();
  try {
    editor.forceCompositionEnd();
  } catch (e) {}

  var isLocalFile = false;
  try {
    aDestinationLocation.QueryInterface(Ci.nsIFile);
    isLocalFile = true;
  } catch (e) {
    try {
      var tmp = aDestinationLocation.QueryInterface(Ci.nsIURI);
      isLocalFile = tmp.schemeIs("file");
    } catch (e) {}
  }

  try {
    // we should supply a parent directory if/when we turn on functionality to save related documents
    var persistObj = Cc[
      "@mozilla.org/embedding/browser/nsWebBrowserPersist;1"
    ].createInstance(webPersist);
    persistObj.progressListener = gEditorOutputProgressListener;

    var wrapColumn = GetWrapColumn();
    var outputFlags = GetOutputFlags(aMimeType, wrapColumn);

    // for 4.x parity as well as improving readability of file locally on server
    // this will always send crlf for upload (http/ftp)
    if (!isLocalFile) {
      // if we aren't saving locally then send both cr and lf
      outputFlags |=
        webPersist.ENCODE_FLAGS_CR_LINEBREAKS |
        webPersist.ENCODE_FLAGS_LF_LINEBREAKS;

      // we want to serialize the output for all remote publishing
      // some servers can handle only one connection at a time
      // some day perhaps we can make this user-configurable per site?
      persistObj.persistFlags =
        persistObj.persistFlags | webPersist.PERSIST_FLAGS_SERIALIZE_OUTPUT;
    }

    // note: we always want to set the replace existing files flag since we have
    // already given user the chance to not replace an existing file (file picker)
    // or the user picked an option where the file is implicitly being replaced (save)
    persistObj.persistFlags =
      persistObj.persistFlags |
      webPersist.PERSIST_FLAGS_NO_BASE_TAG_MODIFICATIONS |
      webPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
      webPersist.PERSIST_FLAGS_DONT_FIXUP_LINKS |
      webPersist.PERSIST_FLAGS_DONT_CHANGE_FILENAMES |
      webPersist.PERSIST_FLAGS_FIXUP_ORIGINAL_DOM;
    persistObj.saveDocument(
      editorDoc,
      aDestinationLocation,
      aRelatedFilesParentDir,
      aMimeType,
      outputFlags,
      wrapColumn
    );
    gPersistObj = persistObj;
  } catch (e) {
    dump("caught an error, bail\n");
    return false;
  }

  return true;
}

// returns output flags based on mimetype, wrapCol and prefs
function GetOutputFlags(aMimeType, aWrapColumn) {
  var outputFlags = 0;
  var editor = GetCurrentEditor();
  var outputEntity =
    editor && editor.documentCharacterSet == "ISO-8859-1"
      ? webPersist.ENCODE_FLAGS_ENCODE_LATIN1_ENTITIES
      : webPersist.ENCODE_FLAGS_ENCODE_BASIC_ENTITIES;
  if (aMimeType == "text/plain") {
    // When saving in "text/plain" format, always do formatting
    outputFlags |= webPersist.ENCODE_FLAGS_FORMATTED;
  } else {
    // Should we prettyprint? Check the pref
    if (Services.prefs.getBoolPref("editor.prettyprint")) {
      outputFlags |= webPersist.ENCODE_FLAGS_FORMATTED;
    }

    try {
      // How much entity names should we output? Check the pref
      switch (Services.prefs.getCharPref("editor.encode_entity")) {
        case "basic":
          outputEntity = webPersist.ENCODE_FLAGS_ENCODE_BASIC_ENTITIES;
          break;
        case "latin1":
          outputEntity = webPersist.ENCODE_FLAGS_ENCODE_LATIN1_ENTITIES;
          break;
        case "html":
          outputEntity = webPersist.ENCODE_FLAGS_ENCODE_HTML_ENTITIES;
          break;
        case "none":
          outputEntity = 0;
          break;
      }
    } catch (e) {}
  }
  outputFlags |= outputEntity;

  if (aWrapColumn > 0) {
    outputFlags |= webPersist.ENCODE_FLAGS_WRAP;
  }

  return outputFlags;
}

// returns number of column where to wrap
const nsIWebBrowserPersist = Ci.nsIWebBrowserPersist;
function GetWrapColumn() {
  try {
    return GetCurrentEditor().wrapWidth;
  } catch (e) {}
  return 0;
}

const gShowDebugOutputStateChange = false;
const gShowDebugOutputProgress = false;
const gShowDebugOutputStatusChange = false;

const gShowDebugOutputLocationChange = false;
const gShowDebugOutputSecurityChange = false;

const nsIWebProgressListener = Ci.nsIWebProgressListener;
const nsIChannel = Ci.nsIChannel;

const kErrorBindingAborted = 2152398850;
const kErrorBindingRedirected = 2152398851;
const kFileNotFound = 2152857618;

var gEditorOutputProgressListener = {
  /* eslint-disable complexity */
  onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
    var editor = GetCurrentEditor();

    // Use this to access onStateChange flags
    var requestSpec;
    try {
      var channel = aRequest.QueryInterface(nsIChannel);
      requestSpec = StripUsernamePasswordFromURI(channel.URI);
    } catch (e) {
      if (gShowDebugOutputStateChange) {
        dump("***** onStateChange; NO REQUEST CHANNEL\n");
      }
    }

    var pubSpec;
    if (gPublishData) {
      pubSpec =
        gPublishData.publishUrl + gPublishData.docDir + gPublishData.filename;
    }

    if (gShowDebugOutputStateChange) {
      dump("\n***** onStateChange request: " + requestSpec + "\n");
      dump("      state flags: ");

      if (aStateFlags & nsIWebProgressListener.STATE_START) {
        dump(" STATE_START, ");
      }
      if (aStateFlags & nsIWebProgressListener.STATE_STOP) {
        dump(" STATE_STOP, ");
      }
      if (aStateFlags & nsIWebProgressListener.STATE_IS_NETWORK) {
        dump(" STATE_IS_NETWORK ");
      }

      dump(
        `\n * requestSpec=${requestSpec}, pubSpec=${pubSpec}, aStatus=${aStatus}\n`
      );

      DumpDebugStatus(aStatus);
    }
    // The rest only concerns publishing, so bail out if no dialog
    if (!gProgressDialog) {
      return;
    }

    // Detect start of file upload of any file:
    // (We ignore any START messages after gPersistObj says publishing is finished
    if (
      aStateFlags & nsIWebProgressListener.STATE_START &&
      gPersistObj &&
      requestSpec &&
      gPersistObj.currentState != gPersistObj.PERSIST_STATE_FINISHED
    ) {
      document
        .getElementById("navigator-throbber")
        .setAttribute("busy", "true");
      try {
        // Add url to progress dialog's list showing each file uploading
        gProgressDialog.SetProgressStatus(GetFilename(requestSpec), "busy");
      } catch (e) {}
    }

    // Detect end of file upload of any file:
    if (aStateFlags & nsIWebProgressListener.STATE_STOP) {
      document.getElementById("navigator-throbber").removeAttribute("busy");
      // ignore aStatus == kErrorBindingAborted; check http response for possible errors
      try {
        // check http channel for response: 200 range is ok; other ranges are not
        var httpChannel = aRequest.QueryInterface(Ci.nsIHttpChannel);
        var httpResponse = httpChannel.responseStatus;
        if (httpResponse < 200 || httpResponse >= 300) {
          // Not a real error but enough to pass check below.
          aStatus = httpResponse;
        } else if (aStatus == kErrorBindingAborted) {
          aStatus = 0;
        }

        if (gShowDebugOutputStateChange) {
          dump("http response is: " + httpResponse + "\n");
        }
      } catch (e) {
        if (aStatus == kErrorBindingAborted) {
          aStatus = 0;
        }
      }

      // We abort publishing for all errors except if image src file is not found
      var abortPublishing = aStatus != 0 && aStatus != kFileNotFound;

      // Notify progress dialog when we receive the STOP
      //  notification for a file if there was an error
      //  or a successful finish
      //  (Check requestSpec to be sure message is for destination url)
      if (
        aStatus != 0 ||
        (requestSpec &&
          requestSpec.startsWith(GetScheme(gPublishData.publishUrl)))
      ) {
        try {
          gProgressDialog.SetProgressFinished(
            GetFilename(requestSpec),
            aStatus
          );
        } catch (e) {}
      }

      if (abortPublishing) {
        // Cancel publishing
        gPersistObj.cancelSave();

        // Don't do any commands after failure
        gCommandAfterPublishing = null;

        // Restore original document to undo image src url adjustments
        if (gRestoreDocumentSource) {
          try {
            editor.rebuildDocumentFromSource(gRestoreDocumentSource);

            // Clear transaction cache since we just did a potentially
            //  very large insert and this will eat up memory
            editor.clearUndoRedo();
          } catch (e) {}
        }

        // Notify progress dialog that we're finished
        //  and keep open to show error
        gProgressDialog.SetProgressFinished(null, 0);

        // We don't want to change location or reset mod count, etc.
        return;
      }

      // XXX HACK: "file://" protocol is not supported in network code
      //    (bug 151867 filed to add this support, bug 151869 filed
      //     to remove this and other code in nsIWebBrowserPersist)
      //    nsIWebBrowserPersist *does* copy the file(s), but we don't
      //    get normal onStateChange messages.

      // Case 1: If images are included, we get fairly normal
      //    STATE_START/STATE_STOP & STATE_IS_NETWORK messages associated with the image files,
      //    thus we must finish HTML file progress below

      // Case 2: If just HTML file is uploaded, we get STATE_START and STATE_STOP
      //    notification with a null "requestSpec", and
      //    the gPersistObj is destroyed before we get here!
      //    So create an new object so we can flow through normal processing below
      if (
        !requestSpec &&
        GetScheme(gPublishData.publishUrl) == "file" &&
        (!gPersistObj ||
          gPersistObj.currentState ==
            nsIWebBrowserPersist.PERSIST_STATE_FINISHED)
      ) {
        aStateFlags |= nsIWebProgressListener.STATE_IS_NETWORK;
        if (!gPersistObj) {
          gPersistObj = {
            result: aStatus,
            currentState: nsIWebBrowserPersist.PERSIST_STATE_FINISHED,
          };
        }
      }

      // STATE_IS_NETWORK signals end of publishing, as does the gPersistObj.currentState
      if (
        aStateFlags & nsIWebProgressListener.STATE_IS_NETWORK &&
        gPersistObj.currentState == nsIWebBrowserPersist.PERSIST_STATE_FINISHED
      ) {
        if (GetScheme(gPublishData.publishUrl) == "file") {
          // XXX "file://" hack: We don't get notified about the HTML file, so end progress for it
          // (This covers both "Case 1 and 2" described above)
          gProgressDialog.SetProgressFinished(
            gPublishData.filename,
            gPersistObj.result
          );
        }

        if (gPersistObj.result == 0) {
          // All files are finished and publishing succeeded (some images may have failed)
          try {
            // Make a new docURI from the "browse location" in case "publish location" was FTP
            // We need to set document uri before notifying listeners
            var docUrl = GetDocUrlFromPublishData(gPublishData);
            SetDocumentURI(
              Services.io.newURI(docUrl, editor.documentCharacterSet)
            );

            UpdateWindowTitle();

            // this should cause notification to listeners that doc has changed
            editor.resetModificationCount();

            // Set UI based on whether we're editing a remote or local url
            // Why is urlstring undefined?
            /* eslint-disable-next-line no-undef */
            SetSaveAndPublishUI(urlstring);
          } catch (e) {}

          // Save publishData to prefs
          if (gPublishData) {
            if (gPublishData.savePublishData) {
              // We published successfully, so we can safely
              //  save docDir and otherDir to prefs
              gPublishData.saveDirs = true;
              SavePublishDataToPrefs(gPublishData);
            } else {
              SavePassword(gPublishData);
            }
          }

          // Ask progress dialog to close, but it may not
          // if user checked checkbox to keep it open
          gProgressDialog.RequestCloseDialog();
        } else {
          // We previously aborted publishing because of error:
          //   Calling gPersistObj.cancelSave() resulted in a non-zero gPersistObj.result,
          //   so notify progress dialog we're finished
          gProgressDialog.SetProgressFinished(null, 0);
        }
      }
    }
  },
  /* eslint-enable complexity */

  onProgressChange(
    aWebProgress,
    aRequest,
    aCurSelfProgress,
    aMaxSelfProgress,
    aCurTotalProgress,
    aMaxTotalProgress
  ) {
    if (!gPersistObj) {
      return;
    }

    if (gShowDebugOutputProgress) {
      dump(
        "\n onProgressChange: gPersistObj.result=" + gPersistObj.result + "\n"
      );
      try {
        var channel = aRequest.QueryInterface(nsIChannel);
        dump("***** onProgressChange request: " + channel.URI.spec + "\n");
      } catch (e) {}
      dump(
        "*****       self:  " +
          aCurSelfProgress +
          " / " +
          aMaxSelfProgress +
          "\n"
      );
      dump(
        "*****       total: " +
          aCurTotalProgress +
          " / " +
          aMaxTotalProgress +
          "\n\n"
      );

      if (gPersistObj.currentState == gPersistObj.PERSIST_STATE_READY) {
        dump(" Persister is ready to save data\n\n");
      } else if (gPersistObj.currentState == gPersistObj.PERSIST_STATE_SAVING) {
        dump(" Persister is saving data.\n\n");
      } else if (
        gPersistObj.currentState == gPersistObj.PERSIST_STATE_FINISHED
      ) {
        dump(" PERSISTER HAS FINISHED SAVING DATA\n\n\n");
      }
    }
  },

  onLocationChange(aWebProgress, aRequest, aLocation, aFlags) {
    if (gShowDebugOutputLocationChange) {
      dump("***** onLocationChange: " + aLocation.spec + "\n");
      try {
        var channel = aRequest.QueryInterface(nsIChannel);
        dump("*****          request: " + channel.URI.spec + "\n");
      } catch (e) {}
    }
  },

  onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {
    if (gShowDebugOutputStatusChange) {
      dump("***** onStatusChange: " + aMessage + "\n");
      try {
        var channel = aRequest.QueryInterface(nsIChannel);
        dump("*****        request: " + channel.URI.spec + "\n");
      } catch (e) {
        dump("          couldn't get request\n");
      }

      DumpDebugStatus(aStatus);

      if (gPersistObj) {
        if (gPersistObj.currentState == gPersistObj.PERSIST_STATE_READY) {
          dump(" Persister is ready to save data\n\n");
        } else if (
          gPersistObj.currentState == gPersistObj.PERSIST_STATE_SAVING
        ) {
          dump(" Persister is saving data.\n\n");
        } else if (
          gPersistObj.currentState == gPersistObj.PERSIST_STATE_FINISHED
        ) {
          dump(" PERSISTER HAS FINISHED SAVING DATA\n\n\n");
        }
      }
    }
  },

  onSecurityChange(aWebProgress, aRequest, state) {
    if (gShowDebugOutputSecurityChange) {
      try {
        var channel = aRequest.QueryInterface(nsIChannel);
        dump("***** onSecurityChange request: " + channel.URI.spec + "\n");
      } catch (e) {}
    }
  },

  onContentBlockingEvent(aWebProgress, aRequest, aEvent) {},

  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
    "nsIPrompt",
    "nsIAuthPrompt",
  ]),

  // nsIPrompt
  alert(dlgTitle, text) {
    Services.prompt.alert(
      gProgressDialog ? gProgressDialog : window,
      dlgTitle,
      text
    );
  },
  alertCheck(dialogTitle, text, checkBoxLabel, checkObj) {
    Services.prompt.alert(window, dialogTitle, text);
  },
  confirm(dlgTitle, text) {
    return ConfirmWithTitle(dlgTitle, text, null, null);
  },
  confirmCheck(dlgTitle, text, checkBoxLabel, checkObj) {
    Services.prompt.confirmEx(
      window,
      dlgTitle,
      text,
      nsIPromptService.STD_OK_CANCEL_BUTTONS,
      "",
      "",
      "",
      checkBoxLabel,
      checkObj
    );
  },
  confirmEx(
    dlgTitle,
    text,
    btnFlags,
    btn0Title,
    btn1Title,
    btn2Title,
    checkBoxLabel,
    checkVal
  ) {
    return Services.prompt.confirmEx(
      window,
      dlgTitle,
      text,
      btnFlags,
      btn0Title,
      btn1Title,
      btn2Title,
      checkBoxLabel,
      checkVal
    );
  },

  /** ***********************************************************************
   * gEditorOutputProgressListener needs to implement both nsIPrompt       *
   * (providing alert) and nsIAuthPrompt (providing password saving).      *
   * Unfortunately, both interfaces specify prompt/promptPassword/         *
   * promptUsernameAndPassword, albeit with conflicting method signatures. *
   * Luckily, though, we only make use of their nsIAuthPrompt variants,    *
   * hence we can comment out the nsIPrompt ones here to avoid JavaScript  *
   * strict mode clutter. See bug 371174 for more information.             *
   *************************************************************************
  prompt : function(dlgTitle, text, inoutText, checkBoxLabel, checkObj)
  {
    return Services.prompt.prompt(window, dlgTitle, text, inoutText, checkBoxLabel, checkObj);
  },
  promptPassword : function(dlgTitle, text, pwObj, checkBoxLabel, savePWObj)
  {
    var ret = false;
    try {
      // Note difference with nsIAuthPrompt::promptPassword, which has
      // just "in" savePassword param, while nsIPrompt is "inout"
      // Initialize with user's previous preference for this site
      if (gPublishData)
        savePWObj.value = gPublishData.savePassword;

      ret = Services.prompt.promptPassword(gProgressDialog ? gProgressDialog : window,
                                           dlgTitle, text, pwObj, checkBoxLabel, savePWObj);

      if (!ret)
        setTimeout(CancelPublishing, 0);

      if (ret && gPublishData)
        UpdateUsernamePasswordFromPrompt(gPublishData, gPublishData.username, pwObj.value, savePWObj.value);
    } catch(e) {}

    return ret;
  },
  promptUsernameAndPassword : function(dlgTitle, text, userObj, pwObj, checkBoxLabel, savePWObj)
  {
    var ret = PromptUsernameAndPassword(dlgTitle, text, savePWObj.value, userObj, pwObj);
    if (!ret)
      setTimeout(CancelPublishing, 0);

    return ret;
  },
   *************************************************************************/

  select(dlgTitle, text, selectList, outSelection) {
    return Services.prompt.select(
      window,
      dlgTitle,
      text,
      selectList,
      outSelection
    );
  },

  // nsIAuthPrompt
  prompt(dlgTitle, text, pwrealm, savePW, defaultText, result) {
    var ret = Services.prompt.prompt(
      gProgressDialog ? gProgressDialog : window,
      dlgTitle,
      text,
      defaultText,
      pwrealm,
      savePWObj
    );
    if (!ret) {
      setTimeout(CancelPublishing, 0);
    }
    return ret;
  },

  promptUsernameAndPassword(dlgTitle, text, pwrealm, savePW, userObj, pwObj) {
    var ret = PromptUsernameAndPassword(dlgTitle, text, savePW, userObj, pwObj);
    if (!ret) {
      setTimeout(CancelPublishing, 0);
    }
    return ret;
  },

  promptPassword(dlgTitle, text, pwrealm, savePW, pwObj) {
    var ret = false;
    try {
      // Note difference with nsIPrompt::promptPassword, which has
      // "inout" savePassword param, while nsIAuthPrompt is just "in"
      // Also nsIAuth doesn't supply "checkBoxLabel"
      // Initialize with user's previous preference for this site
      var savePWObj = { value: savePW };
      // Initialize with user's previous preference for this site
      if (gPublishData) {
        savePWObj.value = gPublishData.savePassword;
      }

      ret = Services.prompt.promptPassword(
        gProgressDialog ? gProgressDialog : window,
        dlgTitle,
        text,
        pwObj,
        GetString("SavePassword"),
        savePWObj
      );

      if (!ret) {
        setTimeout(CancelPublishing, 0);
      }

      if (ret && gPublishData) {
        UpdateUsernamePasswordFromPrompt(
          gPublishData,
          gPublishData.username,
          pwObj.value,
          savePWObj.value
        );
      }
    } catch (e) {}

    return ret;
  },
};

function PromptUsernameAndPassword(dlgTitle, text, savePW, userObj, pwObj) {
  // HTTP prompts us twice even if user Cancels from 1st attempt!
  // So never put up dialog if there's no publish data
  if (!gPublishData) {
    return false;
  }

  var ret = false;
  try {
    var savePWObj = { value: savePW };

    // Initialize with user's previous preference for this site
    if (gPublishData) {
      // HTTP put uses this dialog if either username or password is bad,
      //   so prefill username input field with the previous value for modification
      savePWObj.value = gPublishData.savePassword;
      if (!userObj.value) {
        userObj.value = gPublishData.username;
      }
    }

    ret = Services.prompt.promptUsernameAndPassword(
      gProgressDialog ? gProgressDialog : window,
      dlgTitle,
      text,
      userObj,
      pwObj,
      GetString("SavePassword"),
      savePWObj
    );
    if (ret && gPublishData) {
      UpdateUsernamePasswordFromPrompt(
        gPublishData,
        userObj.value,
        pwObj.value,
        savePWObj.value
      );
    }
  } catch (e) {}

  return ret;
}

/* eslint-disable complexity */
function DumpDebugStatus(aStatus) {
  // see nsError.h and netCore.h and ftpCore.h

  if (aStatus == kErrorBindingAborted) {
    dump("***** status is NS_BINDING_ABORTED\n");
  } else if (aStatus == kErrorBindingRedirected) {
    dump("***** status is NS_BINDING_REDIRECTED\n");
  } else if (aStatus == 2152398859) {
    // in netCore.h 11
    dump("***** status is ALREADY_CONNECTED\n");
  } else if (aStatus == 2152398860) {
    // in netCore.h 12
    dump("***** status is NOT_CONNECTED\n");
  } else if (aStatus == 2152398861) {
    //  in nsISocketTransportService.idl 13
    dump("***** status is CONNECTION_REFUSED\n");
  } else if (aStatus == 2152398862) {
    // in nsISocketTransportService.idl 14
    dump("***** status is NET_TIMEOUT\n");
  } else if (aStatus == 2152398863) {
    // in netCore.h 15
    dump("***** status is IN_PROGRESS\n");
  } else if (aStatus == 2152398864) {
    // 0x804b0010 in netCore.h 16
    dump("***** status is OFFLINE\n");
  } else if (aStatus == 2152398865) {
    // in netCore.h 17
    dump("***** status is NO_CONTENT\n");
  } else if (aStatus == 2152398866) {
    // in netCore.h 18
    dump("***** status is UNKNOWN_PROTOCOL\n");
  } else if (aStatus == 2152398867) {
    // in netCore.h 19
    dump("***** status is PORT_ACCESS_NOT_ALLOWED\n");
  } else if (aStatus == 2152398868) {
    // in nsISocketTransportService.idl 20
    dump("***** status is NET_RESET\n");
  } else if (aStatus == 2152398869) {
    // in ftpCore.h 21
    dump("***** status is FTP_LOGIN\n");
  } else if (aStatus == 2152398870) {
    // in ftpCore.h 22
    dump("***** status is FTP_CWD\n");
  } else if (aStatus == 2152398871) {
    // in ftpCore.h 23
    dump("***** status is FTP_PASV\n");
  } else if (aStatus == 2152398872) {
    // in ftpCore.h 24
    dump("***** status is FTP_PWD\n");
  } else if (aStatus == 2152857601) {
    dump("***** status is UNRECOGNIZED_PATH\n");
  } else if (aStatus == 2152857602) {
    dump("***** status is UNRESOLABLE SYMLINK\n");
  } else if (aStatus == 2152857604) {
    dump("***** status is UNKNOWN_TYPE\n");
  } else if (aStatus == 2152857605) {
    dump("***** status is DESTINATION_NOT_DIR\n");
  } else if (aStatus == 2152857606) {
    dump("***** status is TARGET_DOES_NOT_EXIST\n");
  } else if (aStatus == 2152857608) {
    dump("***** status is ALREADY_EXISTS\n");
  } else if (aStatus == 2152857609) {
    dump("***** status is INVALID_PATH\n");
  } else if (aStatus == 2152857610) {
    dump("***** status is DISK_FULL\n");
  } else if (aStatus == 2152857612) {
    dump("***** status is NOT_DIRECTORY\n");
  } else if (aStatus == 2152857613) {
    dump("***** status is IS_DIRECTORY\n");
  } else if (aStatus == 2152857614) {
    dump("***** status is IS_LOCKED\n");
  } else if (aStatus == 2152857615) {
    dump("***** status is TOO_BIG\n");
  } else if (aStatus == 2152857616) {
    dump("***** status is NO_DEVICE_SPACE\n");
  } else if (aStatus == 2152857617) {
    dump("***** status is NAME_TOO_LONG\n");
  } else if (aStatus == 2152857618) {
    // 80520012
    dump("***** status is FILE_NOT_FOUND\n");
  } else if (aStatus == 2152857619) {
    dump("***** status is READ_ONLY\n");
  } else if (aStatus == 2152857620) {
    dump("***** status is DIR_NOT_EMPTY\n");
  } else if (aStatus == 2152857621) {
    dump("***** status is ACCESS_DENIED\n");
  } else if (aStatus == 2152398878) {
    dump("***** status is ? (No connection or time out?)\n");
  } else {
    dump("***** status is " + aStatus + "\n");
  }
}
/* eslint-enable complexity */

// Update any data that the user supplied in a prompt dialog
function UpdateUsernamePasswordFromPrompt(
  publishData,
  username,
  password,
  savePassword
) {
  if (!publishData) {
    return;
  }

  // Set flag to save publish data after publishing if it changed in dialog
  //  and the "SavePassword" checkbox was checked
  //  or we already had site data for this site
  // (Thus we don't automatically create a site until user brings up Publish As dialog)
  publishData.savePublishData =
    (gPublishData.username != username || gPublishData.password != password) &&
    (savePassword || !publishData.notInSiteData);

  publishData.username = username;
  publishData.password = password;
  publishData.savePassword = savePassword;
}

const kSupportedTextMimeTypes = [
  "text/plain",
  "text/css",
  "text/rdf",
  "text/xsl",
  "text/javascript", // obsolete type
  "text/ecmascript", // obsolete type
  "application/javascript",
  "application/ecmascript",
  "application/x-javascript", // obsolete type
  "text/xul", // obsolete type
  "application/vnd.mozilla.xul+xml", // obsolete type
  "application/xhtml+xml",
];

function IsSupportedTextMimeType(aMimeType) {
  for (var i = 0; i < kSupportedTextMimeTypes.length; i++) {
    if (kSupportedTextMimeTypes[i] == aMimeType) {
      return true;
    }
  }
  return false;
}

/* eslint-disable complexity */
// throws an error or returns true if user attempted save; false if user canceled save
async function SaveDocument(aSaveAs, aSaveCopy, aMimeType) {
  var editor = GetCurrentEditor();
  if (!aMimeType || !editor) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_INITIALIZED);
  }

  var editorDoc = editor.document;
  if (!editorDoc) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_INITIALIZED);
  }

  // if we don't have the right editor type bail (we handle text and html)
  var editorType = GetCurrentEditorType();
  if (!["text", "html", "htmlmail", "textmail"].includes(editorType)) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  var saveAsTextFile = IsSupportedTextMimeType(aMimeType);

  // check if the file is to be saved is a format we don't understand; if so, bail
  if (
    aMimeType != kHTMLMimeType &&
    aMimeType != kXHTMLMimeType &&
    !saveAsTextFile
  ) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  if (saveAsTextFile) {
    aMimeType = "text/plain";
  }

  var urlstring = GetDocumentUrl();
  var mustShowFileDialog =
    aSaveAs || IsUrlAboutBlank(urlstring) || urlstring == "";

  // If editing a remote URL, force SaveAs dialog
  if (!mustShowFileDialog && GetScheme(urlstring) != "file") {
    mustShowFileDialog = true;
  }

  var doUpdateURI = false;
  var tempLocalFile = null;

  if (mustShowFileDialog) {
    try {
      // Prompt for title if we are saving to HTML
      if (!saveAsTextFile && editorType == "html") {
        var userContinuing = PromptAndSetTitleIfNone(); // not cancel
        if (!userContinuing) {
          return false;
        }
      }

      var dialogResult = await PromptForSaveLocation(
        saveAsTextFile,
        editorType,
        aMimeType,
        urlstring
      );
      if (!dialogResult) {
        return false;
      }

      // What is this unused 'replacing' var supposed to be doing?
      /* eslint-disable-next-line no-unused-vars */
      var replacing =
        dialogResult.filepickerClick == nsIFilePicker.returnReplace;

      urlstring = dialogResult.resultingURIString;
      tempLocalFile = dialogResult.resultingLocalFile;

      // update the new URL for the webshell unless we are saving a copy
      if (!aSaveCopy) {
        doUpdateURI = true;
      }
    } catch (e) {
      Cu.reportError(e);
      return false;
    }
  } // mustShowFileDialog

  var success = true;
  try {
    // if somehow we didn't get a local file but we did get a uri,
    // attempt to create the localfile if it's a "file" url
    var docURI;
    if (!tempLocalFile) {
      docURI = Services.io.newURI(urlstring, editor.documentCharacterSet);

      if (docURI.schemeIs("file")) {
        var fileHandler = GetFileProtocolHandler();
        tempLocalFile = fileHandler
          .getFileFromURLSpec(urlstring)
          .QueryInterface(Ci.nsIFile);
      }
    }

    // this is the location where the related files will go
    var relatedFilesDir = null;

    // Only change links or move files if pref is set
    // and we are saving to a new location
    if (Services.prefs.getBoolPref("editor.save_associated_files") && aSaveAs) {
      try {
        if (tempLocalFile) {
          // if we are saving to the same parent directory, don't set relatedFilesDir
          // grab old location, chop off file
          // grab new location, chop off file, compare
          var oldLocation = GetDocumentUrl();
          var oldLocationLastSlash = oldLocation.lastIndexOf("/");
          if (oldLocationLastSlash != -1) {
            oldLocation = oldLocation.slice(0, oldLocationLastSlash);
          }

          var relatedFilesDirStr = urlstring;
          var newLocationLastSlash = relatedFilesDirStr.lastIndexOf("/");
          if (newLocationLastSlash != -1) {
            relatedFilesDirStr = relatedFilesDirStr.slice(
              0,
              newLocationLastSlash
            );
          }
          if (
            oldLocation == relatedFilesDirStr ||
            IsUrlAboutBlank(oldLocation)
          ) {
            relatedFilesDir = null;
          } else {
            relatedFilesDir = tempLocalFile.parent;
          }
        } else {
          var lastSlash = urlstring.lastIndexOf("/");
          if (lastSlash != -1) {
            var relatedFilesDirString = urlstring.slice(0, lastSlash + 1); // include last slash
            relatedFilesDir = Services.io.newURI(
              relatedFilesDirString,
              editor.documentCharacterSet
            );
          }
        }
      } catch (e) {
        relatedFilesDir = null;
      }
    }

    let destinationLocation = tempLocalFile ? tempLocalFile : docURI;

    success = OutputFileWithPersistAPI(
      editorDoc,
      destinationLocation,
      relatedFilesDir,
      aMimeType
    );
  } catch (e) {
    success = false;
  }

  if (success) {
    try {
      if (doUpdateURI) {
        // If a local file, we must create a new uri from nsIFile
        if (tempLocalFile) {
          docURI = GetFileProtocolHandler().newFileURI(tempLocalFile);
        }

        // We need to set new document uri before notifying listeners
        SetDocumentURI(docURI);
      }

      // Update window title to show possibly different filename
      // This also covers problem that after undoing a title change,
      //   window title loses the extra [filename] part that this adds
      UpdateWindowTitle();

      if (!aSaveCopy) {
        editor.resetModificationCount();
      }
      // this should cause notification to listeners that document has changed

      // Set UI based on whether we're editing a remote or local url
      SetSaveAndPublishUI(urlstring);
    } catch (e) {}
  } else {
    Services.prompt.alert(
      window,
      GetString("SaveDocument"),
      GetString("SaveFileFailed")
    );
  }
  return success;
}
/* eslint-enable complexity */

function SetDocumentURI(uri) {
  try {
    // XXX WE'LL NEED TO GET "CURRENT" CONTENT FRAME ONCE MULTIPLE EDITORS ARE ALLOWED
    GetCurrentEditorElement().docShell.setCurrentURI(uri);
  } catch (e) {
    dump("SetDocumentURI:\n" + e + "\n");
  }
}

// -------------------------------  Publishing
var gPublishData;
var gProgressDialog;
var gCommandAfterPublishing = null;
var gRestoreDocumentSource;

function Publish(publishData) {
  if (!publishData) {
    return false;
  }

  // Set data in global for username password requests
  //  and to do "post saving" actions after monitoring nsIWebProgressListener messages
  //  and we are sure file transfer was successful
  gPublishData = publishData;

  gPublishData.docURI = CreateURIFromPublishData(publishData, true);
  if (!gPublishData.docURI) {
    Services.prompt.alert(
      window,
      GetString("Publish"),
      GetString("PublishFailed")
    );
    return false;
  }

  if (gPublishData.publishOtherFiles) {
    gPublishData.otherFilesURI = CreateURIFromPublishData(publishData, false);
  } else {
    gPublishData.otherFilesURI = null;
  }

  if (gShowDebugOutputStateChange) {
    dump(
      "\n *** publishData: PublishUrl=" +
        publishData.publishUrl +
        ", BrowseUrl=" +
        publishData.browseUrl +
        ", Username=" +
        publishData.username +
        ", Dir=" +
        publishData.docDir +
        ", Filename=" +
        publishData.filename +
        "\n"
    );
    dump(
      " * gPublishData.docURI.spec w/o pass=" +
        StripPassword(gPublishData.docURI.spec) +
        ", PublishOtherFiles=" +
        gPublishData.publishOtherFiles +
        "\n"
    );
  }

  // XXX Missing username will make FTP fail
  // and it won't call us for prompt dialog (bug 132320)
  // (It does prompt if just password is missing)
  // So we should do the prompt ourselves before trying to publish
  if (GetScheme(publishData.publishUrl) == "ftp" && !publishData.username) {
    var message = GetString("PromptFTPUsernamePassword").replace(
      /%host%/,
      GetHost(publishData.publishUrl)
    );
    var savePWobj = { value: publishData.savePassword };
    var userObj = { value: publishData.username };
    var pwObj = { value: publishData.password };
    if (
      !PromptUsernameAndPassword(
        GetString("Prompt"),
        message,
        savePWobj,
        userObj,
        pwObj
      )
    ) {
      // User canceled out of dialog.
      return false;
    }

    // Reset data in URI objects
    gPublishData.docURI.username = publishData.username;
    gPublishData.docURI.password = publishData.password;

    if (gPublishData.otherFilesURI) {
      gPublishData.otherFilesURI.username = publishData.username;
      gPublishData.otherFilesURI.password = publishData.password;
    }
  }

  try {
    // We launch dialog as a dependent
    // Don't allow editing document!
    SetDocumentEditable(false);

    // Start progress monitoring
    gProgressDialog = window.openDialog(
      "chrome://editor/content/EditorPublishProgress.xhtml",
      "_blank",
      "chrome,dependent,titlebar",
      gPublishData,
      gPersistObj
    );
  } catch (e) {}

  // Network transfer is often too quick for the progress dialog to be initialized
  //  and we can completely miss messages for quickly-terminated bad URLs,
  //  so we can't call OutputFileWithPersistAPI right away.
  // StartPublishing() is called at the end of the dialog's onload method
  return true;
}

function StartPublishing() {
  var editor = GetCurrentEditor();
  if (editor && gPublishData && gPublishData.docURI && gProgressDialog) {
    gRestoreDocumentSource = null;

    // Save backup document since nsIWebBrowserPersist changes image src urls
    // but we only need to do this if publishing images and other related files
    if (gPublishData.otherFilesURI) {
      try {
        gRestoreDocumentSource = editor.outputToString(
          editor.contentsMIMEType,
          kOutputEncodeW3CEntities
        );
      } catch (e) {}
    }

    OutputFileWithPersistAPI(
      editor.document,
      gPublishData.docURI,
      gPublishData.otherFilesURI,
      editor.contentsMIMEType
    );
    return gPersistObj;
  }
  return null;
}

function CancelPublishing() {
  try {
    gPersistObj.cancelSave();
    gProgressDialog.SetProgressStatusCancel();
  } catch (e) {}

  // If canceling publishing do not do any commands after this
  gCommandAfterPublishing = null;

  if (gProgressDialog) {
    // Close Progress dialog
    // (this will call FinishPublishing())
    gProgressDialog.CloseDialog();
  } else {
    FinishPublishing();
  }
}

function FinishPublishing() {
  SetDocumentEditable(true);
  gProgressDialog = null;
  gPublishData = null;
  gRestoreDocumentSource = null;

  if (gCommandAfterPublishing) {
    // Be sure to null out the global now in case of trouble when executing command
    var command = gCommandAfterPublishing;
    gCommandAfterPublishing = null;
    goDoCommand(command);
  }
}

// Create a nsIURI object filled in with all required publishing info
function CreateURIFromPublishData(publishData, doDocUri) {
  if (!publishData || !publishData.publishUrl) {
    return null;
  }

  var URI;
  try {
    var spec = publishData.publishUrl;
    if (doDocUri) {
      spec += FormatDirForPublishing(publishData.docDir) + publishData.filename;
    } else {
      spec += FormatDirForPublishing(publishData.otherDir);
    }

    URI = Services.io.newURI(spec, GetCurrentEditor().documentCharacterSet);

    if (publishData.username) {
      URI.username = publishData.username;
    }
    if (publishData.password) {
      URI.password = publishData.password;
    }
  } catch (e) {}

  return URI;
}

// Resolve the correct "http:" document URL when publishing via ftp
function GetDocUrlFromPublishData(publishData) {
  if (!publishData || !publishData.filename || !publishData.publishUrl) {
    return "";
  }

  // If user was previously editing an "ftp" url, then keep that as the new scheme
  var url;

  // Always use the "HTTP" address if available
  // XXX Should we do some more validation here for bad urls???
  // Let's at least check for a scheme!
  if (!GetScheme(publishData.browseUrl)) {
    url = publishData.publishUrl;
  } else {
    url = publishData.browseUrl;
  }

  url += FormatDirForPublishing(publishData.docDir) + publishData.filename;

  if (GetScheme(url) == "ftp") {
    url = InsertUsernameIntoUrl(url, publishData.username);
  }

  return url;
}

function SetSaveAndPublishUI(urlstring) {
  // Be sure enabled state of toolbar buttons are correct
  goUpdateCommand("cmd_save");
  goUpdateCommand("cmd_publish");
}

function SetDocumentEditable(isDocEditable) {
  var editor = GetCurrentEditor();
  if (editor && editor.document) {
    try {
      var flags = editor.flags;
      editor.flags = isDocEditable
        ? (flags &= ~Ci.nsIEditor.eEditorReadonlyMask)
        : flags | Ci.nsIEditor.eEditorReadonlyMask;
    } catch (e) {}

    // update all commands
    window.updateCommands("create");
  }
}

// ****** end of save / publish **********//

var nsPublishSettingsCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    if (GetCurrentEditor()) {
      // Launch Publish Settings dialog

      window.ok = window.openDialog(
        "chrome://editor/content/EditorPublishSettings.xhtml",
        "_blank",
        "chrome,close,titlebar,modal",
        ""
      );
      return window.ok;
    }
    return false;
  },
};

var nsRevertCommand = {
  isCommandEnabled(aCommand, dummy) {
    return (
      IsDocumentEditable() &&
      IsDocumentModified() &&
      !IsUrlAboutBlank(GetDocumentUrl())
    );
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // Confirm with the user to abandon current changes
    // Put the page title in the message string
    let title = GetDocumentTitle();
    let msg = GetString("AbandonChanges").replace(/%title%/, title);

    let result = Services.prompt.confirmEx(
      window,
      GetString("RevertCaption"),
      msg,
      Services.prompt.BUTTON_TITLE_REVERT * Services.prompt.BUTTON_POS_0 +
        Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1,
      null,
      null,
      null,
      null,
      { value: 0 }
    );

    // Reload page if first button (Revert) was pressed
    if (result == 0) {
      CancelHTMLSource();
      EditorLoadUrl(GetDocumentUrl());
    }
  },
};

var nsCloseCommand = {
  isCommandEnabled(aCommand, dummy) {
    return GetCurrentEditor() != null;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    CloseWindow();
  },
};

async function CloseWindow() {
  // Check to make sure document is saved. "true" means allow "Don't Save" button,
  //   so user can choose to close without saving
  if (await CheckAndSaveDocument("cmd_close", true)) {
    if (window.InsertCharWindow) {
      SwitchInsertCharToAnotherEditorOrClose();
    }

    try {
      var basewin = window
        .getInterface(Ci.nsIWebNavigation)
        .QueryInterface(Ci.nsIDocShellTreeItem)
        .treeOwner.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIBaseWindow);
      basewin.destroy();
    } catch (e) {}
  }
}

var nsOpenRemoteCommand = {
  isCommandEnabled(aCommand, dummy) {
    // We can always do this.
    return true;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    var params = { action: "2", url: "" };
    openDialog(
      "chrome://communicator/content/openLocation.xhtml",
      "_blank",
      "chrome,modal,titlebar",
      params
    );
    var win = getTopWin();
    switch (params.action) {
      case "0": // current window
        win.focus();
        win.loadURI(params.url, null, null, true);
        break;
      case "1": // new window
        openDialog(
          getBrowserURL(),
          "_blank",
          "all,dialog=no",
          params.url,
          null,
          null,
          null,
          true
        );
        break;
      case "2": // edit
        editPage(params.url);
        break;
      case "3": // new tab
        win.focus();
        var browser = win.getBrowser();
        browser.selectedTab = browser.addTab(params.url, {
          allowThirdPartyFixup: true,
        });
        break;
      case "4": // private
        openNewPrivateWith(params.url);
        break;
      default:
        break;
    }
  },
};

var nsPreviewCommand = {
  isCommandEnabled(aCommand, dummy) {
    return (
      IsDocumentEditable() &&
      IsHTMLEditor() &&
      (DocumentHasBeenSaved() || IsDocumentModified())
    );
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  async doCommand(aCommand) {
    // Don't continue if user canceled during prompt for saving
    // DocumentHasBeenSaved will test if we have a URL and suppress "Don't Save" button if not
    if (!(await CheckAndSaveDocument("cmd_preview", DocumentHasBeenSaved()))) {
      return;
    }

    // Check if we saved again just in case?
    if (DocumentHasBeenSaved()) {
      let browser;
      try {
        // Find a browser with this URL
        let enumerator = Services.wm.getEnumerator("navigator:browser");

        var documentURI = GetDocumentUrl();
        while (enumerator.hasMoreElements()) {
          browser = enumerator.getNext();
          if (
            browser &&
            !browser.closed &&
            documentURI == browser.getBrowser().currentURI.spec
          ) {
            break;
          }

          browser = null;
        }
      } catch (ex) {}

      // If none found, open a new browser
      if (!browser) {
        browser = window.openDialog(
          getBrowserURL(),
          "_blank",
          "chrome,all,dialog=no",
          documentURI
        );
      } else {
        try {
          browser.BrowserReloadSkipCache();
          browser.focus();
        } catch (ex) {}
      }
    }
  },
};

var nsSendPageCommand = {
  isCommandEnabled(aCommand, dummy) {
    return (
      IsDocumentEditable() && (DocumentHasBeenSaved() || IsDocumentModified())
    );
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  async doCommand(aCommand) {
    // Don't continue if user canceled during prompt for saving
    // DocumentHasBeenSaved will test if we have a URL and suppress "Don't Save" button if not
    if (
      !(await CheckAndSaveDocument("cmd_editSendPage", DocumentHasBeenSaved()))
    ) {
      return;
    }

    // Check if we saved again just in case?
    if (DocumentHasBeenSaved()) {
      // Launch Messenger Composer window with current page as contents
      try {
        openComposeWindow(GetDocumentUrl(), GetDocumentTitle());
      } catch (ex) {
        dump("Cannot Send Page: " + ex + "\n");
      }
    }
  },
};

var nsPrintCommand = {
  isCommandEnabled(aCommand, dummy) {
    return true; // we can always do this
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // In editor.js
    SetEditMode(gPreviousNonSourceDisplayMode);
    try {
      let browser = GetCurrentEditorElement();
      PrintUtils.printWindow(browser.outerWindowID, browser);
    } catch (e) {}
  },
};

var nsPrintPreviewCommand = {
  isCommandEnabled(aCommand, dummy) {
    // We can always do this.
    return true;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // In editor.js
    SetEditMode(gPreviousNonSourceDisplayMode);
    try {
      PrintUtils.printPreview("editor", PrintPreviewListener);
    } catch (e) {}
  },
};

var nsPrintSetupCommand = {
  isCommandEnabled(aCommand, dummy) {
    return true; // we can always do this
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // In editor.js
    SetEditMode(gPreviousNonSourceDisplayMode);
    PrintUtils.showPageSetup();
  },
};

var nsFindReplaceCommand = {
  isCommandEnabled(aCommand, editorElement) {
    return editorElement.getEditor(editorElement.contentWindow) != null;
  },

  getCommandStateParams(aCommand, aParams, editorElement) {},
  doCommandParams(aCommand, aParams, editorElement) {},

  doCommand(aCommand, editorElement) {
    window.openDialog(
      "chrome://editor/content/EdReplace.xhtml",
      "_blank",
      "chrome,modal,titlebar",
      editorElement
    );
  },
};

var nsFindCommand = {
  isCommandEnabled(aCommand, editorElement) {
    return editorElement.getEditor(editorElement.contentWindow) != null;
  },

  getCommandStateParams(aCommand, aParams, editorElement) {},
  doCommandParams(aCommand, aParams, editorElement) {},

  doCommand(aCommand, editorElement) {
    document.getElementById("FindToolbar").onFindCommand();
  },
};

var nsFindAgainCommand = {
  isCommandEnabled(aCommand, editorElement) {
    // we can only do this if the search pattern is non-empty. Not sure how
    // to get that from here
    return editorElement.getEditor(editorElement.contentWindow) != null;
  },

  getCommandStateParams(aCommand, aParams, editorElement) {},
  doCommandParams(aCommand, aParams, editorElement) {},

  doCommand(aCommand, editorElement) {
    let findPrev = aCommand == "cmd_findPrev";
    document.getElementById("FindToolbar").onFindAgainCommand(findPrev);
  },
};

var nsRewrapCommand = {
  isCommandEnabled(aCommand, dummy) {
    return (
      IsDocumentEditable() &&
      !IsInHTMLSourceMode() &&
      GetCurrentEditor() instanceof Ci.nsIEditorMailSupport
    );
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // We only want to respect new lines when using the web composer.
    let respectNewLines = IsWebComposer();
    GetCurrentEditor()
      .QueryInterface(Ci.nsIEditorMailSupport)
      .rewrap(respectNewLines);
  },
};

var nsSpellingCommand = {
  isCommandEnabled(aCommand, dummy) {
    return (
      IsDocumentEditable() && !IsInHTMLSourceMode() && IsSpellCheckerInstalled()
    );
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.cancelSendMessage = false;
    try {
      var skipBlockQuotes =
        window.document.documentElement.getAttribute("windowtype") ==
        "msgcompose";
      window.openDialog(
        "chrome://editor/content/EdSpellCheck.xhtml",
        "_blank",
        "dialog,close,titlebar,modal,resizable",
        false,
        skipBlockQuotes,
        true
      );
    } catch (ex) {}
  },
};

// Validate using http://validator.w3.org/file-upload.html
var URL2Validate;
var nsValidateCommand = {
  isCommandEnabled(aCommand, dummy) {
    return GetCurrentEditor() != null;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  async doCommand(aCommand) {
    // If the document hasn't been modified,
    // then just validate the current url.
    if (IsDocumentModified() || IsHTMLSourceChanged()) {
      if (!(await CheckAndSaveDocument("cmd_validate", false))) {
        return;
      }

      // Check if we saved again just in case?
      if (!DocumentHasBeenSaved()) {
        // user hit cancel?
        return;
      }
    }

    URL2Validate = GetDocumentUrl();
    // See if it's a file:
    var ifile;
    try {
      var fileHandler = GetFileProtocolHandler();
      ifile = fileHandler.getFileFromURLSpec(URL2Validate);
      // nsIFile throws an exception if it's not a file url
    } catch (e) {
      ifile = null;
    }
    if (ifile) {
      URL2Validate = ifile.path;
      var vwin = window.open(
        "http://validator.w3.org/file-upload.html",
        "EditorValidate"
      );
      // Window loads asynchronously, so pass control to the load listener:
      vwin.addEventListener("load", this.validateFilePageLoaded);
    } else {
      window.open(
        `http://validator.w3.org/check?uri=${URL2Validate}&doctype=Inline`,
        "EditorValidate"
      );
      // This does the validation, no need to wait for page loaded.
    }
  },
  validateFilePageLoaded(event) {
    event.target.forms[0].uploaded_file.value = URL2Validate;
  },
};

var nsFormCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdFormProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal"
    );
  },
};

var nsInputTagCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdInputProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal"
    );
  },
};

var nsInputImageCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdInputImage.xhtml",
      "_blank",
      "chrome,close,titlebar,modal"
    );
  },
};

var nsTextAreaCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdTextAreaProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal"
    );
  },
};

var nsSelectCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdSelectProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal"
    );
  },
};

var nsButtonCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdButtonProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal"
    );
  },
};

var nsLabelCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    var tagName = "label";
    try {
      var editor = GetCurrentEditor();
      // Find selected label or if start/end of selection is in label
      var labelElement = editor.getSelectedElement(tagName);
      if (!labelElement) {
        labelElement = editor.getElementOrParentByTagName(
          tagName,
          editor.selection.anchorNode
        );
      }
      if (!labelElement) {
        labelElement = editor.getElementOrParentByTagName(
          tagName,
          editor.selection.focusNode
        );
      }
      if (labelElement) {
        // We only open the dialog for an existing label
        window.openDialog(
          "chrome://editor/content/EdLabelProps.xhtml",
          "_blank",
          "chrome,close,titlebar,modal",
          labelElement
        );
      } else {
        EditorSetTextProperty(tagName, "", "");
      }
    } catch (e) {}
  },
};

var nsFieldSetCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdFieldSetProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal"
    );
  },
};

var nsImageCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdImageProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal"
    );
  },
};

var nsHLineCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // Inserting an HLine is different in that we don't use properties dialog
    //  unless we are editing an existing line's attributes
    //  We get the last-used attributes from the prefs and insert immediately

    var tagName = "hr";
    var editor = GetCurrentEditor();

    var hLine;
    try {
      hLine = editor.getSelectedElement(tagName);
    } catch (e) {
      return;
    }

    if (hLine) {
      // We only open the dialog for an existing HRule
      window.openDialog(
        "chrome://editor/content/EdHLineProps.xhtml",
        "_blank",
        "chrome,close,titlebar,modal"
      );
    } else {
      try {
        hLine = editor.createElementWithDefaults(tagName);

        // We change the default attributes to those saved in the user prefs
        let align = Services.prefs.getIntPref("editor.hrule.align");
        if (align == 0) {
          editor.setAttributeOrEquivalent(hLine, "align", "left", true);
        } else if (align == 2) {
          editor.setAttributeOrEquivalent(hLine, "align", "right", true);
        }

        // Note: Default is center (don't write attribute)

        let width = Services.prefs.getIntPref("editor.hrule.width");
        if (Services.prefs.getBoolPref("editor.hrule.width_percent")) {
          width = width + "%";
        }

        editor.setAttributeOrEquivalent(hLine, "width", width, true);

        let height = Services.prefs.getIntPref("editor.hrule.height");
        editor.setAttributeOrEquivalent(hLine, "size", String(height), true);

        if (Services.prefs.getBoolPref("editor.hrule.shading")) {
          hLine.removeAttribute("noshade");
        } else {
          hLine.setAttribute("noshade", "noshade");
        }

        editor.insertElementAtSelection(hLine, true);
      } catch (e) {}
    }
  },
};

var nsLinkCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // If selected element is an image, launch that dialog instead
    // since last tab panel handles link around an image
    var element = GetObjectForProperties();
    if (element && element.nodeName.toLowerCase() == "img") {
      window.openDialog(
        "chrome://editor/content/EdImageProps.xhtml",
        "_blank",
        "chrome,close,titlebar,modal",
        null,
        true
      );
    } else {
      window.openDialog(
        "chrome://editor/content/EdLinkProps.xhtml",
        "_blank",
        "chrome,close,titlebar,modal"
      );
    }
  },
};

var nsAnchorCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdNamedAnchorProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal",
      ""
    );
  },
};

var nsInsertHTMLWithDialogCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdInsSrc.xhtml",
      "_blank",
      "chrome,close,titlebar,modal,resizable",
      ""
    );
  },
};

var nsInsertMathWithDialogCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdInsertMath.xhtml",
      "_blank",
      "chrome,close,titlebar,modal,resizable",
      ""
    );
  },
};

var nsInsertCharsCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    EditorFindOrCreateInsertCharWindow();
  },
};

var nsInsertBreakCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentEditor().insertHTML("<br>");
    } catch (e) {}
  },
};

var nsInsertBreakAllCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentEditor().insertHTML("<br clear='all'>");
    } catch (e) {}
  },
};

var nsGridCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdSnapToGrid.xhtml",
      "_blank",
      "chrome,close,titlebar,modal"
    );
  },
};

var nsListPropertiesCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdListProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal"
    );
  },
};

var nsPagePropertiesCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    var oldTitle = GetDocumentTitle();
    window.openDialog(
      "chrome://editor/content/EdPageProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal",
      ""
    );

    // Update main window title and
    // recent menu data in prefs if doc title changed
    if (GetDocumentTitle() != oldTitle) {
      UpdateWindowTitle();
    }
  },
};

var nsObjectPropertiesCommand = {
  isCommandEnabled(aCommand, dummy) {
    var isEnabled = false;
    if (IsDocumentEditable() && IsEditingRenderedHTML()) {
      isEnabled =
        GetObjectForProperties() != null ||
        GetCurrentEditor().getSelectedElement("href") != null;
    }
    return isEnabled;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // Launch Object properties for appropriate selected element
    var element = GetObjectForProperties();
    if (element) {
      var name = element.nodeName.toLowerCase();
      switch (name) {
        case "img":
          goDoCommand("cmd_image");
          break;
        case "hr":
          goDoCommand("cmd_hline");
          break;
        case "form":
          goDoCommand("cmd_form");
          break;
        case "input":
          var type = element.getAttribute("type");
          if (type && type.toLowerCase() == "image") {
            goDoCommand("cmd_inputimage");
          } else {
            goDoCommand("cmd_inputtag");
          }
          break;
        case "textarea":
          goDoCommand("cmd_textarea");
          break;
        case "select":
          goDoCommand("cmd_select");
          break;
        case "button":
          goDoCommand("cmd_button");
          break;
        case "label":
          goDoCommand("cmd_label");
          break;
        case "fieldset":
          goDoCommand("cmd_fieldset");
          break;
        case "table":
          EditorInsertOrEditTable(false);
          break;
        case "td":
        case "th":
          EditorTableCellProperties();
          break;
        case "ol":
        case "ul":
        case "dl":
        case "li":
          goDoCommand("cmd_listProperties");
          break;
        case "a":
          if (element.name) {
            goDoCommand("cmd_anchor");
          } else if (element.href) {
            goDoCommand("cmd_link");
          }
          break;
        case "math":
          goDoCommand("cmd_insertMathWithDialog");
          break;
        default:
          doAdvancedProperties(element);
          break;
      }
    } else {
      // We get a partially-selected link if asked for specifically
      try {
        element = GetCurrentEditor().getSelectedElement("href");
      } catch (e) {}
      if (element) {
        goDoCommand("cmd_link");
      }
    }
  },
};

var nsSetSmiley = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {
    var smileyCode = aParams.getStringValue("state_attribute");

    var strSml;
    switch (smileyCode) {
      case ":-)":
        strSml = "s1";
        break;
      case ":-(":
        strSml = "s2";
        break;
      case ";-)":
        strSml = "s3";
        break;
      case ":-P":
      case ":-p":
      case ":-b":
        strSml = "s4";
        break;
      case ":-D":
        strSml = "s5";
        break;
      case ":-[":
        strSml = "s6";
        break;
      case ":-/":
      case ":/":
      case ":-\\":
      case ":\\":
        strSml = "s7";
        break;
      case "=-O":
      case "=-o":
        strSml = "s8";
        break;
      case ":-*":
        strSml = "s9";
        break;
      case ">:o":
      case ">:-o":
        strSml = "s10";
        break;
      case "8-)":
        strSml = "s11";
        break;
      case ":-$":
        strSml = "s12";
        break;
      case ":-!":
        strSml = "s13";
        break;
      case "O:-)":
      case "o:-)":
        strSml = "s14";
        break;
      case ":'(":
        strSml = "s15";
        break;
      case ":-X":
      case ":-x":
        strSml = "s16";
        break;
      default:
        strSml = "";
        break;
    }

    try {
      var editor = GetCurrentEditor();
      var extElement = editor.createElementWithDefaults("span");
      extElement.setAttribute("class", "moz-smiley-" + strSml);

      var intElement = editor.createElementWithDefaults("span");
      if (!intElement) {
        return;
      }

      var txtElement = editor.document.createTextNode(smileyCode);
      if (!txtElement) {
        return;
      }

      intElement.appendChild(txtElement);
      extElement.appendChild(intElement);

      editor.insertElementAtSelection(extElement, true);
      window.content.focus();
    } catch (e) {
      dump("Exception occurred in smiley InsertElementAtSelection\n");
    }
  },
  // This is now deprecated in favor of "doCommandParams"
  doCommand(aCommand) {},
};

function doAdvancedProperties(element) {
  if (element) {
    window.openDialog(
      "chrome://editor/content/EdAdvancedEdit.xhtml",
      "_blank",
      "chrome,close,titlebar,modal,resizable=yes",
      "",
      element
    );
  }
}

var nsAdvancedPropertiesCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // Launch AdvancedEdit dialog for the selected element
    try {
      var element = GetCurrentEditor().getSelectedElement("");
      doAdvancedProperties(element);
    } catch (e) {}
  },
};

var nsColorPropertiesCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://editor/content/EdColorProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal",
      ""
    );
    UpdateDefaultColors();
  },
};

var nsIncreaseFontCommand = {
  isCommandEnabled(aCommand, dummy) {
    if (!(IsDocumentEditable() && IsEditingRenderedHTML())) {
      return false;
    }
    var setIndex = getFontSizeIndex();
    return setIndex >= 0 && setIndex < 5;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    var setIndex = getFontSizeIndex();
    if (setIndex < 0 || setIndex >= 5) {
      return;
    }
    var sizes = ["x-small", "small", "medium", "large", "x-large", "xx-large"];
    EditorSetFontSize(sizes[setIndex + 1]);
  },
};

var nsDecreaseFontCommand = {
  isCommandEnabled(aCommand, dummy) {
    if (!(IsDocumentEditable() && IsEditingRenderedHTML())) {
      return false;
    }
    var setIndex = getFontSizeIndex();
    return setIndex > 0;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    var setIndex = getFontSizeIndex();
    if (setIndex <= 0) {
      return;
    }
    var sizes = ["x-small", "small", "medium", "large", "x-large", "xx-large"];
    EditorSetFontSize(sizes[setIndex - 1]);
  },
};

var nsRemoveNamedAnchorsCommand = {
  isCommandEnabled(aCommand, dummy) {
    // We could see if there's any link in selection, but it doesn't seem worth the work!
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    EditorRemoveTextProperty("name", "");
    window.content.focus();
  },
};

var nsEditLinkCommand = {
  isCommandEnabled(aCommand, dummy) {
    // Not really used -- this command is only in context menu, and we do enabling there
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      var element = GetCurrentEditor().getSelectedElement("href");
      if (element) {
        editPage(element.href);
      }
    } catch (e) {}
    window.content.focus();
  },
};

var nsNormalModeCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsHTMLEditor() && IsDocumentEditable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    SetEditMode(kDisplayModeNormal);
  },
};

var nsAllTagsModeCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsHTMLEditor();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    SetEditMode(kDisplayModeAllTags);
  },
};

var nsHTMLSourceModeCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsHTMLEditor();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    SetEditMode(kDisplayModeSource);
  },
};

var nsPreviewModeCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsHTMLEditor();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    SetEditMode(kDisplayModePreview);
  },
};

var nsInsertOrEditTableCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    if (IsInTableCell()) {
      EditorTableCellProperties();
    } else {
      EditorInsertOrEditTable(true);
    }
  },
};

var nsEditTableCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    EditorInsertOrEditTable(false);
  },
};

var nsSelectTableCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().selectTable();
    } catch (e) {}
    window.content.focus();
  },
};

var nsSelectTableRowCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().selectTableRow();
    } catch (e) {}
    window.content.focus();
  },
};

var nsSelectTableColumnCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().selectTableColumn();
    } catch (e) {}
    window.content.focus();
  },
};

var nsSelectTableCellCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().selectTableCell();
    } catch (e) {}
    window.content.focus();
  },
};

var nsSelectAllTableCellsCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().selectAllTableCells();
    } catch (e) {}
    window.content.focus();
  },
};

var nsInsertTableCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    EditorInsertTable();
  },
};

var nsInsertTableRowAboveCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().insertTableRow(1, false);
    } catch (e) {}
    window.content.focus();
  },
};

var nsInsertTableRowBelowCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().insertTableRow(1, true);
    } catch (e) {}
    window.content.focus();
  },
};

var nsInsertTableColumnBeforeCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().insertTableColumn(1, false);
    } catch (e) {}
    window.content.focus();
  },
};

var nsInsertTableColumnAfterCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().insertTableColumn(1, true);
    } catch (e) {}
    window.content.focus();
  },
};

var nsInsertTableCellBeforeCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().insertTableCell(1, false);
    } catch (e) {}
    window.content.focus();
  },
};

var nsInsertTableCellAfterCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().insertTableCell(1, true);
    } catch (e) {}
    window.content.focus();
  },
};

var nsDeleteTableCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().deleteTable();
    } catch (e) {}
    window.content.focus();
  },
};

var nsDeleteTableRowCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    var rows = GetNumberOfContiguousSelectedRows();
    // Delete at least one row
    if (rows == 0) {
      rows = 1;
    }

    try {
      var editor = GetCurrentTableEditor();
      editor.beginTransaction();

      // Loop to delete all blocks of contiguous, selected rows
      while (rows) {
        editor.deleteTableRow(rows);
        rows = GetNumberOfContiguousSelectedRows();
      }
    } finally {
      editor.endTransaction();
    }
    window.content.focus();
  },
};

var nsDeleteTableColumnCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    var columns = GetNumberOfContiguousSelectedColumns();
    // Delete at least one column
    if (columns == 0) {
      columns = 1;
    }

    try {
      var editor = GetCurrentTableEditor();
      editor.beginTransaction();

      // Loop to delete all blocks of contiguous, selected columns
      while (columns) {
        editor.deleteTableColumn(columns);
        columns = GetNumberOfContiguousSelectedColumns();
      }
    } finally {
      editor.endTransaction();
    }
    window.content.focus();
  },
};

var nsDeleteTableCellCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().deleteTableCell(1);
    } catch (e) {}
    window.content.focus();
  },
};

var nsDeleteTableCellContentsCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTableCell();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().deleteTableCellContents();
    } catch (e) {}
    window.content.focus();
  },
};

var nsNormalizeTableCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // Use nullptr to let editor find table enclosing current selection
    try {
      GetCurrentTableEditor().normalizeTable(null);
    } catch (e) {}
    window.content.focus();
  },
};

var nsJoinTableCellsCommand = {
  isCommandEnabled(aCommand, dummy) {
    if (IsDocumentEditable() && IsEditingRenderedHTML()) {
      try {
        var editor = GetCurrentTableEditor();
        var tagNameObj = { value: "" };
        var countObj = { value: 0 };
        var cell = editor.getSelectedOrParentTableElement(tagNameObj, countObj);

        // We need a cell and either > 1 selected cell or a cell to the right
        //  (this cell may originate in a row spanned from above current row)
        // Note that editor returns "td" for "th" also.
        // (this is a pain! Editor and gecko use lowercase tagNames, JS uses uppercase!)
        if (cell && tagNameObj.value == "td") {
          // Selected cells
          if (countObj.value > 1) {
            return true;
          }

          var colSpan = cell.getAttribute("colspan");

          // getAttribute returns string, we need number
          // no attribute means colspan = 1
          if (!colSpan) {
            colSpan = Number(1);
          } else {
            colSpan = Number(colSpan);
          }

          var rowObj = { value: 0 };
          var colObj = { value: 0 };
          editor.getCellIndexes(cell, rowObj, colObj);

          // Test if cell exists to the right of current cell
          // (cells with 0 span should never have cells to the right
          //  if there is, user can select the 2 cells to join them)
          return (
            colSpan &&
            editor.getCellAt(null, rowObj.value, colObj.value + colSpan)
          );
        }
      } catch (e) {}
    }
    return false;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // Param: Don't merge non-contiguous cells
    try {
      GetCurrentTableEditor().joinTableCells(false);
    } catch (e) {}
    window.content.focus();
  },
};

var nsSplitTableCellCommand = {
  isCommandEnabled(aCommand, dummy) {
    if (IsDocumentEditable() && IsEditingRenderedHTML()) {
      var tagNameObj = { value: "" };
      var countObj = { value: 0 };
      var cell;
      try {
        cell = GetCurrentTableEditor().getSelectedOrParentTableElement(
          tagNameObj,
          countObj
        );
      } catch (e) {}

      // We need a cell parent and there's just 1 selected cell
      // or selection is entirely inside 1 cell
      if (
        cell &&
        tagNameObj.value == "td" &&
        countObj.value <= 1 &&
        IsSelectionInOneCell()
      ) {
        var colSpan = cell.getAttribute("colspan");
        var rowSpan = cell.getAttribute("rowspan");
        if (!colSpan) {
          colSpan = 1;
        }
        if (!rowSpan) {
          rowSpan = 1;
        }
        return colSpan > 1 || rowSpan > 1 || colSpan == 0 || rowSpan == 0;
      }
    }
    return false;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    try {
      GetCurrentTableEditor().splitTableCell();
    } catch (e) {}
    window.content.focus();
  },
};

var nsTableOrCellColorCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsInTable();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    EditorSelectColor("TableOrCell");
  },
};

var nsPreferencesCommand = {
  isCommandEnabled(aCommand, dummy) {
    return true;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    goPreferences("composer_pane");
  },
};

var nsFinishHTMLSource = {
  isCommandEnabled(aCommand, dummy) {
    return true;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // In editor.js
    SetEditMode(gPreviousNonSourceDisplayMode);
  },
};

var nsCancelHTMLSource = {
  isCommandEnabled(aCommand, dummy) {
    return true;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    // In editor.js
    CancelHTMLSource();
  },
};

var nsConvertToTable = {
  isCommandEnabled(aCommand, dummy) {
    if (IsDocumentEditable() && IsEditingRenderedHTML()) {
      var selection;
      try {
        selection = GetCurrentEditor().selection;
      } catch (e) {}

      if (selection && !selection.isCollapsed) {
        // Don't allow if table or cell is the selection
        var element;
        try {
          element = GetCurrentEditor().getSelectedElement("");
        } catch (e) {}
        if (element) {
          var name = element.nodeName.toLowerCase();
          if (
            name == "td" ||
            name == "th" ||
            name == "caption" ||
            name == "table"
          ) {
            return false;
          }
        }

        // Selection start and end must be in the same cell
        //   in same cell or both are NOT in a cell
        if (
          GetParentTableCell(selection.focusNode) !=
          GetParentTableCell(selection.anchorNode)
        ) {
          return false;
        }

        return true;
      }
    }
    return false;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    if (this.isCommandEnabled()) {
      window.openDialog(
        "chrome://editor/content/EdConvertToTable.xhtml",
        "_blank",
        "chrome,close,titlebar,modal"
      );
    }
  },
};
