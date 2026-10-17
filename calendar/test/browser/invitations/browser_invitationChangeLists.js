/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the change detection of the invitation panel attendee and attachment
 * lists.
 */
"use strict";

var { CalAttachment } = ChromeUtils.importESModule("resource:///modules/CalAttachment.sys.mjs");
var { CalAttendee } = ChromeUtils.importESModule("resource:///modules/CalAttendee.sys.mjs");

const REMOVED = -1;
const UNCHANGED = 0;
const ADDED = 1;
const MODIFIED = 2;

function createAttachment(spec, filename = "file.txt") {
  const attach = new CalAttachment();
  attach.uri = Services.io.newURI(spec);
  attach.setParameter("FILENAME", filename);
  return attach;
}

function createAttendee(email, partStat = "NEEDS-ACTION") {
  const att = new CalAttendee();
  att.id = email;
  att.participationStatus = partStat;
  return att;
}

function getAttachmentChanges(oldValue, newValue) {
  const list = document.createElement("ul", { is: "calendar-invitation-panel-attachment-list" });
  return list.getChanges(oldValue, newValue).map(([attach, status]) => [attach.uri.spec, status]);
}

function getAttendeeChanges(oldValue, newValue) {
  const list = document.createElement("ul", { is: "calendar-invitation-panel-attendee-list" });
  return list.getChanges(oldValue, newValue).map(([att, status]) => [att.id, status]);
}

/**
 * Tests attachment changes are detected and removed attachments are shown at
 * their previous position.
 */
add_task(function testAttachmentChanges() {
  const createBinary = () => {
    const attach = new CalAttachment();
    attach.setParameter("VALUE", "BINARY");
    attach.rawData = "AAAA";
    return attach;
  };

  Assert.deepEqual(
    getAttachmentChanges(
      [
        createAttachment("https://example.com/a"),
        createBinary(),
        createAttachment("https://example.com/b"),
        createAttachment("https://example.com/c"),
      ],
      [
        createAttachment("https://example.com/a"),
        createAttachment("https://example.com/c", "renamed.txt"),
        createAttachment("https://example.com/d"),
      ]
    ),
    [
      ["https://example.com/a", UNCHANGED],
      ["https://example.com/c", MODIFIED],
      ["https://example.com/b", REMOVED],
      ["https://example.com/d", ADDED],
    ],
    "attachment changes should be listed in order"
  );

  Assert.deepEqual(
    getAttachmentChanges(
      [
        createBinary(),
        createBinary(),
        createAttachment("https://example.com/a"),
        createAttachment("https://example.com/b"),
      ],
      [createAttachment("https://example.com/d")]
    ),
    [
      ["https://example.com/d", ADDED],
      ["https://example.com/a", REMOVED],
      ["https://example.com/b", REMOVED],
    ],
    "removed attachments past the end of the new list should be appended"
  );
});

/**
 * Tests attendee changes are detected and removed attendees are shown at
 * their previous position.
 */
add_task(function testAttendeeChanges() {
  Assert.deepEqual(
    getAttendeeChanges(
      [
        createAttendee("mailto:a@example.com"),
        createAttendee("mailto:b@example.com"),
        createAttendee("mailto:c@example.com"),
      ],
      [
        createAttendee("mailto:a@example.com"),
        createAttendee("mailto:c@example.com", "ACCEPTED"),
        createAttendee("mailto:d@example.com"),
      ]
    ),
    [
      ["mailto:a@example.com", UNCHANGED],
      ["mailto:b@example.com", REMOVED],
      ["mailto:c@example.com", MODIFIED],
      ["mailto:d@example.com", ADDED],
    ],
    "attendee changes should be listed in order"
  );

  Assert.deepEqual(
    getAttendeeChanges(
      [
        createAttendee("mailto:a@example.com"),
        createAttendee("mailto:b@example.com"),
        createAttendee("mailto:c@example.com"),
      ],
      [createAttendee("mailto:d@example.com")]
    ),
    [
      ["mailto:a@example.com", REMOVED],
      ["mailto:b@example.com", REMOVED],
      ["mailto:c@example.com", REMOVED],
      ["mailto:d@example.com", ADDED],
    ],
    "removed attendees should keep their position before added ones"
  );
});

/**
 * Counts reads of a getter on the given objects.
 *
 * @param {object[]} objects
 * @param {string} name - Name of the getter on the objects' prototype.
 * @returns {{ reads: number }}
 */
function countReads(objects, name) {
  const counter = { reads: 0 };
  for (const obj of objects) {
    const { get } = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(obj), name);
    Object.defineProperty(obj, name, {
      get() {
        counter.reads++;
        return get.call(this);
      },
    });
  }
  return counter;
}

/**
 * Tests that comparing disjoint lists includes every entry, with a number of
 * comparisons that grows linearly with the length of the lists.
 */
add_task(function testDisjointListsLinear() {
  const count = 200;
  const range = prefix => Array.from({ length: count }, (_, i) => `${prefix}${i}`);

  const oldAttachments = range("https://example.com/old/").map(spec => createAttachment(spec));
  const newAttachments = range("https://example.com/new/").map(spec => createAttachment(spec));
  const uriCounter = countReads([...oldAttachments, ...newAttachments], "uri");
  const attachmentList = document.createElement("ul", {
    is: "calendar-invitation-panel-attachment-list",
  });
  const attachmentChanges = attachmentList.getChanges(oldAttachments, newAttachments);
  Assert.lessOrEqual(
    uriCounter.reads,
    10 * count,
    "attachment URIs should be read a linear number of times"
  );
  Assert.deepEqual(
    attachmentChanges.map(([attach, status]) => [attach.uri.spec, status]),
    [
      ...range("https://example.com/old/").map(spec => [spec, REMOVED]),
      ...range("https://example.com/new/").map(spec => [spec, ADDED]),
    ],
    "all attachments should be listed as removed or added"
  );

  const oldAttendees = range("mailto:old").map(email => createAttendee(`${email}@example.com`));
  const newAttendees = range("mailto:new").map(email => createAttendee(`${email}@example.com`));
  const idCounter = countReads([...oldAttendees, ...newAttendees], "id");
  const attendeeList = document.createElement("ul", {
    is: "calendar-invitation-panel-attendee-list",
  });
  const attendeeChanges = attendeeList.getChanges(oldAttendees, newAttendees);
  Assert.lessOrEqual(
    idCounter.reads,
    10 * count,
    "attendee ids should be read a linear number of times"
  );
  Assert.deepEqual(
    attendeeChanges.map(([att, status]) => [att.id, status]),
    [
      ...range("mailto:old").map(email => [`${email}@example.com`, REMOVED]),
      ...range("mailto:new").map(email => [`${email}@example.com`, ADDED]),
    ],
    "all attendees should be listed as removed or added"
  );
});
