/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A recipient to a `GraphMessage`. Note that the structure of this class does
 * *not* match the structure of the `recipient` type from the Graph API.
 */
export class EmailAddress {
  /**
   * The recipient's name.
   *
   * @type {string}
   */
  name;

  /**
   * The recipient's email address.
   *
   * @type {string}
   */
  address;

  constructor(name, address) {
    this.name = name;
    this.address = address;
  }

  toJSON() {
    return {
      name: this.name,
      address: this.address,
    };
  }
}

/**
 * A message saved on a Graph server. Note that the structure of this class does
 * *not* match the structure of the `message` type from the Graph API, and is
 * not the type typically used to store actual messages for retrieval from the
 * server (that would be the `MockServer`'s `ItemInfo` type).
 */
export class GraphMessage {
  /**
   * The unique identifier for this message.
   *
   * @type {string}
   */
  id;

  /**
   * The message's Bcc recipients.
   *
   * @type {Array<EmailAddress>}
   */
  bccRecipients = [];

  /**
   * Whether the user has requested DSN (Delivery Status Notification) for this
   * message.
   *
   * @type {boolean}
   */
  dsnRequested = false;

  /**
   * The raw RFC822 content for this message.
   *
   * @type {string}
   */
  content;

  constructor(id, bccRecipients, dsnRequested, content) {
    this.id = id;
    this.bccRecipients = bccRecipients;
    this.dsnRequested = dsnRequested;
    this.content = content;
  }
}

/**
 * Data representation of a Graph API calendar attendee.
 *
 * See https://learn.microsoft.com/en-us/graph/api/resources/attendee?view=graph-rest-1.0
 */
export class GraphCalendarAttendee {
  /**
   * Identity information for the attendee.
   *
   * @type {EmailAddress}
   */
  emailAddress;
  /**
   * Acceptance status.
   *
   * @type {string}
   */
  status;
  /**
   * Participant type.
   *
   * @type {string}
   */
  type;

  /**
   *
   * @param {EmailAddress} emailAddress
   * @param {string} status
   * @param {string} type
   */
  constructor(emailAddress, status, type) {
    this.emailAddress = emailAddress;
    this.status = status;
    this.type = type;
  }

  toJSON() {
    return {
      emailAddress: this.emailAddress.toJSON(),
      status: { response: this.status, time: "0001-01-01T00:00:00Z" },
      type: this.type,
    };
  }
}

export class GraphCalendarEvent {
  /**
   * @param {string} id - Graph ID (same space as message IDs)
   * @param {string} subject
   * @param {string} startDateTime
   * @param {string} endDateTime
   * @param {GraphCalendarAttendee[]} attendees
   * @param {object} [properties={}] - Additional Graph event fields.
   */
  constructor(
    id,
    subject,
    startDateTime,
    endDateTime,
    attendees = [],
    properties = {}
  ) {
    this.id = id;
    this.subject = subject;
    this.startDateTime = startDateTime;
    this.endDateTime = endDateTime;
    this.attendees = attendees;
    this.properties = properties;
  }

  toJSON() {
    return {
      "@odata.type": "#microsoft.graph.event",
      id: this.id,
      subject: this.subject,
      start: {
        dateTime: this.startDateTime,
        timeZone: "UTC",
      },
      end: {
        dateTime: this.endDateTime,
        timeZone: "UTC",
      },
      attendees: this.attendees.map(x => x.toJSON()),
      ...this.properties,
    };
  }
}

/**
 * A simple class to hold the data associated with an HTTP response.
 */
export class HttpResponseData {
  constructor(
    statusCode,
    statusMessage,
    bodyContent = "",
    httpVersion = "1.1"
  ) {
    this.httpVersion = httpVersion;
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.bodyContent = bodyContent;
  }
}
