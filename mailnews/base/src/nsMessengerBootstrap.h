/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMESSENGERBOOTSTRAP_H_
#define COMM_MAILNEWS_BASE_SRC_NSMESSENGERBOOTSTRAP_H_

#include "nsIMessengerWindowService.h"

class nsMessengerBootstrap : public nsIMessengerWindowService {
 public:
  nsMessengerBootstrap();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMESSENGERWINDOWSERVICE

 private:
  virtual ~nsMessengerBootstrap();
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMESSENGERBOOTSTRAP_H_
