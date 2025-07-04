/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAIL_COMPONENTS_SEARCH_NSMAILWINSEARCHHELPER_H_
#define COMM_MAIL_COMPONENTS_SEARCH_NSMAILWINSEARCHHELPER_H_

#include "nsIMailWinSearchHelper.h"
#include "nsIFile.h"
#include "nsCOMPtr.h"

#define NS_MAILWINSEARCHHELPER_CID \
  {0x5dd31c99, 0x8c7, 0x4a3b, {0xae, 0xb3, 0xd2, 0xe6, 0x6, 0x65, 0xa3, 0x1a}}

class nsMailWinSearchHelper : public nsIMailWinSearchHelper {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMAILWINSEARCHHELPER

  nsresult Init();
  nsMailWinSearchHelper();

 private:
  virtual ~nsMailWinSearchHelper();
  nsCOMPtr<nsIFile> mProfD;
  nsCOMPtr<nsIFile> mCurProcD;
};

#endif  // COMM_MAIL_COMPONENTS_SEARCH_NSMAILWINSEARCHHELPER_H_
