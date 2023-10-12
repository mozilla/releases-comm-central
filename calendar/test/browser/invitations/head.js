/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Common functions for the imip-bar tests.
 *
 * Note that these tests are heavily tied to the .eml files found in the data
 * folder.
 */

"use strict";

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalItipDefaultEmailTransport } = ChromeUtils.import(
  "resource:///modules/CalItipEmailTransport.jsm"
);
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

var { FileTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/FileTestUtils.sys.mjs"
);
var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

registerCleanupFunction(async () => {
  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  document.body.focus();
});

class EmailTransport extends CalItipDefaultEmailTransport {
  sentItems = [];

  sentMsgs = [];

  getMsgSend() {
    const { sentMsgs } = this;
    return {
      sendMessageFile(
        userIdentity,
        accountKey,
        composeFields,
        messageFile,
        deleteSendFileOnCompletion,
        digest,
        deliverMode,
        msgToReplace,
        listener,
        statusFeedback,
        smtpPassword
      ) {
        sentMsgs.push({
          userIdentity,
          accountKey,
          composeFields,
          messageFile,
          deleteSendFileOnCompletion,
          digest,
          deliverMode,
          msgToReplace,
          listener,
          statusFeedback,
          smtpPassword,
        });
      },
    };
  }

  sendItems(recipients, itipItem, fromAttendee) {
    this.sentItems.push({ recipients, itipItem, fromAttendee });
    return super.sendItems(recipients, itipItem, fromAttendee);
  }

  reset() {
    this.sentItems = [];
    this.sentMsgs = [];
  }
}

async function openMessageFromFile(file) {
  const fileURL = Services.io
    .newFileURI(file)
    .mutate()
    .setQuery("type=application/x-message-display")
    .finalize();

  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.openDialog(
    "chrome://messenger/content/messageWindow.xhtml",
    "_blank",
    "all,chrome,dialog=no,status,toolbar",
    fileURL
  );
  const win = await winPromise;
  await BrowserTestUtils.waitForEvent(win, "MsgLoaded");
  await TestUtils.waitForCondition(() => Services.focus.activeWindow == win);
  return win;
}

/**
 * Opens an iMIP message file and waits for the imip-bar to appear.
 *
 * @param {nsIFile} file
 * @returns {Window}
 */
async function openImipMessage(file) {
  const win = await openMessageFromFile(file);
  const aboutMessage = win.document.getElementById("messageBrowser").contentWindow;
  const imipBar = aboutMessage.document.getElementById("imip-bar");
  await TestUtils.waitForCondition(() => !imipBar.collapsed, "imip-bar shown");

  if (Services.prefs.getBoolPref("calendar.itip.newInvitationDisplay")) {
    // CalInvitationDisplay.show() does some async activities before the panel is added.
    await TestUtils.waitForCondition(
      () =>
        win.document
          .getElementById("messageBrowser")
          .contentDocument.querySelector("calendar-invitation-panel"),
      "calendar-invitation-panel shown"
    );
  }
  return win;
}

/**
 * Clicks on one of the imip-bar action buttons.
 *
 * @param {Window} win
 * @param {string} id
 */
async function clickAction(win, id) {
  const aboutMessage = win.document.getElementById("messageBrowser").contentWindow;
  const action = aboutMessage.document.getElementById(id);
  await TestUtils.waitForCondition(() => !action.hidden, `button "#${id}" shown`);

  EventUtils.synthesizeMouseAtCenter(action, {}, aboutMessage);
  await TestUtils.waitForCondition(() => action.hidden, `button "#${id}" hidden`);
}

/**
 * Clicks on one of the imip-bar actions from a dropdown menu.
 *
 * @param {Window} win The window the imip message is opened in.
 * @param {string} buttonId The id of the <toolbarbutton> containing the menu.
 * @param {string} actionId The id of the menu item to click.
 */
async function clickMenuAction(win, buttonId, actionId) {
  const aboutMessage = win.document.getElementById("messageBrowser").contentWindow;
  const actionButton = aboutMessage.document.getElementById(buttonId);
  await TestUtils.waitForCondition(() => !actionButton.hidden, `"${buttonId}" shown`);

  const actionMenu = actionButton.querySelector("menupopup");
  const menuShown = BrowserTestUtils.waitForEvent(actionMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(actionButton.querySelector("dropmarker"), {}, aboutMessage);
  await menuShown;
  actionMenu.activateItem(aboutMessage.document.getElementById(actionId));
  await TestUtils.waitForCondition(() => actionButton.hidden, `action menu "#${buttonId}" hidden`);
}

const unpromotedProps = ["location", "description", "sequence", "x-moz-received-dtstamp"];

/**
 * An object where the keys are paths/selectors and the values are the values
 * we expect to encounter.
 *
 * @typedef {object} Comparable
 */

/**
 * Compares the paths specified in the expected object against the provided
 * actual object.
 *
 * @param {object} actual This is expected to be a calIEvent or calIAttendee but
 *   can also be an array of both etc.
 * @param {Comparable} expected
 */
function compareProperties(actual, expected, prefix = "") {
  Assert.equal(typeof actual, "object", `${prefix || "provided value"} is an object`);
  for (const [key, value] of Object.entries(expected)) {
    if (key.includes(".")) {
      const keys = key.split(".");
      const head = keys[0];
      const tail = keys.slice(1).join(".");
      compareProperties(actual[head], { [tail]: value }, [prefix, head].filter(k => k).join("."));
      continue;
    }

    const path = [prefix, key].filter(k => k).join(".");
    const actualValue = unpromotedProps.includes(key) ? actual.getProperty(key) : actual[key];
    Assert.equal(actualValue, value, `property "${path}" is "${value}"`);
  }
}

/**
 * Compares the text contents of the selectors specified on the inviatation panel
 * to the expected value for each.
 *
 * @param {ShadowRoot} root The invitation panel's ShadowRoot instance.
 * @param {Comparable} expected
 */
function compareShownPanelValues(root, expected) {
  for (let [key, value] of Object.entries(expected)) {
    value = Array.isArray(value) ? value.join("") : value;
    Assert.equal(
      root.querySelector(key).textContent.trim(),
      value,
      `property "${key}" is "${value}"`
    );
  }
}

/**
 * Clicks on one of the invitation panel action buttons.
 *
 * @param {Window} panel
 * @param {string} id
 * @param {boolean} sendResponse
 */
async function clickPanelAction(panel, id, sendResponse = true) {
  const promise = BrowserTestUtils.promiseAlertDialogOpen(sendResponse ? "accept" : "cancel");
  const button = panel.shadowRoot.getElementById(id);
  EventUtils.synthesizeMouseAtCenter(button, {}, panel.ownerGlobal);
  await promise;
  await BrowserTestUtils.waitForEvent(panel.ownerGlobal, "onItipItemActionFinished");
}

/**
 * Tests that an attempt to reply to the organizer of the event with the correct
 * details occurred.
 *
 * @param {EmailTransport} transport
 * @param {nsIdentity} identity
 * @param {string} partStat
 */
async function doReplyTest(transport, identity, partStat) {
  info("Verifying the attempt to send a response uses the correct data");
  Assert.equal(transport.sentItems.length, 1, "itip subsystem attempted to send a response");
  compareProperties(transport.sentItems[0], {
    "recipients.0.id": "mailto:sender@example.com",
    "itipItem.responseMethod": "REPLY",
    "fromAttendee.id": "mailto:receiver@example.com",
    "fromAttendee.participationStatus": partStat,
  });

  // The itipItem is used to generate the iTIP data in the message body.
  info("Verifying the reply calItipItem attendee list");
  const replyItem = transport.sentItems[0].itipItem.getItemList()[0];
  const replyAttendees = replyItem.getAttendees();
  Assert.equal(replyAttendees.length, 1, "reply has one attendee");
  compareProperties(replyAttendees[0], {
    id: "mailto:receiver@example.com",
    participationStatus: partStat,
  });

  info("Verifying the call to the message subsystem");
  Assert.equal(transport.sentMsgs.length, 1, "transport sent 1 message");
  compareProperties(transport.sentMsgs[0], {
    userIdentity: identity,
    "composeFields.from": "receiver@example.com",
    "composeFields.to": "Sender <sender@example.com>",
  });
  Assert.ok(transport.sentMsgs[0].messageFile.exists(), "message file was created");
}

/**
 * @typedef {object} ImipBarActionTestConf
 *
 * @property {calICalendar} calendar The calendar used for the test.
 * @property {calIItipTranport} transport The transport used for the test.
 * @property {nsIIdentity} identity The identity expected to be used to
 *   send the reply.
 * @property {boolean} isRecurring Indicates whether to treat the event as a
 *   recurring event or not.
 * @property {string} partStat The participationStatus of the receiving user to
 *   expect.
 * @property {boolean} noReply If true, do not expect an attempt to send a reply.
 * @property {boolean} noSend If true, expect the reply attempt to stop after the
 *   user is prompted.
 * @property {boolean} isMajor For update tests indicates if the changes expected
 *  are major or minor.
 */

/**
 * Test the properties of an event created from the imip-bar and optionally, the
 * attempt to send a reply.
 *
 * @param {ImipBarActionTestConf} conf
 * @param {calIEvent|calIEvent[]} item
 */
async function doImipBarActionTest(conf, event) {
  const { calendar, transport, identity, partStat, isRecurring, noReply, noSend } = conf;
  let events = [event];
  let startDates = ["20220316T110000Z"];
  let endDates = ["20220316T113000Z"];

  if (isRecurring) {
    startDates = [...startDates, "20220317T110000Z", "20220318T110000Z"];
    endDates = [...endDates, "20220317T113000Z", "20220318T113000Z"];
    events = event.parentItem.recurrenceInfo.getOccurrences(
      cal.createDateTime("19700101"),
      cal.createDateTime("30000101"),
      Infinity
    );
    Assert.equal(events.length, 3, "reccurring event has 3 occurrences");
  }

  info("Verifying relevant properties of each event occurrence");
  for (const [index, occurrence] of events.entries()) {
    compareProperties(occurrence, {
      id: "02e79b96",
      title: isRecurring ? "Repeat Event" : "Single Event",
      "calendar.name": calendar.name,
      ...(isRecurring ? { "recurrenceId.icalString": startDates[index] } : {}),
      "startDate.icalString": startDates[index],
      "endDate.icalString": endDates[index],
      description: "An event invitation.",
      location: "Somewhere",
      sequence: "0",
      "x-moz-received-dtstamp": "20220316T191602Z",
      "organizer.id": "mailto:sender@example.com",
      status: "CONFIRMED",
    });

    // Alarms should be ignored.
    Assert.equal(
      occurrence.getAlarms().length,
      0,
      `${isRecurring ? "occurrence" : "event"} has no reminders`
    );

    info("Verifying attendee list and participation status");
    const attendees = occurrence.getAttendees();
    compareProperties(attendees, {
      "0.id": "mailto:sender@example.com",
      "0.participationStatus": "ACCEPTED",
      "1.participationStatus": partStat,
      "1.id": "mailto:receiver@example.com",
      "2.id": "mailto:other@example.com",
      "2.participationStatus": "NEEDS-ACTION",
    });
  }

  if (noReply) {
    Assert.equal(
      transport.sentItems.length,
      0,
      "itip subsystem did not attempt to send a response"
    );
  }
  if (noReply || noSend) {
    Assert.equal(transport.sentMsgs.length, 0, "no call was made into the mail subsystem");
    return;
  }
  await doReplyTest(transport, identity, partStat);
}

/**
 * Tests the recognition and application of a minor update to an existing event.
 * An update is considered minor if the SEQUENCE property has not changed but
 * the DTSTAMP has.
 *
 * @param {ImipBarActionTestConf} conf
 */
async function doMinorUpdateTest(conf) {
  const { transport, calendar, partStat, isRecurring } = conf;
  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item.parentItem;
  const prevEventIcs = event.icalString;

  transport.reset();

  const updatePath = isRecurring ? "data/repeat-update-minor.eml" : "data/update-minor.eml";
  const win = await openImipMessage(new FileUtils.File(getTestFilePath(updatePath)));
  const aboutMessage = win.document.getElementById("messageBrowser").contentWindow;
  const updateButton = aboutMessage.document.getElementById("imipUpdateButton");
  Assert.ok(!updateButton.hidden, `#${updateButton.id} button shown`);
  EventUtils.synthesizeMouseAtCenter(updateButton, {}, aboutMessage);

  await TestUtils.waitForCondition(async () => {
    event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item.parentItem;
    return event.icalString != prevEventIcs;
  }, "event updated");

  await BrowserTestUtils.closeWindow(win);

  let events = [event];
  let startDates = ["20220316T110000Z"];
  let endDates = ["20220316T113000Z"];
  if (isRecurring) {
    startDates = [...startDates, "20220317T110000Z", "20220318T110000Z"];
    endDates = [...endDates, "20220317T113000Z", "20220318T113000Z"];
    events = event.recurrenceInfo.getOccurrences(
      cal.createDateTime("19700101"),
      cal.createDateTime("30000101"),
      Infinity
    );
    Assert.equal(events.length, 3, "reccurring event has 3 occurrences");
  }

  info("Verifying relevant properties of each event occurrence");
  for (const [index, occurrence] of events.entries()) {
    compareProperties(occurrence, {
      id: "02e79b96",
      title: "Updated Event",
      "calendar.name": calendar.name,
      ...(isRecurring ? { "recurrenceId.icalString": startDates[index] } : {}),
      "startDate.icalString": startDates[index],
      "endDate.icalString": endDates[index],
      description: "Updated description.",
      location: "Updated location",
      sequence: "0",
      "x-moz-received-dtstamp": "20220318T191602Z",
      "organizer.id": "mailto:sender@example.com",
      status: "CONFIRMED",
    });

    // Note: It seems we do not keep the order of the attendees list for updates.
    const attendees = occurrence.getAttendees();
    compareProperties(attendees, {
      "0.id": "mailto:sender@example.com",
      "0.participationStatus": "ACCEPTED",
      "1.id": "mailto:other@example.com",
      "1.participationStatus": "NEEDS-ACTION",
      "2.participationStatus": partStat,
      "2.id": "mailto:receiver@example.com",
    });
  }

  Assert.equal(transport.sentItems.length, 0, "itip subsystem did not attempt to send a response");
  Assert.equal(transport.sentMsgs.length, 0, "no call was made into the mail subsystem");
  await calendar.deleteItem(event);
}

const actionIds = {
  single: {
    button: {
      ACCEPTED: "imipAcceptButton",
      TENTATIVE: "imipTentativeButton",
      DECLINED: "imipDeclineButton",
    },
    noReply: {
      ACCEPTED: "imipAcceptButton_AcceptDontSend",
      TENTATIVE: "imipTentativeButton_TentativeDontSend",
      DECLINED: "imipDeclineButton_DeclineDontSend",
    },
  },
  recurring: {
    button: {
      ACCEPTED: "imipAcceptRecurrencesButton",
      TENTATIVE: "imipTentativeRecurrencesButton",
      DECLINED: "imipDeclineRecurrencesButton",
    },
    noReply: {
      ACCEPTED: "imipAcceptRecurrencesButton_AcceptDontSend",
      TENTATIVE: "imipTentativeRecurrencesButton_TentativeDontSend",
      DECLINED: "imipDeclineRecurrencesButton_DeclineDontSend",
    },
  },
};

/**
 * Tests the recognition and application of a major update to an existing event.
 * An update is considered major if the SEQUENCE property has changed. For major
 * updates, the imip-bar prompts the user to re-confirm their attendance.
 *
 * @param {ImipBarActionTestConf} conf
 */
async function doMajorUpdateTest(conf) {
  const { transport, identity, calendar, partStat, isRecurring, noReply } = conf;
  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item.parentItem;
  const prevEventIcs = event.icalString;

  transport.reset();

  const updatePath = isRecurring ? "data/repeat-update-major.eml" : "data/update-major.eml";
  const win = await openImipMessage(new FileUtils.File(getTestFilePath(updatePath)));
  const actions = isRecurring ? actionIds.recurring : actionIds.single;
  if (noReply) {
    const { button, noReply } = actions;
    await clickMenuAction(win, button[partStat], noReply[partStat]);
  } else {
    await clickAction(win, actions.button[partStat]);
  }

  await TestUtils.waitForCondition(async () => {
    event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item.parentItem;
    return event.icalString != prevEventIcs;
  }, "event updated");

  await BrowserTestUtils.closeWindow(win);

  if (noReply) {
    Assert.equal(
      transport.sentItems.length,
      0,
      "itip subsystem did not attempt to send a response"
    );
    Assert.equal(transport.sentMsgs.length, 0, "no call was made into the mail subsystem");
  } else {
    await doReplyTest(transport, identity, partStat);
  }

  let events = [event];
  let startDates = ["20220316T050000Z"];
  let endDates = ["20220316T053000Z"];
  if (isRecurring) {
    startDates = [...startDates, "20220317T050000Z", "20220318T050000Z"];
    endDates = [...endDates, "20220317T053000Z", "20220318T053000Z"];
    events = event.recurrenceInfo.getOccurrences(
      cal.createDateTime("19700101"),
      cal.createDateTime("30000101"),
      Infinity
    );
    Assert.equal(events.length, 3, "reccurring event has 3 occurrences");
  }

  for (const [index, occurrence] of events.entries()) {
    compareProperties(occurrence, {
      id: "02e79b96",
      title: isRecurring ? "Repeat Event" : "Single Event",
      "calendar.name": calendar.name,
      ...(isRecurring ? { "recurrenceId.icalString": startDates[index] } : {}),
      "startDate.icalString": startDates[index],
      "endDate.icalString": endDates[index],
      description: "An event invitation.",
      location: "Somewhere",
      sequence: "2",
      "x-moz-received-dtstamp": "20220316T191602Z",
      "organizer.id": "mailto:sender@example.com",
      status: "CONFIRMED",
    });

    const attendees = occurrence.getAttendees();
    compareProperties(attendees, {
      "0.id": "mailto:sender@example.com",
      "0.participationStatus": "ACCEPTED",
      "1.id": "mailto:other@example.com",
      "1.participationStatus": "NEEDS-ACTION",
      "2.participationStatus": partStat,
      "2.id": "mailto:receiver@example.com",
    });
  }
  await calendar.deleteItem(event);
}

/**
 * Tests the recognition and application of a minor update exception to an
 * existing recurring event.
 *
 * @param {ImipBarActionTestConf} conf
 */
async function doMinorExceptionTest(conf) {
  const { transport, calendar, partStat } = conf;
  const recurrenceId = cal.createDateTime("20220317T110000Z");
  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item.parentItem;
  const originalProps = {
    id: "02e79b96",
    "recurrenceId.icalString": "20220317T110000Z",
    title: event.title,
    "calendar.name": calendar.name,
    "startDate.icalString": event.startDate.icalString,
    "endDate.icalString": event.endDate.icalString,
    description: event.getProperty("DESCRIPTION"),
    location: event.getProperty("LOCATION"),
    sequence: "0",
    "x-moz-received-dtstamp": event.getProperty("x-moz-received-dtstamp"),
    "organizer.id": "mailto:sender@example.com",
    status: "CONFIRMED",
  };

  Assert.ok(
    !event.recurrenceInfo.getExceptionFor(recurrenceId),
    `no exception exists for ${recurrenceId}`
  );

  transport.reset();

  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-minor.eml"))
  );
  const aboutMessage = win.document.getElementById("messageBrowser").contentWindow;
  const updateButton = aboutMessage.document.getElementById("imipUpdateButton");
  Assert.ok(!updateButton.hidden, `#${updateButton.id} button shown`);
  EventUtils.synthesizeMouseAtCenter(updateButton, {}, aboutMessage);

  let exception;
  await TestUtils.waitForCondition(async () => {
    event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item.parentItem;
    exception = event.recurrenceInfo.getExceptionFor(recurrenceId);
    return exception;
  }, "event exception applied");

  await BrowserTestUtils.closeWindow(win);

  Assert.equal(transport.sentItems.length, 0, "itip subsystem did not attempt to send a response");
  Assert.equal(transport.sentMsgs.length, 0, "no call was made into the mail subsystem");

  info("Verifying relevant properties of the exception");
  compareProperties(exception, {
    id: "02e79b96",
    "recurrenceId.icalString": "20220317T110000Z",
    title: "Exception title",
    "calendar.name": calendar.name,
    "startDate.icalString": "20220317T110000Z",
    "endDate.icalString": "20220317T113000Z",
    description: "Exception description",
    location: "Exception location",
    sequence: "0",
    "x-moz-received-dtstamp": "20220318T191602Z",
    "organizer.id": "mailto:sender@example.com",
    status: "CONFIRMED",
  });

  compareProperties(exception.getAttendees(), {
    "0.id": "mailto:sender@example.com",
    "0.participationStatus": "ACCEPTED",
    "1.id": "mailto:other@example.com",
    "1.participationStatus": "NEEDS-ACTION",
    "2.id": "mailto:receiver@example.com",
    "2.participationStatus": partStat,
  });

  const occurrences = event.recurrenceInfo.getOccurrences(
    cal.createDateTime("19700101"),
    cal.createDateTime("30000101"),
    Infinity
  );
  Assert.equal(occurrences.length, 3, "reccurring event still has 3 occurrences");

  info("Verifying relevant properties of the other occurrences");

  const startDates = ["20220316T110000Z", "20220317T110000Z", "20220318T110000Z"];
  const endDates = ["20220316T113000Z", "20220317T113000Z", "20220318T113000Z"];
  for (const [index, occurrence] of occurrences.entries()) {
    if (occurrence.startDate.compare(recurrenceId) == 0) {
      continue;
    }
    compareProperties(occurrence, {
      ...originalProps,
      "recurrenceId.icalString": startDates[index],
      "startDate.icalString": startDates[index],
      "endDate.icalString": endDates[index],
    });

    const attendees = occurrence.getAttendees();
    compareProperties(attendees, {
      "0.id": "mailto:sender@example.com",
      "0.participationStatus": "ACCEPTED",
      "1.id": "mailto:receiver@example.com",
      "1.participationStatus": partStat,
      "2.id": "mailto:other@example.com",
      "2.participationStatus": "NEEDS-ACTION",
    });
  }

  await calendar.deleteItem(event);
}

/**
 * Tests the recognition and application of a major update exception to an
 * existing recurring event.
 *
 * @param {ImipBarActionTestConf} conf
 */
async function doMajorExceptionTest(conf) {
  const { transport, identity, calendar, partStat, noReply } = conf;
  const recurrenceId = cal.createDateTime("20220317T110000Z");
  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item.parentItem;
  const originalProps = {
    id: "02e79b96",
    "recurrenceId.icalString": "20220317T110000Z",
    title: event.title,
    "calendar.name": calendar.name,
    "startDate.icalString": event.startDate.icalString,
    "endDate.icalString": event.endDate.icalString,
    description: event.getProperty("DESCRIPTION"),
    location: event.getProperty("LOCATION"),
    sequence: "0",
    "x-moz-received-dtstamp": event.getProperty("x-moz-received-dtstamp"),
    "organizer.id": "mailto:sender@example.com",
    status: "CONFIRMED",
  };
  const originalPartStat = event
    .getAttendees()
    .find(att => att.id == "mailto:receiver@example.com").participationStatus;

  Assert.ok(
    !event.recurrenceInfo.getExceptionFor(recurrenceId),
    `no exception exists for ${recurrenceId}`
  );

  transport.reset();

  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-major.eml"))
  );
  if (noReply) {
    const { button, noReply } = actionIds.single;
    await clickMenuAction(win, button[partStat], noReply[partStat]);
  } else {
    await clickAction(win, actionIds.single.button[partStat]);
  }

  let exception;
  await TestUtils.waitForCondition(async () => {
    event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item.parentItem;
    exception = event.recurrenceInfo.getExceptionFor(recurrenceId);
    return exception;
  }, "event exception applied");

  await BrowserTestUtils.closeWindow(win);

  if (noReply) {
    Assert.equal(
      transport.sentItems.length,
      0,
      "itip subsystem did not attempt to send a response"
    );
    Assert.equal(transport.sentMsgs.length, 0, "no call was made into the mail subsystem");
  } else {
    await doReplyTest(transport, identity, partStat);
  }

  info("Verifying relevant properties of the exception");

  compareProperties(exception, {
    ...originalProps,
    "startDate.icalString": "20220317T050000Z",
    "endDate.icalString": "20220317T053000Z",
    sequence: "2",
  });

  compareProperties(exception.getAttendees(), {
    "0.id": "mailto:sender@example.com",
    "0.participationStatus": "ACCEPTED",
    "1.id": "mailto:other@example.com",
    "1.participationStatus": "NEEDS-ACTION",
    "2.id": "mailto:receiver@example.com",
    "2.participationStatus": partStat,
  });

  const occurrences = event.recurrenceInfo.getOccurrences(
    cal.createDateTime("19700101"),
    cal.createDateTime("30000101"),
    Infinity
  );
  Assert.equal(occurrences.length, 3, "reccurring event still has 3 occurrences");

  info("Verifying relevant properties of the other occurrences");

  const startDates = ["20220316T110000Z", "20220317T110000Z", "20220318T110000Z"];
  const endDates = ["20220316T113000Z", "20220317T113000Z", "20220318T113000Z"];
  for (const [index, occurrence] of occurrences.entries()) {
    if (occurrence.startDate.icalString == "20220317T050000Z") {
      continue;
    }
    compareProperties(occurrence, {
      ...originalProps,
      "recurrenceId.icalString": startDates[index],
      "startDate.icalString": startDates[index],
      "endDate.icalString": endDates[index],
    });

    const attendees = occurrence.getAttendees();
    compareProperties(attendees, {
      "0.id": "mailto:sender@example.com",
      "0.participationStatus": "ACCEPTED",
      "1.id": "mailto:receiver@example.com",
      "1.participationStatus": originalPartStat,
      "2.id": "mailto:other@example.com",
      "2.participationStatus": "NEEDS-ACTION",
    });
  }

  await calendar.deleteItem(event);
}

/**
 * Test the properties of an event created from a minor or major exception where
 * we have not added the original event and optionally, the attempt to send a
 * reply.
 *
 * @param {ImipBarActionTestConf} conf
 */
async function doExceptionOnlyTest(conf) {
  const { calendar, transport, identity, partStat, noReply, isMajor } = conf;
  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 5, 1)).item;

  // Exceptions are still created as recurring events.
  Assert.ok(event != event.parentItem, "event created is a recurring event");
  const occurrences = event.parentItem.recurrenceInfo.getOccurrences(
    cal.createDateTime("10000101"),
    cal.createDateTime("30000101"),
    Infinity
  );
  Assert.equal(occurrences.length, 1, "parent item only has one occurrence");
  Assert.ok(occurrences[0] == event, "occurrence is the event exception");

  info("Verifying relevant properties of the event");
  compareProperties(event, {
    id: "02e79b96",
    title: isMajor ? event.title : "Exception title",
    "calendar.name": calendar.name,
    "recurrenceId.icalString": "20220317T110000Z",
    "startDate.icalString": isMajor ? "20220317T050000Z" : "20220317T110000Z",
    "endDate.icalString": isMajor ? "20220317T053000Z" : "20220317T113000Z",
    description: isMajor ? event.getProperty("DESCRIPTION") : "Exception description",
    location: isMajor ? event.getProperty("LOCATION") : "Exception location",
    sequence: isMajor ? "2" : "0",
    "x-moz-received-dtstamp": isMajor
      ? event.getProperty("x-moz-received-dtstamp")
      : "20220318T191602Z",
    "organizer.id": "mailto:sender@example.com",
    status: "CONFIRMED",
  });

  // Alarms should be ignored.
  Assert.equal(event.getAlarms().length, 0, "event has no reminders");

  info("Verifying attendee list and participation status");
  const attendees = event.getAttendees();
  compareProperties(attendees, {
    "0.id": "mailto:sender@example.com",
    "0.participationStatus": "ACCEPTED",
    "1.participationStatus": partStat,
    "1.id": "mailto:receiver@example.com",
    "2.id": "mailto:other@example.com",
    "2.participationStatus": "NEEDS-ACTION",
  });

  if (noReply) {
    Assert.equal(
      transport.sentItems.length,
      0,
      "itip subsystem did not attempt to send a response"
    );
    Assert.equal(transport.sentMsgs.length, 0, "no call was made into the mail subsystem");
  } else {
    await doReplyTest(transport, identity, partStat);
  }
  await calendar.deleteItem(event.parentItem);
}

/**
 * Tests the recognition and application of a cancellation to an existing event.
 *
 * @param {ImipBarActionTestConf} conf
 */
async function doCancelTest({ transport, calendar, isRecurring, event, recurrenceId }) {
  transport.reset();

  const eventId = event.id;
  if (isRecurring) {
    // wait for the other occurrences to appear.
    await CalendarTestUtils.monthView.waitForItemAt(window, 3, 5, 1);
    await CalendarTestUtils.monthView.waitForItemAt(window, 3, 6, 1);
  }

  const cancellationPath = isRecurring
    ? "data/cancel-repeat-event.eml"
    : "data/cancel-single-event.eml";

  let cancelMsgFile = new FileUtils.File(getTestFilePath(cancellationPath));
  if (recurrenceId) {
    let srcTxt = await IOUtils.readUTF8(cancelMsgFile.path);
    srcTxt = srcTxt.replaceAll(/RRULE:.+/g, `RECURRENCE-ID:${recurrenceId}`);
    srcTxt = srcTxt.replaceAll(/SEQUENCE:.+/g, "SEQUENCE:3");
    cancelMsgFile = FileTestUtils.getTempFile("cancel-occurrence.eml");
    await IOUtils.writeUTF8(cancelMsgFile.path, srcTxt);
  }

  const win = await openImipMessage(cancelMsgFile);
  const aboutMessage = win.document.getElementById("messageBrowser").contentWindow;
  const deleteButton = aboutMessage.document.getElementById("imipDeleteButton");
  Assert.ok(!deleteButton.hidden, `#${deleteButton.id} button shown`);
  EventUtils.synthesizeMouseAtCenter(deleteButton, {}, aboutMessage);

  if (isRecurring && recurrenceId) {
    // Expects a single occurrence to be cancelled.

    let occurrences;
    await TestUtils.waitForCondition(async () => {
      const { parentItem } = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1))
        .item;
      occurrences = parentItem.recurrenceInfo.getOccurrences(
        cal.createDateTime("19700101"),
        cal.createDateTime("30000101"),
        Infinity
      );
      return occurrences.length == 2;
    }, "occurrence was deleted");

    Assert.ok(
      occurrences.every(occ => occ.recurrenceId && occ.recurrenceId != recurrenceId),
      `occurrence "${recurrenceId}" removed`
    );
    Assert.ok(!!(await calendar.getItem(eventId)), "event was not deleted");
  } else {
    await CalendarTestUtils.monthView.waitForNoItemAt(window, 3, 4, 1);

    if (isRecurring) {
      await CalendarTestUtils.monthView.waitForNoItemAt(window, 3, 5, 1);
      await CalendarTestUtils.monthView.waitForNoItemAt(window, 3, 6, 1);
    }

    await TestUtils.waitForCondition(async () => {
      const result = await calendar.getItem(eventId);
      return !result;
    }, "event was deleted");
  }

  await BrowserTestUtils.closeWindow(win);
  Assert.equal(transport.sentItems.length, 0, "itip subsystem did not attempt to send a response");
  Assert.equal(transport.sentMsgs.length, 0, "no call was made into the mail subsystem");
}

/**
 * Tests processing of cancellations to exceptions to recurring events.
 *
 * @param {ImipBarActionTestConf} conf
 */
async function doCancelExceptionTest(conf) {
  const { partStat, recurrenceId, calendar } = conf;
  const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
  const win = await openImipMessage(invite);
  await clickAction(win, actionIds.recurring.button[partStat]);

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item.parentItem;
  await BrowserTestUtils.closeWindow(win);

  const update = new FileUtils.File(getTestFilePath("data/exception-major.eml"));
  const updateWin = await openImipMessage(update);
  await clickAction(updateWin, actionIds.single.button[partStat]);

  let exception;
  await TestUtils.waitForCondition(async () => {
    event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item.parentItem;
    exception = event.recurrenceInfo.getExceptionFor(cal.createDateTime(recurrenceId));
    return !!exception;
  }, "exception applied");

  await BrowserTestUtils.closeWindow(updateWin);
  await doCancelTest({ ...conf, event });
  await calendar.deleteItem(event);
}
