/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMailAuthModule_h__
#define nsMailAuthModule_h__

#include "nsCOMPtr.h"
#include "nsIAuthModule.h"
#include "nsIMailAuthModule.h"

class nsMailAuthModule : public nsIMailAuthModule {
 public:
  nsMailAuthModule();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMAILAUTHMODULE

 protected:
  virtual ~nsMailAuthModule();

 private:
  nsCOMPtr<nsIAuthModule> mAuthModule;
};

#endif /* nsMailAuthModule_h__ */
