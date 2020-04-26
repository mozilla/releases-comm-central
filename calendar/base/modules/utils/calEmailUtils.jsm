/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

ChromeUtils.defineModuleGetter(this, "cal", "resource:///modules/calendar/calUtils.jsm");

/*
 * Functions for processing email addresses and sending email
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.email namespace.

const EXPORTED_SYMBOLS = ["calemail"]; /* exported calemail */

var calemail = {
  /**
   * Convenience function to open the compose window pre-filled with the information from the
   * parameters. These parameters are mostly raw header fields, see #createRecipientList function
   * to create a recipient list string.
   *
   * @param {String} aRecipient       The email recipients string.
   * @param {String} aSubject         The email subject.
   * @param {String} aBody            The encoded email body text.
   * @param {nsIMsgIdentity} aIdentity    The email identity to use for sending
   */
  sendTo(aRecipient, aSubject, aBody, aIdentity) {
    let msgParams = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(
      Ci.nsIMsgComposeParams
    );
    let composeFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(
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
   * @param {Function} aFunc       The function to be called for each identity and account
   */
  iterateIdentities(aFunc) {
    for (let account of MailServices.accounts.accounts) {
      for (let identity of account.identities) {
        if (!aFunc(identity, account)) {
          break;
        }
      }
    }
  },

  /**
   * Prepends a mailto: prefix to an email address like string
   *
   * @param  {String} aId     The string to prepend the prefix if not already there
   * @return {String}         The string with prefix
   */
  prependMailTo(aId) {
    return aId.replace(/^(?:mailto:)?(.*)@/i, "mailto:$1@");
  },

  /**
   * Removes an existing mailto: prefix from an attendee id
   *
   * @param  {String} aId     The string to remove the prefix from if any
   * @return {String}         The string without prefix
   */
  removeMailTo(aId) {
    return aId.replace(/^mailto:/i, "");
  },

  /**
   * Provides a string to use in email "to" header for given attendees
   *
   * @param  {calIAttendee[]} aAttendees          Array of calIAttendee's to check
   * @return {String}                             Valid string to use in a 'to' header of an email
   */
  createRecipientList(aAttendees) {
    let cbEmail = function(aVal) {
      let email = calemail.getAttendeeEmail(aVal, true);
      if (!email.length) {
        cal.LOG("Dropping invalid recipient for email transport: " + aVal.toString());
      }
      return email;
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
   * @param  {Boolean} aIncludeCn         Whether or not to return also the CN if available
   * @return {String}                     Valid email string or an empty string in case of error
   */
  getAttendeeEmail(aAttendee, aIncludeCn) {
    // If the recipient id is of type urn, we need to figure out the email address, otherwise
    // we fall back to the attendee id
    let email = aAttendee.id.match(/^urn:/i) ? aAttendee.getProperty("EMAIL") || "" : aAttendee.id;
    // Strip leading "mailto:" if it exists.
    email = email.replace(/^mailto:/i, "");
    // We add the CN if requested and available
    let commonName = aAttendee.commonName;
    if (aIncludeCn && email.length > 0 && commonName && commonName.length > 0) {
      if (commonName.match(/[,;]/)) {
        commonName = '"' + commonName + '"';
      }
      commonName = commonName + " <" + email + ">";
      if (calemail.validateRecipientList(commonName) == commonName) {
        email = commonName;
      }
    }
    return email;
  },

  /**
   * Returns a basically checked recipient list - malformed elements will be removed
   *
   * @param {String} aRecipients      A comma-seperated list of e-mail addresses
   * @return {String}                 A validated comma-seperated list of e-mail addresses
   */
  validateRecipientList(aRecipients) {
    let compFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(
      Ci.nsIMsgCompFields
    );
    // Resolve the list considering also configured common names
    let members = compFields.splitRecipients(aRecipients, false);
    let list = [];
    let prefix = "";
    for (let member of members) {
      if (prefix != "") {
        // the previous member had no email address - this happens if a recipients CN
        // contains a ',' or ';' (splitRecipients(..) behaves wrongly here and produces an
        // additional member with only the first CN part of that recipient and no email
        // address while the next has the second part of the CN and the according email
        // address) - we still need to identify the original delimiter to append it to the
        // prefix
        let memberCnPart = member.match(/(.*) <.*>/);
        if (memberCnPart) {
          let pattern = new RegExp(prefix + "([;,] *)" + memberCnPart[1]);
          let delimiter = aRecipients.match(pattern);
          if (delimiter) {
            prefix = prefix + delimiter[1];
          }
        }
      }
      let parts = (prefix + member).match(/(.*)( <.*>)/);
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
   * @param {calIAttendee} aRefAttendee   The reference attendee object
   * @param {String[]} aAddresses         The list of addresses
   * @return {Boolean}                    True, if there is a match
   */
  attendeeMatchesAddresses(aRefAttendee, aAddresses) {
    let attId = aRefAttendee.id;
    if (!attId.match(/^mailto:/i)) {
      // Looks like its not a normal attendee, possibly urn:uuid:...
      // Try getting the email through the EMAIL property.
      let emailProp = aRefAttendee.getProperty("EMAIL");
      if (emailProp) {
        attId = emailProp;
      }
    }

    attId = attId.toLowerCase().replace(/^mailto:/, "");
    for (let address of aAddresses) {
      if (attId == address.toLowerCase().replace(/^mailto:/, "")) {
        return true;
      }
    }

    return false;
  },
};
