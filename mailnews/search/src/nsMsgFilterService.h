/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_SEARCH_SRC_NSMSGFILTERSERVICE_H_
#define COMM_MAILNEWS_SEARCH_SRC_NSMSGFILTERSERVICE_H_

#include "nsIMsgFilterService.h"
#include "nsIFile.h"
#include "nsTArray.h"

class nsIMsgWindow;
class nsIStringBundle;

// The filter service is used to acquire and manipulate filter lists.

class nsMsgFilterService : public nsIMsgFilterService {
 public:
  nsMsgFilterService();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGFILTERSERVICE
  // clients call OpenFilterList to get a handle to a FilterList, of existing
  // nsMsgFilter. These are manipulated by the front end as a result of user
  // interaction with dialog boxes.

  nsresult BackUpFilterFile(nsIFile* aFilterFile, nsIMsgWindow* aMsgWindow);
  nsresult AlertBackingUpFilterFile(nsIMsgWindow* aMsgWindow);
  nsresult ThrowAlertMsg(const char* aMsgName, nsIMsgWindow* aMsgWindow);
  nsresult GetStringFromBundle(const char* aMsgName, nsAString& aResult);
  nsresult GetFilterStringBundle(nsIStringBundle** aBundle);

 protected:
  virtual ~nsMsgFilterService();

  // defined custom action list
  nsTArray<RefPtr<nsIMsgFilterCustomAction>> mCustomActions;
  // defined custom term list
  nsTArray<RefPtr<nsIMsgSearchCustomTerm>> mCustomTerms;
};

#endif  // COMM_MAILNEWS_SEARCH_SRC_NSMSGFILTERSERVICE_H_
