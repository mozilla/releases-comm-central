/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGWINDOW_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGWINDOW_H_

#include "nsIMsgWindow.h"
#include "nsCOMPtr.h"
#include "nsWeakReference.h"
#include "nsIWeakReferenceUtils.h"
#include "nsIInterfaceRequestor.h"

class nsMsgWindow : public nsIMsgWindow, public nsSupportsWeakReference {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS

  nsMsgWindow();
  nsresult Init();
  NS_DECL_NSIMSGWINDOW

 protected:
  virtual ~nsMsgWindow();
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGWINDOW_H_
