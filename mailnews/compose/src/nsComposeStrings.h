/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// clang-format off
/**
  String Ids used by mailnews\compose
  To Do: Convert the callers to use names instead of ids and then make this file obsolete.
 */

#ifndef _nsComposeStrings_H__
#define _nsComposeStrings_H__

#include "msgCore.h"

#define NS_MSG_UNABLE_TO_SAVE_DRAFT                 NS_MSG_GENERATE_FAILURE(12503)
#define NS_MSG_COULDNT_OPEN_FCC_FOLDER              NS_MSG_GENERATE_FAILURE(12506)
#define NS_ERROR_SENDING_FROM_COMMAND               NS_MSG_GENERATE_FAILURE(12514)
#define NS_ERROR_SENDING_DATA_COMMAND               NS_MSG_GENERATE_FAILURE(12516)
#define NS_ERROR_SENDING_MESSAGE                    NS_MSG_GENERATE_FAILURE(12517)
#define NS_MSG_UNABLE_TO_SEND_LATER                 NS_MSG_GENERATE_FAILURE(12525)
#define NS_ERROR_BUT_DONT_SHOW_ALERT                NS_MSG_GENERATE_FAILURE(12527)

#define NS_MSG_ERROR_ATTACHING_FILE                 NS_MSG_GENERATE_FAILURE(12570)

#define NS_ERROR_SMTP_AUTH_FAILURE                  NS_MSG_GENERATE_FAILURE(12597)
#define NS_ERROR_SMTP_AUTH_GSSAPI                   NS_MSG_GENERATE_FAILURE(12598)
#define NS_ERROR_SMTP_AUTH_MECH_NOT_SUPPORTED       NS_MSG_GENERATE_FAILURE(12599)

const char* errorStringNameForErrorCode(nsresult aCode);

#endif /* _nsComposeStrings_H__ */

// clang-format on
