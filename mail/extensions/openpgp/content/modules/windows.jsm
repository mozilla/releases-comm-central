/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailWindows"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailStdlib: "chrome://openpgp/content/modules/stdlib.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

XPCOMUtils.defineLazyGetter(this, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

var EnigmailWindows = {
  /**
   * Open a window, or focus it if it is already open
   *
   * @winName   : String - name of the window; used to identify if it is already open
   * @spec      : String - window URL (e.g. chrome://openpgp/content/ui/test.xhtml)
   * @winOptions: String - window options as defined in nsIWindow.open
   * @optObj    : any    - an Object, Array, String, etc. that is passed as parameter
   *                       to the window
   */
  openWin(winName, spec, winOptions, optObj) {
    var windowManager = Services.wm;

    var recentWin = null;
    for (let win of windowManager.getEnumerator(null)) {
      if (win.location.href == spec) {
        recentWin = win;
        break;
      }
      if (winName && win.name && win.name == winName) {
        win.focus();
        break;
      }
    }

    if (recentWin) {
      recentWin.focus();
    } else {
      var appShellSvc = Services.appShell;
      var domWin = appShellSvc.hiddenDOMWindow;
      try {
        domWin.open(spec, winName, "chrome," + winOptions, optObj);
      } catch (ex) {
        domWin = windowManager.getMostRecentWindow(null);
        domWin.open(spec, winName, "chrome," + winOptions, optObj);
      }
    }
  },

  /**
   * Determine the best possible window to serve as parent window for dialogs.
   *
   * @return: nsIWindow object
   */
  getBestParentWin() {
    var windowManager = Services.wm;

    var bestFit = null;

    for (let win of windowManager.getEnumerator(null)) {
      if (win.location.href.search(/\/messenger.xhtml$/) > 0) {
        bestFit = win;
      }
      if (
        !bestFit &&
        win.location.href.search(/\/messengercompose.xhtml$/) > 0
      ) {
        bestFit = win;
      }
    }

    if (!bestFit) {
      var winEnum = windowManager.getEnumerator(null);
      bestFit = winEnum.getNext();
    }

    return bestFit;
  },

  /**
   * Iterate through the frames of a window and return the first frame with a
   * matching name.
   *
   * @win:       nsIWindow - XUL window to search
   * @frameName: String    - name of the frame to seach
   *
   * @return:    the frame object or null if not found
   */
  getFrame(win, frameName) {
    EnigmailLog.DEBUG("windows.jsm: getFrame: name=" + frameName + "\n");
    for (var j = 0; j < win.frames.length; j++) {
      if (win.frames[j].name == frameName) {
        return win.frames[j];
      }
    }
    return null;
  },

  getMostRecentWindow() {
    var windowManager = Services.wm;
    return windowManager.getMostRecentWindow(null);
  },

  /**
   * Display the key help window
   *
   * @source - |string| containing the name of the file to display
   *
   * no return value
   */

  openHelpWindow(source) {
    EnigmailWindows.openWin(
      "enigmail:help",
      "chrome://openpgp/content/ui/enigmailHelp.xhtml?src=" + source,
      "centerscreen,resizable"
    );
  },

  /**
   * Open the Enigmail Documentation page in a new window
   *
   * no return value
   */
  openEnigmailDocu(parent) {
    if (!parent) {
      parent = this.getMostRecentWindow();
    }

    parent.open(
      "https://doesnotexist-openpgp-integration.thunderbird/faq/docu.php",
      "",
      "chrome,width=600,height=500,resizable"
    );
  },

  /**
   * Display the OpenPGP key manager window
   *
   * no return value
   */
  openKeyManager(win) {
    EnigmailCore.getService(win);

    EnigmailWindows.openWin(
      "enigmail:KeyManager",
      "chrome://openpgp/content/ui/enigmailKeyManager.xhtml",
      "resizable"
    );
  },

  /**
   * Display the OpenPGP key manager window
   *
   * no return value
   */
  openImportSettings(win) {
    EnigmailCore.getService(win);

    EnigmailWindows.openWin(
      "",
      "chrome://openpgp/content/ui/importSettings.xhtml",
      "chrome,dialog,centerscreen,resizable,modal"
    );
  },

  /**
   * If the Key Manager is open, dispatch an event to tell the key
   * manager to refresh the displayed keys
   */
  keyManReloadKeys() {
    for (let thisWin of Services.wm.getEnumerator(null)) {
      if (thisWin.name && thisWin.name == "enigmail:KeyManager") {
        let evt = new thisWin.Event("reload-keycache", {
          bubbles: true,
          cancelable: false,
        });
        thisWin.dispatchEvent(evt);
        break;
      }
    }
  },

  /**
   * Display the card details window
   *
   * no return value
   */
  openCardDetails() {
    EnigmailWindows.openWin(
      "enigmail:cardDetails",
      "chrome://openpgp/content/ui/enigmailCardDetails.xhtml",
      "centerscreen"
    );
  },

  /**
   * Display the console log window
   *
   * @win       - |object| holding the parent window for the dialog
   *
   * no return value
   */
  openConsoleWindow() {
    EnigmailWindows.openWin(
      "enigmail:console",
      "chrome://openpgp/content/ui/enigmailConsole.xhtml",
      "resizable,centerscreen"
    );
  },

  /**
   * Display the window for the debug log file
   *
   * @win       - |object| holding the parent window for the dialog
   *
   * no return value
   */
  openDebugLog(win) {
    EnigmailWindows.openWin(
      "enigmail:logFile",
      "chrome://openpgp/content/ui/enigmailViewFile.xhtml?viewLog=1&title=" +
        escape(l10n.formatValueSync("debug-log-title")),
      "centerscreen"
    );
  },

  /**
   * Display the dialog for changing the expiry date of one or several keys
   *
   * @win        - |object| holding the parent window for the dialog
   * @userIdArr  - |array| of |strings| containing the User IDs
   * @keyIdArr   - |array| of |strings| containing the key IDs (eg. "0x12345678") to change
   *
   * @return  Boolean - true if expiry date was changed; false otherwise
   */
  editKeyExpiry(win, userIdArr, keyIdArr) {
    const inputObj = {
      keyId: keyIdArr,
      userId: userIdArr,
    };
    const resultObj = {
      refresh: false,
    };
    win.openDialog(
      "chrome://openpgp/content/ui/enigmailEditKeyExpiryDlg.xhtml",
      "",
      "dialog,modal,centerscreen,resizable",
      inputObj,
      resultObj
    );
    return resultObj.refresh;
  },

  /**
   * Display the dialog for changing key trust of one or several keys
   *
   * @win        - |object| holding the parent window for the dialog
   * @userIdArr  - |array| of |strings| containing the User IDs
   * @keyIdArr   - |array| of |strings| containing the key IDs (eg. "0x12345678") to change
   *
   * @return  Boolean - true if key trust was changed; false otherwise
   */
  editKeyTrust(win, userIdArr, keyIdArr) {
    const inputObj = {
      keyId: keyIdArr,
      userId: userIdArr,
    };
    const resultObj = {
      refresh: false,
    };
    win.openDialog(
      "chrome://openpgp/content/ui/enigmailEditKeyTrustDlg.xhtml",
      "",
      "dialog,modal,centerscreen,resizable",
      inputObj,
      resultObj
    );
    return resultObj.refresh;
  },

  /**
   * Display the dialog for signing a key
   *
   * @win        - |object| holding the parent window for the dialog
   * @userId     - |string| containing the User ID (for displaing in the dialog only)
   * @keyId      - |string| containing the key ID (eg. "0x12345678")
   *
   * @return  Boolean - true if key was signed; false otherwise
   */
  signKey(win, userId, keyId) {
    const inputObj = {
      keyId,
      userId,
    };
    const resultObj = {
      refresh: false,
    };
    win.openDialog(
      "chrome://openpgp/content/ui/enigmailSignKeyDlg.xhtml",
      "",
      "dialog,modal,centerscreen,resizable",
      inputObj,
      resultObj
    );
    return resultObj.refresh;
  },

  /**
   * Display the photo ID associated with a key
   *
   * @win        - |object| holding the parent window for the dialog
   * @keyId      - |string| containing the key ID (eg. "0x12345678")
   * @userId     - |string| containing the User ID (for displaing in the dialog only)
   * @photoNumber - |number| UAT entry in the squence of appearance in the key listing, starting with 0
   * no return value
   */
  showPhoto(win, keyId, userId, photoNumber) {
    const enigmailSvc = EnigmailCore.getService(win);
    if (enigmailSvc) {
      if (!photoNumber) {
        photoNumber = 0;
      }
      let keyObj = EnigmailKeyRing.getKeyById(keyId);
      if (!keyObj) {
        EnigmailWindows.alert(win, l10n.formatValueSync("no-photo-available"));
      }

      let photoFile = keyObj.getPhotoFile(photoNumber);

      if (photoFile) {
        if (!(photoFile.isFile() && photoFile.isReadable())) {
          EnigmailWindows.alert(
            win,
            l10n.formatValueSync("error-photo-path-not-readable", {
              photo: photoFile.path,
            })
          );
        } else {
          const photoUri = Services.io.newFileURI(photoFile).spec;
          const argsObj = {
            photoUri,
            userId,
            keyId,
          };

          win.openDialog(
            "chrome://openpgp/content/ui/enigmailDispPhoto.xhtml",
            photoUri,
            "chrome,modal,resizable,dialog,centerscreen",
            argsObj
          );
          try {
            // delete the photo file
            photoFile.remove(false);
          } catch (ex) {}
        }
      } else {
        EnigmailWindows.alert(win, l10n.formatValueSync("no-photo-available"));
      }
    }
  },

  /**
   * Display the OpenPGP Key Details window
   *
   * @win        - |object| holding the parent window for the dialog
   * @keyId      - |string| containing the key ID (eg. "0x12345678")
   * @refresh    - |boolean| if true, cache is cleared and the key data is loaded from GnuPG
   *
   * @return  Boolean - true:  keylist needs to be refreshed
   *                  - false: no need to refresh keylist
   */
  async openKeyDetails(win, keyId, refresh) {
    if (!win) {
      win = this.getBestParentWin();
    }

    keyId = keyId.replace(/^0x/, "");

    if (refresh) {
      EnigmailKeyRing.clearCache();
    }

    const resultObj = {
      refresh: false,
    };
    win.openDialog(
      "chrome://openpgp/content/ui/keyDetailsDlg.xhtml",
      "KeyDetailsDialog",
      "dialog,modal,centerscreen,resizable",
      { keyId, modified: EnigmailKeyRing.clearCache },
      resultObj
    );

    return resultObj.refresh;
  },

  /**
   * Display the dialog to search and/or download key(s) from a keyserver
   *
   * @win        - |object| holding the parent window for the dialog
   * @inputObj   - |object| with member searchList (|string| containing the keys to search)
   * @resultObj  - |object| with member importedKeys (|number| containing the number of imporeted keys)
   *
   * no return value
   */
  downloadKeys(win, inputObj, resultObj) {
    EnigmailLog.DEBUG(
      "windows.jsm: downloadKeys: searchList=" + inputObj.searchList + "\n"
    );

    resultObj.importedKeys = 0;

    const ioService = Services.io;
    if (ioService && ioService.offline) {
      l10n.formatValue("need-online").then(value => {
        EnigmailWindows.alert(win, value);
      });
      return;
    }

    let valueObj = {};
    if (inputObj.searchList) {
      valueObj = {
        keyId: "<" + inputObj.searchList.join("> <") + ">",
      };
    }

    const keysrvObj = {};

    if (inputObj.searchList && inputObj.autoKeyServer) {
      keysrvObj.value = inputObj.autoKeyServer;
    } else {
      win.openDialog(
        "chrome://openpgp/content/ui/enigmailKeyserverDlg.xhtml",
        "",
        "dialog,modal,centerscreen",
        valueObj,
        keysrvObj
      );
    }

    if (!keysrvObj.value) {
      return;
    }

    inputObj.keyserver = keysrvObj.value;

    if (!inputObj.searchList) {
      const searchval = keysrvObj.email
        .replace(/^(\s*)(.*)/, "$2")
        .replace(/\s+$/, ""); // trim spaces
      // special handling to convert fingerprints with spaces into fingerprint without spaces
      if (
        searchval.length == 49 &&
        searchval.match(/^[0-9a-fA-F ]*$/) &&
        searchval[4] == " " &&
        searchval[9] == " " &&
        searchval[14] == " " &&
        searchval[19] == " " &&
        searchval[24] == " " &&
        searchval[29] == " " &&
        searchval[34] == " " &&
        searchval[39] == " " &&
        searchval[44] == " "
      ) {
        inputObj.searchList = ["0x" + searchval.replace(/ /g, "")];
      } else if (searchval.length == 40 && searchval.match(/^[0-9a-fA-F ]*$/)) {
        inputObj.searchList = ["0x" + searchval];
      } else if (searchval.length == 8 && searchval.match(/^[0-9a-fA-F]*$/)) {
        // special handling to add the required leading 0x when searching for keys
        inputObj.searchList = ["0x" + searchval];
      } else if (searchval.length == 16 && searchval.match(/^[0-9a-fA-F]*$/)) {
        inputObj.searchList = ["0x" + searchval];
      } else {
        inputObj.searchList = searchval.split(/[,; ]+/);
      }
    }

    win.openDialog(
      "chrome://openpgp/content/ui/enigmailSearchKey.xhtml",
      "",
      "dialog,modal,centerscreen",
      inputObj,
      resultObj
    );
  },

  /**
   * Display Autocrypt Setup Passwd dialog.
   *
   * @param dlgMode:       String - dialog mode: "input" / "display"
   * @param passwdType:    String - type of password ("numeric9x4" / "generic")
   * @param password:      String - password or initial two digits of password
   *
   * @return String entered password (in input mode) or NULL
   */
  autocryptSetupPasswd(window, dlgMode, passwdType = "numeric9x4", password) {
    if (!window) {
      window = this.getBestParentWin();
    }

    let inputObj = {
      password: null,
      passwdType,
      dlgMode,
    };

    if (password) {
      inputObj.initialPasswd = password;
    }

    window.openDialog(
      "chrome://openpgp/content/ui/autocryptSetupPasswd.xhtml",
      "",
      "dialog,modal,centerscreen",
      inputObj
    );

    return inputObj.password;
  },

  /**
   * Display dialog to initiate the Autocrypt Setup Message.
   *
   */
  inititateAcSetupMessage(window) {
    if (!window) {
      window = this.getBestParentWin();
    }

    window.openDialog(
      "chrome://openpgp/content/ui/autocryptInitiateBackup.xhtml",
      "",
      "dialog,centerscreen"
    );
  },

  shutdown(reason) {
    EnigmailLog.DEBUG("windows.jsm: shutdown()\n");

    let tabs = EnigmailStdlib.getMail3Pane().document.getElementById("tabmail");

    for (let i = tabs.tabInfo.length - 1; i >= 0; i--) {
      if (
        "openedUrl" in tabs.tabInfo[i] &&
        tabs.tabInfo[i].openedUrl.startsWith("chrome://openpgp/")
      ) {
        tabs.closeTab(tabs.tabInfo[i]);
      }
    }
  },
};
