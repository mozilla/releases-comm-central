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

#define NS_MSG_UNABLE_TO_SAVE_TEMPLATE              NS_MSG_GENERATE_FAILURE(12502)
#define NS_MSG_UNABLE_TO_SAVE_DRAFT                 NS_MSG_GENERATE_FAILURE(12503)
#define NS_MSG_COULDNT_OPEN_FCC_FOLDER              NS_MSG_GENERATE_FAILURE(12506)
#define NS_MSG_NO_RECIPIENTS                        NS_MSG_GENERATE_FAILURE(12511)
#define NS_MSG_ERROR_WRITING_FILE                   NS_MSG_GENERATE_FAILURE(12512)
#define NS_ERROR_SENDING_FROM_COMMAND               NS_MSG_GENERATE_FAILURE(12514)
#define NS_ERROR_SENDING_DATA_COMMAND               NS_MSG_GENERATE_FAILURE(12516)
#define NS_ERROR_SENDING_MESSAGE                    NS_MSG_GENERATE_FAILURE(12517)
#define NS_ERROR_POST_FAILED                        NS_MSG_GENERATE_FAILURE(12518)
#define NS_ERROR_SMTP_SERVER_ERROR                  NS_MSG_GENERATE_FAILURE(12524)
#define NS_MSG_UNABLE_TO_SEND_LATER                 NS_MSG_GENERATE_FAILURE(12525)
#define NS_ERROR_BUT_DONT_SHOW_ALERT                NS_MSG_GENERATE_FAILURE(12527)
#define NS_ERROR_MIME_MPART_ATTACHMENT_ERROR        NS_MSG_GENERATE_FAILURE(12531)

#define NS_MSG_ERROR_ATTACHING_FILE                 NS_MSG_GENERATE_FAILURE(12570)

#define NS_ERROR_SENDING_RCPT_COMMAND               NS_MSG_GENERATE_FAILURE(12575)

#define NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS      NS_MSG_GENERATE_FAILURE(12582)

#define NS_ERROR_SMTP_TEMP_SIZE_EXCEEDED            NS_MSG_GENERATE_FAILURE(12586)
#define NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_2          NS_MSG_GENERATE_FAILURE(12588)

#define NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_NO_SSL  NS_MSG_GENERATE_FAILURE(12594)
#define NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_SSL     NS_MSG_GENERATE_FAILURE(12595)
#define NS_ERROR_SMTP_AUTH_CHANGE_PLAIN_TO_ENCRYPT         NS_MSG_GENERATE_FAILURE(12596)
#define NS_ERROR_SMTP_AUTH_FAILURE                  NS_MSG_GENERATE_FAILURE(12597)
#define NS_ERROR_SMTP_AUTH_GSSAPI                   NS_MSG_GENERATE_FAILURE(12598)
#define NS_ERROR_SMTP_AUTH_MECH_NOT_SUPPORTED       NS_MSG_GENERATE_FAILURE(12599)

#define NS_ERROR_ILLEGAL_LOCALPART                  NS_MSG_GENERATE_FAILURE(12601)

const char* errorStringNameForErrorCode(nsresult aCode);

#endif /* _nsComposeStrings_H__ */

// clang-format on
