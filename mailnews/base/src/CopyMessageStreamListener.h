/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COPYMESSAGESTREAMLISTENER_H
#define COPYMESSAGESTREAMLISTENER_H

#include "nsIStreamListener.h"
#include "nsICopyMessageListener.h"
#include "nsCOMPtr.h"

class CopyMessageStreamListener : public nsIStreamListener,
                                  public nsICopyMessageListener {
 public:
  CopyMessageStreamListener(nsICopyMessageListener* destination, bool isMove);

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSICOPYMESSAGELISTENER
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

 protected:
  virtual ~CopyMessageStreamListener();

 private:
  nsCOMPtr<nsICopyMessageListener> mDestination;
  bool mIsMove;
};

#endif
