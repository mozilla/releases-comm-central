/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
   Class for handling Maildir stores.
*/

#ifndef nsMsgMaildirStore_h__
#define nsMsgMaildirStore_h__

#include "nsMsgLocalStoreUtils.h"
#include "nsIOutputStream.h"
#include "nsIMsgPluggableStore.h"
#include "nsIFile.h"
#include "nsTStringHasher.h"  // IWYU pragma: keep, mozilla::DefaultHasher<nsCString>
#include "mozilla/HashTable.h"

class nsMsgMaildirStore final : public nsMsgLocalStoreUtils,
                                nsIMsgPluggableStore {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGPLUGGABLESTORE

  nsMsgMaildirStore();

 private:
  ~nsMsgMaildirStore();

  // Return a unique name to use as a filename for a message.
  // Uses the form outlined in https://cr.yp.to/proto/maildir.html
  nsCString UniqueName();
  nsAutoCString mHostname;
  int mUniqueCount{0};  // Incremented each time UniqueName() is called.

  // Track the ongoing writes, indexed by folder URI.
  // For now we will artificially restrict this to only one write at a time.
  // Maildir can support parallel writes, but the IMAP folder code kind of
  // relies on parallel writes failing (sigh)...
  struct StreamDetails {
    nsAutoCString filename;
    nsCOMPtr<nsIOutputStream> stream;
  };
  mozilla::HashMap<nsCString, StreamDetails> mOngoingWrites;

 protected:
  nsresult GetDirectoryForFolder(nsIFile* path);
  nsresult CreateDirectoryForFolder(nsIFile* path, bool aIsServer);

  nsresult CreateMaildir(nsIFile* path);
  nsresult AddSubFolders(nsIMsgFolder* parent, nsIFile* path, bool deep);
  nsresult GetOutputStream(nsIMsgDBHdr* aHdr,
                           nsCOMPtr<nsIOutputStream>& aOutputStream);
  nsresult InternalGetNewMsgOutputStream(nsIMsgFolder* folder,
                                         nsACString& storeToken,
                                         nsIOutputStream** outStream);
};
#endif
