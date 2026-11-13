/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let tab;
let view;
let doc;
let redux;
let formatValue;
const rows = [];
const pendingLoads = [];

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");

  await SpecialPowers.pushPrefEnv({
    set: [["calendar.categories.names", "Work,Personal,Team"]],
  });

  tab = document.getElementById("tabmail").openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });
  await BrowserTestUtils.browserLoaded(tab.browser);

  view = tab.browser.contentWindow;
  doc = view.document;
  redux = view.ReduxTestUtils;
  formatValue = view.Localization.prototype.formatValue;

  registerCleanupFunction(() => {
    for (const { row, container } of rows) {
      row.dispose();
      container.close();
      container.remove();
    }

    for (const pending of pendingLoads) {
      pending.resolve("");
    }

    if (formatValue) {
      view.Localization.prototype.formatValue = formatValue;
    }

    if (tab) {
      tabmail.closeTab(tab);
    }
  });
});

/**
 * Creates a row whose state is independent of the production dialog.
 *
 * @param {string} sessionKey - The fixed key for the test row.
 * @returns {CalendarEventCategoryRow} The connected and bound row.
 */
function createRow(sessionKey) {
  const container = doc.createElement("dialog");
  const row = doc
    .getElementById("calendarEventCreateEditDialogTemplate")
    .content.querySelector("calendar-event-category-row")
    .cloneNode(true);

  container.style.inlineSize = "600px";
  container.append(row);
  doc.body.append(container);
  row.bindEventSession(sessionKey);
  container.show();
  rows.push({ row, container });

  return row;
}

/**
 * Starts a create draft without calling the dialog.
 *
 * @param {string} sessionKey - The fixed key for the test row.
 * @returns {Promise<void>} Resolves after the session and draft are stored.
 */
async function startSession(sessionKey) {
  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
    "startCreateSession",
    { sessionKey }
  );
  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "resetForCreate",
    { sessionKey, initialDraft: { categories: [] } }
  );
}

/**
 * Clears a route while retaining its row and fixed session key.
 *
 * @param {string} sessionKey - The fixed key for the test row.
 * @returns {Promise<void>} Resolves after the draft and session are cleared.
 */
async function clearSession(sessionKey) {
  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "clearCalendarEventDraft",
    { sessionKey }
  );
  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
    "clearCalendarEventCreateEditSession",
    { sessionKey }
  );
}

/**
 * Returns the names displayed as available choices.
 *
 * @param {CalendarEventCategoryRow} row - The row to inspect.
 * @returns {string[]} The displayed names in order.
 */
function choiceNames(row) {
  return [
    ...row.querySelectorAll(".calendar-event-category-choices input"),
  ].map(input => input.dataset.category);
}

add_task(async function test_loadsAndRefreshesOwnOptions() {
  const sessionKey = "independent-category-row";
  const row = createRow(sessionKey);

  // Load options first to recreate an event whose draft arrives later.
  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
    "startCreateSession",
    { sessionKey }
  );

  // The fixture dialog also loads options. Wait only for this row's load.
  await row.renderComplete;

  Assert.deepEqual(
    Array.from(
      redux.getState().calendarEventCategory.sessions[sessionKey],
      option => option.name
    ),
    ["Personal", "Team", "Work"],
    "The row should load its own options before a draft exists"
  );

  Assert.strictEqual(
    redux.getState().calendarEventDraft.sessions[sessionKey],
    undefined,
    "Options should finish loading before the empty draft is stored"
  );

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "resetForCreate",
    { sessionKey, initialDraft: { categories: [] } }
  );
  await row.renderComplete;

  Assert.deepEqual(
    choiceNames(row),
    ["Personal", "Team", "Work"],
    "A row should load its own choices without the production dialog"
  );

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "updateSection",
    { sessionKey, section: "categories", patch: { categories: ["Work"] } }
  );
  await row.renderComplete;

  Assert.deepEqual(
    [
      ...row.querySelectorAll(".calendar-event-category-choices input:checked"),
    ].map(input => input.dataset.category),
    ["Work"],
    "A draft update should check the selected category choice"
  );
  Assert.equal(
    row.querySelector(".calendar-event-category-label").textContent,
    "Work",
    "A store update should render the selected category without a state setter"
  );

  await clearSession(sessionKey);
  await SpecialPowers.pushPrefEnv({
    set: [["calendar.categories.names", "Reopened"]],
  });
  await startSession(sessionKey);
  await row.renderComplete;

  Assert.deepEqual(
    choiceNames(row),
    ["Reopened"],
    "Reopening a fixed session should reload changed category preferences"
  );

  await clearSession(sessionKey);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_replacedLoadsAndDisposal() {
  await SpecialPowers.pushPrefEnv({
    set: [["calendar.categories.names", ""]],
  });

  const sessionKey = "replaced-category-load";
  const row = createRow(sessionKey);
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  pendingLoads.push(release);

  // Hold default-name translation while the same row opens a replacement route.
  view.Localization.prototype.formatValue = function (id, ...args) {
    if (id == "categories2") {
      started.resolve();

      return release.promise;
    }

    return formatValue.call(this, id, ...args);
  };

  await startSession(sessionKey);
  const oldReady = row.renderComplete;
  await started.promise;

  await clearSession(sessionKey);
  await SpecialPowers.pushPrefEnv({
    set: [["calendar.categories.names", "Replacement"]],
  });
  await startSession(sessionKey);
  await row.renderComplete;

  release.resolve("Old choices");
  await oldReady;
  await row.renderComplete;

  Assert.deepEqual(
    Array.from(
      redux.getState().calendarEventCategory.sessions[sessionKey],
      option => option.name
    ),
    ["Replacement"],
    "A late option load should preserve the replacement route's stored options"
  );

  Assert.deepEqual(
    choiceNames(row),
    ["Replacement"],
    "A late option load should preserve the replacement route's choices"
  );

  await clearSession(sessionKey);
  await SpecialPowers.popPrefEnv();

  const disposed = createRow("disposed-category-load");
  const disposedLoad = Promise.withResolvers();
  const disposedStarted = Promise.withResolvers();
  pendingLoads.push(disposedLoad);

  view.Localization.prototype.formatValue = function (id, ...args) {
    if (id == "categories2") {
      disposedStarted.resolve();

      return disposedLoad.promise;
    }

    return formatValue.call(this, id, ...args);
  };

  await startSession("disposed-category-load");
  const disposedReady = disposed.renderComplete;
  await disposedStarted.promise;
  disposed.dispose();
  disposedLoad.resolve("After disposal");
  await disposedReady;

  Assert.strictEqual(
    redux.getState().calendarEventCategory.sessions["disposed-category-load"],
    undefined,
    "Disposal should prevent a pending load from writing options"
  );

  await clearSession("disposed-category-load");
  view.Localization.prototype.formatValue = formatValue;
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_loadErrorAndRetry() {
  await SpecialPowers.pushPrefEnv({
    set: [["calendar.categories.names", ""]],
  });

  const sessionKey = "failed-category-load";
  const row = createRow(sessionKey);

  view.Localization.prototype.formatValue = function (id, ...args) {
    if (id == "categories2") {
      return Promise.reject(new Error("Category options test failure"));
    }

    return formatValue.call(this, id, ...args);
  };

  await startSession(sessionKey);

  await Assert.rejects(
    row.renderComplete,
    /Category options test failure/,
    "Readiness should reject when the current option load fails"
  );

  await clearSession(sessionKey);
  view.Localization.prototype.formatValue = function (id, ...args) {
    if (id == "categories2") {
      return Promise.resolve("Recovered");
    }

    return formatValue.call(this, id, ...args);
  };

  await startSession(sessionKey);
  await row.renderComplete;

  Assert.deepEqual(
    choiceNames(row),
    ["Recovered"],
    "A new route should retry loading after the previous load failed"
  );

  await clearSession(sessionKey);
  view.Localization.prototype.formatValue = formatValue;
  await SpecialPowers.popPrefEnv();
});
