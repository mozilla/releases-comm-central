/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_ADDRBOOK_SRC_NSABDIRECTORYQUERYPROXY_H_
#define COMM_MAILNEWS_ADDRBOOK_SRC_NSABDIRECTORYQUERYPROXY_H_

#include "nsIAbDirectoryQueryProxy.h"
#include "nsCOMPtr.h"

class nsAbDirectoryQueryProxy : public nsIAbDirectoryQueryProxy {
 public:
  NS_DECL_ISUPPORTS
  NS_FORWARD_NSIABDIRECTORYQUERY(mDirectoryQuery->)
  NS_DECL_NSIABDIRECTORYQUERYPROXY

  nsAbDirectoryQueryProxy();

 protected:
  virtual ~nsAbDirectoryQueryProxy();
  bool mInitiated;
  nsCOMPtr<nsIAbDirectoryQuery> mDirectoryQuery;
};

#endif  // COMM_MAILNEWS_ADDRBOOK_SRC_NSABDIRECTORYQUERYPROXY_H_
