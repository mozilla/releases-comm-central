/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Common functions for the imip-bar tests.
 *
 * Note that these tests are heavily tied to the properties of single-event.eml
 * and repeat-event.eml.
 */

"use strict";

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { CalItipDefaultEmailTransport } = ChromeUtils.import(
  "resource:///modules/CalItipEmailTransport.jsm"
);
var { FileUtils } = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

var { open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

class EmailTransport extends CalItipDefaultEmailTransport {
  sentItems = [];

  sentMsgs = [];

  getMsgSend() {
    let { sentMsgs } = this;
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

/**
 * Opens an iMIP message file and waits for the imip-bar to appear.
 *
 * @param {nsIFile} file
 * @return {Window}
 */
async function openImipMessage(file) {
  let { window: win } = await open_message_from_file(file);
  let imipBar = win.document.getElementById("imip-bar");
  await TestUtils.waitForCondition(() => !imipBar.collapsed, "imip-bar shown");
  return win;
}

/**
 * Clicks on one of the imip-bar action buttons.
 *
 * @param {Window} win
 * @param {string} id
 */
function clickAction(win, id) {
  let action = win.document.getElementById(id);
  Assert.ok(!action.hidden, `"#${id}" shown"`);
  EventUtils.synthesizeMouseAtCenter(action, {}, win);
}

/**
 * Clicks on one of the imip-bar actions from a dropdown menu.
 *
 * @param {Window} win The window the imip message is opened in.
 * @param {string} buttonId The id of the <toolbarbutton> containing the menu.
 * @param {string} actionId The id of the menu item to click.
 */
async function clickMenuAction(win, buttonId, actionId) {
  let actionButton = win.document.getElementById(buttonId);
  Assert.ok(!actionButton.hidden, `"${buttonId}" shown`);

  let actionMenu = actionButton.querySelector("menupopup");
  let menuShown = BrowserTestUtils.waitForEvent(actionMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(actionButton.querySelector("dropmarker"), {}, win);
  await menuShown;
  EventUtils.synthesizeMouseAtCenter(win.document.getElementById(actionId), {}, win);
}

const unpromotedProps = ["location", "description", "sequence", "x-moz-received-dtstamp"];

/**
 * An object where the keys are paths and the values the values they lead to
 * in an object we want to test for correctness.
 * @typedef {Object} Comparable
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
  for (let [key, value] of Object.entries(expected)) {
    if (key.includes(".")) {
      let keys = key.split(".");
      let head = keys[0];
      let tail = keys.slice(1).join(".");
      compareProperties(actual[head], { [tail]: value }, [prefix, head].filter(k => k).join("."));
      continue;
    }

    let path = [prefix, key].filter(k => k).join(".");
    let actualValue = unpromotedProps.includes(key) ? actual.getProperty(key) : actual[key];
    Assert.equal(actualValue, value, `property "${path}" is "${value}"`);
  }
}

/**
 * @typedef {Object} ImipBarActionTestConf
 *
 * @property {calICalendar} calendar  The calendar used for the test.
 * @property {calIItipTranport} transport The transport used for the test.
 * @property {nsIIdentity} identity  The identity expected to be used to
 *   send the reply.
 * @property {string} partStat The participationStatus of the receiving user to
 *   expect.
 * @property {boolean} noReply If true, do not expect an attempt to send a reply.
 */

/**
 * Test the properties of an event created from the imip-bar and optionally, the
 * attempt to send a reply.
 *
 * @param {ImipBarActionTestConf} conf
 * @param {calIEvent|calIEvent[]} item
 */
async function doImipBarActionTest(conf, event) {
  let { calendar, transport, identity, partStat, isRecurring, noReply } = conf;
  let title = isRecurring ? "Repeat Event" : "Single Event";
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
  for (let [index, occurrence] of events.entries()) {
    compareProperties(occurrence, {
      title,
      "calendar.name": calendar.name,
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
    let attendees = occurrence.getAttendees();
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
    Assert.equal(transport.sentMsgs.length, 0, "no call was made into the mail subsystem");
  } else {
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
    let replyItem = transport.sentItems[0].itipItem.getItemList()[0];
    let replyAttendees = replyItem.getAttendees();
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
}
