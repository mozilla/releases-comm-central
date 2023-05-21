/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

var nsFile = Components.Constructor(
  "@mozilla.org/file/local;1",
  "nsIFile",
  "initWithPath"
);

// No need to backup those paths, they are not used when importing.
const IGNORE_PATHS = [
  "cache2",
  "chrome_debugger_profile",
  "crashes",
  "datareporting",
  "extensions",
  "extension-store",
  "logs",
  "lock",
  "minidumps",
  "parent.lock",
  "shader-cache",
  "saved-telemetry-pings",
  "security_state",
  "storage",
  "xulstore",
];

var zipW;

var logger = console.createInstance({
  prefix: "mail.export",
  maxLogLevel: "Warn",
  maxLogLevelPref: "mail.export.loglevel",
});

document.addEventListener("dialogaccept", async event => {
  if (zipW) {
    // This will close the dialog.
    return;
  }

  // Do not close the dialog, but open a FilePicker to set the output location.
  event.preventDefault();

  let [filePickerTitle, brandName] = await document.l10n.formatValues([
    "export-dialog-file-picker",
    "export-dialog-brand-name",
  ]);
  let filePicker = Components.Constructor(
    "@mozilla.org/filepicker;1",
    "nsIFilePicker"
  )();
  filePicker.init(window, filePickerTitle, Ci.nsIFilePicker.modeSave);
  filePicker.defaultString = `${brandName}_profile_backup.zip`;
  filePicker.defaultExtension = "zip";
  filePicker.appendFilter("", "*.zip");
  filePicker.open(rv => {
    if (
      [Ci.nsIFilePicker.returnOK, Ci.nsIFilePicker.returnReplace].includes(
        rv
      ) &&
      filePicker.file
    ) {
      exportCurrentProfile(filePicker.file);
    } else {
      window.close();
    }
  });
});

/**
 * Export the current profile to the specified target zip file.
 *
 * @param {nsIFile} targetFile - A target zip file to write to.
 */
async function exportCurrentProfile(targetFile) {
  let [progressExporting, progressExported, buttonLabelFinish] =
    await document.l10n.formatValues([
      "export-dialog-exporting",
      "export-dialog-exported",
      "export-dialog-button-finish",
    ]);
  document.getElementById("progressBar").hidden = false;
  let progressStatus = document.getElementById("progressStatus");
  progressStatus.value = progressExporting;
  let buttonAccept = document.querySelector("dialog").getButton("accept");
  buttonAccept.disabled = true;
  document.querySelector("dialog").getButton("cancel").hidden = true;

  zipW = Components.Constructor("@mozilla.org/zipwriter;1", "nsIZipWriter")();
  // MODE_WRONLY (0x02) and MODE_CREATE (0x08)
  zipW.open(targetFile, 0x02 | 0x08);
  let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
  let rootPath = profileDir.parent.path;
  let zipEntryMap = new Map();
  await collectFilesToZip(zipEntryMap, rootPath, profileDir);

  let progressElement = document.getElementById("progress");
  progressElement.max = zipEntryMap.size;
  let i = 0;
  for (let [path, file] of zipEntryMap) {
    logger.debug("Adding entry file:", path);
    zipW.addEntryFile(
      path,
      0, // no compression, bigger file but much faster
      file,
      false
    );
    if (++i % 10 === 0) {
      progressElement.value = i;
      await new Promise(resolve => setTimeout(resolve));
    }
  }
  progressElement.value = progressElement.max;
  zipW.close();

  progressStatus.value = progressExported;
  buttonAccept.disabled = false;
  buttonAccept.label = buttonLabelFinish;
}

/**
 * Recursively collect files to be zipped, save the entries into zipEntryMap.
 *
 * @param {Map<string, nsIFile>} zipEntryMap - Collection of files to be zipped.
 * @param {string} rootPath - The rootPath to zip from.
 * @param {nsIFile} folder - The folder to search for files to zip.
 */
async function collectFilesToZip(zipEntryMap, rootPath, folder) {
  let entries = await IOUtils.getChildren(folder.path);
  let separator = Services.appinfo.OS == "WINNT" ? "\\" : "/";
  for (let entry of entries) {
    let file = nsFile(entry);
    if (file.isDirectory()) {
      await collectFilesToZip(zipEntryMap, rootPath, file);
    } else {
      // We don't want to include the rootPath part in the zip file.
      let path = entry.slice(rootPath.length + 1);
      // path now looks like this: profile-default/lock.
      let parts = path.split(separator);
      if (IGNORE_PATHS.includes(parts[1])) {
        continue;
      }
      // Path separator inside a zip file is always "/".
      zipEntryMap.set(parts.join("/"), file);
    }
  }
}
