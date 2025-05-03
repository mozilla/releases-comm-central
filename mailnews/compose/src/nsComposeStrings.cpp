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
    case NS_MSG_UNABLE_TO_SAVE_DRAFT:
      return "unableToSaveDraft";
    case NS_MSG_COULDNT_OPEN_FCC_FOLDER:
      return "couldntOpenFccFolder";
    case NS_ERROR_SENDING_FROM_COMMAND:
      return "errorSendingFromCommand";
    case NS_ERROR_SENDING_DATA_COMMAND:
      return "errorSendingDataCommand";
    case NS_ERROR_SENDING_MESSAGE:
      return "errorSendingMessage";
    case NS_MSG_UNABLE_TO_SEND_LATER:
      return "unableToSendLater";
    case NS_ERROR_BUT_DONT_SHOW_ALERT:
      return "dontShowAlert";
    case NS_MSG_ERROR_ATTACHING_FILE:
      return "errorAttachingFile";
    case NS_ERROR_SMTP_AUTH_GSSAPI:
      return "smtpAuthGssapi";
    case NS_ERROR_SMTP_AUTH_MECH_NOT_SUPPORTED:
      return "smtpAuthMechNotSupported";
    default:
      return "sendFailed";
  }
#ifdef __GNUC__
#  pragma GCC diagnostic pop
#endif
}
