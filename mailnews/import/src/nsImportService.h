/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsImportService_h__
#define nsImportService_h__

#include "nsCOMPtr.h"
#include "nsIImportService.h"
#include "nsIStringBundle.h"
#include "nsTArray.h"

class nsImportService : public nsIImportService {
 public:
  nsImportService();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMPORTSERVICE

 private:
  virtual ~nsImportService();

 private:
  nsCOMPtr<nsIStringBundle> m_stringBundle;
};

#endif  // nsImportService_h__
