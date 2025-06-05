/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_LOCAL_SRC_NSMSGLOCALSTOREUTILS_H_
#define COMM_MAILNEWS_LOCAL_SRC_NSMSGLOCALSTOREUTILS_H_

#include "nsIDirectoryEnumerator.h"
#include "nsIFile.h"
#include "nsString.h"
#include "nsTArray.h"

class nsIRandomAccessStream;

/**
 * Utility Class for handling local mail stores. Berkeley Mailbox
 * and MailDir stores inherit from this class to share some code.
 */

class nsMsgLocalStoreUtils {
 public:
  static bool nsShouldIgnoreFile(nsIFile* path);

 protected:
  nsMsgLocalStoreUtils();

  static nsresult AddDirectorySeparator(nsIFile* path);
  static nsresult ChangeKeywordsHelper(
      nsIRandomAccessStream* seekable, nsTArray<nsCString> const& keywordsToAdd,
      nsTArray<nsCString> const& keywordsToRemove, bool& notEnoughSpace);

  bool DiskSpaceAvailableInStore(nsIFile* aFile, uint64_t aSpaceRequested);

  /**
   * Details about the location of the X-Mozilla-Status/Status2 headers
   * within a message. Points at the value parts of those headers within
   * the message, the parts which can safely edited in-place.
   */
  struct StatusDetails {
    // Extent of X-Mozilla-Status value.
    int64_t statusValOffset{-1};  // Relative to msgStart (-1 = not found).
    uint32_t statusValSize{0};    // Size of value (not including EOL).
    // Extent of X-Mozilla-Status2 value.
    int64_t status2ValOffset{-1};  // Relative to msgStart (-1 = not found).
    uint32_t status2ValSize{0};    // Size of value (not including EOL).
    // The message flags parsed out of the header values.
    uint32_t msgFlags{0};
  };

  /**
   * Find the X-Mozilla-Status and X-Mozilla-Status2 headers in a message.
   *
   * @param stream - A stream containing the message.
   * @param msgStart - The offset of the message start within the stream.
   *                   For mbox with will be the "From " line (which will
   *                   be ignored), for maildir it'll be 0 (as each message
   *                   is stored verbatim in separate files).
   * @returns a struct detailing the location of the headers.
   *
   * If any error occurs, an empty struct will be returned (the same as if
   * no X-Mozilla-Status headers were found).
   */
  static StatusDetails FindXMozillaStatusHeaders(nsIRandomAccessStream* stream,
                                                 int64_t msgStart);
  /**
   * Write newFlags back into the message X-Mozilla-Status headers.
   * It will only write changed data (newFlags is checked against
   * details.msgFlags).
   *
   * @param stream - The stream containing the message.
   * @param msgStart - Offset of the message start within the stream.
   * @param details - The locations of the editable values.
   * @param newFlags - The Flags to write into the X-Mozilla-Status headers.
   */
  static nsresult PatchXMozillaStatusHeaders(nsIRandomAccessStream* stream,
                                             int64_t msgStart,
                                             StatusDetails const& details,
                                             uint32_t newFlags);
};

#endif  // COMM_MAILNEWS_LOCAL_SRC_NSMSGLOCALSTOREUTILS_H_
