/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __nsMessengerWinIntegration_h
#define __nsMessengerWinIntegration_h

#include "nsIMessengerWindowsIntegration.h"

class nsIStringBundle;

class nsMessengerWinIntegration : public nsIMessengerWindowsIntegration {
 public:
  nsMessengerWinIntegration();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMESSENGERWINDOWSINTEGRATION

  NS_IMETHOD UpdateUnreadCount(uint32_t unreadCount);

 private:
  virtual ~nsMessengerWinIntegration();

  nsresult GetStringBundle(nsIStringBundle** aBundle);
};

#endif  // __nsMessengerWinIntegration_h
