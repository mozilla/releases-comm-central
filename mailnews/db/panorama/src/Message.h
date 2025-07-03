/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGE_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGE_H_

#include "DatabaseCore.h"
#include "mozIStorageStatement.h"
#include "nsIMsgHdr.h"
#include "nsTString.h"

namespace mozilla::mailnews {

class MessageDatabase;

class Message : public nsIMsgDBHdr {
 public:
  Message() = delete;
  explicit Message(nsMsgKey key) : mKey(key) {};

  nsMsgKey Key() { return mKey; }
  // Currently needed for LiveView. Returns 0 upon error.
  uint64_t FolderId();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGDBHDR
 protected:
  virtual ~Message() {};

 private:
  nsMsgKey mKey;

  FolderDatabase& FolderDB() const {
    return *DatabaseCore::sInstance->mFolderDatabase;
  }
  MessageDatabase& MessageDB() const {
    return *DatabaseCore::sInstance->mMessageDatabase;
  }
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGE_H_
