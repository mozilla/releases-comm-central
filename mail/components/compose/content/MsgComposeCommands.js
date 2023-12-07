/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../../toolkit/content/contentAreaUtils.js */
/* import-globals-from ../../../../mailnews/addrbook/content/abDragDrop.js */
/* import-globals-from ../../../../mailnews/base/prefs/content/accountUtils.js */
/* import-globals-from ../../../base/content/contentAreaClick.js */
/* import-globals-from ../../../base/content/mailCore.js */
/* import-globals-from ../../../base/content/messenger-customization.js */
/* import-globals-from ../../../base/content/toolbarIconColor.js */
/* import-globals-from ../../../base/content/utilityOverlay.js */
/* import-globals-from ../../../base/content/viewZoomOverlay.js */
/* import-globals-from ../../../base/content/widgets/browserPopups.js */
/* import-globals-from ../../../extensions/openpgp/content/ui/keyAssistant.js */
/* import-globals-from addressingWidgetOverlay.js */
/* import-globals-from cloudAttachmentLinkManager.js */
/* import-globals-from ComposerCommands.js */
/* import-globals-from editor.js */
/* import-globals-from editorUtilities.js */

/**
 * Commands for the message composition window.
 */

// Ensure the activity modules are loaded for this window.
ChromeUtils.import("resource:///modules/activity/activityModules.jsm");
var { AttachmentChecker } = ChromeUtils.import(
  "resource:///modules/AttachmentChecker.jsm"
);
var { cloudFileAccounts } = ChromeUtils.import(
  "resource:///modules/cloudFileAccounts.jsm"
);
var { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { PluralForm } = ChromeUtils.importESModule(
  "resource:///modules/PluralForm.sys.mjs"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  SelectionUtils: "resource://gre/modules/SelectionUtils.sys.mjs",
  ShortcutUtils: "resource://gre/modules/ShortcutUtils.sys.mjs",
  UIDensity: "resource:///modules/UIDensity.sys.mjs",
  UIFontSize: "resource:///modules/UIFontSize.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(this, {
  FolderUtils: "resource:///modules/FolderUtils.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  BondOpenPGP: "chrome://openpgp/content/BondOpenPGP.jsm",
});

XPCOMUtils.defineLazyGetter(
  this,
  "l10nCompose",
  () =>
    new Localization([
      "branding/brand.ftl",
      "messenger/messengercompose/messengercompose.ftl",
    ])
);

XPCOMUtils.defineLazyGetter(
  this,
  "l10nComposeSync",
  () =>
    new Localization(
      ["branding/brand.ftl", "messenger/messengercompose/messengercompose.ftl"],
      true
    )
);

XPCOMUtils.defineLazyServiceGetter(
  this,
  "gMIMEService",
  "@mozilla.org/mime;1",
  "nsIMIMEService"
);

XPCOMUtils.defineLazyScriptGetter(
  this,
  "PrintUtils",
  "chrome://messenger/content/printUtils.js"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  MailStringUtils: "resource:///modules/MailStringUtils.jsm",
});

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
var gMsgCompose;
var gOriginalMsgURI;
var gWindowLocked;
var gSendLocked;
var gContentChanged;
var gSubjectChanged;
var gAutoSaving;
var gCurrentIdentity;
var defaultSaveOperation;
var gSendOperationInProgress;
var gSaveOperationInProgress;
var gCloseWindowAfterSave;
var gSavedSendNowKey;
var gContextMenu;
var gLastFocusElement = null;
var gLoadingComplete = false;

var gAttachmentBucket;
var gAttachmentCounter;
/**
 * typedef {Object} FocusArea
 *
 * @property {Element} root - The root of a given area of the UI.
 * @property {moveFocusWithin} focus - A method to move the focus within the
 *   root.
 */
/**
 * @callback moveFocusWithin
 *
 * @param {Element} root - The element to move the focus within.
 *
 * @returns {boolean} - Whether the focus was successfully moved to within the
 *   given element.
 */
/**
 * An ordered list of non-intersecting areas we want to jump focus between.
 * Ordering should be in the same order as tab focus. See
 * {@link moveFocusToNeighbouringArea}.
 *
 * @type {FocusArea[]}
 */
var gFocusAreas;
// TODO: Maybe the following two variables can be combined.
var gManualAttachmentReminder;
var gDisableAttachmentReminder;
var gComposeType;
var gLanguageObserver;
var gRecipientObserver;
var gWantCannotEncryptBCCNotification = true;
var gRecipientKeysObserver;
var gCheckPublicRecipientsTimer;
var gBodyFromArgs;

// gSMFields is the nsIMsgComposeSecure instance for S/MIME.
// gMsgCompose.compFields.composeSecure is set to this instance most of
// the time. Because the S/MIME code has no knowledge of the OpenPGP
// implementation, gMsgCompose.compFields.composeSecure is set to an
// instance of PgpMimeEncrypt only temporarily. Keeping variable
// gSMFields separate allows switching as needed.
var gSMFields = null;

var gSMPendingCertLookupSet = new Set();
var gSMCertsAlreadyLookedUpInLDAP = new Set();

var gSelectedTechnologyIsPGP = false;

// The initial flags store the value we used at composer open time.
// Some flags might be automatically changed as a consequence of other
// changes. When reverting automatic actions, the initial flags help
// us know what value we should use for restoring.

var gSendSigned = false;

var gAttachMyPublicPGPKey = false;

var gSendEncrypted = false;

// gEncryptSubject contains the preference for subject encryption,
// considered only if encryption is enabled and the technology allows it.
// In other words, gEncryptSubject might be set to true, but if
// encryption is disabled, or if S/MIME is used,
// gEncryptSubject==true is ignored.
var gEncryptSubject = false;

var gUserTouchedSendEncrypted = false;
var gUserTouchedSendSigned = false;
var gUserTouchedAttachMyPubKey = false;
var gUserTouchedEncryptSubject = false;

var gIsRelatedToEncryptedOriginal = false;

var gOpened = Date.now();

var gEncryptedURIService = Cc[
  "@mozilla.org/messenger-smime/smime-encrypted-uris-service;1"
].getService(Ci.nsIEncryptedSMIMEURIsService);

try {
  var gDragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
    Ci.nsIDragService
  );
} catch (e) {}

/**
 * Boolean variable to keep track of the dragging action of files above the
 * compose window.
 *
 * @type {boolean}
 */
var gIsDraggingAttachments;

/**
 * Boolean variable to allow showing the attach inline overlay when dragging
 * links that otherwise would only trigger the add as attachment overlay.
 *
 * @type {boolean}
 */
var gIsValidInline;

// i18n globals
var _gComposeBundle;
function getComposeBundle() {
  // That one has to be lazy. Getting a reference to an element with a XBL
  // binding attached will cause the XBL constructors to fire if they haven't
  // already. If we get a reference to the compose bundle at script load-time,
  // this will cause the XBL constructor that's responsible for the personas to
  // fire up, thus executing the personas code while the DOM is not fully built.
  // Since this <script> comes before the <statusbar>, the Personas code will
  // fail.
  if (!_gComposeBundle) {
    _gComposeBundle = document.getElementById("bundle_composeMsgs");
  }
  return _gComposeBundle;
}

var gLastWindowToHaveFocus;
var gLastKnownComposeStates;
var gReceiptOptionChanged;
var gDSNOptionChanged;
var gAttachVCardOptionChanged;

var gAutoSaveInterval;
var gAutoSaveTimeout;
var gAutoSaveKickedIn;
var gEditingDraft;
var gNumUploadingAttachments;

// From the user's point-of-view, is spell checking enabled? This value only
// changes if the user makes the change, it's not affected by the process of
// sending or saving the message or any other reason the actual state of the
// spellchecker might change.
var gSpellCheckingEnabled;

var kComposeAttachDirPrefName = "mail.compose.attach.dir";

window.addEventListener("unload", event => {
  ComposeUnload();
});
window.addEventListener("load", event => {
  ComposeLoad();
});
window.addEventListener("close", event => {
  if (!ComposeCanClose()) {
    event.preventDefault();
  }
});
window.addEventListener("focus", event => {
  EditorOnFocus();
});
window.addEventListener("click", event => {
  composeWindowOnClick(event);
});

document.addEventListener("focusin", event => {
  // Listen for focusin event in composition. gLastFocusElement might well be
  // null, e.g. when focusin enters a different document like contacts sidebar.
  gLastFocusElement = event.relatedTarget;
});

// For WebExtensions.
this.__defineGetter__("browser", GetCurrentEditorElement);

/**
 * @implements {nsIXULBrowserWindow}
 */
var XULBrowserWindow = {
  // Used to show the link-being-hovered-over in the status bar. Do nothing here.
  setOverLink(url, anchorElt) {},

  // Called before links are navigated to to allow us to retarget them if needed.
  onBeforeLinkTraversal(originalTarget, linkURI, linkNode, isAppTab) {
    return originalTarget;
  },

  // Called by BrowserParent::RecvShowTooltip.
  showTooltip(xDevPix, yDevPix, tooltip, direction, browser) {
    if (
      Cc["@mozilla.org/widget/dragservice;1"]
        .getService(Ci.nsIDragService)
        .getCurrentSession()
    ) {
      return;
    }

    const elt = document.getElementById("remoteBrowserTooltip");
    elt.label = tooltip;
    elt.style.direction = direction;
    elt.openPopupAtScreen(
      xDevPix / window.devicePixelRatio,
      yDevPix / window.devicePixelRatio,
      false,
      null
    );
  },

  // Called by BrowserParent::RecvHideTooltip.
  hideTooltip() {
    const elt = document.getElementById("remoteBrowserTooltip");
    elt.hidePopup();
  },

  getTabCount() {
    return 1;
  },
};
window
  .getInterface(Ci.nsIWebNavigation)
  .QueryInterface(Ci.nsIDocShellTreeItem)
  .treeOwner.QueryInterface(Ci.nsIInterfaceRequestor)
  .getInterface(Ci.nsIAppWindow).XULBrowserWindow = window.XULBrowserWindow;

// Observer for the autocomplete input.
const inputObserver = {
  observe: (subject, topic, data) => {
    if (topic == "autocomplete-did-enter-text") {
      const input = subject.QueryInterface(
        Ci.nsIAutoCompleteInput
      ).wrappedJSObject;

      // Interrupt if there's no input proxy, or the input doesn't have an ID,
      // the latter meaning that the autocomplete event was triggered within an
      // already existing pill, so we don't want to create a new pill.
      if (!input || !input.id) {
        return;
      }

      // Trigger the pill creation.
      recipientAddPills(document.getElementById(input.id));
    }
  },
};

const keyObserver = {
  observe: async (subject, topic, data) => {
    switch (topic) {
      case "openpgp-key-change":
        EnigmailKeyRing.clearCache();
      // fall through
      case "openpgp-acceptance-change":
        checkEncryptionState(topic);
        gKeyAssistant.onExternalKeyChange();
        break;
      default:
        break;
    }
  },
};

// Non translatable international shortcuts.
var SHOW_TO_KEY = "T";
var SHOW_CC_KEY = "C";
var SHOW_BCC_KEY = "B";

function InitializeGlobalVariables() {
  gMessenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

  gMsgCompose = null;
  gOriginalMsgURI = null;
  gWindowLocked = false;
  gContentChanged = false;
  gSubjectChanged = false;
  gCurrentIdentity = null;
  defaultSaveOperation = "draft";
  gSendOperationInProgress = false;
  gSaveOperationInProgress = false;
  gAutoSaving = false;
  gCloseWindowAfterSave = false;
  gSavedSendNowKey = null;
  gManualAttachmentReminder = false;
  gDisableAttachmentReminder = false;
  gLanguageObserver = null;
  gRecipientObserver = null;

  gLastWindowToHaveFocus = null;
  gLastKnownComposeStates = {};
  gReceiptOptionChanged = false;
  gDSNOptionChanged = false;
  gAttachVCardOptionChanged = false;
  gNumUploadingAttachments = 0;
  // eslint-disable-next-line no-global-assign
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );
  MailServices.mailSession.AddMsgWindow(msgWindow);

  // Add the observer.
  Services.obs.addObserver(inputObserver, "autocomplete-did-enter-text");
  Services.obs.addObserver(keyObserver, "openpgp-key-change");
  Services.obs.addObserver(keyObserver, "openpgp-acceptance-change");
}
InitializeGlobalVariables();

function ReleaseGlobalVariables() {
  gCurrentIdentity = null;
  gMsgCompose = null;
  gOriginalMsgURI = null;
  gMessenger = null;
  gRecipientObserver = null;
  gDisableAttachmentReminder = false;
  _gComposeBundle = null;
  MailServices.mailSession.RemoveMsgWindow(msgWindow);
  // eslint-disable-next-line no-global-assign
  msgWindow = null;

  gLastKnownComposeStates = null;

  // Remove the observers.
  Services.obs.removeObserver(inputObserver, "autocomplete-did-enter-text");
  Services.obs.removeObserver(keyObserver, "openpgp-key-change");
  Services.obs.removeObserver(keyObserver, "openpgp-acceptance-change");
}

// Notification box shown at the bottom of the window.
XPCOMUtils.defineLazyGetter(this, "gComposeNotification", () => {
  return new MozElements.NotificationBox(element => {
    element.setAttribute("notificationside", "bottom");
    document.getElementById("compose-notification-bottom").append(element);
  });
});

/**
 *  Get the first next sibling element matching the selector (if specified).
 *
 *  @param {HTMLElement} element - The source element whose sibling to look for.
 *  @param {string} [selector] - The CSS query selector to match.
 *
 *  @returns {(HTMLElement|null)} - The first matching sibling element, or null.
 */
function getNextSibling(element, selector) {
  let sibling = element.nextElementSibling;
  if (!selector) {
    // If there's no selector, return the first next sibling.
    return sibling;
  }
  while (sibling) {
    if (sibling.matches(selector)) {
      // Return the current sibling if it matches the selector.
      return sibling;
    }
    // Otherwise, continue the loop with the following next sibling.
    sibling = sibling.nextElementSibling;
  }
  return null;
}

/**
 *  Get the first previous sibling element matching the selector (if specified).
 *
 *  @param {HTMLElement} element - The source element whose sibling to look for.
 *  @param {string} [selector] - The CSS query selector to match.
 *
 *  @returns {(HTMLElement|null)} - The first matching sibling element, or null.
 */
function getPreviousSibling(element, selector) {
  let sibling = element.previousElementSibling;
  if (!selector) {
    // If there's no selector, return the first previous sibling.
    return sibling;
  }
  while (sibling) {
    if (sibling.matches(selector)) {
      // Return the current sibling if it matches the selector.
      return sibling;
    }
    // Otherwise, continue the loop with the preceding previous sibling.
    sibling = sibling.previousElementSibling;
  }
  return null;
}

/**
 * Get a pretty, human-readable shortcut key string from a given <key> id.
 *
 * @param aKeyId   the ID of a <key> element
 * @returns string  pretty, human-readable shortcut key string from the <key>
 */
function getPrettyKey(aKeyId) {
  return ShortcutUtils.prettifyShortcut(document.getElementById(aKeyId));
}

/**
 * Disables or enables editable elements in the window.
 * The elements to operate on are marked with the "disableonsend" attribute.
 * This includes elements like the address list, attachment list, subject
 * and message body.
 *
 * @param aDisable  true = disable items. false = enable items.
 */
function updateEditableFields(aDisable) {
  if (!gMsgCompose) {
    return;
  }

  if (aDisable) {
    gMsgCompose.editor.flags |= Ci.nsIEditor.eEditorReadonlyMask;
  } else {
    gMsgCompose.editor.flags &= ~Ci.nsIEditor.eEditorReadonlyMask;

    try {
      const checker = GetCurrentEditor().getInlineSpellChecker(true);
      checker.enableRealTimeSpell = gSpellCheckingEnabled;
    } catch (ex) {
      // An error will be thrown if there are no dictionaries. Just ignore it.
    }
  }

  // Disable all the input fields and labels.
  for (const element of document.querySelectorAll('[disableonsend="true"]')) {
    element.disabled = aDisable;
  }

  // Update the UI of the addressing rows.
  for (const row of document.querySelectorAll(".address-container")) {
    row.classList.toggle("disable-container", aDisable);
  }

  // Prevent any interaction with the addressing pills.
  for (const pill of document.querySelectorAll("mail-address-pill")) {
    pill.toggleAttribute("disabled", aDisable);
  }
}

/**
 * Small helper function to check whether the node passed in is a signature.
 * Note that a text node is not a DOM element, hence .localName can't be used.
 */
function isSignature(aNode) {
  return (
    ["DIV", "PRE"].includes(aNode.nodeName) &&
    aNode.classList.contains("moz-signature")
  );
}

var stateListener = {
  NotifyComposeFieldsReady() {
    ComposeFieldsReady();
    updateSendCommands(true);
  },

  NotifyComposeBodyReady() {
    // Look all the possible compose types (nsIMsgComposeParams.idl):
    switch (gComposeType) {
      case Ci.nsIMsgCompType.MailToUrl:
        gBodyFromArgs = true;
      // Falls through
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

      case Ci.nsIMsgCompType.Redirect:
      case Ci.nsIMsgCompType.ForwardInline:
        this.NotifyComposeBodyReadyForwardInline();
        break;

      case Ci.nsIMsgCompType.EditTemplate:
        defaultSaveOperation = "template";
        break;
      case Ci.nsIMsgCompType.Draft:
      case Ci.nsIMsgCompType.Template:
      case Ci.nsIMsgCompType.EditAsNew:
        break;

      default:
        dump(
          "Unexpected nsIMsgCompType in NotifyComposeBodyReady (" +
            gComposeType +
            ")\n"
        );
    }

    // Setting the selected item in the identity list will cause an
    // identity/signature switch. This can only be done once the message
    // body has already been assembled with the signature we need to switch.
    if (gMsgCompose.identity != gCurrentIdentity) {
      const identityList = document.getElementById("msgIdentity");
      identityList.selectedItem = identityList.getElementsByAttribute(
        "identitykey",
        gMsgCompose.identity.key
      )[0];
      LoadIdentity(false);
    }
    if (gMsgCompose.composeHTML) {
      loadHTMLMsgPrefs();
    }
    AdjustFocus();
  },

  NotifyComposeBodyReadyNew() {
    const useParagraph = Services.prefs.getBoolPref(
      "mail.compose.default_to_paragraph"
    );
    let insertParagraph = gMsgCompose.composeHTML && useParagraph;

    const mailBody = getBrowser().contentDocument.querySelector("body");
    if (insertParagraph && gBodyFromArgs) {
      // Check for "empty" body before allowing paragraph to be inserted.
      // Non-empty bodies in a new message can occur when clicking on a
      // mailto link or when using the command line option -compose.
      // An "empty" body can be one of these three cases:
      // 1) <br> and nothing follows (no next sibling)
      // 2) <div/pre class="moz-signature">
      // 3) No elements, just text
      // Note that <br><div/pre class="moz-signature"> doesn't happen in
      // paragraph mode.
      const firstChild = mailBody.firstChild;
      const firstElementChild = mailBody.firstElementChild;
      if (firstElementChild) {
        if (
          (firstElementChild.nodeName != "BR" ||
            firstElementChild.nextElementSibling) &&
          !isSignature(firstElementChild)
        ) {
          insertParagraph = false;
        }
      } else if (firstChild && firstChild.nodeType == Node.TEXT_NODE) {
        insertParagraph = false;
      }
    }

    // Control insertion of line breaks.
    if (insertParagraph) {
      const editor = GetCurrentEditor();
      editor.enableUndo(false);

      editor.selection.collapse(mailBody, 0);
      const pElement = editor.createElementWithDefaults("p");
      pElement.appendChild(editor.createElementWithDefaults("br"));
      editor.insertElementAtSelection(pElement, false);

      document.getElementById("cmd_paragraphState").setAttribute("state", "p");

      editor.beginningOfDocument();
      editor.enableUndo(true);
      editor.resetModificationCount();
    } else {
      document.getElementById("cmd_paragraphState").setAttribute("state", "");
    }
    onParagraphFormatChange();
  },

  NotifyComposeBodyReadyReply() {
    // Control insertion of line breaks.
    const useParagraph = Services.prefs.getBoolPref(
      "mail.compose.default_to_paragraph"
    );
    if (gMsgCompose.composeHTML && useParagraph) {
      const mailBody = getBrowser().contentDocument.querySelector("body");
      const editor = GetCurrentEditor();
      const selection = editor.selection;

      // Make sure the selection isn't inside the signature.
      if (isSignature(mailBody.firstElementChild)) {
        selection.collapse(mailBody, 0);
      }

      const range = selection.getRangeAt(0);
      const start = range.startOffset;

      if (start != range.endOffset) {
        // The selection is not collapsed, most likely due to the
        // "select the quote" option. In this case we do nothing.
        return;
      }

      if (range.startContainer != mailBody) {
        dump("Unexpected selection in NotifyComposeBodyReadyReply\n");
        return;
      }

      editor.enableUndo(false);

      const pElement = editor.createElementWithDefaults("p");
      pElement.appendChild(editor.createElementWithDefaults("br"));
      editor.insertElementAtSelection(pElement, false);

      // Position into the paragraph.
      selection.collapse(pElement, 0);

      document.getElementById("cmd_paragraphState").setAttribute("state", "p");

      editor.enableUndo(true);
      editor.resetModificationCount();
    } else {
      document.getElementById("cmd_paragraphState").setAttribute("state", "");
    }
    onParagraphFormatChange();
  },

  NotifyComposeBodyReadyForwardInline() {
    const mailBody = getBrowser().contentDocument.querySelector("body");
    const editor = GetCurrentEditor();
    const selection = editor.selection;

    editor.enableUndo(false);

    // Control insertion of line breaks.
    selection.collapse(mailBody, 0);
    const useParagraph = Services.prefs.getBoolPref(
      "mail.compose.default_to_paragraph"
    );
    if (gMsgCompose.composeHTML && useParagraph) {
      const pElement = editor.createElementWithDefaults("p");
      const brElement = editor.createElementWithDefaults("br");
      pElement.appendChild(brElement);
      editor.insertElementAtSelection(pElement, false);
      document.getElementById("cmd_paragraphState").setAttribute("state", "p");
    } else {
      // insertLineBreak() has been observed to insert two <br> elements
      // instead of one before a <div>, so we'll do it ourselves here.
      const brElement = editor.createElementWithDefaults("br");
      editor.insertElementAtSelection(brElement, false);
      document.getElementById("cmd_paragraphState").setAttribute("state", "");
    }

    onParagraphFormatChange();
    editor.beginningOfDocument();
    editor.enableUndo(true);
    editor.resetModificationCount();
  },

  ComposeProcessDone(aResult) {
    ToggleWindowLock(false);

    if (aResult == Cr.NS_OK) {
      if (!gAutoSaving) {
        SetContentAndBodyAsUnmodified();
      }

      if (gCloseWindowAfterSave) {
        // Notify the SendListener that Send has been aborted and Stopped
        if (gMsgCompose) {
          gMsgCompose.onSendNotPerformed(null, Cr.NS_ERROR_ABORT);
        }

        MsgComposeCloseWindow();
      }
    } else if (gAutoSaving) {
      // If we failed to save, and we're autosaving, need to re-mark the editor
      // as changed, so that we won't lose the changes.
      gMsgCompose.bodyModified = true;
      gContentChanged = true;
    }
    gAutoSaving = false;
    gCloseWindowAfterSave = false;
  },

  SaveInFolderDone(folderURI) {
    DisplaySaveFolderDlg(folderURI);
  },
};

var gSendListener = {
  // nsIMsgSendListener
  onStartSending(aMsgID, aMsgSize) {},
  onProgress(aMsgID, aProgress, aProgressMax) {},
  onStatus(aMsgID, aMsg) {},
  onStopSending(aMsgID, aStatus, aMsg, aReturnFile) {
    if (Components.isSuccessCode(aStatus)) {
      Services.obs.notifyObservers(null, "mail:composeSendSucceeded", aMsgID);
    }
  },
  onGetDraftFolderURI(aMsgID, aFolderURI) {},
  onSendNotPerformed(aMsgID, aStatus) {},
  onTransportSecurityError(msgID, status, secInfo, location) {
    // We're only interested in Bad Cert errors here.
    const nssErrorsService = Cc["@mozilla.org/nss_errors_service;1"].getService(
      Ci.nsINSSErrorsService
    );
    const errorClass = nssErrorsService.getErrorClass(status);
    if (errorClass != Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
      return;
    }

    // Give the user the option of adding an exception for the bad cert.
    const params = {
      exceptionAdded: false,
      securityInfo: secInfo,
      prefetchCert: true,
      location,
    };
    window.openDialog(
      "chrome://pippki/content/exceptionDialog.xhtml",
      "",
      "chrome,centerscreen,modal",
      params
    );
    // params.exceptionAdded will be set if the user added an exception.
  },
};

// all progress notifications are done through the nsIWebProgressListener implementation...
var progressListener = {
  onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
    const progressMeter = document.getElementById("compose-progressmeter");
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_START) {
      progressMeter.hidden = false;
      progressMeter.removeAttribute("value");
    }

    if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      gSendOperationInProgress = false;
      gSaveOperationInProgress = false;
      progressMeter.hidden = true;
      progressMeter.value = 0;
      document.getElementById("statusText").textContent = "";
      Services.obs.notifyObservers(
        { composeWindow: window },
        "mail:composeSendProgressStop"
      );
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
    // Calculate percentage.
    var percent;
    if (aMaxTotalProgress > 0) {
      percent = Math.round((aCurTotalProgress * 100) / aMaxTotalProgress);
      if (percent > 100) {
        percent = 100;
      }

      // Advance progress meter.
      document.getElementById("compose-progressmeter").value = percent;
    } else {
      // Progress meter should be barber-pole in this case.
      document.getElementById("compose-progressmeter").removeAttribute("value");
    }
  },

  onLocationChange(aWebProgress, aRequest, aLocation, aFlags) {
    // we can ignore this notification
  },

  onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {
    // Looks like it's possible that we get call while the document has been already delete!
    // therefore we need to protect ourself by using try/catch
    try {
      const statusText = document.getElementById("statusText");
      if (statusText) {
        statusText.textContent = aMessage;
      }
    } catch (ex) {}
  },

  onSecurityChange(aWebProgress, aRequest, state) {
    // we can ignore this notification
  },

  onContentBlockingEvent(aWebProgress, aRequest, aEvent) {
    // we can ignore this notification
  },

  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),
};

var defaultController = {
  commands: {
    cmd_attachFile: {
      isEnabled() {
        return !gWindowLocked;
      },
      doCommand() {
        AttachFile();
      },
    },

    cmd_attachCloud: {
      isEnabled() {
        // Hide the command entirely if there are no cloud accounts or
        // the feature is disabled.
        const cmd = document.getElementById("cmd_attachCloud");
        cmd.hidden =
          !Services.prefs.getBoolPref("mail.cloud_files.enabled") ||
          cloudFileAccounts.configuredAccounts.length == 0 ||
          Services.io.offline;
        return !cmd.hidden && !gWindowLocked;
      },
      doCommand() {
        // We should never actually call this, since the <command> node calls
        // a different function.
      },
    },

    cmd_attachPage: {
      isEnabled() {
        return !gWindowLocked;
      },
      doCommand() {
        gMsgCompose.allowRemoteContent = true;
        AttachPage();
      },
    },

    cmd_attachVCard: {
      isEnabled() {
        const cmd = document.getElementById("cmd_attachVCard");
        cmd.setAttribute("checked", gMsgCompose.compFields.attachVCard);
        return !!gCurrentIdentity?.escapedVCard;
      },
      doCommand() {},
    },

    cmd_attachPublicKey: {
      isEnabled() {
        const cmd = document.getElementById("cmd_attachPublicKey");
        cmd.setAttribute("checked", gAttachMyPublicPGPKey);
        return isPgpConfigured();
      },
      doCommand() {},
    },

    cmd_toggleAttachmentPane: {
      isEnabled() {
        return !gWindowLocked && gAttachmentBucket.itemCount;
      },
      doCommand() {
        toggleAttachmentPane("toggle");
      },
    },

    cmd_reorderAttachments: {
      isEnabled() {
        if (!gAttachmentBucket.itemCount) {
          const reorderAttachmentsPanel = document.getElementById(
            "reorderAttachmentsPanel"
          );
          if (reorderAttachmentsPanel.state == "open") {
            // When the panel is open and all attachments get deleted,
            // we get notified here and want to close the panel.
            reorderAttachmentsPanel.hidePopup();
          }
        }
        return gAttachmentBucket.itemCount > 1;
      },
      doCommand() {
        showReorderAttachmentsPanel();
      },
    },

    cmd_removeAllAttachments: {
      isEnabled() {
        return !gWindowLocked && gAttachmentBucket.itemCount;
      },
      doCommand() {
        RemoveAllAttachments();
      },
    },

    cmd_close: {
      isEnabled() {
        return !gWindowLocked;
      },
      doCommand() {
        if (ComposeCanClose()) {
          window.close();
        }
      },
    },

    cmd_saveDefault: {
      isEnabled() {
        return !gWindowLocked;
      },
      doCommand() {
        Save();
      },
    },

    cmd_saveAsFile: {
      isEnabled() {
        return !gWindowLocked;
      },
      doCommand() {
        SaveAsFile(true);
      },
    },

    cmd_saveAsDraft: {
      isEnabled() {
        return !gWindowLocked;
      },
      doCommand() {
        SaveAsDraft();
      },
    },

    cmd_saveAsTemplate: {
      isEnabled() {
        return !gWindowLocked;
      },
      doCommand() {
        SaveAsTemplate();
      },
    },

    cmd_sendButton: {
      isEnabled() {
        return !gWindowLocked && !gNumUploadingAttachments && !gSendLocked;
      },
      doCommand() {
        if (Services.io.offline) {
          SendMessageLater();
        } else {
          SendMessage();
        }
      },
    },

    cmd_sendNow: {
      isEnabled() {
        return (
          !gWindowLocked &&
          !Services.io.offline &&
          !gSendLocked &&
          !gNumUploadingAttachments
        );
      },
      doCommand() {
        SendMessage();
      },
    },

    cmd_sendLater: {
      isEnabled() {
        return !gWindowLocked && !gNumUploadingAttachments && !gSendLocked;
      },
      doCommand() {
        SendMessageLater();
      },
    },

    cmd_sendWithCheck: {
      isEnabled() {
        return !gWindowLocked && !gNumUploadingAttachments && !gSendLocked;
      },
      doCommand() {
        SendMessageWithCheck();
      },
    },

    cmd_print: {
      isEnabled() {
        return !gWindowLocked;
      },
      doCommand() {
        DoCommandPrint();
      },
    },

    cmd_delete: {
      isEnabled() {
        const cmdDelete = document.getElementById("cmd_delete");
        const textValue = cmdDelete.getAttribute("valueDefault");
        const accesskeyValue = cmdDelete.getAttribute("valueDefaultAccessKey");

        cmdDelete.setAttribute("label", textValue);
        cmdDelete.setAttribute("accesskey", accesskeyValue);

        return false;
      },
      doCommand() {},
    },

    cmd_account: {
      isEnabled() {
        return true;
      },
      doCommand() {
        const currentAccountKey = getCurrentAccountKey();
        const account = MailServices.accounts.getAccount(currentAccountKey);
        MsgAccountManager(null, account.incomingServer);
      },
    },

    cmd_showFormatToolbar: {
      isEnabled() {
        return gMsgCompose && gMsgCompose.composeHTML;
      },
      doCommand() {
        goToggleToolbar("FormatToolbar", "menu_showFormatToolbar");
      },
    },

    cmd_quoteMessage: {
      isEnabled() {
        const selectedURIs = GetSelectedMessages();
        return selectedURIs && selectedURIs.length > 0;
      },
      doCommand() {
        QuoteSelectedMessage();
      },
    },

    cmd_toggleReturnReceipt: {
      isEnabled() {
        if (!gMsgCompose) {
          return false;
        }
        return !gWindowLocked;
      },
      doCommand() {
        ToggleReturnReceipt();
      },
    },

    cmd_fullZoomReduce: {
      isEnabled() {
        return true;
      },
      doCommand() {
        ZoomManager.reduce();
      },
    },

    cmd_fullZoomEnlarge: {
      isEnabled() {
        return true;
      },
      doCommand() {
        ZoomManager.enlarge();
      },
    },

    cmd_fullZoomReset: {
      isEnabled() {
        return true;
      },
      doCommand() {
        ZoomManager.reset();
      },
    },

    cmd_spelling: {
      isEnabled() {
        return true;
      },
      doCommand() {
        window.cancelSendMessage = false;
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
      },
    },

    cmd_fullZoomToggle: {
      isEnabled() {
        return true;
      },
      doCommand() {
        ZoomManager.toggleZoom();
      },
    },
  },

  supportsCommand(aCommand) {
    return aCommand in this.commands;
  },

  isCommandEnabled(aCommand) {
    if (!this.supportsCommand(aCommand)) {
      return false;
    }
    return this.commands[aCommand].isEnabled();
  },

  doCommand(aCommand) {
    if (!this.supportsCommand(aCommand)) {
      return;
    }
    var cmd = this.commands[aCommand];
    if (!cmd.isEnabled()) {
      return;
    }
    cmd.doCommand();
  },

  onEvent(event) {},
};

var attachmentBucketController = {
  commands: {
    cmd_selectAll: {
      isEnabled() {
        return true;
      },
      doCommand() {
        gAttachmentBucket.selectAll();
      },
    },

    cmd_delete: {
      isEnabled() {
        const cmdDelete = document.getElementById("cmd_delete");
        let textValue = getComposeBundle().getString("removeAttachmentMsgs");
        textValue = PluralForm.get(gAttachmentBucket.selectedCount, textValue);
        const accesskeyValue = cmdDelete.getAttribute(
          "valueRemoveAttachmentAccessKey"
        );
        cmdDelete.setAttribute("label", textValue);
        cmdDelete.setAttribute("accesskey", accesskeyValue);

        return gAttachmentBucket.selectedCount;
      },
      doCommand() {
        RemoveSelectedAttachment();
      },
    },

    cmd_openAttachment: {
      isEnabled() {
        return gAttachmentBucket.selectedCount == 1;
      },
      doCommand() {
        OpenSelectedAttachment();
      },
    },

    cmd_renameAttachment: {
      isEnabled() {
        return (
          gAttachmentBucket.selectedCount == 1 &&
          !gAttachmentBucket.selectedItem.uploading
        );
      },
      doCommand() {
        RenameSelectedAttachment();
      },
    },

    cmd_moveAttachmentLeft: {
      isEnabled() {
        return (
          gAttachmentBucket.selectedCount && !attachmentsSelectionIsBlock("top")
        );
      },
      doCommand() {
        moveSelectedAttachments("left");
      },
    },

    cmd_moveAttachmentRight: {
      isEnabled() {
        return (
          gAttachmentBucket.selectedCount &&
          !attachmentsSelectionIsBlock("bottom")
        );
      },
      doCommand() {
        moveSelectedAttachments("right");
      },
    },

    cmd_moveAttachmentBundleUp: {
      isEnabled() {
        return (
          gAttachmentBucket.selectedCount > 1 && !attachmentsSelectionIsBlock()
        );
      },
      doCommand() {
        moveSelectedAttachments("bundleUp");
      },
    },

    cmd_moveAttachmentBundleDown: {
      isEnabled() {
        return (
          gAttachmentBucket.selectedCount > 1 && !attachmentsSelectionIsBlock()
        );
      },
      doCommand() {
        moveSelectedAttachments("bundleDown");
      },
    },

    cmd_moveAttachmentTop: {
      isEnabled() {
        return (
          gAttachmentBucket.selectedCount && !attachmentsSelectionIsBlock("top")
        );
      },
      doCommand() {
        moveSelectedAttachments("top");
      },
    },

    cmd_moveAttachmentBottom: {
      isEnabled() {
        return (
          gAttachmentBucket.selectedCount &&
          !attachmentsSelectionIsBlock("bottom")
        );
      },
      doCommand() {
        moveSelectedAttachments("bottom");
      },
    },

    cmd_sortAttachmentsToggle: {
      isEnabled() {
        let sortSelection;
        let currSortOrder;
        let isBlock;
        let btnAscending;
        const toggleCmd = document.getElementById("cmd_sortAttachmentsToggle");
        const toggleBtn = document.getElementById("btn_sortAttachmentsToggle");
        let sortDirection;
        let btnLabelAttr;

        if (
          gAttachmentBucket.selectedCount > 1 &&
          gAttachmentBucket.selectedCount < gAttachmentBucket.itemCount
        ) {
          // Sort selected attachments only, which needs at least 2 of them,
          // but not all.
          sortSelection = true;
          currSortOrder = attachmentsSelectionGetSortOrder();
          isBlock = attachmentsSelectionIsBlock();
          // If current sorting is ascending AND it's a block; OR
          // if current sorting is descending AND it's NOT a block yet:
          // Offer toggle button face to sort descending.
          // In all other cases, offer toggle button face to sort ascending.
          btnAscending = !(
            (currSortOrder == "ascending" && isBlock) ||
            (currSortOrder == "descending" && !isBlock)
          );
          // Set sortDirection for toggleCmd, and respective button face.
          if (btnAscending) {
            sortDirection = "ascending";
            btnLabelAttr = "label-selection-AZ";
          } else {
            sortDirection = "descending";
            btnLabelAttr = "label-selection-ZA";
          }
        } else {
          // gAttachmentBucket.selectedCount <= 1 or all attachments are selected.
          // Sort all attachments.
          sortSelection = false;
          currSortOrder = attachmentsGetSortOrder();
          btnAscending = !(currSortOrder == "ascending");
          // Set sortDirection for toggleCmd, and respective button face.
          if (btnAscending) {
            sortDirection = "ascending";
            btnLabelAttr = "label-AZ";
          } else {
            sortDirection = "descending";
            btnLabelAttr = "label-ZA";
          }
        }

        // Set the sort direction for toggleCmd.
        toggleCmd.setAttribute("sortdirection", sortDirection);
        // The button's icon is set dynamically via CSS involving the button's
        // sortdirection attribute, which is forwarded by the command.
        toggleBtn.setAttribute("label", toggleBtn.getAttribute(btnLabelAttr));

        return sortSelection
          ? !(currSortOrder == "equivalent" && isBlock)
          : !(currSortOrder == "equivalent");
      },
      doCommand() {
        moveSelectedAttachments("toggleSort");
      },
    },

    cmd_convertCloud: {
      isEnabled() {
        // Hide the command entirely if Filelink is disabled, or if there are
        // no cloud accounts.
        const cmd = document.getElementById("cmd_convertCloud");

        cmd.hidden =
          !Services.prefs.getBoolPref("mail.cloud_files.enabled") ||
          cloudFileAccounts.configuredAccounts.length == 0 ||
          Services.io.offline;
        if (cmd.hidden) {
          return false;
        }

        for (const item of gAttachmentBucket.selectedItems) {
          if (item.uploading) {
            return false;
          }
        }
        return true;
      },
      doCommand() {
        // We should never actually call this, since the <command> node calls
        // a different function.
      },
    },

    cmd_convertAttachment: {
      isEnabled() {
        if (!Services.prefs.getBoolPref("mail.cloud_files.enabled")) {
          return false;
        }

        for (const item of gAttachmentBucket.selectedItems) {
          if (item.uploading) {
            return false;
          }
        }
        return true;
      },
      doCommand() {
        convertSelectedToRegularAttachment();
      },
    },

    cmd_cancelUpload: {
      isEnabled() {
        const cmd = document.getElementById(
          "composeAttachmentContext_cancelUploadItem"
        );

        // If Filelink is disabled, hide this menuitem and bailout.
        if (!Services.prefs.getBoolPref("mail.cloud_files.enabled")) {
          cmd.hidden = true;
          return false;
        }

        for (const item of gAttachmentBucket.selectedItems) {
          if (item && item.uploading) {
            cmd.hidden = false;
            return true;
          }
        }

        // Hide the command entirely if the selected attachments aren't cloud
        // files.
        // For some reason, the hidden property isn't propagating from the cmd
        // to the menuitem.
        cmd.hidden = true;
        return false;
      },
      doCommand() {
        const fileHandler = Services.io
          .getProtocolHandler("file")
          .QueryInterface(Ci.nsIFileProtocolHandler);

        for (const item of gAttachmentBucket.selectedItems) {
          if (item && item.uploading) {
            const file = fileHandler.getFileFromURLSpec(item.attachment.url);
            item.uploading.cancelFileUpload(window, file);
          }
        }
      },
    },
  },

  supportsCommand(aCommand) {
    return aCommand in this.commands;
  },

  isCommandEnabled(aCommand) {
    if (!this.supportsCommand(aCommand)) {
      return false;
    }
    return this.commands[aCommand].isEnabled();
  },

  doCommand(aCommand) {
    if (!this.supportsCommand(aCommand)) {
      return;
    }
    var cmd = this.commands[aCommand];
    if (!cmd.isEnabled()) {
      return;
    }
    cmd.doCommand();
  },

  onEvent(event) {},
};

/**
 * Start composing a new message.
 */
function goOpenNewMessage(aEvent) {
  // If aEvent is passed, check if Shift key was pressed for composition in
  // non-default format (HTML vs. plaintext).
  const msgCompFormat =
    aEvent && aEvent.shiftKey
      ? Ci.nsIMsgCompFormat.OppositeOfDefault
      : Ci.nsIMsgCompFormat.Default;

  MailServices.compose.OpenComposeWindow(
    null,
    null,
    null,
    Ci.nsIMsgCompType.New,
    msgCompFormat,
    gCurrentIdentity,
    null,
    null
  );
}

function QuoteSelectedMessage() {
  var selectedURIs = GetSelectedMessages();
  if (selectedURIs) {
    gMsgCompose.allowRemoteContent = false;
    for (let i = 0; i < selectedURIs.length; i++) {
      gMsgCompose.quoteMessage(selectedURIs[i]);
    }
  }
}

function GetSelectedMessages() {
  const mailWindow = Services.wm.getMostRecentWindow("mail:3pane");
  if (!mailWindow) {
    return null;
  }
  const tab = mailWindow.document.getElementById("tabmail").currentTabInfo;
  if (tab.mode.name == "mail3PaneTab" && tab.message) {
    return tab.chromeBrowser.contentWindow?.gDBView?.getURIsForSelection();
  } else if (tab.mode.name == "mailMessageTab") {
    return [tab.messageURI];
  }
  return null;
}

function SetupCommandUpdateHandlers() {
  top.controllers.appendController(defaultController);
  gAttachmentBucket.controllers.appendController(attachmentBucketController);

  document
    .getElementById("optionsMenuPopup")
    .addEventListener("popupshowing", updateOptionItems, true);
}

function UnloadCommandUpdateHandlers() {
  document
    .getElementById("optionsMenuPopup")
    .removeEventListener("popupshowing", updateOptionItems, true);

  gAttachmentBucket.controllers.removeController(attachmentBucketController);
  top.controllers.removeController(defaultController);
}

function CommandUpdate_MsgCompose() {
  var focusedWindow = top.document.commandDispatcher.focusedWindow;

  // we're just setting focus to where it was before
  if (focusedWindow == gLastWindowToHaveFocus) {
    return;
  }

  gLastWindowToHaveFocus = focusedWindow;
  updateComposeItems();
}

function findbarFindReplace() {
  focusMsgBody();
  const findbar = document.getElementById("FindToolbar");
  findbar.close();
  goDoCommand("cmd_findReplace");
  findbar.open();
}

function updateComposeItems() {
  try {
    // Edit Menu
    goUpdateCommand("cmd_rewrap");

    // Insert Menu
    if (gMsgCompose && gMsgCompose.composeHTML) {
      goUpdateCommand("cmd_renderedHTMLEnabler");
      goUpdateCommand("cmd_fontColor");
      goUpdateCommand("cmd_backgroundColor");
      goUpdateCommand("cmd_decreaseFontStep");
      goUpdateCommand("cmd_increaseFontStep");
      goUpdateCommand("cmd_bold");
      goUpdateCommand("cmd_italic");
      goUpdateCommand("cmd_underline");
      goUpdateCommand("cmd_removeStyles");
      goUpdateCommand("cmd_ul");
      goUpdateCommand("cmd_ol");
      goUpdateCommand("cmd_indent");
      goUpdateCommand("cmd_outdent");
      goUpdateCommand("cmd_align");
      goUpdateCommand("cmd_smiley");
    }

    // Options Menu
    goUpdateCommand("cmd_spelling");

    // Workaround to update 'Quote' toolbar button. (See bug 609926.)
    goUpdateCommand("cmd_quoteMessage");
    goUpdateCommand("cmd_toggleReturnReceipt");
  } catch (e) {}
}

/**
 * Disables or restores all toolbar items (menus/buttons) in the window.
 *
 * @param {boolean} disable - Meaning true = disable all items, false = restore
 *   items to the state stored before disabling them.
 */
function updateAllItems(disable) {
  for (const item of document.querySelectorAll(
    "menu, toolbarbutton, [command], [oncommand]"
  )) {
    if (disable) {
      // Disable all items
      item.setAttribute("stateBeforeSend", item.getAttribute("disabled"));
      item.setAttribute("disabled", "disabled");
    } else {
      // Restore initial state
      const stateBeforeSend = item.getAttribute("stateBeforeSend");
      if (stateBeforeSend == "disabled" || stateBeforeSend == "true") {
        item.setAttribute("disabled", stateBeforeSend);
      } else {
        item.removeAttribute("disabled");
      }
      item.removeAttribute("stateBeforeSend");
    }
  }
}

function InitFileSaveAsMenu() {
  document
    .getElementById("cmd_saveAsFile")
    .setAttribute("checked", defaultSaveOperation == "file");
  document
    .getElementById("cmd_saveAsDraft")
    .setAttribute("checked", defaultSaveOperation == "draft");
  document
    .getElementById("cmd_saveAsTemplate")
    .setAttribute("checked", defaultSaveOperation == "template");
}

function isSmimeSigningConfigured() {
  return !!gCurrentIdentity?.getUnicharAttribute("signing_cert_name");
}

function isSmimeEncryptionConfigured() {
  return !!gCurrentIdentity?.getUnicharAttribute("encryption_cert_name");
}

function isPgpConfigured() {
  return !!gCurrentIdentity?.getUnicharAttribute("openpgp_key_id");
}

function toggleGlobalSignMessage() {
  gSendSigned = !gSendSigned;
  gUserTouchedSendSigned = true;

  updateAttachMyPubKey();
  showSendEncryptedAndSigned();
}

function updateAttachMyPubKey() {
  if (!gUserTouchedAttachMyPubKey) {
    if (gSendSigned) {
      gAttachMyPublicPGPKey = gCurrentIdentity.attachPgpKey;
    } else {
      gAttachMyPublicPGPKey = false;
    }
  }
}

function removeAutoDisableNotification() {
  const notification = gComposeNotification.getNotificationWithValue(
    "e2eeDisableNotification"
  );
  if (notification) {
    gComposeNotification.removeNotification(notification);
  }
}

function toggleEncryptMessage() {
  gSendEncrypted = !gSendEncrypted;

  if (gSendEncrypted) {
    removeAutoDisableNotification();
  }

  gUserTouchedSendEncrypted = true;
  checkEncryptionState();
}

function toggleAttachMyPublicKey(target) {
  gAttachMyPublicPGPKey = target.getAttribute("checked") != "true";
  target.setAttribute("checked", gAttachMyPublicPGPKey);
  gUserTouchedAttachMyPubKey = true;
}

function updateEncryptedSubject() {
  const warnSubjectUnencrypted =
    (!gSelectedTechnologyIsPGP && gSendEncrypted) ||
    (isPgpConfigured() &&
      gSelectedTechnologyIsPGP &&
      gSendEncrypted &&
      !gEncryptSubject);

  document
    .getElementById("msgSubject")
    .classList.toggle("with-icon", warnSubjectUnencrypted);
  document.getElementById("msgEncryptedSubjectIcon").hidden =
    !warnSubjectUnencrypted;
}

function toggleEncryptedSubject() {
  gEncryptSubject = !gEncryptSubject;
  gUserTouchedEncryptSubject = true;
  updateEncryptedSubject();
}

/**
 * Update user interface elements
 *
 * @param {string} menu_id - suffix of the menu ID of the menu to update
 */
function setSecuritySettings(menu_id) {
  const encItem = document.getElementById("menu_securityEncrypt" + menu_id);
  encItem.setAttribute("checked", gSendEncrypted);

  let disableSig = false;
  let disableEnc = false;

  if (gSelectedTechnologyIsPGP) {
    if (!isPgpConfigured()) {
      disableSig = true;
      disableEnc = true;
    }
  } else {
    if (!isSmimeSigningConfigured()) {
      disableSig = true;
    }
    if (!isSmimeEncryptionConfigured()) {
      disableEnc = true;
    }
  }

  const sigItem = document.getElementById("menu_securitySign" + menu_id);
  sigItem.setAttribute("checked", gSendSigned && !disableSig);

  // The radio button to disable encryption is always active.
  // This is necessary, even if the current identity doesn't have
  // e2ee configured. If the user switches the sender identity of an
  // email, we might keep encryption enabled, to not surprise the user.
  // This means, we must always allow the user to disable encryption.
  encItem.disabled = disableEnc && !gSendEncrypted;

  sigItem.disabled = disableSig;

  const pgpItem = document.getElementById("encTech_OpenPGP" + menu_id);
  const smimeItem = document.getElementById("encTech_SMIME" + menu_id);

  smimeItem.disabled =
    !isSmimeSigningConfigured() && !isSmimeEncryptionConfigured();

  const encryptSubjectItem = document.getElementById(
    `menu_securityEncryptSubject${menu_id}`
  );

  pgpItem.setAttribute("checked", gSelectedTechnologyIsPGP);
  smimeItem.setAttribute("checked", !gSelectedTechnologyIsPGP);
  encryptSubjectItem.setAttribute(
    "checked",
    !disableEnc && gSelectedTechnologyIsPGP && gSendEncrypted && gEncryptSubject
  );
  encryptSubjectItem.setAttribute(
    "disabled",
    disableEnc || !gSelectedTechnologyIsPGP || !gSendEncrypted
  );

  document.getElementById("menu_recipientStatus" + menu_id).disabled =
    disableEnc;
  const manager = document.getElementById("menu_openManager" + menu_id);
  manager.disabled = disableEnc;
  manager.hidden = !gSelectedTechnologyIsPGP;
}

/**
 * Show the message security status based on the selected encryption technology.
 *
 * @param {boolean} [isSending=false] - If the key assistant was triggered
 *   during a sending attempt.
 */
function showMessageComposeSecurityStatus(isSending = false) {
  if (gSelectedTechnologyIsPGP) {
    gKeyAssistant.show(getEncryptionCompatibleRecipients(), isSending);
  } else {
    Recipients2CompFields(gMsgCompose.compFields);
    // Copy current flags to S/MIME composeSecure object.
    gMsgCompose.compFields.composeSecure.requireEncryptMessage = gSendEncrypted;
    gMsgCompose.compFields.composeSecure.signMessage = gSendSigned;
    window.openDialog(
      "chrome://messenger-smime/content/msgCompSecurityInfo.xhtml",
      "",
      "chrome,modal,resizable,centerscreen",
      {
        compFields: gMsgCompose.compFields,
        subject: document.getElementById("msgSubject").value,
        isSigningCertAvailable:
          gCurrentIdentity.getUnicharAttribute("signing_cert_name") != "",
        isEncryptionCertAvailable:
          gCurrentIdentity.getUnicharAttribute("encryption_cert_name") != "",
        currentIdentity: gCurrentIdentity,
        recipients: getEncryptionCompatibleRecipients(),
      }
    );
  }
}

function msgComposeContextOnShowing(event) {
  if (event.target.id != "msgComposeContext") {
    return;
  }

  // gSpellChecker handles all spell checking related to the context menu,
  // except whether or not spell checking is enabled. We need the editor's
  // spell checker for that.
  gSpellChecker.initFromRemote(
    nsContextMenu.contentData.spellInfo,
    nsContextMenu.contentData.actor.manager
  );

  const canSpell = gSpellChecker.canSpellCheck;
  const showDictionaries = canSpell && gSpellChecker.enabled;
  const onMisspelling = gSpellChecker.overMisspelling;
  const showUndo = canSpell && gSpellChecker.canUndo();

  document.getElementById("spellCheckSeparator").hidden = !canSpell;
  document.getElementById("spellCheckEnable").hidden = !canSpell;
  document
    .getElementById("spellCheckEnable")
    .setAttribute("checked", canSpell && gSpellCheckingEnabled);

  document.getElementById("spellCheckAddToDictionary").hidden = !onMisspelling;
  document.getElementById("spellCheckUndoAddToDictionary").hidden = !showUndo;
  document.getElementById("spellCheckIgnoreWord").hidden = !onMisspelling;

  // Suggestion list.
  document.getElementById("spellCheckSuggestionsSeparator").hidden =
    !onMisspelling && !showUndo;
  const separator = document.getElementById("spellCheckAddSep");
  separator.hidden = !onMisspelling;
  if (onMisspelling) {
    const addMenuItem = document.getElementById("spellCheckAddToDictionary");
    const suggestionCount = gSpellChecker.addSuggestionsToMenu(
      addMenuItem.parentNode,
      separator,
      nsContextMenu.contentData.spellInfo.spellSuggestions
    );
    document.getElementById("spellCheckNoSuggestions").hidden =
      !suggestionCount == 0;
  } else {
    document.getElementById("spellCheckNoSuggestions").hidden = !false;
  }

  // Dictionary list.
  document.getElementById("spellCheckDictionaries").hidden = !showDictionaries;
  if (canSpell) {
    const dictMenu = document.getElementById("spellCheckDictionariesMenu");
    const dictSep = document.getElementById("spellCheckLanguageSeparator");
    const count = gSpellChecker.addDictionaryListToMenu(dictMenu, dictSep);
    dictSep.hidden = count == 0;
    document.getElementById("spellCheckAddDictionariesMain").hidden = !false;
  } else if (this.onSpellcheckable) {
    // when there is no spellchecker but we might be able to spellcheck
    // add the add to dictionaries item. This will ensure that people
    // with no dictionaries will be able to download them
    document.getElementById("spellCheckLanguageSeparator").hidden =
      !showDictionaries;
    document.getElementById("spellCheckAddDictionariesMain").hidden =
      !showDictionaries;
  } else {
    document.getElementById("spellCheckAddDictionariesMain").hidden = !false;
  }

  updateEditItems();

  // The rest of this block sends menu information to WebExtensions.

  const editor = GetCurrentEditorElement();
  const target = editor.contentDocument.elementFromPoint(
    editor._contextX,
    editor._contextY
  );

  const selectionInfo = SelectionUtils.getSelectionDetails(window);
  const isContentSelected = !selectionInfo.docSelectionIsCollapsed;
  const textSelected = selectionInfo.text;
  const isTextSelected = !!textSelected.length;

  // Set up early the right flags for editable / not editable.
  const editFlags = SpellCheckHelper.isEditable(target, window);
  const onTextInput = (editFlags & SpellCheckHelper.TEXTINPUT) !== 0;
  const onEditable =
    (editFlags &
      (SpellCheckHelper.EDITABLE | SpellCheckHelper.CONTENTEDITABLE)) !==
    0;

  let onImage = false;
  let srcUrl = undefined;

  if (target.nodeType == Node.ELEMENT_NODE) {
    if (target instanceof Ci.nsIImageLoadingContent && target.currentURI) {
      onImage = true;
      srcUrl = target.currentURI.spec;
    }
  }

  let onLink = false;
  let linkText = undefined;
  let linkUrl = undefined;

  const link = target.closest("a");
  if (link) {
    onLink = true;
    linkText =
      link.textContent ||
      link.getAttribute("title") ||
      link.getAttribute("a") ||
      link.href ||
      "";
    linkUrl = link.href;
  }

  const subject = {
    menu: event.target,
    tab: window,
    isContentSelected,
    isTextSelected,
    onTextInput,
    onLink,
    onImage,
    onEditable,
    srcUrl,
    linkText,
    linkUrl,
    selectionText: isTextSelected ? selectionInfo.fullText : undefined,
    pageUrl: target.ownerGlobal.top.location.href,
    onComposeBody: true,
  };
  subject.context = subject;
  subject.wrappedJSObject = subject;

  Services.obs.notifyObservers(subject, "on-prepare-contextmenu");
  Services.obs.notifyObservers(subject, "on-build-contextmenu");
}

function msgComposeContextOnHiding(event) {
  if (event.target.id != "msgComposeContext") {
    return;
  }

  if (nsContextMenu.contentData.actor) {
    nsContextMenu.contentData.actor.hiding();
  }

  nsContextMenu.contentData = null;
  gSpellChecker.clearSuggestionsFromMenu();
  gSpellChecker.clearDictionaryListFromMenu();
  gSpellChecker.uninit();
}

function updateEditItems() {
  goUpdateCommand("cmd_paste");
  goUpdateCommand("cmd_pasteNoFormatting");
  goUpdateCommand("cmd_pasteQuote");
  goUpdateCommand("cmd_delete");
  goUpdateCommand("cmd_renameAttachment");
  goUpdateCommand("cmd_reorderAttachments");
  goUpdateCommand("cmd_selectAll");
  goUpdateCommand("cmd_openAttachment");
  goUpdateCommand("cmd_findReplace");
  goUpdateCommand("cmd_find");
  goUpdateCommand("cmd_findNext");
  goUpdateCommand("cmd_findPrev");
}

function updateViewItems() {
  goUpdateCommand("cmd_toggleAttachmentPane");
}

function updateOptionItems() {
  goUpdateCommand("cmd_quoteMessage");
  goUpdateCommand("cmd_toggleReturnReceipt");
}

function updateAttachmentItems() {
  goUpdateCommand("cmd_toggleAttachmentPane");
  goUpdateCommand("cmd_attachCloud");
  goUpdateCommand("cmd_convertCloud");
  goUpdateCommand("cmd_convertAttachment");
  goUpdateCommand("cmd_cancelUpload");
  goUpdateCommand("cmd_delete");
  goUpdateCommand("cmd_removeAllAttachments");
  goUpdateCommand("cmd_renameAttachment");
  updateReorderAttachmentsItems();
  goUpdateCommand("cmd_selectAll");
  goUpdateCommand("cmd_openAttachment");
  goUpdateCommand("cmd_attachVCard");
  goUpdateCommand("cmd_attachPublicKey");
}

function updateReorderAttachmentsItems() {
  goUpdateCommand("cmd_reorderAttachments");
  goUpdateCommand("cmd_moveAttachmentLeft");
  goUpdateCommand("cmd_moveAttachmentRight");
  goUpdateCommand("cmd_moveAttachmentBundleUp");
  goUpdateCommand("cmd_moveAttachmentBundleDown");
  goUpdateCommand("cmd_moveAttachmentTop");
  goUpdateCommand("cmd_moveAttachmentBottom");
  goUpdateCommand("cmd_sortAttachmentsToggle");
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
    goSetCommandEnabled(
      "cmd_sendButton",
      defaultController.isCommandEnabled("cmd_sendButton")
    );
    goSetCommandEnabled(
      "cmd_sendNow",
      defaultController.isCommandEnabled("cmd_sendNow")
    );
    goSetCommandEnabled(
      "cmd_sendLater",
      defaultController.isCommandEnabled("cmd_sendLater")
    );
    goSetCommandEnabled(
      "cmd_sendWithCheck",
      defaultController.isCommandEnabled("cmd_sendWithCheck")
    );
  }

  let changed = false;
  const currentStates = {};
  const changedStates = {};
  for (const state of ["cmd_sendNow", "cmd_sendLater"]) {
    currentStates[state] = defaultController.isCommandEnabled(state);
    if (
      !gLastKnownComposeStates.hasOwnProperty(state) ||
      gLastKnownComposeStates[state] != currentStates[state]
    ) {
      gLastKnownComposeStates[state] = currentStates[state];
      changedStates[state] = currentStates[state];
      changed = true;
    }
  }
  if (changed) {
    window.dispatchEvent(
      new CustomEvent("compose-state-changed", { detail: changedStates })
    );
  }
}

function addAttachCloudMenuItems(aParentMenu) {
  while (aParentMenu.hasChildNodes()) {
    aParentMenu.lastChild.remove();
  }

  for (const account of cloudFileAccounts.configuredAccounts) {
    if (
      aParentMenu.lastElementChild &&
      aParentMenu.lastElementChild.cloudFileUpload
    ) {
      aParentMenu.appendChild(document.createXULElement("menuseparator"));
    }

    const item = document.createXULElement("menuitem");
    const iconURL = account.iconURL;
    item.cloudFileAccount = account;
    item.setAttribute(
      "label",
      cloudFileAccounts.getDisplayName(account) + "\u2026"
    );
    if (iconURL) {
      item.setAttribute("class", `${item.localName}-iconic`);
      item.setAttribute("image", iconURL);
    }
    aParentMenu.appendChild(item);

    const previousUploads = account.getPreviousUploads();
    const addedFiles = [];
    for (const upload of previousUploads) {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(upload.path);

      // TODO: Figure out how to handle files that no longer exist on the filesystem.
      if (!file.exists()) {
        continue;
      }
      if (!addedFiles.find(f => f.name == upload.name || f.url == upload.url)) {
        const fileItem = document.createXULElement("menuitem");
        fileItem.cloudFileUpload = upload;
        fileItem.cloudFileAccount = account;
        fileItem.setAttribute("label", upload.name);
        fileItem.setAttribute("class", "menuitem-iconic");
        fileItem.setAttribute("image", "moz-icon://" + upload.name);
        aParentMenu.appendChild(fileItem);
        addedFiles.push({ name: upload.name, url: upload.url });
      }
    }
  }
}

function addConvertCloudMenuItems(aParentMenu, aAfterNodeId, aRadioGroup) {
  const afterNode = document.getElementById(aAfterNodeId);
  while (afterNode.nextElementSibling) {
    afterNode.nextElementSibling.remove();
  }

  if (!gAttachmentBucket.selectedItem.sendViaCloud) {
    const item = document.getElementById(
      "convertCloudMenuItems_popup_convertAttachment"
    );
    item.setAttribute("checked", "true");
  }

  for (const account of cloudFileAccounts.configuredAccounts) {
    const item = document.createXULElement("menuitem");
    const iconURL = account.iconURL;
    item.cloudFileAccount = account;
    item.setAttribute("label", cloudFileAccounts.getDisplayName(account));
    item.setAttribute("type", "radio");
    item.setAttribute("name", aRadioGroup);

    if (
      gAttachmentBucket.selectedItem.cloudFileAccount &&
      gAttachmentBucket.selectedItem.cloudFileAccount.accountKey ==
        account.accountKey
    ) {
      item.setAttribute("checked", "true");
    } else if (iconURL) {
      item.setAttribute("class", "menu-iconic");
      item.setAttribute("image", iconURL);
    }

    aParentMenu.appendChild(item);
  }

  // Check if the cloudFile has an invalid account and deselect the default
  // option, allowing to convert it back to a regular file.
  if (
    gAttachmentBucket.selectedItem.attachment.sendViaCloud &&
    !gAttachmentBucket.selectedItem.cloudFileAccount
  ) {
    const regularItem = document.getElementById(
      "convertCloudMenuItems_popup_convertAttachment"
    );
    regularItem.removeAttribute("checked");
  }
}

async function updateAttachmentItemProperties(attachmentItem) {
  // FIXME: The UI logic should be handled by the attachment list or item
  // itself.
  if (attachmentItem.uploading) {
    // uploading/renaming
    attachmentItem.setAttribute(
      "tooltiptext",
      getComposeBundle().getFormattedString("cloudFileUploadingTooltip", [
        cloudFileAccounts.getDisplayName(attachmentItem.uploading),
      ])
    );
    gAttachmentBucket.setCloudIcon(attachmentItem, "");
  } else if (attachmentItem.attachment.sendViaCloud) {
    const [tooltipUnknownAccountText, introText, titleText] =
      await document.l10n.formatValues([
        "cloud-file-unknown-account-tooltip",
        {
          id: "cloud-file-placeholder-intro",
          args: { filename: attachmentItem.attachment.name },
        },
        {
          id: "cloud-file-placeholder-title",
          args: { filename: attachmentItem.attachment.name },
        },
      ]);

    // uploaded
    let tooltiptext;
    if (attachmentItem.cloudFileAccount) {
      tooltiptext = getComposeBundle().getFormattedString(
        "cloudFileUploadedTooltip",
        [cloudFileAccounts.getDisplayName(attachmentItem.cloudFileAccount)]
      );
    } else {
      tooltiptext = tooltipUnknownAccountText;
    }
    attachmentItem.setAttribute("tooltiptext", tooltiptext);

    gAttachmentBucket.setAttachmentName(
      attachmentItem,
      attachmentItem.attachment.name
    );
    gAttachmentBucket.setCloudIcon(
      attachmentItem,
      attachmentItem.cloudFileUpload.serviceIcon
    );

    // Update the CloudPartHeaderData, if there is a valid cloudFileUpload.
    if (attachmentItem.cloudFileUpload) {
      const json = JSON.stringify(attachmentItem.cloudFileUpload);
      // Convert 16bit JavaScript string to a byteString, to make it work with
      // btoa().
      attachmentItem.attachment.cloudPartHeaderData = btoa(
        MailStringUtils.stringToByteString(json)
      );
    }

    // Update the cloudFile placeholder file.
    attachmentItem.attachment.htmlAnnotation = `<!DOCTYPE html>
<html>
 <head>
  <title>${titleText}</title>
  <meta charset="utf-8" />
 </head>
 <body>
  <div style="padding: 15px; font-family: Calibri, sans-serif;">
   <div style="margin-bottom: 15px;" id="cloudAttachmentListHeader">${introText}</div>
   <ul>${
     (
       await gCloudAttachmentLinkManager._createNode(
         document,
         attachmentItem.cloudFileUpload,
         true
       )
     ).outerHTML
   }</ul>
  </div>
 </body>
</html>`;

    // Calculate size of placeholder attachment.
    attachmentItem.cloudHtmlFileSize = new TextEncoder().encode(
      attachmentItem.attachment.htmlAnnotation
    ).length;
  } else {
    // local
    attachmentItem.setAttribute("tooltiptext", attachmentItem.attachment.url);
    gAttachmentBucket.setAttachmentName(
      attachmentItem,
      attachmentItem.attachment.name
    );
    gAttachmentBucket.setCloudIcon(attachmentItem, "");

    // Remove placeholder file size information.
    delete attachmentItem.cloudHtmlFileSize;
  }
  updateAttachmentPane();
}

async function showLocalizedCloudFileAlert(
  ex,
  provider = ex.cloudProvider,
  filename = ex.cloudFileName
) {
  const bundle = getComposeBundle();
  let localizedTitle, localizedMessage;

  switch (ex.result) {
    case cloudFileAccounts.constants.uploadCancelled:
      // No alerts for cancelled uploads.
      return;
    case cloudFileAccounts.constants.deleteErr:
      localizedTitle = bundle.getString("errorCloudFileDeletion.title");
      localizedMessage = bundle.getFormattedString(
        "errorCloudFileDeletion.message",
        [provider, filename]
      );
      break;
    case cloudFileAccounts.constants.offlineErr:
      localizedTitle = await l10nCompose.formatValue(
        "cloud-file-connection-error-title"
      );
      localizedMessage = await l10nCompose.formatValue(
        "cloud-file-connection-error",
        {
          provider,
        }
      );
      break;
    case cloudFileAccounts.constants.authErr:
      localizedTitle = bundle.getString("errorCloudFileAuth.title");
      localizedMessage = bundle.getFormattedString(
        "errorCloudFileAuth.message",
        [provider]
      );
      break;
    case cloudFileAccounts.constants.uploadErrWithCustomMessage:
      localizedTitle = await l10nCompose.formatValue(
        "cloud-file-upload-error-with-custom-message-title",
        {
          provider,
          filename,
        }
      );
      localizedMessage = ex.message;
      break;
    case cloudFileAccounts.constants.uploadErr:
      localizedTitle = bundle.getString("errorCloudFileUpload.title");
      localizedMessage = bundle.getFormattedString(
        "errorCloudFileUpload.message",
        [provider, filename]
      );
      break;
    case cloudFileAccounts.constants.uploadWouldExceedQuota:
      localizedTitle = bundle.getString("errorCloudFileQuota.title");
      localizedMessage = bundle.getFormattedString(
        "errorCloudFileQuota.message",
        [provider, filename]
      );
      break;
    case cloudFileAccounts.constants.uploadExceedsFileLimit:
      localizedTitle = bundle.getString("errorCloudFileLimit.title");
      localizedMessage = bundle.getFormattedString(
        "errorCloudFileLimit.message",
        [provider, filename]
      );
      break;
    case cloudFileAccounts.constants.renameNotSupported:
      localizedTitle = await l10nCompose.formatValue(
        "cloud-file-rename-error-title"
      );
      localizedMessage = await l10nCompose.formatValue(
        "cloud-file-rename-not-supported",
        {
          provider,
        }
      );
      break;
    case cloudFileAccounts.constants.renameErrWithCustomMessage:
      localizedTitle = await l10nCompose.formatValue(
        "cloud-file-rename-error-with-custom-message-title",
        {
          provider,
          filename,
        }
      );
      localizedMessage = ex.message;
      break;
    case cloudFileAccounts.constants.renameErr:
      localizedTitle = await l10nCompose.formatValue(
        "cloud-file-rename-error-title"
      );
      localizedMessage = await l10nCompose.formatValue(
        "cloud-file-rename-error",
        {
          provider,
          filename,
        }
      );
      break;
    case cloudFileAccounts.constants.attachmentErr:
      localizedTitle = await l10nCompose.formatValue(
        "cloud-file-attachment-error-title"
      );
      localizedMessage = await l10nCompose.formatValue(
        "cloud-file-attachment-error",
        {
          filename,
        }
      );
      break;
    case cloudFileAccounts.constants.accountErr:
      localizedTitle = await l10nCompose.formatValue(
        "cloud-file-account-error-title"
      );
      localizedMessage = await l10nCompose.formatValue(
        "cloud-file-account-error",
        {
          filename,
        }
      );
      break;
    default:
      localizedTitle = bundle.getString("errorCloudFileOther.title");
      localizedMessage = bundle.getFormattedString(
        "errorCloudFileOther.message",
        [provider]
      );
  }

  Services.prompt.alert(window, localizedTitle, localizedMessage);
}

/**
 * @typedef UpdateSettings
 * @property {CloudFileAccount} [cloudFileAccount] - cloud file account to store
 *   the attachment
 * @property {CloudFileUpload} [relatedCloudFileUpload] - information about an
 *   already uploaded file this upload is related to, e.g. renaming a repeatedly
 *   used cloud file or updating the content of a cloud file
 * @property {nsIFile} [file] - file to replace the current attachments content
 * @property {string} [name] - name to replace the current attachments name
 */

/**
 * Update the name and or the content of an attachment, as well as its local/cloud
 * state.
 *
 * @param {DOMNode} attachmentItem - the existing attachmentItem
 * @param {UpdateSettings} [updateSettings] - object defining how to update the
 *   attachment
 */
async function UpdateAttachment(attachmentItem, updateSettings = {}) {
  if (!attachmentItem || !attachmentItem.attachment) {
    throw new Error("Unexpected: Invalid attachment item.");
  }

  const originalAttachment = Object.assign({}, attachmentItem.attachment);
  let eventOnDone = false;

  // Ignore empty or falsy names.
  const name = updateSettings.name || attachmentItem.attachment.name;

  const destCloudFileAccount = updateSettings.hasOwnProperty("cloudFileAccount")
    ? updateSettings.cloudFileAccount
    : attachmentItem.cloudFileAccount;

  try {
    if (
      // Bypass upload and set provided relatedCloudFileUpload.
      updateSettings.relatedCloudFileUpload &&
      updateSettings.cloudFileAccount &&
      updateSettings.cloudFileAccount.reuseUploads &&
      !updateSettings.file &&
      !updateSettings.name
    ) {
      attachmentItem.attachment.sendViaCloud = true;
      attachmentItem.attachment.contentLocation =
        updateSettings.relatedCloudFileUpload.url;
      attachmentItem.attachment.cloudFileAccountKey =
        updateSettings.cloudFileAccount.accountKey;

      attachmentItem.cloudFileAccount = updateSettings.cloudFileAccount;
      attachmentItem.cloudFileUpload = updateSettings.relatedCloudFileUpload;
      gAttachmentBucket.setCloudIcon(
        attachmentItem,
        updateSettings.relatedCloudFileUpload.serviceIcon
      );

      eventOnDone = new CustomEvent("attachment-uploaded", {
        bubbles: true,
        cancelable: true,
      });
    } else if (
      // Handle a local -> local replace/rename.
      !attachmentItem.attachment.sendViaCloud &&
      !updateSettings.hasOwnProperty("cloudFileAccount")
    ) {
      // Both modes - rename and replace - require the same UI handling.
      eventOnDone = new CustomEvent("attachment-renamed", {
        bubbles: true,
        cancelable: true,
        detail: originalAttachment,
      });
    } else if (
      // Handle a cloud -> local conversion.
      attachmentItem.attachment.sendViaCloud &&
      updateSettings.cloudFileAccount === null
    ) {
      // Throw if the linked local file does not exists (i.e. invalid draft).
      if (!(await IOUtils.exists(attachmentItem.cloudFileUpload.path))) {
        throw Components.Exception(
          `CloudFile Error: Attachment file not found: ${attachmentItem.cloudFileUpload.path}`,
          cloudFileAccounts.constants.attachmentErr
        );
      }

      if (attachmentItem.cloudFileAccount) {
        // A cloud delete error is not considered to be a fatal error. It is
        // not preventing the attachment from being removed from the composer.
        attachmentItem.cloudFileAccount
          .deleteFile(window, attachmentItem.cloudFileUpload.id)
          .catch(ex => console.warn(ex.message));
      }
      // Clean up attachment from cloud bits.
      attachmentItem.attachment.sendViaCloud = false;
      attachmentItem.attachment.htmlAnnotation = "";
      attachmentItem.attachment.contentLocation = "";
      attachmentItem.attachment.cloudFileAccountKey = "";
      attachmentItem.attachment.cloudPartHeaderData = "";
      delete attachmentItem.cloudFileAccount;
      delete attachmentItem.cloudFileUpload;

      eventOnDone = new CustomEvent("attachment-converted-to-regular", {
        bubbles: true,
        cancelable: true,
        detail: originalAttachment,
      });
    } else if (
      // Exit early if offline.
      Services.io.offline
    ) {
      throw Components.Exception(
        "Connection error: Offline",
        cloudFileAccounts.constants.offlineErr
      );
    } else {
      // Handle a cloud -> cloud move/rename or a local -> cloud upload.
      const fileHandler = Services.io
        .getProtocolHandler("file")
        .QueryInterface(Ci.nsIFileProtocolHandler);

      let mode = "upload";
      if (attachmentItem.attachment.sendViaCloud) {
        // Throw if the used cloudFile account does not exists (invalid draft,
        // disabled add-on, removed account).
        if (
          !destCloudFileAccount ||
          !cloudFileAccounts.getAccount(destCloudFileAccount.accountKey)
        ) {
          throw Components.Exception(
            `CloudFile Error: Account not found: ${destCloudFileAccount?.accountKey}`,
            cloudFileAccounts.constants.accountErr
          );
        }

        if (
          attachmentItem.cloudFileUpload &&
          attachmentItem.cloudFileAccount == destCloudFileAccount &&
          !updateSettings.file &&
          !destCloudFileAccount.isReusedUpload(attachmentItem.cloudFileUpload)
        ) {
          mode = "rename";
        } else {
          mode = "move";
          // Throw if the linked local file does not exists (invalid draft, removed
          // local file).
          if (
            !fileHandler
              .getFileFromURLSpec(attachmentItem.attachment.url)
              .exists()
          ) {
            throw Components.Exception(
              `CloudFile Error: Attachment file not found: ${
                fileHandler.getFileFromURLSpec(attachmentItem.attachment.url)
                  .path
              }`,
              cloudFileAccounts.constants.attachmentErr
            );
          }
          if (!(await IOUtils.exists(attachmentItem.cloudFileUpload.path))) {
            throw Components.Exception(
              `CloudFile Error: Attachment file not found: ${attachmentItem.cloudFileUpload.path}`,
              cloudFileAccounts.constants.attachmentErr
            );
          }
        }
      }

      // Notify the UI that we're starting the upload process: disable send commands
      // and show a "connecting" icon for the attachment.
      gNumUploadingAttachments++;
      updateSendCommands(true);

      attachmentItem.uploading = destCloudFileAccount;
      await updateAttachmentItemProperties(attachmentItem);

      const eventsOnStart = {
        upload: "attachment-uploading",
        move: "attachment-moving",
      };
      if (eventsOnStart[mode]) {
        attachmentItem.dispatchEvent(
          new CustomEvent(eventsOnStart[mode], {
            bubbles: true,
            cancelable: true,
            detail: attachmentItem.attachment,
          })
        );
      }

      try {
        let upload;
        if (mode == "rename") {
          upload = await destCloudFileAccount.renameFile(
            window,
            attachmentItem.cloudFileUpload.id,
            name
          );
        } else {
          const file =
            updateSettings.file ||
            fileHandler.getFileFromURLSpec(attachmentItem.attachment.url);

          upload = await destCloudFileAccount.uploadFile(
            window,
            file,
            name,
            updateSettings.relatedCloudFileUpload
          );

          attachmentItem.cloudFileAccount = destCloudFileAccount;
          attachmentItem.attachment.sendViaCloud = true;
          attachmentItem.attachment.cloudFileAccountKey =
            destCloudFileAccount.accountKey;

          Services.telemetry.keyedScalarAdd(
            "tb.filelink.uploaded_size",
            destCloudFileAccount.type,
            file.fileSize
          );
        }

        attachmentItem.cloudFileUpload = upload;
        attachmentItem.attachment.contentLocation = upload.url;

        const eventsOnSuccess = {
          upload: "attachment-uploaded",
          move: "attachment-moved",
          rename: "attachment-renamed",
        };
        if (eventsOnSuccess[mode]) {
          eventOnDone = new CustomEvent(eventsOnSuccess[mode], {
            bubbles: true,
            cancelable: true,
            detail: originalAttachment,
          });
        }
      } catch (ex) {
        const eventsOnFailure = {
          upload: "attachment-upload-failed",
          move: "attachment-move-failed",
        };
        if (eventsOnFailure[mode]) {
          eventOnDone = new CustomEvent(eventsOnFailure[mode], {
            bubbles: true,
            cancelable: true,
            detail: ex.result,
          });
        }
        throw ex;
      } finally {
        attachmentItem.uploading = false;
        gNumUploadingAttachments--;
        updateSendCommands(true);
      }
    }

    // Update the local attachment.
    if (updateSettings.file) {
      const attachment = FileToAttachment(updateSettings.file);
      attachmentItem.attachment.size = attachment.size;
      attachmentItem.attachment.url = attachment.url;
    }
    attachmentItem.attachment.name = name;

    AttachmentsChanged();
    // Update cmd_sortAttachmentsToggle because replacing/renaming may change the
    // current sort order.
    goUpdateCommand("cmd_sortAttachmentsToggle");
  } catch (ex) {
    // Attach provider and fileName to the Exception, so showLocalizedCloudFileAlert()
    // can display the proper alert message.
    ex.cloudProvider = destCloudFileAccount
      ? cloudFileAccounts.getDisplayName(destCloudFileAccount)
      : "";
    ex.cloudFileName = originalAttachment?.name || name;
    throw ex;
  } finally {
    await updateAttachmentItemProperties(attachmentItem);
    if (eventOnDone) {
      attachmentItem.dispatchEvent(eventOnDone);
    }
  }
}

function attachToCloud(event) {
  gMsgCompose.allowRemoteContent = true;
  if (event.target.cloudFileUpload) {
    attachToCloudRepeat(
      event.target.cloudFileUpload,
      event.target.cloudFileAccount
    );
  } else {
    attachToCloudNew(event.target.cloudFileAccount);
  }
  event.stopPropagation();
}

/**
 * Attach a file that has already been uploaded to a cloud provider.
 *
 * @param {object} upload - the cloudFileUpload of the already uploaded file
 * @param {object} account - the cloudFileAccount of the already uploaded file
 */
async function attachToCloudRepeat(upload, account) {
  gMsgCompose.allowRemoteContent = true;
  const file = FileUtils.File(upload.path);
  const attachment = FileToAttachment(file);
  attachment.name = upload.name;

  const addedAttachmentItems = await AddAttachments([attachment]);
  if (addedAttachmentItems.length > 0) {
    try {
      await UpdateAttachment(addedAttachmentItems[0], {
        cloudFileAccount: account,
        relatedCloudFileUpload: upload,
      });
    } catch (ex) {
      showLocalizedCloudFileAlert(ex);
    }
  }
}

/**
 * Prompt the user for a list of files to attach via a cloud provider.
 *
 * @param aAccount the cloud provider to upload the files to
 */
async function attachToCloudNew(aAccount) {
  // We need to let the user pick local file(s) to upload to the cloud and
  // gather url(s) to those files.
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  fp.init(
    window,
    getComposeBundle().getFormattedString("chooseFileToAttachViaCloud", [
      cloudFileAccounts.getDisplayName(aAccount),
    ]),
    Ci.nsIFilePicker.modeOpenMultiple
  );

  var lastDirectory = GetLastAttachDirectory();
  if (lastDirectory) {
    fp.displayDirectory = lastDirectory;
  }

  fp.appendFilters(Ci.nsIFilePicker.filterAll);

  const rv = await new Promise(resolve => fp.open(resolve));
  if (rv != Ci.nsIFilePicker.returnOK || !fp.files) {
    return;
  }

  const files = [...fp.files];
  const attachments = files.map(f => FileToAttachment(f));
  const addedAttachmentItems = await AddAttachments(attachments);
  SetLastAttachDirectory(files[files.length - 1]);

  const promises = [];
  for (const attachmentItem of addedAttachmentItems) {
    promises.push(
      UpdateAttachment(attachmentItem, { cloudFileAccount: aAccount }).catch(
        ex => {
          RemoveAttachments([attachmentItem]);
          showLocalizedCloudFileAlert(ex);
        }
      )
    );
  }

  await Promise.all(promises);
}

/**
 * Convert an array of attachments to cloud attachments.
 *
 * @param aItems an array of <attachmentitem>s containing the attachments in
 *        question
 * @param aAccount the cloud account to upload the files to
 */
async function convertListItemsToCloudAttachment(aItems, aAccount) {
  gMsgCompose.allowRemoteContent = true;
  const promises = [];
  for (const item of aItems) {
    // Bail out, if we would convert to the current account.
    if (
      item.attachment.sendViaCloud &&
      item.cloudFileAccount &&
      item.cloudFileAccount == aAccount
    ) {
      continue;
    }
    promises.push(
      UpdateAttachment(item, { cloudFileAccount: aAccount }).catch(
        showLocalizedCloudFileAlert
      )
    );
  }
  await Promise.all(promises);
}

/**
 * Convert the selected attachments to cloud attachments.
 *
 * @param aAccount the cloud account to upload the files to
 */
function convertSelectedToCloudAttachment(aAccount) {
  convertListItemsToCloudAttachment(
    [...gAttachmentBucket.selectedItems],
    aAccount
  );
}

/**
 * Convert an array of nsIMsgAttachments to cloud attachments.
 *
 * @param aAttachments an array of nsIMsgAttachments
 * @param aAccount the cloud account to upload the files to
 */
function convertToCloudAttachment(aAttachments, aAccount) {
  const items = [];
  for (const attachment of aAttachments) {
    const item = gAttachmentBucket.findItemForAttachment(attachment);
    if (item) {
      items.push(item);
    }
  }

  convertListItemsToCloudAttachment(items, aAccount);
}

/**
 * Convert an array of attachments to regular (non-cloud) attachments.
 *
 * @param aItems an array of <attachmentitem>s containing the attachments in
 *        question
 */
async function convertListItemsToRegularAttachment(aItems) {
  const promises = [];
  for (const item of aItems) {
    if (!item.attachment.sendViaCloud) {
      continue;
    }
    promises.push(
      UpdateAttachment(item, { cloudFileAccount: null }).catch(
        showLocalizedCloudFileAlert
      )
    );
  }
  await Promise.all(promises);
}

/**
 * Convert the selected attachments to regular (non-cloud) attachments.
 */
function convertSelectedToRegularAttachment() {
  return convertListItemsToRegularAttachment([
    ...gAttachmentBucket.selectedItems,
  ]);
}

/**
 * Convert an array of nsIMsgAttachments to regular (non-cloud) attachments.
 *
 * @param aAttachments an array of nsIMsgAttachments
 */
function convertToRegularAttachment(aAttachments) {
  const items = [];
  for (const attachment of aAttachments) {
    const item = gAttachmentBucket.findItemForAttachment(attachment);
    if (item) {
      items.push(item);
    }
  }

  return convertListItemsToRegularAttachment(items);
}

/* messageComposeOfflineQuitObserver is notified whenever the network
 * connection status has switched to offline, or when the application
 * has received a request to quit.
 */
var messageComposeOfflineQuitObserver = {
  observe(aSubject, aTopic, aData) {
    // sanity checks
    if (aTopic == "network:offline-status-changed") {
      MessageComposeOfflineStateChanged(Services.io.offline);
    } else if (
      aTopic == "quit-application-requested" &&
      aSubject instanceof Ci.nsISupportsPRBool &&
      !aSubject.data
    ) {
      // Check whether to veto the quit request
      // (unless another observer already did).
      aSubject.data = !ComposeCanClose();
    }
  },
};

function AddMessageComposeOfflineQuitObserver() {
  Services.obs.addObserver(
    messageComposeOfflineQuitObserver,
    "network:offline-status-changed"
  );
  Services.obs.addObserver(
    messageComposeOfflineQuitObserver,
    "quit-application-requested"
  );

  // set the initial state of the send button
  MessageComposeOfflineStateChanged(Services.io.offline);
}

function RemoveMessageComposeOfflineQuitObserver() {
  Services.obs.removeObserver(
    messageComposeOfflineQuitObserver,
    "network:offline-status-changed"
  );
  Services.obs.removeObserver(
    messageComposeOfflineQuitObserver,
    "quit-application-requested"
  );
}

function MessageComposeOfflineStateChanged(goingOffline) {
  try {
    var sendButton = document.getElementById("button-send");
    var sendNowMenuItem = document.getElementById("menu-item-send-now");

    if (!gSavedSendNowKey) {
      gSavedSendNowKey = sendNowMenuItem.getAttribute("key");
    }

    // don't use goUpdateCommand here ... the defaultController might not be installed yet
    updateSendCommands(false);

    if (goingOffline) {
      sendButton.label = sendButton.getAttribute("later_label");
      sendButton.setAttribute(
        "tooltiptext",
        sendButton.getAttribute("later_tooltiptext")
      );
      sendNowMenuItem.removeAttribute("key");
    } else {
      sendButton.label = sendButton.getAttribute("now_label");
      sendButton.setAttribute(
        "tooltiptext",
        sendButton.getAttribute("now_tooltiptext")
      );
      if (gSavedSendNowKey) {
        sendNowMenuItem.setAttribute("key", gSavedSendNowKey);
      }
    }
  } catch (e) {}
}

function DoCommandPrint() {
  const browser = GetCurrentEditorElement();
  browser.contentDocument.title =
    document.getElementById("msgSubject").value.trim() ||
    getComposeBundle().getString("defaultSubject");
  PrintUtils.startPrintWindow(browser.browsingContext, {});
}

/**
 * Locks/Unlocks the window widgets while a message is being saved/sent.
 * Locking means to disable all possible items in the window so that
 * the user can't click/activate anything.
 *
 * @param aDisable  true = lock the window. false = unlock the window.
 */
function ToggleWindowLock(aDisable) {
  if (aDisable) {
    // Save the active element so we can focus it again.
    ToggleWindowLock.activeElement = document.activeElement;
  }
  gWindowLocked = aDisable;
  updateAllItems(aDisable);
  updateEditableFields(aDisable);
  if (!aDisable) {
    updateComposeItems();
    // Refocus what had focus when the lock began.
    ToggleWindowLock.activeElement?.focus();
  }
}

/* This function will go away soon as now arguments are passed to the window using a object of type nsMsgComposeParams instead of a string */
function GetArgs(originalData) {
  var args = {};

  if (originalData == "") {
    return null;
  }

  var data = "";
  var separator = String.fromCharCode(1);

  var quoteChar = "";
  var prevChar = "";
  var nextChar = "";
  for (let i = 0; i < originalData.length; i++, prevChar = aChar) {
    var aChar = originalData.charAt(i);
    var aCharCode = originalData.charCodeAt(i);
    if (i < originalData.length - 1) {
      nextChar = originalData.charAt(i + 1);
    } else {
      nextChar = "";
    }

    if (aChar == quoteChar && (nextChar == "," || nextChar == "")) {
      quoteChar = "";
      data += aChar;
    } else if ((aCharCode == 39 || aCharCode == 34) && prevChar == "=") {
      // quote or double quote
      if (quoteChar == "") {
        quoteChar = aChar;
      }
      data += aChar;
    } else if (aChar == ",") {
      if (quoteChar == "") {
        data += separator;
      } else {
        data += aChar;
      }
    } else {
      data += aChar;
    }
  }

  var pairs = data.split(separator);
  // dump("Compose: argument: {" + data + "}\n");

  for (let i = pairs.length - 1; i >= 0; i--) {
    var pos = pairs[i].indexOf("=");
    if (pos == -1) {
      continue;
    }
    var argname = pairs[i].substring(0, pos);
    var argvalue = pairs[i].substring(pos + 1);
    if (argvalue.startsWith("'") && argvalue.endsWith("'")) {
      args[argname] = argvalue.substring(1, argvalue.length - 1);
    } else {
      try {
        args[argname] = decodeURIComponent(argvalue);
      } catch (e) {
        args[argname] = argvalue;
      }
    }
    // dump("[" + argname + "=" + args[argname] + "]\n");
  }
  return args;
}

function ComposeFieldsReady() {
  // If we are in plain text, we need to set the wrap column
  if (!gMsgCompose.composeHTML) {
    try {
      gMsgCompose.editor.QueryInterface(Ci.nsIEditorMailSupport).wrapWidth =
        gMsgCompose.wrapLength;
    } catch (e) {
      dump("### textEditor.wrapWidth exception text: " + e + " - failed\n");
    }
  }

  CompFields2Recipients(gMsgCompose.compFields);
  SetComposeWindowTitle();
  updateEditableFields(false);
  gLoadingComplete = true;

  // Set up observers to recheck limit and encyption on recipients change.
  observeRecipientsChange();

  // Perform the initial checks.
  checkPublicRecipientsLimit();
  checkEncryptionState();
}

/**
 * Set up observers to recheck limit and encyption on recipients change.
 */
function observeRecipientsChange() {
  // Observe childList changes of `To` and `Cc` address rows to check if we need
  // to show the public bulk recipients notification according to the threshold.
  // So far we're only counting recipient pills, not plain text addresses.
  gRecipientObserver = new MutationObserver(function (mutations) {
    if (mutations.some(m => m.type == "childList")) {
      checkPublicRecipientsLimit();
    }
  });
  gRecipientObserver.observe(document.getElementById("toAddrContainer"), {
    childList: true,
  });
  gRecipientObserver.observe(document.getElementById("ccAddrContainer"), {
    childList: true,
  });

  function callCheckEncryptionState() {
    // We must not pass the parameters that we get from observing.
    checkEncryptionState();
  }

  gRecipientKeysObserver = new MutationObserver(callCheckEncryptionState);
  gRecipientKeysObserver.observe(document.getElementById("toAddrContainer"), {
    childList: true,
  });
  gRecipientKeysObserver.observe(document.getElementById("ccAddrContainer"), {
    childList: true,
  });
  gRecipientKeysObserver.observe(document.getElementById("bccAddrContainer"), {
    childList: true,
  });
}

// checks if the passed in string is a mailto url, if it is, generates nsIMsgComposeParams
// for the url and returns them.
function handleMailtoArgs(mailtoUrl) {
  // see if the string is a mailto url....do this by checking the first 7 characters of the string
  if (mailtoUrl.toLowerCase().startsWith("mailto:")) {
    // if it is a mailto url, turn the mailto url into a MsgComposeParams object....
    const uri = Services.io.newURI(mailtoUrl);

    if (uri) {
      return MailServices.compose.getParamsForMailto(uri);
    }
  }

  return null;
}

/**
 * Handle ESC keypress from composition window for
 * notifications with close button in the
 * attachmentNotificationBox.
 */
function handleEsc() {
  const activeElement = document.activeElement;

  if (activeElement.id == "messageEditor") {
    // Focus within the message body.
    const findbar = document.getElementById("FindToolbar");
    if (!findbar.hidden) {
      // If findbar is visible hide it.
      // Focus on the findbar is handled by findbar itself.
      findbar.close();
    } else {
      // Close the most recently shown notification.
      gComposeNotification.currentNotification?.close();
    }
    return;
  }

  // If focus is within a notification, close the corresponding notification.
  for (const notification of gComposeNotification.allNotifications) {
    if (notification.contains(activeElement)) {
      notification.close();
      return;
    }
  }
}

/**
 * This state machine manages all showing and hiding of the attachment
 * notification bar. It is only called if any change happened so that
 * recalculating of the notification is needed:
 * - keywords changed
 * - manual reminder was toggled
 * - attachments changed
 * - manual reminder is disabled
 *
 * It does not track whether the notification is still up when it should be.
 * That allows the user to close it any time without this function showing
 * it again.
 * We ensure notification is only shown on right events, e.g. only when we have
 * keywords and attachments were removed (but not when we have keywords and
 * manual reminder was just turned off). We always show the notification
 * again if keywords change (if no attachments and no manual reminder).
 *
 * @param aForce  If set to true, notification will be shown immediately if
 *                there are any keywords. If set to false, it is shown only when
 *                they have changed.
 */
function manageAttachmentNotification(aForce = false) {
  let keywords;
  let keywordsCount = 0;

  // First see if the notification is to be hidden due to reasons other than
  // not having keywords.
  let removeNotification = attachmentNotificationSupressed();

  // If that is not true, we need to look at the state of keywords.
  if (!removeNotification) {
    if (attachmentWorker.lastMessage) {
      // We know the state of keywords, so process them.
      if (attachmentWorker.lastMessage.length) {
        keywords = attachmentWorker.lastMessage.join(", ");
        keywordsCount = attachmentWorker.lastMessage.length;
      }
      removeNotification = keywordsCount == 0;
    } else {
      // We don't know keywords, so get them first.
      // If aForce was true, and some keywords are found, we get to run again from
      // attachmentWorker.onmessage().
      gAttachmentNotifier.redetectKeywords(aForce);
      return;
    }
  }

  let notification =
    gComposeNotification.getNotificationWithValue("attachmentReminder");
  if (removeNotification) {
    if (notification) {
      gComposeNotification.removeNotification(notification);
    }
    return;
  }

  // We have some keywords, however only pop up the notification if requested
  // to do so.
  if (!aForce) {
    return;
  }

  let textValue = getComposeBundle().getString(
    "attachmentReminderKeywordsMsgs"
  );
  textValue = PluralForm.get(keywordsCount, textValue).replace(
    "#1",
    keywordsCount
  );
  // If the notification already exists, we simply add the new attachment
  // specific keywords to the existing notification instead of creating it
  // from scratch.
  if (notification) {
    const msgContainer = notification.messageText.querySelector(
      "#attachmentReminderText"
    );
    msgContainer.textContent = textValue;
    const keywordsContainer = notification.messageText.querySelector(
      "#attachmentKeywords"
    );
    keywordsContainer.textContent = keywords;
    return;
  }

  // Construct the notification as we don't have one.
  const msg = document.createElement("div");
  msg.onclick = function (event) {
    openOptionsDialog("paneCompose", "compositionAttachmentsCategory", {
      subdialog: "attachment_reminder_button",
    });
  };

  const msgText = document.createElement("span");
  msg.appendChild(msgText);
  msgText.id = "attachmentReminderText";
  msgText.textContent = textValue;
  const msgKeywords = document.createElement("span");
  msg.appendChild(msgKeywords);
  msgKeywords.id = "attachmentKeywords";
  msgKeywords.textContent = keywords;
  const addButton = {
    "l10n-id": "add-attachment-notification-reminder2",
    callback(aNotificationBar, aButton) {
      goDoCommand("cmd_attachFile");
      return true; // keep notification open (the state machine will decide on it later)
    },
  };

  const remindLaterMenuPopup = document.createXULElement("menupopup");
  remindLaterMenuPopup.id = "reminderBarPopup";
  const disableAttachmentReminder = document.createXULElement("menuitem");
  disableAttachmentReminder.id = "disableReminder";
  disableAttachmentReminder.setAttribute(
    "label",
    getComposeBundle().getString("disableAttachmentReminderButton")
  );
  disableAttachmentReminder.addEventListener("command", event => {
    gDisableAttachmentReminder = true;
    toggleAttachmentReminder(false);
    event.stopPropagation();
  });
  remindLaterMenuPopup.appendChild(disableAttachmentReminder);

  // The notification code only deals with buttons but we need a toolbarbutton,
  // so we construct it and add it ourselves.
  const remindButton = document.createXULElement("toolbarbutton", {
    is: "toolbarbutton-menu-button",
  });
  remindButton.classList.add("notification-button", "small-button");
  remindButton.setAttribute(
    "accessKey",
    getComposeBundle().getString("remindLaterButton.accesskey")
  );
  remindButton.setAttribute(
    "label",
    getComposeBundle().getString("remindLaterButton")
  );
  remindButton.addEventListener("command", function (event) {
    toggleAttachmentReminder(true);
  });
  remindButton.appendChild(remindLaterMenuPopup);

  notification = gComposeNotification.appendNotification(
    "attachmentReminder",
    {
      label: "",
      priority: gComposeNotification.PRIORITY_WARNING_MEDIUM,
    },
    [addButton]
  );
  notification.setAttribute("id", "attachmentNotificationBox");

  notification.messageText.appendChild(msg);
  notification.buttonContainer.appendChild(remindButton);
}

function clearRecipPillKeyIssues() {
  for (const pill of document.querySelectorAll("mail-address-pill.key-issue")) {
    pill.classList.remove("key-issue");
  }
}

/**
 * @returns {string[]} - All current recipient email addresses, lowercase.
 */
function getEncryptionCompatibleRecipients() {
  const recipientPills = [
    ...document.querySelectorAll(
      "#toAddrContainer > mail-address-pill, #ccAddrContainer > mail-address-pill, #bccAddrContainer > mail-address-pill"
    ),
  ];
  const recipients = [
    ...new Set(recipientPills.map(pill => pill.emailAddress.toLowerCase())),
  ];
  return recipients;
}

const PRErrorCodeSuccess = 0;
const certificateUsageEmailRecipient = 0x0020;

var gEmailsWithMissingKeys = null;
var gEmailsWithMissingCerts = null;

/**
 * @returns {boolean} true if checking openpgp keys is necessary
 */
function mustCheckRecipientKeys() {
  const remindOpenPGP = Services.prefs.getBoolPref(
    "mail.openpgp.remind_encryption_possible"
  );

  const autoEnablePref = Services.prefs.getBoolPref(
    "mail.e2ee.auto_enable",
    false
  );

  return (
    isPgpConfigured() && (gSendEncrypted || remindOpenPGP || autoEnablePref)
  );
}

/**
 * Check available OpenPGP public encryption keys for the given email
 * addresses. (This function assumes the caller has already called
 * mustCheckRecipientKeys() and the result was true.)
 *
 * gEmailsWithMissingKeys will be set to an array of email addresses
 * (a subset of the input) that do NOT have a usable
 * (valid + accepted) key.
 *
 * @param {string[]} recipients - The addresses to lookup.
 */
async function checkRecipientKeys(recipients) {
  gEmailsWithMissingKeys = [];

  for (const addr of recipients) {
    const keyMetas = await EnigmailKeyRing.getEncryptionKeyMeta(addr);

    if (keyMetas.length == 1 && keyMetas[0].readiness == "alias") {
      // Skip if this is an alias email.
      continue;
    }

    if (!keyMetas.some(k => k.readiness == "accepted")) {
      gEmailsWithMissingKeys.push(addr);
      continue;
    }
  }
}

/**
 * @returns {boolean} true if checking s/mime certificates is necessary
 */
function mustCheckRecipientCerts() {
  const remindSMime = Services.prefs.getBoolPref(
    "mail.smime.remind_encryption_possible"
  );

  const autoEnablePref = Services.prefs.getBoolPref(
    "mail.e2ee.auto_enable",
    false
  );

  return (
    isSmimeEncryptionConfigured() &&
    (gSendEncrypted || remindSMime || autoEnablePref)
  );
}

/**
 * Check available S/MIME encryption certificates for the given email
 * addresses. (This function assumes the caller has already called
 * mustCheckRecipientCerts() and the result was true.)
 *
 * gEmailsWithMissingCerts will be set to an array of email addresses
 * (a subset of the input) that do NOT have a usable (valid) certificate.
 *
 * This function might take significant time to complete, because
 * certificate verification involves OCSP, which runs on a background
 * thread.
 *
 * @param {string[]} recipients - The addresses to lookup.
 */
function checkRecipientCerts(recipients) {
  return new Promise((resolve, reject) => {
    if (gSMPendingCertLookupSet.size) {
      reject(
        new Error(
          "Must not be called while previous checks are still in progress"
        )
      );
    }

    gEmailsWithMissingCerts = [];

    function continueCheckRecipientCerts() {
      gEmailsWithMissingCerts = recipients.filter(
        email => !gSMFields.haveValidCertForEmail(email)
      );
      resolve();
    }

    /** @implements {nsIDoneFindCertForEmailCallback} */
    const doneFindCertForEmailCallback = {
      QueryInterface: ChromeUtils.generateQI([
        "nsIDoneFindCertForEmailCallback",
      ]),

      findCertDone(email, cert) {
        const isStaleResult = !gSMPendingCertLookupSet.has(email);
        // isStaleResult true means, this recipient was removed by the
        // user while we were looking for the cert in the background.
        // Let's remember the result, but don't trigger any actions
        // based on it.

        if (cert) {
          gSMFields.cacheValidCertForEmail(email, cert ? cert.dbKey : "");
        }
        if (isStaleResult) {
          return;
        }
        gSMPendingCertLookupSet.delete(email);
        if (!cert && !gSMCertsAlreadyLookedUpInLDAP.has(email)) {
          const autocompleteLdap = Services.prefs.getBoolPref(
            "ldap_2.autoComplete.useDirectory"
          );

          if (autocompleteLdap) {
            gSMCertsAlreadyLookedUpInLDAP.add(email);

            let autocompleteDirectory = null;
            if (gCurrentIdentity.overrideGlobalPref) {
              autocompleteDirectory = gCurrentIdentity.directoryServer;
            } else {
              autocompleteDirectory = Services.prefs.getCharPref(
                "ldap_2.autoComplete.directoryServer"
              );
            }

            if (autocompleteDirectory) {
              window.openDialog(
                "chrome://messenger-smime/content/certFetchingStatus.xhtml",
                "",
                "chrome,resizable=1,modal=1,dialog=1",
                autocompleteDirectory,
                [email]
              );
            }

            gSMPendingCertLookupSet.add(email);
            gSMFields.asyncFindCertByEmailAddr(
              email,
              doneFindCertForEmailCallback
            );
          }
        }

        if (gSMPendingCertLookupSet.size) {
          // must continue to wait for more queued lookups to complete
          return;
        }

        // No more lookups pending.
        continueCheckRecipientCerts();
      },
    };

    for (const email of recipients) {
      if (gSMFields.haveValidCertForEmail(email)) {
        continue;
      }

      if (gSMPendingCertLookupSet.has(email)) {
        throw new Error(`cert lookup still pending for ${email}`);
      }

      gSMPendingCertLookupSet.add(email);
      gSMFields.asyncFindCertByEmailAddr(email, doneFindCertForEmailCallback);
    }

    // If we haven't queued any lookups, we continue immediately
    if (!gSMPendingCertLookupSet.size) {
      continueCheckRecipientCerts();
    }
  });
}

/**
 * gCheckEncryptionStateCompletionIsPending means that async work
 * started by checkEncryptionState() has not yet completed.
 */
var gCheckEncryptionStateCompletionIsPending = false;

/**
 * gCheckEncryptionStateNeedsRestart means that checkEncryptionState()
 * was called, while its async operations were still running.
 * The additional to checkEncryptionState() was treated as a no-op,
 * but gCheckEncryptionStateNeedsRestart was set to true, to remember
 * that checkEncryptionState() must be immediately restarted after its
 * previous execution is done. This will the restarted
 * checkEncryptionState() execution to detect and handle changes that
 * could result in a different state.
 */
var gCheckEncryptionStateNeedsRestart = false;

/**
 * gWasCESTriggeredByComposerChange is used to track whether an
 * encryption-state-checked event should be sent after an ongoing
 * execution of checkEncryptionState() is done.
 * The purpose of the encryption-state-checked event is to allow our
 * automated tests to be notified as soon as an automatic call to
 * checkEncryptionState() (and all related async calls) is complete,
 * which means all automatic adjustments to the global encryption state
 * are done, and the automated test code may proceed to compare the
 * state to our exptectations.
 * We want that event to be sent after modifications were made to the
 * composer window itself, such as sender identity and recipients.
 * However, we want to ignore calls to checkEncryptionState() that
 * were triggered indirectly after OpenPGP keys were changed.
 * If an event was originally triggered by a change to OpenPGP keys,
 * and the async processing of checkEncryptionState() was still running,
 * and another direct change to the composer window was made, which
 * shall result in sending a encryption-state-checked after completion,
 * then the flag gWasCESTriggeredByComposerChange will be set,
 * which will cause the event to be sent after the restarted call
 * to checkEncryptionState() is complete.
 */
var gWasCESTriggeredByComposerChange = false;

/**
 * Perform all checks that are necessary to update the state of
 * email encryption, based on the current recipients. This should be
 * done whenever the recipient list or the status of available keys/certs
 * has changed. All automatic actions for encryption related settings
 * will be triggered accordingly.
 * This function will trigger async activity, and the resulting actions
 * (e.g. update of UI elements) may happen after a delay.
 * It's safe to call this while processing hasn't completed yet, in this
 * scenario the processing will be restarted, once pending
 * activity has completed.
 *
 * @param {string} [trigger] - A string that gives information about
 *   the reason why this function is being called.
 *   This parameter is intended to help with automated testing.
 *   If the trigger string starts with "openpgp-" then no completition
 *   event will be dispatched. This allows the automated test code to
 *   wait for events that are directly related to properties of the
 *   composer window, only.
 */
async function checkEncryptionState(trigger) {
  if (!gLoadingComplete) {
    // Let's not do this while we're still loading the composer window,
    // it can have side effects, see bug 1777683.
    // Also, if multiple recipients are added to an email automatically
    // e.g. during reply-all, it doesn't make sense to execute this
    // function every time after one of them gets added.
    return;
  }

  if (!/^openpgp-/.test(trigger)) {
    gWasCESTriggeredByComposerChange = true;
  }

  if (gCheckEncryptionStateCompletionIsPending) {
    // avoid concurrency
    gCheckEncryptionStateNeedsRestart = true;
    return;
  }

  const remindSMime = Services.prefs.getBoolPref(
    "mail.smime.remind_encryption_possible"
  );
  const remindOpenPGP = Services.prefs.getBoolPref(
    "mail.openpgp.remind_encryption_possible"
  );
  const autoEnablePref = Services.prefs.getBoolPref(
    "mail.e2ee.auto_enable",
    false
  );

  if (!gSendEncrypted && !autoEnablePref && !remindSMime && !remindOpenPGP) {
    // No need to check.
    updateEncryptionDependencies();
    updateKeyCertNotifications([]);
    updateEncryptionTechReminder(null);
    if (gWasCESTriggeredByComposerChange) {
      document.dispatchEvent(new CustomEvent("encryption-state-checked"));
      gWasCESTriggeredByComposerChange = false;
    }
    return;
  }

  const recipients = getEncryptionCompatibleRecipients();
  const checkingCerts = mustCheckRecipientCerts();
  const checkingKeys = mustCheckRecipientKeys();

  async function continueCheckEncryptionStateSub() {
    const canEncryptSMIME =
      recipients.length && checkingCerts && !gEmailsWithMissingCerts.length;
    const canEncryptOpenPGP =
      recipients.length && checkingKeys && !gEmailsWithMissingKeys.length;

    let autoEnabledJustNow = false;

    if (
      gSendEncrypted &&
      gUserTouchedSendEncrypted &&
      !isPgpConfigured() &&
      !isSmimeEncryptionConfigured()
    ) {
      notifyIdentityCannotEncrypt(true, gCurrentIdentity.email);
    } else {
      notifyIdentityCannotEncrypt(false, gCurrentIdentity.email);
    }

    if (
      !gSendEncrypted &&
      autoEnablePref &&
      !gUserTouchedSendEncrypted &&
      recipients.length &&
      (canEncryptSMIME || canEncryptOpenPGP)
    ) {
      if (!canEncryptSMIME) {
        gSelectedTechnologyIsPGP = true;
      } else if (!canEncryptOpenPGP) {
        gSelectedTechnologyIsPGP = false;
      }
      gSendEncrypted = true;
      autoEnabledJustNow = true;
      removeAutoDisableNotification();
    }

    if (
      !gIsRelatedToEncryptedOriginal &&
      !autoEnabledJustNow &&
      !gUserTouchedSendEncrypted &&
      gSendEncrypted &&
      !canEncryptSMIME &&
      !canEncryptOpenPGP
    ) {
      // The auto_disable pref is ignored if auto_enable is false
      const autoDisablePref = Services.prefs.getBoolPref(
        "mail.e2ee.auto_disable",
        false
      );
      if (autoEnablePref && autoDisablePref && !gUserTouchedSendEncrypted) {
        gSendEncrypted = false;
        const notifyPref = Services.prefs.getBoolPref(
          "mail.e2ee.notify_on_auto_disable",
          true
        );
        if (notifyPref) {
          // Most likely the notification is not showing yet, and we
          // must append it. (We should have removed an existing
          // notification at the time encryption was enabled.)
          // However, double check to avoid that we'll show it twice.
          const NOTIFICATION_NAME = "e2eeDisableNotification";
          const notification =
            gComposeNotification.getNotificationWithValue(NOTIFICATION_NAME);
          if (!notification) {
            gComposeNotification.appendNotification(
              NOTIFICATION_NAME,
              {
                label: { "l10n-id": "auto-disable-e2ee-warning" },
                priority: gComposeNotification.PRIORITY_WARNING_LOW,
              },
              []
            );
          }
        }
      }
    }

    const techPref = gCurrentIdentity.getIntAttribute("e2etechpref");

    if (gSendEncrypted && canEncryptSMIME && canEncryptOpenPGP) {
      // No change if 0
      if (techPref == 1) {
        gSelectedTechnologyIsPGP = false;
      } else if (techPref == 2) {
        gSelectedTechnologyIsPGP = true;
      }
    }

    if (
      gSendEncrypted &&
      canEncryptSMIME &&
      !canEncryptOpenPGP &&
      gSelectedTechnologyIsPGP
    ) {
      gSelectedTechnologyIsPGP = false;
    }

    if (
      gSendEncrypted &&
      !canEncryptSMIME &&
      canEncryptOpenPGP &&
      !gSelectedTechnologyIsPGP
    ) {
      gSelectedTechnologyIsPGP = true;
    }

    updateEncryptionDependencies();

    if (!gSendEncrypted) {
      updateKeyCertNotifications([]);
      if (recipients.length && (canEncryptSMIME || canEncryptOpenPGP)) {
        let useTech;
        if (canEncryptSMIME && canEncryptOpenPGP) {
          if (techPref == 1) {
            useTech = "SMIME";
          } else {
            useTech = "OpenPGP";
          }
        } else {
          useTech = canEncryptOpenPGP ? "OpenPGP" : "SMIME";
        }
        updateEncryptionTechReminder(useTech);
      } else {
        updateEncryptionTechReminder(null);
      }
    } else {
      updateKeyCertNotifications(
        gSelectedTechnologyIsPGP
          ? gEmailsWithMissingKeys
          : gEmailsWithMissingCerts
      );
      updateEncryptionTechReminder(null);
    }

    gCheckEncryptionStateCompletionIsPending = false;

    if (gCheckEncryptionStateNeedsRestart) {
      // Recursive call, which is acceptable (and not blocking),
      // because necessary long actions will be triggered asynchronously.
      gCheckEncryptionStateNeedsRestart = false;
      await checkEncryptionState(trigger);
    } else if (gWasCESTriggeredByComposerChange) {
      document.dispatchEvent(new CustomEvent("encryption-state-checked"));
      gWasCESTriggeredByComposerChange = false;
    }
  }

  const pendingPromises = [];

  if (checkingCerts) {
    pendingPromises.push(checkRecipientCerts(recipients));
  }

  if (checkingKeys) {
    pendingPromises.push(checkRecipientKeys(recipients));
  }

  gCheckEncryptionStateNeedsRestart = false;
  gCheckEncryptionStateCompletionIsPending = true;

  Promise.all(pendingPromises).then(continueCheckEncryptionStateSub);
}

/**
 * Display (or hide) the notification that informs the user that
 * encryption is possible (but currently not enabled).
 *
 * @param {string} technology - The technology that is possible,
 *   ("OpenPGP" or "SMIME"), or null if none is possible.
 */
function updateEncryptionTechReminder(technology) {
  const enableNotification =
    gComposeNotification.getNotificationWithValue("enableNotification");
  if (enableNotification) {
    gComposeNotification.removeNotification(enableNotification);
  }

  if (!technology || (technology != "OpenPGP" && technology != "SMIME")) {
    return;
  }

  const labelId =
    technology == "OpenPGP"
      ? "can-encrypt-openpgp-notification"
      : "can-encrypt-smime-notification";

  gComposeNotification.appendNotification(
    "enableNotification",
    {
      label: { "l10n-id": labelId },
      priority: gComposeNotification.PRIORITY_INFO_LOW,
    },
    [
      {
        "l10n-id": "can-e2e-encrypt-button",
        callback() {
          gSelectedTechnologyIsPGP = technology == "OpenPGP";
          gSendEncrypted = true;
          gUserTouchedSendEncrypted = true;
          checkEncryptionState();
          return true;
        },
      },
    ]
  );
}

/**
 * Display (or hide) the notification that informs the user that
 * encryption isn't possible, because the currently selected Sender
 * (From) identity isn't configured for end-to-end-encryption.
 *
 * @param {boolean} show - Show if true, hide if false.
 * @param {string} addr - email address to show in notification
 */
async function notifyIdentityCannotEncrypt(show, addr) {
  const NOTIFICATION_NAME = "IdentityCannotEncrypt";

  const notification =
    gComposeNotification.getNotificationWithValue(NOTIFICATION_NAME);

  if (show) {
    if (!notification) {
      gComposeNotification.appendNotification(
        NOTIFICATION_NAME,
        {
          label: await document.l10n.formatValue(
            "openpgp-key-issue-notification-from",
            {
              addr,
            }
          ),
          priority: gComposeNotification.PRIORITY_WARNING_MEDIUM,
        },
        []
      );
    }
  } else if (notification) {
    gComposeNotification.removeNotification(notification);
  }
}

/**
 * Show an appropriate notification based on the given list of
 * email addresses that cannot be used with email encryption
 * (because of missing usable OpenPGP public keys or S/MIME certs).
 * The list may be empty, which means no notification will be shown
 * (or existing notifications will be removed).
 *
 * @param {string[]} emailsWithMissing - The email addresses that prevent
 *   using encryption, because certs/keys are missing.
 */
function updateKeyCertNotifications(emailsWithMissing) {
  const NOTIFICATION_NAME = "keyNotification";

  const notification =
    gComposeNotification.getNotificationWithValue(NOTIFICATION_NAME);
  if (notification) {
    gComposeNotification.removeNotification(notification);
  }

  // Always refresh the pills UI.
  clearRecipPillKeyIssues();

  // Interrupt if we don't have any issue.
  if (!emailsWithMissing.length) {
    return;
  }

  // Update recipient pills.
  for (const pill of document.querySelectorAll("mail-address-pill")) {
    if (
      emailsWithMissing.includes(pill.emailAddress.toLowerCase()) &&
      !pill.classList.contains("invalid-address")
    ) {
      pill.classList.add("key-issue");
    }
  }

  /**
   * Display the new key notification.
   */
  const buttons = [];
  buttons.push({
    "l10n-id": "key-notification-disable-encryption",
    callback() {
      gUserTouchedSendEncrypted = true;
      gSendEncrypted = false;
      checkEncryptionState();
      return true;
    },
  });

  if (gSelectedTechnologyIsPGP) {
    buttons.push({
      "l10n-id": "key-notification-resolve",
      callback() {
        showMessageComposeSecurityStatus();
        return true;
      },
    });
  }

  let label;

  if (emailsWithMissing.length == 1) {
    const id = gSelectedTechnologyIsPGP
      ? "openpgp-key-issue-notification-single"
      : "smime-cert-issue-notification-single";
    label = {
      "l10n-id": id,
      "l10n-args": { addr: emailsWithMissing[0] },
    };
  } else {
    const id = gSelectedTechnologyIsPGP
      ? "openpgp-key-issue-notification-multi"
      : "smime-cert-issue-notification-multi";

    label = {
      "l10n-id": id,
      "l10n-args": { count: emailsWithMissing.length },
    };
  }

  gComposeNotification.appendNotification(
    NOTIFICATION_NAME,
    {
      label,
      priority: gComposeNotification.PRIORITY_WARNING_MEDIUM,
    },
    buttons
  );
}

/**
 * Returns whether the attachment notification should be suppressed regardless
 * of the state of keywords.
 */
function attachmentNotificationSupressed() {
  return (
    gDisableAttachmentReminder ||
    gManualAttachmentReminder ||
    gAttachmentBucket.getRowCount()
  );
}

var attachmentWorker = new Worker("resource:///modules/AttachmentChecker.jsm");

// The array of currently found keywords. Or null if keyword detection wasn't
// run yet so we don't know.
attachmentWorker.lastMessage = null;

attachmentWorker.onerror = function (error) {
  console.error("Attachment Notification Worker error!!! " + error.message);
  throw error;
};

/**
 * Called when attachmentWorker finishes checking of the message for keywords.
 *
 * @param event    If defined, event.data contains an array of found keywords.
 * @param aManage  If set to true and we determine keywords have changed,
 *                 manage the notification.
 *                 If set to false, just store the new keyword list but do not
 *                 touch the notification. That effectively eats the
 *                 "keywords changed" event which usually shows the notification
 *                 if it was hidden. See manageAttachmentNotification().
 */
attachmentWorker.onmessage = function (event, aManage = true) {
  // Exit if keywords haven't changed.
  if (
    !event ||
    (attachmentWorker.lastMessage &&
      event.data.toString() == attachmentWorker.lastMessage.toString())
  ) {
    return;
  }

  const data = event ? event.data : [];
  attachmentWorker.lastMessage = data.slice(0);
  if (aManage) {
    manageAttachmentNotification(true);
  }
};

/**
 * Update attachment-related internal flags, UI, and commands.
 * Called when number of attachments changes.
 *
 * @param aShowPane {string} "show":  show the attachment pane
 *                           "hide":  hide the attachment pane
 *                           omitted: just update without changing pane visibility
 * @param aContentChanged {Boolean} optional value to assign to gContentChanged;
 *                                  defaults to true.
 */
function AttachmentsChanged(aShowPane, aContentChanged = true) {
  gContentChanged = aContentChanged;
  updateAttachmentPane(aShowPane);
  manageAttachmentNotification(true);
  updateAttachmentItems();
}

/**
 * This functions returns an array of valid spellcheck languages. It checks
 * that a dictionary exists for the language passed in, if any. It also
 * retrieves the corresponding preference and ensures that a dictionary exists.
 * If not, it adjusts the preference accordingly.
 * When the nominated dictionary does not exist, the effects are very confusing
 * to the user: Inline spell checking does not work, although the option is
 * selected and a spell check dictionary seems to be selected in the options
 * dialog (the dropdown shows the first list member if the value is not in
 * the list). It is not at all obvious that the preference value is wrong.
 * This case can happen two scenarios:
 * 1) The dictionary that was selected in the preference is removed.
 * 2) The selected dictionary changes the way it announces itself to the system,
 *    so for example "it_IT" changes to "it-IT" and the previously stored
 *    preference value doesn't apply any more.
 *
 * @param {string[]|null} [draftLanguages] - Languages that the message was
 *  composed in.
 * @returns {string[]}
 */
function getValidSpellcheckerDictionaries(draftLanguages) {
  const prefValue = Services.prefs.getCharPref("spellchecker.dictionary");
  const spellChecker = Cc["@mozilla.org/spellchecker/engine;1"].getService(
    Ci.mozISpellCheckingEngine
  );
  const dictionaries = Array.from(new Set(prefValue?.split(",")));

  const dictList = spellChecker.getDictionaryList();
  const count = dictList.length;

  if (count == 0) {
    // If there are no dictionaries, we can't check the value, so return it.
    return dictionaries;
  }

  // Make sure that the draft language contains a valid value.
  if (
    draftLanguages &&
    draftLanguages.every(language => dictList.includes(language))
  ) {
    return draftLanguages;
  }

  // Make sure preference contains a valid value.
  if (dictionaries.every(language => dictList.includes(language))) {
    return dictionaries;
  }

  // Set a valid value, any value will do.
  Services.prefs.setCharPref("spellchecker.dictionary", dictList[0]);
  return [dictList[0]];
}

var dictionaryRemovalObserver = {
  observe(aSubject, aTopic, aData) {
    if (aTopic != "spellcheck-dictionary-remove") {
      return;
    }
    const spellChecker = Cc["@mozilla.org/spellchecker/engine;1"].getService(
      Ci.mozISpellCheckingEngine
    );

    const dictList = spellChecker.getDictionaryList();
    let languages = Array.from(gActiveDictionaries);
    languages = languages.filter(lang => dictList.includes(lang));
    if (languages.length === 0) {
      // Set a valid language from the preference.
      const prefValue = Services.prefs.getCharPref("spellchecker.dictionary");
      const prefLanguages = prefValue?.split(",") ?? [];
      languages = prefLanguages.filter(lang => dictList.includes(lang));
      if (prefLanguages.length != languages.length && languages.length > 0) {
        // Fix the preference while we're here. We know it's invalid.
        Services.prefs.setCharPref(
          "spellchecker.dictionary",
          languages.join(",")
        );
      }
    }
    // Only update the language if we will still be left with any active choice.
    if (languages.length > 0) {
      ComposeChangeLanguage(languages);
    }
  },

  isAdded: false,

  addObserver() {
    Services.obs.addObserver(this, "spellcheck-dictionary-remove");
    this.isAdded = true;
  },

  removeObserver() {
    if (this.isAdded) {
      Services.obs.removeObserver(this, "spellcheck-dictionary-remove");
      this.isAdded = false;
    }
  },
};

function EditorClick(event) {
  if (event.target.matches(".remove-card")) {
    const card = event.target.closest(".moz-card");
    const url = card.querySelector(".url").href;
    if (card.matches(".url-replaced")) {
      card.replaceWith(url);
    } else {
      card.remove();
    }
  } else if (event.target.matches(`.add-card[data-opened='${gOpened}']`)) {
    const url = event.target.getAttribute("data-url");
    const meRect = document.getElementById("messageEditor").getClientRects()[0];
    const settings = document.getElementById("linkPreviewSettings");
    const settingsW = 500;
    settings.style.position = "fixed";
    settings.style.left =
      Math.max(settingsW + 20, event.clientX) - settingsW + "px";
    settings.style.top = meRect.top + event.clientY + 20 + "px";
    settings.hidden = false;
    event.target.remove();
    settings.querySelector(".close").onclick = event => {
      settings.hidden = true;
    };
    settings.querySelector(".preview-replace").onclick = event => {
      addLinkPreview(url, true);
      settings.hidden = true;
    };
    settings.querySelector(".preview-autoadd").onclick = event => {
      Services.prefs.setBoolPref(
        "mail.compose.add_link_preview",
        event.target.checked
      );
    };
    settings.querySelector(".preview-replace").focus();
    settings.onkeydown = event => {
      if (event.key == "Escape") {
        settings.hidden = true;
      }
    };
  }
}

/**
 * Grab Open Graph or Twitter card data from the URL and insert a link preview
 * into the editor. If no proper data could be found, nothing is inserted.
 *
 * @param {string} url - The URL to add preview for.
 */
async function addLinkPreview(url) {
  return fetch(url)
    .then(response => response.text())
    .then(text => {
      const doc = new DOMParser().parseFromString(text, "text/html");

      // If the url has an Open Graph or Twitter card, create a nicer
      // representation and use that instead.
      // @see https://ogp.me/
      // @see https://developer.twitter.com/en/docs/twitter-for-websites/cards/
      // Also look for standard meta information as a fallback.

      const title =
        doc
          .querySelector("meta[property='og:title'],meta[name='twitter:title']")
          ?.getAttribute("content") ||
        doc.querySelector("title")?.textContent.trim();
      const description = doc
        .querySelector(
          "meta[property='og:description'],meta[name='twitter:description'],meta[name='description']"
        )
        ?.getAttribute("content");

      // Handle the case where we didn't get proper data.
      if (!title && !description) {
        console.debug(`No link preview data for url=${url}`);
        return;
      }

      let image = doc
        .querySelector("meta[property='og:image']")
        ?.getAttribute("content");
      let alt =
        doc
          .querySelector("meta[property='og:image:alt']")
          ?.getAttribute("content") || "";
      if (!image) {
        image = doc
          .querySelector("meta[name='twitter:image']")
          ?.getAttribute("content");
        alt =
          doc
            .querySelector("meta[name='twitter:image:alt']")
            ?.getAttribute("content") || "";
      }
      let imgIsTouchIcon = false;
      if (!image) {
        image = doc
          .querySelector(
            `link[rel='icon']:is(
               [sizes~='any'],
               [sizes~='196x196' i],
               [sizes~='192x192' i]
               [sizes~='180x180' i],
               [sizes~='128x128' i]
             )`
          )
          ?.getAttribute("href");
        alt = "";
        imgIsTouchIcon = Boolean(image);
      }

      // Grab our template and fill in the variables.
      const card = document
        .getElementById("dataCardTemplate")
        .content.cloneNode(true).firstElementChild;
      card.id = "card-" + Date.now();
      card.querySelector("img").src = image;
      card.querySelector("img").alt = alt;
      card.querySelector(".title").textContent = title;

      card.querySelector(".description").textContent = description;
      card.querySelector(".url").textContent = "🔗 " + url;
      card.querySelector(".url").href = url;
      card.querySelector(".url").title = new URL(url).hostname;
      card.querySelector(".site").textContent = new URL(url).hostname;

      // twitter:card "summary" = Summary Card
      // twitter:card "summary_large_image" = Summary Card with Large Image
      if (
        !imgIsTouchIcon &&
        (doc.querySelector(
          "meta[name='twitter:card'][content='summary_large_image']"
        ) ||
          doc
            .querySelector("meta[property='og:image:width']")
            ?.getAttribute("content") >= 600)
      ) {
        card.querySelector("img").style.width = "600px";
      }

      if (!image) {
        card.querySelector(".card-pic").remove();
      }

      // If subject is empty, set that as well.
      const subject = document.getElementById("msgSubject");
      if (!subject.value && title) {
        subject.value = title;
      }

      // Select the inserted URL so that if the preview is found one can
      // use undo to remove it and only use the URL instead.
      // Only do it if there was no typing after the url.
      const selection = getBrowser().contentDocument.getSelection();
      const n = selection.focusNode;
      if (n.textContent.endsWith(url)) {
        selection.extend(n, n.textContent.lastIndexOf(url));
        card.classList.add("url-replaced");
      }

      // Add a line after the card. Otherwise it's hard to continue writing.
      const line = GetCurrentEditor().returnInParagraphCreatesNewParagraph
        ? "<p>&#160;</p>"
        : "<br />";
      card.classList.add("loading"); // Used for fade-in effect.
      getBrowser().contentDocument.execCommand(
        "insertHTML",
        false,
        card.outerHTML + line
      );
      const cardInDoc = getBrowser().contentDocument.getElementById(card.id);
      cardInDoc.classList.remove("loading");
    });
}

/**
 * On paste or drop, we may want to modify the content before inserting it into
 * the editor, replacing file URLs with data URLs when appropriate.
 */
function onPasteOrDrop(e) {
  if (!gMsgCompose.composeHTML) {
    // We're in the plain text editor. Nothing to do here.
    return;
  }
  gMsgCompose.allowRemoteContent = true;

  // For paste use e.clipboardData, for drop use e.dataTransfer.
  const dataTransfer = "clipboardData" in e ? e.clipboardData : e.dataTransfer;
  if (
    Services.prefs.getBoolPref("mail.compose.add_link_preview", false) &&
    !Services.io.offline &&
    !dataTransfer.types.includes("text/html")
  ) {
    const type = dataTransfer.types.find(t =>
      ["text/uri-list", "text/x-moz-url", "text/plain"].includes(t)
    );
    if (type) {
      const url = dataTransfer.getData(type).split("\n")[0].trim();
      if (/^https?:\/\/\S+$/.test(url)) {
        e.preventDefault(); // We'll handle the pasting manually.
        getBrowser().contentDocument.execCommand("insertHTML", false, url);
        addLinkPreview(url);
        return;
      }
    }
  }

  if (!dataTransfer.types.includes("text/html")) {
    return;
  }

  // Ok, we have html content to paste.
  const html = dataTransfer.getData("text/html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tmpD = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let pendingConversions = 0;
  let needToPreventDefault = true;
  for (const img of doc.images) {
    if (!/^file:/i.test(img.src)) {
      // Doesn't start with file:. Nothing to do here.
      continue;
    }

    // This may throw if the URL is invalid for the OS.
    let nsFile;
    try {
      nsFile = Services.io
        .getProtocolHandler("file")
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

    const contentType = Cc["@mozilla.org/mime;1"]
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

    File.createFromNsIFile(nsFile).then(function (file) {
      if (file.lastModified < Date.now() - 60000) {
        // Not put in temp in the last minute. May be something other than
        // a copy-paste. Let's not allow that.
        return;
      }

      const doTheInsert = function () {
        // Now run it through sanitation to make sure there wasn't any
        // unwanted things in the content.
        const ParserUtils = Cc["@mozilla.org/parserutils;1"].getService(
          Ci.nsIParserUtils
        );
        const html2 = ParserUtils.sanitize(
          doc.documentElement.innerHTML,
          ParserUtils.SanitizerAllowStyle
        );
        getBrowser().contentDocument.execCommand("insertHTML", false, html2);
      };

      // Everything checks out. Convert file to data URL.
      const reader = new FileReader();
      reader.addEventListener("load", function () {
        const dataURL = reader.result;
        pendingConversions--;
        img.src = dataURL;
        if (pendingConversions == 0) {
          doTheInsert();
        }
      });
      reader.addEventListener("error", function () {
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

/* eslint-disable complexity */
async function ComposeStartup() {
  // Findbar overlay
  if (!document.getElementById("findbar-replaceButton")) {
    const replaceButton = document.createXULElement("toolbarbutton");
    replaceButton.setAttribute("id", "findbar-replaceButton");
    replaceButton.setAttribute("class", "toolbarbutton-1 tabbable");
    replaceButton.setAttribute(
      "label",
      getComposeBundle().getString("replaceButton.label")
    );
    replaceButton.setAttribute(
      "accesskey",
      getComposeBundle().getString("replaceButton.accesskey")
    );
    replaceButton.setAttribute(
      "tooltiptext",
      getComposeBundle().getString("replaceButton.tooltip")
    );
    replaceButton.setAttribute("oncommand", "findbarFindReplace();");

    const findbar = document.getElementById("FindToolbar");
    const lastButton = findbar.getElement("find-entire-word");
    const tSeparator = document.createXULElement("toolbarseparator");
    tSeparator.setAttribute("id", "findbar-beforeReplaceSeparator");
    lastButton.parentNode.insertBefore(
      replaceButton,
      lastButton.nextElementSibling
    );
    lastButton.parentNode.insertBefore(
      tSeparator,
      lastButton.nextElementSibling
    );
  }

  var params = null; // New way to pass parameters to the compose window as a nsIMsgComposeParameters object
  var args = null; // old way, parameters are passed as a string
  gBodyFromArgs = false;

  if (window.arguments && window.arguments[0]) {
    try {
      if (window.arguments[0] instanceof Ci.nsIMsgComposeParams) {
        params = window.arguments[0];
        gBodyFromArgs = params.composeFields && params.composeFields.body;
      } else {
        params = handleMailtoArgs(window.arguments[0]);
      }
    } catch (ex) {
      dump("ERROR with parameters: " + ex + "\n");
    }

    // if still no dice, try and see if the params is an old fashioned list of string attributes
    // XXX can we get rid of this yet?
    if (!params) {
      args = GetArgs(window.arguments[0]);
    }
  }

  // Set a sane starting width/height for all resolutions on new profiles.
  // Do this before the window loads.
  if (!document.documentElement.hasAttribute("width")) {
    // Prefer 860x800.
    const defaultHeight = Math.min(screen.availHeight, 800);
    const defaultWidth = Math.min(screen.availWidth, 860);

    // On small screens, default to maximized state.
    if (defaultHeight <= 600) {
      document.documentElement.setAttribute("sizemode", "maximized");
    }

    document.documentElement.setAttribute("width", defaultWidth);
    document.documentElement.setAttribute("height", defaultHeight);
    // Make sure we're safe at the left/top edge of screen
    document.documentElement.setAttribute("screenX", screen.availLeft);
    document.documentElement.setAttribute("screenY", screen.availTop);
  }

  // Observe dictionary removals.
  dictionaryRemovalObserver.addObserver();

  const messageEditor = document.getElementById("messageEditor");
  messageEditor.addEventListener("paste", onPasteOrDrop);
  messageEditor.addEventListener("drop", onPasteOrDrop);

  const identityList = document.getElementById("msgIdentity");
  if (identityList) {
    FillIdentityList(identityList);
  }

  if (!params) {
    // This code will go away soon as now arguments are passed to the window using a object of type nsMsgComposeParams instead of a string

    params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(
      Ci.nsIMsgComposeParams
    );
    params.composeFields = Cc[
      "@mozilla.org/messengercompose/composefields;1"
    ].createInstance(Ci.nsIMsgCompFields);

    if (args) {
      // Convert old fashion arguments into params
      var composeFields = params.composeFields;
      if (args.bodyislink == "true") {
        params.bodyIsLink = true;
      }
      if (args.type) {
        params.type = args.type;
      }
      if (args.format) {
        // Only use valid values.
        if (
          args.format == Ci.nsIMsgCompFormat.PlainText ||
          args.format == Ci.nsIMsgCompFormat.HTML ||
          args.format == Ci.nsIMsgCompFormat.OppositeOfDefault
        ) {
          params.format = args.format;
        } else if (args.format.toLowerCase().trim() == "html") {
          params.format = Ci.nsIMsgCompFormat.HTML;
        } else if (args.format.toLowerCase().trim() == "text") {
          params.format = Ci.nsIMsgCompFormat.PlainText;
        }
      }
      if (args.originalMsgURI) {
        params.originalMsgURI = args.originalMsgURI;
      }
      if (args.preselectid) {
        params.identity = MailServices.accounts.getIdentity(args.preselectid);
      }
      if (args.from) {
        composeFields.from = args.from;
      }
      if (args.to) {
        composeFields.to = args.to;
      }
      if (args.cc) {
        composeFields.cc = args.cc;
      }
      if (args.bcc) {
        composeFields.bcc = args.bcc;
      }
      if (args.newsgroups) {
        composeFields.newsgroups = args.newsgroups;
      }
      if (args.subject) {
        composeFields.subject = args.subject;
      }
      if (args.attachment && window.arguments[1] instanceof Ci.nsICommandLine) {
        const attachmentList = args.attachment.split(",");
        for (const attachmentName of attachmentList) {
          // resolveURI does all the magic around working out what the
          // attachment is, including web pages, and generating the correct uri.
          const uri = window.arguments[1].resolveURI(attachmentName);
          let attachment = Cc[
            "@mozilla.org/messengercompose/attachment;1"
          ].createInstance(Ci.nsIMsgAttachment);
          // If uri is for a file and it exists set the attachment size.
          if (uri instanceof Ci.nsIFileURL) {
            if (uri.file.exists()) {
              attachment.size = uri.file.fileSize;
            } else {
              attachment = null;
            }
          }

          // Only want to attach if a file that exists or it is not a file.
          if (attachment) {
            attachment.url = uri.spec;
            composeFields.addAttachment(attachment);
          } else {
            const title = getComposeBundle().getString("errorFileAttachTitle");
            const msg = getComposeBundle().getFormattedString(
              "errorFileAttachMessage",
              [attachmentName]
            );
            Services.prompt.alert(null, title, msg);
          }
        }
      }
      if (args.newshost) {
        composeFields.newshost = args.newshost;
      }
      if (args.message) {
        const msgFile = Cc["@mozilla.org/file/local;1"].createInstance(
          Ci.nsIFile
        );
        if (PathUtils.parent(args.message) == ".") {
          const workingDir = Services.dirsvc.get("CurWorkD", Ci.nsIFile);
          args.message = PathUtils.join(
            workingDir.path,
            PathUtils.filename(args.message)
          );
        }
        msgFile.initWithPath(args.message);

        if (!msgFile.exists()) {
          const title = getComposeBundle().getString("errorFileMessageTitle");
          const msg = getComposeBundle().getFormattedString(
            "errorFileMessageMessage",
            [args.message]
          );
          Services.prompt.alert(null, title, msg);
        } else {
          let data = "";
          let fstream = null;
          let cstream = null;

          try {
            fstream = Cc[
              "@mozilla.org/network/file-input-stream;1"
            ].createInstance(Ci.nsIFileInputStream);
            cstream = Cc[
              "@mozilla.org/intl/converter-input-stream;1"
            ].createInstance(Ci.nsIConverterInputStream);
            fstream.init(msgFile, -1, 0, 0); // Open file in default/read-only mode.
            cstream.init(fstream, "UTF-8", 0, 0);

            const str = {};
            let read = 0;

            do {
              // Read as much as we can and put it in str.value.
              read = cstream.readString(0xffffffff, str);
              data += str.value;
            } while (read != 0);
          } catch (e) {
            const title = getComposeBundle().getString("errorFileMessageTitle");
            const msg = getComposeBundle().getFormattedString(
              "errorLoadFileMessageMessage",
              [args.message]
            );
            Services.prompt.alert(null, title, msg);
          } finally {
            if (cstream) {
              cstream.close();
            }
            if (fstream) {
              fstream.close();
            }
          }

          if (data) {
            const pos = data.search(/\S/); // Find first non-whitespace character.

            if (
              params.format != Ci.nsIMsgCompFormat.PlainText &&
              (args.message.endsWith(".htm") ||
                args.message.endsWith(".html") ||
                data.substr(pos, 14).toLowerCase() == "<!doctype html" ||
                data.substr(pos, 5).toLowerCase() == "<html")
            ) {
              // We replace line breaks because otherwise they'll be converted to
              // <br> in nsMsgCompose::BuildBodyMessageAndSignature().
              // Don't do the conversion if the user asked explicitly for plain text.
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

  // Detect correct identity when missing or mismatched. An identity with no
  // email is likely not valid.
  // When editing a draft, 'params.identity' is pre-populated with the identity
  // that created the draft or the identity owning the draft folder for a
  // "foreign" draft, see ComposeMessage() in mailCommands.js. We don't want the
  // latter so use the creator identity which could be null.
  // Only do this detection for drafts and templates.
  // Redirect will have from set as the original sender and we don't want to
  // warn about that.
  if (
    gComposeType == Ci.nsIMsgCompType.Draft ||
    gComposeType == Ci.nsIMsgCompType.Template
  ) {
    const creatorKey = params.composeFields.creatorIdentityKey;
    params.identity = creatorKey
      ? MailServices.accounts.getIdentity(creatorKey)
      : null;
  }

  let from = null;
  // Get the from address from the headers. For Redirect, from is set to
  // the original author, so don't look at it here.
  if (params.composeFields.from && gComposeType != Ci.nsIMsgCompType.Redirect) {
    const fromAddrs = MailServices.headerParser.parseEncodedHeader(
      params.composeFields.from,
      null
    );
    if (fromAddrs.length) {
      from = fromAddrs[0].email.toLowerCase();
    }
  }

  if (
    !params.identity ||
    !params.identity.email ||
    (from && !emailSimilar(from, params.identity.email))
  ) {
    const identities = MailServices.accounts.allIdentities;
    let suitableCount = 0;

    // Search for a matching identity.
    if (from) {
      for (const ident of identities) {
        if (ident.email && from == ident.email.toLowerCase()) {
          if (suitableCount == 0) {
            params.identity = ident;
          }
          suitableCount++;
          if (suitableCount > 1) {
            // No need to find more, it's already not unique.
            break;
          }
        }
      }
    }

    if (!params.identity || !params.identity.email) {
      let identity = null;
      // No preset identity and no match, so use the default account.
      const defaultAccount = MailServices.accounts.defaultAccount;
      if (defaultAccount) {
        identity = defaultAccount.defaultIdentity;
      }
      if (!identity) {
        // Get the first identity we have in the list.
        const identitykey = identityList
          .getItemAtIndex(0)
          .getAttribute("identitykey");
        identity = MailServices.accounts.getIdentity(identitykey);
      }
      params.identity = identity;
    }

    // Warn if no or more than one match was found.
    // But don't warn for +suffix additions (a+b@c.com).
    if (
      from &&
      (suitableCount > 1 ||
        (suitableCount == 0 && !emailSimilar(from, params.identity.email)))
    ) {
      gComposeNotificationBar.setIdentityWarning(params.identity.identityName);
    }
  }

  if (params.identity) {
    identityList.selectedItem = identityList.getElementsByAttribute(
      "identitykey",
      params.identity.key
    )[0];
  }

  // Here we set the From from the original message, be it a draft or another
  // message, for example a template, we want to "edit as new".
  // Only do this if the message is our own draft or template or any type of reply.
  if (
    params.composeFields.from &&
    (params.composeFields.creatorIdentityKey ||
      gComposeType == Ci.nsIMsgCompType.Reply ||
      gComposeType == Ci.nsIMsgCompType.ReplyAll ||
      gComposeType == Ci.nsIMsgCompType.ReplyToSender ||
      gComposeType == Ci.nsIMsgCompType.ReplyToGroup ||
      gComposeType == Ci.nsIMsgCompType.ReplyToSenderAndGroup ||
      gComposeType == Ci.nsIMsgCompType.ReplyToList)
  ) {
    const from = MailServices.headerParser
      .parseEncodedHeader(params.composeFields.from, null)
      .join(", ");
    if (from != identityList.value) {
      MakeFromFieldEditable(true);
      identityList.value = from;
    }
  }
  LoadIdentity(true);

  // Get the <editor> element to startup an editor
  var editorElement = GetCurrentEditorElement();

  // Remember the original message URI. When editing a draft which is a reply
  // or forwarded message, this gets overwritten by the ancestor's message URI so
  // the disposition flags ("replied" or "forwarded") can be set on the ancestor.
  // For our purposes we need the URI of the message being processed, not its
  // original ancestor.
  gOriginalMsgURI = params.originalMsgURI;
  gMsgCompose = MailServices.compose.initCompose(
    params,
    window,
    editorElement.docShell
  );

  // If a message is a draft, we rely on draft status flags to decide
  // about encryption setting. Don't set gIsRelatedToEncryptedOriginal
  // simply because a message was saved as an encrypted draft, because
  // we save draft messages encrypted as soon as the account is able
  // to encrypt, regardless of the user's desire for encryption for
  // this message.

  if (
    gComposeType != Ci.nsIMsgCompType.Draft &&
    gComposeType != Ci.nsIMsgCompType.Template &&
    gEncryptedURIService &&
    gEncryptedURIService.isEncrypted(gMsgCompose.originalMsgURI)
  ) {
    gIsRelatedToEncryptedOriginal = true;
  }

  gMsgCompose.addMsgSendListener(gSendListener);

  document
    .getElementById("dsnMenu")
    .setAttribute("checked", gMsgCompose.compFields.DSN);
  document
    .getElementById("cmd_attachVCard")
    .setAttribute("checked", gMsgCompose.compFields.attachVCard);
  document
    .getElementById("cmd_attachPublicKey")
    .setAttribute("checked", gAttachMyPublicPGPKey);
  toggleAttachmentReminder(gMsgCompose.compFields.attachmentReminder);
  initSendFormatMenu();

  const editortype = gMsgCompose.composeHTML ? "htmlmail" : "textmail";
  editorElement.makeEditable(editortype, true);

  // setEditorType MUST be called before setContentWindow
  if (gMsgCompose.composeHTML) {
    initLocalFontFaceMenu(document.getElementById("FontFacePopup"));
  } else {
    // We are editing in plain text mode, so hide the formatting menus and the
    // output format selector.
    document.getElementById("FormatToolbar").hidden = true;
    document.getElementById("formatMenu").hidden = true;
    document.getElementById("insertMenu").hidden = true;
    document.getElementById("menu_showFormatToolbar").hidden = true;
    document.getElementById("outputFormatMenu").hidden = true;
  }

  // Do setup common to Message Composer and Web Composer.
  EditorSharedStartup();
  ToggleReturnReceipt(gMsgCompose.compFields.returnReceipt);

  if (params.bodyIsLink) {
    let body = gMsgCompose.compFields.body;
    if (gMsgCompose.composeHTML) {
      let cleanBody;
      try {
        cleanBody = decodeURI(body);
      } catch (e) {
        cleanBody = body;
      }

      body = body.replace(/&/g, "&amp;");
      gMsgCompose.compFields.body =
        '<br /><a href="' + body + '">' + cleanBody + "</a><br />";
    } else {
      gMsgCompose.compFields.body = "\n<" + body + ">\n";
    }
  }

  document.getElementById("msgSubject").value = gMsgCompose.compFields.subject;

  // Do not await async calls before registering the stateListener, otherwise it
  // will miss states.
  gMsgCompose.RegisterStateListener(stateListener);

  const addedAttachmentItems = await AddAttachments(
    gMsgCompose.compFields.attachments,
    false
  );
  // If any of the pre-loaded attachments is a cloudFile, this is most probably a
  // re-opened draft. Restore the cloudFile information.
  for (const attachmentItem of addedAttachmentItems) {
    if (
      attachmentItem.attachment.sendViaCloud &&
      attachmentItem.attachment.contentLocation &&
      attachmentItem.attachment.cloudFileAccountKey &&
      attachmentItem.attachment.cloudPartHeaderData
    ) {
      const byteString = atob(attachmentItem.attachment.cloudPartHeaderData);
      const uploadFromDraft = JSON.parse(
        MailStringUtils.byteStringToString(byteString)
      );
      if (uploadFromDraft && uploadFromDraft.path && uploadFromDraft.name) {
        let cloudFileUpload;
        const cloudFileAccount = cloudFileAccounts.getAccount(
          attachmentItem.attachment.cloudFileAccountKey
        );
        const bigFile = Cc["@mozilla.org/file/local;1"].createInstance(
          Ci.nsIFile
        );
        bigFile.initWithPath(uploadFromDraft.path);

        if (cloudFileAccount) {
          // Try to find the upload for the draft attachment in the already known
          // uploads.
          cloudFileUpload = cloudFileAccount
            .getPreviousUploads()
            .find(
              upload =>
                upload.url == attachmentItem.attachment.contentLocation &&
                upload.url == uploadFromDraft.url &&
                upload.id == uploadFromDraft.id &&
                upload.name == uploadFromDraft.name &&
                upload.size == uploadFromDraft.size &&
                upload.path == uploadFromDraft.path &&
                upload.serviceName == uploadFromDraft.serviceName &&
                upload.serviceIcon == uploadFromDraft.serviceIcon &&
                upload.serviceUrl == uploadFromDraft.serviceUrl &&
                upload.downloadPasswordProtected ==
                  uploadFromDraft.downloadPasswordProtected &&
                upload.downloadLimit == uploadFromDraft.downloadLimit &&
                upload.downloadExpiryDate == uploadFromDraft.downloadExpiryDate
            );
          if (!cloudFileUpload) {
            // Create a new upload from the data stored in the draft.
            cloudFileUpload = cloudFileAccount.newUploadForFile(
              bigFile,
              uploadFromDraft
            );
          }
          // A restored cloudFile may have been send/used already in a previous
          // session, or may be changed and reverted again by not saving a draft.
          // Mark it as immutable.
          cloudFileAccount.markAsImmutable(cloudFileUpload.id);
          attachmentItem.cloudFileAccount = cloudFileAccount;
          attachmentItem.cloudFileUpload = cloudFileUpload;
        } else {
          attachmentItem.cloudFileUpload = uploadFromDraft;
          delete attachmentItem.cloudFileUpload.id;
        }

        // Restore file information from the linked real file.
        attachmentItem.attachment.name = uploadFromDraft.name;
        attachmentItem.attachment.size = uploadFromDraft.size;
        let bigAttachment;
        if (bigFile.exists()) {
          bigAttachment = FileToAttachment(bigFile);
        }
        if (bigAttachment && bigAttachment.size == uploadFromDraft.size) {
          // Remove the temporary html placeholder file.
          const uri = Services.io
            .newURI(attachmentItem.attachment.url)
            .QueryInterface(Ci.nsIFileURL);
          await IOUtils.remove(uri.file.path);

          attachmentItem.attachment.url = bigAttachment.url;
          attachmentItem.attachment.contentType = "";
          attachmentItem.attachment.temporary = false;
        }

        await updateAttachmentItemProperties(attachmentItem);
        continue;
      }
    }
    // Did not find the required data in the draft to reconstruct the cloudFile
    // information. Fall back to no-draft-restore-support.
    attachmentItem.attachment.sendViaCloud = false;
  }

  if (Services.prefs.getBoolPref("mail.compose.show_attachment_pane")) {
    toggleAttachmentPane("show");
  }

  // Fill custom headers.
  const otherHeaders = Services.prefs
    .getCharPref("mail.compose.other.header", "")
    .split(",")
    .map(h => h.trim())
    .filter(Boolean);
  for (let i = 0; i < otherHeaders.length; i++) {
    if (gMsgCompose.compFields.otherHeaders[i]) {
      const row = document.getElementById(`addressRow${otherHeaders[i]}`);
      addressRowSetVisibility(row, true);
      const input = document.getElementById(`${otherHeaders[i]}AddrInput`);
      input.value = gMsgCompose.compFields.otherHeaders[i];
    }
  }

  document
    .getElementById("msgcomposeWindow")
    .dispatchEvent(
      new Event("compose-window-init", { bubbles: false, cancelable: true })
    );

  dispatchAttachmentBucketEvent(
    "attachments-added",
    gMsgCompose.compFields.attachments
  );

  // Add an observer to be called when document is done loading,
  // which creates the editor.
  try {
    GetCurrentCommandManager().addCommandObserver(
      gMsgEditorCreationObserver,
      "obs_documentCreated"
    );

    // Load empty page to create the editor. The "?compose" is there so this
    // URL does not exactly match "about:blank", which has some drawbacks. In
    // particular it prevents WebExtension content scripts from running in
    // this document.
    const loadURIOptions = {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    };
    editorElement.webNavigation.loadURI(
      Services.io.newURI("about:blank?compose"),
      loadURIOptions
    );
  } catch (e) {
    console.error(e);
  }

  gEditingDraft = gMsgCompose.compFields.draftId;

  // Set up contacts sidebar.
  const pageURL = document.URL;
  const contactsSplitter = document.getElementById("contactsSplitter");
  const contactsShown = Services.xulStore.getValue(
    pageURL,
    "contactsSplitter",
    "shown"
  );
  const contactsWidth = Services.xulStore.getValue(
    pageURL,
    "contactsSplitter",
    "width"
  );
  contactsSplitter.width =
    contactsWidth == "" ? null : parseFloat(contactsWidth);
  setContactsSidebarVisibility(contactsShown == "true", false);
  contactsSplitter.addEventListener("splitter-resized", () => {
    const width = contactsSplitter.width;
    Services.xulStore.setValue(
      pageURL,
      "contactsSplitter",
      "width",
      width == null ? "" : String(width)
    );
  });
  contactsSplitter.addEventListener("splitter-collapsed", () => {
    Services.xulStore.setValue(pageURL, "contactsSplitter", "shown", "false");
  });
  contactsSplitter.addEventListener("splitter-expanded", () => {
    Services.xulStore.setValue(pageURL, "contactsSplitter", "shown", "true");
  });

  // Update the priority button.
  if (gMsgCompose.compFields.priority) {
    updatePriorityToolbarButton(gMsgCompose.compFields.priority);
  }

  gAutoSaveInterval = Services.prefs.getBoolPref("mail.compose.autosave")
    ? Services.prefs.getIntPref("mail.compose.autosaveinterval") * 60000
    : 0;

  if (gAutoSaveInterval) {
    gAutoSaveTimeout = setTimeout(AutoSave, gAutoSaveInterval);
  }

  gAutoSaveKickedIn = false;
}
/* eslint-enable complexity */

function splitEmailAddress(aEmail) {
  const at = aEmail.lastIndexOf("@");
  return at != -1 ? [aEmail.slice(0, at), aEmail.slice(at + 1)] : [aEmail, ""];
}

// Emails are equal ignoring +suffixes (email+suffix@example.com).
function emailSimilar(a, b) {
  if (!a || !b) {
    return a == b;
  }
  a = splitEmailAddress(a.toLowerCase());
  b = splitEmailAddress(b.toLowerCase());
  return a[1] == b[1] && a[0].split("+", 1)[0] == b[0].split("+", 1)[0];
}

// The new, nice, simple way of getting notified when a new editor has been created
var gMsgEditorCreationObserver = {
  observe(aSubject, aTopic, aData) {
    if (aTopic == "obs_documentCreated") {
      var editor = GetCurrentEditor();
      if (editor && GetCurrentCommandManager() == aSubject) {
        InitEditor();
      }
      // Now that we know this document is an editor, update commands now if
      // the document has focus, or next time it receives focus via
      // CommandUpdate_MsgCompose()
      if (gLastWindowToHaveFocus == document.commandDispatcher.focusedWindow) {
        updateComposeItems();
      } else {
        gLastWindowToHaveFocus = null;
      }
    }
  },
};

/**
 * Adjust sign/encrypt settings after the identity was switched.
 *
 * @param {?nsIMsgIdentity} prevIdentity - The previously selected
 *   identity, when switching to a different identity.
 *   Null on initial identity setup.
 */
async function adjustEncryptAfterIdentityChange(prevIdentity) {
  const identityHasConfiguredSMIME =
    isSmimeSigningConfigured() || isSmimeEncryptionConfigured();

  const identityHasConfiguredOpenPGP = isPgpConfigured();

  // Show widgets based on the technologies available across all identities.
  const allEmailIdentities = MailServices.accounts.allIdentities.filter(
    i => i.email
  );
  const anyIdentityHasConfiguredOpenPGP = allEmailIdentities.some(i =>
    i.getUnicharAttribute("openpgp_key_id")
  );
  const anyIdentityHasConfiguredSMIMEEncryption = allEmailIdentities.some(i =>
    i.getUnicharAttribute("encryption_cert_name")
  );

  // Disable encryption widgets if this identity has no encryption configured.
  // However, if encryption is currently enabled, we must keep it enabled,
  // to allow the user to manually disable encryption (we don't disable
  // encryption automatically, as the user might have seen that it is
  // enabled and might rely on it).
  const e2eeConfigured =
    identityHasConfiguredOpenPGP || identityHasConfiguredSMIME;

  const autoEnablePref = Services.prefs.getBoolPref(
    "mail.e2ee.auto_enable",
    false
  );

  // If neither OpenPGP nor SMIME are configured for any identity,
  // then hide the entire menu.
  const encOpt = document.getElementById("button-encryption-options");
  if (encOpt) {
    encOpt.hidden =
      !anyIdentityHasConfiguredOpenPGP &&
      !anyIdentityHasConfiguredSMIMEEncryption;
    encOpt.disabled = !e2eeConfigured && !gSendEncrypted;
    document.getElementById("encTech_OpenPGP_Toolbar").disabled =
      !identityHasConfiguredOpenPGP;
    document.getElementById("encTech_SMIME_Toolbar").disabled =
      !identityHasConfiguredSMIME;
  }
  document.getElementById("encryptionMenu").hidden =
    !anyIdentityHasConfiguredOpenPGP &&
    !anyIdentityHasConfiguredSMIMEEncryption;

  // Show menu items only if both technologies are available.
  document.getElementById("encTech_OpenPGP_Menubar").hidden =
    !anyIdentityHasConfiguredOpenPGP ||
    !anyIdentityHasConfiguredSMIMEEncryption;
  document.getElementById("encTech_SMIME_Menubar").hidden =
    !anyIdentityHasConfiguredOpenPGP ||
    !anyIdentityHasConfiguredSMIMEEncryption;
  document.getElementById("encryptionOptionsSeparator_Menubar").hidden =
    !anyIdentityHasConfiguredOpenPGP ||
    !anyIdentityHasConfiguredSMIMEEncryption;

  const encToggle = document.getElementById("button-encryption");
  if (encToggle) {
    encToggle.disabled = !e2eeConfigured && !gSendEncrypted;
  }
  const sigToggle = document.getElementById("button-signing");
  if (sigToggle) {
    sigToggle.disabled = !e2eeConfigured;
  }

  document.getElementById("encryptionMenu").disabled =
    !e2eeConfigured && !gSendEncrypted;

  // Enable the encryption menus of the technologies that are configured for
  // this identity.
  document.getElementById("encTech_OpenPGP_Menubar").disabled =
    !identityHasConfiguredOpenPGP;

  document.getElementById("encTech_SMIME_Menubar").disabled =
    !identityHasConfiguredSMIME;

  if (!prevIdentity) {
    // For identities without any e2ee setup, we want a good default
    // technology selection. Avoid a technology that isn't configured
    // anywhere.

    if (identityHasConfiguredOpenPGP) {
      gSelectedTechnologyIsPGP = true;
    } else if (identityHasConfiguredSMIME) {
      gSelectedTechnologyIsPGP = false;
    } else {
      gSelectedTechnologyIsPGP = anyIdentityHasConfiguredOpenPGP;
    }

    if (identityHasConfiguredOpenPGP) {
      if (!identityHasConfiguredSMIME) {
        gSelectedTechnologyIsPGP = true;
      } else {
        // both are configured
        const techPref = gCurrentIdentity.getIntAttribute("e2etechpref");
        gSelectedTechnologyIsPGP = techPref != 1;
      }
    }

    gSendSigned = false;

    if (autoEnablePref) {
      gSendEncrypted = gIsRelatedToEncryptedOriginal;
    } else {
      gSendEncrypted =
        gIsRelatedToEncryptedOriginal ||
        ((identityHasConfiguredOpenPGP || identityHasConfiguredSMIME) &&
          gCurrentIdentity.encryptionPolicy > 0);
    }

    await checkEncryptionState();
    return;
  }

  // Not initialCall (switching from, or changed recipients)

  // If the new identity has only one technology configured,
  // which is different than the currently selected technology,
  // then switch over to that other technology.
  // However, if the new account doesn't have any technology
  // configured, then it doesn't really matter, so let's keep what's
  // currently selected for consistency (in case the user switches
  // the identity again).
  if (
    gSelectedTechnologyIsPGP &&
    !identityHasConfiguredOpenPGP &&
    identityHasConfiguredSMIME
  ) {
    gSelectedTechnologyIsPGP = false;
  } else if (
    !gSelectedTechnologyIsPGP &&
    !identityHasConfiguredSMIME &&
    identityHasConfiguredOpenPGP
  ) {
    gSelectedTechnologyIsPGP = true;
  }

  if (
    !autoEnablePref &&
    !gSendEncrypted &&
    !gUserTouchedEncryptSubject &&
    prevIdentity.encryptionPolicy == 0 &&
    gCurrentIdentity.encryptionPolicy > 0
  ) {
    gSendEncrypted = true;
  }

  await checkEncryptionState();
}

async function ComposeLoad() {
  updateTroubleshootMenuItem();
  const otherHeaders = Services.prefs
    .getCharPref("mail.compose.other.header", "")
    .split(",")
    .map(h => h.trim())
    .filter(Boolean);

  AddMessageComposeOfflineQuitObserver();

  BondOpenPGP.init();

  // Give the message header a minimum height based on its current height,
  // before more recipient rows are revealed in #extraAddressRowsArea. This
  // ensures that the area cannot be shrunk below its current height by the
  // #headersSplitter.
  // NOTE: At this stage, we only expect the "To" row to be visible within the
  // recipients container.
  const messageHeader = document.getElementById("MsgHeadersToolbar");
  const recipientsContainer = document.getElementById("recipientsContainer");
  // In the unlikely situation where the recipients container is already
  // overflowing, we make sure to increase the minHeight by the overflow.
  const headerHeight =
    messageHeader.clientHeight +
    recipientsContainer.scrollHeight -
    recipientsContainer.clientHeight;
  messageHeader.style.minHeight = `${headerHeight}px`;

  // Setup the attachment bucket.
  gAttachmentBucket = document.getElementById("attachmentBucket");

  const attachmentArea = document.getElementById("attachmentArea");
  attachmentArea.addEventListener("toggle", attachmentAreaOnToggle);

  // Setup the attachment animation counter.
  gAttachmentCounter = document.getElementById("newAttachmentIndicator");
  gAttachmentCounter.addEventListener(
    "animationend",
    toggleAttachmentAnimation
  );

  // Set up the drag & drop event listeners.
  const messageArea = document.getElementById("messageArea");
  messageArea.addEventListener("dragover", event =>
    envelopeDragObserver.onDragOver(event)
  );
  messageArea.addEventListener("dragleave", event =>
    envelopeDragObserver.onDragLeave(event)
  );
  messageArea.addEventListener("drop", event =>
    envelopeDragObserver.onDrop(event)
  );

  // Setup the attachment overlay animation listeners.
  const overlay = document.getElementById("dropAttachmentOverlay");
  overlay.addEventListener("animationend", e => {
    // Make the overlay constantly visible If the user is dragging a file over
    // the compose windown.
    if (e.animationName == "showing-animation") {
      // We don't remove the "showing" class here since the dragOver event will
      // keep adding it and we would have a flashing effect.
      overlay.classList.add("show");
      return;
    }

    // Permanently hide the overlay after the hiding animation ended.
    if (e.animationName == "hiding-animation") {
      overlay.classList.remove("show", "hiding");
      // Remove the hover class from the child items to reset the style.
      document.getElementById("addInline").classList.remove("hover");
      document.getElementById("addAsAttachment").classList.remove("hover");
    }
  });

  if (otherHeaders) {
    const extraAddressRowsMenu = document.getElementById(
      "extraAddressRowsMenu"
    );

    const existingTypes = Array.from(
      document.querySelectorAll(".address-row"),
      row => row.dataset.recipienttype
    );

    for (let header of otherHeaders) {
      if (existingTypes.includes(header)) {
        continue;
      }
      existingTypes.push(header);

      header = header.trim();
      const recipient = {
        rowId: `addressRow${header}`,
        labelId: `${header}AddrLabel`,
        containerId: `${header}AddrContainer`,
        inputId: `${header}AddrInput`,
        showRowMenuItemId: `${header}ShowAddressRowMenuItem`,
        type: header,
      };

      const newEls = recipientsContainer.buildRecipientRow(recipient, true);

      recipientsContainer.appendChild(newEls.row);
      extraAddressRowsMenu.appendChild(newEls.showRowMenuItem);
    }
  }

  try {
    SetupCommandUpdateHandlers();
    await ComposeStartup();
  } catch (ex) {
    console.error(ex);
    Services.prompt.alert(
      window,
      getComposeBundle().getString("initErrorDlogTitle"),
      getComposeBundle().getString("initErrorDlgMessage")
    );

    MsgComposeCloseWindow();
    return;
  }

  ToolbarIconColor.init();

  // initialize the customizeDone method on the customizeable toolbar
  var toolbox = document.getElementById("compose-toolbox");
  toolbox.customizeDone = function (aEvent) {
    MailToolboxCustomizeDone(aEvent, "CustomizeComposeToolbar");
  };

  updateAttachmentPane();
  updateAriaLabelsAndTooltipsOfAllAddressRows();

  for (const input of document.querySelectorAll(".address-row-input")) {
    input.onBeforeHandleKeyDown = event =>
      addressInputOnBeforeHandleKeyDown(event);
  }

  top.controllers.appendController(SecurityController);
  gMsgCompose.compFields.composeSecure = null;
  gSMFields = Cc[
    "@mozilla.org/messengercompose/composesecure;1"
  ].createInstance(Ci.nsIMsgComposeSecure);
  if (gSMFields) {
    gMsgCompose.compFields.composeSecure = gSMFields;
  }

  // Set initial encryption settings.
  adjustEncryptAfterIdentityChange(null);

  ExtensionParent.apiManager.emit(
    "extension-browser-inserted",
    GetCurrentEditorElement()
  );

  setComposeLabelsAndMenuItems();
  setKeyboardShortcuts();

  gFocusAreas = [
    {
      // #abContactsPanel.
      // NOTE: If focus is within the browser shadow document, then the
      // top.document.activeElement points to the browser, which is below
      // #contactsSidebar.
      root: document.getElementById("contactsSidebar"),
      focus: focusContactsSidebarSearchInput,
    },
    {
      // #msgIdentity, .recipient-button and #extraAddressRowsMenuButton.
      root: document.getElementById("top-gradient-box"),
      focus: focusMsgIdentity,
    },
    ...Array.from(document.querySelectorAll(".address-row"), row => {
      return { root: row, focus: focusAddressRowInput };
    }),
    {
      root: document.getElementById("subject-box"),
      focus: focusSubjectInput,
    },
    // "#FormatToolbox" cannot receive focus.
    {
      // #messageEditor and #FindToolbar
      root: document.getElementById("messageArea"),
      focus: focusMsgBody,
    },
    {
      root: document.getElementById("attachmentArea"),
      focus: focusAttachmentBucket,
    },
    {
      root: document.getElementById("compose-notification-bottom"),
      focus: focusNotification,
    },
    {
      root: document.getElementById("status-bar"),
      focus: focusStatusBar,
    },
  ];

  UIDensity.registerWindow(window);
  UIFontSize.registerWindow(window);
}

/**
 * Add fluent strings to labels and menu items requiring a shortcut key.
 */
function setComposeLabelsAndMenuItems() {
  // To field.
  document.l10n.setAttributes(
    document.getElementById("menu_showToField"),
    "show-to-row-main-menuitem",
    {
      key: SHOW_TO_KEY,
    }
  );
  document.l10n.setAttributes(
    document.getElementById("addr_toShowAddressRowMenuItem"),
    "show-to-row-extra-menuitem"
  );
  document.l10n.setAttributes(
    document.getElementById("addr_toShowAddressRowButton"),
    "show-to-row-button",
    {
      key: SHOW_TO_KEY,
    }
  );

  // Cc field.
  document.l10n.setAttributes(
    document.getElementById("menu_showCcField"),
    "show-cc-row-main-menuitem",
    {
      key: SHOW_CC_KEY,
    }
  );
  document.l10n.setAttributes(
    document.getElementById("addr_ccShowAddressRowMenuItem"),
    "show-cc-row-extra-menuitem"
  );
  document.l10n.setAttributes(
    document.getElementById("addr_ccShowAddressRowButton"),
    "show-cc-row-button",
    {
      key: SHOW_CC_KEY,
    }
  );

  // Bcc field.
  document.l10n.setAttributes(
    document.getElementById("menu_showBccField"),
    "show-bcc-row-main-menuitem",
    {
      key: SHOW_BCC_KEY,
    }
  );
  document.l10n.setAttributes(
    document.getElementById("addr_bccShowAddressRowMenuItem"),
    "show-bcc-row-extra-menuitem"
  );
  document.l10n.setAttributes(
    document.getElementById("addr_bccShowAddressRowButton"),
    "show-bcc-row-button",
    {
      key: SHOW_BCC_KEY,
    }
  );
}

/**
 * Add a keydown document event listener for international keyboard shortcuts.
 */
async function setKeyboardShortcuts() {
  const [filePickerKey, toggleBucketKey] = await l10nCompose.formatValues([
    { id: "trigger-attachment-picker-key" },
    { id: "toggle-attachment-pane-key" },
  ]);

  document.addEventListener("keydown", event => {
    // Return if we don't have the right modifier combination, CTRL/CMD + SHIFT,
    // or if the pressed key is a modifier (each modifier will keep firing
    // keydown event until another key is pressed in addition).
    if (
      !(AppConstants.platform == "macosx" ? event.metaKey : event.ctrlKey) ||
      !event.shiftKey ||
      ["Shift", "Control", "Meta"].includes(event.key)
    ) {
      return;
    }

    // Always use lowercase to compare the key and avoid OS inconsistencies:
    // For Cmd/Ctrl+Shift+A, on Mac, key = "a" vs. on Windows/Linux, key = "A".
    switch (event.key.toLowerCase()) {
      // Always prevent the default behavior of the keydown if we intercepted
      // the key in order to avoid triggering OS specific shortcuts.
      case filePickerKey.toLowerCase():
        // Ctrl/Cmd+Shift+A.
        event.preventDefault();
        goDoCommand("cmd_attachFile");
        break;
      case toggleBucketKey.toLowerCase():
        // Ctrl/Cmd+Shift+M.
        event.preventDefault();
        goDoCommand("cmd_toggleAttachmentPane");
        break;
      case SHOW_TO_KEY.toLowerCase():
        // Ctrl/Cmd+Shift+T.
        event.preventDefault();
        showAndFocusAddressRow("addressRowTo");
        break;
      case SHOW_CC_KEY.toLowerCase():
        // Ctrl/Cmd+Shift+C.
        event.preventDefault();
        showAndFocusAddressRow("addressRowCc");
        break;
      case SHOW_BCC_KEY.toLowerCase():
        // Ctrl/Cmd+Shift+B.
        event.preventDefault();
        showAndFocusAddressRow("addressRowBcc");
        break;
    }
  });

  document.addEventListener("keypress", event => {
    // If the user presses Esc and the drop attachment overlay is still visible,
    // call the onDragLeave() method to properly hide it.
    if (
      event.key == "Escape" &&
      document
        .getElementById("dropAttachmentOverlay")
        .classList.contains("show")
    ) {
      envelopeDragObserver.onDragLeave(event);
    }
  });
}

function ComposeUnload() {
  // Send notification that the window is going away completely.
  document
    .getElementById("msgcomposeWindow")
    .dispatchEvent(
      new Event("compose-window-unload", { bubbles: false, cancelable: false })
    );

  GetCurrentCommandManager().removeCommandObserver(
    gMsgEditorCreationObserver,
    "obs_documentCreated"
  );
  UnloadCommandUpdateHandlers();

  // In some tests, the window is closed so quickly that the observer
  // hasn't fired and removed itself yet, so let's remove it here.
  spellCheckReadyObserver.removeObserver();
  // Stop spell checker so personal dictionary is saved.
  enableInlineSpellCheck(false);

  EditorCleanup();

  if (gMsgCompose) {
    gMsgCompose.removeMsgSendListener(gSendListener);
  }

  RemoveMessageComposeOfflineQuitObserver();
  gAttachmentNotifier.shutdown();
  ToolbarIconColor.uninit();

  // Stop observing dictionary removals.
  dictionaryRemovalObserver.removeObserver();

  if (gMsgCompose) {
    // Notify the SendListener that Send has been aborted and Stopped
    gMsgCompose.onSendNotPerformed(null, Cr.NS_ERROR_ABORT);
    gMsgCompose.UnregisterStateListener(stateListener);
  }
  if (gAutoSaveTimeout) {
    clearTimeout(gAutoSaveTimeout);
  }
  if (msgWindow) {
    msgWindow.closeWindow();
  }

  ReleaseGlobalVariables();

  top.controllers.removeController(SecurityController);

  // This destroys the window for us.
  MsgComposeCloseWindow();
}

function onEncryptionChoice(value) {
  switch (value) {
    case "OpenPGP":
      if (isPgpConfigured()) {
        gSelectedTechnologyIsPGP = true;
        checkEncryptionState();
      }
      break;

    case "SMIME":
      if (isSmimeEncryptionConfigured()) {
        gSelectedTechnologyIsPGP = false;
        checkEncryptionState();
      }
      break;

    case "enc":
      toggleEncryptMessage();
      break;

    case "encsub":
      gEncryptSubject = !gEncryptSubject;
      gUserTouchedEncryptSubject = true;
      updateEncryptedSubject();
      break;

    case "sig":
      toggleGlobalSignMessage();
      break;

    case "status":
      showMessageComposeSecurityStatus();
      break;

    case "manager":
      openKeyManager();
      break;
  }
}

var SecurityController = {
  supportsCommand(command) {
    switch (command) {
      case "cmd_viewSecurityStatus":
        return true;

      default:
        return false;
    }
  },

  isCommandEnabled(command) {
    switch (command) {
      case "cmd_viewSecurityStatus":
        return true;

      default:
        return false;
    }
  },
};

function updateEncryptOptionsMenuElements() {
  const encOpt = document.getElementById("button-encryption-options");
  if (encOpt) {
    document.l10n.setAttributes(
      encOpt,
      gSelectedTechnologyIsPGP
        ? "encryption-options-openpgp"
        : "encryption-options-smime"
    );
    document.l10n.setAttributes(
      document.getElementById("menu_recipientStatus_Toolbar"),
      gSelectedTechnologyIsPGP ? "menu-manage-keys" : "menu-view-certificates"
    );
    document.getElementById("menu_securityEncryptSubject_Toolbar").hidden =
      !gSelectedTechnologyIsPGP;
  }
  document.l10n.setAttributes(
    document.getElementById("menu_recipientStatus_Menubar"),
    gSelectedTechnologyIsPGP ? "menu-manage-keys" : "menu-view-certificates"
  );
  document.getElementById("menu_securityEncryptSubject_Menubar").hidden =
    !gSelectedTechnologyIsPGP;
}

/**
 * Update the aria labels of all non-custom address inputs and all pills in the
 * addressing area. Also update the tooltips of the close labels of all address
 * rows, including custom header fields.
 */
async function updateAriaLabelsAndTooltipsOfAllAddressRows() {
  for (const row of document
    .getElementById("recipientsContainer")
    .querySelectorAll(".address-row")) {
    updateAriaLabelsOfAddressRow(row);
    updateTooltipsOfAddressRow(row);
  }
}

/**
 * Update the aria labels of the address input and all pills of an address row.
 * This is needed whenever a pill gets added or removed, because the aria label
 * of each pill contains the current count of all pills in that row ("1 of n").
 *
 * @param {Element} row - The address row.
 */
async function updateAriaLabelsOfAddressRow(row) {
  // Bail out for custom header input where pills are disabled.
  if (row.classList.contains("address-row-raw")) {
    return;
  }
  const input = row.querySelector(".address-row-input");

  const type = row.querySelector(".address-label-container > label").value;
  const pills = row.querySelectorAll("mail-address-pill");

  input.setAttribute(
    "aria-label",
    await l10nCompose.formatValue("address-input-type-aria-label", {
      type,
      count: pills.length,
    })
  );

  for (const pill of pills) {
    pill.setAttribute(
      "aria-label",
      await l10nCompose.formatValue("pill-aria-label", {
        email: pill.fullAddress,
        count: pills.length,
      })
    );
  }
}

/**
 * Update the tooltip of the close label of an address row.
 *
 * @param {Element} row - The address row.
 */
function updateTooltipsOfAddressRow(row) {
  const type = row.querySelector(".address-label-container > label").value;
  const el = row.querySelector(".remove-field-button");
  document.l10n.setAttributes(el, "remove-address-row-button", { type });
}

function onSendSMIME() {
  const emailAddresses = [];

  try {
    if (!gMsgCompose.compFields.composeSecure.requireEncryptMessage) {
      return;
    }

    for (const email of getEncryptionCompatibleRecipients()) {
      if (!gSMFields.haveValidCertForEmail(email)) {
        emailAddresses.push(email);
      }
    }
  } catch (e) {
    return;
  }

  if (emailAddresses.length == 0) {
    return;
  }

  // The rules here: If the current identity has a directoryServer set, then
  // use that, otherwise, try the global preference instead.

  let autocompleteDirectory;

  // Does the current identity override the global preference?
  if (gCurrentIdentity.overrideGlobalPref) {
    autocompleteDirectory = gCurrentIdentity.directoryServer;
  } else if (Services.prefs.getBoolPref("ldap_2.autoComplete.useDirectory")) {
    // Try the global one
    autocompleteDirectory = Services.prefs.getCharPref(
      "ldap_2.autoComplete.directoryServer"
    );
  }

  if (autocompleteDirectory) {
    window.openDialog(
      "chrome://messenger-smime/content/certFetchingStatus.xhtml",
      "",
      "chrome,modal,resizable,centerscreen",
      autocompleteDirectory,
      emailAddresses
    );
  }
}

// Add-ons can override this to customize the behavior.
function DoSpellCheckBeforeSend() {
  return Services.prefs.getBoolPref("mail.SpellCheckBeforeSend");
}

/**
 * Updates gMsgCompose.compFields to match the UI.
 *
 * @returns {nsIMsgCompFields}
 */
function GetComposeDetails() {
  const msgCompFields = gMsgCompose.compFields;

  Recipients2CompFields(msgCompFields);
  const addresses = MailServices.headerParser.makeFromDisplayAddress(
    document.getElementById("msgIdentity").value
  );
  msgCompFields.from = MailServices.headerParser.makeMimeHeader(addresses);
  msgCompFields.subject = document.getElementById("msgSubject").value;
  Attachments2CompFields(msgCompFields);

  return msgCompFields;
}

/**
 * Updates the UI to match newValues.
 *
 * @param {object} newValues - New values to use. Values that should not change
 *    should be null or not present.
 * @param {string} [newValues.to]
 * @param {string} [newValues.cc]
 * @param {string} [newValues.bcc]
 * @param {string} [newValues.replyTo]
 * @param {string} [newValues.newsgroups]
 * @param {string} [newValues.followupTo]
 * @param {string} [newValues.subject]
 * @param {string} [newValues.body]
 * @param {string} [newValues.plainTextBody]
 */
function SetComposeDetails(newValues) {
  if (newValues.identityKey !== null) {
    const identityList = document.getElementById("msgIdentity");
    for (const menuItem of identityList.menupopup.children) {
      if (menuItem.getAttribute("identitykey") == newValues.identityKey) {
        identityList.selectedItem = menuItem;
        LoadIdentity(false);
        break;
      }
    }
  }
  CompFields2Recipients(newValues);
  if (typeof newValues.subject == "string") {
    gMsgCompose.compFields.subject = document.getElementById(
      "msgSubject"
    ).value = newValues.subject;
    SetComposeWindowTitle();
  }
  if (
    typeof newValues.body == "string" &&
    typeof newValues.plainTextBody == "string"
  ) {
    throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED);
  }

  const editor = GetCurrentEditor();
  if (typeof newValues.body == "string") {
    if (!IsHTMLEditor()) {
      throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED);
    }
    editor.rebuildDocumentFromSource(newValues.body);
    gMsgCompose.bodyModified = true;
  }
  if (typeof newValues.plainTextBody == "string") {
    editor.selectAll();
    // Remove \r from line endings, which cause extra newlines (bug 1672407).
    const mailEditor = editor.QueryInterface(Ci.nsIEditorMailSupport);
    if (newValues.plainTextBody === "") {
      editor.deleteSelection(editor.eNone, editor.eStrip);
    } else {
      mailEditor.insertTextWithQuotations(
        newValues.plainTextBody.replaceAll("\r\n", "\n")
      );
    }
    gMsgCompose.bodyModified = true;
  }
  gContentChanged = true;
}

/**
 * Handles message sending operations.
 *
 * @param {nsIMsgCompDeliverMode} mode - The delivery mode of the operation.
 */
async function GenericSendMessage(msgType) {
  const msgCompFields = GetComposeDetails();

  // Some other msgCompFields have already been updated instantly in their
  // respective toggle functions, e.g. ToggleReturnReceipt(), ToggleDSN(),
  // ToggleAttachVCard(), and toggleAttachmentReminder().

  const sending =
    msgType == Ci.nsIMsgCompDeliverMode.Now ||
    msgType == Ci.nsIMsgCompDeliverMode.Later ||
    msgType == Ci.nsIMsgCompDeliverMode.Background;

  // Notify about a new message being prepared for sending.
  window.dispatchEvent(
    new CustomEvent("compose-prepare-message-start", {
      detail: { msgType },
    })
  );

  try {
    if (sending) {
      // Since the onBeforeSend event can manipulate compose details, execute it
      // before the final sanity checks.
      try {
        await new Promise((resolve, reject) => {
          const beforeSendEvent = new CustomEvent("beforesend", {
            cancelable: true,
            detail: {
              resolve,
              reject,
            },
          });
          window.dispatchEvent(beforeSendEvent);
          if (!beforeSendEvent.defaultPrevented) {
            resolve();
          }
        });
      } catch (ex) {
        throw new Error(`Send aborted by an onBeforeSend event`);
      }

      expandRecipients();
      // Check if e-mail addresses are complete, in case user turned off
      // autocomplete to local domain.
      if (!CheckValidEmailAddress(msgCompFields)) {
        throw new Error(`Send aborted: invalid recipient address found`);
      }

      // Do we need to check the spelling?
      if (DoSpellCheckBeforeSend()) {
        // We disable spellcheck for the following -subject line, attachment
        // pane, identity and addressing widget therefore we need to explicitly
        // focus on the mail body when we have to do a spellcheck.
        focusMsgBody();
        window.cancelSendMessage = false;
        window.openDialog(
          "chrome://messenger/content/messengercompose/EdSpellCheck.xhtml",
          "_blank",
          "dialog,close,titlebar,modal,resizable",
          true,
          true,
          false
        );

        if (window.cancelSendMessage) {
          throw new Error(`Send aborted by the user: spelling errors found`);
        }
      }

      // Strip trailing spaces and long consecutive WSP sequences from the
      // subject line to prevent getting only WSP chars on a folded line.
      let subject = msgCompFields.subject;
      const fixedSubject = subject.replace(/\s{74,}/g, "    ").trimRight();
      if (fixedSubject != subject) {
        subject = fixedSubject;
        msgCompFields.subject = fixedSubject;
        document.getElementById("msgSubject").value = fixedSubject;
      }

      // Remind the person if there isn't a subject
      if (subject == "") {
        if (
          Services.prompt.confirmEx(
            window,
            getComposeBundle().getString("subjectEmptyTitle"),
            getComposeBundle().getString("subjectEmptyMessage"),
            Services.prompt.BUTTON_TITLE_IS_STRING *
              Services.prompt.BUTTON_POS_0 +
              Services.prompt.BUTTON_TITLE_IS_STRING *
                Services.prompt.BUTTON_POS_1,
            getComposeBundle().getString("sendWithEmptySubjectButton"),
            getComposeBundle().getString("cancelSendingButton"),
            null,
            null,
            { value: 0 }
          ) == 1
        ) {
          document.getElementById("msgSubject").focus();
          throw new Error(`Send aborted by the user: subject missing`);
        }
      }

      // Attachment Reminder: Alert the user if
      //  - the user requested "Remind me later" from either the notification bar or the menu
      //    (alert regardless of the number of files already attached: we can't guess for how many
      //    or which files users want the reminder, and guessing wrong will annoy them a lot), OR
      //  - the aggressive pref is set and the latest notification is still showing (implying
      //    that the message has no attachment(s) yet, message still contains some attachment
      //    keywords, and notification was not dismissed).
      if (
        gManualAttachmentReminder ||
        (Services.prefs.getBoolPref(
          "mail.compose.attachment_reminder_aggressive"
        ) &&
          gComposeNotification.getNotificationWithValue("attachmentReminder"))
      ) {
        const flags =
          Services.prompt.BUTTON_POS_0 *
            Services.prompt.BUTTON_TITLE_IS_STRING +
          Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_IS_STRING;
        const hadForgotten = Services.prompt.confirmEx(
          window,
          getComposeBundle().getString("attachmentReminderTitle"),
          getComposeBundle().getString("attachmentReminderMsg"),
          flags,
          getComposeBundle().getString("attachmentReminderFalseAlarm"),
          getComposeBundle().getString("attachmentReminderYesIForgot"),
          null,
          null,
          { value: 0 }
        );
        // Deactivate manual attachment reminder after showing the alert to avoid alert loop.
        // We also deactivate reminder when user ignores alert with [x] or [ESC].
        if (gManualAttachmentReminder) {
          toggleAttachmentReminder(false);
        }

        if (hadForgotten) {
          throw new Error(`Send aborted by the user: attachment missing`);
        }
      }

      // Aggressive many public recipients prompt.
      const publicRecipientCount = getPublicAddressPillsCount();
      if (
        Services.prefs.getBoolPref(
          "mail.compose.warn_public_recipients.aggressive"
        ) &&
        publicRecipientCount >=
          Services.prefs.getIntPref(
            "mail.compose.warn_public_recipients.threshold"
          )
      ) {
        const flags =
          Services.prompt.BUTTON_POS_0 *
            Services.prompt.BUTTON_TITLE_IS_STRING +
          Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_IS_STRING;
        const [title, msg, cancel, send] = l10nComposeSync.formatValuesSync([
          "many-public-recipients-prompt-title",
          {
            id: "many-public-recipients-prompt-msg",
            args: { count: getPublicAddressPillsCount() },
          },
          "many-public-recipients-prompt-cancel",
          "many-public-recipients-prompt-send",
        ]);
        const willCancel = Services.prompt.confirmEx(
          window,
          title,
          msg,
          flags,
          send,
          cancel,
          null,
          null,
          { value: 0 }
        );

        if (willCancel) {
          if (!gRecipientObserver) {
            // Re-create this observer as it is destroyed when the user dismisses
            // the warning.
            gRecipientObserver = new MutationObserver(function (mutations) {
              if (mutations.some(m => m.type == "childList")) {
                checkPublicRecipientsLimit();
              }
            });
          }
          checkPublicRecipientsLimit();
          throw new Error(
            `Send aborted by the user: too many public recipients found`
          );
        }
      }

      // Check if the user tries to send a message to a newsgroup through a mail
      // account.
      var currentAccountKey = getCurrentAccountKey();
      const account = MailServices.accounts.getAccount(currentAccountKey);
      if (
        account.incomingServer.type != "nntp" &&
        msgCompFields.newsgroups != ""
      ) {
        const kDontAskAgainPref = "mail.compose.dontWarnMail2Newsgroup";
        // default to ask user if the pref is not set
        const dontAskAgain = Services.prefs.getBoolPref(kDontAskAgainPref);
        if (!dontAskAgain) {
          const checkbox = { value: false };
          const okToProceed = Services.prompt.confirmCheck(
            window,
            getComposeBundle().getString("noNewsgroupSupportTitle"),
            getComposeBundle().getString("recipientDlogMessage"),
            getComposeBundle().getString("CheckMsg"),
            checkbox
          );
          if (!okToProceed) {
            throw new Error(`Send aborted by the user: wrong account used`);
          }

          if (checkbox.value) {
            Services.prefs.setBoolPref(kDontAskAgainPref, true);
          }
        }

        // remove newsgroups to prevent news_p to be set
        // in nsMsgComposeAndSend::DeliverMessage()
        msgCompFields.newsgroups = "";
      }

      if (Services.prefs.getBoolPref("mail.compose.add_link_preview", true)) {
        // Remove any card "close" button from content before sending.
        for (const close of getBrowser().contentDocument.querySelectorAll(
          ".moz-card .remove-card"
        )) {
          close.remove();
        }
      }

      const sendFormat = determineSendFormat();
      switch (sendFormat) {
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
          throw new Error(`Invalid send format ${sendFormat}`);
      }
    }

    await CompleteGenericSendMessage(msgType);
    window.dispatchEvent(new CustomEvent("compose-prepare-message-success"));
  } catch (exception) {
    console.error(exception);
    window.dispatchEvent(
      new CustomEvent("compose-prepare-message-failure", {
        detail: { exception },
      })
    );
  }
}

/**
 * Finishes message sending. This should ONLY be called directly from
 * GenericSendMessage. This is a separate function so that it can be easily mocked
 * in tests.
 *
 * @param msgType nsIMsgCompDeliverMode of the operation.
 */
async function CompleteGenericSendMessage(msgType) {
  // hook for extra compose pre-processing
  Services.obs.notifyObservers(window, "mail:composeOnSend");

  if (!gSelectedTechnologyIsPGP) {
    gMsgCompose.compFields.composeSecure.requireEncryptMessage = gSendEncrypted;
    gMsgCompose.compFields.composeSecure.signMessage = gSendSigned;
    onSendSMIME();
  }

  let sendError = null;
  try {
    // Just before we try to send the message, fire off the
    // compose-send-message event for listeners, so they can do
    // any pre-security work before sending.
    var event = document.createEvent("UIEvents");
    event.initEvent("compose-send-message", false, true);
    var msgcomposeWindow = document.getElementById("msgcomposeWindow");
    msgcomposeWindow.setAttribute("msgtype", msgType);
    msgcomposeWindow.dispatchEvent(event);
    if (event.defaultPrevented) {
      throw Components.Exception(
        "compose-send-message prevented",
        Cr.NS_ERROR_ABORT
      );
    }

    gAutoSaving = msgType == Ci.nsIMsgCompDeliverMode.AutoSaveAsDraft;

    // disable the ui if we're not auto-saving
    if (!gAutoSaving) {
      ToggleWindowLock(true);
    } else {
      // If we're auto saving, mark the body as not changed here, and not
      // when the save is done, because the user might change it between now
      // and when the save is done.
      SetContentAndBodyAsUnmodified();
    }

    // Keep track of send/saved cloudFiles and mark them as immutable.
    const items = [...gAttachmentBucket.itemChildren];
    for (const item of items) {
      if (item.attachment.sendViaCloud && item.cloudFileAccount) {
        item.cloudFileAccount.markAsImmutable(item.cloudFileUpload.id);
      }
    }

    var progress = Cc["@mozilla.org/messenger/progress;1"].createInstance(
      Ci.nsIMsgProgress
    );
    if (progress) {
      progress.registerListener(progressListener);
      if (
        msgType == Ci.nsIMsgCompDeliverMode.Save ||
        msgType == Ci.nsIMsgCompDeliverMode.SaveAsDraft ||
        msgType == Ci.nsIMsgCompDeliverMode.AutoSaveAsDraft ||
        msgType == Ci.nsIMsgCompDeliverMode.SaveAsTemplate
      ) {
        gSaveOperationInProgress = true;
      } else {
        gSendOperationInProgress = true;
      }
    }
    msgWindow.domWindow = window;
    msgWindow.rootDocShell.allowAuth = true;
    await gMsgCompose.sendMsg(
      msgType,
      gCurrentIdentity,
      getCurrentAccountKey(),
      msgWindow,
      progress
    );
  } catch (ex) {
    console.error("GenericSendMessage FAILED: " + ex);
    ToggleWindowLock(false);
    sendError = ex;
  }

  if (
    msgType == Ci.nsIMsgCompDeliverMode.Now ||
    msgType == Ci.nsIMsgCompDeliverMode.Later ||
    msgType == Ci.nsIMsgCompDeliverMode.Background
  ) {
    window.dispatchEvent(new CustomEvent("aftersend"));

    const maxSize =
      Services.prefs.getIntPref("mail.compose.big_attachments.threshold_kb") *
      1024;
    const items = [...gAttachmentBucket.itemChildren];

    // When any big attachment is not sent via filelink, increment
    // `tb.filelink.ignored`.
    if (
      items.some(
        item => item.attachment.size >= maxSize && !item.attachment.sendViaCloud
      )
    ) {
      Services.telemetry.scalarAdd("tb.filelink.ignored", 1);
    }
  } else if (
    msgType == Ci.nsIMsgCompDeliverMode.Save ||
    msgType == Ci.nsIMsgCompDeliverMode.SaveAsDraft ||
    msgType == Ci.nsIMsgCompDeliverMode.AutoSaveAsDraft ||
    msgType == Ci.nsIMsgCompDeliverMode.SaveAsTemplate
  ) {
    window.dispatchEvent(new CustomEvent("aftersave"));
  }

  if (sendError) {
    throw sendError;
  }
}

/**
 * Check if the given email address is valid (contains an @).
 *
 * @param {string} address - The email address string to check.
 */
function isValidAddress(address) {
  return address.includes("@", 1) && !address.endsWith("@");
}

/**
 * Check if the given news address is valid (contains a dot).
 *
 * @param {string} address - The news address string to check.
 */
function isValidNewsAddress(address) {
  return address.includes(".", 1) && !address.endsWith(".");
}

/**
 * Force the focus on the autocomplete input if the user clicks on an empty
 * area of the address container.
 *
 * @param {Event} event - the event triggered by the click.
 */
function focusAddressInputOnClick(event) {
  const container = event.target;
  if (container.classList.contains("address-container")) {
    container.querySelector(".address-row-input").focus();
  }
}

/**
 * Keep the Send buttons disabled until any recipient is entered.
 */
function updateSendLock() {
  gSendLocked = true;
  if (!gMsgCompose) {
    return;
  }

  const addressRows = [
    "toAddrContainer",
    "ccAddrContainer",
    "bccAddrContainer",
    "newsgroupsAddrContainer",
  ];

  for (const parentID of addressRows) {
    if (!gSendLocked) {
      break;
    }

    const parent = document.getElementById(parentID);

    if (!parent) {
      continue;
    }

    for (const address of parent.querySelectorAll(".address-pill")) {
      const listNames = MimeParser.parseHeaderField(
        address.fullAddress,
        MimeParser.HEADER_ADDRESS
      );
      const isMailingList =
        listNames.length > 0 &&
        MailServices.ab.mailListNameExists(listNames[0].name);

      if (
        isValidAddress(address.emailAddress) ||
        isMailingList ||
        address.emailInput.classList.contains("news-input")
      ) {
        gSendLocked = false;
        break;
      }
    }
  }

  // Check the non pillified input text inside the autocomplete input fields.
  for (const input of document.querySelectorAll(
    ".address-row:not(.hidden):not(.address-row-raw) .address-row-input"
  )) {
    const inputValueTrim = input.value.trim();
    // If there's no text in the input, proceed with next input.
    if (!inputValueTrim) {
      continue;
    }
    // If text contains " >> " (typically from an unfinished autocompletion),
    // lock Send and return.
    if (inputValueTrim.includes(" >> ")) {
      gSendLocked = true;
      return;
    }

    // If we find at least one valid pill, and in spite of potential other
    // invalid pills or invalid addresses in the input, enable the Send button.
    // It might be disabled again if the above autocomplete artifact is present
    // in a subsequent row, to prevent sending the artifact as a valid address.
    if (
      input.classList.contains("news-input")
        ? isValidNewsAddress(inputValueTrim)
        : isValidAddress(inputValueTrim)
    ) {
      gSendLocked = false;
    }
  }
}

/**
 * Check if the entered addresses are valid and alert the user if they are not.
 *
 * @param aMsgCompFields  A nsIMsgCompFields object containing the fields to check.
 */
function CheckValidEmailAddress(aMsgCompFields) {
  let invalidStr;
  let recipientCount = 0;
  // Check that each of the To, CC, and BCC recipients contains a '@'.
  for (const type of ["to", "cc", "bcc"]) {
    const recipients = aMsgCompFields.splitRecipients(
      aMsgCompFields[type],
      false
    );
    // MsgCompFields contains only non-empty recipients.
    recipientCount += recipients.length;
    for (const recipient of recipients) {
      if (!isValidAddress(recipient)) {
        invalidStr = recipient;
        break;
      }
    }
    if (invalidStr) {
      break;
    }
  }

  if (recipientCount == 0 && aMsgCompFields.newsgroups.trim() == "") {
    Services.prompt.alert(
      window,
      getComposeBundle().getString("addressInvalidTitle"),
      getComposeBundle().getString("noRecipients")
    );
    return false;
  }

  if (invalidStr) {
    Services.prompt.alert(
      window,
      getComposeBundle().getString("addressInvalidTitle"),
      getComposeBundle().getFormattedString("addressInvalid", [invalidStr], 1)
    );
    return false;
  }

  return true;
}

/**
 * Cycle through all the currently visible autocomplete addressing rows and
 * generate pills for those inputs with leftover strings. Do the same if we
 * have a pill currently being edited. This is necessary in case a user writes
 * an extra address and clicks "Send" or "Save as..." before the text is
 * converted into a pill. The input onBlur doesn't work if the click interaction
 * happens on the window's menu bar.
 */
async function pillifyRecipients() {
  for (const input of document.querySelectorAll(
    ".address-row:not(.hidden):not(.address-row-raw) .address-row-input"
  )) {
    // If we find a leftover string in the input field, create a pill. If the
    // newly created pill is not a valid address, the sending will stop.
    if (input.value.trim()) {
      recipientAddPills(input);
    }
  }

  // Update the currently editing pill, if any.
  // It's impossible to edit more than one pill at once.
  await document.querySelector("mail-address-pill.editing")?.updatePill();
}

/**
 *  Handle the dragover event on a recipient disclosure label.
 *
 *  @param {Event} - The DOM dragover event on a recipient disclosure label.
 */
function showAddressRowButtonOnDragover(event) {
  // Prevent dragover event's default action (which resets the current drag
  // operation to "none").
  event.preventDefault();
}

/**
 *  Handle the drop event on a recipient disclosure label.
 *
 *  @param {Event} - The DOM drop event on a recipient disclosure label.
 */
function showAddressRowButtonOnDrop(event) {
  if (event.dataTransfer.types.includes("text/pills")) {
    // If the dragged data includes the type "text/pills", we believe that
    // the user is dragging our own pills, so we try to move the selected pills
    // to the address row of the recipient label they were dropped on (Cc, Bcc,
    // etc.), which will also show the row if needed. If there are no selected
    // pills (so "text/pills" was generated elsewhere), moveSelectedPills() will
    // bail out and we'll do nothing.
    const row = document.getElementById(event.target.dataset.addressRow);
    document.getElementById("recipientsContainer").moveSelectedPills(row);
  }
}

/**
 * Command handler: Cut the selected pills.
 */
function cutSelectedPillsOnCommand() {
  document.getElementById("recipientsContainer").cutSelectedPills();
}

/**
 * Command handler: Copy the selected pills.
 */
function copySelectedPillsOnCommand() {
  document.getElementById("recipientsContainer").copySelectedPills();
}

/**
 * Command handler: Select the focused pill and all siblings in the same
 * address row.
 *
 * @param {Element} focusPill - The focused <mail-address-pill> element.
 */
function selectAllSiblingPillsOnCommand(focusPill) {
  const recipientsContainer = document.getElementById("recipientsContainer");
  // First deselect all pills to ensure that no pills outside the current
  // address row are selected, e.g. when this action was triggered from
  // context menu on already selected pill(s).
  recipientsContainer.deselectAllPills();
  // Select all pills of the current address row.
  recipientsContainer.selectSiblingPills(focusPill);
}

/**
 * Command handler: Select all recipient pills in the addressing area.
 */
function selectAllPillsOnCommand() {
  document.getElementById("recipientsContainer").selectAllPills();
}

/**
 * Command handler: Delete the selected pills.
 */
function deleteSelectedPillsOnCommand() {
  document.getElementById("recipientsContainer").removeSelectedPills();
}

/**
 * Command handler: Move the selected pills to another address row.
 *
 * @param {string} rowId - The id of the address row to move to.
 */
function moveSelectedPillsOnCommand(rowId) {
  document
    .getElementById("recipientsContainer")
    .moveSelectedPills(document.getElementById(rowId));
}

/**
 * Check if there are too many public recipients and offer to send them as BCC.
 */
function checkPublicRecipientsLimit() {
  let notification = gComposeNotification.getNotificationWithValue(
    "warnPublicRecipientsNotification"
  );

  const recipLimit = Services.prefs.getIntPref(
    "mail.compose.warn_public_recipients.threshold"
  );

  const publicAddressPillsCount = getPublicAddressPillsCount();

  if (publicAddressPillsCount < recipLimit) {
    if (notification) {
      gComposeNotification.removeNotification(notification);
    }
    return;
  }

  // Reuse the existing notification since one is shown already.
  if (notification) {
    if (publicAddressPillsCount > 1) {
      document.l10n.setAttributes(
        notification.messageText,
        "public-recipients-notice-multi",
        {
          count: publicAddressPillsCount,
        }
      );
    } else {
      document.l10n.setAttributes(
        notification.messageText,
        "public-recipients-notice-single"
      );
    }
    return;
  }

  // Construct the notification as we don't have one.
  const bccButton = {
    "l10n-id": "many-public-recipients-bcc",
    callback() {
      // Get public addresses before we remove the pills.
      const publicAddresses = getPublicAddressPills().map(
        pill => pill.fullAddress
      );

      addressRowClearPills(document.getElementById("addressRowTo"));
      addressRowClearPills(document.getElementById("addressRowCc"));
      // Add previously public address pills to Bcc address row and select them.
      const bccRow = document.getElementById("addressRowBcc");
      addressRowAddRecipientsArray(bccRow, publicAddresses, true);
      // Focus last added pill to prevent sticky selection with focus elsewhere.
      bccRow.querySelector("mail-address-pill:last-of-type").focus();
      return false;
    },
  };

  const ignoreButton = {
    "l10n-id": "many-public-recipients-ignore",
    callback() {
      gRecipientObserver.disconnect();
      gRecipientObserver = null;
      // After closing notification with `Keep Recipients Public`, actively
      // manage focus to prevent weird focus change e.g. to Contacts Sidebar.
      // If focus was in addressing area before, restore that as the user might
      // dismiss the notification when it appears while still adding recipients.
      if (gLastFocusElement?.classList.contains("address-input")) {
        gLastFocusElement.focus();
        return false;
      }

      // Otherwise if there's no subject yet, focus that (ux-error-prevention).
      const msgSubject = document.getElementById("msgSubject");
      if (!msgSubject.value) {
        msgSubject.focus();
        return false;
      }

      // Otherwise default to focusing message body.
      document.getElementById("messageEditor").focus();
      return false;
    },
  };

  // NOTE: setting "public-recipients-notice-single" below, after the notification
  // has been appended, so that the notification can be found and no further
  // notifications are appended.
  notification = gComposeNotification.appendNotification(
    "warnPublicRecipientsNotification",
    {
      label: "", // "public-recipients-notice-single"
      priority: gComposeNotification.PRIORITY_WARNING_MEDIUM,
      eventCallback(state) {
        if (state == "dismissed") {
          ignoreButton.callback();
        }
      },
    },
    [bccButton, ignoreButton]
  );

  if (notification) {
    if (publicAddressPillsCount > 1) {
      document.l10n.setAttributes(
        notification.messageText,
        "public-recipients-notice-multi",
        {
          count: publicAddressPillsCount,
        }
      );
    } else {
      document.l10n.setAttributes(
        notification.messageText,
        "public-recipients-notice-single"
      );
    }
  }
}

/**
 * Get all the address pills in the "To" and "Cc" fields.
 *
 * @returns {Element[]} All <mail-address-pill> elements in "To" and "CC" fields.
 */
function getPublicAddressPills() {
  return [
    ...document.querySelectorAll("#toAddrContainer > mail-address-pill"),
    ...document.querySelectorAll("#ccAddrContainer > mail-address-pill"),
  ];
}

/**
 * Gets the count of all the address pills in the "To" and "Cc" fields. This
 * takes mailing lists into consideration as well.
 */
function getPublicAddressPillsCount() {
  const pills = getPublicAddressPills();
  return pills.reduce(
    (total, pill) =>
      pill.isMailList ? total + pill.listAddressCount : total + 1,
    0
  );
}

/**
 * Check for Bcc recipients in an encrypted message and warn the user.
 * The warning is not shown if the only Bcc recipient is the sender.
 */
async function checkEncryptedBccRecipients() {
  const notification = gComposeNotification.getNotificationWithValue(
    "warnEncryptedBccRecipients"
  );

  if (!gWantCannotEncryptBCCNotification) {
    if (notification) {
      gComposeNotification.removeNotification(notification);
    }
    return;
  }

  const bccRecipients = [
    ...document.querySelectorAll("#bccAddrContainer > mail-address-pill"),
  ];
  const bccIsSender = bccRecipients.every(
    pill => pill.emailAddress == gCurrentIdentity.email
  );

  if (!gSendEncrypted || !bccRecipients.length || bccIsSender) {
    if (notification) {
      gComposeNotification.removeNotification(notification);
    }
    return;
  }

  if (notification) {
    return;
  }

  const ignoreButton = {
    "l10n-id": "encrypted-bcc-ignore-button",
    callback() {
      gWantCannotEncryptBCCNotification = false;
      return false;
    },
  };

  gComposeNotification.appendNotification(
    "warnEncryptedBccRecipients",
    {
      label: await document.l10n.formatValue("encrypted-bcc-warning"),
      priority: gComposeNotification.PRIORITY_WARNING_MEDIUM,
      eventCallback(state) {
        if (state == "dismissed") {
          ignoreButton.callback();
        }
      },
    },
    [ignoreButton]
  );
}

async function SendMessage() {
  await pillifyRecipients();
  let sendInBackground = Services.prefs.getBoolPref(
    "mailnews.sendInBackground"
  );
  if (sendInBackground && AppConstants.platform != "macosx") {
    const count = [...Services.wm.getEnumerator(null)].length;
    if (count == 1) {
      sendInBackground = false;
    }
  }

  await GenericSendMessage(
    sendInBackground
      ? Ci.nsIMsgCompDeliverMode.Background
      : Ci.nsIMsgCompDeliverMode.Now
  );
  ExitFullscreenMode();
}

async function SendMessageWithCheck() {
  await pillifyRecipients();
  var warn = Services.prefs.getBoolPref("mail.warn_on_send_accel_key");

  if (warn) {
    const bundle = getComposeBundle();
    const checkValue = { value: false };
    const buttonPressed = Services.prompt.confirmEx(
      window,
      bundle.getString("sendMessageCheckWindowTitle"),
      bundle.getString("sendMessageCheckLabel"),
      Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
        Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1,
      bundle.getString("sendMessageCheckSendButtonLabel"),
      null,
      null,
      bundle.getString("CheckMsg"),
      checkValue
    );
    if (buttonPressed != 0) {
      return;
    }
    if (checkValue.value) {
      Services.prefs.setBoolPref("mail.warn_on_send_accel_key", false);
    }
  }

  const sendInBackground = Services.prefs.getBoolPref(
    "mailnews.sendInBackground"
  );

  let mode;
  if (Services.io.offline) {
    mode = Ci.nsIMsgCompDeliverMode.Later;
  } else {
    mode = sendInBackground
      ? Ci.nsIMsgCompDeliverMode.Background
      : Ci.nsIMsgCompDeliverMode.Now;
  }
  await GenericSendMessage(mode);
  ExitFullscreenMode();
}

async function SendMessageLater() {
  await pillifyRecipients();
  await GenericSendMessage(Ci.nsIMsgCompDeliverMode.Later);
  ExitFullscreenMode();
}

function ExitFullscreenMode() {
  // On OS X we need to deliberately exit full screen mode after sending.
  if (AppConstants.platform == "macosx") {
    window.fullScreen = false;
  }
}

function Save() {
  switch (defaultSaveOperation) {
    case "file":
      SaveAsFile(false);
      break;
    case "template":
      SaveAsTemplate(false).catch(console.error);
      break;
    default:
      SaveAsDraft(false).catch(console.error);
      break;
  }
}

function SaveAsFile(saveAs) {
  GetCurrentEditorElement().contentDocument.title =
    document.getElementById("msgSubject").value;

  if (gMsgCompose.bodyConvertible() == Ci.nsIMsgCompConvertible.Plain) {
    SaveDocument(saveAs, false, "text/plain");
  } else {
    SaveDocument(saveAs, false, "text/html");
  }
  defaultSaveOperation = "file";
}

async function SaveAsDraft() {
  gAutoSaveKickedIn = false;
  gEditingDraft = true;

  await pillifyRecipients();
  await GenericSendMessage(Ci.nsIMsgCompDeliverMode.SaveAsDraft);
  defaultSaveOperation = "draft";
}

async function SaveAsTemplate() {
  gAutoSaveKickedIn = false;
  gEditingDraft = false;

  await pillifyRecipients();
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

  await GenericSendMessage(Ci.nsIMsgCompDeliverMode.SaveAsTemplate);
  defaultSaveOperation = "template";

  if (savedReferences) {
    gMsgCompose.compFields.references = savedReferences;
  }
}

// Sets the additional FCC, in addition to the default FCC.
function MessageFcc(aFolder) {
  if (!gMsgCompose) {
    return;
  }

  var msgCompFields = gMsgCompose.compFields;
  if (!msgCompFields) {
    return;
  }

  // Get the uri for the folder to FCC into.
  var fccURI = aFolder.URI;
  msgCompFields.fcc2 = msgCompFields.fcc2 == fccURI ? "nocopy://" : fccURI;
}

function updateOptionsMenu() {
  setSecuritySettings("_Menubar");

  const menuItem = document.getElementById("menu_inlineSpellCheck");
  if (gSpellCheckingEnabled) {
    menuItem.setAttribute("checked", "true");
  } else {
    menuItem.removeAttribute("checked");
  }
}

function updatePriorityMenu() {
  if (gMsgCompose) {
    var msgCompFields = gMsgCompose.compFields;
    if (msgCompFields && msgCompFields.priority) {
      var priorityMenu = document.getElementById("priorityMenu");
      priorityMenu.querySelector('[checked="true"]').removeAttribute("checked");
      priorityMenu
        .querySelector('[value="' + msgCompFields.priority + '"]')
        .setAttribute("checked", "true");
    }
  }
}

function updatePriorityToolbarButton(newPriorityValue) {
  var prioritymenu = document.getElementById("priorityMenu-button");
  if (prioritymenu) {
    prioritymenu.value = newPriorityValue;
  }
}

function PriorityMenuSelect(target) {
  if (gMsgCompose) {
    var msgCompFields = gMsgCompose.compFields;
    if (msgCompFields) {
      msgCompFields.priority = target.getAttribute("value");
    }

    // keep priority toolbar button in synch with possible changes via the menu item
    updatePriorityToolbarButton(target.getAttribute("value"));
  }
}

/**
 * Initialise the send format menu using the current gMsgCompose.compFields.
 */
function initSendFormatMenu() {
  const formatToId = new Map([
    [Ci.nsIMsgCompSendFormat.PlainText, "format_plain"],
    [Ci.nsIMsgCompSendFormat.HTML, "format_html"],
    [Ci.nsIMsgCompSendFormat.Both, "format_both"],
    [Ci.nsIMsgCompSendFormat.Auto, "format_auto"],
  ]);

  let sendFormat = gMsgCompose.compFields.deliveryFormat;

  if (sendFormat == Ci.nsIMsgCompSendFormat.Unset) {
    sendFormat = Services.prefs.getIntPref(
      "mail.default_send_format",
      Ci.nsIMsgCompSendFormat.Auto
    );

    if (!formatToId.has(sendFormat)) {
      // Unknown preference value.
      sendFormat = Ci.nsIMsgCompSendFormat.Auto;
    }
  }

  // Make the composition field uses the same as determined above. Specifically,
  // if the deliveryFormat was Unset, we now set it to a specific value.
  gMsgCompose.compFields.deliveryFormat = sendFormat;

  for (const [format, id] of formatToId.entries()) {
    const menuitem = document.getElementById(id);
    menuitem.value = String(format);
    if (format == sendFormat) {
      menuitem.setAttribute("checked", "true");
    } else {
      menuitem.removeAttribute("checked");
    }
  }

  document
    .getElementById("outputFormatMenu")
    .addEventListener("command", event => {
      const prevSendFormat = gMsgCompose.compFields.deliveryFormat;
      const newSendFormat = parseInt(event.target.value, 10);
      gMsgCompose.compFields.deliveryFormat = newSendFormat;
      gContentChanged = prevSendFormat != newSendFormat;
    });
}

/**
 * Walk through a plain text list of recipients and add them to the inline spell
 * checker ignore list, e.g. to avoid that known recipient names get marked
 * wrong in message body.
 *
 * @param {string} aAddressesToAdd - A (comma-separated) recipient(s) string.
 */
function addRecipientsToIgnoreList(aAddressesToAdd) {
  if (gSpellCheckingEnabled) {
    // break the list of potentially many recipients back into individual names
    const addresses =
      MailServices.headerParser.parseEncodedHeader(aAddressesToAdd);
    const tokenizedNames = [];

    // Each name could consist of multiple word delimited by either commas or spaces, i.e. Green Lantern
    // or Lantern,Green. Tokenize on comma first, then tokenize again on spaces.
    for (const addr of addresses) {
      if (!addr.name) {
        continue;
      }
      const splitNames = addr.name.split(",");
      for (let i = 0; i < splitNames.length; i++) {
        // now tokenize off of white space
        const splitNamesFromWhiteSpaceArray = splitNames[i].split(" ");
        for (
          let whiteSpaceIndex = 0;
          whiteSpaceIndex < splitNamesFromWhiteSpaceArray.length;
          whiteSpaceIndex++
        ) {
          if (splitNamesFromWhiteSpaceArray[whiteSpaceIndex]) {
            tokenizedNames.push(splitNamesFromWhiteSpaceArray[whiteSpaceIndex]);
          }
        }
      }
    }
    spellCheckReadyObserver.addWordsToIgnore(tokenizedNames);
  }
}

/**
 * Observer waiting for spell checker to become initialized or to complete
 * checking. When it fires, it pushes new words to be ignored to the speller.
 */
var spellCheckReadyObserver = {
  _topic: "inlineSpellChecker-spellCheck-ended",

  _ignoreWords: [],

  observe(aSubject, aTopic, aData) {
    if (aTopic != this._topic) {
      return;
    }

    this.removeObserver();
    this._addWords();
  },

  _isAdded: false,

  addObserver() {
    if (this._isAdded) {
      return;
    }

    Services.obs.addObserver(this, this._topic);
    this._isAdded = true;
  },

  removeObserver() {
    if (!this._isAdded) {
      return;
    }

    Services.obs.removeObserver(this, this._topic);
    this._clearPendingWords();
    this._isAdded = false;
  },

  addWordsToIgnore(aIgnoreWords) {
    this._ignoreWords.push(...aIgnoreWords);
    const checker = GetCurrentEditorSpellChecker();
    if (!checker || checker.spellCheckPending) {
      // spellchecker is enabled, but we must wait for its init to complete
      this.addObserver();
    } else {
      this._addWords();
    }
  },

  _addWords() {
    // At the time the speller finally got initialized, we may already be closing
    // the compose together with the speller, so we need to check if they
    // are still valid.
    const checker = GetCurrentEditorSpellChecker();
    if (gMsgCompose && checker?.enableRealTimeSpell) {
      checker.ignoreWords(this._ignoreWords);
    }
    this._clearPendingWords();
  },

  _clearPendingWords() {
    this._ignoreWords.length = 0;
  },
};

/**
 * Called if the list of recipients changed in any way.
 *
 * @param {boolean} automatic - Set to true if the change of recipients was
 *   invoked programmatically and should not be considered a change of message
 *   content.
 */
function onRecipientsChanged(automatic) {
  if (!automatic) {
    gContentChanged = true;
  }
  updateSendCommands(true);
}

/**
 * Show the popup identified by aPopupID
 * at the anchor element identified by aAnchorID.
 *
 * Note: All but the first 2 parameters are identical with the parameters of
 * the openPopup() method of XUL popup element. For details, please consult docs.
 * Except aPopupID, all parameters are optional.
 * Example: showPopupById("aPopupID", "aAnchorID");
 *
 * @param aPopupID   the ID of the popup element to be shown
 * @param aAnchorID  the ID of an element to which the popup should be anchored
 * @param aPosition  a single-word alignment value for the position parameter
 *                   of openPopup() method; defaults to "after_start" if omitted.
 * @param x          x offset from default position
 * @param y          y offset from default position
 * @param isContextMenu {boolean} For details, see documentation.
 * @param attributesOverride {boolean} whether the position attribute on the
 *                                     popup node overrides the position parameter
 * @param triggerEvent the event that triggered the popup
 */
function showPopupById(
  aPopupID,
  aAnchorID,
  aPosition = "after_start",
  x,
  y,
  isContextMenu,
  attributesOverride,
  triggerEvent
) {
  const popup = document.getElementById(aPopupID);
  const anchor = document.getElementById(aAnchorID);
  popup.openPopup(
    anchor,
    aPosition,
    x,
    y,
    isContextMenu,
    attributesOverride,
    triggerEvent
  );
}

function InitLanguageMenu() {
  var languageMenuList = document.getElementById("languageMenuList");
  if (!languageMenuList) {
    return;
  }

  var spellChecker = Cc["@mozilla.org/spellchecker/engine;1"].getService(
    Ci.mozISpellCheckingEngine
  );

  // Get the list of dictionaries from
  // the spellchecker.

  var dictList = spellChecker.getDictionaryList();

  const extraItemCount = dictList.length === 0 ? 1 : 2;

  // If dictionary count hasn't changed then no need to update the menu.
  if (dictList.length + extraItemCount == languageMenuList.childElementCount) {
    return;
  }

  var sortedList = gSpellChecker.sortDictionaryList(dictList);

  const getMoreItem = document.createXULElement("menuitem");
  document.l10n.setAttributes(getMoreItem, "spell-add-dictionaries");
  getMoreItem.addEventListener("command", event => {
    event.stopPropagation();
    openDictionaryList();
  });
  const getMoreArray = [getMoreItem];

  if (extraItemCount > 1) {
    getMoreArray.unshift(document.createXULElement("menuseparator"));
  }

  // Remove any languages from the list.
  languageMenuList.replaceChildren(
    ...sortedList.map(dict => {
      const item = document.createXULElement("menuitem");
      item.setAttribute("label", dict.displayName);
      item.setAttribute("value", dict.localeCode);
      item.setAttribute("type", "checkbox");
      item.setAttribute("selection-type", "multiple");
      if (dictList.length > 1) {
        item.setAttribute("closemenu", "none");
      }
      return item;
    }),
    ...getMoreArray
  );
}

function OnShowDictionaryMenu(aTarget) {
  InitLanguageMenu();

  for (const item of aTarget.children) {
    item.setAttribute(
      "checked",
      gActiveDictionaries.has(item.getAttribute("value"))
    );
  }
}

function languageMenuListOpened() {
  document
    .getElementById("languageStatusButton")
    .setAttribute("aria-expanded", "true");
}

function languageMenuListClosed() {
  document
    .getElementById("languageStatusButton")
    .setAttribute("aria-expanded", "false");
}

/**
 * Set of the active dictionaries. We maintain this cached state so we don't
 * need a spell checker instance to know the active dictionaries. This is
 * especially relevant when inline spell checking is disabled.
 *
 * @type {Set<string>}
 */
var gActiveDictionaries = new Set();
/**
 * Change the language of the composition and if we are using inline
 * spell check, recheck the message with the new dictionary.
 *
 * Note: called from the "Check Spelling" panel in SelectLanguage().
 *
 * @param {string[]} languages - New languages to set.
 */
async function ComposeChangeLanguage(languages) {
  const currentLanguage = document.documentElement.getAttribute("lang");
  if (
    (languages.length === 1 && currentLanguage != languages[0]) ||
    languages.length !== 1
  ) {
    let languageToSet = "";
    if (languages.length === 1) {
      languageToSet = languages[0];
    }
    // Update the document language as well.
    document.documentElement.setAttribute("lang", languageToSet);
  }

  await gSpellChecker?.selectDictionaries(languages);

  const checker = GetCurrentEditorSpellChecker();
  if (checker?.spellChecker) {
    await checker.spellChecker.setCurrentDictionaries(languages);
  }
  // Update subject spell checker languages. If for some reason the spell
  // checker isn't ready yet, don't auto-create it, hence pass 'false'.
  const subjectSpellChecker = checker?.spellChecker
    ? document.getElementById("msgSubject").editor.getInlineSpellChecker(false)
    : null;
  if (subjectSpellChecker?.spellChecker) {
    await subjectSpellChecker.spellChecker.setCurrentDictionaries(languages);
  }

  // now check the document over again with the new dictionary
  if (gSpellCheckingEnabled) {
    if (checker?.spellChecker) {
      checker.spellCheckRange(null);
    }

    if (subjectSpellChecker?.spellChecker) {
      // Also force a recheck of the subject.
      subjectSpellChecker.spellCheckRange(null);
    }
  }

  await updateLanguageInStatusBar(languages);

  // Update the language in the composition fields, so we can save it
  // to the draft next time.
  if (gMsgCompose?.compFields) {
    let langs = "";
    if (!Services.prefs.getBoolPref("mail.suppress_content_language")) {
      langs = languages.join(", ");
    }
    gMsgCompose.compFields.contentLanguage = langs;
  }

  gActiveDictionaries = new Set(languages);

  // Notify compose WebExtension API about changed dictionaries.
  window.dispatchEvent(
    new CustomEvent("active-dictionaries-changed", {
      detail: languages.join(","),
    })
  );
}

/**
 * Change the language of the composition and if we are using inline
 * spell check, recheck the message with the new dictionary.
 *
 * @param {Event} event - Event of selecting an item in the spelling button
 *  menulist popup.
 */
function ChangeLanguage(event) {
  const curLangs = new Set(gActiveDictionaries);
  if (curLangs.has(event.target.value)) {
    curLangs.delete(event.target.value);
  } else {
    curLangs.add(event.target.value);
  }
  ComposeChangeLanguage(Array.from(curLangs));
  event.stopPropagation();
}

/**
 * Update the active dictionaries in the status bar.
 *
 * @param {string[]} dictionaries
 */
async function updateLanguageInStatusBar(dictionaries) {
  // HACK: calling sortDictionaryList (in InitLanguageMenu) may fail the first
  // time due to synchronous loading of the .ftl files. If we load the files
  // and wait for a known value asynchronously, no such failure will happen.
  await new Localization([
    "toolkit/intl/languageNames.ftl",
    "toolkit/intl/regionNames.ftl",
  ]).formatValue("language-name-en");

  InitLanguageMenu();
  const languageMenuList = document.getElementById("languageMenuList");
  const languageStatusButton = document.getElementById("languageStatusButton");
  if (!languageMenuList || !languageStatusButton) {
    return;
  }

  if (!dictionaries) {
    dictionaries = Array.from(gActiveDictionaries);
  }
  const listFormat = new Intl.ListFormat(undefined, {
    type: "conjunction",
    style: "short",
  });
  const languages = [];
  let item = languageMenuList.firstElementChild;

  // No status display, if there is only one or no spelling dictionary available.
  if (languageMenuList.childElementCount <= 3) {
    languageStatusButton.hidden = true;
    languageStatusButton.textContent = "";
    return;
  }

  languageStatusButton.hidden = false;
  while (item) {
    if (item.tagName.toLowerCase() === "menuseparator") {
      break;
    }
    if (dictionaries.includes(item.getAttribute("value"))) {
      languages.push(item.getAttribute("label"));
    }
    item = item.nextElementSibling;
  }
  if (languages.length > 0) {
    languageStatusButton.textContent = listFormat.format(languages);
  } else {
    languageStatusButton.textContent = listFormat.format(dictionaries);
  }
}

/**
 * Toggle Return Receipt (Disposition-Notification-To: header).
 *
 * @param {boolean} [forcedState] - Forced state to use for returnReceipt.
 *  If not set, the current state will be toggled.
 */
function ToggleReturnReceipt(forcedState) {
  const msgCompFields = gMsgCompose.compFields;
  if (!msgCompFields) {
    return;
  }
  if (forcedState === undefined) {
    msgCompFields.returnReceipt = !msgCompFields.returnReceipt;
    gReceiptOptionChanged = true;
  } else {
    if (msgCompFields.returnReceipt != forcedState) {
      gReceiptOptionChanged = true;
    }
    msgCompFields.returnReceipt = forcedState;
  }
  for (const item of document.querySelectorAll(`menuitem[command="cmd_toggleReturnReceipt"],
                                              toolbarbutton[command="cmd_toggleReturnReceipt"]`)) {
    item.setAttribute("checked", msgCompFields.returnReceipt);
  }
}

function ToggleDSN(target) {
  const msgCompFields = gMsgCompose.compFields;
  if (msgCompFields) {
    msgCompFields.DSN = !msgCompFields.DSN;
    target.setAttribute("checked", msgCompFields.DSN);
    gDSNOptionChanged = true;
  }
}

function ToggleAttachVCard(target) {
  var msgCompFields = gMsgCompose.compFields;
  if (msgCompFields) {
    msgCompFields.attachVCard = !msgCompFields.attachVCard;
    target.setAttribute("checked", msgCompFields.attachVCard);
    gAttachVCardOptionChanged = true;
  }
}

/**
 * Toggles or sets the status of manual Attachment Reminder, i.e. whether
 * the user will get the "Attachment Reminder" alert before sending or not.
 * Toggles checkmark on "Remind me later" menuitem and internal
 * gManualAttachmentReminder flag accordingly.
 *
 * @param aState (optional) true = activate reminder.
 *                          false = deactivate reminder.
 *                          (default) = toggle reminder state.
 */
function toggleAttachmentReminder(aState = !gManualAttachmentReminder) {
  gManualAttachmentReminder = aState;
  document.getElementById("cmd_remindLater").setAttribute("checked", aState);
  gMsgCompose.compFields.attachmentReminder = aState;

  // If we enabled manual reminder, the reminder can't be turned off.
  if (aState) {
    gDisableAttachmentReminder = false;
  }

  manageAttachmentNotification(false);
}

/**
 * Triggers or removes the CSS animation for the counter of newly uploaded
 * attachments.
 */
function toggleAttachmentAnimation() {
  gAttachmentCounter.classList.toggle("is_animating");
}

function FillIdentityList(menulist) {
  const accounts = FolderUtils.allAccountsSorted(true);

  let accountHadSeparator = false;
  let firstAccountWithIdentities = true;
  for (const account of accounts) {
    const identities = account.identities;

    if (identities.length == 0) {
      continue;
    }

    const needSeparator = identities.length > 1;
    if (needSeparator || accountHadSeparator) {
      // Separate identities from this account from the previous
      // account's identities if there is more than 1 in the current
      // or previous account.
      if (!firstAccountWithIdentities) {
        // only if this is not the first account shown
        const separator = document.createXULElement("menuseparator");
        menulist.menupopup.appendChild(separator);
      }
      accountHadSeparator = needSeparator;
    }
    firstAccountWithIdentities = false;

    for (let i = 0; i < identities.length; i++) {
      const identity = identities[i];
      const item = menulist.appendItem(
        identity.identityName,
        identity.fullAddress,
        account.incomingServer.prettyName
      );
      item.setAttribute("identitykey", identity.key);
      item.setAttribute("accountkey", account.key);
      if (i == 0) {
        // Mark the first identity as default.
        item.setAttribute("default", "true");
      }
      // Create the menuitem description and add it after the last label in the
      // menuitem internals.
      const desc = document.createXULElement("label");
      desc.value = item.getAttribute("description");
      desc.classList.add("menu-description");
      desc.setAttribute("crop", "end");
      item.querySelector("label:last-child").after(desc);
    }
  }

  menulist.menupopup.appendChild(document.createXULElement("menuseparator"));
  menulist.menupopup
    .appendChild(document.createXULElement("menuitem"))
    .setAttribute("command", "cmd_customizeFromAddress");
}

function getCurrentAccountKey() {
  // Get the account's key.
  const identityList = document.getElementById("msgIdentity");
  return identityList.getAttribute("accountkey");
}

function getCurrentIdentityKey() {
  // Get the identity key.
  return gCurrentIdentity.key;
}

function AdjustFocus() {
  // If is NNTP account, check the newsgroup field.
  const account = MailServices.accounts.getAccount(getCurrentAccountKey());
  const accountType = account.incomingServer.type;

  let element =
    accountType == "nntp"
      ? document.getElementById("newsgroupsAddrContainer")
      : document.getElementById("toAddrContainer");

  // Focus on the recipient input field if no pills are present.
  if (element.querySelectorAll("mail-address-pill").length == 0) {
    element.querySelector(".address-row-input").focus();
    return;
  }

  // Focus subject if empty.
  element = document.getElementById("msgSubject");
  if (element.value == "") {
    element.focus();
    return;
  }

  // Focus message body.
  focusMsgBody();
}

/**
 * Set the compose window title with flavors (Write | Print Preview).
 *
 * @param isPrintPreview (optional) true:  Set title for 'Print Preview' window.
 *                                  false: Set title for 'Write' window (default).
 */
function SetComposeWindowTitle(isPrintPreview = false) {
  const aStringName = isPrintPreview
    ? "windowTitlePrintPreview"
    : "windowTitleWrite";
  const subject =
    document.getElementById("msgSubject").value.trim() ||
    getComposeBundle().getString("defaultSubject");
  const brandBundle = document.getElementById("brandBundle");
  const brandShortName = brandBundle.getString("brandShortName");
  const newTitle = getComposeBundle().getFormattedString(aStringName, [
    subject,
    brandShortName,
  ]);
  document.title = newTitle;
  if (AppConstants.platform == "macosx") {
    document.getElementById("titlebar-title-label").value = newTitle;
  }
}

// Check for changes to document and allow saving before closing
// This is hooked up to the OS's window close widget (e.g., "X" for Windows)
function ComposeCanClose() {
  // No open compose window?
  if (!gMsgCompose) {
    return true;
  }

  // Do this early, so ldap sessions have a better chance to
  // cleanup after themselves.
  if (gSendOperationInProgress || gSaveOperationInProgress) {
    const brandBundle = document.getElementById("brandBundle");
    const brandShortName = brandBundle.getString("brandShortName");
    const promptTitle = gSendOperationInProgress
      ? getComposeBundle().getString("quitComposeWindowTitle")
      : getComposeBundle().getString("quitComposeWindowSaveTitle");
    const promptMsg = gSendOperationInProgress
      ? getComposeBundle().getFormattedString(
          "quitComposeWindowMessage2",
          [brandShortName],
          1
        )
      : getComposeBundle().getFormattedString(
          "quitComposeWindowSaveMessage",
          [brandShortName],
          1
        );
    const quitButtonLabel = getComposeBundle().getString(
      "quitComposeWindowQuitButtonLabel2"
    );
    const waitButtonLabel = getComposeBundle().getString(
      "quitComposeWindowWaitButtonLabel2"
    );

    const result = Services.prompt.confirmEx(
      window,
      promptTitle,
      promptMsg,
      Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1,
      waitButtonLabel,
      quitButtonLabel,
      null,
      null,
      { value: 0 }
    );

    if (result == 1) {
      gMsgCompose.abort();
      return true;
    }
    return false;
  }

  // Returns FALSE only if user cancels save action
  if (
    gContentChanged ||
    gMsgCompose.bodyModified ||
    gAutoSaveKickedIn ||
    gReceiptOptionChanged ||
    gDSNOptionChanged
  ) {
    // call window.focus, since we need to pop up a dialog
    // and therefore need to be visible (to prevent user confusion)
    window.focus();
    const draftFolderURI = gCurrentIdentity.draftFolder;
    const draftFolderName =
      MailUtils.getOrCreateFolder(draftFolderURI).prettyName;
    const result = Services.prompt.confirmEx(
      window,
      getComposeBundle().getString("saveDlogTitle"),
      getComposeBundle().getFormattedString("saveDlogMessages3", [
        draftFolderName,
      ]),
      Services.prompt.BUTTON_TITLE_SAVE * Services.prompt.BUTTON_POS_0 +
        Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1 +
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_2,
      null,
      null,
      getComposeBundle().getString("discardButtonLabel"),
      null,
      { value: 0 }
    );
    switch (result) {
      case 0: // Save
        // Since we're going to save the message, we tell toolkit that
        // the close command failed, by returning false, and then
        // we close the window ourselves after the save is done.
        gCloseWindowAfterSave = true;
        // We catch the exception because we need to tell toolkit that it
        // shouldn't close the window, because we're going to close it
        // ourselves. If we don't tell toolkit that, and then close the window
        // ourselves, the toolkit code that keeps track of the open windows
        // gets off by one and the app can close unexpectedly on os's that
        // shutdown the app when the last window is closed.
        GenericSendMessage(Ci.nsIMsgCompDeliverMode.AutoSaveAsDraft).catch(
          console.error
        );
        return false;
      case 1: // Cancel
        return false;
      case 2: // Don't Save
        // don't delete the draft if we didn't start off editing a draft
        // and the user hasn't explicitly saved it.
        if (!gEditingDraft && gAutoSaveKickedIn) {
          RemoveDraft();
        }
        // Remove auto-saved draft created during "edit template".
        if (gMsgCompose.compFields.templateId && gAutoSaveKickedIn) {
          RemoveDraft();
        }
        break;
    }
  }

  return true;
}

function RemoveDraft() {
  try {
    var draftUri = gMsgCompose.compFields.draftId;
    var msgKey = draftUri.substr(draftUri.indexOf("#") + 1);
    const folder = MailUtils.getExistingFolder(gMsgCompose.savedFolderURI);
    if (!folder) {
      return;
    }
    try {
      if (folder.getFlag(Ci.nsMsgFolderFlags.Drafts)) {
        const msgHdr = folder.GetMessageHeader(msgKey);
        folder.deleteMessages([msgHdr], null, true, false, null, false);
      }
    } catch (ex) {
      // couldn't find header - perhaps an imap folder.
      var imapFolder = folder.QueryInterface(Ci.nsIMsgImapMailFolder);
      if (imapFolder) {
        imapFolder.storeImapFlags(
          Ci.nsMsgFolderFlags.Expunged,
          true,
          [msgKey],
          null
        );
      }
    }
  } catch (ex) {}
}

function SetContentAndBodyAsUnmodified() {
  gMsgCompose.bodyModified = false;
  gContentChanged = false;
}

function MsgComposeCloseWindow() {
  if (gMsgCompose) {
    gMsgCompose.CloseWindow();
  } else {
    window.close();
  }
}

function GetLastAttachDirectory() {
  var lastDirectory;

  try {
    lastDirectory = Services.prefs.getComplexValue(
      kComposeAttachDirPrefName,
      Ci.nsIFile
    );
  } catch (ex) {
    // this will fail the first time we attach a file
    // as we won't have a pref value.
    lastDirectory = null;
  }

  return lastDirectory;
}

// attachedLocalFile must be a nsIFile
function SetLastAttachDirectory(attachedLocalFile) {
  try {
    const file = attachedLocalFile.QueryInterface(Ci.nsIFile);
    const parent = file.parent.QueryInterface(Ci.nsIFile);

    Services.prefs.setComplexValue(
      kComposeAttachDirPrefName,
      Ci.nsIFile,
      parent
    );
  } catch (ex) {
    dump("error: SetLastAttachDirectory failed: " + ex + "\n");
  }
}

function AttachFile() {
  if (gAttachmentBucket.itemCount) {
    // If there are existing attachments already, restore attachment pane before
    // showing the file picker so that user can see them while adding more.
    toggleAttachmentPane("show");
  }

  // Get file using nsIFilePicker and convert to URL
  const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  fp.init(
    window,
    getComposeBundle().getString("chooseFileToAttach"),
    Ci.nsIFilePicker.modeOpenMultiple
  );

  const lastDirectory = GetLastAttachDirectory();
  if (lastDirectory) {
    fp.displayDirectory = lastDirectory;
  }

  fp.appendFilters(Ci.nsIFilePicker.filterAll);
  fp.open(rv => {
    if (rv != Ci.nsIFilePicker.returnOK || !fp.files) {
      return;
    }

    let file;
    const attachments = [];

    for (file of [...fp.files]) {
      attachments.push(FileToAttachment(file));
    }

    AddAttachments(attachments);
    SetLastAttachDirectory(file);
  });
}

/**
 * Convert an nsIFile instance into an nsIMsgAttachment.
 *
 * @param file the nsIFile
 * @returns an attachment pointing to the file
 */
function FileToAttachment(file) {
  const fileHandler = Services.io
    .getProtocolHandler("file")
    .QueryInterface(Ci.nsIFileProtocolHandler);
  const attachment = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);

  attachment.url = fileHandler.getURLSpecFromActualFile(file);
  attachment.size = file.fileSize;
  return attachment;
}

async function messageAttachmentToFile(attachment) {
  const pathTempDir = PathUtils.join(
    PathUtils.tempDir,
    "pid-" + Services.appinfo.processID
  );
  await IOUtils.makeDirectory(pathTempDir, { permissions: 0o700 });
  const pathTempFile = await IOUtils.createUniqueFile(
    pathTempDir,
    attachment.name.replaceAll(/[/:*?\"<>|]/g, "_"),
    0o600
  );
  const tempFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  tempFile.initWithPath(pathTempFile);
  const extAppLauncher = Cc[
    "@mozilla.org/uriloader/external-helper-app-service;1"
  ].getService(Ci.nsPIExternalAppLauncher);
  extAppLauncher.deleteTemporaryFileOnExit(tempFile);

  const service = MailServices.messageServiceFromURI(attachment.url);
  const bytes = await new Promise((resolve, reject) => {
    const streamlistener = {
      _data: [],
      _stream: null,
      onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
        if (!this._stream) {
          this._stream = Cc[
            "@mozilla.org/scriptableinputstream;1"
          ].createInstance(Ci.nsIScriptableInputStream);
          this._stream.init(aInputStream);
        }
        this._data.push(this._stream.read(aCount));
      },
      onStartRequest() {},
      onStopRequest(aRequest, aStatus) {
        if (aStatus == Cr.NS_OK) {
          resolve(this._data.join(""));
        } else {
          console.error(aStatus);
          reject();
        }
      },
      QueryInterface: ChromeUtils.generateQI([
        "nsIStreamListener",
        "nsIRequestObserver",
      ]),
    };

    service.streamMessage(
      attachment.url,
      streamlistener,
      null, // aMsgWindow
      null, // aUrlListener
      false, // aConvertData
      "" //aAdditionalHeader
    );
  });
  await IOUtils.write(
    pathTempFile,
    lazy.MailStringUtils.byteStringToUint8Array(bytes)
  );
  return tempFile;
}

/**
 * Add a list of attachment objects as attachments. The attachment URLs must
 * be set.
 *
 * @param {nsIMsgAttachment[]} aAttachments - Objects to add as attachments.
 * @param {boolean} [aContentChanged=true] - Optional value to assign gContentChanged
 *   after adding attachments.
 */
async function AddAttachments(aAttachments, aContentChanged = true) {
  const addedAttachments = [];
  const items = [];

  for (const attachment of aAttachments) {
    if (!attachment?.url || DuplicateFileAlreadyAttached(attachment)) {
      continue;
    }

    if (!attachment.name) {
      attachment.name = gMsgCompose.AttachmentPrettyName(attachment.url, null);
    }

    // For security reasons, don't allow *-message:// uris to leak out.
    // We don't want to reveal the .slt path (for mailbox://), or the username
    // or hostname.
    // Don't allow file or mail/news protocol uris to leak out either.
    if (
      /^mailbox-message:|^imap-message:|^news-message:/i.test(attachment.name)
    ) {
      attachment.name = getComposeBundle().getString(
        "messageAttachmentSafeName"
      );
    } else if (/^file:|^mailbox:|^imap:|^s?news:/i.test(attachment.name)) {
      attachment.name = getComposeBundle().getString("partAttachmentSafeName");
    }

    // Create temporary files for message attachments.
    if (
      /^mailbox-message:|^imap-message:|^news-message:/i.test(attachment.url)
    ) {
      try {
        const messageFile = await messageAttachmentToFile(attachment);
        // Store the original mailbox:// url in contentLocation.
        attachment.contentLocation = attachment.url;
        attachment.url = Services.io.newFileURI(messageFile).spec;
      } catch (ex) {
        console.error(
          `Could not save message attachment ${attachment.url} as file: ${ex}`
        );
      }
    }

    if (
      attachment.msgUri &&
      /^mailbox-message:|^imap-message:|^news-message:/i.test(
        attachment.msgUri
      ) &&
      attachment.url &&
      /^mailbox:|^imap:|^s?news:/i.test(attachment.url)
    ) {
      // This is an attachment of another message, create a temporary file and
      // update the url.
      const pathTempDir = PathUtils.join(
        PathUtils.tempDir,
        "pid-" + Services.appinfo.processID
      );
      await IOUtils.makeDirectory(pathTempDir, { permissions: 0o700 });
      const tempDir = Cc["@mozilla.org/file/local;1"].createInstance(
        Ci.nsIFile
      );
      tempDir.initWithPath(pathTempDir);

      const tempFile = gMessenger.saveAttachmentToFolder(
        attachment.contentType,
        attachment.url,
        encodeURIComponent(attachment.name),
        attachment.msgUri,
        tempDir
      );
      const extAppLauncher = Cc[
        "@mozilla.org/uriloader/external-helper-app-service;1"
      ].getService(Ci.nsPIExternalAppLauncher);
      extAppLauncher.deleteTemporaryFileOnExit(tempFile);
      // Store the original mailbox:// url in contentLocation.
      attachment.contentLocation = attachment.url;
      attachment.url = Services.io.newFileURI(tempFile).spec;
    }

    const item = gAttachmentBucket.appendItem(attachment);
    addedAttachments.push(attachment);

    let tooltiptext;
    try {
      tooltiptext = decodeURI(attachment.url);
    } catch {
      tooltiptext = attachment.url;
    }
    item.setAttribute("tooltiptext", tooltiptext);
    item.addEventListener("command", OpenSelectedAttachment);
    items.push(item);
  }

  if (addedAttachments.length > 0) {
    // Trigger a visual feedback to let the user know how many attachments have
    // been added.
    gAttachmentCounter.textContent = `+${addedAttachments.length}`;
    toggleAttachmentAnimation();

    // Move the focus on the last attached file so the user can see a visual
    // feedback of what was added.
    gAttachmentBucket.selectedIndex = gAttachmentBucket.getIndexOfItem(
      items[items.length - 1]
    );

    // Ensure the selected item is visible and if not the box will scroll to it.
    gAttachmentBucket.ensureIndexIsVisible(gAttachmentBucket.selectedIndex);

    AttachmentsChanged("show", aContentChanged);
    dispatchAttachmentBucketEvent("attachments-added", addedAttachments);

    // Set min height for the attachment bucket.
    if (!gAttachmentBucket.style.minHeight) {
      // Min height is the height of the first child plus padding and border.
      // Note: we assume the computed styles have px values.
      const bucketStyle = getComputedStyle(gAttachmentBucket);
      const childStyle = getComputedStyle(gAttachmentBucket.firstChild);
      const minHeight =
        gAttachmentBucket.firstChild.getBoundingClientRect().height +
        parseFloat(childStyle.marginBlockStart) +
        parseFloat(childStyle.marginBlockEnd) +
        parseFloat(bucketStyle.paddingBlockStart) +
        parseFloat(bucketStyle.paddingBlockEnd) +
        parseFloat(bucketStyle.borderBlockStartWidth) +
        parseFloat(bucketStyle.borderBlockEndWidth);
      gAttachmentBucket.style.minHeight = `${minHeight}px`;
    }
  }

  // Always show the attachment pane if we have any attachment, to prevent
  // keeping the panel collapsed when the user interacts with the attachment
  // button.
  if (gAttachmentBucket.itemCount) {
    toggleAttachmentPane("show");
  }

  return items;
}

/**
 * Returns a sorted-by-index, "non-live" array of attachment list items.
 *
 * @param aAscending {boolean}: true (default): sort return array ascending
 *                              false         : sort return array descending
 * @param aSelectedOnly {boolean}: true: return array of selected items only.
 *                                 false (default): return array of all items.
 *
 * @returns {Array} an array of (all | selected) listItem elements in
 *                 attachmentBucket listbox, "non-live" and sorted by their index
 *                 in the list; [] if there are (no | no selected) attachments.
 */
function attachmentsGetSortedArray(aAscending = true, aSelectedOnly = false) {
  let listItems;

  if (aSelectedOnly) {
    // Selected attachments only.
    if (!gAttachmentBucket.selectedCount) {
      return [];
    }

    // gAttachmentBucket.selectedItems is a "live" and "unordered" node list
    // (items get added in the order they were added to the selection). But we
    // want a stable ("non-live") array of selected items, sorted by their index
    // in the list.
    listItems = [...gAttachmentBucket.selectedItems];
  } else {
    // All attachments.
    if (!gAttachmentBucket.itemCount) {
      return [];
    }

    listItems = [...gAttachmentBucket.itemChildren];
  }

  if (aAscending) {
    listItems.sort(
      (a, b) =>
        gAttachmentBucket.getIndexOfItem(a) -
        gAttachmentBucket.getIndexOfItem(b)
    );
  } else {
    // descending
    listItems.sort(
      (a, b) =>
        gAttachmentBucket.getIndexOfItem(b) -
        gAttachmentBucket.getIndexOfItem(a)
    );
  }
  return listItems;
}

/**
 * Returns a sorted-by-index, "non-live" array of selected attachment list items.
 *
 * @param aAscending {boolean}: true (default): sort return array ascending
 *                              false         : sort return array descending
 * @returns {Array} an array of selected listitem elements in attachmentBucket
 *                 listbox, "non-live" and sorted by their index in the list;
 *                 [] if no attachments selected
 */
function attachmentsSelectionGetSortedArray(aAscending = true) {
  return attachmentsGetSortedArray(aAscending, true);
}

/**
 * Return true if the selected attachment items are a coherent block in the list,
 * otherwise false.
 *
 * @param aListPosition (optional) - "top"   : Return true only if the block is
 *                                            at the top of the list.
 *                                  "bottom": Return true only if the block is
 *                                            at the bottom of the list.
 * @returns {boolean} true : The selected attachment items are a coherent block
 *                          (at the list edge if/as specified by 'aListPosition'),
 *                          or only 1 item selected.
 *                   false: The selected attachment items are NOT a coherent block
 *                          (at the list edge if/as specified by 'aListPosition'),
 *                          or no attachments selected, or no attachments,
 *                          or no attachmentBucket.
 */
function attachmentsSelectionIsBlock(aListPosition) {
  if (!gAttachmentBucket.selectedCount) {
    // No attachments selected, no attachments, or no attachmentBucket.
    return false;
  }

  const selItems = attachmentsSelectionGetSortedArray();
  const indexFirstSelAttachment = gAttachmentBucket.getIndexOfItem(selItems[0]);
  const indexLastSelAttachment = gAttachmentBucket.getIndexOfItem(
    selItems[gAttachmentBucket.selectedCount - 1]
  );
  const isBlock =
    indexFirstSelAttachment ==
    indexLastSelAttachment + 1 - gAttachmentBucket.selectedCount;

  switch (aListPosition) {
    case "top":
      // True if selection is a coherent block at the top of the list.
      return indexFirstSelAttachment == 0 && isBlock;
    case "bottom":
      // True if selection is a coherent block at the bottom of the list.
      return (
        indexLastSelAttachment == gAttachmentBucket.itemCount - 1 && isBlock
      );
    default:
      // True if selection is a coherent block.
      return isBlock;
  }
}

function AttachPage() {
  const result = { value: "http://" };
  if (
    Services.prompt.prompt(
      window,
      getComposeBundle().getString("attachPageDlogTitle"),
      getComposeBundle().getString("attachPageDlogMessage"),
      result,
      null,
      { value: 0 }
    )
  ) {
    if (result.value.length <= "http://".length) {
      // Nothing filled, just show the dialog again.
      AttachPage();
      return;
    }

    const attachment = Cc[
      "@mozilla.org/messengercompose/attachment;1"
    ].createInstance(Ci.nsIMsgAttachment);
    attachment.url = result.value;
    AddAttachments([attachment]);
  }
}

/**
 * Check if the given attachment already exists in the attachment bucket.
 *
 * @param nsIMsgAttachment - the attachment to check
 * @returns true if the attachment is already attached
 */
function DuplicateFileAlreadyAttached(attachment) {
  for (const item of gAttachmentBucket.itemChildren) {
    if (item.attachment && item.attachment.url) {
      if (item.attachment.url == attachment.url) {
        return true;
      }
      // Also check, if an attachment has been saved as a temporary file and its
      // original url is a match.
      if (
        item.attachment.contentLocation &&
        item.attachment.contentLocation == attachment.url
      ) {
        return true;
      }
    }
  }

  return false;
}

function Attachments2CompFields(compFields) {
  // First, we need to clear all attachment in the compose fields.
  compFields.removeAttachments();

  for (const item of gAttachmentBucket.itemChildren) {
    if (item.attachment) {
      compFields.addAttachment(item.attachment);
    }
  }
}

async function RemoveAllAttachments() {
  // Ensure that attachment pane is shown before removing all attachments.
  toggleAttachmentPane("show");

  if (!gAttachmentBucket.itemCount) {
    return;
  }

  await RemoveAttachments(gAttachmentBucket.itemChildren);
}

/**
 * Show or hide the attachment pane after updating its header bar information
 * (number and total file size of attachments) and tooltip.
 *
 * @param aShowBucket {Boolean} true: show the attachment pane
 *                              false (or omitted): hide the attachment pane
 */
function UpdateAttachmentBucket(aShowBucket) {
  updateAttachmentPane(aShowBucket ? "show" : "hide");
}

/**
 * Update the header bar information (number and total file size of attachments)
 * and tooltip of attachment pane, then (optionally) show or hide the pane.
 *
 * @param aShowPane {string} "show":  show the attachment pane
 *                           "hide":  hide the attachment pane
 *                           omitted: just update without changing pane visibility
 */
function updateAttachmentPane(aShowPane) {
  const count = gAttachmentBucket.itemCount;

  document.l10n.setAttributes(
    document.getElementById("attachmentBucketCount"),
    "attachment-bucket-count-value",
    {
      count,
    }
  );

  let attachmentsSize = 0;
  for (const item of gAttachmentBucket.itemChildren) {
    gAttachmentBucket.invalidateItem(item);
    attachmentsSize += item.cloudHtmlFileSize
      ? item.cloudHtmlFileSize
      : item.attachment.size;
  }

  document.getElementById("attachmentBucketSize").textContent =
    count > 0 ? gMessenger.formatFileSize(attachmentsSize) : "";

  document
    .getElementById("composeContentBox")
    .classList.toggle("attachment-area-hidden", !count);

  attachmentBucketUpdateTooltips();

  // If aShowPane argument is omitted, it's just updating, so we're done.
  if (aShowPane === undefined) {
    return;
  }

  // Otherwise, show or hide the panel per aShowPane argument.
  toggleAttachmentPane(aShowPane);
}

async function RemoveSelectedAttachment() {
  if (!gAttachmentBucket.selectedCount) {
    return;
  }

  await RemoveAttachments(gAttachmentBucket.selectedItems);
}

/**
 * Removes the provided attachmentItems from the composer and deletes all
 * associated cloud files.
 *
 * Note: Cloud file delete errors are not considered to be fatal errors. They do
 *       not prevent the attachments from being removed from the composer. Such
 *       errors are caught and logged to the console.
 *
 * @param {DOMNode[]} items - AttachmentItems to be removed
 */
async function RemoveAttachments(items) {
  // Remember the current focus index so we can try to restore it when done.
  const focusIndex = gAttachmentBucket.currentIndex;

  const fileHandler = Services.io
    .getProtocolHandler("file")
    .QueryInterface(Ci.nsIFileProtocolHandler);
  const removedAttachments = [];

  const promises = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];

    if (item.attachment.sendViaCloud && item.cloudFileAccount) {
      if (item.uploading) {
        const file = fileHandler.getFileFromURLSpec(item.attachment.url);
        promises.push(
          item.uploading
            .cancelFileUpload(window, file)
            .catch(ex => console.warn(ex.message))
        );
      } else {
        promises.push(
          item.cloudFileAccount
            .deleteFile(window, item.cloudFileUpload.id)
            .catch(ex => console.warn(ex.message))
        );
      }
    }

    removedAttachments.push(item.attachment);
    // Let's release the attachment object held by the node else it won't go
    // away until the window is destroyed
    item.attachment = null;
    item.remove();
  }

  if (removedAttachments.length > 0) {
    // Bug 1661507 workaround: Force update of selectedCount and selectedItem,
    // both wrong after item removal, to avoid confusion for listening command
    // controllers.
    gAttachmentBucket.clearSelection();

    AttachmentsChanged();
    dispatchAttachmentBucketEvent("attachments-removed", removedAttachments);
  }

  // Collapse the attachment container if all the items have been deleted.
  if (!gAttachmentBucket.itemCount) {
    toggleAttachmentPane("hide");
  } else {
    // Try to restore the original focused item or somewhere close by.
    gAttachmentBucket.currentIndex =
      focusIndex < gAttachmentBucket.itemCount
        ? focusIndex
        : gAttachmentBucket.itemCount - 1;
  }

  await Promise.all(promises);
}

async function RenameSelectedAttachment() {
  if (gAttachmentBucket.selectedItems.length != 1) {
    // Not one attachment selected.
    return;
  }

  const item = gAttachmentBucket.getSelectedItem(0);
  const originalName = item.attachment.name;
  const attachmentName = { value: originalName };
  if (
    Services.prompt.prompt(
      window,
      getComposeBundle().getString("renameAttachmentTitle"),
      getComposeBundle().getString("renameAttachmentMessage"),
      attachmentName,
      null,
      { value: 0 }
    )
  ) {
    if (attachmentName.value == "" || attachmentName.value == originalName) {
      // Name was not filled nor changed, bail out.
      return;
    }
    try {
      await UpdateAttachment(item, {
        name: attachmentName.value,
        relatedCloudFileUpload: item.CloudFileUpload,
      });
    } catch (ex) {
      showLocalizedCloudFileAlert(ex);
    }
  }
}

/* eslint-disable complexity */
/**
 * Move selected attachment(s) within the attachment list.
 *
 * @param {string} aDirection - The direction in which to move the attachments.
 *   "left"      : Move attachments left in the list.
 *   "right"     : Move attachments right in the list.
 *   "top"       : Move attachments to the top of the list.
 *   "bottom"    : Move attachments to the bottom of the list.
 *   "bundleUp"  : Move attachments together (upwards).
 *   "bundleDown": Move attachments together (downwards).
 *   "toggleSort": Sort attachments alphabetically (toggle).
 */
function moveSelectedAttachments(aDirection) {
  // Command controllers will bail out if no or all attachments are selected,
  // or if block selections can't be moved, or if other direction-specific
  // adverse circumstances prevent the intended movement.
  if (!aDirection) {
    return;
  }

  // Ensure focus on gAttachmentBucket when we're coming from
  // 'Reorder Attachments' panel.
  gAttachmentBucket.focus();

  // Get a sorted and "non-live" array of gAttachmentBucket.selectedItems.
  const selItems = attachmentsSelectionGetSortedArray();

  // In case of misspelled aDirection.
  let visibleIndex = gAttachmentBucket.currentIndex;
  // Keep track of the item we had focused originally. Deselect it though,
  // since listbox gets confused if you move its focused item around.
  const focusItem = gAttachmentBucket.currentItem;
  gAttachmentBucket.currentItem = null;
  let upwards;
  let targetItem;

  switch (aDirection) {
    case "left":
    case "right":
      // Move selected attachments upwards/downwards.
      upwards = aDirection == "left";
      const blockItems = [];

      for (const item of selItems) {
        // Handle adjacent selected items en block, via blockItems array.
        blockItems.push(item); // Add current selItem to blockItems.
        const nextItem = item.nextElementSibling;
        if (!nextItem || !nextItem.selected) {
          // If current selItem is the last blockItem, check out its adjacent
          // item in the intended direction to see if there's room for moving.
          // Note that the block might contain one or more items.
          const checkItem = upwards
            ? blockItems[0].previousElementSibling
            : nextItem;
          // If block-adjacent checkItem exists (and is not selected because
          // then it would be part of the block), we can move the block to the
          // right position.
          if (checkItem) {
            targetItem = upwards
              ? // Upwards: Insert block items before checkItem,
                // i.e. before previousElementSibling of block.
                checkItem
              : // Downwards: Insert block items *after* checkItem,
                // i.e. *before* nextElementSibling.nextElementSibling of block,
                // which works according to spec even if that's null.
                checkItem.nextElementSibling;
            // Move current blockItems.
            for (const blockItem of blockItems) {
              gAttachmentBucket.insertBefore(blockItem, targetItem);
            }
          }
          // Else if checkItem doesn't exist, the block is already at the edge
          // of the list, so we can't move it in the intended direction.
          blockItems.length = 0; // Either way, we're done with the current block.
        }
        // Else if current selItem is NOT the end of the current block, proceed:
        // Add next selItem to the block and see if that's the end of the block.
      } // Next selItem.

      // Ensure helpful visibility of moved items (scroll into view if needed):
      // If first item of selection is now at the top, first list item.
      // Else if last item of selection is now at the bottom, last list item.
      // Otherwise, let's see where we are going by ensuring visibility of the
      // nearest unselected sibling of selection according to direction of move.
      if (gAttachmentBucket.getIndexOfItem(selItems[0]) == 0) {
        visibleIndex = 0;
      } else if (
        gAttachmentBucket.getIndexOfItem(selItems[selItems.length - 1]) ==
        gAttachmentBucket.itemCount - 1
      ) {
        visibleIndex = gAttachmentBucket.itemCount - 1;
      } else if (upwards) {
        visibleIndex = gAttachmentBucket.getIndexOfItem(
          selItems[0].previousElementSibling
        );
      } else {
        visibleIndex = gAttachmentBucket.getIndexOfItem(
          selItems[selItems.length - 1].nextElementSibling
        );
      }
      break;

    case "top":
    case "bottom":
    case "bundleUp":
    case "bundleDown":
      // Bundle selected attachments to top/bottom of the list or upwards/downwards.

      upwards = ["top", "bundleUp"].includes(aDirection);
      // Downwards: Reverse order of selItems so we can use the same algorithm.
      if (!upwards) {
        selItems.reverse();
      }

      if (["top", "bottom"].includes(aDirection)) {
        const listEdgeItem = gAttachmentBucket.getItemAtIndex(
          upwards ? 0 : gAttachmentBucket.itemCount - 1
        );
        const selEdgeItem = selItems[0];
        if (selEdgeItem != listEdgeItem) {
          // Top/Bottom: Move the first/last selected item to the edge of the list
          // so that we always have an initial anchor target block in the right
          // place, so we can use the same algorithm for top/bottom and
          // inner bundling.
          targetItem = upwards
            ? // Upwards: Insert before first list item.
              listEdgeItem
            : // Downwards: Insert after last list item, i.e.
              // *before* non-existing listEdgeItem.nextElementSibling,
              // which is null. It works because it's a feature.
              null;
          gAttachmentBucket.insertBefore(selEdgeItem, targetItem);
        }
      }
      // We now have a selected block (at least one item) at the target position.
      // Let's find the end (inner edge) of that block and move only the
      // remaining selected items to avoid unnecessary moves.
      targetItem = null;
      for (const item of selItems) {
        if (targetItem) {
          // We know where to move it, so move it!
          gAttachmentBucket.insertBefore(item, targetItem);
          if (!upwards) {
            // Downwards: As selItems are reversed, and there's no insertAfter()
            // method to insert *after* a stable target, we need to insert
            // *before* the first item of the target block at target position,
            // which is the current selItem which we've just moved onto the block.
            targetItem = item;
          }
        } else {
          // If there's no targetItem yet, find the inner edge of the target block.
          const nextItem = upwards
            ? item.nextElementSibling
            : item.previousElementSibling;
          if (!nextItem.selected) {
            // If nextItem is not selected, current selItem is the inner edge of
            // the initial anchor target block, so we can set targetItem.
            targetItem = upwards
              ? // Upwards: set stable targetItem.
                nextItem
              : // Downwards: set initial targetItem.
                item;
          }
          // Else if nextItem is selected, it is still part of initial anchor
          // target block, so just proceed to look for the edge of that block.
        }
      } // next selItem

      // Ensure visibility of first/last selected item after the move.
      visibleIndex = gAttachmentBucket.getIndexOfItem(selItems[0]);
      break;

    case "toggleSort":
      // Sort the selected attachments alphabetically after moving them together.
      // The command updater of cmd_sortAttachmentsToggle toggles the sorting
      // direction based on the current sorting and block status of the selection.

      const toggleCmd = document.getElementById("cmd_sortAttachmentsToggle");
      const sortDirection =
        toggleCmd.getAttribute("sortdirection") || "ascending";
      let sortItems;
      let sortSelection;

      if (gAttachmentBucket.selectedCount > 1) {
        // Sort selected attachments only.
        sortSelection = true;
        sortItems = selItems;
        // Move selected attachments together before sorting as a block.
        goDoCommand("cmd_moveAttachmentBundleUp");

        // Find the end of the selected block to find our targetItem.
        for (const item of selItems) {
          const nextItem = item.nextElementSibling;
          if (!nextItem || !nextItem.selected) {
            // If there's no nextItem (block at list bottom), or nextItem is
            // not selected, we've reached the end of the block.
            // Set the block's nextElementSibling as targetItem and exit loop.
            // Works by definition even if nextElementSibling aka nextItem is null.
            targetItem = nextItem;
            break;
          }
          // else if (nextItem && nextItem.selected), nextItem is still part of
          // the block, so proceed with checking its nextElementSibling.
        } // next selItem
      } else {
        // Sort all attachments.
        sortSelection = false;
        sortItems = attachmentsGetSortedArray();
        targetItem = null; // Insert at the end of the list.
      }
      // Now let's sort our sortItems according to sortDirection.
      if (sortDirection == "ascending") {
        sortItems.sort((a, b) =>
          a.attachment.name.localeCompare(b.attachment.name)
        );
      } else {
        // "descending"
        sortItems.sort((a, b) =>
          b.attachment.name.localeCompare(a.attachment.name)
        );
      }

      // Insert sortItems in new order before the nextElementSibling of the block.
      for (const item of sortItems) {
        gAttachmentBucket.insertBefore(item, targetItem);
      }

      if (sortSelection) {
        // After sorting selection: Ensure visibility of first selected item.
        visibleIndex = gAttachmentBucket.getIndexOfItem(selItems[0]);
      } else {
        // After sorting all items: Ensure visibility of selected item,
        // otherwise first list item.
        visibleIndex =
          selItems.length == 1 ? gAttachmentBucket.selectedIndex : 0;
      }
      break;
  } // end switch (aDirection)

  // Restore original focus.
  gAttachmentBucket.currentItem = focusItem;
  // Ensure smart visibility of a relevant item according to direction.
  gAttachmentBucket.ensureIndexIsVisible(visibleIndex);

  // Moving selected items around does not trigger auto-updating of our command
  // handlers, so we must do it now as the position of selected items has changed.
  updateReorderAttachmentsItems();
}
/* eslint-enable complexity */

/**
 * Toggle attachment pane view state: show or hide it.
 * If aAction parameter is omitted, toggle current view state.
 *
 * @param {string} [aAction = "toggle"] - "show":   show attachment pane
 *                                        "hide":   hide attachment pane
 *                                        "toggle": toggle attachment pane
 */
function toggleAttachmentPane(aAction = "toggle") {
  const attachmentArea = document.getElementById("attachmentArea");

  if (aAction == "toggle") {
    // Interrupt if we don't have any attachment as we don't want nor need to
    // show an empty container.
    if (!gAttachmentBucket.itemCount) {
      return;
    }

    if (attachmentArea.open && document.activeElement != gAttachmentBucket) {
      // Interrupt and move the focus to the attachment pane if it's already
      // visible but not currently focused.
      moveFocusToAttachmentPane();
      return;
    }

    // Toggle attachment pane.
    attachmentArea.open = !attachmentArea.open;
  } else {
    attachmentArea.open = aAction != "hide";
  }
}

/**
 * Update the #attachmentArea according to its open state.
 */
function attachmentAreaOnToggle() {
  const attachmentArea = document.getElementById("attachmentArea");
  const bucketHasFocus = document.activeElement == gAttachmentBucket;
  if (attachmentArea.open && !bucketHasFocus) {
    moveFocusToAttachmentPane();
  } else if (!attachmentArea.open && bucketHasFocus) {
    // Move the focus to the message body only if the bucket was focused.
    focusMsgBody();
  }

  // Make the splitter non-interactive whilst the bucket is hidden.
  document
    .getElementById("composeContentBox")
    .classList.toggle("attachment-bucket-closed", !attachmentArea.open);

  // Update the checkmark on menuitems hooked up with cmd_toggleAttachmentPane.
  // Menuitem does not have .checked property nor .toggleAttribute(), sigh.
  for (const menuitem of document.querySelectorAll(
    'menuitem[command="cmd_toggleAttachmentPane"]'
  )) {
    if (attachmentArea.open) {
      menuitem.setAttribute("checked", "true");
      continue;
    }
    menuitem.removeAttribute("checked");
  }

  // Update the title based on the collapsed status of the bucket.
  document.l10n.setAttributes(
    attachmentArea.querySelector("summary"),
    attachmentArea.open ? "attachment-area-hide" : "attachment-area-show"
  );
}

/**
 * Ensure the focus is properly moved to the Attachment Bucket, and to the first
 * available item if present.
 */
function moveFocusToAttachmentPane() {
  gAttachmentBucket.focus();

  if (gAttachmentBucket.currentItem) {
    gAttachmentBucket.ensureElementIsVisible(gAttachmentBucket.currentItem);
  }
}

function showReorderAttachmentsPanel() {
  // Ensure attachment pane visibility as it might be collapsed.
  toggleAttachmentPane("show");
  showPopupById(
    "reorderAttachmentsPanel",
    "attachmentBucket",
    "after_start",
    15,
    0
  );
  // After the panel is shown, focus attachmentBucket so that keyboard
  // operation for selecting and moving attachment items works; the panel
  // helpfully presents the keyboard shortcuts for moving things around.
  // Bucket focus is also required because the panel will only close with ESC
  // or attachmentBucketOnBlur(), and that's because we're using noautohide as
  // event.preventDefault() of onpopuphiding event fails when the panel
  // is auto-hiding, but we don't want panel to hide when focus goes to bucket.
  gAttachmentBucket.focus();
}

/**
 * Returns a string representing the current sort order of selected attachment
 * items by their names. We don't check if selected items form a coherent block
 * or not; use attachmentsSelectionIsBlock() to check on that.
 *
 * @returns {string} "ascending" : Sort order is ascending.
 *                  "descending": Sort order is descending.
 *                  "equivalent": The names of all selected items are equivalent.
 *                  ""          : There's no sort order, or only 1 item selected,
 *                                or no items selected, or no attachments,
 *                                or no attachmentBucket.
 */
function attachmentsSelectionGetSortOrder() {
  return attachmentsGetSortOrder(true);
}

/**
 * Returns a string representing the current sort order of attachment items
 * by their names.
 *
 * @param aSelectedOnly {boolean}: true: return sort order of selected items only.
 *                                 false (default): return sort order of all items.
 *
 * @returns {string} "ascending" : Sort order is ascending.
 *                  "descending": Sort order is descending.
 *                  "equivalent": The names of the items are equivalent.
 *                  ""          : There's no sort order, or no attachments,
 *                                or no attachmentBucket; or (with aSelectedOnly),
 *                                only 1 item selected, or no items selected.
 */
function attachmentsGetSortOrder(aSelectedOnly = false) {
  let listItems;
  if (aSelectedOnly) {
    if (gAttachmentBucket.selectedCount <= 1) {
      return "";
    }

    listItems = attachmentsSelectionGetSortedArray();
  } else {
    // aSelectedOnly == false
    if (!gAttachmentBucket.itemCount) {
      return "";
    }

    listItems = attachmentsGetSortedArray();
  }

  // We're comparing each item to the next item, so exclude the last item.
  const listItems1 = listItems.slice(0, -1);

  // Check if some adjacent items are sorted ascending.
  const someAscending = listItems1.some(
    (item, index) =>
      item.attachment.name.localeCompare(listItems[index + 1].attachment.name) <
      0
  );

  // Check if some adjacent items are sorted descending.
  const someDescending = listItems1.some(
    (item, index) =>
      item.attachment.name.localeCompare(listItems[index + 1].attachment.name) >
      0
  );

  // Unsorted (but not all equivalent in sort order)
  if (someAscending && someDescending) {
    return "";
  }

  if (someAscending && !someDescending) {
    return "ascending";
  }

  if (someDescending && !someAscending) {
    return "descending";
  }

  // No ascending pairs, no descending pairs, so all equivalent in sort order.
  // if (!someAscending && !someDescending)
  return "equivalent";
}

function reorderAttachmentsPanelOnPopupShowing() {
  const panel = document.getElementById("reorderAttachmentsPanel");
  const buttonsNodeList = panel.querySelectorAll(".panelButton");
  const buttons = [...buttonsNodeList]; // convert NodeList to Array
  // Let's add some pretty keyboard shortcuts to the buttons.
  buttons.forEach(btn => {
    if (btn.hasAttribute("key")) {
      btn.setAttribute("prettykey", getPrettyKey(btn.getAttribute("key")));
    }
  });
  // Focus attachment bucket to activate attachmentBucketController, which is
  // required for updating the reorder commands.
  gAttachmentBucket.focus();
  // We're updating commands before showing the panel so that button states
  // don't change after the panel is shown, and also because focus is still
  // in attachment bucket right now, which is required for updating them.
  updateReorderAttachmentsItems();
}

function attachmentHeaderContextOnPopupShowing() {
  const initiallyShowItem = document.getElementById(
    "attachmentHeaderContext_initiallyShowItem"
  );

  initiallyShowItem.setAttribute(
    "checked",
    Services.prefs.getBoolPref("mail.compose.show_attachment_pane")
  );
}

function toggleInitiallyShowAttachmentPane(aMenuItem) {
  Services.prefs.setBoolPref(
    "mail.compose.show_attachment_pane",
    aMenuItem.getAttribute("checked")
  );
}

/**
 * Handle blur event on attachment pane and control visibility of
 * reorderAttachmentsPanel.
 */
function attachmentBucketOnBlur() {
  const reorderAttachmentsPanel = document.getElementById(
    "reorderAttachmentsPanel"
  );
  // If attachment pane has really lost focus, and if reorderAttachmentsPanel is
  // not currently in the process of showing up, hide reorderAttachmentsPanel.
  // Otherwise, keep attachments selected and the reorderAttachmentsPanel open
  // when reordering and after renaming via dialog.
  if (
    document.activeElement.id != "attachmentBucket" &&
    reorderAttachmentsPanel.state != "showing"
  ) {
    reorderAttachmentsPanel.hidePopup();
  }
}

/**
 * Handle the keypress on the attachment bucket.
 *
 * @param {Event} event - The keypress DOM Event.
 */
function attachmentBucketOnKeyPress(event) {
  // Interrupt if the Alt modifier is pressed, meaning the user is reordering
  // the list of attachments.
  if (event.altKey) {
    return;
  }

  switch (event.key) {
    case "Escape":
      const reorderAttachmentsPanel = document.getElementById(
        "reorderAttachmentsPanel"
      );

      // Close the reorderAttachmentsPanel if open and interrupt.
      if (reorderAttachmentsPanel.state == "open") {
        reorderAttachmentsPanel.hidePopup();
        return;
      }

      if (gAttachmentBucket.itemCount) {
        // Deselect selected items in a full bucket if any.
        if (gAttachmentBucket.selectedCount) {
          gAttachmentBucket.clearSelection();
          return;
        }

        // Move the focus to the message body.
        focusMsgBody();
        return;
      }

      // Close an empty bucket.
      toggleAttachmentPane("hide");
      break;

    case "Enter":
      // Enter on empty bucket to add file attachments, convenience
      // keyboard equivalent of single-click on bucket whitespace.
      if (!gAttachmentBucket.itemCount) {
        goDoCommand("cmd_attachFile");
      }
      break;

    case "ArrowLeft":
      gAttachmentBucket.moveByOffset(-1, !event.ctrlKey, event.shiftKey);
      event.preventDefault();
      break;

    case "ArrowRight":
      gAttachmentBucket.moveByOffset(1, !event.ctrlKey, event.shiftKey);
      event.preventDefault();
      break;

    case "ArrowDown":
      gAttachmentBucket.moveByOffset(
        gAttachmentBucket._itemsPerRow(),
        !event.ctrlKey,
        event.shiftKey
      );
      event.preventDefault();
      break;

    case "ArrowUp":
      gAttachmentBucket.moveByOffset(
        -gAttachmentBucket._itemsPerRow(),
        !event.ctrlKey,
        event.shiftKey
      );

      event.preventDefault();
      break;
  }
}

function attachmentBucketOnClick(aEvent) {
  // Handle click on attachment pane whitespace normally clear selection.
  // If there are no attachments in the bucket, show 'Attach File(s)' dialog.
  if (
    aEvent.button == 0 &&
    aEvent.target.getAttribute("is") == "attachment-list" &&
    !aEvent.target.firstElementChild
  ) {
    goDoCommand("cmd_attachFile");
  }
}

function attachmentBucketOnSelect() {
  attachmentBucketUpdateTooltips();
  updateAttachmentItems();
}

function attachmentBucketUpdateTooltips() {
  // Attachment pane whitespace tooltip
  if (gAttachmentBucket.selectedCount) {
    gAttachmentBucket.tooltipText = getComposeBundle().getString(
      "attachmentBucketClearSelectionTooltip"
    );
  } else {
    gAttachmentBucket.tooltipText = getComposeBundle().getString(
      "attachmentBucketAttachFilesTooltip"
    );
  }
}

function OpenSelectedAttachment() {
  if (gAttachmentBucket.selectedItems.length != 1) {
    return;
  }
  const attachment = gAttachmentBucket.getSelectedItem(0).attachment;
  const attachmentUrl = attachment.url;

  const messagePrefix = /^mailbox-message:|^imap-message:|^news-message:/i;
  if (messagePrefix.test(attachmentUrl)) {
    // we must be dealing with a forwarded attachment, treat this special
    const msgHdr =
      MailServices.messageServiceFromURI(attachmentUrl).messageURIToMsgHdr(
        attachmentUrl
      );
    if (msgHdr) {
      MailUtils.openMessageInNewWindow(msgHdr);
    }
    return;
  }
  if (
    attachment.contentType == "application/pdf" ||
    /\.pdf$/i.test(attachment.name)
  ) {
    // @see msgHdrView.js which has simililar opening functionality
    const handlerInfo = gMIMEService.getFromTypeAndExtension(
      attachment.contentType,
      attachment.name.split(".").pop()
    );
    // Only open a new tab for pdfs if we are handling them internally.
    if (
      !handlerInfo.alwaysAskBeforeHandling &&
      handlerInfo.preferredAction == Ci.nsIHandlerInfo.handleInternally
    ) {
      // Add the content type to avoid a "how do you want to open this?"
      // dialog. The type may already be there, but that doesn't matter.
      let url = attachment.url;
      if (!url.includes("type=")) {
        url += url.includes("?") ? "&" : "?";
        url += "type=application/pdf";
      }
      const tabmail = Services.wm
        .getMostRecentWindow("mail:3pane")
        ?.document.getElementById("tabmail");
      if (tabmail) {
        tabmail.openTab("contentTab", {
          url,
          background: false,
          linkHandler: "single-page",
        });
        tabmail.ownerGlobal.focus();
        return;
      }
      // If no tabmail, open PDF same as other attachments.
    }
  }
  const uri = Services.io.newURI(attachmentUrl);
  const channel = Services.io.newChannelFromURI(
    uri,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  const uriLoader = Cc["@mozilla.org/uriloader;1"].getService(Ci.nsIURILoader);
  uriLoader.openURI(channel, true, new nsAttachmentOpener());
}

function nsAttachmentOpener() {}

nsAttachmentOpener.prototype = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIURIContentListener",
    "nsIInterfaceRequestor",
  ]),

  doContent(contentType, isContentPreferred, request, contentHandler) {
    // If we came here to display an attached message, make sure we provide a type.
    if (/[?&]part=/i.test(request.URI.query)) {
      const newQuery = request.URI.query + "&type=message/rfc822";
      request.URI = request.URI.mutate().setQuery(newQuery).finalize();
    }
    const newHandler = Cc[
      "@mozilla.org/uriloader/content-handler;1?type=application/x-message-display"
    ].createInstance(Ci.nsIContentHandler);
    newHandler.handleContent("application/x-message-display", this, request);
    return true;
  },

  isPreferred(contentType, desiredContentType) {
    if (contentType == "message/rfc822") {
      return true;
    }
    return false;
  },

  canHandleContent(contentType, isContentPreferred, desiredContentType) {
    return false;
  },

  getInterface(iid) {
    if (iid.equals(Ci.nsIDOMWindow)) {
      return window;
    }
    if (iid.equals(Ci.nsIDocShell)) {
      return window.docShell;
    }
    return this.QueryInterface(iid);
  },

  loadCookie: null,
  parentContentListener: null,
};

/**
 * Determine the sending format depending on the selected format, or the content
 * of the message body.
 *
 * @returns {nsIMsgCompSendFormat} The determined send format: either PlainText,
 *   HTML or Both (never Auto or Unset).
 */
function determineSendFormat() {
  if (!gMsgCompose.composeHTML) {
    return Ci.nsIMsgCompSendFormat.PlainText;
  }

  const sendFormat = gMsgCompose.compFields.deliveryFormat;
  if (sendFormat != Ci.nsIMsgCompSendFormat.Auto) {
    return sendFormat;
  }

  // Auto downgrade if safe to do so.
  let convertible;
  try {
    convertible = gMsgCompose.bodyConvertible();
  } catch (ex) {
    return Ci.nsIMsgCompSendFormat.Both;
  }
  return convertible == Ci.nsIMsgCompConvertible.Plain
    ? Ci.nsIMsgCompSendFormat.PlainText
    : Ci.nsIMsgCompSendFormat.Both;
}

/**
 * Expands mailinglists found in the recipient fields.
 */
function expandRecipients() {
  gMsgCompose.expandMailingLists();
}

/**
 * Hides addressing options (To, CC, Bcc, Newsgroup, Followup-To, etc.)
 * that are not relevant for the account type used for sending.
 *
 * @param {string} accountKey - Key of the account that is currently selected
 *   as the sending account.
 * @param {string} prevKey - Key of the account that was previously selected
 *   as the sending account.
 */
function hideIrrelevantAddressingOptions(accountKey, prevKey) {
  let showNews = false;
  for (const account of MailServices.accounts.accounts) {
    if (account.incomingServer.type == "nntp") {
      showNews = true;
    }
  }
  // If there is no News (NNTP) account existing then
  // hide the Newsgroup and Followup-To recipient type menuitems.
  for (const item of document.querySelectorAll(".news-show-row-menuitem")) {
    showAddressRowMenuItemSetVisibility(item, showNews);
  }

  const account = MailServices.accounts.getAccount(accountKey);
  const accountType = account.incomingServer.type;

  // If the new account is a News (NNTP) account.
  if (accountType == "nntp") {
    updateUIforNNTPAccount();
    return;
  }

  // If the new account is a Mail account and a previous account was selected.
  if (accountType != "nntp" && prevKey != "") {
    updateUIforMailAccount();
  }
}

function LoadIdentity(startup) {
  const identityElement = document.getElementById("msgIdentity");
  const prevIdentity = gCurrentIdentity;

  let idKey = null;
  let accountKey = null;
  const prevKey = getCurrentAccountKey();
  if (identityElement.selectedItem) {
    // Set the identity key value on the menu list.
    idKey = identityElement.selectedItem.getAttribute("identitykey");
    identityElement.setAttribute("identitykey", idKey);
    gCurrentIdentity = MailServices.accounts.getIdentity(idKey);

    // Set the account key value on the menu list.
    accountKey = identityElement.selectedItem.getAttribute("accountkey");
    identityElement.setAttribute("accountkey", accountKey);

    // Update the addressing options only if a new account was selected.
    if (prevKey != getCurrentAccountKey()) {
      hideIrrelevantAddressingOptions(accountKey, prevKey);
    }
  }
  for (const input of document.querySelectorAll(".mail-input,.news-input")) {
    const params = JSON.parse(input.searchParam);
    params.idKey = idKey;
    params.accountKey = accountKey;
    input.searchParam = JSON.stringify(params);
  }

  if (startup) {
    // During compose startup, bail out here.
    return;
  }

  // Since switching the signature loses the caret position, we record it
  // and restore it later.
  const editor = GetCurrentEditor();
  const selection = editor.selection;
  const range = selection.getRangeAt(0);
  const start = range.startOffset;
  const startNode = range.startContainer;

  editor.enableUndo(false);

  // Handle non-startup changing of identity.
  if (prevIdentity && idKey != prevIdentity.key) {
    let changedRecipients = false;
    const prevReplyTo = prevIdentity.replyTo;
    let prevCc = "";
    let prevBcc = "";
    const prevReceipt = prevIdentity.requestReturnReceipt;
    const prevDSN = prevIdentity.DSN;
    const prevAttachVCard = prevIdentity.attachVCard;

    if (prevIdentity.doCc && prevIdentity.doCcList) {
      prevCc += prevIdentity.doCcList;
    }

    if (prevIdentity.doBcc && prevIdentity.doBccList) {
      prevBcc += prevIdentity.doBccList;
    }

    const newReplyTo = gCurrentIdentity.replyTo;
    let newCc = "";
    let newBcc = "";
    const newReceipt = gCurrentIdentity.requestReturnReceipt;
    const newDSN = gCurrentIdentity.DSN;
    const newAttachVCard = gCurrentIdentity.attachVCard;

    if (gCurrentIdentity.doCc && gCurrentIdentity.doCcList) {
      newCc += gCurrentIdentity.doCcList;
    }

    if (gCurrentIdentity.doBcc && gCurrentIdentity.doBccList) {
      newBcc += gCurrentIdentity.doBccList;
    }

    const msgCompFields = gMsgCompose.compFields;
    // Update recipients in msgCompFields to match pills currently in the UI.
    Recipients2CompFields(msgCompFields);

    if (
      !gReceiptOptionChanged &&
      prevReceipt == msgCompFields.returnReceipt &&
      prevReceipt != newReceipt
    ) {
      msgCompFields.returnReceipt = newReceipt;
      ToggleReturnReceipt(msgCompFields.returnReceipt);
    }

    if (
      !gDSNOptionChanged &&
      prevDSN == msgCompFields.DSN &&
      prevDSN != newDSN
    ) {
      msgCompFields.DSN = newDSN;
      document
        .getElementById("dsnMenu")
        .setAttribute("checked", msgCompFields.DSN);
    }

    if (
      !gAttachVCardOptionChanged &&
      prevAttachVCard == msgCompFields.attachVCard &&
      prevAttachVCard != newAttachVCard
    ) {
      msgCompFields.attachVCard = newAttachVCard;
      document
        .getElementById("cmd_attachVCard")
        .setAttribute("checked", msgCompFields.attachVCard);
    }

    if (newReplyTo != prevReplyTo) {
      if (prevReplyTo != "") {
        awRemoveRecipients(msgCompFields, "addr_reply", prevReplyTo);
      }
      if (newReplyTo != "") {
        awAddRecipients(msgCompFields, "addr_reply", newReplyTo);
      }
    }

    const toCcAddrs = new Set([
      ...msgCompFields.splitRecipients(msgCompFields.to, true),
      ...msgCompFields.splitRecipients(msgCompFields.cc, true),
    ]);

    if (newCc != prevCc) {
      if (prevCc) {
        awRemoveRecipients(msgCompFields, "addr_cc", prevCc);
      }
      if (newCc) {
        // Add only Auto-Cc recipients whose email is not already in To or CC.
        newCc = msgCompFields
          .splitRecipients(newCc, false)
          .filter(
            x => !toCcAddrs.has(...msgCompFields.splitRecipients(x, true))
          )
          .join(", ");
        awAddRecipients(msgCompFields, "addr_cc", newCc);
      }
      changedRecipients = true;
    }

    if (newBcc != prevBcc) {
      const toCcBccAddrs = new Set([
        ...toCcAddrs,
        ...msgCompFields.splitRecipients(newCc, true),
        ...msgCompFields.splitRecipients(msgCompFields.bcc, true),
      ]);

      if (prevBcc) {
        awRemoveRecipients(msgCompFields, "addr_bcc", prevBcc);
      }
      if (newBcc) {
        // Add only Auto-Bcc recipients whose email is not already in To, Cc,
        // Bcc, or added as Auto-CC from newCc declared above.
        newBcc = msgCompFields
          .splitRecipients(newBcc, false)
          .filter(
            x => !toCcBccAddrs.has(...msgCompFields.splitRecipients(x, true))
          )
          .join(", ");
        awAddRecipients(msgCompFields, "addr_bcc", newBcc);
      }
      changedRecipients = true;
    }

    // Handle showing/hiding of empty CC/BCC row after changing identity.
    // Whenever "Cc/Bcc these email addresses" aka mail.identity.id#.doCc/doBcc
    // is checked in Account Settings, show the address row, even if empty.
    // This is a feature especially for ux-efficiency of enterprise workflows.
    const addressRowCc = document.getElementById("addressRowCc");
    if (gCurrentIdentity.doCc) {
      // Per identity's doCc pref, show CC row, even if empty.
      showAndFocusAddressRow("addressRowCc");
    } else if (
      prevIdentity.doCc &&
      !addressRowCc.querySelector("mail-address-pill")
    ) {
      // Current identity doesn't need CC row shown, but previous identity did.
      // Hide CC row if it's empty.
      addressRowSetVisibility(addressRowCc, false);
    }

    const addressRowBcc = document.getElementById("addressRowBcc");
    if (gCurrentIdentity.doBcc) {
      // Per identity's doBcc pref, show BCC row, even if empty.
      showAndFocusAddressRow("addressRowBcc");
    } else if (
      prevIdentity.doBcc &&
      !addressRowBcc.querySelector("mail-address-pill")
    ) {
      // Current identity doesn't need BCC row shown, but previous identity did.
      // Hide BCC row if it's empty.
      addressRowSetVisibility(addressRowBcc, false);
    }

    // Trigger async checking and updating of encryption UI.
    adjustEncryptAfterIdentityChange(prevIdentity);

    try {
      gMsgCompose.identity = gCurrentIdentity;
    } catch (ex) {
      dump("### Cannot change the identity: " + ex + "\n");
    }

    window.dispatchEvent(new CustomEvent("compose-from-changed"));

    gComposeNotificationBar.clearIdentityWarning();

    // Trigger this method only if the Cc or Bcc recipients changed from the
    // previous identity.
    if (changedRecipients) {
      onRecipientsChanged(true);
    }
  }

  // Only do this if we aren't starting up...
  // It gets done as part of startup already.
  addRecipientsToIgnoreList(gCurrentIdentity.fullAddress);

  // If the From field is editable, reset the address from the identity.
  if (identityElement.editable) {
    identityElement.value = identityElement.selectedItem.value;
    identityElement.placeholder = getComposeBundle().getFormattedString(
      "msgIdentityPlaceholder",
      [identityElement.selectedItem.value]
    );
  }

  editor.enableUndo(true);
  editor.resetModificationCount();
  selection.collapse(startNode, start);

  // Try to focus the first available address row. If there are none, focus the
  // Subject which is always available.
  for (const row of document.querySelectorAll(".address-row")) {
    if (focusAddressRowInput(row)) {
      return;
    }
  }
  focusSubjectInput();
}

function MakeFromFieldEditable(ignoreWarning) {
  const bundle = getComposeBundle();
  if (
    !ignoreWarning &&
    !Services.prefs.getBoolPref("mail.compose.warned_about_customize_from")
  ) {
    var check = { value: false };
    if (
      Services.prompt.confirmEx(
        window,
        bundle.getString("customizeFromAddressTitle"),
        bundle.getString("customizeFromAddressWarning"),
        Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_OK +
          Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL +
          Services.prompt.BUTTON_POS_1_DEFAULT,
        null,
        null,
        null,
        bundle.getString("customizeFromAddressIgnore"),
        check
      ) != 0
    ) {
      return;
    }
    Services.prefs.setBoolPref(
      "mail.compose.warned_about_customize_from",
      check.value
    );
  }

  const customizeMenuitem = document.getElementById("cmd_customizeFromAddress");
  customizeMenuitem.setAttribute("disabled", "true");
  const identityElement = document.getElementById("msgIdentity");
  const identityElementWidth = `${
    identityElement.getBoundingClientRect().width
  }px`;
  identityElement.style.width = identityElementWidth;
  identityElement.removeAttribute("type");
  identityElement.setAttribute("editable", "true");
  identityElement.focus();
  identityElement.value = identityElement.selectedItem.value;
  identityElement.select();
  identityElement.placeholder = bundle.getFormattedString(
    "msgIdentityPlaceholder",
    [identityElement.selectedItem.value]
  );
}

/**
 * Set up autocomplete search parameters for address inputs of inbuilt headers.
 *
 * @param {Element} input - The address input of an inbuilt header field.
 */
function setupAutocompleteInput(input) {
  const params = JSON.parse(input.getAttribute("autocompletesearchparam"));
  params.type = input.closest(".address-row").dataset.recipienttype;
  input.setAttribute("autocompletesearchparam", JSON.stringify(params));

  // This method overrides the autocomplete binding's openPopup (essentially
  // duplicating the logic from the autocomplete popup binding's
  // openAutocompletePopup method), modifying it so that the popup is aligned
  // and sized based on the parentNode of the input field.
  input.openPopup = () => {
    if (input.focused) {
      input.popup.openAutocompletePopup(
        input.nsIAutocompleteInput,
        input.closest(".address-container")
      );
    }
  };
}

/**
 * Handle the keypress event of the From field.
 *
 * @param {Event} event - A DOM keypress event on #msgIdentity.
 */
function fromKeyPress(event) {
  if (event.key == "Enter") {
    // Move the focus to the first available address input.
    document
      .querySelector(
        "#recipientsContainer .address-row:not(.hidden) .address-row-input"
      )
      .focus();
  }
}

/**
 * Handle the keypress event of the subject input.
 *
 * @param {Event} event - A DOM keypress event on #msgSubject.
 */
function subjectKeyPress(event) {
  if (event.key == "Delete" && event.repeat && gPreventRowDeletionKeysRepeat) {
    // Prevent repeated Delete keypress event if the flag is set.
    event.preventDefault();
    return;
  }
  // Enable repeated deletion if any other key is pressed, or if the Delete
  // keypress event is not repeated, or if the flag is already false.
  gPreventRowDeletionKeysRepeat = false;

  // Move the focus to the body only if the Enter key is pressed without any
  // modifier, as that would mean the user wants to send the message.
  if (event.key == "Enter" && !event.ctrlKey && !event.metaKey) {
    focusMsgBody();
  }
}

/**
 * Handle the input event of the subject input element.
 *
 * @param {Event} event - A DOM input event on #msgSubject.
 */
function msgSubjectOnInput(event) {
  gSubjectChanged = true;
  gContentChanged = true;
  SetComposeWindowTitle();
}

// Content types supported in the envelopeDragObserver.
const DROP_FLAVORS = [
  "application/x-moz-file",
  "text/x-moz-address",
  "text/x-moz-message",
  "text/x-moz-url",
  "text/uri-list",
];

// We can drag and drop addresses, files, messages and urls into the compose
// envelope.
var envelopeDragObserver = {
  /**
   * Adjust the drop target when dragging from the attachment bucket onto itself
   * by picking the nearest possible insertion point (generally, between two
   * list items).
   *
   * @param {Event} event - The drag-and-drop event being performed.
   * @returns {attachmentitem|string} - the adjusted drop target:
   *   - an attachmentitem node for inserting *before*
   *   - "none" if this isn't a valid insertion point
   *   - "afterLastItem" for appending at the bottom of the list.
   */
  _adjustDropTarget(event) {
    let target = event.target;
    if (target == gAttachmentBucket) {
      // Dragging or dropping at top/bottom border of the listbox
      if (
        (event.screenY - target.screenY) /
          target.getBoundingClientRect().height <
        0.5
      ) {
        target = gAttachmentBucket.firstElementChild;
      } else {
        target = gAttachmentBucket.lastElementChild;
      }
      // We'll check below if this is a valid target.
    } else if (target.id == "attachmentBucketCount") {
      // Dragging or dropping at top border of the listbox.
      // Allow bottom half of attachment list header as extended drop target
      // for top of list, because otherwise it would be too small.
      if (
        (event.screenY - target.screenY) /
          target.getBoundingClientRect().height >=
        0.5
      ) {
        target = gAttachmentBucket.firstElementChild;
        // We'll check below if this is a valid target.
      } else {
        // Top half of attachment list header: sorry, can't drop here.
        return "none";
      }
    }

    // Target is an attachmentitem.
    if (target.matches("richlistitem.attachmentItem")) {
      // If we're dragging/dropping in bottom half of attachmentitem,
      // adjust target to target.nextElementSibling (to show dropmarker above that).
      if (
        (event.screenY - target.screenY) /
          target.getBoundingClientRect().height >=
        0.5
      ) {
        target = target.nextElementSibling;

        // If there's no target.nextElementSibling, we're dragging/dropping
        // to the bottom of the list.
        if (!target) {
          // We can't move a bottom block selection to the bottom.
          if (attachmentsSelectionIsBlock("bottom")) {
            return "none";
          }

          // Not a bottom block selection: Target is *after* the last item.
          return "afterLastItem";
        }
      }
      // Check if the adjusted target attachmentitem is a valid target.
      const isBlock = attachmentsSelectionIsBlock();
      const prevItem = target.previousElementSibling;
      // If target is first list item, there's no previous sibling;
      // treat like unselected previous sibling.
      const prevSelected = prevItem ? prevItem.selected : false;
      if (
        (target.selected && (isBlock || prevSelected)) ||
        // target at end of block selection
        (isBlock && prevSelected)
      ) {
        // We can't move a block selection before/after itself,
        // or any selection onto itself, so trigger dropeffect "none".
        return "none";
      }
      return target;
    }

    return "none";
  },

  _showDropMarker(targetItem) {
    // Hide old drop marker.
    this._hideDropMarker();

    if (targetItem == "afterLastItem") {
      targetItem = gAttachmentBucket.lastElementChild;
      targetItem.setAttribute("dropOn", "after");
    } else {
      targetItem.setAttribute("dropOn", "before");
    }
  },

  _hideDropMarker() {
    gAttachmentBucket
      .querySelector(".attachmentItem[dropOn]")
      ?.removeAttribute("dropOn");
  },

  /**
   * Loop through all the valid data type flavors and return a list of valid
   * attachments to handle the various drag&drop actions.
   *
   * @param {Event} event - The drag-and-drop event being performed.
   * @param {boolean} isDropping - If the action was performed from the onDrop
   *   method and it needs to handle pills creation.
   *
   * @returns {nsIMsgAttachment[]} - The array of valid attachments.
   */
  getValidAttachments(event, isDropping) {
    const attachments = [];
    const dt = event.dataTransfer;
    const dataList = [];

    // Extract all the flavors matching the data type of the dragged elements.
    for (let i = 0; i < dt.mozItemCount; i++) {
      const types = Array.from(dt.mozTypesAt(i));
      for (const flavor of DROP_FLAVORS) {
        if (types.includes(flavor)) {
          const data = dt.mozGetDataAt(flavor, i);
          if (data) {
            dataList.push({ data, flavor });
            break;
          }
        }
      }
    }

    // Check if we have any valid attachment in the dragged data.
    for (let { data, flavor } of dataList) {
      gIsValidInline = false;
      let isValidAttachment = false;
      let prettyName;
      let size;
      let contentType;
      let msgUri;
      let cloudFileInfo;

      // We could be dropping an attachment of various flavors OR an address;
      // check and do the right thing.
      switch (flavor) {
        // Process attachments.
        case "application/x-moz-file":
          if (data instanceof Ci.nsIFile) {
            size = data.fileSize;
          }
          try {
            data = Services.io
              .getProtocolHandler("file")
              .QueryInterface(Ci.nsIFileProtocolHandler)
              .getURLSpecFromActualFile(data);
            isValidAttachment = true;
          } catch (e) {
            console.error(
              "Couldn't process the dragged file " + data.leafName + ":" + e
            );
          }
          break;

        case "text/x-moz-message":
          isValidAttachment = true;
          const msgHdr =
            MailServices.messageServiceFromURI(data).messageURIToMsgHdr(data);
          prettyName = msgHdr.mime2DecodedSubject;
          if (Services.prefs.getBoolPref("mail.forward_add_extension")) {
            prettyName += ".eml";
          }

          size = msgHdr.messageSize;
          contentType = "message/rfc822";
          break;

        // Data type representing:
        //  - URL strings dragged from a URL bar (Allow both attach and append).
        //    NOTE: This only works for macOS and Windows.
        //  - Attachments dragged from another message (Only attach).
        //  - Images dragged from the body of another message (Only append).
        case "text/uri-list":
        case "text/x-moz-url":
          const pieces = data.split("\n");
          data = pieces[0];
          if (pieces.length > 1) {
            prettyName = pieces[1];
          }
          if (pieces.length > 2) {
            size = parseInt(pieces[2]);
          }
          if (pieces.length > 3) {
            contentType = pieces[3];
          }
          if (pieces.length > 4) {
            msgUri = pieces[4];
          }
          if (pieces.length > 6) {
            cloudFileInfo = {
              cloudFileAccountKey: pieces[5],
              cloudPartHeaderData: pieces[6],
            };
          }

          // Show the attachment overlay only if the user is not dragging an
          // image form another message, since we can't get the correct file
          // name, nor we can properly handle the append inline outside the
          // editor drop event.
          isValidAttachment = !event.dataTransfer.types.includes(
            "application/x-moz-nativeimage"
          );
          // Show the append inline overlay only if this is not a file that was
          // dragged from the attachment bucket of another message.
          gIsValidInline = !event.dataTransfer.types.includes(
            "application/x-moz-file-promise"
          );
          break;

        // Process address: Drop it into recipient field.
        case "text/x-moz-address":
          // Process the drop only if the message body wasn't the target and we
          // called this method from the onDrop() method.
          if (event.target.baseURI != "about:blank?compose" && isDropping) {
            DropRecipient(event.target, data);
            // Prevent the default behaviour which drops the address text into
            // the widget.
            event.preventDefault();
          }
          break;
      }

      // Create the attachment and add it to attachments array.
      if (isValidAttachment) {
        const attachment = Cc[
          "@mozilla.org/messengercompose/attachment;1"
        ].createInstance(Ci.nsIMsgAttachment);
        attachment.url = data;
        attachment.name = prettyName;
        attachment.contentType = contentType;
        attachment.msgUri = msgUri;

        if (size !== undefined) {
          attachment.size = size;
        }

        if (cloudFileInfo) {
          attachment.cloudFileAccountKey = cloudFileInfo.cloudFileAccountKey;
          attachment.cloudPartHeaderData = cloudFileInfo.cloudPartHeaderData;
        }

        attachments.push(attachment);
      }
    }

    return attachments;
  },

  /**
   * Reorder the attachments dragged within the attachment bucket.
   *
   * @param {Event} event - The drag event.
   */
  _reorderDraggedAttachments(event) {
    // Adjust the drop target according to mouse position on list (items).
    const target = this._adjustDropTarget(event);
    // Get a non-live, sorted list of selected attachment list items.
    const selItems = attachmentsSelectionGetSortedArray();
    // Keep track of the item we had focused originally. Deselect it though,
    // since listbox gets confused if you move its focused item around.
    const focus = gAttachmentBucket.currentItem;
    gAttachmentBucket.currentItem = null;
    // Moving possibly non-coherent multiple selections around correctly
    // is much more complex than one might think...
    if (
      (target.matches && target.matches("richlistitem.attachmentItem")) ||
      target == "afterLastItem"
    ) {
      // Drop before targetItem in the list, or after last item.
      const blockItems = [];
      let targetItem;
      for (const item of selItems) {
        blockItems.push(item);
        if (target == "afterLastItem") {
          // Original target is the end of the list; append all items there.
          gAttachmentBucket.appendChild(item);
        } else if (target == selItems[0]) {
          // Original target is first item of first selected block.
          if (blockItems.includes(target)) {
            // Item is in first block: do nothing, find the end of the block.
            const nextItem = item.nextElementSibling;
            if (!nextItem || !nextItem.selected) {
              // We've reached the end of the first block.
              blockItems.length = 0;
              targetItem = nextItem;
            }
          } else {
            // Item is NOT in first block: insert before targetItem,
            // i.e. after end of first block.
            gAttachmentBucket.insertBefore(item, targetItem);
          }
        } else if (target.selected) {
          // Original target is not first item of first block,
          // but first item of another block.
          if (
            gAttachmentBucket.getIndexOfItem(item) <
            gAttachmentBucket.getIndexOfItem(target)
          ) {
            // Insert all items from preceding blocks before original target.
            gAttachmentBucket.insertBefore(item, target);
          } else if (blockItems.includes(target)) {
            // target is included in any selected block except first:
            // do nothing for that block, find its end.
            const nextItem = item.nextElementSibling;
            if (!nextItem || !nextItem.selected) {
              // end of block containing target
              blockItems.length = 0;
              targetItem = nextItem;
            }
          } else {
            // Item from block after block containing target: insert before
            // targetItem, i.e. after end of block containing target.
            gAttachmentBucket.insertBefore(item, targetItem);
          }
        } else {
          // target != selItems [0]
          // Original target is NOT first item of any block, and NOT selected:
          // Insert all items before the original target.
          gAttachmentBucket.insertBefore(item, target);
        }
      }
    }
    gAttachmentBucket.currentItem = focus;
  },

  handleInlineDrop(event) {
    // It would be nice here to be able to append images, but we can't really
    // assume if users want to add the image URL as clickable link or embedded
    // image, so we always default to clickable link.
    // We can later explore adding some UI choice to allow controlling the
    // outcome of this drop action, but users can still copy and paste the image
    // in the editor to cirumvent this potential issue.
    const editor = GetCurrentEditor();
    const attachments = this.getValidAttachments(event, true);

    for (const attachment of attachments) {
      if (!attachment?.url) {
        continue;
      }

      const link = editor.createElementWithDefaults("a");
      link.setAttribute("href", attachment.url);
      link.textContent =
        attachment.name ||
        gMsgCompose.AttachmentPrettyName(attachment.url, null);
      editor.insertElementAtSelection(link, true);
    }
  },

  async onDrop(event) {
    this._hideDropOverlay();

    const dragSession = gDragService.getCurrentSession();
    if (dragSession.sourceNode?.parentNode == gAttachmentBucket) {
      // We dragged from the attachment pane onto itself, so instead of
      // attaching a new object, we're just reordering them.
      this._reorderDraggedAttachments(event);
      this._hideDropMarker();
      return;
    }

    // Interrupt if we're dropping elements from within the message body.
    if (dragSession.sourceNode?.ownerDocument.URL == "about:blank?compose") {
      return;
    }

    // Interrupt if we're not dropping a file from outside the compose window
    // and we're not dragging a supported data type.
    if (
      !event.dataTransfer.files.length &&
      !DROP_FLAVORS.some(f => event.dataTransfer.types.includes(f))
    ) {
      return;
    }

    // If the drop happened on the inline container, and the dragged data is
    // valid for inline, bail out and handle it as inline text link.
    if (event.target.id == "addInline" && gIsValidInline) {
      this.handleInlineDrop(event);
      return;
    }

    // Handle the inline adding of images without triggering the creation of
    // any attachment if the user dropped only images above the #addInline box.
    if (
      event.target.id == "addInline" &&
      !this.isNotDraggingOnlyImages(event.dataTransfer)
    ) {
      this.appendImagesInline(event.dataTransfer);
      return;
    }

    const attachments = this.getValidAttachments(event, true);

    // Interrupt if we don't have anything to attach.
    if (!attachments.length) {
      return;
    }

    const addedAttachmentItems = await AddAttachments(attachments);
    // Convert attachments back to cloudFiles, if any.
    for (const attachmentItem of addedAttachmentItems) {
      if (
        !attachmentItem.attachment.cloudFileAccountKey ||
        !attachmentItem.attachment.cloudPartHeaderData
      ) {
        continue;
      }
      try {
        const account = cloudFileAccounts.getAccount(
          attachmentItem.attachment.cloudFileAccountKey
        );
        const upload = JSON.parse(
          atob(attachmentItem.attachment.cloudPartHeaderData)
        );
        await UpdateAttachment(attachmentItem, {
          cloudFileAccount: account,
          relatedCloudFileUpload: upload,
        });
      } catch (ex) {
        showLocalizedCloudFileAlert(ex);
      }
    }
    gAttachmentBucket.focus();

    // Stop the propagation only if we actually attached something.
    event.stopPropagation();
  },

  onDragOver(event) {
    const dragSession = gDragService.getCurrentSession();

    // Check if we're dragging from the attachment bucket onto itself.
    if (dragSession.sourceNode?.parentNode == gAttachmentBucket) {
      event.stopPropagation();
      event.preventDefault();

      // Show a drop marker.
      const target = this._adjustDropTarget(event);

      if (
        (target.matches && target.matches("richlistitem.attachmentItem")) ||
        target == "afterLastItem"
      ) {
        // Adjusted target is an attachment list item; show dropmarker.
        this._showDropMarker(target);
        return;
      }

      // target == "none", target is not a listItem, or no target:
      // Indicate that we can't drop here.
      this._hideDropMarker();
      event.dataTransfer.dropEffect = "none";
      return;
    }

    // Interrupt if we're dragging elements from within the message body.
    if (dragSession.sourceNode?.ownerDocument.URL == "about:blank?compose") {
      return;
    }

    // No need to check for the same dragged files if the previous dragging
    // action didn't end.
    if (gIsDraggingAttachments) {
      // Prevent the default action of the event otherwise the onDrop event
      // won't be triggered.
      event.preventDefault();
      this.detectHoveredOverlay(event.target.id);
      return;
    }

    if (DROP_FLAVORS.some(f => event.dataTransfer.types.includes(f))) {
      // Show the drop overlay only if we dragged files or supported types.
      const attachments = this.getValidAttachments(event);
      if (attachments.length) {
        // We're dragging files that can potentially be attached or added
        // inline, so update the variable.
        gIsDraggingAttachments = true;

        event.stopPropagation();
        event.preventDefault();
        document
          .getElementById("dropAttachmentOverlay")
          .classList.add("showing");

        document.l10n.setAttributes(
          document.getElementById("addAsAttachmentLabel"),
          "drop-file-label-attachment",
          {
            count: attachments.length || 1,
          }
        );

        document.l10n.setAttributes(
          document.getElementById("addInlineLabel"),
          "drop-file-label-inline",
          {
            count: attachments.length || 1,
          }
        );

        // Show the #addInline box only if the user is dragging text that we
        // want to allow adding as text, as well as dragging only images, and
        // if this is not a plain text message.
        // NOTE: We're using event.dataTransfer.files.length instead of
        // attachments.length because we only need to consider images coming
        // from outside the application. The attachments array might contain
        // files dragged from other compose windows or received message, which
        // should not trigger the inline attachment overlay.
        document
          .getElementById("addInline")
          .classList.toggle(
            "hidden",
            !gIsValidInline &&
              (!event.dataTransfer.files.length ||
                this.isNotDraggingOnlyImages(event.dataTransfer) ||
                !gMsgCompose.composeHTML)
          );
      } else {
        DragAddressOverTargetControl(event);
      }
    }

    this.detectHoveredOverlay(event.target.id);
  },

  onDragLeave(event) {
    // Set the variable to false as a drag leave event was triggered.
    gIsDraggingAttachments = false;

    // We use a timeout since a drag leave event might occur also when the drag
    // motion passes above a child element and doesn't actually leave the
    // compose window.
    setTimeout(() => {
      // If after the timeout, the dragging boolean is true, it means the user
      // is still dragging something above the compose window, so let's bail out
      // to prevent visual flickering of the drop overlay.
      if (gIsDraggingAttachments) {
        return;
      }

      this._hideDropOverlay();
    }, 100);

    this._hideDropMarker();
  },

  /**
   * Hide the drag & drop overlay and update the global dragging variable to
   * false. This operations are set in a dedicated method since they need to be
   * called outside of the onDragleave() method.
   */
  _hideDropOverlay() {
    gIsDraggingAttachments = false;

    const overlay = document.getElementById("dropAttachmentOverlay");
    overlay.classList.remove("showing");
    overlay.classList.add("hiding");
  },

  /**
   * Loop through all the currently dragged or dropped files to see if there's
   * at least 1 file which is not an image.
   *
   * @param {DataTransfer} dataTransfer - The dataTransfer object from the drag
   *   or drop event.
   * @returns {boolean} True if at least one file is not an image.
   */
  isNotDraggingOnlyImages(dataTransfer) {
    for (const file of dataTransfer.files) {
      if (!file.type.includes("image/")) {
        return true;
      }
    }
    return false;
  },

  /**
   * Add or remove the hover effect to the droppable containers. We can't do it
   * simply via CSS since the hover events don't work when dragging an item.
   *
   * @param {string} targetId - The ID of the hovered overlay element.
   */
  detectHoveredOverlay(targetId) {
    document
      .getElementById("addInline")
      .classList.toggle("hover", targetId == "addInline");
    document
      .getElementById("addAsAttachment")
      .classList.toggle("hover", targetId == "addAsAttachment");
  },

  /**
   * Loop through all the images that have been dropped above the #addInline
   * box and create an image element to append to the message body.
   *
   * @param {DataTransfer} dataTransfer - The dataTransfer object from the drop
   *   event.
   */
  appendImagesInline(dataTransfer) {
    focusMsgBody();
    const editor = GetCurrentEditor();
    editor.beginTransaction();

    for (const file of dataTransfer.files) {
      if (!file.mozFullPath) {
        continue;
      }

      const realFile = Cc["@mozilla.org/file/local;1"].createInstance(
        Ci.nsIFile
      );
      realFile.initWithPath(file.mozFullPath);

      let imageElement;
      try {
        imageElement = editor.createElementWithDefaults("img");
      } catch (e) {
        dump("Failed to create a new image element!\n");
        console.error(e);
        continue;
      }

      const src = Services.io.newFileURI(realFile).spec;
      imageElement.setAttribute("src", src);
      imageElement.setAttribute("moz-do-not-send", "false");

      editor.insertElementAtSelection(imageElement, true);

      try {
        loadBlockedImage(src);
      } catch (e) {
        dump("Failed to load the appended image!\n");
        console.error(e);
        continue;
      }
    }

    editor.endTransaction();
  },
};

// See attachmentListDNDObserver, which should have the same logic.
const attachmentBucketDNDObserver = {
  onDragStart(event) {
    // NOTE: Starting a drag on an attachment item will normally also select
    // the attachment item before this method is called. But this is not
    // necessarily the case. E.g. holding Shift when starting the drag
    // operation. When it isn't selected, we just don't transfer.
    if (event.target.matches(".attachmentItem[selected]")) {
      // Also transfer other selected attachment items.
      const attachments = Array.from(
        gAttachmentBucket.querySelectorAll(".attachmentItem[selected]"),
        item => item.attachment
      );
      setupDataTransfer(event, attachments);
    }
    event.stopPropagation();
  },
};

function DisplaySaveFolderDlg(folderURI) {
  try {
    var showDialog = gCurrentIdentity.showSaveMsgDlg;
  } catch (e) {
    return;
  }

  if (showDialog) {
    const msgfolder = MailUtils.getExistingFolder(folderURI);
    if (!msgfolder) {
      return;
    }
    const checkbox = { value: 0 };
    const bundle = getComposeBundle();
    const SaveDlgTitle = bundle.getString("SaveDialogTitle");
    const dlgMsg = bundle.getFormattedString("SaveDialogMsg", [
      msgfolder.name,
      msgfolder.server.prettyName,
    ]);

    Services.prompt.alertCheck(
      window,
      SaveDlgTitle,
      dlgMsg,
      bundle.getString("CheckMsg"),
      checkbox
    );
    try {
      gCurrentIdentity.showSaveMsgDlg = !checkbox.value;
    } catch (e) {}
  }
}

/**
 * Focus the people search input in the contacts side panel.
 *
 * Note, this is used as a {@link moveFocusWithin} method.
 *
 * @returns {boolean} - Whether the peopleSearchInput was focused.
 */
function focusContactsSidebarSearchInput() {
  if (document.getElementById("contactsSplitter").isCollapsed) {
    return false;
  }
  const input = document
    .getElementById("contactsBrowser")
    .contentDocument.getElementById("peopleSearchInput");
  if (!input) {
    return false;
  }
  input.focus();
  return true;
}

/**
 * Focus the "From" identity input/selector.
 *
 * Note, this is used as a {@link moveFocusWithin} method.
 *
 * @returns {true} - Always returns true.
 */
function focusMsgIdentity() {
  document.getElementById("msgIdentity").focus();
  return true;
}

/**
 * Focus the address row input, provided the row is not hidden.
 *
 * Note, this is used as a {@link moveFocusWithin} method.
 *
 * @param {Element} row - The address row to focus.
 *
 * @returns {boolean} - Whether the input was focused.
 */
function focusAddressRowInput(row) {
  if (row.classList.contains("hidden")) {
    return false;
  }
  row.querySelector(".address-row-input").focus();
  return true;
}

/**
 * Focus the "Subject" input.
 *
 * Note, this is used as a {@link moveFocusWithin} method.
 *
 * @returns {true} - Always returns true.
 */
function focusSubjectInput() {
  document.getElementById("msgSubject").focus();
  return true;
}

/**
 * Focus the composed message body.
 *
 * Note, this is used as a {@link moveFocusWithin} method.
 *
 * @returns {true} - Always returns true.
 */
function focusMsgBody() {
  // window.content.focus() fails to blur the currently focused element
  document.commandDispatcher.advanceFocusIntoSubtree(
    document.getElementById("messageArea")
  );
  return true;
}

/**
 * Focus the attachment bucket, provided it is not hidden.
 *
 * Note, this is used as a {@link moveFocusWithin} method.
 *
 * @param {Element} attachmentArea - The attachment container.
 *
 * @returns {boolean} - Whether the attachment bucket was focused.
 */
function focusAttachmentBucket(attachmentArea) {
  if (
    document
      .getElementById("composeContentBox")
      .classList.contains("attachment-area-hidden")
  ) {
    return false;
  }
  if (!attachmentArea.open) {
    // Focus the expander instead.
    attachmentArea.querySelector("summary").focus();
    return true;
  }
  gAttachmentBucket.focus();
  return true;
}

/**
 * Focus the first notification button.
 *
 * Note, this is used as a {@link moveFocusWithin} method.
 *
 * @returns {boolean} - Whether a notification received focused.
 */
function focusNotification() {
  const notification = gComposeNotification.allNotifications[0];
  if (notification) {
    const button = notification.buttonContainer.querySelector("button");
    if (button) {
      button.focus();
    } else {
      // Focus the close button instead.
      notification.closeButton.focus();
    }
    return true;
  }
  return false;
}

/**
 * Focus the first focusable descendant of the status bar.
 *
 * Note, this is used as a {@link moveFocusWithin} method.
 *
 * @param {Element} attachmentArea - The status bar.
 *
 * @returns {boolean} - Whether a status bar descendant received focused.
 */
function focusStatusBar(statusBar) {
  const button = statusBar.querySelector("button:not([hidden])");
  if (!button) {
    return false;
  }
  button.focus();
  return true;
}

/**
 * Fast-track focus ring: Switch focus between important (not all) elements
 * in the message compose window in response to Ctrl+[Shift+]Tab or [Shift+]F6.
 *
 * @param {Event} event - A DOM keyboard event of a fast focus ring shortcut key
 */
function moveFocusToNeighbouringArea(event) {
  event.preventDefault();
  const currentElement = document.activeElement;

  for (let i = 0; i < gFocusAreas.length; i++) {
    // Go through each area and check if focus is within.
    let area = gFocusAreas[i];
    if (!area.root.contains(currentElement)) {
      continue;
    }
    // Focus is within, so we find the neighbouring area to move focus to.
    const end = i;
    while (true) {
      // Get the next neighbour.
      // NOTE: The focus will loop around.
      if (event.shiftKey) {
        // Move focus backward. If the index points to the start of the Array,
        // we loop back to the end of the Array.
        i = (i || gFocusAreas.length) - 1;
      } else {
        // Move focus forward. If the index points to the end of the Array, we
        // loop back to the start of the Array.
        i = (i + 1) % gFocusAreas.length;
      }
      if (i == end) {
        // Full loop around without finding an area to focus.
        // Unexpected, but we make sure to stop looping.
        break;
      }
      area = gFocusAreas[i];
      if (area.focus(area.root)) {
        // Successfully moved focus.
        break;
      }
      // Else, try the next neighbour.
    }
    return;
  }
  // Focus is currently outside the gFocusAreas list, so do nothing.
}

/**
 * If the contacts sidebar is shown, hide it. Otherwise, show the contacts
 * sidebar and focus it.
 */
function toggleContactsSidebar() {
  setContactsSidebarVisibility(
    document.getElementById("contactsSplitter").isCollapsed,
    true
  );
}

/**
 * Show or hide contacts sidebar.
 *
 * @param {boolean} show - Whether to show the sidebar or hide the sidebar.
 * @param {boolean} focus - Whether to focus peopleSearchInput if the sidebar is
 *   shown.
 */
function setContactsSidebarVisibility(show, focus) {
  const contactsSplitter = document.getElementById("contactsSplitter");
  const sidebarAddrMenu = document.getElementById("menu_AddressSidebar");
  const contactsButton = document.getElementById("button-contacts");

  if (show) {
    contactsSplitter.expand();
    sidebarAddrMenu.setAttribute("checked", "true");
    if (contactsButton) {
      contactsButton.setAttribute("checked", "true");
    }

    const contactsBrowser = document.getElementById("contactsBrowser");
    if (contactsBrowser.getAttribute("src") == "") {
      // Url not yet set, load contacts side bar and focus the search
      // input if applicable: We pass "?focus" as a URL querystring, then via
      // onload event of id="abContactsPanel", in AbPanelLoad() of
      // abContactsPanel.js, we do the focusing first thing to avoid timing
      // issues when trying to focus from here while contacts side bar is still
      // loading.
      let url = "chrome://messenger/content/addressbook/abContactsPanel.xhtml";
      if (focus) {
        url += "?focus";
      }
      contactsBrowser.setAttribute("src", url);
    } else if (focus) {
      // Url already set, so we can focus immediately if applicable.
      focusContactsSidebarSearchInput();
    }
  } else {
    const contactsSidebar = document.getElementById("contactsSidebar");
    // Before closing, check if the focus was within the contacts sidebar.
    const sidebarFocussed = contactsSidebar.contains(document.activeElement);

    contactsSplitter.collapse();
    sidebarAddrMenu.removeAttribute("checked");
    if (contactsButton) {
      contactsButton.removeAttribute("checked");
    }

    // Don't change the focus unless it was within the contacts sidebar.
    if (!sidebarFocussed) {
      return;
    }
    // Else, we need to explicitly move the focus out of the contacts sidebar.
    // We choose the subject input if it is empty, otherwise the message body.
    if (!document.getElementById("msgSubject").value) {
      focusSubjectInput();
    } else {
      focusMsgBody();
    }
  }
}

function loadHTMLMsgPrefs() {
  const fontFace = Services.prefs.getStringPref("msgcompose.font_face", "");
  if (fontFace) {
    doStatefulCommand("cmd_fontFace", fontFace, true);
  }

  const fontSize = Services.prefs.getCharPref("msgcompose.font_size", "3");
  EditorSetFontSize(fontSize);

  const bodyElement = GetBodyElement();

  const useDefault = Services.prefs.getBoolPref("msgcompose.default_colors");

  const textColor = useDefault
    ? ""
    : Services.prefs.getCharPref("msgcompose.text_color", "");
  if (!bodyElement.getAttribute("text") && textColor) {
    bodyElement.setAttribute("text", textColor);
    gDefaultTextColor = textColor;
    document.getElementById("cmd_fontColor").setAttribute("state", textColor);
    onFontColorChange();
  }

  const bgColor = useDefault
    ? ""
    : Services.prefs.getCharPref("msgcompose.background_color", "");
  if (!bodyElement.getAttribute("bgcolor") && bgColor) {
    bodyElement.setAttribute("bgcolor", bgColor);
    gDefaultBackgroundColor = bgColor;
    document
      .getElementById("cmd_backgroundColor")
      .setAttribute("state", bgColor);
    onBackgroundColorChange();
  }
}

async function AutoSave() {
  if (
    gMsgCompose.editor &&
    (gContentChanged || gMsgCompose.bodyModified) &&
    !gSendOperationInProgress &&
    !gSaveOperationInProgress
  ) {
    try {
      await GenericSendMessage(Ci.nsIMsgCompDeliverMode.AutoSaveAsDraft);
    } catch (ex) {
      console.error(ex);
    }
    gAutoSaveKickedIn = true;
  }

  gAutoSaveTimeout = setTimeout(AutoSave, gAutoSaveInterval);
}

/**
 * Periodically check for keywords in the message.
 */
var gAttachmentNotifier = {
  _obs: null,

  enabled: false,

  init(aDocument) {
    if (this._obs) {
      this.shutdown();
    }

    this.enabled = Services.prefs.getBoolPref(
      "mail.compose.attachment_reminder"
    );
    if (!this.enabled) {
      return;
    }

    this._obs = new MutationObserver(function (aMutations) {
      gAttachmentNotifier.timer.cancel();
      gAttachmentNotifier.timer.initWithCallback(
        gAttachmentNotifier.event,
        500,
        Ci.nsITimer.TYPE_ONE_SHOT
      );
    });

    this._obs.observe(aDocument, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });

    // Add an input event listener for the subject field since there
    // are ways of changing its value without key presses.
    document
      .getElementById("msgSubject")
      .addEventListener("input", this.subjectInputObserver, true);

    // We could have been opened with a draft message already containing
    // some keywords, so run the checker once to pick them up.
    this.event.notify();
  },

  // Timer based function triggered by the inputEventListener
  // for the subject field.
  subjectInputObserver() {
    gAttachmentNotifier.timer.cancel();
    gAttachmentNotifier.timer.initWithCallback(
      gAttachmentNotifier.event,
      500,
      Ci.nsITimer.TYPE_ONE_SHOT
    );
  },

  /**
   * Checks for new keywords synchronously and run the usual handler.
   *
   * @param aManage  Determines whether to manage the notification according to keywords found.
   */
  redetectKeywords(aManage) {
    if (!this.enabled) {
      return;
    }

    attachmentWorker.onmessage(
      { data: this._checkForAttachmentKeywords(false) },
      aManage
    );
  },

  /**
   * Check if there are any keywords in the message.
   *
   * @param async  Whether we should run the regex checker asynchronously or not.
   *
   * @returns If async is true, attachmentWorker.message is called with the array
   *          of found keywords and this function returns null.
   *          If it is false, the array is returned from this function immediately.
   */
  _checkForAttachmentKeywords(async) {
    if (!this.enabled) {
      return async ? null : [];
    }

    if (attachmentNotificationSupressed()) {
      // If we know we don't need to show the notification,
      // we can skip the expensive checking of keywords in the message.
      // but mark it in the .lastMessage that the keywords are unknown.
      attachmentWorker.lastMessage = null;
      return async ? null : [];
    }

    const keywordsInCsv = Services.prefs.getComplexValue(
      "mail.compose.attachment_reminder_keywords",
      Ci.nsIPrefLocalizedString
    ).data;
    const mailBody = getBrowser().contentDocument.querySelector("body");

    // We use a new document and import the body into it. We do that to avoid
    // loading images that were previously blocked. Content policy of the newly
    // created data document will block the loads. Details: Bug 1409458 comment #22.
    const newDoc = getBrowser().contentDocument.implementation.createDocument(
      "",
      "",
      null
    );
    const mailBodyNode = newDoc.importNode(mailBody, true);

    // Don't check quoted text from reply.
    const blockquotes = mailBodyNode.getElementsByTagName("blockquote");
    for (let i = blockquotes.length - 1; i >= 0; i--) {
      blockquotes[i].remove();
    }

    // For plaintext composition the quotes we need to find and exclude are
    // <span _moz_quote="true">.
    const spans = mailBodyNode.querySelectorAll("span[_moz_quote]");
    for (let i = spans.length - 1; i >= 0; i--) {
      spans[i].remove();
    }

    // Ignore signature (html compose mode).
    const sigs = mailBodyNode.getElementsByClassName("moz-signature");
    for (let i = sigs.length - 1; i >= 0; i--) {
      sigs[i].remove();
    }

    // Replace brs with line breaks so node.textContent won't pull foo<br>bar
    // together to foobar.
    const brs = mailBodyNode.getElementsByTagName("br");
    for (let i = brs.length - 1; i >= 0; i--) {
      brs[i].parentNode.replaceChild(
        mailBodyNode.ownerDocument.createTextNode("\n"),
        brs[i]
      );
    }

    // Ignore signature (plain text compose mode).
    let mailData = mailBodyNode.textContent;
    const sigIndex = mailData.indexOf("-- \n");
    if (sigIndex > 0) {
      mailData = mailData.substring(0, sigIndex);
    }

    // Ignore replied messages (plain text and html compose mode).
    const repText = getComposeBundle().getString(
      "mailnews.reply_header_originalmessage"
    );
    const repIndex = mailData.indexOf(repText);
    if (repIndex > 0) {
      mailData = mailData.substring(0, repIndex);
    }

    // Ignore forwarded messages (plain text and html compose mode).
    const fwdText = getComposeBundle().getString(
      "mailnews.forward_header_originalmessage"
    );
    const fwdIndex = mailData.indexOf(fwdText);
    if (fwdIndex > 0) {
      mailData = mailData.substring(0, fwdIndex);
    }

    // Prepend the subject to see if the subject contains any attachment
    // keywords too, after making sure that the subject has changed
    // or after reopening a draft. For reply, redirect and forward,
    // only check when the input was changed by the user.
    const subject = document.getElementById("msgSubject").value;
    if (
      subject &&
      (gSubjectChanged ||
        (gEditingDraft &&
          (gComposeType == Ci.nsIMsgCompType.New ||
            gComposeType == Ci.nsIMsgCompType.NewsPost ||
            gComposeType == Ci.nsIMsgCompType.Draft ||
            gComposeType == Ci.nsIMsgCompType.Template ||
            gComposeType == Ci.nsIMsgCompType.EditTemplate ||
            gComposeType == Ci.nsIMsgCompType.EditAsNew ||
            gComposeType == Ci.nsIMsgCompType.MailToUrl)))
    ) {
      mailData = subject + " " + mailData;
    }

    if (!async) {
      return AttachmentChecker.getAttachmentKeywords(mailData, keywordsInCsv);
    }

    attachmentWorker.postMessage([mailData, keywordsInCsv]);
    return null;
  },

  shutdown() {
    if (this._obs) {
      this._obs.disconnect();
    }
    gAttachmentNotifier.timer.cancel();

    this._obs = null;
  },

  event: {
    notify(timer) {
      // Only run the checker if the compose window is initialized
      // and not shutting down.
      if (gMsgCompose) {
        // This runs the attachmentWorker asynchronously so if keywords are found
        // manageAttachmentNotification is run from attachmentWorker.onmessage.
        gAttachmentNotifier._checkForAttachmentKeywords(true);
      }
    },
  },

  timer: Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer),
};

/**
 * Helper function to remove a query part from a URL, so for example:
 * ...?remove=xx&other=yy becomes ...?other=yy.
 *
 * @param aURL    the URL from which to remove the query part
 * @param aQuery  the query part to remove
 * @returns the URL with the query part removed
 */
function removeQueryPart(aURL, aQuery) {
  // Quick pre-check.
  if (!aURL.includes(aQuery)) {
    return aURL;
  }

  const indexQM = aURL.indexOf("?");
  if (indexQM < 0) {
    return aURL;
  }

  const queryParts = aURL.substr(indexQM + 1).split("&");
  const indexPart = queryParts.indexOf(aQuery);
  if (indexPart < 0) {
    return aURL;
  }
  queryParts.splice(indexPart, 1);
  return aURL.substr(0, indexQM + 1) + queryParts.join("&");
}

function InitEditor() {
  var editor = GetCurrentEditor();

  // Set eEditorMailMask flag to avoid using content prefs for spell checker,
  // otherwise dictionary setting in preferences is ignored and dictionary is
  // inconsistent in subject and message body.
  const eEditorMailMask = Ci.nsIEditor.eEditorMailMask;
  editor.flags |= eEditorMailMask;
  document.getElementById("msgSubject").editor.flags |= eEditorMailMask;

  // Control insertion of line breaks.
  editor.returnInParagraphCreatesNewParagraph = Services.prefs.getBoolPref(
    "editor.CR_creates_new_p"
  );
  editor.document.execCommand(
    "defaultparagraphseparator",
    false,
    gMsgCompose.composeHTML &&
      Services.prefs.getBoolPref("mail.compose.default_to_paragraph")
      ? "p"
      : "br"
  );
  if (gMsgCompose.composeHTML) {
    // Re-enable table/image resizers.
    editor.QueryInterface(
      Ci.nsIHTMLAbsPosEditor
    ).absolutePositioningEnabled = true;
    editor.QueryInterface(
      Ci.nsIHTMLInlineTableEditor
    ).inlineTableEditingEnabled = true;
    editor.QueryInterface(Ci.nsIHTMLObjectResizer).objectResizingEnabled = true;
  }

  // We use loadSheetUsingURIString so that we get a synchronous load, rather
  // than having a late-finishing async load mark our editor as modified when
  // the user hasn't typed anything yet, but that means the sheet must not
  // @import slow things, especially not over the network.
  const domWindowUtils = GetCurrentEditorElement().contentWindow.windowUtils;
  domWindowUtils.loadSheetUsingURIString(
    "chrome://messenger/skin/messageQuotes.css",
    domWindowUtils.AGENT_SHEET
  );
  domWindowUtils.loadSheetUsingURIString(
    "chrome://messenger/skin/shared/composerOverlay.css",
    domWindowUtils.AGENT_SHEET
  );

  window.content.browsingContext.allowJavascript = false;
  window.content.browsingContext.docShell.allowAuth = false;
  window.content.browsingContext.docShell.allowMetaRedirects = false;
  gMsgCompose.initEditor(editor, window.content);

  if (!editor.document.doctype) {
    editor.document.insertBefore(
      editor.document.implementation.createDocumentType("html", "", ""),
      editor.document.firstChild
    );
  }

  // Then, we enable related UI entries.
  enableInlineSpellCheck(Services.prefs.getBoolPref("mail.spellcheck.inline"));
  gAttachmentNotifier.init(editor.document);

  // Listen for spellchecker changes, set document language to
  // dictionary picked by the user via the right-click menu in the editor.
  document.addEventListener("spellcheck-changed", updateDocumentLanguage);

  // XXX: the error event fires twice for each load. Why??
  editor.document.body.addEventListener(
    "error",
    function (event) {
      if (event.target.localName != "img") {
        return;
      }

      if (event.target.getAttribute("moz-do-not-send") == "true") {
        return;
      }

      const src = event.target.src;
      if (!src) {
        return;
      }
      if (!/^file:/i.test(src)) {
        // Check if this is a protocol that can fetch parts.
        const protocol = src.substr(0, src.indexOf(":")).toLowerCase();
        if (
          !(
            Services.io.getProtocolHandler(protocol) instanceof
            Ci.nsIMsgMessageFetchPartService
          )
        ) {
          // Can't fetch parts, don't try to load.
          return;
        }
      }

      if (event.target.classList.contains("loading-internal")) {
        // We're already loading this, or tried so unsuccessfully.
        return;
      }
      if (gOriginalMsgURI) {
        const msgSvc = MailServices.messageServiceFromURI(gOriginalMsgURI);
        const originalMsgNeckoURI = msgSvc.getUrlForUri(gOriginalMsgURI);
        if (
          src.startsWith(
            removeQueryPart(
              originalMsgNeckoURI.spec,
              "type=application/x-message-display"
            )
          ) ||
          // Special hack for saved messages.
          (src.includes("?number=0&") &&
            originalMsgNeckoURI.spec.startsWith("file://") &&
            src.startsWith(
              removeQueryPart(
                originalMsgNeckoURI.spec,
                "type=application/x-message-display"
              ).replace("file://", "mailbox://") + "number=0"
            ))
        ) {
          // Reply/Forward/Edit Draft/Edit as New can contain references to
          // images in the original message. Load those and make them data: URLs
          // now.
          event.target.classList.add("loading-internal");
          try {
            loadBlockedImage(src);
          } catch (e) {
            // Couldn't load the referenced image.
            console.error(e);
          }
        } else {
          // Appears to reference a random message. Notify and keep blocking.
          gComposeNotificationBar.setBlockedContent(src);
        }
      } else {
        // For file:, and references to parts of random messages, show the
        // blocked content notification.
        gComposeNotificationBar.setBlockedContent(src);
      }
    },
    true
  );

  // Convert mailnews URL back to data: URL.
  const background = editor.document.body.background;
  if (background && gOriginalMsgURI) {
    // Check that background has the same URL as the message itself.
    const msgSvc = MailServices.messageServiceFromURI(gOriginalMsgURI);
    const originalMsgNeckoURI = msgSvc.getUrlForUri(gOriginalMsgURI);
    if (
      background.startsWith(
        removeQueryPart(
          originalMsgNeckoURI.spec,
          "type=application/x-message-display"
        )
      )
    ) {
      try {
        editor.document.body.background = loadBlockedImage(background, true);
      } catch (e) {
        // Couldn't load the referenced image.
        console.error(e);
      }
    }
  }

  // Run menubar initialization first, to avoid TabsInTitlebar code picking
  // up mutations from it and causing a reflow.
  if (AppConstants.platform != "macosx") {
    AutoHideMenubar.init();
  }

  // For plain text compose, set the styles for quoted text according to
  // preferences.
  if (!gMsgCompose.composeHTML) {
    const style = editor.document.createElement("style");
    editor.document.head.appendChild(style);
    let fontStyle = "";
    let fontSize = "";
    switch (Services.prefs.getIntPref("mail.quoted_style")) {
      case 1:
        fontStyle = "font-weight: bold;";
        break;
      case 2:
        fontStyle = "font-style: italic;";
        break;
      case 3:
        fontStyle = "font-weight: bold; font-style: italic;";
        break;
    }

    switch (Services.prefs.getIntPref("mail.quoted_size")) {
      case 1:
        fontSize = "font-size: large;";
        break;
      case 2:
        fontSize = "font-size: small;";
        break;
    }

    const citationColor =
      "color: " + Services.prefs.getCharPref("mail.citation_color") + ";";

    style.sheet.insertRule(
      `span[_moz_quote="true"] {
      ${fontStyle}
      ${fontSize}
      ${citationColor}
      }`
    );
    gMsgCompose.bodyModified = false;
  }

  // Set document language to the draft language or the preference
  // if this is a draft or template we prepared.
  let draftLanguages = null;
  if (
    gMsgCompose.compFields.creatorIdentityKey &&
    gMsgCompose.compFields.contentLanguage
  ) {
    draftLanguages = gMsgCompose.compFields.contentLanguage
      .split(",")
      .map(lang => lang.trim());
  }

  const dictionaries = getValidSpellcheckerDictionaries(draftLanguages);
  ComposeChangeLanguage(dictionaries).catch(console.error);
}

function setFontSize(event) {
  // Increase Font Menuitem and Decrease Font Menuitem from the main menu
  // will call this function because of oncommand attribute on the menupopup
  // and fontSize will be null for such function calls.
  const fontSize = event.target.value;
  if (fontSize) {
    EditorSetFontSize(fontSize);
  }
}

function setParagraphState(event) {
  editorSetParagraphState(event.target.value);
}

// This is used as event listener to spellcheck-changed event to update
// document language.
function updateDocumentLanguage(e) {
  ComposeChangeLanguage(e.detail.dictionaries).catch(console.error);
}

function toggleSpellCheckingEnabled() {
  enableInlineSpellCheck(!gSpellCheckingEnabled);
}

// This function is called either at startup (see InitEditor above), or when
// the user clicks on one of the two menu items that allow them to toggle the
// spellcheck feature (either context menu or Options menu).
function enableInlineSpellCheck(aEnableInlineSpellCheck) {
  const checker = GetCurrentEditorSpellChecker();
  if (!checker) {
    return;
  }
  if (gSpellCheckingEnabled != aEnableInlineSpellCheck) {
    // If state of spellchecker is about to change, clear any pending observer.
    spellCheckReadyObserver.removeObserver();
  }

  gSpellCheckingEnabled = checker.enableRealTimeSpell = aEnableInlineSpellCheck;
  document
    .getElementById("msgSubject")
    .setAttribute("spellcheck", aEnableInlineSpellCheck);
}

function getMailToolbox() {
  return document.getElementById("compose-toolbox");
}

/**
 * Helper function to dispatch a CustomEvent to the attachmentbucket.
 *
 * @param aEventType the name of the event to fire.
 * @param aData any detail data to pass to the CustomEvent.
 */
function dispatchAttachmentBucketEvent(aEventType, aData) {
  gAttachmentBucket.dispatchEvent(
    new CustomEvent(aEventType, {
      bubbles: true,
      cancelable: true,
      detail: aData,
    })
  );
}

/** Update state of zoom type (text vs. full) menu item. */
function UpdateFullZoomMenu() {
  const menuItem = document.getElementById("menu_fullZoomToggle");
  menuItem.setAttribute("checked", !ZoomManager.useFullZoom);
}

/**
 * Return the <editor> element of the mail compose window. The name is somewhat
 * unfortunate; we need to maintain it since the zoom manager, view source and
 * other functions still rely on it.
 */
function getBrowser() {
  return document.getElementById("messageEditor");
}

function goUpdateMailMenuItems(commandset) {
  for (let i = 0; i < commandset.children.length; i++) {
    const commandID = commandset.children[i].getAttribute("id");
    if (commandID) {
      goUpdateCommand(commandID);
    }
  }
}

/**
 * Object to handle message related notifications that are showing in a
 * notificationbox below the composed message content.
 */
var gComposeNotificationBar = {
  get brandBundle() {
    delete this.brandBundle;
    return (this.brandBundle = document.getElementById("brandBundle"));
  },

  setBlockedContent(aBlockedURI) {
    const brandName = this.brandBundle.getString("brandShortName");
    const buttonLabel = getComposeBundle().getString(
      AppConstants.platform == "win"
        ? "blockedContentPrefLabel"
        : "blockedContentPrefLabelUnix"
    );
    const buttonAccesskey = getComposeBundle().getString(
      AppConstants.platform == "win"
        ? "blockedContentPrefAccesskey"
        : "blockedContentPrefAccesskeyUnix"
    );

    const buttons = [
      {
        label: buttonLabel,
        accessKey: buttonAccesskey,
        popup: "blockedContentOptions",
        callback(aNotification, aButton) {
          return true; // keep notification open
        },
      },
    ];

    // The popup value is a space separated list of all the blocked urls.
    const popup = document.getElementById("blockedContentOptions");
    const urls = popup.value ? popup.value.split(" ") : [];
    if (!urls.includes(aBlockedURI)) {
      urls.push(aBlockedURI);
    }
    popup.value = urls.join(" ");

    let msg = getComposeBundle().getFormattedString("blockedContentMessage", [
      brandName,
      brandName,
    ]);
    msg = PluralForm.get(urls.length, msg);

    if (!this.isShowingBlockedContentNotification()) {
      gComposeNotification.appendNotification(
        "blockedContent",
        {
          label: msg,
          priority: gComposeNotification.PRIORITY_WARNING_MEDIUM,
        },
        buttons
      );
    } else {
      gComposeNotification
        .getNotificationWithValue("blockedContent")
        .setAttribute("label", msg);
    }
  },

  isShowingBlockedContentNotification() {
    return !!gComposeNotification.getNotificationWithValue("blockedContent");
  },

  clearBlockedContentNotification() {
    gComposeNotification.removeNotification(
      gComposeNotification.getNotificationWithValue("blockedContent")
    );
  },

  clearNotifications(aValue) {
    gComposeNotification.removeAllNotifications(true);
  },

  /**
   * Show a warning notification when a newly typed identity in the Form field
   * doesn't match any existing identity.
   *
   * @param {string} identity - The name of the identity to add to the
   *   notification. Most likely an email address.
   */
  async setIdentityWarning(identity) {
    // Bail out if we are already showing this type of notification.
    if (gComposeNotification.getNotificationWithValue("identityWarning")) {
      return;
    }

    gComposeNotification.appendNotification(
      "identityWarning",
      {
        label: await document.l10n.formatValue(
          "compose-missing-identity-warning",
          {
            identity,
          }
        ),
        priority: gComposeNotification.PRIORITY_WARNING_HIGH,
      },
      null
    );
  },

  clearIdentityWarning() {
    const idWarning =
      gComposeNotification.getNotificationWithValue("identityWarning");
    if (idWarning) {
      gComposeNotification.removeNotification(idWarning);
    }
  },
};

/**
 * Populate the menuitems of what blocked content to unblock.
 */
function onBlockedContentOptionsShowing(aEvent) {
  const urls = aEvent.target.value ? aEvent.target.value.split(" ") : [];

  // Out with the old...
  while (aEvent.target.lastChild) {
    aEvent.target.lastChild.remove();
  }

  // ... and in with the new.
  for (const url of urls) {
    const menuitem = document.createXULElement("menuitem");
    menuitem.setAttribute(
      "label",
      getComposeBundle().getFormattedString("blockedAllowResource", [url])
    );
    menuitem.setAttribute("crop", "center");
    menuitem.setAttribute("value", url);
    menuitem.setAttribute(
      "oncommand",
      "onUnblockResource(this.value, this.parentNode);"
    );
    aEvent.target.appendChild(menuitem);
  }
}

/**
 * Handle clicking the "Load <url>" in the blocked content notification bar.
 *
 * @param {string} aURL - the URL that was unblocked
 * @param {Node} aNode - the node holding as value the URLs of the blocked
 *                        resources in the message (space separated).
 */
function onUnblockResource(aURL, aNode) {
  try {
    loadBlockedImage(aURL);
  } catch (e) {
    // Couldn't load the referenced image.
    console.error(e);
  } finally {
    // Remove it from the list on success and failure.
    const urls = aNode.value.split(" ");
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
 * @param {string}  aURL - (necko) URL to unblock
 * @param {Bool}    aReturnDataURL - return data: URL instead of processing image
 * @returns {string} the image as data: URL.
 * @throw Error()   if reading the data failed
 */
function loadBlockedImage(aURL, aReturnDataURL = false) {
  let filename;
  if (/^(file|chrome|moz-extension):/i.test(aURL)) {
    filename = aURL.substr(aURL.lastIndexOf("/") + 1);
  } else {
    const fnMatch = /[?&;]filename=([^?&]+)/.exec(aURL);
    filename = (fnMatch && fnMatch[1]) || "";
  }
  filename = decodeURIComponent(filename);
  const uri = Services.io.newURI(aURL);
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
      throw new Error(
        "Won't unblock; URL=" + aURL + ", contentType=" + contentType
      );
    }
  } else {
    // Assuming image/png is the best we can do.
    contentType = "image/png";
  }
  const channel = Services.io.newChannelFromURI(
    uri,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  const inputStream = channel.open();
  const stream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
    Ci.nsIBinaryInputStream
  );
  stream.setInputStream(inputStream);
  let streamData = "";
  try {
    while (stream.available() > 0) {
      streamData += stream.readBytes(stream.available());
    }
  } catch (e) {
    stream.close();
    throw new Error("Couldn't read all data from URL=" + aURL + " (" + e + ")");
  }
  stream.close();
  const encoded = btoa(streamData);
  const dataURL =
    "data:" +
    contentType +
    (filename ? ";filename=" + encodeURIComponent(filename) : "") +
    ";base64," +
    encoded;

  if (aReturnDataURL) {
    return dataURL;
  }

  const editor = GetCurrentEditor();
  for (const img of editor.document.images) {
    if (img.src == aURL) {
      img.src = dataURL; // Swap to data URL.
      img.classList.remove("loading-internal");
    }
  }

  return null;
}

/**
 * Update state of encrypted/signed toolbar buttons
 */
function showSendEncryptedAndSigned() {
  const encToggle = document.getElementById("button-encryption");
  if (encToggle) {
    if (gSendEncrypted) {
      encToggle.setAttribute("checked", "true");
    } else {
      encToggle.removeAttribute("checked");
    }
  }

  const sigToggle = document.getElementById("button-signing");
  if (sigToggle) {
    if (gSendSigned) {
      sigToggle.setAttribute("checked", "true");
    } else {
      sigToggle.removeAttribute("checked");
    }
  }

  // Should button remain enabled? Identity might be unable to
  // encrypt, but we might have kept button enabled after identity change.
  const identityHasConfiguredSMIME =
    isSmimeSigningConfigured() || isSmimeEncryptionConfigured();
  const identityHasConfiguredOpenPGP = isPgpConfigured();
  const e2eeNotConfigured =
    !identityHasConfiguredOpenPGP && !identityHasConfiguredSMIME;

  if (encToggle) {
    encToggle.disabled = e2eeNotConfigured && !gSendEncrypted;
  }
  if (sigToggle) {
    sigToggle.disabled = e2eeNotConfigured;
  }
}

/**
 * Look at the current encryption setting, and perform necessary
 * automatic adjustments to related settings.
 */
function updateEncryptionDependencies() {
  const canSign = gSelectedTechnologyIsPGP
    ? isPgpConfigured()
    : isSmimeSigningConfigured();

  if (!canSign) {
    gSendSigned = false;
    gUserTouchedSendSigned = false;
  } else if (!gSendEncrypted) {
    if (!gUserTouchedSendSigned) {
      gSendSigned = gCurrentIdentity.signMail;
    }
  } else if (!gUserTouchedSendSigned) {
    gSendSigned = true;
  }

  // if (!gSendEncrypted) we don't need to change gEncryptSubject,
  // it will be ignored anyway.
  if (gSendEncrypted) {
    if (!gUserTouchedEncryptSubject) {
      gEncryptSubject = gCurrentIdentity.protectSubject;
    }
  }

  if (!gSendSigned) {
    if (!gUserTouchedAttachMyPubKey) {
      gAttachMyPublicPGPKey = false;
    }
  } else if (!gUserTouchedAttachMyPubKey) {
    gAttachMyPublicPGPKey = gCurrentIdentity.attachPgpKey;
  }

  if (!gSendEncrypted) {
    clearRecipPillKeyIssues();
  }

  if (gSMFields && !gSelectedTechnologyIsPGP) {
    gSMFields.requireEncryptMessage = gSendEncrypted;
    gSMFields.signMessage = gSendSigned;
  }

  updateAttachMyPubKey();

  updateEncryptedSubject();
  showSendEncryptedAndSigned();

  updateEncryptOptionsMenuElements();
  checkEncryptedBccRecipients();
}

/**
 * Listen to the click events on the compose window.
 *
 * @param {Event} event - The DOM Event
 */
function composeWindowOnClick(event) {
  // Don't deselect pills if the click happened on another pill as the selection
  // and focus change is handled by the pill itself. We also ignore clicks on
  // toolbarbuttons, menus, and menu items. This will also prevent the unwanted
  // deselection when opening the context menu on macOS.
  if (
    event.target?.tagName == "mail-address-pill" ||
    event.target?.tagName == "toolbarbutton" ||
    event.target?.tagName == "menu" ||
    event.target?.tagName == "menuitem"
  ) {
    return;
  }

  document.getElementById("recipientsContainer").deselectAllPills();
}
