/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgFileHdr_H
#define _nsMsgFileHdr_H

#include "nsIFile.h"
#include "nsIMsgHdr.h"
#include "nsString.h"
#include "nsTArray.h"

/* This mail-related class is a stub. You can help mailnews by expanding it. */

class nsMsgFileHdr : public nsIMsgDBHdr {
 public:
  explicit nsMsgFileHdr(const nsACString& aUri);

  NS_DECL_NSIMSGDBHDR
  NS_DECL_ISUPPORTS

 private:
  virtual ~nsMsgFileHdr();

  nsresult ReadFile();

  nsCString mUri;
  nsCOMPtr<nsIFile> mFile;
  nsCString mAuthor;
  nsString mDecodedAuthor;
  nsCString mSubject;
  nsString mDecodedSubject;
  nsCString mRecipients;
  nsString mDecodedRecipients;
  nsCString mCcList;
  nsCString mBccList;
  PRTime mDate;
  nsCString mMessageID;
  uint32_t mFlags;
};

#endif
