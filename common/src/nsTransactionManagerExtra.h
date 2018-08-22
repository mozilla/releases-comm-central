/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef nsTransactionManagerExtra_h__
#define nsTransactionManagerExtra_h__

#include "nsITransactionManagerExtra.h"

class nsTransactionManagerExtra : public nsITransactionManagerExtra
{
public:

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSITRANSACTIONMANAGEREXTRA

private:
  virtual ~nsTransactionManagerExtra();
};

#endif // nsTransactionManagerExtra_h__
