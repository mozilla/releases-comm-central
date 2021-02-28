/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../extensions/newsblog/feed-subscriptions.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

var gImportType = null;
var gImportMsgsBundle;
var gFeedsBundle;
var gImportService = null;
var gSuccessStr = null;
var gErrorStr = null;
var gInputStr = null;
var gProgressInfo = null;
var gSelectedModuleName = null;
var gAddInterface = null;
var gNewFeedAcctCreated = false;

var nsISupportsString = Ci.nsISupportsString;

function OnLoadImportDialog() {
  gImportMsgsBundle = document.getElementById("bundle_importMsgs");
  gFeedsBundle = document.getElementById("bundle_feeds");
  gImportService = Cc["@mozilla.org/import/import-service;1"].getService(
    Ci.nsIImportService
  );

  gProgressInfo = {};
  gProgressInfo.progressWindow = null;
  gProgressInfo.importInterface = null;
  gProgressInfo.mainWindow = window;
  gProgressInfo.intervalState = 0;
  gProgressInfo.importSuccess = false;
  gProgressInfo.importType = null;
  gProgressInfo.localFolderExists = false;

  gSuccessStr = Cc["@mozilla.org/supports-string;1"].createInstance(
    nsISupportsString
  );
  gErrorStr = Cc["@mozilla.org/supports-string;1"].createInstance(
    nsISupportsString
  );
  gInputStr = Cc["@mozilla.org/supports-string;1"].createInstance(
    nsISupportsString
  );

  // look in arguments[0] for parameters
  if (
    "arguments" in window &&
    window.arguments.length >= 1 &&
    "importType" in window.arguments[0] &&
    window.arguments[0].importType
  ) {
    // keep parameters in global for later
    gImportType = window.arguments[0].importType;
    gProgressInfo.importType = gImportType;
  } else {
    gImportType = "all";
    gProgressInfo.importType = "all";
  }

  SetUpImportType();

  // on startup, set the focus to the control element
  // for accessibility reasons.
  // if we used the wizardOverlay, we would get this for free.
  // see bug #101874
  document.getElementById("importFields").focus();
}

/**
 * After importing, need to restart so that imported address books and mail
 * accounts can show up.
 */
function OnUnloadImportDialog() {
  let nextButton = document.getElementById("forward");
  if (
    gImportType == "settings" &&
    !gErrorStr.data &&
    nextButton.label == nextButton.getAttribute("finishedval")
  ) {
    MailUtils.restartApplication();
  }
}

function SetUpImportType() {
  // set dialog title
  document.getElementById("importFields").value = gImportType;

  // Mac migration not working right now, so disable it.
  if (Services.appinfo.OS == "Darwin") {
    document.getElementById("allRadio").setAttribute("disabled", "true");
    if (gImportType == "all") {
      document.getElementById("importFields").value = "addressbook";
    }
  }

  let fileLabel = document.getElementById("fileLabel");
  let accountLabel = document.getElementById("accountLabel");
  if (gImportType == "feeds") {
    accountLabel.hidden = false;
    fileLabel.hidden = true;
    ListFeedAccounts();
  } else {
    accountLabel.hidden = true;
    fileLabel.hidden = false;
    ListModules();
  }
}

function SetDivText(id, text) {
  var div = document.getElementById(id);

  if (div) {
    if (!div.hasChildNodes()) {
      var textNode = document.createTextNode(text);
      div.appendChild(textNode);
    } else if (div.childNodes.length == 1) {
      div.firstChild.nodeValue = text;
    }
  }
}

function CheckIfLocalFolderExists() {
  try {
    if (MailServices.accounts.localFoldersServer) {
      gProgressInfo.localFolderExists = true;
    }
  } catch (ex) {
    gProgressInfo.localFolderExists = false;
  }
}

function showWizardBox(index) {
  let stateBox = document.getElementById("stateBox");
  for (let i = 0; i < stateBox.children.length; i++) {
    stateBox.children[i].hidden = i != index;
  }
}

function getWizardBoxIndex() {
  let selectedIndex = 0;
  for (let element of document.getElementById("stateBox").children) {
    if (!element.hidden) {
      return selectedIndex;
    }
    selectedIndex++;
  }
  return selectedIndex - 1;
}

async function ImportDialogOKButton() {
  var listbox = document.getElementById("moduleList");
  var header = document.getElementById("header");
  var progressMeterEl = document.getElementById("progressMeter");
  progressMeterEl.value = 0;
  var progressStatusEl = document.getElementById("progressStatus");
  var progressTitleEl = document.getElementById("progressTitle");

  // better not mess around with navigation at this point
  var nextButton = document.getElementById("forward");
  nextButton.setAttribute("disabled", "true");
  var backButton = document.getElementById("back");
  backButton.setAttribute("disabled", "true");

  if (listbox && listbox.selectedCount == 1) {
    let module = "";
    let name = "";
    gImportType = document.getElementById("importFields").value;
    let index = listbox.selectedItem.getAttribute("list-index");
    if (index == -1) {
      return false;
    }
    if (gImportType == "feeds") {
      module = "Feeds";
    } else {
      module = gImportService.GetModule(gImportType, index);
      name = gImportService.GetModuleName(gImportType, index);
    }
    gSelectedModuleName = name;
    if (module) {
      // Fix for Bug 57839 & 85219
      // We use localFoldersServer(in nsIMsgAccountManager) to check if Local Folder exists.
      // We need to check localFoldersServer before importing "mail", "settings", or "filters".
      // Reason: We will create an account with an incoming server of type "none" after
      // importing "mail", so the localFoldersServer is valid even though the Local Folder
      // is not created.
      if (
        gImportType == "mail" ||
        gImportType == "settings" ||
        gImportType == "filters"
      ) {
        CheckIfLocalFolderExists();
      }

      let meterText = "";
      let error = {};
      switch (gImportType) {
        case "mail":
          if (await ImportMail(module, gSuccessStr, gErrorStr)) {
            // We think it was a success, either, we need to
            // wait for the import to finish
            // or we are done!
            if (gProgressInfo.importInterface == null) {
              ShowImportResults(true, "Mail");
              return true;
            }

            meterText = gImportMsgsBundle.getFormattedString(
              "MailProgressMeterText",
              [name]
            );
            header.setAttribute("description", meterText);

            progressStatusEl.setAttribute("label", "");
            progressTitleEl.setAttribute("label", meterText);

            showWizardBox(2);
            gProgressInfo.progressWindow = window;
            gProgressInfo.intervalState = setInterval(
              ContinueImportCallback,
              100
            );
            return true;
          }

          ShowImportResults(false, "Mail");
          // Re-enable the next button, as we are here, because the user cancelled the picking.
          // Enable next, so they can try again.
          nextButton.removeAttribute("disabled");
          // Also enable back button so that users can pick other import options.
          backButton.removeAttribute("disabled");
          return false;

        case "feeds":
          if (await ImportFeeds()) {
            // Successful completion of pre processing and launch of async import.
            meterText = document.getElementById("description").textContent;
            header.setAttribute("description", meterText);

            progressStatusEl.setAttribute("label", "");
            progressTitleEl.setAttribute("label", meterText);
            progressMeterEl.removeAttribute("value");

            showWizardBox(2);
            return true;
          }

          // Re-enable the next button, as we are here, because the user cancelled the picking.
          // Enable next, so they can try again.
          nextButton.removeAttribute("disabled");
          // Also enable back button so that users can pick other import options.
          backButton.removeAttribute("disabled");
          return false;

        case "addressbook":
          if (await ImportAddress(module, gSuccessStr, gErrorStr)) {
            // We think it was a success, either, we need to
            // wait for the import to finish
            // or we are done!
            if (gProgressInfo.importInterface == null) {
              ShowImportResults(true, "Address");
              return true;
            }

            meterText = gImportMsgsBundle.getFormattedString(
              "AddrProgressMeterText",
              [name]
            );
            header.setAttribute("description", meterText);

            progressStatusEl.setAttribute("label", "");
            progressTitleEl.setAttribute("label", meterText);

            showWizardBox(2);
            gProgressInfo.progressWindow = window;
            gProgressInfo.intervalState = setInterval(
              ContinueImportCallback,
              100
            );

            return true;
          }

          ShowImportResults(false, "Address");
          // Re-enable the next button, as we are here, because the user cancelled the picking.
          // Enable next, so they can try again.
          nextButton.removeAttribute("disabled");
          // Also enable back button so that users can pick other import options.
          backButton.removeAttribute("disabled");
          return false;

        case "settings":
          error.value = null;
          let newAccount = {};
          if (!(await ImportSettings(module, newAccount, error))) {
            if (error.value) {
              ShowImportResultsRaw(
                gImportMsgsBundle.getString("ImportSettingsFailed"),
                null,
                false
              );
            }
            // Re-enable the next button, as we are here, because the user cancelled the picking.
            // Enable next, so they can try again.
            nextButton.removeAttribute("disabled");
            // Also enable back button so that users can pick other import options.
            backButton.removeAttribute("disabled");
            return false;
          }
          ShowImportResultsRaw(
            gImportMsgsBundle.getFormattedString("ImportSettingsSuccess", [
              name,
            ]),
            null,
            true
          );
          break;

        case "filters":
          error.value = null;
          if (!ImportFilters(module, error)) {
            if (error.value) {
              ShowImportResultsRaw(
                gImportMsgsBundle.getFormattedString("ImportFiltersFailed", [
                  name,
                ]),
                error.value,
                false
              );
            }
            // Re-enable the next button, as we are here, because the user cancelled the picking.
            // Enable next, so they can try again.
            nextButton.removeAttribute("disabled");
            // Also enable back button so that users can pick other import options.
            backButton.removeAttribute("disabled");
            return false;
          }

          if (error.value) {
            ShowImportResultsRaw(
              gImportMsgsBundle.getFormattedString("ImportFiltersPartial", [
                name,
              ]),
              error.value,
              true
            );
          } else {
            ShowImportResultsRaw(
              gImportMsgsBundle.getFormattedString("ImportFiltersSuccess", [
                name,
              ]),
              null,
              true
            );
          }

          break;
      }
    }
  }

  return true;
}

function SetStatusText(val) {
  var progressStatus = document.getElementById("progressStatus");
  progressStatus.setAttribute("label", val);
}

function SetProgress(val) {
  var progressMeter = document.getElementById("progressMeter");
  progressMeter.value = val;
}

function ContinueImportCallback() {
  gProgressInfo.mainWindow.ContinueImport(gProgressInfo);
}

function ImportSelectionChanged() {
  let listbox = document.getElementById("moduleList");
  let acctNameBox = document.getElementById("acctName-box");
  if (listbox && listbox.selectedCount == 1) {
    let index = listbox.selectedItem.getAttribute("list-index");
    if (index == -1) {
      return;
    }
    acctNameBox.setAttribute("style", "visibility: hidden;");
    if (gImportType == "feeds") {
      if (index == 0) {
        SetDivText(
          "description",
          gFeedsBundle.getString("ImportFeedsNewAccount")
        );
        let defaultName = gFeedsBundle.getString("feeds-accountname");
        document.getElementById("acctName").value = defaultName;
        acctNameBox.removeAttribute("style");
      } else {
        SetDivText(
          "description",
          gFeedsBundle.getString("ImportFeedsExistingAccount")
        );
      }
    } else {
      SetDivText(
        "description",
        gImportService.GetModuleDescription(gImportType, index)
      );
    }
  }
}

function CompareImportModuleName(a, b) {
  if (a.name > b.name) {
    return 1;
  }
  if (a.name < b.name) {
    return -1;
  }
  return 0;
}

function ListModules() {
  if (gImportService == null) {
    return;
  }

  var body = document.getElementById("moduleList");
  while (body.hasChildNodes()) {
    body.lastChild.remove();
  }

  var count = gImportService.GetModuleCount(gImportType);
  var i;

  var moduleArray = new Array(count);
  for (i = 0; i < count; i++) {
    moduleArray[i] = {
      name: gImportService.GetModuleName(gImportType, i),
      index: i,
    };
  }

  // sort the array of modules by name, so that they'll show up in the right order
  moduleArray.sort(CompareImportModuleName);

  for (i = 0; i < count; i++) {
    AddModuleToList(moduleArray[i].name, moduleArray[i].index);
  }
}

function AddModuleToList(moduleName, index) {
  var body = document.getElementById("moduleList");

  let item = document.createXULElement("richlistitem");
  let label = document.createXULElement("label");
  label.setAttribute("value", moduleName);
  item.appendChild(label);
  item.setAttribute("list-index", index);
  body.appendChild(item);
}

function ListFeedAccounts() {
  let body = document.getElementById("moduleList");
  while (body.hasChildNodes()) {
    body.lastChild.remove();
  }

  // Add item to allow for new account creation.
  let item = document.createXULElement("richlistitem");
  let label = document.createXULElement("label");
  label.setAttribute(
    "value",
    gFeedsBundle.getString("ImportFeedsCreateNewListItem")
  );
  item.appendChild(label);
  item.setAttribute("list-index", 0);
  body.appendChild(item);

  let index = 0;
  let feedRootFolders = FeedUtils.getAllRssServerRootFolders();

  feedRootFolders.forEach(function(rootFolder) {
    item = document.createXULElement("richlistitem");
    let label = document.createXULElement("label");
    label.setAttribute("value", rootFolder.prettyName);
    item.appendChild(label);
    item.setAttribute("list-index", ++index);
    item.server = rootFolder.server;
    body.appendChild(item);
  }, this);

  if (index) {
    // If there is an existing feed account, select the first one.
    body.selectedIndex = 1;
  }
}

function ContinueImport(info) {
  var isMail = info.importType == "mail";
  var clear = true;
  var pcnt;

  if (info.importInterface) {
    if (!info.importInterface.ContinueImport()) {
      info.importSuccess = false;
      clearInterval(info.intervalState);
      if (info.progressWindow != null) {
        showWizardBox(3);
        info.progressWindow = null;
      }

      ShowImportResults(false, isMail ? "Mail" : "Address");
    } else if ((pcnt = info.importInterface.GetProgress()) < 100) {
      clear = false;
      if (info.progressWindow != null) {
        if (pcnt < 5) {
          pcnt = 5;
        }
        SetProgress(pcnt);
        if (isMail) {
          let mailName = info.importInterface.GetData("currentMailbox");
          if (mailName) {
            mailName = mailName.QueryInterface(Ci.nsISupportsString);
            if (mailName) {
              SetStatusText(mailName.data);
            }
          }
        }
      }
    } else {
      dump("*** WARNING! sometimes this shows results too early. \n");
      dump("    something screwy here. this used to work fine.\n");
      clearInterval(info.intervalState);
      info.importSuccess = true;
      if (info.progressWindow) {
        showWizardBox(3);
        info.progressWindow = null;
      }

      ShowImportResults(true, isMail ? "Mail" : "Address");
    }
  }
  if (clear) {
    info.intervalState = null;
    info.importInterface = null;
  }
}

function ShowResults(doesWantProgress, result) {
  if (result) {
    if (doesWantProgress) {
      let header = document.getElementById("header");
      let progressStatusEl = document.getElementById("progressStatus");
      let progressTitleEl = document.getElementById("progressTitle");

      let meterText = gImportMsgsBundle.getFormattedString(
        "AddrProgressMeterText",
        [name]
      );
      header.setAttribute("description", meterText);

      progressStatusEl.setAttribute("label", "");
      progressTitleEl.setAttribute("label", meterText);

      showWizardBox(2);
      gProgressInfo.progressWindow = window;
      gProgressInfo.intervalState = setInterval(ContinueImportCallback, 100);
    } else {
      ShowImportResults(true, "Address");
    }
  } else {
    ShowImportResults(false, "Address");
  }

  return true;
}

function ShowImportResults(good, module) {
  // String keys for ImportSettingsSuccess, ImportSettingsFailed,
  // ImportMailSuccess, ImportMailFailed, ImportAddressSuccess,
  // ImportAddressFailed, ImportFiltersSuccess, and ImportFiltersFailed.
  var modSuccess = "Import" + module + "Success";
  var modFailed = "Import" + module + "Failed";

  // The callers seem to set 'good' to true even if there's something
  // in the error log. So we should only make it a success case if
  // error log/str is empty.
  var results, title;
  var moduleName = gSelectedModuleName ? gSelectedModuleName : "";
  if (good && !gErrorStr.data) {
    title = gImportMsgsBundle.getFormattedString(modSuccess, [moduleName]);
    results = gSuccessStr.data;
  } else if (gErrorStr.data) {
    title = gImportMsgsBundle.getFormattedString(modFailed, [moduleName]);
    results = gErrorStr.data;
  }

  if (results && title) {
    ShowImportResultsRaw(title, results, good);
  }
}

function ShowImportResultsRaw(title, results, good) {
  SetDivText("status", title);
  var header = document.getElementById("header");
  header.setAttribute("description", title);
  dump("*** results = " + results + "\n");
  attachStrings("results", results);
  showWizardBox(3);
  var nextButton = document.getElementById("forward");
  nextButton.label = nextButton.getAttribute("finishedval");
  nextButton.removeAttribute("disabled");
  var cancelButton = document.getElementById("cancel");
  cancelButton.setAttribute("disabled", "true");
  var backButton = document.getElementById("back");
  backButton.setAttribute("disabled", "true");

  // If the Local Folder doesn't exist, create it after successfully
  // importing "mail" and "settings"
  var checkLocalFolder =
    gProgressInfo.importType == "mail" ||
    gProgressInfo.importType == "settings";
  if (good && checkLocalFolder && !gProgressInfo.localFolderExists) {
    MailServices.accounts.createLocalMailAccount();
  }
}

function attachStrings(aNode, aString) {
  var attachNode = document.getElementById(aNode);
  if (!aString) {
    attachNode.parentNode.setAttribute("hidden", "true");
    return;
  }
  var strings = aString.split("\n");
  for (let string of strings) {
    if (string) {
      let currNode = document.createTextNode(string);
      attachNode.appendChild(currNode);
      let br = document.createElementNS("http://www.w3.org/1999/xhtml", "br");
      attachNode.appendChild(br);
    }
  }
}

/**
 * Show the file picker.
 * @return {Promise} the selected file, or null
 */
function promptForFile(fp) {
  return new Promise(resolve => {
    fp.open(rv => {
      if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
        resolve(null);
        return;
      }
      resolve(fp.file);
    });
  });
}

/*
  Import Settings from a specific module, returns false if it failed
  and true if successful.  A "local mail" account is returned in newAccount.
  This is only useful in upgrading - import the settings first, then
  import mail into the account returned from ImportSettings, then
  import address books.
  An error string is returned as error.value
*/
async function ImportSettings(module, newAccount, error) {
  var setIntf = module.GetImportInterface("settings");
  if (!(setIntf instanceof Ci.nsIImportSettings)) {
    error.value = gImportMsgsBundle.getString("ImportSettingsBadModule");
    return false;
  }

  // determine if we can auto find the settings or if we need to ask the user
  var location = {};
  var description = {};
  var result = setIntf.AutoLocate(description, location);
  if (!result) {
    // In this case, we couldn't find the settings
    if (location.value != null) {
      // Settings were not found, however, they are specified
      // in a file, so ask the user for the settings file.
      let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance();
      if (filePicker instanceof Ci.nsIFilePicker) {
        let file = null;
        try {
          filePicker.init(
            window,
            gImportMsgsBundle.getString("ImportSelectSettings"),
            filePicker.modeOpen
          );
          filePicker.appendFilters(filePicker.filterAll);

          file = await promptForFile(filePicker);
        } catch (ex) {
          Cu.reportError(ex);
          error.value = null;
          return false;
        }
        if (file != null) {
          setIntf.SetLocation(file);
        } else {
          error.value = null;
          return false;
        }
      } else {
        error.value = gImportMsgsBundle.getString("ImportSettingsNotFound");
        return false;
      }
    } else {
      error.value = gImportMsgsBundle.getString("ImportSettingsNotFound");
      return false;
    }
  }

  // interesting, we need to return the account that new
  // mail should be imported into?
  // that's really only useful for "Upgrade"
  result = setIntf.Import(newAccount);
  if (!result) {
    error.value = gImportMsgsBundle.getString("ImportSettingsFailed");
  }
  return result;
}

async function ImportMail(module, success, error) {
  if (gProgressInfo.importInterface || gProgressInfo.intervalState) {
    error.data = gImportMsgsBundle.getString("ImportAlreadyInProgress");
    return false;
  }

  gProgressInfo.importSuccess = false;

  var mailInterface = module.GetImportInterface("mail");
  if (!(mailInterface instanceof Ci.nsIImportGeneric)) {
    error.data = gImportMsgsBundle.getString("ImportMailBadModule");
    return false;
  }

  var loc = mailInterface.GetData("mailLocation");

  if (loc == null) {
    // No location found, check to see if we can ask the user.
    if (mailInterface.GetStatus("canUserSetLocation") != 0) {
      let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance();
      if (filePicker instanceof Ci.nsIFilePicker) {
        try {
          filePicker.init(
            window,
            gImportMsgsBundle.getString("ImportSelectMailDir"),
            filePicker.modeGetFolder
          );
          filePicker.appendFilters(filePicker.filterAll);
          let file = await promptForFile(filePicker);
          if (!file) {
            return false;
          }
          mailInterface.SetData("mailLocation", file);
        } catch (ex) {
          Cu.reportError(ex);
          // don't show an error when we return!
          return false;
        }
      } else {
        error.data = gImportMsgsBundle.getString("ImportMailNotFound");
        return false;
      }
    } else {
      error.data = gImportMsgsBundle.getString("ImportMailNotFound");
      return false;
    }
  }

  if (mailInterface.WantsProgress()) {
    if (mailInterface.BeginImport(success, error)) {
      gProgressInfo.importInterface = mailInterface;
      // intervalState = setInterval(ContinueImport, 100);
      return true;
    }
    return false;
  }
  return mailInterface.BeginImport(success, error);
}

// The address import!  A little more complicated than the mail import
// due to field maps...
async function ImportAddress(module, success, error) {
  if (gProgressInfo.importInterface || gProgressInfo.intervalState) {
    error.data = gImportMsgsBundle.getString("ImportAlreadyInProgress");
    return false;
  }

  gProgressInfo.importSuccess = false;

  gAddInterface = module.GetImportInterface("addressbook");
  if (!(gAddInterface instanceof Ci.nsIImportGeneric)) {
    error.data = gImportMsgsBundle.getString("ImportAddressBadModule");
    return false;
  }

  var loc = gAddInterface.GetStatus("autoFind");
  if (loc == 0) {
    loc = gAddInterface.GetData("addressLocation");
    if (loc instanceof Ci.nsIFile && !loc.exists) {
      loc = null;
    }
  }

  if (loc == null) {
    // Couldn't find the address book, see if we can
    // as the user for the location or not?
    if (gAddInterface.GetStatus("canUserSetLocation") == 0) {
      // an autofind address book that could not be found!
      error.data = gImportMsgsBundle.getString("ImportAddressNotFound");
      return false;
    }

    let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance();
    if (!(filePicker instanceof Ci.nsIFilePicker)) {
      error.data = gImportMsgsBundle.getString("ImportAddressNotFound");
      return false;
    }

    // The address book location was not found.
    // Determine if we need to ask for a directory
    // or a single file.
    let file = null;
    let fileIsDirectory = false;
    if (gAddInterface.GetStatus("supportsMultiple") != 0) {
      // ask for dir
      try {
        filePicker.init(
          window,
          gImportMsgsBundle.getString("ImportSelectAddrDir"),
          filePicker.modeGetFolder
        );
        filePicker.appendFilters(filePicker.filterAll);
        file = await promptForFile(filePicker);
        if (file && file.path) {
          fileIsDirectory = true;
        }
      } catch (ex) {
        Cu.reportError(ex);
        file = null;
      }
    } else {
      // ask for file
      try {
        filePicker.init(
          window,
          gImportMsgsBundle.getString("ImportSelectAddrFile"),
          filePicker.modeOpen
        );
        let addressbookBundle = document.getElementById("bundle_addressbook");
        if (
          gSelectedModuleName ==
          document
            .getElementById("bundle_vcardImportMsgs")
            .getString("vCardImportName")
        ) {
          filePicker.appendFilter(
            addressbookBundle.getString("VCFFiles"),
            "*.vcf"
          );
        } else if (
          gSelectedModuleName ==
          document
            .getElementById("bundle_morkImportMsgs")
            .getString("morkImportName")
        ) {
          filePicker.appendFilter(
            document
              .getElementById("bundle_morkImportMsgs")
              .getString("MABFiles"),
            "*.mab"
          );
        } else {
          filePicker.appendFilter(
            addressbookBundle.getString("LDIFFiles"),
            "*.ldi; *.ldif"
          );
          filePicker.appendFilter(
            addressbookBundle.getString("CSVFiles"),
            "*.csv"
          );
          filePicker.appendFilter(
            addressbookBundle.getString("TABFiles"),
            "*.tab; *.txt"
          );
          filePicker.appendFilter(
            addressbookBundle.getString("SupportedABFiles"),
            "*.csv; *.ldi; *.ldif; *.tab; *.txt"
          );
          filePicker.appendFilters(filePicker.filterAll);
          // Use "Supported Address Book Files" as default file filter.
          filePicker.filterIndex = 3;
        }

        file = await promptForFile(filePicker);
      } catch (ex) {
        Cu.reportError(ex);
        file = null;
      }
    }

    if (!file) {
      return false;
    }

    if (!fileIsDirectory && file.fileSize == 0) {
      let errorText = gImportMsgsBundle.getFormattedString(
        "ImportEmptyAddressBook",
        [file.leafName]
      );

      Services.prompt.alert(window, document.title, errorText);
      return false;
    }
    gAddInterface.SetData("addressLocation", file);
  }

  var map = gAddInterface.GetData("fieldMap");
  if (map instanceof Ci.nsIImportFieldMap) {
    let result = {};
    result.ok = false;
    window.openDialog(
      "chrome://messenger/content/fieldMapImport.xhtml",
      "",
      "chrome,modal,titlebar",
      {
        fieldMap: map,
        addInterface: gAddInterface,
        result,
      }
    );

    if (!result.ok) {
      return false;
    }
  }

  if (gAddInterface.WantsProgress()) {
    if (gAddInterface.BeginImport(success, error)) {
      gProgressInfo.importInterface = gAddInterface;
      // intervalState = setInterval(ContinueImport, 100);
      return true;
    }
    return false;
  }

  return gAddInterface.BeginImport(success, error);
}

/*
  Import filters from a specific module.
  Returns false if it failed and true if it succeeded.
  An error string is returned as error.value.
*/
function ImportFilters(module, error) {
  if (gProgressInfo.importInterface || gProgressInfo.intervalState) {
    error.data = gImportMsgsBundle.getString("ImportAlreadyInProgress");
    return false;
  }

  gProgressInfo.importSuccess = false;

  var filtersInterface = module.GetImportInterface("filters");
  if (!(filtersInterface instanceof Ci.nsIImportFilters)) {
    error.data = gImportMsgsBundle.getString("ImportFiltersBadModule");
    return false;
  }

  return filtersInterface.Import(error);
}

/*
  Import feeds.
*/
async function ImportFeeds() {
  // Get file and file url to open from filepicker.
  let [openFile, openFileUrl] = await FeedSubscriptions.opmlPickOpenFile();

  let acctName;
  let acctNewExist = gFeedsBundle.getString("ImportFeedsExisting");
  let fileName = openFile.path;
  let server = document.getElementById("moduleList").selectedItem.server;
  gNewFeedAcctCreated = false;

  if (!server) {
    // Create a new Feeds account.
    acctName = document.getElementById("acctName").value;
    server = FeedUtils.createRssAccount(acctName).incomingServer;
    acctNewExist = gFeedsBundle.getString("ImportFeedsNew");
    gNewFeedAcctCreated = true;
  }

  acctName = server.rootFolder.prettyName;

  let callback = function(aStatusReport, aLastFolder, aFeedWin) {
    let message = gFeedsBundle.getFormattedString("ImportFeedsDone", [
      fileName,
      acctNewExist,
      acctName,
    ]);
    ShowImportResultsRaw(message + "  " + aStatusReport, null, true);
    document.getElementById("back").removeAttribute("disabled");

    let subscriptionsWindow = Services.wm.getMostRecentWindow(
      "Mail:News-BlogSubscriptions"
    );
    if (subscriptionsWindow) {
      let feedWin = subscriptionsWindow.FeedSubscriptions;
      if (aLastFolder) {
        feedWin.FolderListener.folderAdded(aLastFolder);
      }

      feedWin.mActionMode = null;
      feedWin.updateButtons(feedWin.mView.currentItem);
      feedWin.clearStatusInfo();
      feedWin.updateStatusItem("statusText", aStatusReport);
    }
  };

  if (
    !(await FeedSubscriptions.importOPMLFile(
      openFile,
      openFileUrl,
      server,
      callback
    ))
  ) {
    return false;
  }

  let subscriptionsWindow = Services.wm.getMostRecentWindow(
    "Mail:News-BlogSubscriptions"
  );
  if (subscriptionsWindow) {
    let feedWin = subscriptionsWindow.FeedSubscriptions;
    feedWin.mActionMode = feedWin.kImportingOPML;
    feedWin.updateButtons(null);
    let statusReport = gFeedsBundle.getString("subscribe-loading");
    feedWin.updateStatusItem("statusText", statusReport);
    feedWin.updateStatusItem("progressMeter", "?");
  }

  return true;
}

function SwitchType(newType) {
  if (gImportType == newType) {
    return;
  }

  gImportType = newType;
  gProgressInfo.importType = newType;

  SetUpImportType();

  SetDivText("description", "");
}

function next() {
  switch (getWizardBoxIndex()) {
    case 0:
      let backButton = document.getElementById("back");
      backButton.removeAttribute("disabled");
      let radioGroup = document.getElementById("importFields");

      if (radioGroup.value == "all") {
        let args = { closeMigration: true };
        let SEAMONKEY_ID = "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}";
        if (Services.appinfo.ID == SEAMONKEY_ID) {
          window.openDialog(
            "chrome://communicator/content/migration/migration.xhtml",
            "",
            "chrome,dialog,modal,centerscreen"
          );
        } else {
          // Running as Thunderbird or its clone.
          window.openDialog(
            "chrome://messenger/content/migration/migration.xhtml",
            "",
            "chrome,dialog,modal,centerscreen",
            null,
            null,
            null,
            args
          );
        }
        if (args.closeMigration) {
          close();
        }
      } else {
        SwitchType(radioGroup.value);
        showWizardBox(1);
        let moduleBox = document.getElementById("moduleBox");
        let noModuleLabel = document.getElementById("noModuleLabel");
        if (document.getElementById("moduleList").itemCount > 0) {
          moduleBox.hidden = false;
          noModuleLabel.hidden = true;
        } else {
          moduleBox.hidden = true;
          noModuleLabel.hidden = false;
        }
        SelectFirstItem();
        enableAdvance();
      }
      break;
    case 1:
      ImportDialogOKButton();
      break;
    case 3:
      close();
      break;
  }
}

function SelectFirstItem() {
  var listbox = document.getElementById("moduleList");
  if (listbox.selectedIndex == -1 && listbox.itemCount > 0) {
    listbox.selectedIndex = 0;
  }
  ImportSelectionChanged();
}

function enableAdvance() {
  var listbox = document.getElementById("moduleList");
  var nextButton = document.getElementById("forward");
  if (listbox.selectedCount > 0) {
    nextButton.removeAttribute("disabled");
  } else {
    nextButton.setAttribute("disabled", "true");
  }
}

function back() {
  var backButton = document.getElementById("back");
  var nextButton = document.getElementById("forward");
  switch (getWizardBoxIndex()) {
    case 1:
      backButton.setAttribute("disabled", "true");
      nextButton.label = nextButton.getAttribute("nextval");
      nextButton.removeAttribute("disabled");
      showWizardBox(0);
      break;
    case 3:
      // Clear out the results box.
      let results = document.getElementById("results");
      while (results.hasChildNodes()) {
        results.lastChild.remove();
      }

      // Reset the next button.
      nextButton.label = nextButton.getAttribute("nextval");
      nextButton.removeAttribute("disabled");

      // Enable the cancel button again.
      document.getElementById("cancel").removeAttribute("disabled");

      // If a new Feed account has been created, rebuild the list.
      if (gNewFeedAcctCreated) {
        ListFeedAccounts();
      }

      // Now go back to the second page.
      showWizardBox(1);
      break;
  }
}
