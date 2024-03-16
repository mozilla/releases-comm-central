/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Functions for processing email addresses and sending email
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.email namespace.

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});

export var email = {
  /**
   * Convenience function to open the compose window pre-filled with the information from the
   * parameters. These parameters are mostly raw header fields, see #createRecipientList function
   * to create a recipient list string.
   *
   * @param {string} aRecipient - The email recipients string.
   * @param {string} aSubject - The email subject.
   * @param {string} aBody - The encoded email body text.
   * @param {nsIMsgIdentity} aIdentity - The email identity to use for sending
   */
  sendTo(aRecipient, aSubject, aBody, aIdentity) {
    const msgParams = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(
      Ci.nsIMsgComposeParams
    );
    const composeFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(
      Ci.nsIMsgCompFields
    );

    composeFields.to = aRecipient;
    composeFields.subject = aSubject;
    composeFields.body = aBody;

    msgParams.type = Ci.nsIMsgCompType.New;
    msgParams.format = Ci.nsIMsgCompFormat.Default;
    msgParams.composeFields = composeFields;
    msgParams.identity = aIdentity;

    MailServices.compose.OpenComposeWindowWithParams(null, msgParams);
  },

  /**
   * Iterates all email identities and calls the passed function with identity and account.
   * If the called function returns false, iteration is stopped.
   *
   * @param {Function} aFunc - The function to be called for each identity and account
   */
  iterateIdentities(aFunc) {
    for (const account of MailServices.accounts.accounts) {
      for (const identity of account.identities) {
        if (!aFunc(identity, account)) {
          break;
        }
      }
    }
  },

  /**
   * Prepends a mailto: prefix to an email address like string
   *
   * @param  {string} aId     The string to prepend the prefix if not already there
   * @returns {string} The string with prefix
   */
  prependMailTo(aId) {
    return aId.replace(/^(?:mailto:)?(.*)@/i, "mailto:$1@");
  },

  /**
   * Removes an existing mailto: prefix from an attendee id
   *
   * @param  {string} aId     The string to remove the prefix from if any
   * @returns {string} The string without prefix
   */
  removeMailTo(aId) {
    return aId.replace(/^mailto:/i, "");
  },

  /**
   * Provides a string to use in email "to" header for given attendees
   *
   * @param  {calIAttendee[]} aAttendees          Array of calIAttendee's to check
   * @returns {string} Valid string to use in a 'to' header of an email
   */
  createRecipientList(aAttendees) {
    const cbEmail = function (aVal) {
      const attendeeEmail = email.getAttendeeEmail(aVal, true);
      if (!attendeeEmail.length) {
        lazy.cal.LOG("Dropping invalid recipient for email transport: " + aVal.toString());
      }
      return attendeeEmail;
    };
    return aAttendees
      .map(cbEmail)
      .filter(aVal => aVal.length > 0)
      .join(", ");
  },

  /**
   * Returns a wellformed email string like 'attendee@example.net',
   * 'Common Name <attendee@example.net>' or '"Name, Common" <attendee@example.net>'
   *
   * @param  {calIAttendee} aAttendee     The attendee to check
   * @param  {boolean} aIncludeCn         Whether or not to return also the CN if available
   * @returns {string} Valid email string or an empty string in case of error
   */
  getAttendeeEmail(aAttendee, aIncludeCn) {
    // If the recipient id is of type urn, we need to figure out the email address, otherwise
    // we fall back to the attendee id
    let attendeeEmail = aAttendee.id.match(/^urn:/i)
      ? aAttendee.getProperty("EMAIL") || ""
      : aAttendee.id;
    // Strip leading "mailto:" if it exists.
    attendeeEmail = attendeeEmail.replace(/^mailto:/i, "");
    // We add the CN if requested and available
    let commonName = aAttendee.commonName;
    if (aIncludeCn && attendeeEmail.length > 0 && commonName && commonName.length > 0) {
      if (commonName.match(/[,;]/)) {
        commonName = '"' + commonName + '"';
      }
      commonName = commonName + " <" + attendeeEmail + ">";
      if (email.validateRecipientList(commonName) == commonName) {
        attendeeEmail = commonName;
      }
    }
    return attendeeEmail;
  },

  /**
   * Returns a basically checked recipient list - malformed elements will be removed
   *
   * @param {string} aRecipients - A comma-seperated list of e-mail addresses
   * @returns {string} A validated comma-seperated list of e-mail addresses
   */
  validateRecipientList(aRecipients) {
    const compFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(
      Ci.nsIMsgCompFields
    );
    // Resolve the list considering also configured common names
    const members = compFields.splitRecipients(aRecipients, false);
    const list = [];
    let prefix = "";
    for (const member of members) {
      if (prefix != "") {
        // the previous member had no email address - this happens if a recipients CN
        // contains a ',' or ';' (splitRecipients(..) behaves wrongly here and produces an
        // additional member with only the first CN part of that recipient and no email
        // address while the next has the second part of the CN and the according email
        // address) - we still need to identify the original delimiter to append it to the
        // prefix
        const memberCnPart = member.match(/(.*) <.*>/);
        if (memberCnPart) {
          const pattern = new RegExp(prefix + "([;,] *)" + memberCnPart[1]);
          const delimiter = aRecipients.match(pattern);
          if (delimiter) {
            prefix = prefix + delimiter[1];
          }
        }
      }
      const parts = (prefix + member).match(/(.*)( <.*>)/);
      if (parts) {
        if (parts[2] == " <>") {
          // CN but no email address - we keep the CN part to prefix the next member's CN
          prefix = parts[1];
        } else {
          // CN with email address
          let commonName = parts[1].trim();
          // in case of any special characters in the CN string, we make sure to enclose
          // it with dquotes - simple spaces don't require dquotes
          if (commonName.match(/[-[\]{}()*+?.,;\\^$|#\f\n\r\t\v]/)) {
            commonName = '"' + commonName.replace(/\\"|"/, "").trim() + '"';
          }
          list.push(commonName + parts[2]);
          prefix = "";
        }
      } else if (member.length) {
        // email address only
        list.push(member);
        prefix = "";
      }
    }
    return list.join(", ");
  },

  /**
   * Check if the attendee object matches one of the addresses in the list. This
   * is useful to determine whether the current user acts as a delegate.
   *
   * @param {calIAttendee} aRefAttendee - The reference attendee object
   * @param {string[]} aAddresses - The list of addresses
   * @returns {boolean} True, if there is a match
   */
  attendeeMatchesAddresses(aRefAttendee, aAddresses) {
    let attId = aRefAttendee.id;
    if (!attId.match(/^mailto:/i)) {
      // Looks like its not a normal attendee, possibly urn:uuid:...
      // Try getting the email through the EMAIL property.
      const emailProp = aRefAttendee.getProperty("EMAIL");
      if (emailProp) {
        attId = emailProp;
      }
    }

    attId = attId.toLowerCase().replace(/^mailto:/, "");
    for (const address of aAddresses) {
      if (attId == address.toLowerCase().replace(/^mailto:/, "")) {
        return true;
      }
    }

    return false;
  },
};
