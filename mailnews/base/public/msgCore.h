/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Include files we are going to want available to all files....these files
   include NSPR, memory, and string header files among others */

#ifndef COMM_MAILNEWS_BASE_PUBLIC_MSGCORE_H_
#define COMM_MAILNEWS_BASE_PUBLIC_MSGCORE_H_

#include "nscore.h"
#include "nspr.h"
#include "plstr.h"
#include "nsCRTGlue.h"

class nsIMsgDBHdr;
class nsIMsgFolder;

// include common interfaces such as the service manager and the repository....
#include "nsIServiceManager.h"
#include "nsIComponentManager.h"

/*
 * The suffix we use for the mail summary file.
 */
#define SUMMARY_SUFFIX u".msf"
#define SUMMARY_SUFFIX8 ".msf"
#define SUMMARY_SUFFIX_LENGTH 4

/*
 * The suffix we use for folder subdirectories.
 */
#define FOLDER_SUFFIX u".sbd"
#define FOLDER_SUFFIX8 ".sbd"
#define FOLDER_SUFFIX_LENGTH 4

/*
 * These are folder property strings, which are used in several places.

 */
// Most recently used (opened, moved to, got new messages)
#define MRU_TIME_PROPERTY "MRUTime"
// Most recently moved to, for recent folders list in move menu
#define MRM_TIME_PROPERTY "MRMTime"

/*
 * NS_ERROR macros - use these macros to generate error constants
 * to be used by XPCOM interfaces and possibly other useful things
 * do not use these macros in your code - declare error macros for
 * each specific error you need.
 *
 * for example:
 * #define NS_MSG_ERROR_NO_SUCH_FOLDER NS_MSG_GENERATE_FAILURE(4)
 *
 */

/* use these routines to generate error values */
#define NS_MSG_GENERATE_RESULT(severity, value) \
  NS_ERROR_GENERATE(severity, NS_ERROR_MODULE_MAILNEWS, value)

#define NS_MSG_GENERATE_SUCCESS(value) \
  NS_ERROR_GENERATE_SUCCESS(NS_ERROR_MODULE_MAILNEWS, value)

#define NS_MSG_GENERATE_FAILURE(value) \
  NS_ERROR_GENERATE_FAILURE(NS_ERROR_MODULE_MAILNEWS, value)

/* these are shortcuts to generate simple errors with a zero value */
#define NS_MSG_SUCCESS NS_MSG_GENERATE_SUCCESS(0)
#define NS_MSG_FAILURE NS_MSG_GENERATE_FAILURE(0)

#define IS_SPACE(VAL) \
  (((((PRIntn)(VAL)) & 0x7f) == ((PRIntn)(VAL))) && isspace((PRIntn)(VAL)))

#define IS_DIGIT(i) ((((unsigned int)(i)) > 0x7f) ? (int)0 : isdigit(i))
#if defined(XP_WIN)
#  define IS_ALPHA(VAL) (isascii((int)(VAL)) && isalpha((int)(VAL)))
#else
#  define IS_ALPHA(VAL) \
    ((((unsigned int)(VAL)) > 0x7f) ? (int)0 : isalpha((int)(VAL)))
#endif

/* for retrieving information out of messenger nsresults */

#define NS_IS_MSG_ERROR(err) \
  (NS_ERROR_GET_MODULE(err) == NS_ERROR_MODULE_MAILNEWS)

#define NS_MSG_SUCCEEDED(err) (NS_IS_MSG_ERROR(err) && NS_SUCCEEDED(err))

#define NS_MSG_FAILED(err) (NS_IS_MSG_ERROR(err) && NS_FAILED(err))

#define NS_MSG_PASSWORD_PROMPT_CANCELLED NS_MSG_GENERATE_SUCCESS(1)

/**
 * Indicates that a search is done/terminated because it was interrupted.
 * Interrupting a search originally notified listeners with
 * OnSearchDone(NS_OK), so we define a success value to continue doing this,
 * and because the search was fine except for an explicit call to interrupt it.
 */
#define NS_MSG_SEARCH_INTERRUPTED NS_MSG_GENERATE_SUCCESS(2)

/* This is where we define our errors. There has to be a central
   place so we don't use the same error codes for different errors.
*/
#define NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE NS_MSG_GENERATE_FAILURE(5)
#define NS_MSG_ERROR_FOLDER_SUMMARY_MISSING NS_MSG_GENERATE_FAILURE(6)
#define NS_MSG_ERROR_FOLDER_MISSING NS_MSG_GENERATE_FAILURE(7)

#define NS_MSG_MESSAGE_NOT_FOUND NS_MSG_GENERATE_FAILURE(8)
#define NS_MSG_NOT_A_MAIL_FOLDER NS_MSG_GENERATE_FAILURE(9)

#define NS_MSG_FOLDER_BUSY NS_MSG_GENERATE_FAILURE(10)

#define NS_MSG_COULD_NOT_CREATE_DIRECTORY NS_MSG_GENERATE_FAILURE(11)
#define NS_MSG_CANT_CREATE_FOLDER NS_MSG_GENERATE_FAILURE(12)

#define NS_MSG_FILTER_PARSE_ERROR NS_MSG_GENERATE_FAILURE(13)

#define NS_MSG_FOLDER_UNREADABLE NS_MSG_GENERATE_FAILURE(14)

#define NS_MSG_ERROR_WRITING_MAIL_FOLDER NS_MSG_GENERATE_FAILURE(15)

#define NS_MSG_ERROR_NO_SEARCH_VALUES NS_MSG_GENERATE_FAILURE(16)

#define NS_MSG_ERROR_INVALID_SEARCH_SCOPE NS_MSG_GENERATE_FAILURE(17)

#define NS_MSG_ERROR_INVALID_SEARCH_TERM NS_MSG_GENERATE_FAILURE(18)

#define NS_MSG_FOLDER_EXISTS NS_MSG_GENERATE_FAILURE(19)

#define NS_MSG_ERROR_OFFLINE NS_MSG_GENERATE_FAILURE(20)

#define NS_MSG_POP_FILTER_TARGET_ERROR NS_MSG_GENERATE_FAILURE(21)

#define NS_MSG_INVALID_OR_MISSING_SERVER NS_MSG_GENERATE_FAILURE(22)

#define NS_MSG_INVALID_DBVIEW_INDEX NS_MSG_GENERATE_FAILURE(24)

#define NS_MSG_ERROR_COPY_FOLDER_ABORTED NS_MSG_GENERATE_FAILURE(26)
// this error means a url was queued but never run because one of the urls
// it was queued after failed. We send an OnStopRunningUrl with this error code
// so the listeners can know that we didn't run the url.
#define NS_MSG_ERROR_URL_ABORTED NS_MSG_GENERATE_FAILURE(27)

// when custom header has invalid characters (as per rfc 2822)
#define NS_MSG_INVALID_CUSTOM_HEADER NS_MSG_GENERATE_FAILURE(29)

// when local caches are password protect and user isn't auth
#define NS_MSG_USER_NOT_AUTHENTICATED NS_MSG_GENERATE_FAILURE(30)

// The code tried to stream a message using the aLocalOnly argument, but
// the message was not cached locally.
#define NS_MSG_ERROR_MSG_NOT_OFFLINE NS_MSG_GENERATE_FAILURE(32)

// The imap server returned NO or BAD for an IMAP command
#define NS_MSG_ERROR_IMAP_COMMAND_FAILED NS_MSG_GENERATE_FAILURE(33)

#define NS_MSG_ERROR_INVALID_FOLDER_NAME NS_MSG_GENERATE_FAILURE(34)

// Mbox message deviates too far from expected size.
#define NS_MSG_ERROR_UNEXPECTED_SIZE NS_MSG_GENERATE_FAILURE(35)

// Mbox message doesn't start with "From " separator line.
#define NS_MSG_ERROR_MBOX_MALFORMED NS_MSG_GENERATE_FAILURE(36)

// Folder compaction could not proceed because of pending offline/pseudo ops.
#define NS_MSG_ERROR_BLOCKED_COMPACTION NS_MSG_GENERATE_FAILURE(37)

/* Error codes for message compose are defined in
   compose\src\nsMsgComposeStringBundle.h. Message compose use the same error
   code space as other mailnews modules. To avoid any conflict, values between
   12500 and 12999 are reserved.
*/
#define NS_MSGCOMP_ERROR_BEGIN 12500

#define NS_MSGCOMP_ERROR_END 12999

#if defined(XP_WIN)
#  define MSG_LINEBREAK "\015\012"
#  define MSG_LINEBREAK_LEN 2
#else
#  define MSG_LINEBREAK "\012"
#  define MSG_LINEBREAK_LEN 1
#endif

/*
 * On Windows, we use \r\n as the line terminator in mbox files. On
 * other platforms, we use \n. However, we need to be able to
 * recognize line terminators produced on any platform, because we
 * allow profiles (including the mbox files they contain) to be shared
 * between platforms.
 *
 * Returns 0 (i.e., false) if the line is not blank, or otherwise the
 * length of the line terminator, i.e., 1 for \n or 2 for \r\n.
 */
#define IS_MSG_LINEBREAK(line) \
  (line[0] == '\012' ? 1 : ((line[0] == '\015' && line[1] == '\012') ? 2 : 0))

/// The number of microseconds in a day. This comes up a lot.
#define PR_USEC_PER_DAY (PRTime(PR_USEC_PER_SEC) * 60 * 60 * 24)

#endif  // COMM_MAILNEWS_BASE_PUBLIC_MSGCORE_H_
