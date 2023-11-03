/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsComposeStrings.h"

const char* errorStringNameForErrorCode(nsresult aCode) {
#ifdef __GNUC__
// Temporary workaround until bug 783526 is fixed.
#  pragma GCC diagnostic push
#  pragma GCC diagnostic ignored "-Wswitch"
#endif
  switch (aCode) {
    case NS_MSG_UNABLE_TO_OPEN_FILE:
      return "unableToOpenFile";
    case NS_MSG_UNABLE_TO_OPEN_TMP_FILE:
      return "unableToOpenTmpFile";
    case NS_MSG_UNABLE_TO_SAVE_TEMPLATE:
      return "unableToSaveTemplate";
    case NS_MSG_UNABLE_TO_SAVE_DRAFT:
      return "unableToSaveDraft";
    case NS_MSG_COULDNT_OPEN_FCC_FOLDER:
      return "couldntOpenFccFolder";
    case NS_MSG_NO_SENDER:
      return "noSender";
    case NS_MSG_NO_RECIPIENTS:
      return "noRecipients";
    case NS_MSG_ERROR_WRITING_FILE:
      return "errorWritingFile";
    case NS_ERROR_SENDING_FROM_COMMAND:
      return "errorSendingFromCommand";
    case NS_ERROR_SENDING_DATA_COMMAND:
      return "errorSendingDataCommand";
    case NS_ERROR_SENDING_MESSAGE:
      return "errorSendingMessage";
    case NS_ERROR_POST_FAILED:
      return "postFailed";
    case NS_ERROR_SMTP_SERVER_ERROR:
      return "smtpServerError";
    case NS_MSG_UNABLE_TO_SEND_LATER:
      return "unableToSendLater";
    case NS_ERROR_COMMUNICATIONS_ERROR:
      return "communicationsError";
    case NS_ERROR_BUT_DONT_SHOW_ALERT:
      return "dontShowAlert";
    case NS_ERROR_COULD_NOT_GET_USERS_MAIL_ADDRESS:
      return "couldNotGetUsersMailAddress2";
    case NS_ERROR_COULD_NOT_GET_SENDERS_IDENTITY:
      return "couldNotGetSendersIdentity";
    case NS_ERROR_MIME_MPART_ATTACHMENT_ERROR:
      return "mimeMpartAttachmentError";
    case NS_ERROR_NNTP_NO_CROSS_POSTING:
      return "nntpNoCrossPosting";
    case NS_MSG_ERROR_READING_FILE:
      return "errorReadingFile";
    case NS_MSG_ERROR_ATTACHING_FILE:
      return "errorAttachingFile";
    case NS_ERROR_SMTP_GREETING:
      return "incorrectSmtpGreeting";
    case NS_ERROR_SENDING_RCPT_COMMAND:
      return "errorSendingRcptCommand";
    case NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS:
      return "startTlsFailed";
    case NS_ERROR_SMTP_PASSWORD_UNDEFINED:
      return "smtpPasswordUndefined";
    case NS_ERROR_SMTP_SEND_NOT_ALLOWED:
      return "smtpSendNotAllowed";
    case NS_ERROR_SMTP_TEMP_SIZE_EXCEEDED:
      return "smtpTooManyRecipients";
    case NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_2:
      return "smtpPermSizeExceeded2";
    case NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_SERVER:
      return "smtpSendFailedUnknownServer";
    case NS_ERROR_SMTP_SEND_FAILED_REFUSED:
      return "smtpSendRequestRefused";
    case NS_ERROR_SMTP_SEND_FAILED_INTERRUPTED:
      return "smtpSendInterrupted";
    case NS_ERROR_SMTP_SEND_FAILED_TIMEOUT:
      return "smtpSendTimeout";
    case NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_REASON:
      return "smtpSendFailedUnknownReason";
    case NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_NO_SSL:
      return "smtpHintAuthEncryptToPlainNoSsl";
    case NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_SSL:
      return "smtpHintAuthEncryptToPlainSsl";
    case NS_ERROR_SMTP_AUTH_CHANGE_PLAIN_TO_ENCRYPT:
      return "smtpHintAuthPlainToEncrypt";
    case NS_ERROR_SMTP_AUTH_FAILURE:
      return "smtpAuthFailure";
    case NS_ERROR_SMTP_AUTH_GSSAPI:
      return "smtpAuthGssapi";
    case NS_ERROR_SMTP_AUTH_MECH_NOT_SUPPORTED:
      return "smtpAuthMechNotSupported";
    case NS_ERROR_ILLEGAL_LOCALPART:
      return "errorIllegalLocalPart2";
    case NS_ERROR_CLIENTID:
      return "smtpClientid";
    case NS_ERROR_CLIENTID_PERMISSION:
      return "smtpClientidPermission";
    default:
      return "sendFailed";
  }
#ifdef __GNUC__
#  pragma GCC diagnostic pop
#endif
}
