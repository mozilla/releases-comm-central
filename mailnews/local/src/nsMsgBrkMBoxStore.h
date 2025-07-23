/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
   Class for handling Berkeley Mailbox stores.
*/

#ifndef COMM_MAILNEWS_LOCAL_SRC_NSMSGBRKMBOXSTORE_H_
#define COMM_MAILNEWS_LOCAL_SRC_NSMSGBRKMBOXSTORE_H_

#include "nsMsgLocalStoreUtils.h"
#include "nsIMsgPluggableStore.h"
#include "nsTStringHasher.h"  // IWYU pragma: keep, mozilla::DefaultHasher<nsCString>
#include "mozilla/HashTable.h"

class nsIFile;
class nsIOutputStream;

class nsMsgBrkMBoxStore final : public nsMsgLocalStoreUtils,
                                nsIMsgPluggableStore {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGPLUGGABLESTORE

  nsMsgBrkMBoxStore();

 private:
  ~nsMsgBrkMBoxStore();

 protected:
  nsresult InvalidateOngoingWrite(nsIMsgFolder* folder);
  nsresult InternalGetNewMsgOutputStream(nsIMsgFolder* aFolder,
                                         int64_t& filePos,
                                         nsIOutputStream** aResult);
  nsresult CreateDirectoryForFolder(nsIFile* path);
  void GetMailboxModProperties(nsIMsgFolder* aFolder, int64_t* aSize,
                               uint32_t* aDate);
  void SetDBValid(nsIMsgFolder* folder);

  // We'll track details for ongoing output streams, keyed by folder.
  // Each folder can only have a single ongoing write.
  // We track:
  //  - The stream, so we can ditch it if another write preempts it.
  //    (shouldn't happen but there are still some possible corner cases).
  //  - The filePos, so we can issue a storeToken to the caller at finishing
  //    time.
  struct StreamDetails {
    int64_t filePos{0};
    nsCOMPtr<nsIOutputStream> stream;
  };
  mozilla::HashMap<nsCString, StreamDetails> mOngoingWrites;
};

#endif  // COMM_MAILNEWS_LOCAL_SRC_NSMSGBRKMBOXSTORE_H_
