/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_DETACHEDMSGHDR_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_DETACHEDMSGHDR_H_

#include "nsIMsgDatabase.h"  // For struct RawHdr
#include "nsIMsgHdr.h"

namespace mozilla::mailnews {

class PerFolderDatabase;

/**
 * An nsIMsgDBHdr which carries around its own data and is 'detached'
 * from the database.
 * Legacy code relies on being able to populate the nsIMsgDBHdr before
 * attaching it to the messages table in the database.
 * That's no good here, so we provide this detached implementation to use
 * up until the point it's added to the database, when it is exchanged for
 * the 'live' implementation (class Message).
 * See nsIMsgDatabase.addDetachedMsgHdrToDB().
 */
class DetachedMsgHdr : public nsIMsgDBHdr {
 public:
  friend class PerFolderDatabase;
  DetachedMsgHdr() = delete;
  explicit DetachedMsgHdr(uint64_t folderId) : mFolderId(folderId) {}

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGDBHDR
 protected:
  virtual ~DetachedMsgHdr() = default;
  // These fields can be read directly by PerFolderDatabase.

  // Metadata that is gleaned from parsing the message headers.
  RawHdr mRaw;

  // Metadata obtained by other means.
  uint32_t mMessageSize{0};

  // Stuff that I _really_ don't want here, but the legacy code needs for now.
  // These shouldn't be set after the message has been added to the DB,
  // and this DetachedMsgHdr discarded...
  // It'd be good to remove these and make the accessor methods fail.
  nsCString mStoreToken;
  uint32_t mOfflineMessageSize{0};
  uint32_t mLineCount{0};

  // Stuff I _really_ _really_ don't want here.
  uint64_t mFolderId{0};
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_DETACHEDMSGHDR_H_
