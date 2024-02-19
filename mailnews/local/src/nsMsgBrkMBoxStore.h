/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
   Class for handling Berkeley Mailbox stores.
*/

#ifndef nsMsgBrkMboxStore_h__
#define nsMsgBrkMboxStore_h__

#include "nsMsgLocalStoreUtils.h"
#include "nsIMsgPluggableStore.h"
#include "nsIFile.h"
#include "nsISeekableStream.h"
#include "nsIOutputStream.h"
#include "nsTStringHasher.h"  // mozilla::DefaultHasher<nsCString>
#include "mozilla/HashTable.h"

class nsMsgBrkMBoxStore final : public nsMsgLocalStoreUtils,
                                nsIMsgPluggableStore {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGPLUGGABLESTORE

  nsMsgBrkMBoxStore();

 private:
  ~nsMsgBrkMBoxStore();

 protected:
  nsresult InternalGetNewMsgOutputStream(nsIMsgFolder* aFolder,
                                         nsIMsgDBHdr** aNewMsgHdr,
                                         nsIOutputStream** aResult);
  nsresult AddSubFolders(nsIMsgFolder* parent, nsCOMPtr<nsIFile>& path,
                         bool deep);
  nsresult CreateDirectoryForFolder(nsIFile* path);
  nsresult GetOutputStream(nsIMsgDBHdr* aHdr,
                           nsCOMPtr<nsIOutputStream>& outputStream);
  void GetMailboxModProperties(nsIMsgFolder* aFolder, int64_t* aSize,
                               uint32_t* aDate);
  void SetDBValid(nsIMsgDBHdr* aHdr);

  // A set containing the URI of every folder currently being written to.
  mozilla::HashMap<nsCString, RefPtr<nsIOutputStream>> m_OutstandingStreams;
};

#endif
