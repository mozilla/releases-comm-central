/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsComposeStrings.h"

const char16_t* errorStringNameForErrorCode(nsresult aCode)
{
  switch(aCode)
  {
    case NS_MSG_UNABLE_TO_OPEN_FILE:
      return MOZ_UTF16("unableToOpenFile");
    case NS_MSG_UNABLE_TO_OPEN_TMP_FILE:
      return MOZ_UTF16("unableToOpenTmpFile");
    case NS_MSG_UNABLE_TO_SAVE_TEMPLATE:
      return MOZ_UTF16("unableToSaveTemplate");
    case NS_MSG_UNABLE_TO_SAVE_DRAFT:
      return MOZ_UTF16("unableToSaveDraft");
    case NS_MSG_COULDNT_OPEN_FCC_FOLDER:
      return MOZ_UTF16("couldntOpenFccFolder");
    case NS_MSG_NO_SENDER:
      return MOZ_UTF16("noSender");
    case NS_MSG_NO_RECIPIENTS:
      return MOZ_UTF16("noRecipients");
    case NS_MSG_ERROR_WRITING_FILE:
      return MOZ_UTF16("errorWritingFile");
    case NS_ERROR_SENDING_FROM_COMMAND:
      return MOZ_UTF16("errorSendingFromCommand");
    case NS_ERROR_SENDING_DATA_COMMAND:
      return MOZ_UTF16("errorSendingDataCommand");
    case NS_ERROR_SENDING_MESSAGE:
      return MOZ_UTF16("errorSendingMessage");
    case NS_ERROR_POST_FAILED:
      return MOZ_UTF16("postFailed");
    case NS_ERROR_QUEUED_DELIVERY_FAILED:
      return MOZ_UTF16("errorQueuedDeliveryFailed");
    case NS_ERROR_SEND_FAILED:
      return MOZ_UTF16("sendFailed");
    case NS_ERROR_SMTP_SERVER_ERROR:
      return MOZ_UTF16("smtpServerError");
    case NS_MSG_UNABLE_TO_SEND_LATER:
      return MOZ_UTF16("unableToSendLater");
    case NS_ERROR_COMMUNICATIONS_ERROR:
      return MOZ_UTF16("communicationsError");
    case NS_ERROR_BUT_DONT_SHOW_ALERT:
      return MOZ_UTF16("dontShowAlert");
    case NS_ERROR_TCP_READ_ERROR:
      return MOZ_UTF16("tcpReadError");
    case NS_ERROR_COULD_NOT_GET_USERS_MAIL_ADDRESS:
      return MOZ_UTF16("couldNotGetUsersMailAddress");
    case NS_ERROR_MIME_MPART_ATTACHMENT_ERROR:
      return MOZ_UTF16("mimeMpartAttachmentError");
    case NS_MSG_FAILED_COPY_OPERATION:
      return MOZ_UTF16("failedCopyOperation");
    case NS_ERROR_NNTP_NO_CROSS_POSTING:
      return MOZ_UTF16("nntpNoCrossPosting");
    case NS_MSG_CANCELLING:
      return MOZ_UTF16("msgCancelling");
    case NS_ERROR_SEND_FAILED_BUT_NNTP_OK:
      return MOZ_UTF16("sendFailedButNntpOk");
    case NS_MSG_ERROR_READING_FILE:
      return MOZ_UTF16("errorReadingFile");
    case NS_MSG_ERROR_ATTACHING_FILE:
      return MOZ_UTF16("errorAttachingFile");
    case NS_ERROR_SMTP_GREETING:
      return MOZ_UTF16("incorrectSmtpGreeting");
    case NS_ERROR_SENDING_RCPT_COMMAND:
      return MOZ_UTF16("errorSendingRcptCommand");
    case NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS:
      return MOZ_UTF16("startTlsFailed");
    case NS_ERROR_SMTP_PASSWORD_UNDEFINED:
      return MOZ_UTF16("smtpPasswordUndefined");
    case NS_ERROR_SMTP_TEMP_SIZE_EXCEEDED:
      return MOZ_UTF16("smtpTempSizeExceeded");
    case NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_1:
      return MOZ_UTF16("smtpPermSizeExceeded1");
    case NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_2:
      return MOZ_UTF16("smtpPermSizeExceeded2");
    case NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_SERVER:
      return MOZ_UTF16("smtpSendFailedUnknownServer");
    case NS_ERROR_SMTP_SEND_FAILED_REFUSED:
      return MOZ_UTF16("smtpSendRequestRefused");
    case NS_ERROR_SMTP_SEND_FAILED_INTERRUPTED:
      return MOZ_UTF16("smtpSendInterrupted");
    case NS_ERROR_SMTP_SEND_FAILED_TIMEOUT:
      return MOZ_UTF16("smtpSendTimeout");
    case NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_REASON:
      return MOZ_UTF16("smtpSendFailedUnknownReason");
    case NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_NO_SSL:
      return MOZ_UTF16("smtpHintAuthEncryptToPlainNoSsl");
    case NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_SSL:
      return MOZ_UTF16("smtpHintAuthEncryptToPlainSsl");
    case NS_ERROR_SMTP_AUTH_CHANGE_PLAIN_TO_ENCRYPT:
      return MOZ_UTF16("smtpHintAuthPlainToEncrypt");
    case NS_ERROR_SMTP_AUTH_FAILURE:
      return MOZ_UTF16("smtpAuthFailure");
    case NS_ERROR_SMTP_AUTH_GSSAPI:
      return MOZ_UTF16("smtpAuthGssapi");
    case NS_ERROR_SMTP_AUTH_MECH_NOT_SUPPORTED:
      return MOZ_UTF16("smtpAuthMechNotSupported");
    case NS_ERROR_SMTP_AUTH_NOT_SUPPORTED:
      return MOZ_UTF16("smtpAuthenticationNotSupported");
    case NS_ERROR_ILLEGAL_LOCALPART:
      return MOZ_UTF16("illegalLocalPart");
    default:
      return MOZ_UTF16("sendFailed");
  }
}
