/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { be_in_folder, create_folder, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
const { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
const { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const visibleAlerts = [];
const silentAlerts = [];
let source;
let target;
let filterList;
let filter;
let folderError;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.allowMboxOver4GB", false]],
  });
  source = await create_folder("FilterAlertSource");
  target = await create_folder("FilterAlertTarget");
  await make_message_sets_in_folders([source], [{ count: 1 }]);
  const [header] = source.messages;
  const originalSize = header.messageSize;
  filterList = source.getFilterList();
  const loggingEnabled = filterList.loggingEnabled;
  filter = createFilter(
    "Failing manual move",
    Ci.nsMsgFilterAction.MoveToFolder
  );

  const listener = {
    QueryInterface: ChromeUtils.generateQI(["nsIMsgUserFeedbackListener"]),
    onAlert(message, serverKey, silent) {
      (silent ? silentAlerts : visibleAlerts).push(message);
      return true;
    },
  };
  MailServices.mailSession.addUserFeedbackListener(listener);
  registerCleanupFunction(async () => {
    MailServices.mailSession.removeUserFeedbackListener(listener);
    filterList.loggingEnabled = loggingEnabled;
    filterList.removeFilter(filter);
    header.messageSize = originalSize;
    await be_in_folder(source.parent);
    source.deleteSelf(false);
    target.deleteSelf(false);
  });

  // Exercise the size-limit alert without creating a multi-gigabyte message.
  header.messageSize = 0xffc00000;
  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
  const folderName = bundle.formatStringFromName("verboseFolderFormat", [
    target.prettyPath,
    target.server.prettyName,
  ]);
  folderError = bundle.formatStringFromName("mailboxTooLarge", [folderName]);
});

/**
 * Add a matching filter for the test destination.
 *
 * @param {string} name - The filter name.
 * @param {number} actionType - A copy or move constant from `Ci.nsMsgFilterAction`.
 * @returns {nsIMsgFilter} The added filter.
 */
function createFilter(name, actionType) {
  const added = filterList.createFilter(name);
  added.enabled = true;
  added.filterType = Ci.nsMsgFilterType.Manual;
  const term = added.createTerm();
  term.matchAll = true;
  added.appendTerm(term);
  const action = added.createAction();
  action.type = actionType;
  action.targetFolderUri = target.URI;
  added.appendAction(action);
  filterList.insertFilterAt(0, added);
  return added;
}

/**
 * Check that a failed manual run includes its folder error in one prompt.
 *
 * @param {"dialog"|"folder"|"selection"} entryPoint - Where to start the run.
 * @param {boolean} loggingEnabled - Whether to log the run.
 * @param {number} [expectedAlerts=1] - Number of folder errors raised by the run.
 * @param {string} [errorMessage=folderError] - The expected folder error.
 */
async function checkFailure(
  entryPoint,
  loggingEnabled,
  expectedAlerts = 1,
  errorMessage = folderError
) {
  await be_in_folder(source);
  filterList.loggingEnabled = loggingEnabled;
  visibleAlerts.length = 0;
  silentAlerts.length = 0;

  let filterWindow;
  if (entryPoint == "dialog") {
    const opened = promise_new_window("mailnews:filterlist");
    window.openDialog(
      "chrome://messenger/content/FilterListDialog.xhtml",
      "",
      "chrome,dialog=no,resizable",
      { folder: source, filter }
    );
    filterWindow = await opened;
    filterWindow.setRunFolder(source);
    await SimpleTest.promiseFocus(filterWindow);
  } else {
    await select_click_row(0, AccessibilityUtils);
  }

  const originalPrompt = Services.prompt;
  const prompted = Promise.withResolvers();
  let promptCount = 0;
  Services.prompt = {
    BUTTON_TITLE_IS_STRING: originalPrompt.BUTTON_TITLE_IS_STRING,
    BUTTON_TITLE_CANCEL: originalPrompt.BUTTON_TITLE_CANCEL,
    BUTTON_POS_0: originalPrompt.BUTTON_POS_0,
    BUTTON_POS_1: originalPrompt.BUTTON_POS_1,
    confirmEx(parent, title, message, flags, buttonLabel) {
      promptCount++;
      prompted.resolve({ parent, message, buttonLabel });
      return 1;
    },
  };

  try {
    if (filterWindow) {
      EventUtils.synthesizeMouseAtCenter(
        filterWindow.document.getElementById("runFiltersButton"),
        {},
        filterWindow
      );
    } else {
      const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
      about3Pane.commandController.doCommand(
        entryPoint == "folder"
          ? "cmd_applyFilters"
          : "cmd_applyFiltersToSelection"
      );
    }
    const state = await prompted.promise;
    const ids = filterWindow
      ? ["filter-run-failed", "filter-run-failed-open-log-button"]
      : ["apply-filters-failed", "apply-filters-failed-open-log-button"];
    const expected = filterWindow
      ? filterWindow.l10n.formatValuesSync(ids)
      : await document
          .getElementById("tabmail")
          .currentAbout3Pane.document.l10n.formatValues(ids);
    Assert.deepEqual(
      visibleAlerts,
      [],
      "The folder error should not produce a separate global alert"
    );
    Assert.deepEqual(
      silentAlerts,
      Array(expectedAlerts).fill(errorMessage),
      "The folder errors should still reach global listeners silently"
    );
    Assert.equal(
      promptCount,
      1,
      "The failed run should show one summary prompt"
    );
    Assert.equal(
      state.parent,
      filterWindow || window,
      "The prompt should belong to the run's window"
    );
    Assert.equal(
      state.message,
      `${expected[0]}\n\n${errorMessage}`,
      "The summary should include the folder error exactly once, even with logging disabled"
    );
    Assert.equal(
      state.buttonLabel,
      expected[1],
      "The prompt should retain its Open Filter Log action"
    );
    if (filterWindow) {
      Assert.ok(
        !filterWindow.gRunningFilters,
        "The run should finish before showing its error"
      );
      Assert.ok(
        !filterWindow.gRunFiltersButton.disabled,
        "Run Now should be enabled after the failed run"
      );
    }
    Assert.equal(
      source.getTotalMessages(false),
      1,
      "The failed move should retain the source message"
    );
    Assert.equal(
      target.getTotalMessages(false),
      0,
      "The failed move should leave the destination empty"
    );
  } finally {
    Services.prompt = originalPrompt;
    if (filterWindow) {
      await BrowserTestUtils.closeWindow(filterWindow);
    }
  }
}

add_task(async function test_dialogNoLogging() {
  await checkFailure("dialog", false);
});

add_task(async function test_folderWithLogging() {
  await checkFailure("folder", true);
});

add_task(async function test_repeatedFolderError() {
  const action = filter.getActionAt(0);
  action.type = Ci.nsMsgFilterAction.CopyToFolder;
  const duplicate = createFilter(
    "Second failing copy",
    Ci.nsMsgFilterAction.CopyToFolder
  );
  try {
    await checkFailure("folder", true, 2);
  } finally {
    filterList.removeFilter(duplicate);
    action.type = Ci.nsMsgFilterAction.MoveToFolder;
  }
});

/**
 * Checks that a renamed destination mbox produces one prompt with its file error.
 * Restores the mbox and preferences after the run.
 *
 * @param {"dialog"|"folder"|"selection"} entryPoint - Where to start the run.
 * @param {boolean} loggingEnabled - Whether to log the run.
 */
async function checkMissingMbox(entryPoint, loggingEnabled) {
  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.allowMboxOver4GB", true]],
  });
  const file = target.filePath;
  const renamed = file.clone();
  const errorMessage = await document.l10n.formatValue(
    "folder-file-not-found",
    {
      folder: target.prettyPath,
      server: target.server.prettyName,
    }
  );
  renamed.moveTo(null, `${file.leafName}.renamed`);
  try {
    await checkFailure(entryPoint, loggingEnabled, 1, errorMessage);
  } finally {
    renamed.moveTo(null, file.leafName);
    await SpecialPowers.popPrefEnv();
  }
}

add_task(async function test_missingMboxDialogWithLogging() {
  await checkMissingMbox("dialog", true);
});

add_task(async function test_missingMboxSelectionNoLogging() {
  await checkMissingMbox("selection", false);
});
