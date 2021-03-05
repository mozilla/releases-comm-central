/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __nsMessengerUnixIntegration_h
#define __nsMessengerUnixIntegration_h

#include "nsIMessengerOSIntegration.h"

class nsMessengerUnixIntegration : public nsIMessengerOSIntegration {
 public:
  nsMessengerUnixIntegration();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMESSENGEROSINTEGRATION

 private:
  virtual ~nsMessengerUnixIntegration() {}
};

#endif  // __nsMessengerUnixIntegration_h
