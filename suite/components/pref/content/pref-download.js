/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { FileUtils } =
  ChromeUtils.import("resource://gre/modules/FileUtils.jsm");

ChromeUtils.defineModuleGetter(this, "Downloads",
  "resource://gre/modules/Downloads.jsm");

const kDesktop = 0;
const kDownloads = 1;
const kUserDir = 2;
var gFPHandler;
var gSoundUrlPref;

function Startup()
{
  // Define globals
  gFPHandler = Services.io.getProtocolHandler("file")
                          .QueryInterface(Ci.nsIFileProtocolHandler);
  gSoundUrlPref = document.getElementById("browser.download.finished_sound_url");
  setSoundEnabled(document.getElementById("browser.download.finished_download_sound").value);
}

/**
 * Enables/disables the folder field and Browse button based on whether a
 * default download directory is being used.
 */
function readUseDownloadDir()
{
  var downloadFolder = document.getElementById("downloadFolder");
  var chooseFolder = document.getElementById("chooseFolder");
  var preference = document.getElementById("browser.download.useDownloadDir");
  downloadFolder.disabled = !preference.value;
  chooseFolder.disabled = !preference.value;
}

/**
 * Displays a file picker in which the user can choose the location where
 * downloads are automatically saved, updating preferences and UI in
 * response to the choice, if one is made.
 */
function chooseFolder()
{
  return chooseFolderTask().catch(Cu.reportError);
}

async function chooseFolderTask()
{
  let title = document.getElementById("bundle_prefutilities")
                      .getString("downloadfolder");
  let folderListPref = document.getElementById("browser.download.folderList");
  let currentDirPref = await _indexToFolder(folderListPref.value);
  let defDownloads = await _indexToFolder(kDownloads);
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

  fp.init(window, title, Ci.nsIFilePicker.modeGetFolder);
  fp.appendFilters(Ci.nsIFilePicker.filterAll);
  // First try to open what's currently configured
  if (currentDirPref && currentDirPref.exists()) {
    fp.displayDirectory = currentDirPref;
  } else if (defDownloads && defDownloads.exists()) {
    // Try the system's download dir
    fp.displayDirectory = defDownloads;
  } else {
    // Fall back to Desktop
    fp.displayDirectory = await _indexToFolder(kDesktop);
  }

  let result = await new Promise(resolve => fp.open(resolve));
  if (result != Ci.nsIFilePicker.returnOK) {
    return;
  }

  document.getElementById("browser.download.dir").value = fp.file;
  folderListPref.value = await _folderToIndex(fp.file);
  // Note, the real prefs will not be updated yet, so dnld manager's
  // userDownloadsDirectory may not return the right folder after
  // this code executes. displayDownloadDirPref will be called on
  // the assignment above to update the UI.
}

/**
 * Initializes the download folder display settings based on the user's
 * preferences.
 */
function displayDownloadDirPref()
{
  displayDownloadDirPrefTask().catch(Cu.reportError);
}

async function displayDownloadDirPrefTask()
{
  var folderListPref = document.getElementById("browser.download.folderList");
  var currentDirPref = await _indexToFolder(folderListPref.value); // file
  var prefutilitiesBundle = document.getElementById("bundle_prefutilities");
  var iconUrlSpec = gFPHandler.getURLSpecFromFile(currentDirPref);
  var downloadFolder = document.getElementById("downloadFolder");
  downloadFolder.image = "moz-icon://" + iconUrlSpec + "?size=16";

  // Display a 'pretty' label or the path in the UI.
  switch (folderListPref.value) {
    case kDesktop:
      downloadFolder.label = prefutilitiesBundle.getString("desktopFolderName");
      break;
    case kDownloads:
      downloadFolder.label = prefutilitiesBundle.getString("downloadsFolderName");
      break;
    default:
      downloadFolder.label = currentDirPref ? currentDirPref.path : "";
      break;
  }
}

/**
 * Returns the Downloads folder.  If aFolder is "Desktop", then the Downloads
 * folder returned is the desktop folder; otherwise, it is a folder whose name
 * indicates that it is a download folder and whose path is as determined by
 * the XPCOM directory service via the download manager's attribute
 * defaultDownloadsDirectory.
 *
 * @throws if aFolder is not "Desktop" or "Downloads"
 */
async function _getDownloadsFolder(aFolder)
{
  switch (aFolder) {
    case "Desktop":
      return Services.dirsvc.get("Desk", Ci.nsIFile);
    case "Downloads":
      let downloadsDir = await Downloads.getSystemDownloadsDirectory();
      return new FileUtils.File(downloadsDir);
  }
  throw "ASSERTION FAILED: folder type should be 'Desktop' or 'Downloads'";
}

/**
 * Determines the type of the given folder.
 *
 * @param   aFolder
 *          the folder whose type is to be determined
 * @returns integer
 *          kDesktop if aFolder is the Desktop or is unspecified,
 *          kDownloads if aFolder is the Downloads folder,
 *          kUserDir otherwise
 */
async function _folderToIndex(aFolder)
{
  if (!aFolder || aFolder.equals(await _getDownloadsFolder("Desktop"))) {
    return kDesktop;
  }

  if (aFolder.equals(await _getDownloadsFolder("Downloads"))) {
    return kDownloads;
  }

  return kUserDir;
 }

/**
 * Converts an integer into the corresponding folder.
 *
 * @param   aIndex
 *          an integer
 * @returns the Desktop folder if aIndex == kDesktop,
 *          the Downloads folder if aIndex == kDownloads,
 *          the folder stored in browser.download.dir
 */
async function _indexToFolder(aIndex)
{
  var folder;
  switch (aIndex) {
    case kDownloads:
      folder = await _getDownloadsFolder("Downloads");
      break;
    case kDesktop:
      folder = await _getDownloadsFolder("Desktop");
      break;
    default:
      folder = document.getElementById("browser.download.dir").value;
      break;
  }
  if (!folder ||
      !folder.exists()) {
    return "";
  }

  return folder;
}

function setSoundEnabled(aEnable)
{
  EnableElementById("downloadSndURL", aEnable, false);
  document.getElementById("downloadSndPlay").disabled = !aEnable;
}
