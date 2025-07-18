/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_IMPORT_SRC_NSIMPORTEMBEDDEDIMAGEDATA_H_
#define COMM_MAILNEWS_IMPORT_SRC_NSIMPORTEMBEDDEDIMAGEDATA_H_

#include "nsIMsgSend.h"
#include "nsString.h"
#include "nsCOMPtr.h"
#include "nsIURI.h"

class nsImportEmbeddedImageData final : public nsIMsgEmbeddedImageData {
 public:
  nsImportEmbeddedImageData(nsIURI* aUri, const nsACString& aCID);
  nsImportEmbeddedImageData(nsIURI* aUri, const nsACString& aCID,
                            const nsACString& aName);
  nsImportEmbeddedImageData();
  NS_DECL_NSIMSGEMBEDDEDIMAGEDATA
  NS_DECL_ISUPPORTS

  nsCOMPtr<nsIURI> m_uri;
  nsCString m_cid;
  nsCString m_name;

 private:
  ~nsImportEmbeddedImageData();
};

#endif  // COMM_MAILNEWS_IMPORT_SRC_NSIMPORTEMBEDDEDIMAGEDATA_H_
