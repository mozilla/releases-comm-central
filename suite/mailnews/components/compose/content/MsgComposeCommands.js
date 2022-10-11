/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
const {PluralForm} = ChromeUtils.import("resource://gre/modules/PluralForm.jsm");
ChromeUtils.import("resource://gre/modules/InlineSpellChecker.jsm");
const {FolderUtils} = ChromeUtils.import("resource:///modules/FolderUtils.jsm");
const {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
const { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.js");
const { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");

ChromeUtils.defineModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");

/**
 * interfaces
 */
var nsIMsgCompDeliverMode = Ci.nsIMsgCompDeliverMode;
var nsIMsgCompSendFormat = Ci.nsIMsgCompSendFormat;
var nsIMsgCompConvertible = Ci.nsIMsgCompConvertible;
var nsIMsgCompType = Ci.nsIMsgCompType;
var nsIMsgCompFormat = Ci.nsIMsgCompFormat;
var nsIAbPreferMailFormat = Ci.nsIAbPreferMailFormat;
var mozISpellCheckingEngine = Ci.mozISpellCheckingEngine;

/**
 * In order to distinguish clearly globals that are initialized once when js load (static globals) and those that need to be
 * initialize every time a compose window open (globals), I (ducarroz) have decided to prefix by s... the static one and
 * by g... the other one. Please try to continue and repect this rule in the future. Thanks.
 */
/**
 * static globals, need to be initialized only once
 */
var sComposeMsgsBundle;
var sBrandBundle;

var sRDF = null;
var sNameProperty = null;
var sDictCount = 0;

/**
 * Global message window object. This is used by mail-offline.js and therefore
 * should not be renamed. We need to avoid doing this kind of cross file global
 * stuff in the future and instead pass this object as parameter when needed by
 * functions in the other js file.
 */
var msgWindow;

var gMessenger;

/**
 * Global variables, need to be re-initialized every time mostly because
 * we need to release them when the window closes.
 */
var gHideMenus;
var gMsgCompose;
var gOriginalMsgURI;
var gWindowLocked;
var gSendLocked;
var gContentChanged;
var gAutoSaving;
var gCurrentIdentity;
var defaultSaveOperation;
var gSendOrSaveOperationInProgress;
var gCloseWindowAfterSave;
var gSavedSendNowKey;
var gSendFormat;
var gLogComposePerformance;

var gMsgIdentityElement;
var gMsgAddressingWidgetElement;
var gMsgSubjectElement;
var gMsgAttachmentElement;
var gMsgHeadersToolbarElement;
var gComposeType;
var gFormatToolbarHidden = false;
var gBodyFromArgs;

// i18n globals
var gCharsetConvertManager;

var gLastWindowToHaveFocus;
var gReceiptOptionChanged;
var gDSNOptionChanged;
var gAttachVCardOptionChanged;

var gAutoSaveInterval;
var gAutoSaveTimeout;
var gAutoSaveKickedIn;
var gEditingDraft;

var kComposeAttachDirPrefName = "mail.compose.attach.dir";

function InitializeGlobalVariables()
{
  gMessenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

  gMsgCompose = null;
  gOriginalMsgURI = null;
  gWindowLocked = false;
  gContentChanged = false;
  gCurrentIdentity = null;
  defaultSaveOperation = "draft";
  gSendOrSaveOperationInProgress = false;
  gAutoSaving = false;
  gCloseWindowAfterSave = false;
  gSavedSendNowKey = null;
  gSendFormat = nsIMsgCompSendFormat.AskUser;
  gCharsetConvertManager = Cc['@mozilla.org/charset-converter-manager;1'].getService(Ci.nsICharsetConverterManager);
  gHideMenus = false;
  // We are storing the value of the bool logComposePerformance inorder to
  // avoid logging unnecessarily.
  gLogComposePerformance = MailServices.compose.logComposePerformance;

  gLastWindowToHaveFocus = null;
  gReceiptOptionChanged = false;
  gDSNOptionChanged = false;
  gAttachVCardOptionChanged = false;
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"]
                .createInstance(Ci.nsIMsgWindow);
  MailServices.mailSession.AddMsgWindow(msgWindow);
}
InitializeGlobalVariables();

function ReleaseGlobalVariables()
{
  gCurrentIdentity = null;
  gCharsetConvertManager = null;
  gMsgCompose = null;
  gOriginalMsgURI = null;
  gMessenger = null;
  sComposeMsgsBundle = null;
  sBrandBundle = null;
  MailServices.mailSession.RemoveMsgWindow(msgWindow);
  msgWindow = null;
}

function disableEditableFields()
{
  gMsgCompose.editor.flags |= Ci.nsIEditor.eEditorReadonlyMask;
  var disableElements = document.getElementsByAttribute("disableonsend", "true");
  for (let i = 0; i < disableElements.length; i++)
    disableElements[i].setAttribute('disabled', 'true');

}

function enableEditableFields()
{
  gMsgCompose.editor.flags &= ~Ci.nsIEditor.eEditorReadonlyMask;
  var enableElements = document.getElementsByAttribute("disableonsend", "true");
  for (let i = 0; i < enableElements.length; i++)
    enableElements[i].removeAttribute('disabled');

}

/**
 * Small helper function to check whether the node passed in is a signature.
 * Note that a text node is not a DOM element, hence .localName can't be used.
 */
function isSignature(aNode) {
  return ["DIV","PRE"].includes(aNode.nodeName) &&
         aNode.classList.contains("moz-signature");
}

var stateListener = {
  NotifyComposeFieldsReady: function() {
    ComposeFieldsReady();
    updateSendCommands(true);
  },

  NotifyComposeBodyReady: function() {
    this.useParagraph = gMsgCompose.composeHTML &&
                        Services.prefs.getBoolPref("mail.compose.default_to_paragraph");
    this.editor = GetCurrentEditor();
    this.paragraphState = document.getElementById("cmd_paragraphState");

    // Look at the compose types which require action (nsIMsgComposeParams.idl):
    switch (gComposeType) {

      case Ci.nsIMsgCompType.MailToUrl:
        gBodyFromArgs = true;
      case Ci.nsIMsgCompType.New:
      case Ci.nsIMsgCompType.NewsPost:
      case Ci.nsIMsgCompType.ForwardAsAttachment:
        this.NotifyComposeBodyReadyNew();
        break;

      case Ci.nsIMsgCompType.Reply:
      case Ci.nsIMsgCompType.ReplyAll:
      case Ci.nsIMsgCompType.ReplyToSender:
      case Ci.nsIMsgCompType.ReplyToGroup:
      case Ci.nsIMsgCompType.ReplyToSenderAndGroup:
      case Ci.nsIMsgCompType.ReplyWithTemplate:
      case Ci.nsIMsgCompType.ReplyToList:
        this.NotifyComposeBodyReadyReply();
        break;

      case Ci.nsIMsgCompType.ForwardInline:
        this.NotifyComposeBodyReadyForwardInline();
        break;

      case Ci.nsIMsgCompType.EditTemplate:
        defaultSaveOperation = "template";
      case Ci.nsIMsgCompType.Draft:
      case Ci.nsIMsgCompType.Template:
      case Ci.nsIMsgCompType.Redirect:
      case Ci.nsIMsgCompType.EditAsNew:
        break;

      default:
        dump("Unexpected nsIMsgCompType in NotifyComposeBodyReady (" +
             gComposeType + ")\n");
    }

    // Set the selected item in the identity list as needed, which will cause
    // an identity/signature switch. This can only be done once the message
    // body has already been assembled with the signature we need to switch.
    if (gMsgCompose.identity != gCurrentIdentity) {
      // Since switching the signature loses the caret position, we record it
      // and restore it later.
      let selection = this.editor.selection;
      let range = selection.getRangeAt(0);
      let start = range.startOffset;
      let startNode = range.startContainer;

      this.editor.enableUndo(false);
      let identityList = GetMsgIdentityElement();
      identityList.selectedItem = identityList.getElementsByAttribute(
        "identitykey", gMsgCompose.identity.key)[0];
      LoadIdentity(false);

      this.editor.enableUndo(true);
      this.editor.resetModificationCount();
      selection.collapse(startNode, start);
    }

    if (gMsgCompose.composeHTML)
      loadHTMLMsgPrefs();
    AdjustFocus();
  },

  NotifyComposeBodyReadyNew: function() {
    let insertParagraph = this.useParagraph;

    let mailDoc = document.getElementById("content-frame").contentDocument;
    let mailBody = mailDoc.querySelector("body");
    if (insertParagraph && gBodyFromArgs) {
      // Check for "empty" body before allowing paragraph to be inserted.
      // Non-empty bodies in a new message can occur when clicking on a
      // mailto link or when using the command line option -compose.
      // An "empty" body can be one of these two cases:
      // 1) <br> and nothing follows (no next sibling)
      // 2) <div/pre class="moz-signature">
      // Note that <br><div/pre class="moz-signature"> doesn't happen in
      // paragraph mode.
      let firstChild = mailBody.firstChild;
      if ((firstChild.nodeName != "BR" || firstChild.nextSibling) &&
          !isSignature(firstChild))
        insertParagraph = false;
    }

    // Control insertion of line breaks.
    if (insertParagraph) {
      this.editor.enableUndo(false);

      this.editor.selection.collapse(mailBody, 0);
      let pElement = this.editor.createElementWithDefaults("p");
      let brElement = this.editor.createElementWithDefaults("br");
      pElement.appendChild(brElement);
      this.editor.insertElementAtSelection(pElement, false);

      this.paragraphState.setAttribute("state", "p");

      this.editor.beginningOfDocument();
      this.editor.enableUndo(true);
      this.editor.resetModificationCount();
    } else {
      this.paragraphState.setAttribute("state", "");
    }
  },

  NotifyComposeBodyReadyReply: function() {
    // Control insertion of line breaks.
    if (this.useParagraph) {
      let mailDoc = document.getElementById("content-frame").contentDocument;
      let mailBody = mailDoc.querySelector("body");
      let selection = this.editor.selection;

      // Make sure the selection isn't inside the signature.
      if (isSignature(mailBody.firstChild))
        selection.collapse(mailBody, 0);

      let range = selection.getRangeAt(0);
      let start = range.startOffset;

      if (start != range.endOffset) {
        // The selection is not collapsed, most likely due to the
        // "select the quote" option. In this case we do nothing.
        return;
      }

      if (range.startContainer != mailBody) {
        dump("Unexpected selection in NotifyComposeBodyReadyReply\n");
        return;
      }

      this.editor.enableUndo(false);

      let pElement = this.editor.createElementWithDefaults("p");
      let brElement = this.editor.createElementWithDefaults("br");
      pElement.appendChild(brElement);
      this.editor.insertElementAtSelection(pElement, false);

      // Position into the paragraph.
      selection.collapse(pElement, 0);

      this.paragraphState.setAttribute("state", "p");

      this.editor.enableUndo(true);
      this.editor.resetModificationCount();
    } else {
      this.paragraphState.setAttribute("state", "");
    }
  },

  NotifyComposeBodyReadyForwardInline: function() {
    let mailDoc = document.getElementById("content-frame").contentDocument;
    let mailBody = mailDoc.querySelector("body");
    let selection = this.editor.selection;

    this.editor.enableUndo(false);

    // Control insertion of line breaks.
    selection.collapse(mailBody, 0);
    if (this.useParagraph) {
      let pElement = this.editor.createElementWithDefaults("p");
      let brElement = this.editor.createElementWithDefaults("br");
      pElement.appendChild(brElement);
      this.editor.insertElementAtSelection(pElement, false);
      this.paragraphState.setAttribute("state", "p");
    } else {
      // insertLineBreak() has been observed to insert two <br> elements
      // instead of one before a <div>, so we'll do it ourselves here.
      let brElement = this.editor.createElementWithDefaults("br");
      this.editor.insertElementAtSelection(brElement, false);
      this.paragraphState.setAttribute("state", "");
    }

    this.editor.beginningOfDocument();
    this.editor.enableUndo(true);
    this.editor.resetModificationCount();
  },

  ComposeProcessDone: function(aResult) {
    gWindowLocked = false;
    enableEditableFields();
    updateComposeItems();

    if (aResult== Cr.NS_OK)
    {
      if (!gAutoSaving)
        SetContentAndBodyAsUnmodified();

      if (gCloseWindowAfterSave)
      {
        // Notify the SendListener that Send has been aborted and Stopped
        if (gMsgCompose)
          gMsgCompose.onSendNotPerformed(null, Cr.NS_ERROR_ABORT);

        MsgComposeCloseWindow();
      }
    }
    // else if we failed to save, and we're autosaving, need to re-mark the editor
    // as changed, so that we won't lose the changes.
    else if (gAutoSaving)
    {
      gMsgCompose.bodyModified = true;
      gContentChanged = true;
    }

    gAutoSaving = false;
    gCloseWindowAfterSave = false;
  },

  SaveInFolderDone: function(folderURI) {
    DisplaySaveFolderDlg(folderURI);
  }
};

// all progress notifications are done through the nsIWebProgressListener implementation...
var progressListener = {
    onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus)
    {
      if (aStateFlags & Ci.nsIWebProgressListener.STATE_START)
      {
        document.getElementById('navigator-throbber').setAttribute("busy", "true");
        document.getElementById('compose-progressmeter').setAttribute( "mode", "undetermined" );
        document.getElementById("statusbar-progresspanel").collapsed = false;
      }

      if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP)
      {
        gSendOrSaveOperationInProgress = false;
        document.getElementById('navigator-throbber').removeAttribute("busy");
        document.getElementById('compose-progressmeter').setAttribute( "mode", "normal" );
        document.getElementById('compose-progressmeter').setAttribute( "value", 0 );
        document.getElementById("statusbar-progresspanel").collapsed = true;
        document.getElementById('statusText').setAttribute('label', '');
      }
    },

    onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress)
    {
      // Calculate percentage.
      var percent;
      if ( aMaxTotalProgress > 0 )
      {
        percent = Math.round( (aCurTotalProgress*100)/aMaxTotalProgress );
        if ( percent > 100 )
          percent = 100;

        document.getElementById('compose-progressmeter').removeAttribute("mode");

        // Advance progress meter.
        document.getElementById('compose-progressmeter').setAttribute( "value", percent );
      }
      else
      {
        // Progress meter should be barber-pole in this case.
        document.getElementById('compose-progressmeter').setAttribute( "mode", "undetermined" );
      }
    },

    onLocationChange: function(aWebProgress, aRequest, aLocation, aFlags)
    {
      // we can ignore this notification
    },

    onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage)
    {
      // Looks like it's possible that we get call while the document has been already delete!
      // therefore we need to protect ourself by using try/catch
      try {
        let statusText = document.getElementById("statusText");
        if (statusText)
          statusText.setAttribute("label", aMessage);
      } catch (ex) {}
    },

    onSecurityChange: function(aWebProgress, aRequest, state)
    {
      // we can ignore this notification
    },

    QueryInterface : function(iid)
    {
      if (iid.equals(Ci.nsIWebProgressListener) ||
          iid.equals(Ci.nsISupportsWeakReference) ||
          iid.equals(Ci.nsISupports))
        return this;

      throw Cr.NS_NOINTERFACE;
    }
};

var defaultController =
{
  supportsCommand: function(command)
  {
    switch (command)
    {
      //File Menu
      case "cmd_attachFile":
      case "cmd_attachPage":
      case "cmd_close":
      case "cmd_save":
      case "cmd_saveAsFile":
      case "cmd_saveAsDraft":
      case "cmd_saveAsTemplate":
      case "cmd_sendButton":
      case "cmd_sendNow":
      case "cmd_sendWithCheck":
      case "cmd_sendLater":
      case "cmd_printSetup":
      case "cmd_printpreview":
      case "cmd_print":

      //Edit Menu
      case "cmd_account":
      case "cmd_preferences":

      //Options Menu
      case "cmd_selectAddress":
      case "cmd_outputFormat":
      case "cmd_quoteMessage":
        return true;

      default:
        return false;
    }
  },
  isCommandEnabled: function(command)
  {
    var composeHTML = gMsgCompose && gMsgCompose.composeHTML;

    switch (command)
    {
      //File Menu
      case "cmd_attachFile":
      case "cmd_attachPage":
      case "cmd_close":
      case "cmd_save":
      case "cmd_saveAsFile":
      case "cmd_saveAsDraft":
      case "cmd_saveAsTemplate":
      case "cmd_printSetup":
      case "cmd_printpreview":
      case "cmd_print":
        return !gWindowLocked;
      case "cmd_sendButton":
      case "cmd_sendLater":
      case "cmd_sendWithCheck":
      case "cmd_sendButton":
        return !gWindowLocked && !gSendLocked;
      case "cmd_sendNow":
        return !gWindowLocked && !Services.io.offline && !gSendLocked;

      //Edit Menu
      case "cmd_account":
      case "cmd_preferences":
        return true;

      //Options Menu
      case "cmd_selectAddress":
        return !gWindowLocked;
      case "cmd_outputFormat":
        return composeHTML;
      case "cmd_quoteMessage":
        var selectedURIs = GetSelectedMessages();
        if (selectedURIs && selectedURIs.length > 0)
          return true;
        return false;

      default:
        return false;
    }
  },

  doCommand: function(command)
  {
    switch (command)
    {
      //File Menu
      case "cmd_attachFile"         : if (defaultController.isCommandEnabled(command)) AttachFile();           break;
      case "cmd_attachPage"         : AttachPage();           break;
      case "cmd_close"              : DoCommandClose();       break;
      case "cmd_save"               : Save();                 break;
      case "cmd_saveAsFile"         : SaveAsFile(true);       break;
      case "cmd_saveAsDraft"        : SaveAsDraft();          break;
      case "cmd_saveAsTemplate"     : SaveAsTemplate();       break;
      case "cmd_sendButton"         :
        if (defaultController.isCommandEnabled(command))
        {
          if (Services.io.offline)
            SendMessageLater();
          else
            SendMessage();
        }
        break;
      case "cmd_sendNow"            : if (defaultController.isCommandEnabled(command)) SendMessage();          break;
      case "cmd_sendWithCheck"      : if (defaultController.isCommandEnabled(command)) SendMessageWithCheck(); break;
      case "cmd_sendLater"          : if (defaultController.isCommandEnabled(command)) SendMessageLater();     break;
      case "cmd_printSetup"         : PrintUtils.showPageSetup(); break;
      case "cmd_printpreview"       : PrintUtils.printPreview(PrintPreviewListener); break;
      case "cmd_print"              :
        let browser = GetCurrentEditorElement();
        PrintUtils.printWindow(browser.outerWindowID, browser);
        break;

      //Edit Menu
      case "cmd_account"            :
        let currentAccountKey = getCurrentAccountKey();
        let account = MailServices.accounts.getAccount(currentAccountKey);
        MsgAccountManager(null, account.incomingServer);
        break;
      case "cmd_preferences"        : DoCommandPreferences(); break;

      //Options Menu
      case "cmd_selectAddress"      : if (defaultController.isCommandEnabled(command)) SelectAddress();         break;
      case "cmd_quoteMessage"       : if (defaultController.isCommandEnabled(command)) QuoteSelectedMessage();  break;
      default:
        return;
    }
  },

  onEvent: function(event)
  {
  }
};

var gAttachmentBucketController =
{
  supportsCommand: function(aCommand)
  {
    switch (aCommand)
    {
      case "cmd_delete":
      case "cmd_renameAttachment":
      case "cmd_selectAll":
      case "cmd_openAttachment":
        return true;
      default:
        return false;
    }
  },

  isCommandEnabled: function(aCommand)
  {
    switch (aCommand)
    {
      case "cmd_delete":
        return MessageGetNumSelectedAttachments() > 0;
      case "cmd_renameAttachment":
        return MessageGetNumSelectedAttachments() == 1;
      case "cmd_selectAll":
        return MessageHasAttachments();
      case "cmd_openAttachment":
        return MessageGetNumSelectedAttachments() == 1;
      default:
        return false;
    }
  },

  doCommand: function(aCommand)
  {
    switch (aCommand)
    {
      case "cmd_delete":
        if (MessageGetNumSelectedAttachments() > 0)
          RemoveSelectedAttachment();
        break;
      case "cmd_renameAttachment":
        if (MessageGetNumSelectedAttachments() == 1)
          RenameSelectedAttachment();
        break;
      case "cmd_selectAll":
        if (MessageHasAttachments())
          SelectAllAttachments();
        break;
      case "cmd_openAttachment":
        if (MessageGetNumSelectedAttachments() == 1)
          OpenSelectedAttachment();
        break;
      default:
        return;
    }
  },

  onEvent: function(event)
  {
  }
};

function QuoteSelectedMessage()
{
  var selectedURIs = GetSelectedMessages();
  if (selectedURIs)
    for (let i = 0; i < selectedURIs.length; i++)
      gMsgCompose.quoteMessage(selectedURIs[i]);
}

function GetSelectedMessages()
{
  var mailWindow = gMsgCompose && Services.wm.getMostRecentWindow("mail:3pane");
  return mailWindow && mailWindow.gFolderDisplay.selectedMessageUris;
}

function SetupCommandUpdateHandlers()
{
  top.controllers.appendController(defaultController);

  let attachmentBucket = document.getElementById("attachmentBucket");
  attachmentBucket.controllers.appendController(gAttachmentBucketController);

  document.getElementById("optionsMenuPopup")
          .addEventListener("popupshowing", updateOptionItems, true);
}

function UnloadCommandUpdateHandlers()
{
  document.getElementById("optionsMenuPopup")
          .removeEventListener("popupshowing", updateOptionItems, true);

  top.controllers.removeController(defaultController);

  let attachmentBucket = document.getElementById("attachmentBucket");
  attachmentBucket.controllers.removeController(gAttachmentBucketController);
}

function CommandUpdate_MsgCompose()
{
  var focusedWindow = top.document.commandDispatcher.focusedWindow;

  // we're just setting focus to where it was before
  if (focusedWindow == gLastWindowToHaveFocus) {
    return;
  }

  gLastWindowToHaveFocus = focusedWindow;

  updateComposeItems();
}

function updateComposeItems()
{
  try {
    // Edit Menu
    goUpdateCommand("cmd_rewrap");

    // Insert Menu
    if (gMsgCompose && gMsgCompose.composeHTML)
    {
      goUpdateCommand("cmd_renderedHTMLEnabler");
      goUpdateCommand("cmd_decreaseFontStep");
      goUpdateCommand("cmd_increaseFontStep");
      goUpdateCommand("cmd_bold");
      goUpdateCommand("cmd_italic");
      goUpdateCommand("cmd_underline");
      goUpdateCommand("cmd_ul");
      goUpdateCommand("cmd_ol");
      goUpdateCommand("cmd_indent");
      goUpdateCommand("cmd_outdent");
      goUpdateCommand("cmd_align");
      goUpdateCommand("cmd_smiley");
    }

    // Options Menu
    goUpdateCommand("cmd_spelling");
  } catch(e) {}
}

function openEditorContextMenu(popup)
{
  gContextMenu = new nsContextMenu(popup);
  if (gContextMenu.shouldDisplay)
  {
    // If message body context menu then focused element should be content.
    var showPasteExtra =
        top.document.commandDispatcher.focusedWindow == content;
    gContextMenu.showItem("context-pasteNoFormatting", showPasteExtra);
    gContextMenu.showItem("context-pasteQuote", showPasteExtra);
    if (showPasteExtra)
    {
      goUpdateCommand("cmd_pasteNoFormatting");
      goUpdateCommand("cmd_pasteQuote");
    }
    return true;
  }
  return false;
}

function updateEditItems()
{
  goUpdateCommand("cmd_pasteNoFormatting");
  goUpdateCommand("cmd_pasteQuote");
  goUpdateCommand("cmd_delete");
  goUpdateCommand("cmd_renameAttachment");
  goUpdateCommand("cmd_selectAll");
  goUpdateCommand("cmd_openAttachment");
  goUpdateCommand("cmd_findReplace");
  goUpdateCommand("cmd_find");
  goUpdateCommand("cmd_findNext");
  goUpdateCommand("cmd_findPrev");
}

function updateOptionItems()
{
  goUpdateCommand("cmd_quoteMessage");
}

/**
 * Update all the commands for sending a message to reflect their current state.
 */
function updateSendCommands(aHaveController) {
  updateSendLock();
  if (aHaveController) {
    goUpdateCommand("cmd_sendButton");
    goUpdateCommand("cmd_sendNow");
    goUpdateCommand("cmd_sendLater");
    goUpdateCommand("cmd_sendWithCheck");
  } else {
    goSetCommandEnabled("cmd_sendButton",
                        defaultController.isCommandEnabled("cmd_sendButton"));
    goSetCommandEnabled("cmd_sendNow",
                        defaultController.isCommandEnabled("cmd_sendNow"));
    goSetCommandEnabled("cmd_sendLater",
                        defaultController.isCommandEnabled("cmd_sendLater"));
    goSetCommandEnabled("cmd_sendWithCheck",
                        defaultController.isCommandEnabled("cmd_sendWithCheck"));
  }
}

var messageComposeOfflineQuitObserver = {
  observe: function(aSubject, aTopic, aState) {
    // sanity checks
    if (aTopic == "network:offline-status-changed")
    {
      MessageComposeOfflineStateChanged(aState == "offline");
    }
    // check whether to veto the quit request (unless another observer already
    // did)
    else if (aTopic == "quit-application-requested" &&
             aSubject instanceof Ci.nsISupportsPRBool &&
             !aSubject.data)
      aSubject.data = !ComposeCanClose();
  }
}

function AddMessageComposeOfflineQuitObserver()
{
  Services.obs.addObserver(messageComposeOfflineQuitObserver,
                           "network:offline-status-changed");
  Services.obs.addObserver(messageComposeOfflineQuitObserver,
                           "quit-application-requested");

  // set the initial state of the send button
  MessageComposeOfflineStateChanged(Services.io.offline);
}

function RemoveMessageComposeOfflineQuitObserver()
{
  Services.obs.removeObserver(messageComposeOfflineQuitObserver,
                              "network:offline-status-changed");
  Services.obs.removeObserver(messageComposeOfflineQuitObserver,
                              "quit-application-requested");
}

function MessageComposeOfflineStateChanged(goingOffline)
{
  try {
    var sendButton = document.getElementById("button-send");
    var sendNowMenuItem = document.getElementById("menu_sendNow");

    if (!gSavedSendNowKey) {
      gSavedSendNowKey = sendNowMenuItem.getAttribute('key');
    }

    // don't use goUpdateCommand here ... the defaultController might not be installed yet
    updateSendCommands(false);

    if (goingOffline)
    {
      sendButton.label = sendButton.getAttribute('later_label');
      sendButton.setAttribute('tooltiptext', sendButton.getAttribute('later_tooltiptext'));
      sendNowMenuItem.removeAttribute('key');
    }
    else
    {
      sendButton.label = sendButton.getAttribute('now_label');
      sendButton.setAttribute('tooltiptext', sendButton.getAttribute('now_tooltiptext'));
      if (gSavedSendNowKey) {
        sendNowMenuItem.setAttribute('key', gSavedSendNowKey);
      }
    }

  } catch(e) {}
}

function DoCommandClose()
{
  if (ComposeCanClose()) {
    // Notify the SendListener that Send has been aborted and Stopped
    if (gMsgCompose)
      gMsgCompose.onSendNotPerformed(null, Cr.NS_ERROR_ABORT);

    // note: if we're not caching this window, this destroys it for us
    MsgComposeCloseWindow();
  }

  return false;
}

function DoCommandPreferences()
{
  goPreferences('composing_messages_pane');
}

function toggleAffectedChrome(aHide)
{
  // chrome to toggle includes:
  //   (*) menubar
  //   (*) toolbox
  //   (*) sidebar
  //   (*) statusbar

  if (!gChromeState)
    gChromeState = {};

  var statusbar = document.getElementById("status-bar");

  // sidebar states map as follows:
  //   hidden    => hide/show nothing
  //   collapsed => hide/show only the splitter
  //   shown     => hide/show the splitter and the box
  if (aHide)
  {
    // going into print preview mode
    gChromeState.sidebar = SidebarGetState();
    SidebarSetState("hidden");

    // deal with the Status Bar
    gChromeState.statusbarWasHidden = statusbar.hidden;
    statusbar.hidden = true;
  }
  else
  {
    // restoring normal mode (i.e., leaving print preview mode)
    SidebarSetState(gChromeState.sidebar);

    // restore the Status Bar
    statusbar.hidden = gChromeState.statusbarWasHidden;
  }

  // if we are unhiding and sidebar used to be there rebuild it
  if (!aHide && gChromeState.sidebar == "visible")
    SidebarRebuild();

  getMailToolbox().hidden = aHide;
  document.getElementById("appcontent").collapsed = aHide;
}

var PrintPreviewListener = {
  getPrintPreviewBrowser()
  {
    var browser = document.getElementById("ppBrowser");
    if (!browser)
    {
      browser = document.createElement("browser");
      browser.setAttribute("id", "ppBrowser");
      browser.setAttribute("flex", "1");
      browser.setAttribute("disablehistory", "true");
      browser.setAttribute("disablesecurity", "true");
      browser.setAttribute("type", "content");
      document.getElementById("sidebar-parent")
              .insertBefore(browser, document.getElementById("appcontent"));
    }
    return browser;
  },
  getSourceBrowser()
  {
    return GetCurrentEditorElement();
  },
  getNavToolbox()
  {
    return getMailToolbox();
  },
  onEnter()
  {
    toggleAffectedChrome(true);
  },
  onExit()
  {
    document.getElementById("ppBrowser").collapsed = true;
    toggleAffectedChrome(false);
  }
}

function ToggleWindowLock()
{
  gWindowLocked = !gWindowLocked;
  updateComposeItems();
}

/* This function will go away soon as now arguments are passed to the window using a object of type nsMsgComposeParams instead of a string */
function GetArgs(originalData)
{
  var args = new Object();

  if (originalData == "")
    return null;

  var data = "";
  var separator = String.fromCharCode(1);

  var quoteChar = "";
  var prevChar = "";
  var nextChar = "";
  for (let i = 0; i < originalData.length; i++, prevChar = aChar)
  {
    var aChar = originalData.charAt(i)
    var aCharCode = originalData.charCodeAt(i)
    if ( i < originalData.length - 1)
      nextChar = originalData.charAt(i + 1);
    else
      nextChar = "";

    if (aChar == quoteChar && (nextChar == "," || nextChar == ""))
    {
      quoteChar = "";
      data += aChar;
    }
    else if ((aCharCode == 39 || aCharCode == 34) && prevChar == "=") //quote or double quote
    {
      if (quoteChar == "")
        quoteChar = aChar;
      data += aChar;
    }
    else if (aChar == ",")
    {
      if (quoteChar == "")
        data += separator;
      else
        data += aChar
    }
    else
      data += aChar
  }

  var pairs = data.split(separator);

  for (let i = pairs.length - 1; i >= 0; i--)
  {
    var pos = pairs[i].indexOf('=');
    if (pos == -1)
      continue;
    var argname = pairs[i].substring(0, pos);
    var argvalue = pairs[i].substring(pos + 1);
    if (argvalue.charAt(0) == "'" && argvalue.charAt(argvalue.length - 1) == "'")
      args[argname] = argvalue.substring(1, argvalue.length - 1);
    else
      try {
        args[argname] = decodeURIComponent(argvalue);
      } catch (e) {args[argname] = argvalue;}
    // dump("[" + argname + "=" + args[argname] + "]\n");
  }
  return args;
}

function ComposeFieldsReady()
{
  //If we are in plain text, we need to set the wrap column
  if (! gMsgCompose.composeHTML) {
    try {
      gMsgCompose.editor.wrapWidth = gMsgCompose.wrapLength;
    }
    catch (e) {
      dump("### textEditor.wrapWidth exception text: " + e + " - failed\n");
    }
  }
  CompFields2Recipients(gMsgCompose.compFields);
  SetComposeWindowTitle();
  enableEditableFields();
}

// checks if the passed in string is a mailto url, if it is, generates nsIMsgComposeParams
// for the url and returns them.
function handleMailtoArgs(mailtoUrl)
{
  // see if the string is a mailto url....do this by checking the first 7 characters of the string
  if (/^mailto:/i.test(mailtoUrl))
  {
    // if it is a mailto url, turn the mailto url into a MsgComposeParams object....
    var uri = Services.io.newURI(mailtoUrl);

    if (uri)
      return MailServices.compose.getParamsForMailto(uri);
  }

  return null;
}
/**
 * Handle ESC keypress from composition window for
 * notifications with close button in the
 * attachmentNotificationBox.
 */
function handleEsc()
{
  let activeElement = document.activeElement;

  // If findbar is visible and the focus is in the message body,
  // hide it. (Focus on the findbar is handled by findbar itself).
  let findbar = document.getElementById("FindToolbar");
  if (findbar && !findbar.hidden && activeElement.id == "content-frame") {
    findbar.close();
    return;
  }

  // If there is a notification in the attachmentNotificationBox
  // AND focus is in message body, subject field or on the notification,
  // hide it.
  let notification = document.getElementById("attachmentNotificationBox")
                             .currentNotification;
  if (notification && (activeElement.id == "content-frame" ||
      activeElement.parentNode.parentNode.id == "msgSubject" ||
      notification.contains(activeElement) ||
      activeElement.classList.contains("messageCloseButton"))) {
    notification.close();
  }
}

/**
 * On paste or drop, we may want to modify the content before inserting it into
 * the editor, replacing file URLs with data URLs when appropriate.
 */
function onPasteOrDrop(e) {
  // For paste use e.clipboardData, for drop use e.dataTransfer.
  let dataTransfer = ("clipboardData" in e) ? e.clipboardData : e.dataTransfer;

  if (!dataTransfer.types.includes("text/html")) {
    return;
  }

  if (!gMsgCompose.composeHTML) {
    // We're in the plain text editor. Nothing to do here.
    return;
  }

  let html = dataTransfer.getData("text/html");
  let doc = (new DOMParser()).parseFromString(html, "text/html");
  let tmpD = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let pendingConversions = 0;
  let needToPreventDefault = true;
  for (let img of doc.images) {
    if (!/^file:/i.test(img.src)) {
      // Doesn't start with file:. Nothing to do here.
      continue;
    }

    // This may throw if the URL is invalid for the OS.
    let nsFile;
    try {
      nsFile = Services.io.getProtocolHandler("file")
                 .QueryInterface(Ci.nsIFileProtocolHandler)
                 .getFileFromURLSpec(img.src);
    } catch (ex) {
      continue;
    }

    if (!nsFile.exists()) {
      continue;
    }

    if (!tmpD.contains(nsFile)) {
       // Not anywhere under the temp dir.
      continue;
    }

    let contentType = Cc["@mozilla.org/mime;1"]
                        .getService(Ci.nsIMIMEService)
                        .getTypeFromFile(nsFile);
    if (!contentType.startsWith("image/")) {
      continue;
    }

    // If we ever get here, we need to prevent the default paste or drop since
    // the code below will do its own insertion.
    if (needToPreventDefault) {
      e.preventDefault();
      needToPreventDefault = false;
    }

    File.createFromNsIFile(nsFile).then(function(file) {
      if (file.lastModified < (Date.now() - 60000)) {
        // Not put in temp in the last minute. May be something other than
        // a copy-paste. Let's not allow that.
        return;
      }

      let doTheInsert = function() {
        // Now run it through sanitation to make sure there wasn't any
        // unwanted things in the content.
        let ParserUtils = Cc["@mozilla.org/parserutils;1"]
                            .getService(Ci.nsIParserUtils);
        let html2 = ParserUtils.sanitize(doc.documentElement.innerHTML,
                                         ParserUtils.SanitizerAllowStyle);
        getBrowser().contentDocument.execCommand("insertHTML", false, html2);
      }

      // Everything checks out. Convert file to data URL.
      let reader = new FileReader();
      reader.addEventListener("load", function() {
        let dataURL = reader.result;
        pendingConversions--;
        img.src = dataURL;
        if (pendingConversions == 0) {
          doTheInsert();
        }
      });

      reader.addEventListener("error", function() {
        pendingConversions--;
        if (pendingConversions == 0) {
          doTheInsert();
        }
      });

      pendingConversions++;
      reader.readAsDataURL(file);
    });
  }
}

function ComposeStartup(aParams)
{
  var params = null; // New way to pass parameters to the compose window as a nsIMsgComposeParameters object
  var args = null;   // old way, parameters are passed as a string
  gBodyFromArgs = false;

  if (aParams)
    params = aParams;
  else if (window.arguments && window.arguments[0]) {
    try {
      if (window.arguments[0] instanceof Ci.nsIMsgComposeParams)
        params = window.arguments[0];
      else
        params = handleMailtoArgs(window.arguments[0]);
    }
    catch(ex) { dump("ERROR with parameters: " + ex + "\n"); }

    // if still no dice, try and see if the params is an old fashioned list of string attributes
    // XXX can we get rid of this yet?
    if (!params)
    {
      args = GetArgs(window.arguments[0]);
    }
  }

  // Set the document language to the preference as early as possible.
  document.documentElement
          .setAttribute("lang", Services.prefs.getCharPref("spellchecker.dictionary"));

  var identityList = GetMsgIdentityElement();

  document.addEventListener("paste", onPasteOrDrop);
  document.addEventListener("drop", onPasteOrDrop);

  if (identityList)
    FillIdentityList(identityList);

  if (!params) {
    // This code will go away soon as now arguments are passed to the window
    // using a object of type nsMsgComposeParams instead of a string.
    params = Cc["@mozilla.org/messengercompose/composeparams;1"]
               .createInstance(Ci.nsIMsgComposeParams);
    params.composeFields = Cc["@mozilla.org/messengercompose/composefields;1"]
                             .createInstance(Ci.nsIMsgCompFields);

    if (args) { //Convert old fashion arguments into params
      var composeFields = params.composeFields;
      if (args.bodyislink && args.bodyislink == "true")
        params.bodyIsLink = true;
      if (args.type)
        params.type = args.type;
      if (args.format) {
        // Only use valid values.
        if (args.format == Ci.nsIMsgCompFormat.PlainText ||
            args.format == Ci.nsIMsgCompFormat.HTML ||
            args.format == Ci.nsIMsgCompFormat.OppositeOfDefault)
          params.format = args.format;
        else if (args.format.toLowerCase().trim() == "html")
          params.format = Ci.nsIMsgCompFormat.HTML;
        else if (args.format.toLowerCase().trim() == "text")
          params.format = Ci.nsIMsgCompFormat.PlainText;
      }
      if (args.originalMsgURI)
        params.originalMsgURI = args.originalMsgURI;
      if (args.preselectid)
        params.identity = getIdentityForKey(args.preselectid);
      if (args.from)
        composeFields.from = args.from;
      if (args.to)
        composeFields.to = args.to;
      if (args.cc)
        composeFields.cc = args.cc;
      if (args.bcc)
        composeFields.bcc = args.bcc;
      if (args.newsgroups)
        composeFields.newsgroups = args.newsgroups;
      if (args.subject)
        composeFields.subject = args.subject;
      if (args.attachment)
      {
        var attachmentList = args.attachment.split(",");
        var commandLine = Cc["@mozilla.org/toolkit/command-line;1"]
                            .createInstance();
        for (let i = 0; i < attachmentList.length; i++)
        {
          let attachmentStr = attachmentList[i];
          let uri = commandLine.resolveURI(attachmentStr);
          let attachment = Cc["@mozilla.org/messengercompose/attachment;1"]
                             .createInstance(Ci.nsIMsgAttachment);

          if (uri instanceof Ci.nsIFileURL)
          {
            if (uri.file.exists())
              attachment.size = uri.file.fileSize;
            else
              attachment = null;
          }

          // Only want to attach if a file that exists or it is not a file.
          if (attachment)
          {
            attachment.url = uri.spec;
            composeFields.addAttachment(attachment);
          }
          else
          {
            let title = sComposeMsgsBundle.getString("errorFileAttachTitle");
            let msg = sComposeMsgsBundle.getFormattedString("errorFileAttachMessage",
                                                            [attachmentStr]);
            Services.prompt.alert(null, title, msg);
          }
        }
      }
      if (args.newshost)
        composeFields.newshost = args.newshost;
      if (args.message) {
        let msgFile = Cc["@mozilla.org/file/local;1"]
                        .createInstance(Ci.nsIFile);
        if (OS.Path.dirname(args.message) == ".") {
          let workingDir = Services.dirsvc.get("CurWorkD", Ci.nsIFile);
          args.message = OS.Path.join(workingDir.path, OS.Path.basename(args.message));
        }
        msgFile.initWithPath(args.message);

        if (!msgFile.exists()) {
          let title = sComposeMsgsBundle.getString("errorFileMessageTitle");
          let msg = sComposeMsgsBundle.getFormattedString("errorFileMessageMessage",
                                                          [args.message]);
          Services.prompt.alert(null, title, msg);
        } else {
          let data = "";
          let fstream = null;
          let cstream = null;

          try {
            fstream = Cc["@mozilla.org/network/file-input-stream;1"]
                        .createInstance(Ci.nsIFileInputStream);
            cstream = Cc["@mozilla.org/intl/converter-input-stream;1"]
                        .createInstance(Ci.nsIConverterInputStream);
            fstream.init(msgFile, -1, 0, 0); // Open file in default/read-only mode.
            cstream.init(fstream, "UTF-8", 0, 0);

            let str = {};
            let read = 0;

            do {
              // Read as much as we can and put it in str.value.
              read = cstream.readString(0xffffffff, str);
              data += str.value;
            } while (read != 0);
          } catch (e) {
            let title = sComposeMsgsBundle.getString("errorFileMessageTitle");
            let msg = sComposeMsgsBundle.getFormattedString("errorLoadFileMessageMessage",
                                                            [args.message]);
            Services.prompt.alert(null, title, msg);

          } finally {
            if (cstream)
              cstream.close();
            if (fstream)
              fstream.close();
          }

          if (data) {
            let pos = data.search(/\S/); // Find first non-whitespace character.

            if (params.format != Ci.nsIMsgCompFormat.PlainText &&
                (args.message.endsWith(".htm") ||
                 args.message.endsWith(".html") ||
                 data.substr(pos, 14).toLowerCase() == "<!doctype html" ||
                 data.substr(pos, 5).toLowerCase() == "<html")) {
              // We replace line breaks because otherwise they'll be converted
              // to <br> in nsMsgCompose::BuildBodyMessageAndSignature().
              // Don't do the conversion if the user asked explicitly for plain
              // text.
              data = data.replace(/\r?\n/g, " ");
            }
            gBodyFromArgs = true;
            composeFields.body = data;
          }
        }
      } else if (args.body) {
        gBodyFromArgs = true;
        composeFields.body = args.body;
      }
    }
  }

  gComposeType = params.type;

  // Detect correct identity when missing or mismatched.
  // An identity with no email is likely not valid.
  // When editing a draft, 'params.identity' is pre-populated with the identity
  // that created the draft or the identity owning the draft folder for a
  // "foreign", draft, see ComposeMessage() in mailCommands.js. We don't want
  // the latter, so use the creator identity which could be null.
  if (gComposeType == Ci.nsIMsgCompType.Draft) {
    let creatorKey = params.composeFields.creatorIdentityKey;
    params.identity = creatorKey ? getIdentityForKey(creatorKey) : null;
  }
  let from = [];
  if (params.composeFields.from)
    from = MailServices.headerParser
                       .parseEncodedHeader(params.composeFields.from, null);
  from = (from.length && from[0] && from[0].email) ?
    from[0].email.toLowerCase().trim() : null;
  if (!params.identity || !params.identity.email ||
      (from && !emailSimilar(from, params.identity.email))) {
    let identities = MailServices.accounts.allIdentities;
    let suitableCount = 0;

    // Search for a matching identity.
    if (from) {
      for (let ident of identities) {
        if (ident.email && from == ident.email.toLowerCase()) {
          if (suitableCount == 0)
            params.identity = ident;
          suitableCount++;
          if (suitableCount > 1)
            break; // No need to find more, it's already not unique.
        }
      }
    }

    if (!params.identity || !params.identity.email) {
      let identity = null;
      // No preset identity and no match, so use the default account.
      let defaultAccount = MailServices.accounts.defaultAccount;
      if (defaultAccount) {
        identity = defaultAccount.defaultIdentity;
      }
      if (!identity) {
        // Get the first identity we have in the list.
        let identitykey = identityList.getItemAtIndex(0).getAttribute("identitykey");
        identity = MailServices.accounts.getIdentity(identitykey);
      }
      params.identity = identity;
    }

    // Warn if no or more than one match was found.
    // But don't warn for +suffix additions (a+b@c.com).
    if (from && (suitableCount > 1 ||
        (suitableCount == 0 && !emailSimilar(from, params.identity.email))))
      gComposeNotificationBar.setIdentityWarning(params.identity.identityName);
  }

  identityList.selectedItem =
    identityList.getElementsByAttribute("identitykey", params.identity.key)[0];
  if (params.composeFields.from)
    identityList.value = MailServices.headerParser.parseDecodedHeader(params.composeFields.from)[0].toString();
  LoadIdentity(true);

  // Get the <editor> element to startup an editor
  var editorElement = GetCurrentEditorElement();

  // Remember the original message URI. When editing a draft which is a reply
  // or forwarded message, this gets overwritten by the ancestor's message URI
  // so the disposition flags ("replied" or "forwarded") can be set on the
  // ancestor.
  // For our purposes we need the URI of the message being processed, not its
  // original ancestor.
  gOriginalMsgURI = params.originalMsgURI;
  gMsgCompose = MailServices.compose.initCompose(params, window,
                                                 editorElement.docShell);

  document.getElementById("returnReceiptMenu")
          .setAttribute("checked", gMsgCompose.compFields.returnReceipt);
  document.getElementById("dsnMenu")
          .setAttribute('checked', gMsgCompose.compFields.DSN);
  document.getElementById("cmd_attachVCard")
          .setAttribute("checked", gMsgCompose.compFields.attachVCard);
  document.getElementById("menu_inlineSpellCheck")
          .setAttribute("checked",
                        Services.prefs.getBoolPref("mail.spellcheck.inline"));

  let editortype = gMsgCompose.composeHTML ? "htmlmail" : "textmail";
  editorElement.makeEditable(editortype, true);

  // setEditorType MUST be call before setContentWindow
  if (gMsgCompose.composeHTML) {
    initLocalFontFaceMenu(document.getElementById("FontFacePopup"));
  } else {
    //Remove HTML toolbar, format and insert menus as we are editing in plain
    //text mode.
    let toolbar = document.getElementById("FormatToolbar");
    toolbar.hidden = true;
    toolbar.setAttribute("hideinmenu", "true");
    document.getElementById("outputFormatMenu").setAttribute("hidden", true);
    document.getElementById("formatMenu").setAttribute("hidden", true);
    document.getElementById("insertMenu").setAttribute("hidden", true);
  }

  // Do setup common to Message Composer and Web Composer.
  EditorSharedStartup();

  if (params.bodyIsLink) {
    let body = gMsgCompose.compFields.body;
    if (gMsgCompose.composeHTML) {
      let cleanBody;
      try {
        cleanBody = decodeURI(body);
      } catch(e) {
        cleanBody = body;
      }

      body = body.replace(/&/g, "&amp;");
      gMsgCompose.compFields.body =
        "<br /><a href=\"" + body + "\">" + cleanBody + "</a><br />";
    } else {
      gMsgCompose.compFields.body = "\n<" + body + ">\n";
    }
  }

  GetMsgSubjectElement().value = gMsgCompose.compFields.subject;

  var attachments = gMsgCompose.compFields.attachments;
  while (attachments.hasMoreElements()) {
    AddAttachment(attachments.getNext().QueryInterface(Ci.nsIMsgAttachment));
  }

  var event = document.createEvent('Events');
  event.initEvent('compose-window-init', false, true);
  document.getElementById("msgcomposeWindow").dispatchEvent(event);

  gMsgCompose.RegisterStateListener(stateListener);

  // Add an observer to be called when document is done loading,
  // which creates the editor.
  try {
    GetCurrentCommandManager().addCommandObserver(gMsgEditorCreationObserver,
                                                  "obs_documentCreated");

    // Load empty page to create the editor
    editorElement.webNavigation.loadURI("about:blank",
                     Ci.nsIWebNavigation.LOAD_FLAGS_NONE,
                     null,                             // referrer
                     null,                             // post-data stream
                     null,                             // HTTP headers
                     Services.scriptSecurityManager.getSystemPrincipal());
  } catch (e) {
    dump(" Failed to startup editor: "+e+"\n");
  }

  // create URI of the folder from draftId
  var draftId = gMsgCompose.compFields.draftId;
  var folderURI = draftId.substring(0, draftId.indexOf("#")).replace("-message", "");

  try {
    var folder = sRDF.GetResource(folderURI);

    gEditingDraft = (folder instanceof Ci.nsIMsgFolder) &&
                    (folder.flags & Ci.nsMsgFolderFlags.Drafts);
  }
  catch (ex) {
    gEditingDraft = false;
  }

  gAutoSaveKickedIn = false;

  gAutoSaveInterval = Services.prefs.getBoolPref("mail.compose.autosave")
    ? Services.prefs.getIntPref("mail.compose.autosaveinterval") * 60000
    : 0;

  if (gAutoSaveInterval)
    gAutoSaveTimeout = setTimeout(AutoSave, gAutoSaveInterval);
}

function splitEmailAddress(aEmail) {
  let at = aEmail.lastIndexOf("@");
  return (at != -1) ? [aEmail.slice(0, at), aEmail.slice(at + 1)]
                    : [aEmail, ""];
}

// Emails are equal ignoring +suffixes (email+suffix@example.com).
function emailSimilar(a, b) {
  if (!a || !b)
    return a == b;
  a = splitEmailAddress(a.toLowerCase());
  b = splitEmailAddress(b.toLowerCase());
  return a[1] == b[1] && a[0].split("+", 1)[0] == b[0].split("+", 1)[0];
}

// The new, nice, simple way of getting notified when a new editor has been created
var gMsgEditorCreationObserver =
{
  observe: function(aSubject, aTopic, aData)
  {
    if (aTopic == "obs_documentCreated")
    {
      var editor = GetCurrentEditor();
      var commandManager = GetCurrentCommandManager();
      if (editor && commandManager == aSubject) {
        let editorStyle = editor.QueryInterface(Ci.nsIEditorStyleSheets);
        // We use addOverrideStyleSheet rather than addStyleSheet so that we get
        // a synchronous load, rather than having a late-finishing async load
        // mark our editor as modified when the user hasn't typed anything yet,
        // but that means the sheet must not @import slow things, especially
        // not over the network.
        editorStyle.addOverrideStyleSheet("chrome://messenger/skin/messageQuotes.css");
        InitEditor(editor);
      }
      // Now that we know this document is an editor, update commands now if
      // the document has focus, or next time it receives focus via
      // CommandUpdate_MsgCompose()
      if (gLastWindowToHaveFocus == document.commandDispatcher.focusedWindow)
        updateComposeItems();
      else
        gLastWindowToHaveFocus = null;
    }
  }
}

function WizCallback(state)
{
  if (state){
    ComposeStartup(null);
  }
  else
  {
    // The account wizard is still closing so we can't close just yet
    setTimeout(MsgComposeCloseWindow, 0);
  }
}

function ComposeLoad()
{
  sComposeMsgsBundle = document.getElementById("bundle_composeMsgs");
  sBrandBundle = document.getElementById("brandBundle");

  var otherHeaders = Services.prefs.getCharPref("mail.compose.other.header");

  sRDF = Cc['@mozilla.org/rdf/rdf-service;1']
           .getService(Ci.nsIRDFService);
  sNameProperty = sRDF.GetResource("http://home.netscape.com/NC-rdf#Name?sort=true");

  AddMessageComposeOfflineQuitObserver();

  if (gLogComposePerformance)
    MailServices.compose.TimeStamp("Start initializing the compose window (ComposeLoad)", false);

  msgWindow.notificationCallbacks = new nsMsgBadCertHandler();

  try {
    SetupCommandUpdateHandlers();
    // This will do migration, or create a new account if we need to.
    // We also want to open the account wizard if no identities are found
    var state = verifyAccounts(WizCallback, true);

    if (otherHeaders) {
      var selectNode = document.getElementById('addressCol1#1');
      var otherHeaders_Array = otherHeaders.split(",");
      for (let i = 0; i < otherHeaders_Array.length; i++)
        selectNode.appendItem(otherHeaders_Array[i] + ":", "addr_other");
    }
    if (state)
      ComposeStartup(null);
  }
  catch (ex) {
    Cu.reportError(ex);
    var errorTitle = sComposeMsgsBundle.getString("initErrorDlogTitle");
    var errorMsg = sComposeMsgsBundle.getString("initErrorDlgMessage");
    Services.prompt.alert(window, errorTitle, errorMsg);

    MsgComposeCloseWindow();
    return;
  }
  if (gLogComposePerformance)
    MailServices.compose.TimeStamp("Done with the initialization (ComposeLoad). Waiting on editor to load about:blank", false);

  // Before and after callbacks for the customizeToolbar code
  var mailToolbox = getMailToolbox();
  mailToolbox.customizeInit = MailToolboxCustomizeInit;
  mailToolbox.customizeDone = MailToolboxCustomizeDone;
  mailToolbox.customizeChange = MailToolboxCustomizeChange;
}

function ComposeUnload()
{
  // Send notification that the window is going away completely.
  document.getElementById("msgcomposeWindow").dispatchEvent(
    new Event("compose-window-unload", { bubbles: false, cancelable: false }));

  GetCurrentCommandManager().removeCommandObserver(gMsgEditorCreationObserver,
                                                   "obs_documentCreated");
  UnloadCommandUpdateHandlers();

  // Stop InlineSpellCheckerUI so personal dictionary is saved
  EnableInlineSpellCheck(false);

  EditorCleanup();

  RemoveMessageComposeOfflineQuitObserver();

  if (gMsgCompose)
    gMsgCompose.UnregisterStateListener(stateListener);
  if (gAutoSaveTimeout)
    clearTimeout(gAutoSaveTimeout);
  if (msgWindow) {
    msgWindow.closeWindow();
    msgWindow.notificationCallbacks = null;
  }

  ReleaseGlobalVariables();
}

function ComposeSetCharacterSet(aEvent)
{
  if (gMsgCompose)
    SetDocumentCharacterSet(aEvent.target.getAttribute("charset"));
  else
    dump("Compose has not been created!\n");
}

function SetDocumentCharacterSet(aCharset)
{
  // Replace generic Japanese with ISO-2022-JP.
  if (aCharset == "Japanese") {
    aCharset = "ISO-2022-JP";
  }
  gMsgCompose.SetDocumentCharset(aCharset);
  SetComposeWindowTitle();
}

function GetCharsetUIString()
{
  // The charset here is already the canonical charset (not an alias).
  let charset = gMsgCompose.compFields.characterSet;
  if (!charset)
    return "";

  if (charset.toLowerCase() != gMsgCompose.compFields.defaultCharacterSet.toLowerCase()) {
    try {
      return " - " + gCharsetConvertManager.getCharsetTitle(charset);
    }
    catch(e) { // Not a canonical charset after all...
      Cu.reportError("Not charset title for charset=" + charset);
      return " - " + charset;
    }
  }
  return "";
}

// Add-ons can override this to customize the behavior.
function DoSpellCheckBeforeSend()
{
  return Services.prefs.getBoolPref("mail.SpellCheckBeforeSend");
}

/**
 * Handles message sending operations.
 * @param msgType nsIMsgCompDeliverMode of the operation.
 */
function GenericSendMessage(msgType) {
  var msgCompFields = gMsgCompose.compFields;

  Recipients2CompFields(msgCompFields);
  var address = GetMsgIdentityElement().value;
  address = MailServices.headerParser.makeFromDisplayAddress(address);
  msgCompFields.from = MailServices.headerParser.makeMimeHeader([address[0]]);
  var subject = GetMsgSubjectElement().value;
  msgCompFields.subject = subject;
  Attachments2CompFields(msgCompFields);

  if (msgType == Ci.nsIMsgCompDeliverMode.Now ||
      msgType == Ci.nsIMsgCompDeliverMode.Later ||
      msgType == Ci.nsIMsgCompDeliverMode.Background) {
    //Do we need to check the spelling?
    if (DoSpellCheckBeforeSend()) {
      // We disable spellcheck for the following -subject line, attachment
      // pane, identity and addressing widget therefore we need to explicitly
      // focus on the mail body when we have to do a spellcheck.
      SetMsgBodyFrameFocus();
      window.cancelSendMessage = false;
      window.openDialog("chrome://editor/content/EdSpellCheck.xul", "_blank",
                        "dialog,close,titlebar,modal,resizable",
                        true, true, false);
      if (window.cancelSendMessage)
        return;
    }

    // Strip trailing spaces and long consecutive WSP sequences from the
    // subject line to prevent getting only WSP chars on a folded line.
    var fixedSubject = subject.replace(/\s{74,}/g, "    ")
                              .replace(/\s*$/, "");
    if (fixedSubject != subject) {
      subject = fixedSubject;
      msgCompFields.subject = fixedSubject;
      GetMsgSubjectElement().value = fixedSubject;
    }

    // Remind the person if there isn't a subject.
    if (subject == "") {
      if (Services.prompt.confirmEx(
            window,
            sComposeMsgsBundle.getString("subjectEmptyTitle"),
            sComposeMsgsBundle.getString("subjectEmptyMessage"),
            (Services.prompt.BUTTON_TITLE_IS_STRING *
               Services.prompt.BUTTON_POS_0) +
            (Services.prompt.BUTTON_TITLE_IS_STRING *
               Services.prompt.BUTTON_POS_1),
            sComposeMsgsBundle.getString("sendWithEmptySubjectButton"),
            sComposeMsgsBundle.getString("cancelSendingButton"),
            null, null, {value:0}) == 1) {
        GetMsgSubjectElement().focus();
        return;
      }
    }

    // Check if the user tries to send a message to a newsgroup through a mail
    // account.
    var currentAccountKey = getCurrentAccountKey();
    var account = MailServices.accounts.getAccount(currentAccountKey);
    if (!account) {
      throw "UNEXPECTED: currentAccountKey '" + currentAccountKey +
          "' has no matching account!";
    }

    if (account.incomingServer.type != "nntp" &&
        msgCompFields.newsgroups != "") {
      const kDontAskAgainPref = "mail.compose.dontWarnMail2Newsgroup";
      // Default to ask user if the pref is not set.
      var dontAskAgain = Services.prefs.getBoolPref(kDontAskAgainPref);
      if (!dontAskAgain) {
        var checkbox = {value:false};
        var okToProceed = Services.prompt.confirmCheck(
                              window,
                              sComposeMsgsBundle.getString("noNewsgroupSupportTitle"),
                              sComposeMsgsBundle.getString("recipientDlogMessage"),
                              sComposeMsgsBundle.getString("CheckMsg"),
                              checkbox);

        if (!okToProceed)
          return;
      }
      if (checkbox.value)
        Services.prefs.setBoolPref(kDontAskAgainPref, true);

      // Remove newsgroups to prevent news_p to be set
      // in nsMsgComposeAndSend::DeliverMessage()
      msgCompFields.newsgroups = "";
    }

    // Before sending the message, check what to do with HTML message,
    // eventually abort.
    var convert = DetermineConvertibility();
    var action = DetermineHTMLAction(convert);
    // Check if e-mail addresses are complete, in case user has turned off
    // autocomplete to local domain.
    if (!CheckValidEmailAddress(msgCompFields.to, msgCompFields.cc, msgCompFields.bcc))
      return;

    if (action == Ci.nsIMsgCompSendFormat.AskUser) {
      var recommAction = (convert == Ci.nsIMsgCompConvertible.No)
                         ? Ci.nsIMsgCompSendFormat.AskUser
                         : Ci.nsIMsgCompSendFormat.PlainText;
      var result2 = {action:recommAction, convertible:convert, abort:false};
      window.openDialog("chrome://messenger/content/messengercompose/askSendFormat.xul",
                        "askSendFormatDialog", "chrome,modal,titlebar,centerscreen",
                        result2);
      if (result2.abort)
        return;
      action = result2.action;
    }

    // We will remember the users "send format" decision in the address
    // collector code (see nsAbAddressCollector::CollectAddress())
    // by using msgCompFields.forcePlainText and
    // msgCompFields.useMultipartAlternative to determine the
    // nsIAbPreferMailFormat (unknown, plaintext, or html).
    // If the user sends both, we remember html.
    switch (action) {
      case Ci.nsIMsgCompSendFormat.PlainText:
        msgCompFields.forcePlainText = true;
        msgCompFields.useMultipartAlternative = false;
        break;
      case Ci.nsIMsgCompSendFormat.HTML:
        msgCompFields.forcePlainText = false;
        msgCompFields.useMultipartAlternative = false;
        break;
      case Ci.nsIMsgCompSendFormat.Both:
        msgCompFields.forcePlainText = false;
        msgCompFields.useMultipartAlternative = true;
        break;
       default:
        throw new Error("Invalid nsIMsgCompSendFormat action; action=" + action);
    }
  }

  // Hook for extra compose pre-processing.
  Services.obs.notifyObservers(window, "mail:composeOnSend");

  var originalCharset = gMsgCompose.compFields.characterSet;
  // Check if the headers of composing mail can be converted to a mail charset.
  if (msgType == Ci.nsIMsgCompDeliverMode.Now ||
      msgType == Ci.nsIMsgCompDeliverMode.Later ||
      msgType == Ci.nsIMsgCompDeliverMode.Background ||
      msgType == Ci.nsIMsgCompDeliverMode.Save ||
      msgType == Ci.nsIMsgCompDeliverMode.SaveAsDraft ||
      msgType == Ci.nsIMsgCompDeliverMode.AutoSaveAsDraft ||
      msgType == Ci.nsIMsgCompDeliverMode.SaveAsTemplate) {
    var fallbackCharset = new Object;
    // Check encoding, switch to UTF-8 if the default encoding doesn't fit
    // and disable_fallback_to_utf8 isn't set for this encoding.
    if (!gMsgCompose.checkCharsetConversion(getCurrentIdentity(),
                                            fallbackCharset)) {
      let disableFallback = Services.prefs
        .getBoolPref("mailnews.disable_fallback_to_utf8." + originalCharset, false);
      if (disableFallback)
        msgCompFields.needToCheckCharset = false;
      else
        fallbackCharset.value = "UTF-8";
    }

    if (fallbackCharset &&
        fallbackCharset.value && fallbackCharset.value != "")
      gMsgCompose.SetDocumentCharset(fallbackCharset.value);
  }
  try {
    // Just before we try to send the message, fire off the
    // compose-send-message event for listeners such as smime so they can do
    // any pre-security work such as fetching certificates before sending.
    var event = document.createEvent('UIEvents');
    event.initEvent('compose-send-message', false, true);
    var msgcomposeWindow = document.getElementById("msgcomposeWindow");
    msgcomposeWindow.setAttribute("msgtype", msgType);
    msgcomposeWindow.dispatchEvent(event);
    if (event.defaultPrevented)
      throw Cr.NS_ERROR_ABORT;

    gAutoSaving = (msgType == Ci.nsIMsgCompDeliverMode.AutoSaveAsDraft);
    if (!gAutoSaving) {
      // Disable the ui if we're not auto-saving.
      gWindowLocked = true;
      disableEditableFields();
      updateComposeItems();
    } else {
      // If we're auto saving, mark the body as not changed here, and not
      // when the save is done, because the user might change it between now
      // and when the save is done.
      SetContentAndBodyAsUnmodified();
    }

    var progress = Cc["@mozilla.org/messenger/progress;1"]
                     .createInstance(Ci.nsIMsgProgress);
    if (progress) {
      progress.registerListener(progressListener);
      gSendOrSaveOperationInProgress = true;
    }
    msgWindow.domWindow = window;
    msgWindow.rootDocShell.allowAuth = true;
    gMsgCompose.SendMsg(msgType, getCurrentIdentity(), getCurrentAccountKey(),
                        msgWindow, progress);
  }
  catch (ex) {
    Cu.reportError("GenericSendMessage FAILED: " + ex);
    gWindowLocked = false;
    enableEditableFields();
    updateComposeItems();
  }
  if (gMsgCompose && originalCharset != gMsgCompose.compFields.characterSet)
    SetDocumentCharacterSet(gMsgCompose.compFields.characterSet);
}

/**
 * Check if the given address is valid (contains a @).
 *
 * @param aAddress  The address string to check.
 */
function isValidAddress(aAddress) {
  return (aAddress.includes("@", 1) && !aAddress.endsWith("@"));
}

/**
 * Keep the Send buttons disabled until any recipient is entered.
 */
function updateSendLock() {
  gSendLocked = true;
  if (!gMsgCompose)
    return;

  // Helper function to check for a valid list name.
  function isValidListName(aInput) {
    let listNames = MimeParser.parseHeaderField(aInput,
                                                MimeParser.HEADER_ADDRESS);
    return listNames.length > 0 &&
           MailServices.ab.mailListNameExists(listNames[0].name);
  }

  const mailTypes = [ "addr_to", "addr_cc", "addr_bcc" ];

  // Enable the send buttons if anything usable was entered into at least one
  // recipient field.
  for (let row = 1; row <= top.MAX_RECIPIENTS; row ++) {
    let popupValue = awGetPopupElement(row).value;
    let inputValue = awGetInputElement(row).value.trim();
    // Check for a valid looking email address or a valid mailing list name
    // from one of our addressbooks.
    if ((mailTypes.includes(popupValue) &&
         (isValidAddress(inputValue) || isValidListName(inputValue))) ||
        ((popupValue == "addr_newsgroups") && (inputValue != ""))) {
      gSendLocked = false;
      break;
    }
  }
}

function CheckValidEmailAddress(aTo, aCC, aBCC)
{
  var invalidStr = null;
  // crude check that the to, cc, and bcc fields contain at least one '@'.
  // We could parse each address, but that might be overkill.
  if (aTo.length > 0 && (aTo.indexOf("@") <= 0 && aTo.toLowerCase() != "postmaster" || aTo.indexOf("@") == aTo.length - 1))
    invalidStr = aTo;
  else if (aCC.length > 0 && (aCC.indexOf("@") <= 0 && aCC.toLowerCase() != "postmaster" || aCC.indexOf("@") == aCC.length - 1))
    invalidStr = aCC;
  else if (aBCC.length > 0 && (aBCC.indexOf("@") <= 0 && aBCC.toLowerCase() != "postmaster" || aBCC.indexOf("@") == aBCC.length - 1))
    invalidStr = aBCC;
  if (invalidStr)
  {
    var errorTitle = sComposeMsgsBundle.getString("addressInvalidTitle");
    var errorMsg = sComposeMsgsBundle.getFormattedString("addressInvalid", [invalidStr], 1);
    Services.prompt.alert(window, errorTitle, errorMsg);
    return false;
  }
  return true;
}

function SendMessage()
{
  let sendInBackground = Services.prefs.getBoolPref("mailnews.sendInBackground");
  if (sendInBackground && AppConstants.platform != "macosx") {
    let enumerator = Services.wm.getEnumerator(null);
    let count = 0;
    while (enumerator.hasMoreElements() && count < 2)
    {
      enumerator.getNext();
      count++;
    }
    if (count == 1)
      sendInBackground = false;
  }
  GenericSendMessage(sendInBackground ? nsIMsgCompDeliverMode.Background
                                      : nsIMsgCompDeliverMode.Now);
}

function SendMessageWithCheck()
{
    var warn = Services.prefs.getBoolPref("mail.warn_on_send_accel_key");

    if (warn) {
        var checkValue = {value:false};
        var buttonPressed = Services.prompt.confirmEx(window,
              sComposeMsgsBundle.getString('sendMessageCheckWindowTitle'),
              sComposeMsgsBundle.getString('sendMessageCheckLabel'),
              (Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0) +
              (Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1),
              sComposeMsgsBundle.getString('sendMessageCheckSendButtonLabel'),
              null, null,
              sComposeMsgsBundle.getString('CheckMsg'),
              checkValue);
        if (buttonPressed != 0) {
            return;
        }
        if (checkValue.value) {
            Services.prefs.setBoolPref("mail.warn_on_send_accel_key", false);
        }
    }

    if (Services.io.offline)
      SendMessageLater();
    else
      SendMessage();
}

function SendMessageLater()
{
  GenericSendMessage(nsIMsgCompDeliverMode.Later);
}

function Save()
{
  switch (defaultSaveOperation)
  {
    case "file"     : SaveAsFile(false);      break;
    case "template" : SaveAsTemplate(false);  break;
    default         : SaveAsDraft(false);     break;
  }
}

function SaveAsFile(saveAs)
{
  var subject = GetMsgSubjectElement().value;
  GetCurrentEditorElement().contentDocument.title = subject;

  if (gMsgCompose.bodyConvertible() == nsIMsgCompConvertible.Plain)
    SaveDocument(saveAs, false, "text/plain");
  else
    SaveDocument(saveAs, false, "text/html");
  defaultSaveOperation = "file";
}

function SaveAsDraft()
{
  GenericSendMessage(nsIMsgCompDeliverMode.SaveAsDraft);
  defaultSaveOperation = "draft";

  gAutoSaveKickedIn = false;
  gEditingDraft = true;
}

function SaveAsTemplate()
{
  let savedReferences = null;
  if (gMsgCompose && gMsgCompose.compFields) {
    // Clear References header. When we use the template, we don't want that
    // header, yet, "edit as new message" maintains it. So we need to clear
    // it when saving the template.
    // Note: The In-Reply-To header is the last entry in the references header,
    // so it will get cleared as well.
    savedReferences = gMsgCompose.compFields.references;
    gMsgCompose.compFields.references = null;
  }

  GenericSendMessage(nsIMsgCompDeliverMode.SaveAsTemplate);
  defaultSaveOperation = "template";

  if (savedReferences)
    gMsgCompose.compFields.references = savedReferences;

  gAutoSaveKickedIn = false;
  gEditingDraft = false;
}

// Sets the additional FCC, in addition to the default FCC.
function MessageFcc(aFolder) {
  if (!gMsgCompose)
    return;

  var msgCompFields = gMsgCompose.compFields;
  if (!msgCompFields)
    return;

  // Get the uri for the folder to FCC into.
  var fccURI = aFolder.URI;
  msgCompFields.fcc2 = (msgCompFields.fcc2 == fccURI) ? "nocopy://" : fccURI;
}

function updatePriorityMenu(priorityMenu)
{
  var priority = (gMsgCompose && gMsgCompose.compFields && gMsgCompose.compFields.priority) || "Normal";
  priorityMenu.getElementsByAttribute("value", priority)[0].setAttribute("checked", "true");
}

function PriorityMenuSelect(target)
{
  if (gMsgCompose)
  {
    var msgCompFields = gMsgCompose.compFields;
    if (msgCompFields)
      msgCompFields.priority = target.getAttribute("value");
  }
}

function OutputFormatMenuSelect(target)
{
  if (gMsgCompose)
  {
    var msgCompFields = gMsgCompose.compFields;
    var toolbar = document.getElementById("FormatToolbar");
    var format_menubar = document.getElementById("formatMenu");
    var insert_menubar = document.getElementById("insertMenu");

    if (msgCompFields)
      switch (target.getAttribute('id'))
      {
        case "format_auto":  gSendFormat = nsIMsgCompSendFormat.AskUser;     break;
        case "format_plain": gSendFormat = nsIMsgCompSendFormat.PlainText;   break;
        case "format_html":  gSendFormat = nsIMsgCompSendFormat.HTML;        break;
        case "format_both":  gSendFormat = nsIMsgCompSendFormat.Both;        break;
      }
    gHideMenus = (gSendFormat == nsIMsgCompSendFormat.PlainText);
    format_menubar.hidden = gHideMenus;
    insert_menubar.hidden = gHideMenus;
    if (gHideMenus) {
      gFormatToolbarHidden = toolbar.hidden;
      toolbar.hidden = true;
      toolbar.setAttribute("hideinmenu", "true");
    } else {
      toolbar.hidden = gFormatToolbarHidden;
      toolbar.removeAttribute("hideinmenu");
    }
  }
}

function SelectAddress()
{
  var msgCompFields = gMsgCompose.compFields;

  Recipients2CompFields(msgCompFields);

  var toAddress = msgCompFields.to;
  var ccAddress = msgCompFields.cc;
  var bccAddress = msgCompFields.bcc;

  dump("toAddress: " + toAddress + "\n");
  window.openDialog("chrome://messenger/content/addressbook/abSelectAddressesDialog.xul",
            "",
            "chrome,resizable,titlebar,modal",
            {composeWindow:top.window,
             msgCompFields:msgCompFields,
             toAddress:toAddress,
             ccAddress:ccAddress,
             bccAddress:bccAddress});
  // We have to set focus to the addressingwidget because we seem to loose focus often
  // after opening the SelectAddresses Dialog- bug # 89950
  AdjustFocus();
}

// walk through the recipients list and add them to the inline spell checker ignore list
function addRecipientsToIgnoreList(aAddressesToAdd)
{
  if (InlineSpellCheckerUI.enabled)
  {
    // break the list of potentially many recipients back into individual names
    var emailAddresses = {};
    var names = {};
    var fullNames = {};
    var numAddresses =
      MailServices.headerParser.parseHeadersWithArray(aAddressesToAdd,
                                                      emailAddresses, names,
                                                      fullNames);
    var tokenizedNames = [];

    // each name could consist of multiple words delimited by commas and/or spaces.
    // i.e. Green Lantern or Lantern,Green.
    for (let i = 0; i < names.value.length; i++)
    {
      if (!names.value[i])
        continue;
      var splitNames = names.value[i].match(/[^\s,]+/g);
      if (splitNames)
        tokenizedNames = tokenizedNames.concat(splitNames);
    }

    if (InlineSpellCheckerUI.mInlineSpellChecker.spellCheckPending)
    {
      // spellchecker is enabled, but we must wait for its init to complete
      Services.obs.addObserver(function observe(subject, topic, data) {
        if (subject == gMsgCompose.editor)
        {
          Services.obs.removeObserver(observe, topic);
          InlineSpellCheckerUI.mInlineSpellChecker.ignoreWords(tokenizedNames);
        }
      }, "inlineSpellChecker-spellCheck-ended");
    }
    else
    {
      InlineSpellCheckerUI.mInlineSpellChecker.ignoreWords(tokenizedNames);
    }
  }
}

function onAddressColCommand(aWidgetId) {
  gContentChanged = true;
  awSetAutoComplete(aWidgetId.slice(aWidgetId.lastIndexOf('#') + 1));
  updateSendCommands(true);
}

/**
 * Called if the list of recipients changed in any way.
 *
 * @param aAutomatic  Set to true if the change of recipients was invoked
 *                    programatically and should not be considered a change
 *                    of message content.
 */
function onRecipientsChanged(aAutomatic) {
  if (!aAutomatic) {
    gContentChanged = true;
    setupAutocomplete();
  }
  updateSendCommands(true);
}

function InitLanguageMenu()
{
  var languageMenuList = document.getElementById("languageMenuList");
  if (!languageMenuList)
    return;

  var spellChecker = Cc["@mozilla.org/spellchecker/engine;1"]
                       .getService(mozISpellCheckingEngine);
  // Get the list of dictionaries from the spellchecker.
  var dictList = spellChecker.getDictionaryList();
  var count    = dictList.length;

  // If dictionary count hasn't changed then no need to update the menu.
  if (sDictCount == count)
    return;

  // Store current dictionary count.
  sDictCount = count;

  // Load the language string bundle that will help us map
  // RFC 1766 strings to UI strings.
  var languageBundle = document.getElementById("languageBundle");
  var isoStrArray;
  var langId;
  var langLabel;

  for (let i = 0; i < count; i++)
  {
    try
    {
      langId = dictList[i];
      isoStrArray = dictList[i].split(/[-_]/);

      if (languageBundle && isoStrArray[0])
        langLabel = languageBundle.getString(isoStrArray[0].toLowerCase());

      // the user needs to be able to distinguish between the UK English dictionary
      // and say the United States English Dictionary. If we have a isoStr value then
      // wrap it in parentheses and append it to the menu item string. i.e.
      // English (US) and English (UK)
      if (!langLabel)
        langLabel = langId;
      // if we have a language ID like US or UK, append it to the menu item, and any sub-variety
      else if (isoStrArray.length > 1 && isoStrArray[1]) {
        langLabel += ' (' + isoStrArray[1];
        if (isoStrArray.length > 2 && isoStrArray[2])
          langLabel += '-' + isoStrArray[2];
        langLabel += ')';
      }
    }
    catch (ex)
    {
      // getString throws an exception when a key is not found in the
      // bundle. In that case, just use the original dictList string.
      langLabel = langId;
    }
    dictList[i] = [langLabel, langId];
  }

  // sort by locale-aware collation
  dictList.sort(
    function compareFn(a, b)
    {
      return a[0].localeCompare(b[0]);
    }
  );

  // Remove any languages from the list.
  while (languageMenuList.hasChildNodes())
    languageMenuList.lastChild.remove();

  for (let i = 0; i < count; i++)
  {
    var item = document.createElement("menuitem");
    item.setAttribute("label", dictList[i][0]);
    item.setAttribute("value", dictList[i][1]);
    item.setAttribute("type", "radio");
    languageMenuList.appendChild(item);
  }
}

function OnShowDictionaryMenu(aTarget)
{
  InitLanguageMenu();
  var spellChecker = InlineSpellCheckerUI.mInlineSpellChecker.spellChecker;
  var curLang = spellChecker.GetCurrentDictionary();
  var languages = aTarget.getElementsByAttribute("value", curLang);
  if (languages.length > 0)
    languages[0].setAttribute("checked", true);
}

function ChangeLanguage(event)
{
  // We need to change the dictionary language and if we are using inline spell check,
  // recheck the message
  var spellChecker = InlineSpellCheckerUI.mInlineSpellChecker.spellChecker;
  if (spellChecker.GetCurrentDictionary() != event.target.value)
  {
    spellChecker.SetCurrentDictionary(event.target.value);

    ComposeChangeLanguage(event.target.value)
  }
  event.stopPropagation();
}

function ComposeChangeLanguage(aLang)
{
  if (document.documentElement.getAttribute("lang") != aLang) {

    // Update the document language as well.
    // This is needed to synchronize the subject.
    document.documentElement.setAttribute("lang", aLang);

    // Update spellchecker pref
    Services.prefs.setCharPref("spellchecker.dictionary", aLang);

    // Now check the document and the subject over again with the new
    // dictionary.
    if (InlineSpellCheckerUI.enabled) {
      InlineSpellCheckerUI.mInlineSpellChecker.spellCheckRange(null);

      // Also force a recheck of the subject. The spell checker for the subject
      // isn't always ready yet. Usually throws unless the subject was selected
      // at least once. So don't auto-create it, hence pass 'false'.
      let inlineSpellChecker =
        GetMsgSubjectElement().editor.getInlineSpellChecker(false);
      if (inlineSpellChecker) {
        inlineSpellChecker.spellCheckRange(null);
      }
    }
  }
}

function ToggleReturnReceipt(target)
{
    var msgCompFields = gMsgCompose.compFields;
    if (msgCompFields)
    {
        msgCompFields.returnReceipt = ! msgCompFields.returnReceipt;
        target.setAttribute('checked', msgCompFields.returnReceipt);
        gReceiptOptionChanged = true;
    }
}

function ToggleDSN(target)
{
  var msgCompFields = gMsgCompose.compFields;

  if (msgCompFields)
  {
    msgCompFields.DSN = !msgCompFields.DSN;
    target.setAttribute('checked', msgCompFields.DSN);
    gDSNOptionChanged = true;
  }
}

function ToggleAttachVCard(target)
{
  var msgCompFields = gMsgCompose.compFields;
  if (msgCompFields)
  {
    msgCompFields.attachVCard = ! msgCompFields.attachVCard;
    target.setAttribute('checked', msgCompFields.attachVCard);
    gAttachVCardOptionChanged = true;
  }
}

function FillIdentityList(menulist)
{
  var accounts = FolderUtils.allAccountsSorted(true);

  for (let acc = 0; acc < accounts.length; acc++)
  {
    let account = accounts[acc];
    let identities = account.identities;

    if (identities.length == 0)
      continue;

    for (let i = 0; i < identities.length; i++)
    {
      let identity = identities[i];
      let item = menulist.appendItem(identity.identityName,
                                     identity.fullAddress,
                                     account.incomingServer.prettyName);
      item.setAttribute("identitykey", identity.key);
      item.setAttribute("accountkey", account.key);
      if (i == 0)
      {
        // Mark the first identity as default.
        item.setAttribute("default", "true");
      }
    }
  }
}

function getCurrentAccountKey()
{
    // get the accounts key
    var identityList = GetMsgIdentityElement();
    return identityList.selectedItem.getAttribute("accountkey");
}

function getCurrentIdentityKey()
{
    // get the identity key
    var identityList = GetMsgIdentityElement();
    return identityList.selectedItem.getAttribute("identitykey");
}

function getIdentityForKey(key)
{
    return MailServices.accounts.getIdentity(key);
}

function getCurrentIdentity()
{
  return getIdentityForKey(getCurrentIdentityKey());
}

function AdjustFocus()
{
  let element = awGetInputElement(awGetNumberOfRecipients());
  if (element.value == "") {
      awSetFocusTo(element);
  }
  else
  {
      element = GetMsgSubjectElement();
      if (element.value == "") {
        element.focus();
      }
      else {
        SetMsgBodyFrameFocus();
      }
  }
}

function SetComposeWindowTitle()
{
  var newTitle = GetMsgSubjectElement().value;

  if (newTitle == "" )
    newTitle = sComposeMsgsBundle.getString("defaultSubject");

  newTitle += GetCharsetUIString();
  document.title = sComposeMsgsBundle.getString("windowTitlePrefix") + " " + newTitle;
}

// Check for changes to document and allow saving before closing
// This is hooked up to the OS's window close widget (e.g., "X" for Windows)
function ComposeCanClose()
{
  if (gSendOrSaveOperationInProgress)
  {
    var brandShortName = sBrandBundle.getString("brandShortName");

    var promptTitle = sComposeMsgsBundle.getString("quitComposeWindowTitle");
    var promptMsg = sComposeMsgsBundle.getFormattedString("quitComposeWindowMessage2",
                                                          [brandShortName], 1);
    var quitButtonLabel = sComposeMsgsBundle.getString("quitComposeWindowQuitButtonLabel2");
    var waitButtonLabel = sComposeMsgsBundle.getString("quitComposeWindowWaitButtonLabel2");

    if (Services.prompt.confirmEx(window, promptTitle, promptMsg,
        (Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0) +
        (Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1),
        waitButtonLabel, quitButtonLabel, null, null, {value:0}) == 1)
    {
      gMsgCompose.abort();
      return true;
    }
    return false;
  }

  // Returns FALSE only if user cancels save action
  if (gContentChanged || gMsgCompose.bodyModified || (gAutoSaveKickedIn && !gEditingDraft))
  {
    // call window.focus, since we need to pop up a dialog
    // and therefore need to be visible (to prevent user confusion)
    window.focus();
    let draftFolderURI = gCurrentIdentity.draftFolder;
    let draftFolderName = MailUtils.getFolderForURI(draftFolderURI).prettyName;
    switch (Services.prompt.confirmEx(window,
              sComposeMsgsBundle.getString("saveDlogTitle"),
              sComposeMsgsBundle.getFormattedString("saveDlogMessages3", [draftFolderName]),
              (Services.prompt.BUTTON_TITLE_SAVE * Services.prompt.BUTTON_POS_0) +
              (Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1) +
              (Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_2),
              null,
              null,
              sComposeMsgsBundle.getString("discardButtonLabel"),
              null, {value:0}))
    {
      case 0: //Save
        // we can close immediately if we already autosaved the draft
        if (!gContentChanged && !gMsgCompose.bodyModified)
          break;
        gCloseWindowAfterSave = true;
        GenericSendMessage(nsIMsgCompDeliverMode.AutoSaveAsDraft);
        return false;
      case 1: //Cancel
        return false;
      case 2: //Don't Save
        // only delete the draft if we didn't start off editing a draft
        if (!gEditingDraft && gAutoSaveKickedIn)
          RemoveDraft();
        break;
    }
  }

  return true;
}

function RemoveDraft()
{
  try
  {
    var draftId = gMsgCompose.compFields.draftId;
    var msgKey = draftId.substr(draftId.indexOf('#') + 1);
    var folder = sRDF.GetResource(gMsgCompose.savedFolderURI);
    try {
      if (folder instanceof Ci.nsIMsgFolder)
      {
        let msg = folder.GetMessageHeader(msgKey);
        folder.deleteMessages([msg], null, true, false, null, false);
      }
    }
    catch (ex) // couldn't find header - perhaps an imap folder.
    {
      if (folder instanceof Ci.nsIMsgImapMailFolder)
      {
        const kImapMsgDeletedFlag = 0x0008;
        folder.storeImapFlags(kImapMsgDeletedFlag, true, [msgKey], null);
      }
    }
  } catch (ex) {}
}

function SetContentAndBodyAsUnmodified()
{
  gMsgCompose.bodyModified = false;
  gContentChanged = false;
}

function MsgComposeCloseWindow()
{
  if (gMsgCompose)
    gMsgCompose.CloseWindow();
  else
    window.close();
}

// attachedLocalFile must be a nsIFile
function SetLastAttachDirectory(attachedLocalFile)
{
  try {
    var file = attachedLocalFile.QueryInterface(Ci.nsIFile);
    var parent = file.parent.QueryInterface(Ci.nsIFile);

    Services.prefs.setComplexValue(kComposeAttachDirPrefName,
                                   Ci.nsIFile, parent);
  }
  catch (ex) {
    dump("error: SetLastAttachDirectory failed: " + ex + "\n");
  }
}

function AttachFile()
{
  //Get file using nsIFilePicker and convert to URL
  const nsIFilePicker = Ci.nsIFilePicker;
  let fp = Cc["@mozilla.org/filepicker;1"]
             .createInstance(nsIFilePicker);
  fp.init(window, sComposeMsgsBundle.getString("chooseFileToAttach"),
          nsIFilePicker.modeOpenMultiple);
  let lastDirectory = GetLocalFilePref(kComposeAttachDirPrefName);
  if (lastDirectory)
    fp.displayDirectory = lastDirectory;

  fp.appendFilters(nsIFilePicker.filterAll);
  fp.open(rv => {
    if (rv != nsIFilePicker.returnOK || !fp.files) {
      return;
    }
    try {
      let firstAttachedFile = AttachFiles(fp.files);
      if (firstAttachedFile) {
        SetLastAttachDirectory(firstAttachedFile);
      }
    }
    catch (ex) {
      dump("failed to get attachments: " + ex + "\n");
    }
  });
}

function AttachFiles(attachments)
{
  if (!attachments || !attachments.hasMoreElements())
    return null;

  var firstAttachedFile = null;

  while (attachments.hasMoreElements()) {
    var currentFile = attachments.getNext().QueryInterface(Ci.nsIFile);

    if (!firstAttachedFile) {
      firstAttachedFile = currentFile;
    }

    var fileHandler = Services.io.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
    var currentAttachment = fileHandler.getURLSpecFromFile(currentFile);

    if (!DuplicateFileCheck(currentAttachment)) {
      var attachment = Cc["@mozilla.org/messengercompose/attachment;1"].createInstance(Ci.nsIMsgAttachment);
      attachment.url = currentAttachment;
      attachment.size = currentFile.fileSize;
      AddAttachment(attachment);
      gContentChanged = true;
    }
  }
  return firstAttachedFile;
}

function AddAttachment(attachment)
{
  if (attachment && attachment.url)
  {
    var bucket = GetMsgAttachmentElement();
    var item = document.createElement("listitem");

    if (!attachment.name)
      attachment.name = gMsgCompose.AttachmentPrettyName(attachment.url, attachment.urlCharset);

    // for security reasons, don't allow *-message:// uris to leak out
    // we don't want to reveal the .slt path (for mailbox://), or the username or hostname
    var messagePrefix = /^mailbox-message:|^imap-message:|^news-message:/i;
    if (messagePrefix.test(attachment.name))
      attachment.name = sComposeMsgsBundle.getString("messageAttachmentSafeName");
    else {
      // for security reasons, don't allow mail protocol uris to leak out
      // we don't want to reveal the .slt path (for mailbox://), or the username or hostname
      var mailProtocol = /^file:|^mailbox:|^imap:|^s?news:/i;
      if (mailProtocol.test(attachment.name))
        attachment.name = sComposeMsgsBundle.getString("partAttachmentSafeName");
    }

    var nameAndSize = attachment.name;
    if (attachment.size != -1)
      nameAndSize += " (" + gMessenger.formatFileSize(attachment.size) + ")";
    item.setAttribute("label", nameAndSize);    //use for display only
    item.attachment = attachment;   //full attachment object stored here
    try {
      item.setAttribute("tooltiptext", decodeURI(attachment.url));
    } catch(e) {
      item.setAttribute("tooltiptext", attachment.url);
    }
    item.setAttribute("class", "listitem-iconic");
    item.setAttribute("image", "moz-icon:" + attachment.url);
    item.setAttribute("crop", "center");
    bucket.appendChild(item);
  }
}

function SelectAllAttachments()
{
  var bucketList = GetMsgAttachmentElement();
  if (bucketList)
    bucketList.selectAll();
}

function MessageHasAttachments()
{
  var bucketList = GetMsgAttachmentElement();
  if (bucketList) {
    return (bucketList && bucketList.hasChildNodes() && (bucketList == top.document.commandDispatcher.focusedElement));
  }
  return false;
}

function MessageGetNumSelectedAttachments()
{
  var bucketList = GetMsgAttachmentElement();
  return (bucketList) ? bucketList.selectedItems.length : 0;
}

function AttachPage()
{
  var params = { action: "5", url: null };
  window.openDialog("chrome://communicator/content/openLocation.xul",
                    "_blank", "chrome,close,titlebar,modal", params);
  if (params.url)
  {
    var attachment =
        Cc["@mozilla.org/messengercompose/attachment;1"]
          .createInstance(Ci.nsIMsgAttachment);
    attachment.url = params.url;
    AddAttachment(attachment);
  }
}

function DuplicateFileCheck(FileUrl)
{
  var bucket = GetMsgAttachmentElement();
  for (let i = 0; i < bucket.childNodes.length; i++)
  {
    let attachment = bucket.childNodes[i].attachment;
    if (attachment)
    {
      if (FileUrl == attachment.url)
         return true;
    }
  }

  return false;
}

function Attachments2CompFields(compFields)
{
  var bucket = GetMsgAttachmentElement();

  //First, we need to clear all attachment in the compose fields
  compFields.removeAttachments();

  for (let i = 0; i < bucket.childNodes.length; i++)
  {
    let attachment = bucket.childNodes[i].attachment;
    if (attachment)
      compFields.addAttachment(attachment);
  }
}

function RemoveAllAttachments()
{
  var child;
  var bucket = GetMsgAttachmentElement();
  while (bucket.hasChildNodes())
  {
    child = bucket.removeChild(bucket.lastChild);
    // Let's release the attachment object hold by the node else it won't go away until the window is destroyed
    child.attachment = null;
  }
}

function RemoveSelectedAttachment()
{
  var child;
  var bucket = GetMsgAttachmentElement();
  if (bucket.selectedItems.length > 0) {
    for (let i = bucket.selectedItems.length - 1; i >= 0; i--)
    {
      child = bucket.removeChild(bucket.selectedItems[i]);
      // Let's release the attachment object hold by the node else it won't go away until the window is destroyed
      child.attachment = null;
    }
    gContentChanged = true;
  }
}

function RenameSelectedAttachment()
{
  var bucket = GetMsgAttachmentElement();
  if (bucket.selectedItems.length != 1)
    return; // not one attachment selected

  var item = bucket.getSelectedItem(0);
  var attachmentName = {value: item.attachment.name};
  if (Services.prompt.prompt(
                     window,
                     sComposeMsgsBundle.getString("renameAttachmentTitle"),
                     sComposeMsgsBundle.getString("renameAttachmentMessage"),
                     attachmentName,
                     null,
                     {value: 0}))
  {
    var modifiedAttachmentName = attachmentName.value;
    if (modifiedAttachmentName == "")
      return; // name was not filled, bail out

    var nameAndSize = modifiedAttachmentName;
    if (item.attachment.size != -1)
      nameAndSize += " (" + gMessenger.formatFileSize(item.attachment.size) + ")";
    item.label = nameAndSize;
    item.attachment.name = modifiedAttachmentName;
    gContentChanged = true;
  }
}

function FocusOnFirstAttachment()
{
  var bucketList = GetMsgAttachmentElement();

  if (bucketList && bucketList.hasChildNodes())
    bucketList.selectItem(bucketList.firstChild);
}

function AttachmentElementHasItems()
{
  var element = GetMsgAttachmentElement();
  return element ? element.childNodes.length : 0;
}

function OpenSelectedAttachment()
{
  let bucket = document.getElementById("attachmentBucket");
  if (bucket.selectedItems.length == 1) {
    let attachmentUrl = bucket.getSelectedItem(0).attachment.url;

    let messagePrefix = /^mailbox-message:|^imap-message:|^news-message:/i;
    if (messagePrefix.test(attachmentUrl)) {
      // We must be dealing with a forwarded attachment, treat this special.
      let msgHdr = gMessenger.msgHdrFromURI(attachmentUrl);
      if (msgHdr) {
        MailUtils.openMessageInNewWindow(msgHdr);
      }
    } else {
      // Turn the URL into a nsIURI object then open it.
      let uri = Services.io.newURI(attachmentUrl);
      if (uri) {
        let channel = Services.io.newChannelFromURI(uri,
                                                    null,
                                                    Services.scriptSecurityManager.getSystemPrincipal(),
                                                    null,
                                                    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
                                                    Ci.nsIContentPolicy.TYPE_OTHER);
        if (channel) {
          let uriLoader = Cc["@mozilla.org/uriloader;1"].getService(Ci.nsIURILoader);
          uriLoader.openURI(channel, true, new nsAttachmentOpener());
        }
      }
    }
  } // if one attachment selected
}

function nsAttachmentOpener()
{
}

nsAttachmentOpener.prototype =
{
  QueryInterface: function(iid)
  {
    if (iid.equals(Ci.nsIURIContentListener) ||
        iid.equals(Ci.nsIInterfaceRequestor) ||
        iid.equals(Ci.nsISupports)) {
      return this;
    }
    throw Cr.NS_NOINTERFACE;
  },

  doContent: function(contentType, isContentPreferred, request, contentHandler)
  {
    return false;
  },

  isPreferred: function(contentType, desiredContentType)
  {
    return false;
  },

  canHandleContent: function(contentType, isContentPreferred, desiredContentType)
  {
    return false;
  },

  getInterface: function(iid)
  {
    if (iid.equals(Ci.nsIDOMWindow)) {
      return window;
    }

    if (iid.equals(Ci.nsIDocShell)) {
      return window.QueryInterface(Ci.nsIInterfaceRequestor)
                   .getInterface(Ci.nsIWebNavigation)
                   .QueryInterface(Ci.nsIDocShell);
    }

    return this.QueryInterface(iid);
  },

  loadCookie: null,
  parentContentListener: null
}

function DetermineHTMLAction(convertible)
{
  try {
    gMsgCompose.expandMailingLists();
  } catch(ex) {
    dump("gMsgCompose.expandMailingLists failed: " + ex + "\n");
  }

  if (!gMsgCompose.composeHTML)
  {
    return nsIMsgCompSendFormat.PlainText;
  }

  if (gSendFormat == nsIMsgCompSendFormat.AskUser)
  {
    return gMsgCompose.determineHTMLAction(convertible);
  }

  return gSendFormat;
}

function DetermineConvertibility()
{
    if (!gMsgCompose.composeHTML)
        return nsIMsgCompConvertible.Plain;

    try {
        return gMsgCompose.bodyConvertible();
    } catch(ex) {}
    return nsIMsgCompConvertible.No;
}

function LoadIdentity(startup)
{
    var identityElement = GetMsgIdentityElement();
    var prevIdentity = gCurrentIdentity;

    if (identityElement) {
        identityElement.value = identityElement.selectedItem.value;

        var idKey = identityElement.selectedItem.getAttribute("identitykey");
        gCurrentIdentity = MailServices.accounts.getIdentity(idKey);

        let accountKey = null;
        if (identityElement.selectedItem)
          accountKey = identityElement.selectedItem.getAttribute("accountkey");

        let maxRecipients = awGetMaxRecipients();
        for (let i = 1; i <= maxRecipients; i++)
        {
          let params = JSON.parse(awGetInputElement(i).searchParam);
          params.idKey = idKey;
          params.accountKey = accountKey;
          awGetInputElement(i).searchParam = JSON.stringify(params);
        }

        if (!startup && prevIdentity && idKey != prevIdentity.key)
        {
          var prevReplyTo = prevIdentity.replyTo;
          var prevCc = "";
          var prevBcc = "";
          var prevReceipt = prevIdentity.requestReturnReceipt;
          var prevDSN = prevIdentity.requestDSN;
          var prevAttachVCard = prevIdentity.attachVCard;

          if (prevIdentity.doCc)
            prevCc += prevIdentity.doCcList;

          if (prevIdentity.doBcc)
            prevBcc += prevIdentity.doBccList;

          var newReplyTo = gCurrentIdentity.replyTo;
          var newCc = "";
          var newBcc = "";
          var newReceipt = gCurrentIdentity.requestReturnReceipt;
          var newDSN = gCurrentIdentity.requestDSN;
          var newAttachVCard = gCurrentIdentity.attachVCard;

          if (gCurrentIdentity.doCc)
            newCc += gCurrentIdentity.doCcList;

          if (gCurrentIdentity.doBcc)
            newBcc += gCurrentIdentity.doBccList;

          var needToCleanUp = false;
          var msgCompFields = gMsgCompose.compFields;

          if (!gReceiptOptionChanged &&
              prevReceipt == msgCompFields.returnReceipt &&
              prevReceipt != newReceipt)
          {
            msgCompFields.returnReceipt = newReceipt;
            document.getElementById("returnReceiptMenu").setAttribute('checked',msgCompFields.returnReceipt);
          }

          if (!gDSNOptionChanged &&
              prevDSN == msgCompFields.DSN &&
              prevDSN != newDSN)
          {
            msgCompFields.DSN = newDSN;
            document.getElementById("dsnMenu").setAttribute('checked',msgCompFields.DSN);
          }

          if (!gAttachVCardOptionChanged &&
              prevAttachVCard == msgCompFields.attachVCard &&
              prevAttachVCard != newAttachVCard)
          {
            msgCompFields.attachVCard = newAttachVCard;
            document.getElementById("cmd_attachVCard").setAttribute('checked',msgCompFields.attachVCard);
          }

          if (newReplyTo != prevReplyTo)
          {
            needToCleanUp = true;
            if (prevReplyTo != "")
              awRemoveRecipients(msgCompFields, "addr_reply", prevReplyTo);
            if (newReplyTo != "")
              awAddRecipients(msgCompFields, "addr_reply", newReplyTo);
          }

          let toAddrs = new Set(msgCompFields.splitRecipients(msgCompFields.to, true));
          let ccAddrs = new Set(msgCompFields.splitRecipients(msgCompFields.cc, true));

          if (newCc != prevCc)
          {
            needToCleanUp = true;
            if (prevCc)
              awRemoveRecipients(msgCompFields, "addr_cc", prevCc);
            if (newCc) {
              // Ensure none of the Ccs are already in To.
              let cc2 = msgCompFields.splitRecipients(newCc, true);
              newCc = cc2.filter(x => !toAddrs.has(x)).join(", ");
              awAddRecipients(msgCompFields, "addr_cc", newCc);
            }
          }

          if (newBcc != prevBcc)
          {
            needToCleanUp = true;
            if (prevBcc)
              awRemoveRecipients(msgCompFields, "addr_bcc", prevBcc);
            if (newBcc) {
              // Ensure none of the Bccs are already in To or Cc.
              let bcc2 = msgCompFields.splitRecipients(newBcc, true);
              let toCcAddrs = new Set([...toAddrs, ...ccAddrs]);
              newBcc = bcc2.filter(x => !toCcAddrs.has(x)).join(", ");
              awAddRecipients(msgCompFields, "addr_bcc", newBcc);
            }
          }

          if (needToCleanUp)
            awCleanupRows();

          try {
            gMsgCompose.identity = gCurrentIdentity;
          } catch (ex) { dump("### Cannot change the identity: " + ex + "\n");}

          var event = document.createEvent('Events');
          event.initEvent('compose-from-changed', false, true);
          document.getElementById("msgcomposeWindow").dispatchEvent(event);

          gComposeNotificationBar.clearIdentityWarning();
        }

      if (!startup) {
          if (Services.prefs.getBoolPref("mail.autoComplete.highlightNonMatches"))
            document.getElementById('addressCol2#1').highlightNonMatches = true;

          // Only do this if we aren't starting up...
          // It gets done as part of startup already.
          addRecipientsToIgnoreList(gCurrentIdentity.fullAddress);
      }
    }
}

function setupAutocomplete()
{
  var autoCompleteWidget = document.getElementById("addressCol2#1");

  // if the pref is set to turn on the comment column, honor it here.
  // this element then gets cloned for subsequent rows, so they should
  // honor it as well
  //
  if (Services.prefs.getBoolPref("mail.autoComplete.highlightNonMatches"))
    autoCompleteWidget.highlightNonMatches = true;

  if (Services.prefs.getIntPref("mail.autoComplete.commentColumn", 0) != 0)
    autoCompleteWidget.showCommentColumn = true;
}

function subjectKeyPress(event)
{
  switch(event.keyCode) {
  case KeyEvent.DOM_VK_TAB:
    if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      SetMsgBodyFrameFocus();
      event.preventDefault();
    }
    break;
  case KeyEvent.DOM_VK_RETURN:
    SetMsgBodyFrameFocus();
    break;
  }
}

function AttachmentBucketClicked(event)
{
  if (event.button != 0)
    return;

  if (event.originalTarget.localName == "listboxbody")
    goDoCommand('cmd_attachFile');
  else if (event.originalTarget.localName == "listitem" && event.detail == 2)
    OpenSelectedAttachment();
}

// Content types supported in the attachmentBucketObserver.
let flavours = [ "text/x-moz-message", "application/x-moz-file",
                 "text/x-moz-url", ];

var attachmentBucketObserver = {
  onDrop(aEvent) {
    let dt = aEvent.dataTransfer;
    let dataList = [];
    for (let i = 0; i < dt.mozItemCount; i++) {
      let types = Array.from(dt.mozTypesAt(i));
      for (let flavour of flavours) {
        if (types.includes(flavour)) {
          let data = dt.mozGetDataAt(flavour, i);
          if (data) {
            dataList.push({ data, flavour });
          }
          break;
        }
      }
    }

    for (let { data, flavour } of dataList) {
      let isValidAttachment = false;
      let prettyName;
      let size;

      // We could be dropping an attachment of various flavours;
      // check and do the right thing.
      switch (flavour) {
        case "application/x-moz-file": {
          if (data instanceof Ci.nsIFile) {
            size = data.fileSize;
          }

          try {
            data = Services.io.getProtocolHandler("file")
                              .QueryInterface(Ci.nsIFileProtocolHandler)
                              .getURLSpecFromFile(data);
            isValidAttachment = true;
          } catch (e) {
            Cu.reportError("Couldn't process the dragged file " +
                           data.leafName + ":" + e);
          }
          break;
        }

        case "text/x-moz-message": {
          isValidAttachment = true;
          let msgHdr = gMessenger.messageServiceFromURI(data)
                                 .messageURIToMsgHdr(data);
          prettyName = msgHdr.mime2DecodedSubject + ".eml";
          size = msgHdr.messageSize;
          break;
        }

        case "text/x-moz-url": {
          let pieces = data.split("\n");
          data = pieces[0];
          if (pieces.length > 1) {
            prettyName = pieces[1];
          }
          if (pieces.length > 2) {
            size = parseInt(pieces[2]);
          }

          // If this is a URL (or selected text), check if it's a valid URL
          // by checking if we can extract a scheme using Services.io.
          // Don't attach invalid or mailto: URLs.
          try {
            let scheme = Services.io.extractScheme(data);
            if (scheme != "mailto") {
              isValidAttachment = true;
            }
          } catch (ex) {}
          break;
        }
      }

      if (isValidAttachment && !DuplicateFileCheck(data)) {
        let attachment = Cc["@mozilla.org/messengercompose/attachment;1"]
                           .createInstance(Ci.nsIMsgAttachment);
        attachment.url = data;
        attachment.name = prettyName;

        if (size !== undefined) {
          attachment.size = size;
        }

        AddAttachment(attachment);
      }
    }

    aEvent.stopPropagation();
  },

  onDragOver(aEvent) {
    let dragSession = Cc["@mozilla.org/widget/dragservice;1"]
                        .getService(Ci.nsIDragService).getCurrentSession();
    for (let flavour of flavours) {
      if (dragSession.isDataFlavorSupported(flavour)) {
        let attachmentBucket = GetMsgAttachmentElement();
        attachmentBucket.setAttribute("dragover", "true");
        aEvent.stopPropagation();
        aEvent.preventDefault();
        break;
      }
    }
  },

  onDragExit(aEvent) {
    let attachmentBucket = GetMsgAttachmentElement();
    attachmentBucket.removeAttribute("dragover");
  },
};

function DisplaySaveFolderDlg(folderURI)
{
  try
  {
    var showDialog = gCurrentIdentity.showSaveMsgDlg;
  }
  catch (e)
  {
    return;
  }

  if (showDialog){
    let msgfolder = MailUtils.getFolderForURI(folderURI, true);
    if (!msgfolder)
      return;
    var checkbox = {value:0};
    var SaveDlgTitle = sComposeMsgsBundle.getString("SaveDialogTitle");
    var dlgMsg = sComposeMsgsBundle.getFormattedString("SaveDialogMsg",
                                                       [msgfolder.name,
                                                        msgfolder.server.prettyName]);

    var CheckMsg = sComposeMsgsBundle.getString("CheckMsg");
    Services.prompt.alertCheck(window, SaveDlgTitle, dlgMsg, CheckMsg, checkbox);
    try {
          gCurrentIdentity.showSaveMsgDlg = !checkbox.value;
    }//try
    catch (e) {
    return;
    }//catch

  }//if
  return;
}

function SetMsgAddressingWidgetElementFocus()
{
  awSetFocusTo(awGetInputElement(awGetNumberOfRecipients()));
}

function SetMsgIdentityElementFocus()
{
  GetMsgIdentityElement().focus();
}

function SetMsgSubjectElementFocus()
{
  GetMsgSubjectElement().focus();
}

function SetMsgAttachmentElementFocus()
{
  GetMsgAttachmentElement().focus();
  FocusOnFirstAttachment();
}

function SetMsgBodyFrameFocus()
{
  //window.content.focus(); fails to blur the currently focused element
  document.commandDispatcher
          .advanceFocusIntoSubtree(document.getElementById("appcontent"));
}

function GetMsgAddressingWidgetElement()
{
  if (!gMsgAddressingWidgetElement)
    gMsgAddressingWidgetElement = document.getElementById("addressingWidget");

  return gMsgAddressingWidgetElement;
}

function GetMsgIdentityElement()
{
  if (!gMsgIdentityElement)
    gMsgIdentityElement = document.getElementById("msgIdentity");

  return gMsgIdentityElement;
}

function GetMsgSubjectElement()
{
  if (!gMsgSubjectElement)
    gMsgSubjectElement = document.getElementById("msgSubject");

  return gMsgSubjectElement;
}

function GetMsgAttachmentElement()
{
  if (!gMsgAttachmentElement)
    gMsgAttachmentElement = document.getElementById("attachmentBucket");

  return gMsgAttachmentElement;
}

function GetMsgHeadersToolbarElement()
{
  if (!gMsgHeadersToolbarElement)
    gMsgHeadersToolbarElement = document.getElementById("MsgHeadersToolbar");

  return gMsgHeadersToolbarElement;
}

function IsMsgHeadersToolbarCollapsed()
{
  var element = GetMsgHeadersToolbarElement();
  return element && element.collapsed;
}

function WhichElementHasFocus()
{
  var msgIdentityElement         = GetMsgIdentityElement();
  var msgAddressingWidgetElement = GetMsgAddressingWidgetElement();
  var msgSubjectElement          = GetMsgSubjectElement();
  var msgAttachmentElement       = GetMsgAttachmentElement();

  if (top.document.commandDispatcher.focusedWindow == content)
    return content;

  var currentNode = top.document.commandDispatcher.focusedElement;
  while (currentNode)
  {
    if (currentNode == msgIdentityElement ||
        currentNode == msgAddressingWidgetElement ||
        currentNode == msgSubjectElement ||
        currentNode == msgAttachmentElement)
      return currentNode;

    currentNode = currentNode.parentNode;
  }

  return null;
}

// Function that performs the logic of switching focus from
// one element to another in the mail compose window.
// The default element to switch to when going in either
// direction (shift or no shift key pressed), is the
// AddressingWidgetElement.
//
// The only exception is when the MsgHeadersToolbar is
// collapsed, then the focus will always be on the body of
// the message.
function SwitchElementFocus(event)
{
  var focusedElement = WhichElementHasFocus();

  if (event && event.shiftKey)
  {
    if (IsMsgHeadersToolbarCollapsed())
      SetMsgBodyFrameFocus();
    else if (focusedElement == gMsgAddressingWidgetElement)
      SetMsgIdentityElementFocus();
    else if (focusedElement == gMsgIdentityElement)
      SetMsgBodyFrameFocus();
    else if (focusedElement == content)
    {
      // only set focus to the attachment element if there
      // are any attachments.
      if (AttachmentElementHasItems())
        SetMsgAttachmentElementFocus();
      else
        SetMsgSubjectElementFocus();
    }
    else if (focusedElement == gMsgAttachmentElement)
      SetMsgSubjectElementFocus();
    else
      SetMsgAddressingWidgetElementFocus();
  }
  else
  {
    if (IsMsgHeadersToolbarCollapsed())
      SetMsgBodyFrameFocus();
    else if (focusedElement == gMsgAddressingWidgetElement)
      SetMsgSubjectElementFocus();
    else if (focusedElement == gMsgSubjectElement)
    {
      // only set focus to the attachment element if there
      // are any attachments.
      if (AttachmentElementHasItems())
        SetMsgAttachmentElementFocus();
      else
        SetMsgBodyFrameFocus();
    }
    else if (focusedElement == gMsgAttachmentElement)
      SetMsgBodyFrameFocus();
    else if (focusedElement == content)
      SetMsgIdentityElementFocus();
    else
      SetMsgAddressingWidgetElementFocus();
  }
}

function loadHTMLMsgPrefs()
{
  var fontFace = Services.prefs.getStringPref("msgcompose.font_face", "");
  doStatefulCommand("cmd_fontFace", fontFace);

  var fontSize = Services.prefs.getCharPref("msgcompose.font_size", "");
  if (fontSize)
    EditorSetFontSize(fontSize);

  var bodyElement = GetBodyElement();

  var textColor = Services.prefs.getCharPref("msgcompose.text_color", "");
  if (!bodyElement.hasAttribute("text") && textColor)
  {
    bodyElement.setAttribute("text", textColor);
    gDefaultTextColor = textColor;
    document.getElementById("cmd_fontColor").setAttribute("state", textColor);
    onFontColorChange();
  }

  var bgColor = Services.prefs.getCharPref("msgcompose.background_color", "");
  if (!bodyElement.hasAttribute("bgcolor") && bgColor)
  {
    bodyElement.setAttribute("bgcolor", bgColor);
    gDefaultBackgroundColor = bgColor;
    document.getElementById("cmd_backgroundColor").setAttribute("state", bgColor);
    onBackgroundColorChange();
  }
}

function AutoSave()
{
  if (gMsgCompose.editor && (gContentChanged || gMsgCompose.bodyModified) &&
      !gSendOrSaveOperationInProgress)
  {
    GenericSendMessage(nsIMsgCompDeliverMode.AutoSaveAsDraft);
    gAutoSaveKickedIn = true;
  }
  gAutoSaveTimeout = setTimeout(AutoSave, gAutoSaveInterval);
}

/**
 * Helper function to remove a query part from a URL, so for example:
 * ...?remove=xx&other=yy becomes ...?other=yy.
 *
 * @param aURL    the URL from which to remove the query part
 * @param aQuery  the query part to remove
 * @return        the URL with the query part removed
 */
function removeQueryPart(aURL, aQuery)
{
  // Quick pre-check.
  if (!aURL.includes(aQuery))
    return aURL;

  let indexQM = aURL.indexOf("?");
  if (indexQM < 0)
    return aURL;

  let queryParts = aURL.substr(indexQM + 1).split("&");
  let indexPart = queryParts.indexOf(aQuery);
  if (indexPart < 0)
    return aURL;
  queryParts.splice(indexPart, 1);
  return aURL.substr(0, indexQM + 1) + queryParts.join("&");
}

function InitEditor(editor)
{
  // Set the eEditorMailMask flag to avoid using content prefs for the spell
  // checker, otherwise the dictionary setting in preferences is ignored and
  // the dictionary is inconsistent between the subject and message body.
  var eEditorMailMask = Ci.nsIEditor.eEditorMailMask;
  editor.flags |= eEditorMailMask;
  GetMsgSubjectElement().editor.flags |= eEditorMailMask;

  // Control insertion of line breaks.
  editor.returnInParagraphCreatesNewParagraph =
    Services.prefs.getBoolPref("mail.compose.default_to_paragraph") ||
    Services.prefs.getBoolPref("editor.CR_creates_new_p");
  editor.document.execCommand("defaultparagraphseparator", false,
    gMsgCompose.composeHTML &&
    Services.prefs.getBoolPref("mail.compose.default_to_paragraph") ?
                               "p" : "br");

  gMsgCompose.initEditor(editor, window.content);
  InlineSpellCheckerUI.init(editor);
  EnableInlineSpellCheck(Services.prefs.getBoolPref("mail.spellcheck.inline"));
  document.getElementById("menu_inlineSpellCheck").setAttribute("disabled", !InlineSpellCheckerUI.canSpellCheck);

  // Listen for spellchecker changes, set the document language to the
  // dictionary picked by the user via the right-click menu in the editor.
  document.addEventListener("spellcheck-changed", updateDocumentLanguage);

  // XXX: the error event fires twice for each load. Why??
  editor.document.body.addEventListener("error", function(event) {
    if (event.target.localName != "img") {
      return;
    }

    if (event.target.getAttribute("moz-do-not-send") == "true") {
      return;
    }

    let src = event.target.src;

    if (!src) {
      return;
    }

    if (!/^file:/i.test(src)) {
      // Check if this is a protocol that can fetch parts.
      let protocol = src.substr(0, src.indexOf(":")).toLowerCase();
      if (!(Services.io.getProtocolHandler(protocol) instanceof
            Ci.nsIMsgMessageFetchPartService)) {
        // Can't fetch parts, don't try to load.
        return;
      }
    }

    if (event.target.classList.contains("loading-internal")) {
      // We're already loading this, or tried so unsuccesfully.
      return;
    }

    if (gOriginalMsgURI) {
      let msgSvc = Cc["@mozilla.org/messenger;1"]
                     .createInstance(Ci.nsIMessenger)
                     .messageServiceFromURI(gOriginalMsgURI);
      let originalMsgNeckoURI = msgSvc.getUrlForUri(gOriginalMsgURI);

      if (src.startsWith(removeQueryPart(originalMsgNeckoURI.spec,
                                         "type=application/x-message-display"))) {
        // Reply/Forward/Edit Draft/Edit as New can contain references to
        // images in the original message. Load those and make them data: URLs
        // now.
        event.target.classList.add("loading-internal");
        try {
          loadBlockedImage(src);
        } catch (e) {
          // Couldn't load the referenced image.
          Cu.reportError(e);
        }
      }
      else {
        // Appears to reference a random message. Notify and keep blocking.
        gComposeNotificationBar.setBlockedContent(src);
      }
    }
    else {
      // For file:, and references to parts of random messages, show the
      // blocked content notification.
      gComposeNotificationBar.setBlockedContent(src);
    }
  }, true);

  // Convert mailnews URL back to data: URL.
  let background = editor.document.body.background;
  if (background && gOriginalMsgURI) {
    // Check that background has the same URL as the message itself.
    let msgSvc = Cc["@mozilla.org/messenger;1"]
                   .createInstance(Ci.nsIMessenger)
                   .messageServiceFromURI(gOriginalMsgURI);
    let originalMsgNeckoURI = msgSvc.getUrlForUri(gOriginalMsgURI);

    if (background.startsWith(
        removeQueryPart(originalMsgNeckoURI.spec,
                        "type=application/x-message-display"))) {
      try {
        editor.document.body.background = loadBlockedImage(background, true);
      } catch (e) {
        // Couldn't load the referenced image.
        Cu.reportError(e);
      }
    }
  }
}

/**
 * The event listener for the "spellcheck-changed" event updates
 * the document language.
 */
function updateDocumentLanguage(event)
{
  document.documentElement.setAttribute("lang", event.detail.dictionary);
}

function EnableInlineSpellCheck(aEnableInlineSpellCheck)
{
  InlineSpellCheckerUI.enabled = aEnableInlineSpellCheck;
  GetMsgSubjectElement().setAttribute("spellcheck", aEnableInlineSpellCheck);
}

function getMailToolbox()
{
  return document.getElementById("compose-toolbox");
}

function MailToolboxCustomizeInit()
{
  if (document.commandDispatcher.focusedWindow == content)
    window.focus();
  disableEditableFields();
  GetMsgHeadersToolbarElement().setAttribute("moz-collapsed", true);
  document.getElementById("compose-toolbar-sizer").setAttribute("moz-collapsed", true);
  document.getElementById("content-frame").setAttribute("moz-collapsed", true);
  toolboxCustomizeInit("mail-menubar");
}

function MailToolboxCustomizeDone(aToolboxChanged)
{
  toolboxCustomizeDone("mail-menubar", getMailToolbox(), aToolboxChanged);
  GetMsgHeadersToolbarElement().removeAttribute("moz-collapsed");
  document.getElementById("compose-toolbar-sizer").removeAttribute("moz-collapsed");
  document.getElementById("content-frame").removeAttribute("moz-collapsed");
  enableEditableFields();
  SetMsgBodyFrameFocus();
}

function MailToolboxCustomizeChange(aEvent)
{
  toolboxCustomizeChange(getMailToolbox(), aEvent);
}

/**
 * Object to handle message related notifications that are showing in a
 * notificationbox below the composed message content.
 */
var gComposeNotificationBar = {

  get notificationBar() {
    delete this.notificationBar;
    return this.notificationBar = document.getElementById("attachmentNotificationBox");
  },

  setBlockedContent: function(aBlockedURI) {
    let brandName = sBrandBundle.getString("brandShortName");
    let buttonLabel = sComposeMsgsBundle.getString("blockedContentPrefLabel");
    let buttonAccesskey = sComposeMsgsBundle.getString("blockedContentPrefAccesskey");

    let buttons = [{
      label: buttonLabel,
      accessKey: buttonAccesskey,
      popup: "blockedContentOptions",
      callback: function(aNotification, aButton) {
        return true; // keep notification open
      }
    }];

    // The popup value is a space separated list of all the blocked urls.
    let popup = document.getElementById("blockedContentOptions");
    let urls = popup.value ? popup.value.split(" ") : [];
    if (!urls.includes(aBlockedURI)) {
      urls.push(aBlockedURI);
    }
    popup.value = urls.join(" ");

    let msg = sComposeMsgsBundle.getFormattedString("blockedContentMessage",
                                                    [brandName, brandName]);
    msg = PluralForm.get(urls.length, msg);

    if (!this.isShowingBlockedContentNotification()) {
      this.notificationBar
          .appendNotification(msg, "blockedContent", null,
                              this.notificationBar.PRIORITY_WARNING_MEDIUM,
                              buttons);
    }
    else {
      this.notificationBar.getNotificationWithValue("blockedContent")
                          .setAttribute("label", msg);
    }
  },

  isShowingBlockedContentNotification: function() {
    return !!this.notificationBar.getNotificationWithValue("blockedContent");
  },

  clearBlockedContentNotification: function() {
    this.notificationBar.removeNotification(
      this.notificationBar.getNotificationWithValue("blockedContent"));
  },

  clearNotifications: function(aValue) {
    this.notificationBar.removeAllNotifications(true);
  },

  setIdentityWarning: function(aIdentityName) {
    if (!this.notificationBar.getNotificationWithValue("identityWarning")) {
      let text = sComposeMsgsBundle.getString("identityWarning").split("%S");
      let label = new DocumentFragment();
      label.appendChild(document.createTextNode(text[0]));
      label.appendChild(document.createElement("b"));
      label.lastChild.appendChild(document.createTextNode(aIdentityName));
      label.appendChild(document.createTextNode(text[1]));
      this.notificationBar.appendNotification(label, "identityWarning", null,
        this.notificationBar.PRIORITY_WARNING_HIGH, null);
    }
  },

  clearIdentityWarning: function() {
    let idWarning = this.notificationBar.getNotificationWithValue("identityWarning");
    if (idWarning)
      this.notificationBar.removeNotification(idWarning);
  }
};

/**
 * Populate the menuitems of what blocked content to unblock.
 */
function onBlockedContentOptionsShowing(aEvent) {
  let urls = aEvent.target.value ? aEvent.target.value.split(" ") : [];

  // Out with the old...
  let childNodes = aEvent.target.childNodes;
  for (let i = childNodes.length - 1; i >= 0; i--) {
    childNodes[i].remove();
  }

  // ... and in with the new.
  for (let url of urls) {
    let menuitem = document.createElement("menuitem");
    let fString = sComposeMsgsBundle.getFormattedString("blockedAllowResource",
                                                        [url]);
    menuitem.setAttribute("label", fString);
    menuitem.setAttribute("crop", "center");
    menuitem.setAttribute("value", url);
    menuitem.setAttribute("oncommand",
                          "onUnblockResource(this.value, this.parentNode);");
    aEvent.target.appendChild(menuitem);
  }
}

/**
 * Handle clicking the "Load <url>" in the blocked content notification bar.
 * @param {String} aURL - the URL that was unblocked
 * @param {Node} aNode  - the node holding as value the URLs of the blocked
 *                        resources in the message (space separated).
 */
function onUnblockResource(aURL, aNode) {
  try {
    loadBlockedImage(aURL);
  } catch (e) {
    // Couldn't load the referenced image.
    Cu.reportError(e);
  } finally {
    // Remove it from the list on success and failure.
    let urls = aNode.value.split(" ");
    for (let i = 0; i < urls.length; i++) {
      if (urls[i] == aURL) {
        urls.splice(i, 1);
        aNode.value = urls.join(" ");
        if (urls.length == 0) {
          gComposeNotificationBar.clearBlockedContentNotification();
        }
        break;
      }
    }
  }
}

/**
 * Convert the blocked content to a data URL and swap the src to that for the
 * elements that were using it.
 *
 * @param {String}  aURL - (necko) URL to unblock
 * @param {Bool}    aReturnDataURL - return data: URL instead of processing image
 * @return {String} the image as data: URL.
 * @throw Error()   if reading the data failed
 */
function loadBlockedImage(aURL, aReturnDataURL = false) {
  let filename;
  if (/^(file|chrome):/i.test(aURL)) {
    filename = aURL.substr(aURL.lastIndexOf("/") + 1);
  }
  else {
    let fnMatch = /[?&;]filename=([^?&]+)/.exec(aURL);
    filename = (fnMatch && fnMatch[1]) || "";
  }

  filename = decodeURIComponent(filename);
  let uri = Services.io.newURI(aURL);
  let contentType;
  if (filename) {
    try {
      contentType = Cc["@mozilla.org/mime;1"]
                      .getService(Ci.nsIMIMEService)
                      .getTypeFromURI(uri);
    } catch (ex) {
      contentType = "image/png";
    }

    if (!contentType.startsWith("image/")) {
      // Unsafe to unblock this. It would just be garbage either way.
      throw new Error("Won't unblock; URL=" + aURL +
                      ", contentType=" + contentType);
    }
  }
  else {
    // Assuming image/png is the best we can do.
    contentType = "image/png";
  }

  let channel =
    Services.io.newChannelFromURI(uri,
      null,
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      Ci.nsIContentPolicy.TYPE_OTHER);

  let inputStream = channel.open();
  let stream = Cc["@mozilla.org/binaryinputstream;1"]
                 .createInstance(Ci.nsIBinaryInputStream);
  stream.setInputStream(inputStream);
  let streamData = "";
  try {
    while (stream.available() > 0) {
      streamData += stream.readBytes(stream.available());
    }
  } catch(e) {
    stream.close();
    throw new Error("Couln't read all data from URL=" + aURL + " (" + e +")");
  }
  stream.close();

  let encoded = btoa(streamData);
  let dataURL = "data:" + contentType +
                (filename ? ";filename=" + encodeURIComponent(filename) : "") +
                ";base64," + encoded;

  if (aReturnDataURL) {
    return dataURL;
  }

  let editor = GetCurrentEditor();
  for (let img of editor.document.images) {
    if (img.src == aURL) {
      img.src = dataURL; // Swap to data URL.
      img.classList.remove("loading-internal");
    }
  }
}
