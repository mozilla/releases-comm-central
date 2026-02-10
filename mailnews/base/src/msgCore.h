/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Include files we are going to want available to all files....these files
   include NSPR, memory, and string header files among others */

#ifndef COMM_MAILNEWS_BASE_SRC_MSGCORE_H_
#define COMM_MAILNEWS_BASE_SRC_MSGCORE_H_

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

#define IS_SPACE(VAL) \
  (((((PRIntn)(VAL)) & 0x7f) == ((PRIntn)(VAL))) && isspace((PRIntn)(VAL)))

#define IS_DIGIT(i) ((((unsigned int)(i)) > 0x7f) ? (int)0 : isdigit(i))
#if defined(XP_WIN)
#  define IS_ALPHA(VAL) (isascii((int)(VAL)) && isalpha((int)(VAL)))
#else
#  define IS_ALPHA(VAL) \
    ((((unsigned int)(VAL)) > 0x7f) ? (int)0 : isalpha((int)(VAL)))
#endif

#if defined(XP_WIN)
#  define MSG_LINEBREAK "\015\012"
#  define MSG_LINEBREAK_LEN 2
#else
#  define MSG_LINEBREAK "\012"
#  define MSG_LINEBREAK_LEN 1
#endif

/// The number of microseconds in a day. This comes up a lot.
#define PR_USEC_PER_DAY (PRTime(PR_USEC_PER_SEC) * 60 * 60 * 24)

#endif  // COMM_MAILNEWS_BASE_SRC_MSGCORE_H_
