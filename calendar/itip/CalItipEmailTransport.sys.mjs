/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

/**
 * CalItipEmailTransport is used to send iTIP messages via email. Outside
 * callers should use the static `createInstance()` method instead of this
 * constructor directly.
 */
export class CalItipEmailTransport {
  wrappedJSObject = this;
  QueryInterface = ChromeUtils.generateQI(["calIItipTransport"]);
  classID = Components.ID("{d4d7b59e-c9e0-4a7a-b5e8-5958f85515f0}");

  mSenderAddress = null;

  constructor(defaultAccount, defaultIdentity) {
    this.mDefaultAccount = defaultAccount;
    this.mDefaultIdentity = defaultIdentity;
  }

  get scheme() {
    return "mailto";
  }

  get type() {
    return "email";
  }

  get senderAddress() {
    return this.mSenderAddress;
  }

  set senderAddress(aValue) {
    this.mSenderAddress = aValue;
  }

  /**
   * Creates a new calIItipTransport instance configured with the default
   * account and identity if available. If not available or an error occurs, an
   * instance that cannot send any items out is returned.
   */
  static createInstance() {
    try {
      const defaultAccount = MailServices.accounts.defaultAccount;
      let defaultIdentity = defaultAccount ? defaultAccount.defaultIdentity : null;

      if (!defaultIdentity) {
        // If there isn't a default identity (i.e Local Folders is your
        // default identity, then go ahead and use the first available
        // identity.
        const allIdentities = MailServices.accounts.allIdentities;
        if (allIdentities.length > 0) {
          defaultIdentity = allIdentities[0];
        }
      }

      if (defaultAccount && defaultIdentity) {
        return new CalItipEmailTransport(defaultAccount, defaultIdentity);
      }
    } catch (ex) {
      // Fall through to below.
    }

    cal.LOG("CalITipEmailTransport.createInstance: No XPCOM Mail available.");
    return new CalItipNoEmailTransport();
  }

  _prepareItems(aItipItem, aFromAttendee) {
    const item = aItipItem.getItemList()[0];

    // Get ourselves some default text - when we handle organizer properly
    // We'll need a way to configure the Common Name attribute and we should
    // use it here rather than the email address

    const summary = item.getProperty("SUMMARY") || "";
    let subject = "";
    let body = "";
    switch (aItipItem.responseMethod) {
      case "REQUEST": {
        const usePrefixes = Services.prefs.getBoolPref(
          "calendar.itip.useInvitationSubjectPrefixes",
          true
        );
        if (usePrefixes) {
          const seq = item.getProperty("SEQUENCE");
          const subjectKey = seq && seq > 0 ? "itipRequestUpdatedSubject2" : "itipRequestSubject2";
          subject = cal.l10n.getLtnString(subjectKey, [summary]);
        } else {
          subject = summary;
        }
        body = cal.l10n.getLtnString("itipRequestBody", [
          item.organizer ? item.organizer.toString() : "",
          summary,
        ]);
        break;
      }
      case "CANCEL": {
        subject = cal.l10n.getLtnString("itipCancelSubject2", [summary]);
        body = cal.l10n.getLtnString("itipCancelBody", [
          item.organizer ? item.organizer.toString() : "",
          summary,
        ]);
        break;
      }
      case "DECLINECOUNTER": {
        subject = cal.l10n.getLtnString("itipDeclineCounterSubject", [summary]);
        body = cal.l10n.getLtnString("itipDeclineCounterBody", [
          item.organizer ? item.organizer.toString() : "",
          summary,
        ]);
        break;
      }
      case "REPLY": {
        // Get my participation status
        if (!aFromAttendee && aItipItem.identity) {
          aFromAttendee = item.getAttendeeById(cal.email.prependMailTo(aItipItem.identity));
        }
        if (!aFromAttendee) {
          // should not happen anymore
          return false;
        }

        // work around BUG 351589, the below just removes RSVP:
        aItipItem.setAttendeeStatus(aFromAttendee.id, aFromAttendee.participationStatus);
        const myPartStat = aFromAttendee.participationStatus;
        const name = aFromAttendee.toString();

        // Generate proper body from my participation status
        let subjectKey, bodyKey;
        switch (myPartStat) {
          case "ACCEPTED":
            subjectKey = "itipReplySubjectAccept2";
            bodyKey = "itipReplyBodyAccept";
            break;
          case "TENTATIVE":
            subjectKey = "itipReplySubjectTentative2";
            bodyKey = "itipReplyBodyAccept";
            break;
          case "DECLINED":
            subjectKey = "itipReplySubjectDecline2";
            bodyKey = "itipReplyBodyDecline";
            break;
          default:
            subjectKey = "itipReplySubject2";
            bodyKey = "itipReplyBodyAccept";
            break;
        }
        subject = cal.l10n.getLtnString(subjectKey, [summary]);
        body = cal.l10n.getLtnString(bodyKey, [name]);
        break;
      }
    }

    return {
      subject,
      body,
    };
  }

  _sendXpcomMail(aToList, aSubject, aBody, aItipItem) {
    const { identity, account } = this.getIdentityAndAccount(aItipItem);

    switch (aItipItem.autoResponse) {
      case Ci.calIItipItem.USER: {
        cal.LOG("sendXpcomMail: Found USER autoResponse type.");
        // We still need this as a last resort if a user just deletes or
        //  drags an invitation related event
        let parent = Services.wm.getMostRecentWindow(null);
        if (parent.closed) {
          parent = cal.window.getCalendarWindow();
        }
        const cancelled = Services.prompt.confirmEx(
          parent,
          cal.l10n.getLtnString("imipSendMail.title"),
          cal.l10n.getLtnString("imipSendMail.text"),
          Services.prompt.STD_YES_NO_BUTTONS,
          null,
          null,
          null,
          null,
          {}
        );
        if (cancelled) {
          cal.LOG("sendXpcomMail: Sending of invitation email aborted by user!");
          break;
        } // else go on with auto sending for now
      }
      // falls through intended
      case Ci.calIItipItem.AUTO: {
        // don't show log message in case of falling through
        if (aItipItem.autoResponse == Ci.calIItipItem.AUTO) {
          cal.LOG("sendXpcomMail: Found AUTO autoResponse type.");
        }
        const cbEmail = function (aVal, aInd, aArr) {
          const email = cal.email.getAttendeeEmail(aVal, true);
          if (!email.length) {
            cal.LOG("sendXpcomMail: Invalid recipient for email transport: " + aVal.toString());
          }
          return email;
        };
        const toMap = aToList.map(cbEmail).filter(value => value.length);
        if (toMap.length < aToList.length) {
          // at least one invalid recipient, so we skip sending for this message
          return false;
        }
        const toList = toMap.join(", ");
        const composeUtils = Cc["@mozilla.org/messengercompose/computils;1"].createInstance(
          Ci.nsIMsgCompUtils
        );
        const messageId = composeUtils.msgGenerateMessageId(identity, null);
        const mailFile = this._createTempImipFile(
          toList,
          aSubject,
          aBody,
          aItipItem,
          identity,
          messageId
        );
        if (mailFile) {
          // compose fields for message: from/to etc need to be specified both here and in the file
          const composeFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(
            Ci.nsIMsgCompFields
          );
          composeFields.to = toList;
          const mailfrom = identity.fullName.length
            ? identity.fullName + " <" + identity.email + ">"
            : identity.email;
          composeFields.from =
            cal.email.validateRecipientList(mailfrom) == mailfrom ? mailfrom : identity.email;
          composeFields.replyTo = identity.replyTo;
          composeFields.organization = identity.organization;
          composeFields.messageId = messageId;
          let validRecipients;
          if (identity.doCc) {
            validRecipients = cal.email.validateRecipientList(identity.doCcList);
            if (validRecipients != "") {
              // eslint-disable-next-line id-length
              composeFields.cc = validRecipients;
            }
          }
          if (identity.doBcc) {
            validRecipients = cal.email.validateRecipientList(identity.doBccList);
            if (validRecipients != "") {
              composeFields.bcc = validRecipients;
            }
          }

          // xxx todo: add send/progress UI, maybe recycle
          //           "@mozilla.org/messengercompose/composesendlistener;1"
          //           and/or "chrome://messenger/content/messengercompose/sendProgress.xhtml"
          // i.e. bug 432662
          this.getMsgSend().sendMessageFile(
            identity,
            account.key,
            composeFields,
            mailFile,
            true, // deleteSendFileOnCompletion
            false, // digest_p
            Services.io.offline ? Ci.nsIMsgSend.nsMsgQueueForLater : Ci.nsIMsgSend.nsMsgDeliverNow,
            null, // nsIMsgDBHdr msgToReplace
            null, // nsIMsgSendListener aListener
            null, // nsIMsgStatusFeedback aStatusFeedback
            ""
          ); // password
          return true;
        }
        break;
      }
      case Ci.calIItipItem.NONE: {
        // we shouldn't get here, as we stopped processing in this case
        // earlier in checkAndSend in calItipUtils.jsm
        cal.LOG("sendXpcomMail: Found NONE autoResponse type.");
        break;
      }
      default: {
        // Also of this case should have been taken care at the same place
        throw new Error("sendXpcomMail: Unknown autoResponse type: " + aItipItem.autoResponse);
      }
    }
    return false;
  }

  _createTempImipFile(aToList, aSubject, aBody, aItipItem, aIdentity, aMessageId) {
    try {
      const itemList = aItipItem.getItemList();
      const serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
        Ci.calIIcsSerializer
      );
      serializer.addItems(itemList);
      const methodProp = cal.icsService.createIcalProperty("METHOD");
      methodProp.value = aItipItem.responseMethod;
      serializer.addProperty(methodProp);
      const calText = serializer.serializeToString();
      const utf8CalText = cal.invitation.encodeUTF8(calText);

      // Home-grown mail composition; I'd love to use nsIMimeEmitter, but it's not clear to me whether
      // it can cope with nested attachments,
      // like multipart/alternative with enclosed text/calendar and text/plain.
      let mailText = cal.invitation.getHeaderSection(aMessageId, aIdentity, aToList, aSubject);
      mailText +=
        'Content-type: multipart/mixed; boundary="Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)"\r\n' +
        "\r\n\r\n" +
        "--Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)\r\n" +
        "Content-type: multipart/alternative;\r\n" +
        ' boundary="Boundary_(ID_ryU4ZdJoASiZ+Jo21dCbwA)"\r\n' +
        "\r\n\r\n" +
        "--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCbwA)\r\n" +
        "Content-type: text/plain; charset=UTF-8\r\n" +
        "Content-transfer-encoding: 8BIT\r\n" +
        "\r\n" +
        cal.invitation.encodeUTF8(aBody) +
        "\r\n\r\n\r\n" +
        "--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCbwA)\r\n" +
        "Content-type: text/calendar; method=" +
        aItipItem.responseMethod +
        "; charset=UTF-8\r\n" +
        "Content-transfer-encoding: 8BIT\r\n" +
        "\r\n" +
        utf8CalText +
        "\r\n\r\n" +
        "--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCbwA)--\r\n" +
        "\r\n" +
        "--Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)\r\n" +
        "Content-type: application/ics; name=invite.ics\r\n" +
        "Content-transfer-encoding: 8BIT\r\n" +
        "Content-disposition: attachment; filename=invite.ics\r\n" +
        "\r\n" +
        utf8CalText +
        "\r\n\r\n" +
        "--Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)--\r\n";
      cal.LOG("mail text:\n" + mailText);

      const tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
      tempFile.append("itipTemp");
      tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, parseInt("0600", 8));

      const outputStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
        Ci.nsIFileOutputStream
      );
      // Let's write the file - constants from file-utils.js
      const MODE_WRONLY = 0x02;
      const MODE_CREATE = 0x08;
      const MODE_TRUNCATE = 0x20;
      outputStream.init(
        tempFile,
        MODE_WRONLY | MODE_CREATE | MODE_TRUNCATE,
        parseInt("0600", 8),
        0
      );
      outputStream.write(mailText, mailText.length);
      outputStream.close();

      cal.LOG("_createTempImipFile path: " + tempFile.path);
      return tempFile;
    } catch (exc) {
      cal.ASSERT(false, exc);
      return null;
    }
  }

  /**
   * Provides a new nsIMsgSend instance to use when sending the message. This
   * method can be overridden in child classes for testing or other purposes.
   */
  getMsgSend() {
    return Cc["@mozilla.org/messengercompose/send;1"].createInstance(Ci.nsIMsgSend);
  }

  /**
   * Provides the identity and account to use when sending iTIP emails. By
   * default prefers whatever the item's calendar is configured to use or the
   * default configuration when not set. This method can be overridden to change
   * that behaviour.
   *
   * @param {calIItipItem} aItipItem
   * @returns {object} - An object containing a property for the identity and
   *  one for the account.
   */
  getIdentityAndAccount(aItipItem) {
    let identity;
    let account;
    if (aItipItem.targetCalendar) {
      identity = aItipItem.targetCalendar.getProperty("imip.identity");
      if (identity) {
        identity = identity.QueryInterface(Ci.nsIMsgIdentity);
        account = aItipItem.targetCalendar
          .getProperty("imip.account")
          .QueryInterface(Ci.nsIMsgAccount);
      } else {
        cal.WARN("No email identity configured for calendar " + aItipItem.targetCalendar.name);
      }
    }
    if (!identity) {
      // use some default identity/account:
      identity = this.mDefaultIdentity;
      account = this.mDefaultAccount;
    }
    return { identity, account };
  }

  sendItems(aRecipients, aItipItem, aFromAttendee) {
    cal.LOG("sendItems: Preparing to send an invitation email...");
    const items = this._prepareItems(aItipItem, aFromAttendee);
    if (items === false) {
      return false;
    }

    return this._sendXpcomMail(aRecipients, items.subject, items.body, aItipItem);
  }
}

/**
 * CalItipNoEmailTransport is a transport used in place of CalItipEmaiTransport
 * when we are unable to send messages due to missing configuration.
 */
class CalItipNoEmailTransport extends CalItipEmailTransport {
  wrappedJSObject = this;
  QueryInterface = ChromeUtils.generateQI(["calIItipTransport"]);

  sendItems(aRecipients, aItipItem, aFromAttendee) {
    return false;
  }
}

/**
 * CalItipDefaultEmailTransport always uses the identity and account provided
 * as default instead of the one configured for the calendar.
 */
export class CalItipDefaultEmailTransport extends CalItipEmailTransport {
  getIdentityAndAccount() {
    return { identity: this.mDefaultIdentity, account: this.mDefaultAccount };
  }
}
