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
    case NS_MSG_UNABLE_TO_SAVE_TEMPLATE:
      return "unableToSaveTemplate";
    case NS_MSG_UNABLE_TO_SAVE_DRAFT:
      return "unableToSaveDraft";
    case NS_MSG_COULDNT_OPEN_FCC_FOLDER:
      return "couldntOpenFccFolder";
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
    case NS_ERROR_BUT_DONT_SHOW_ALERT:
      return "dontShowAlert";
    case NS_MSG_ERROR_ATTACHING_FILE:
      return "errorAttachingFile";
    case NS_ERROR_SENDING_RCPT_COMMAND:
      return "errorSendingRcptCommand";
    case NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS:
      return "startTlsFailed";
    case NS_ERROR_SMTP_TEMP_SIZE_EXCEEDED:
      return "smtpTooManyRecipients";
    case NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_2:
      return "smtpPermSizeExceeded2";
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
    default:
      return "sendFailed";
  }
#ifdef __GNUC__
#  pragma GCC diagnostic pop
#endif
}
