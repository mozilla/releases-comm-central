/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from head.js */

/**
 * @param {object} handleWizardArgs - See `handleWizard`.
 */
async function openWizard(handleWizardArgs) {
  await CalendarTestUtils.openCalendarTab(window);
  const wizardPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://calendar/content/calendar-creation.xhtml",
    {
      callback: wizardWindow => handleWizard(wizardWindow, handleWizardArgs),
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    document.querySelector("#newCalendarSidebarButton"),
    {},
    window
  );
  return wizardPromise;
}

/**
 * @param {Window} wizardWindow
 * @param {object} args
 * @param {string} [args.url] - URL to use in the wizard.
 * @param {string} [args.username] - Username to use in the wizard.
 * @param {string} [args.password] - Password to use in a password dialog.
 * @param {string} [args.otherSiteOrigin] - The origin of a server on another
 *   site that SRV records point to. If given, a second password dialog is
 *   expected for it.
 * @param {boolean} [args.declineOtherSite] - Whether to cancel the password
 *   dialog for otherSiteOrigin.
 * @param {"extra1"|"cancel"} [args.certError] - Button to press on a
 *   certificate exception dialog. If not given, no exception dialog is
 *   expected.
 * @param {object[]} [args.expectedCalendars] - Describe the calendars that
 *   should be shown in the wizard after discovery.
 */
async function handleWizard(
  wizardWindow,
  { url, username, password, otherSiteOrigin, declineOtherSite, certError, expectedCalendars }
) {
  const wizardDocument = wizardWindow.document;
  const acceptButton = wizardDocument.querySelector("dialog").getButton("accept");
  const cancelButton = wizardDocument.querySelector("dialog").getButton("cancel");

  // Select calendar type.

  EventUtils.synthesizeMouseAtCenter(
    wizardDocument.querySelector(`radio[value="network"]`),
    {},
    wizardWindow
  );
  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, wizardWindow);

  // Network calendar settings.

  Assert.ok(acceptButton.disabled);
  Assert.equal(wizardDocument.activeElement.id, "network-username-input");
  if (username) {
    EventUtils.sendString(username, wizardWindow);
  }

  if (username?.includes("@")) {
    Assert.equal(
      wizardDocument.getElementById("network-location-input").placeholder,
      username.replace(/^.*@/, "")
    );
  }

  EventUtils.synthesizeKey("KEY_Tab", {}, wizardWindow);
  Assert.equal(wizardDocument.activeElement.id, "network-location-input");
  if (url) {
    EventUtils.sendString(url, wizardWindow);
  }

  Assert.ok(!acceptButton.disabled);

  const certPromise = certError ? handleCertError(certError) : Promise.resolve();
  const prompts = [];
  if (certError != "cancel") {
    prompts.push({ password });
    if (otherSiteOrigin) {
      prompts.push({ password: declineOtherSite ? null : password, origin: otherSiteOrigin });
    }
  }
  const promptPromise = handlePasswordPrompts(prompts);
  EventUtils.synthesizeKey("KEY_Enter", {}, wizardWindow);
  await certPromise;
  if (certError == "cancel") {
    const status = wizardDocument.querySelector(".network-status-row");
    Assert.equal(status.getAttribute("status"), "certerror");
    Assert.ok(BrowserTestUtils.isVisible(wizardDocument.querySelector(".network-certerror-label")));
    EventUtils.synthesizeMouseAtCenter(cancelButton, {}, wizardWindow);
    return;
  }
  if (certError == "extra1") {
    // If we added a certificate exception, retry calendar discovery.
    EventUtils.synthesizeKey("KEY_Enter", {}, wizardWindow);
  }
  await promptPromise;

  if (expectedCalendars.length == 0) {
    const status = wizardDocument.querySelector(".network-status-row");
    await TestUtils.waitForCondition(
      () => status.getAttribute("status") != "loading",
      "waiting for discovery to finish"
    );
    Assert.equal(status.getAttribute("status"), "notfound");
    Assert.ok(BrowserTestUtils.isVisible(wizardDocument.querySelector(".network-notfound-label")));
    EventUtils.synthesizeMouseAtCenter(cancelButton, {}, wizardWindow);
    return;
  }

  // Select calendars.

  const list = wizardDocument.getElementById("network-calendar-list");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(list),
    "waiting for calendar list to appear",
    200,
    100
  );

  Assert.equal(list.childElementCount, expectedCalendars.length);
  for (let i = 0; i < expectedCalendars.length; i++) {
    const item = list.children[i];

    Assert.equal(item.calendar.uri.spec, expectedCalendars[i].uri);
    if (expectedCalendars[i].color) {
      Assert.equal(
        item.querySelector(".calendar-color").style.backgroundColor,
        expectedCalendars[i].color
      );
    }
    Assert.equal(item.querySelector(".calendar-name").value, expectedCalendars[i].name);

    if (expectedCalendars[i].hasOwnProperty("readOnly")) {
      Assert.equal(
        item.calendar.readOnly,
        expectedCalendars[i].readOnly,
        `calendar read-only property is ${expectedCalendars[i].readOnly}`
      );
    }
  }
  EventUtils.synthesizeMouseAtCenter(cancelButton, {}, wizardWindow);
}

/**
 * Answers password dialogs in the order they open. All are handled by one
 * observer, so a dialog opening right after the previous one isn't missed.
 *
 * @param {object[]} prompts - The dialogs expected.
 * @param {?string} prompts[].password - The password to enter, or null to
 *   cancel the dialog.
 * @param {string} [prompts[].origin] - The origin the dialog should name.
 * @returns {Promise} Resolves when the last dialog has closed.
 */
function handlePasswordPrompts(prompts) {
  if (!prompts.length) {
    return Promise.resolve();
  }
  const { promise, resolve } = Promise.withResolvers();
  let count = 0;
  const observer = {
    observe(prompt, topic) {
      if (topic != "domwindowopened") {
        return;
      }
      prompt.addEventListener(
        "load",
        async () => {
          if (prompt.location.href != "chrome://global/content/commonDialog.xhtml") {
            return;
          }
          const { password, origin } = prompts[count++];
          const isLast = count == prompts.length;
          if (isLast) {
            Services.ww.unregisterNotification(observer);
          }
          await new Promise(r => prompt.setTimeout(r));

          if (origin) {
            Assert.stringContains(
              prompt.document.getElementById("infoBody").textContent,
              origin,
              "the password dialog should name the server"
            );
          }

          const closed = BrowserTestUtils.windowClosed(prompt);
          if (password === null) {
            prompt.document.querySelector("dialog").getButton("cancel").click();
          } else {
            prompt.document.getElementById("password1Textbox").value = password;

            const checkbox = prompt.document.getElementById("checkbox");
            Assert.greater(checkbox.getBoundingClientRect().width, 0);
            Assert.ok(checkbox.checked);

            prompt.document.querySelector("dialog").getButton("accept").click();
          }
          await closed;
          if (isLast) {
            resolve();
          }
        },
        { once: true }
      );
    },
  };
  Services.ww.registerNotification(observer);
  return promise;
}

/**
 * @param {"extra1"|"cancel"} buttonToPress
 */
async function handleCertError(buttonToPress) {
  await BrowserTestUtils.promiseAlertDialog(
    buttonToPress,
    "chrome://pippki/content/exceptionDialog.xhtml",
    {
      async callback(win) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        win.document.getElementById("exceptiondialog").getButton(buttonToPress).click();
      },
    }
  );
  Assert.ok(
    !Services.wm.getMostRecentWindow("mozilla:exceptiondialog"),
    "no more exception dialogs should be open"
  );
}
