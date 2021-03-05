/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __nsMessengerOSXIntegration_h
#define __nsMessengerOSXIntegration_h

#include "nsIMessengerOSIntegration.h"

class nsMessengerOSXIntegration : public nsIMessengerOSIntegration {
 public:
  nsMessengerOSXIntegration();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMESSENGEROSINTEGRATION

 private:
  virtual ~nsMessengerOSXIntegration();

  nsresult RestoreDockIcon();
};

#endif  // __nsMessengerOSXIntegration_h
