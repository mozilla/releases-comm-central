/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGBIFFMANAGER_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGBIFFMANAGER_H_

#include "nsIMsgBiffManager.h"
#include "nsITimer.h"
#include "nsTArray.h"
#include "nsCOMPtr.h"
#include "nsIIncomingServerListener.h"
#include "nsWeakReference.h"
#include "nsIObserver.h"

class nsMsgBiffManager : public nsIMsgBiffManager,
                         public nsIIncomingServerListener,
                         public nsIObserver,
                         public nsSupportsWeakReference {
 public:
  nsMsgBiffManager();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGBIFFMANAGER
  NS_DECL_NSIINCOMINGSERVERLISTENER
  NS_DECL_NSIOBSERVER

  nsresult PerformBiff();

 protected:
  virtual ~nsMsgBiffManager();

  struct nsBiffEntry {
    nsCOMPtr<nsIMsgIncomingServer> server;
    PRTime nextBiffTime;
  };

  nsresult SetNextBiffTime(nsBiffEntry& biffEntry, PRTime currentTime);
  nsresult SetupNextBiff();

  nsCOMPtr<nsITimer> mBiffTimer;
  nsTArray<nsBiffEntry> mBiffArray;
  bool mHaveShutdown;
  bool mInited;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGBIFFMANAGER_H_
