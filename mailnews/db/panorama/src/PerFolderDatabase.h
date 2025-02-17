/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PerFolderDatabase_h__
#define PerFolderDatabase_h__

#include "mozilla/WeakPtr.h"
#include "nsIMsgDatabase.h"

namespace mozilla::mailnews {

class MessageDatabase;

class PerFolderDatabase : public nsIMsgDatabase, public SupportsWeakPtr {
 public:
  explicit PerFolderDatabase(MessageDatabase* aDatabase, uint64_t aFolderId)
      : mDatabase(aDatabase), mFolderId(aFolderId) {}

  NS_DECL_ISUPPORTS
  NS_DECL_NSIDBCHANGEANNOUNCER
  NS_DECL_NSIMSGDATABASE

 private:
  virtual ~PerFolderDatabase() {};

  MessageDatabase* mDatabase;
  uint64_t mFolderId;
};

}  // namespace mozilla::mailnews

#endif  // PerFolderDatabase_h__
