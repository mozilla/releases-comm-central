/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Implementations of nsIControllerCommand for composer commands. These commands
 * are related to editing. You can fire these commands with following functions:
 * goDoCommand and goDoCommandParams(If command requires any parameters).
 *
 * Sometimes, we want to reflect the changes in the UI also. We have two functions
 * for that: pokeStyleUI and pokeMultiStateUI. The pokeStyleUI function is for those
 * commands which are boolean in nature for example "cmd_bold" command, text can
 * be bold or not. The pokeMultiStateUI function is for the commands which can have
 * multiple values for example "cmd_fontFace" can have different values like
 * arial, variable width etc.
 *
 * Here, some of the commands are getting executed by document.execCommand.
 * Those are listed in the gCommandMap Map object. In that also, some commands
 * are of type boolean and some are of multiple state. We have two functions to
 * execute them: doStatefulCommand and doStyleUICommand.
 *
 * All commands are not executable through document.execCommand.
 * In all those cases, we will use goDoCommand or goDoCommandParams.
 * The goDoCommandParams function is implemented in this file.
 * The goDoCOmmand function is from globalOverlay.js. For the Commands
 * which can be executed by document.execCommand, we will use doStatefulCommand
 * and doStyleUICommand.
 */

/* import-globals-from ../../../../../toolkit/components/printing/content/printUtils.js */
/* import-globals-from ../../../base/content/globalOverlay.js */
/* import-globals-from ../../../base/content/utilityOverlay.js */
/* import-globals-from editor.js */
/* import-globals-from editorUtilities.js */
/* import-globals-from MsgComposeCommands.js */

var gComposerJSCommandControllerID = 0;

/**
 * Used to register commands we have created manually.
 */
function SetupHTMLEditorCommands() {
  var commandTable = GetComposerCommandTable();
  if (!commandTable) {
    return;
  }

  // Include everything a text editor does
  SetupTextEditorCommands();

  // dump("Registering HTML editor commands\n");

  commandTable.registerCommand("cmd_renderedHTMLEnabler", nsDummyHTMLCommand);

  commandTable.registerCommand("cmd_listProperties", nsListPropertiesCommand);
  commandTable.registerCommand("cmd_colorProperties", nsColorPropertiesCommand);
  commandTable.registerCommand("cmd_increaseFontStep", nsIncreaseFontCommand);
  commandTable.registerCommand("cmd_decreaseFontStep", nsDecreaseFontCommand);
  commandTable.registerCommand(
    "cmd_objectProperties",
    nsObjectPropertiesCommand
  );
  commandTable.registerCommand(
    "cmd_removeNamedAnchors",
    nsRemoveNamedAnchorsCommand
  );

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
  commandTable.registerCommand("cmd_insertChars", nsInsertCharsCommand);
}

/**
 * Used to register the command controller in the editor document.
 *
 * @returns {nsIControllerCommandTable|null} - A controller used to
 *   register the manually created commands.
 */
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
    controller =
      Cc["@mozilla.org/embedcomp/base-command-controller;1"].createInstance();

    var editorController = controller.QueryInterface(Ci.nsIControllerContext);
    editorController.setCommandContext(GetCurrentEditorElement());
    window.content.controllers.insertControllerAt(0, controller);

    // Store the controller ID so we can be sure to get the right one later
    gComposerJSCommandControllerID =
      window.content.controllers.getControllerId(controller);
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

/**
 * Get the state of the given command and call the pokeStyleUI or pokeMultiStateUI
 * according to the type of the command to reflect the UI changes in the editor.
 *
 * @param {string} command - The id of the command.
 */
function goUpdateCommandState(command) {
  try {
    var controller =
      document.commandDispatcher.getControllerForCommand(command);
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
        pokeMultiStateUI(command, params);
        break;

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
    console.error(e);
  }
}
/* eslint-enable complexity */

/**
 * Used in the oncommandupdate attribute of the goUpdateComposerMenuItems.
 * For any commandset events fired, this function will be called.
 * Used to update the UI state of the editor buttons and menulist.
 * Whenever you change your selection in the editor part, i.e. if you move
 * your cursor, you will find this functions getting called and
 * updating the editor UI of toolbarbuttons and menulists. This is mainly
 * to update the UI according to your selection in the editor part.
 *
 * @param {XULElement} commandset - The <xul:commandset> element to update for.
 */
function goUpdateComposerMenuItems(commandset) {
  // dump("Updating commands for " + commandset.id + "\n");
  for (var i = 0; i < commandset.children.length; i++) {
    var commandNode = commandset.children[i];
    var commandID = commandNode.id;
    if (commandID) {
      goUpdateCommand(commandID); // enable or disable
      if (commandNode.hasAttribute("state")) {
        goUpdateCommandState(commandID);
      }
    }
  }
}

/**
 * Execute the command with the provided parameters.
 * This is directly calling commands with multiple state attributes, which
 * are not supported by document.execCommand()
 *
 * @param {string} command - The command ID.
 * @param {string} paramValue - The parameter value.
 */
function goDoCommandParams(command, paramValue) {
  try {
    const params = newCommandParams();
    params.setStringValue("state_attribute", paramValue);
    const controller =
      document.commandDispatcher.getControllerForCommand(command);
    if (controller && controller.isCommandEnabled(command)) {
      if (controller instanceof Ci.nsICommandController) {
        controller.doCommandWithParams(command, params);
      } else {
        controller.doCommand(command);
      }
    }
  } catch (e) {
    console.error(e);
  }
}

/**
 * Update the UI to reflect setting a given state for a command. This
 * is used for boolean type of commands.
 *
 * @param {string} uiID - The id of the command.
 * @param {boolean} desiredState - State to set for the command.
 */
function pokeStyleUI(uiID, desiredState) {
  const commandNode = document.getElementById(uiID);
  const uiState = commandNode.getAttribute("state") == "true";
  if (desiredState != uiState) {
    commandNode.setAttribute("state", desiredState ? "true" : "false");
    let buttonId;
    switch (uiID) {
      case "cmd_bold":
        buttonId = "boldButton";
        break;
      case "cmd_italic":
        buttonId = "italicButton";
        break;
      case "cmd_underline":
        buttonId = "underlineButton";
        break;
      case "cmd_ul":
        buttonId = "ulButton";
        break;
      case "cmd_ol":
        buttonId = "olButton";
        break;
    }
    if (buttonId) {
      document.getElementById(buttonId).checked = desiredState;
    }
  }
}

/**
 * Maps internal command names to their document.execCommand() command string.
 */
const gCommandMap = new Map([
  ["cmd_bold", "bold"],
  ["cmd_italic", "italic"],
  ["cmd_underline", "underline"],
  ["cmd_strikethrough", "strikethrough"],
  ["cmd_superscript", "superscript"],
  ["cmd_subscript", "subscript"],
  ["cmd_ul", "InsertUnorderedList"],
  ["cmd_ol", "InsertOrderedList"],
  ["cmd_fontFace", "fontName"],

  // This are currently implemented with the help of
  // color selection dialog box in the editor.js.
  // ["cmd_highlight", "backColor"],
  // ["cmd_fontColor", "foreColor"],
]);

/**
 * Used for the boolean type commands available through
 * document.execCommand(). We will also call pokeStyleUI to update
 * the UI.
 *
 * @param {string} cmdStr - The id of the command.
 */
function doStyleUICommand(cmdStr) {
  GetCurrentEditorElement().contentDocument.execCommand(
    gCommandMap.get(cmdStr),
    false,
    null
  );
  const commandNode = document.getElementById(cmdStr);
  const newState = commandNode.getAttribute("state") != "true";
  pokeStyleUI(cmdStr, newState);
}

// Copied from jsmime.js.
function stringToTypedArray(buffer) {
  var typedarray = new Uint8Array(buffer.length);
  for (var i = 0; i < buffer.length; i++) {
    typedarray[i] = buffer.charCodeAt(i);
  }
  return typedarray;
}

/**
 * Update the UI to reflect setting a given state for a command. This is used
 * when the command state has a string value i.e. multiple state type commands.
 *
 * @param {string} uiID - The id of the command.
 * @param {nsICommandParams} cmdParams - Command parameters object.
 */
function pokeMultiStateUI(uiID, cmdParams) {
  let desiredAttrib;
  if (cmdParams.getBooleanValue("state_mixed")) {
    desiredAttrib = "mixed";
  } else if (
    cmdParams.getValueType("state_attribute") == Ci.nsICommandParams.eStringType
  ) {
    desiredAttrib = cmdParams.getCStringValue("state_attribute");
    // Decode UTF-8, for example for font names in Japanese.
    desiredAttrib = new TextDecoder("UTF-8").decode(
      stringToTypedArray(desiredAttrib)
    );
  } else {
    desiredAttrib = cmdParams.getStringValue("state_attribute");
  }

  const commandNode = document.getElementById(uiID);
  const uiState = commandNode.getAttribute("state");
  if (desiredAttrib != uiState) {
    commandNode.setAttribute("state", desiredAttrib);
    switch (uiID) {
      case "cmd_paragraphState": {
        onParagraphFormatChange();
        break;
      }
      case "cmd_fontFace": {
        onFontFaceChange();
        break;
      }
      case "cmd_fontColor": {
        onFontColorChange();
        break;
      }
      case "cmd_backgroundColor": {
        onBackgroundColorChange();
        break;
      }
    }
  }
}

/**
 * Perform the action of the multiple states type commands available through
 * document.execCommand().
 *
 * @param {string} commandID - The id of the command.
 * @param {string} newState - The parameter value.
 * @param {boolean} updateUI - updates the UI if true. Used when
 *   function is called in another JavaScript function.
 */
function doStatefulCommand(commandID, newState, updateUI) {
  if (commandID == "cmd_align") {
    let command;
    switch (newState) {
      case "left":
        command = "justifyLeft";
        break;
      case "center":
        command = "justifyCenter";
        break;
      case "right":
        command = "justifyRight";
        break;
      case "justify":
        command = "justifyFull";
        break;
    }
    GetCurrentEditorElement().contentDocument.execCommand(command, false, null);
  } else if (commandID == "cmd_fontFace" && newState == "") {
    goDoCommandParams(commandID, newState);
  } else {
    GetCurrentEditorElement().contentDocument.execCommand(
      gCommandMap.get(commandID),
      false,
      newState
    );
  }

  if (updateUI) {
    const commandNode = document.getElementById(commandID);
    commandNode.setAttribute("state", newState);
    switch (commandID) {
      case "cmd_fontFace": {
        onFontFaceChange();
        break;
      }
    }
  } else {
    const commandNode = document.getElementById(commandID);
    if (commandNode) {
      commandNode.setAttribute("state", newState);
    }
  }
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
      const url = validateFileName(decodeURIComponent(docURI.fileBaseName));
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
 * @returns {Promise} dialogResult
 */
function PromptForSaveLocation(
  aDoSaveAsText,
  aEditorType,
  aMIMEType,
  aDocumentURLString
) {
  var dialogResult = {};
  dialogResult.filepickerClick = Ci.nsIFilePicker.returnCancel;
  dialogResult.resultingURI = "";
  dialogResult.resultingLocalFile = null;

  var fp = null;
  try {
    fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
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

  fp.init(window.browsingContext, promptString, Ci.nsIFilePicker.modeSave);

  // Set filters according to the type of output
  if (aDoSaveAsText) {
    fp.appendFilters(Ci.nsIFilePicker.filterText);
  } else {
    fp.appendFilters(Ci.nsIFilePicker.filterHTML);
  }
  fp.appendFilters(Ci.nsIFilePicker.filterAll);

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
      const docURI = Services.io.newURI(
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
      if (rv != Ci.nsIFilePicker.returnCancel && fp.file) {
        // Allow OK and replace.
        // reset urlstring to new save location
        dialogResult.resultingURIString = fileHandler.getURLSpecFromActualFile(
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
 *
 * @returns true if the title was set up successfully;
 *         false if the user cancelled the title prompt
 */
function PromptAndSetTitleIfNone() {
  if (GetDocumentTitle()) {
    // we have a title; no need to prompt!
    return true;
  }

  const result = { value: null };
  const captionStr = GetString("DocumentTitle");
  const msgStr = GetString("NeedDocTitle") + "\n" + GetString("DocTitleHelp");
  const confirmed = Services.prompt.prompt(
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
//    UpdateWindowTitle();
//    if (!aSaveCopy)
//      editor.resetModificationCount();
// this should cause notification to listeners that document has changed

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
    ].createInstance(Ci.nsIWebBrowserPersist);
    persistObj.progressListener = gEditorOutputProgressListener;

    var wrapColumn = GetWrapColumn();
    var outputFlags = GetOutputFlags(aMimeType, wrapColumn);

    // for 4.x parity as well as improving readability of file locally on server
    // this will always send crlf for upload (http/ftp)
    if (!isLocalFile) {
      // if we aren't saving locally then send both cr and lf
      outputFlags |=
        Ci.nsIWebBrowserPersist.ENCODE_FLAGS_CR_LINEBREAKS |
        Ci.nsIWebBrowserPersist.ENCODE_FLAGS_LF_LINEBREAKS;

      // we want to serialize the output for all remote publishing
      // some servers can handle only one connection at a time
      // some day perhaps we can make this user-configurable per site?
      persistObj.persistFlags =
        persistObj.persistFlags |
        Ci.nsIWebBrowserPersist.PERSIST_FLAGS_SERIALIZE_OUTPUT;
    }

    // note: we always want to set the replace existing files flag since we have
    // already given user the chance to not replace an existing file (file picker)
    // or the user picked an option where the file is implicitly being replaced (save)
    persistObj.persistFlags =
      persistObj.persistFlags |
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_NO_BASE_TAG_MODIFICATIONS |
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_DONT_FIXUP_LINKS |
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_DONT_CHANGE_FILENAMES |
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_FIXUP_ORIGINAL_DOM;
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
      ? Ci.nsIWebBrowserPersist.ENCODE_FLAGS_ENCODE_LATIN1_ENTITIES
      : Ci.nsIWebBrowserPersist.ENCODE_FLAGS_ENCODE_BASIC_ENTITIES;
  if (aMimeType == "text/plain") {
    // When saving in "text/plain" format, always do formatting
    outputFlags |= Ci.nsIWebBrowserPersist.ENCODE_FLAGS_FORMATTED;
  } else {
    // Should we prettyprint? Check the pref
    if (Services.prefs.getBoolPref("editor.prettyprint")) {
      outputFlags |= Ci.nsIWebBrowserPersist.ENCODE_FLAGS_FORMATTED;
    }

    try {
      // How much entity names should we output? Check the pref
      switch (Services.prefs.getCharPref("editor.encode_entity")) {
        case "basic":
          outputEntity =
            Ci.nsIWebBrowserPersist.ENCODE_FLAGS_ENCODE_BASIC_ENTITIES;
          break;
        case "latin1":
          outputEntity =
            Ci.nsIWebBrowserPersist.ENCODE_FLAGS_ENCODE_LATIN1_ENTITIES;
          break;
        case "html":
          outputEntity =
            Ci.nsIWebBrowserPersist.ENCODE_FLAGS_ENCODE_HTML_ENTITIES;
          break;
        case "none":
          outputEntity = 0;
          break;
      }
    } catch (e) {}
  }
  outputFlags |= outputEntity;

  if (aWrapColumn > 0) {
    outputFlags |= Ci.nsIWebBrowserPersist.ENCODE_FLAGS_WRAP;
  }

  return outputFlags;
}

// returns number of column where to wrap
function GetWrapColumn() {
  try {
    return GetCurrentEditor().QueryInterface(Ci.nsIEditorMailSupport).wrapWidth;
  } catch (e) {}
  return 0;
}

const gShowDebugOutputStateChange = false;
const gShowDebugOutputProgress = false;
const gShowDebugOutputStatusChange = false;

const gShowDebugOutputLocationChange = false;
const gShowDebugOutputSecurityChange = false;

const kErrorBindingAborted = 2152398850;
const kErrorBindingRedirected = 2152398851;
const kFileNotFound = 2152857618;

var gEditorOutputProgressListener = {
  onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
    // Use this to access onStateChange flags
    var requestSpec;
    try {
      var channel = aRequest.QueryInterface(Ci.nsIChannel);
      requestSpec = StripUsernamePasswordFromURI(channel.URI);
    } catch (e) {
      if (gShowDebugOutputStateChange) {
        dump("***** onStateChange; NO REQUEST CHANNEL\n");
      }
    }

    if (gShowDebugOutputStateChange) {
      dump("\n***** onStateChange request: " + requestSpec + "\n");
      dump("      state flags: ");

      if (aStateFlags & Ci.nsIWebProgressListener.STATE_START) {
        dump(" STATE_START, ");
      }
      if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
        dump(" STATE_STOP, ");
      }
      if (aStateFlags & Ci.nsIWebProgressListener.STATE_IS_NETWORK) {
        dump(" STATE_IS_NETWORK ");
      }

      dump(`\n * requestSpec=${requestSpec}, aStatus=${aStatus}\n`);

      DumpDebugStatus(aStatus);
    }
  },

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
        var channel = aRequest.QueryInterface(Ci.nsIChannel);
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
        var channel = aRequest.QueryInterface(Ci.nsIChannel);
        dump("*****          request: " + channel.URI.spec + "\n");
      } catch (e) {}
    }
  },

  onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {
    if (gShowDebugOutputStatusChange) {
      dump("***** onStatusChange: " + aMessage + "\n");
      try {
        var channel = aRequest.QueryInterface(Ci.nsIChannel);
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
        var channel = aRequest.QueryInterface(Ci.nsIChannel);
        dump("***** onSecurityChange request: " + channel.URI.spec + "\n");
      } catch (e) {}
    }
  },

  onContentBlockingEvent(aWebProgress, aRequest, aEvent) {},

  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),
};

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
        dialogResult.filepickerClick == Ci.nsIFilePicker.returnReplace;

      urlstring = dialogResult.resultingURIString;
      tempLocalFile = dialogResult.resultingLocalFile;

      // update the new URL for the webshell unless we are saving a copy
      if (!aSaveCopy) {
        doUpdateURI = true;
      }
    } catch (e) {
      console.error(e);
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

    const destinationLocation = tempLocalFile ? tempLocalFile : docURI;

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
      goUpdateCommand("cmd_save");
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

var nsFindReplaceCommand = {
  isCommandEnabled(aCommand, editorElement) {
    return editorElement.getEditor(editorElement.contentWindow) != null;
  },

  getCommandStateParams(aCommand, aParams, editorElement) {},
  doCommandParams(aCommand, aParams, editorElement) {},

  doCommand(aCommand, editorElement) {
    window.openDialog(
      "chrome://messenger/content/messengercompose/EdReplace.xhtml",
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
    const findPrev = aCommand == "cmd_findPrev";
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
    GetCurrentEditor().QueryInterface(Ci.nsIEditorMailSupport).rewrap(false);
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
        "chrome://messenger/content/messengercompose/EdSpellCheck.xhtml",
        "_blank",
        "dialog,close,titlebar,modal,resizable",
        false,
        skipBlockQuotes,
        true
      );
    } catch (ex) {}
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
      "chrome://messenger/content/messengercompose/EdImageProps.xhtml",
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
        "chrome://messenger/content/messengercompose/EdHLineProps.xhtml",
        "_blank",
        "chrome,close,titlebar,modal"
      );
    } else {
      try {
        hLine = editor.createElementWithDefaults(tagName);

        // We change the default attributes to those saved in the user prefs
        const align = Services.prefs.getIntPref("editor.hrule.align");
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

        const height = Services.prefs.getIntPref("editor.hrule.height");
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
        "chrome://messenger/content/messengercompose/EdImageProps.xhtml",
        "_blank",
        "chrome,close,titlebar,modal",
        null,
        true
      );
    } else {
      window.openDialog(
        "chrome://messenger/content/messengercompose/EdLinkProps.xhtml",
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
      "chrome://messenger/content/messengercompose/EdNamedAnchorProps.xhtml",
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
    gMsgCompose.allowRemoteContent = true;
    window.openDialog(
      "chrome://messenger/content/messengercompose/EdInsSrc.xhtml",
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
      "chrome://messenger/content/messengercompose/EdInsertMath.xhtml",
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

var nsListPropertiesCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://messenger/content/messengercompose/EdListProps.xhtml",
      "_blank",
      "chrome,close,titlebar,modal"
    );
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
          gMsgCompose.allowRemoteContent = true;
          goDoCommand("cmd_image");
          break;
        case "hr":
          goDoCommand("cmd_hline");
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
    try {
      const editor = GetCurrentEditor();
      const smileyCode = aParams.getStringValue("state_attribute");
      editor.insertHTML(smileyCode);
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
      "chrome://messenger/content/messengercompose/EdAdvancedEdit.xhtml",
      "_blank",
      "chrome,close,titlebar,modal,resizable=yes",
      "",
      element
    );
  }
}

var nsColorPropertiesCommand = {
  isCommandEnabled(aCommand, dummy) {
    return IsDocumentEditable() && IsEditingRenderedHTML();
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    window.openDialog(
      "chrome://messenger/content/messengercompose/EdColorProps.xhtml",
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
    const setIndex = parseInt(getLegacyFontSize());
    return setIndex < 6;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    const setIndex = parseInt(getLegacyFontSize());
    EditorSetFontSize((setIndex + 1).toString());
  },
};

var nsDecreaseFontCommand = {
  isCommandEnabled(aCommand, dummy) {
    if (!(IsDocumentEditable() && IsEditingRenderedHTML())) {
      return false;
    }
    const setIndex = parseInt(getLegacyFontSize());
    return setIndex > 1;
  },

  getCommandStateParams(aCommand, aParams, aRefCon) {},
  doCommandParams(aCommand, aParams, aRefCon) {},

  doCommand(aCommand) {
    const setIndex = parseInt(getLegacyFontSize());
    EditorSetFontSize((setIndex - 1).toString());
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
        "chrome://messenger/content/messengercompose/EdConvertToTable.xhtml",
        "_blank",
        "chrome,close,titlebar,modal"
      );
    }
  },
};
