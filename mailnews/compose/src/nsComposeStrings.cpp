/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsComposeStrings.h"

const char16_t* errorStringNameForErrorCode(nsresult aCode)
{
#ifdef __GNUC__
// Temporary workaroung until bug 783526 is fixed.
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wswitch"
#endif
  switch(aCode)
  {
    case NS_MSG_UNABLE_TO_OPEN_FILE:
      return u"unableToOpenFile";
    case NS_MSG_UNABLE_TO_OPEN_TMP_FILE:
      return u"unableToOpenTmpFile";
    case NS_MSG_UNABLE_TO_SAVE_TEMPLATE:
      return u"unableToSaveTemplate";
    case NS_MSG_UNABLE_TO_SAVE_DRAFT:
      return u"unableToSaveDraft";
    case NS_MSG_COULDNT_OPEN_FCC_FOLDER:
      return u"couldntOpenFccFolder";
    case NS_MSG_NO_SENDER:
      return u"noSender";
    case NS_MSG_NO_RECIPIENTS:
      return u"noRecipients";
    case NS_MSG_ERROR_WRITING_FILE:
      return u"errorWritingFile";
    case NS_ERROR_SENDING_FROM_COMMAND:
      return u"errorSendingFromCommand";
    case NS_ERROR_SENDING_DATA_COMMAND:
      return u"errorSendingDataCommand";
    case NS_ERROR_SENDING_MESSAGE:
      return u"errorSendingMessage";
    case NS_ERROR_POST_FAILED:
      return u"postFailed";
    case NS_ERROR_QUEUED_DELIVERY_FAILED:
      return u"errorQueuedDeliveryFailed";
    case NS_ERROR_SEND_FAILED:
      return u"sendFailed";
    case NS_ERROR_SMTP_SERVER_ERROR:
      return u"smtpServerError";
    case NS_MSG_UNABLE_TO_SEND_LATER:
      return u"unableToSendLater";
    case NS_ERROR_COMMUNICATIONS_ERROR:
      return u"communicationsError";
    case NS_ERROR_BUT_DONT_SHOW_ALERT:
      return u"dontShowAlert";
    case NS_ERROR_TCP_READ_ERROR:
      return u"tcpReadError";
    case NS_ERROR_COULD_NOT_GET_USERS_MAIL_ADDRESS:
      return u"couldNotGetUsersMailAddress";
    case NS_ERROR_MIME_MPART_ATTACHMENT_ERROR:
      return u"mimeMpartAttachmentError";
    case NS_MSG_FAILED_COPY_OPERATION:
      return u"failedCopyOperation";
    case NS_ERROR_NNTP_NO_CROSS_POSTING:
      return u"nntpNoCrossPosting";
    case NS_MSG_CANCELLING:
      return u"msgCancelling";
    case NS_ERROR_SEND_FAILED_BUT_NNTP_OK:
      return u"sendFailedButNntpOk";
    case NS_MSG_ERROR_READING_FILE:
      return u"errorReadingFile";
    case NS_MSG_ERROR_ATTACHING_FILE:
      return u"errorAttachingFile";
    case NS_ERROR_SMTP_GREETING:
      return u"incorrectSmtpGreeting";
    case NS_ERROR_SENDING_RCPT_COMMAND:
      return u"errorSendingRcptCommand";
    case NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS:
      return u"startTlsFailed";
    case NS_ERROR_SMTP_PASSWORD_UNDEFINED:
      return u"smtpPasswordUndefined";
    case NS_ERROR_SMTP_TEMP_SIZE_EXCEEDED:
      return u"smtpTempSizeExceeded";
    case NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_1:
      return u"smtpPermSizeExceeded1";
    case NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_2:
      return u"smtpPermSizeExceeded2";
    case NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_SERVER:
      return u"smtpSendFailedUnknownServer";
    case NS_ERROR_SMTP_SEND_FAILED_REFUSED:
      return u"smtpSendRequestRefused";
    case NS_ERROR_SMTP_SEND_FAILED_INTERRUPTED:
      return u"smtpSendInterrupted";
    case NS_ERROR_SMTP_SEND_FAILED_TIMEOUT:
      return u"smtpSendTimeout";
    case NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_REASON:
      return u"smtpSendFailedUnknownReason";
    case NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_NO_SSL:
      return u"smtpHintAuthEncryptToPlainNoSsl";
    case NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_SSL:
      return u"smtpHintAuthEncryptToPlainSsl";
    case NS_ERROR_SMTP_AUTH_CHANGE_PLAIN_TO_ENCRYPT:
      return u"smtpHintAuthPlainToEncrypt";
    case NS_ERROR_SMTP_AUTH_FAILURE:
      return u"smtpAuthFailure";
    case NS_ERROR_SMTP_AUTH_GSSAPI:
      return u"smtpAuthGssapi";
    case NS_ERROR_SMTP_AUTH_MECH_NOT_SUPPORTED:
      return u"smtpAuthMechNotSupported";
    case NS_ERROR_SMTP_AUTH_NOT_SUPPORTED:
      return u"smtpAuthenticationNotSupported";
    case NS_ERROR_ILLEGAL_LOCALPART:
      return u"illegalLocalPart";
    default:
      return u"sendFailed";
  }
#ifdef __GNUC__
#pragma GCC diagnostic pop
#endif
}
