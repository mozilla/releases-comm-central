/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGPURGESERVICE_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGPURGESERVICE_H_

#include "msgCore.h"
#include "nsIMsgPurgeService.h"
#include "nsIMsgSearchSession.h"
#include "nsITimer.h"
#include "nsCOMPtr.h"
#include "nsIMsgSearchNotify.h"
#include "nsIMsgFolder.h"

class nsMsgPurgeService : public nsIMsgPurgeService, public nsIMsgSearchNotify {
 public:
  nsMsgPurgeService();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGPURGESERVICE
  NS_DECL_NSIMSGSEARCHNOTIFY

  nsresult PerformPurge();

 protected:
  virtual ~nsMsgPurgeService();
  int32_t FindServer(nsIMsgIncomingServer* server);
  nsresult SetupNextPurge();
  nsresult PurgeSurver(nsIMsgIncomingServer* server);
  nsresult SearchFolderToPurge(nsIMsgFolder* folder, int32_t purgeInterval);

 protected:
  nsCOMPtr<nsITimer> mPurgeTimer;
  nsCOMPtr<nsIMsgSearchSession> mSearchSession;
  nsCOMPtr<nsIMsgFolder> mSearchFolder;
  nsTArray<RefPtr<nsIMsgDBHdr>> mHdrsToDelete;
  bool mHaveShutdown;

 private:
  // in minutes, how long must pass between two consecutive purges on the
  // same junk folder?
  int32_t mMinDelayBetweenPurges;
  // in minutes, how often to check if we need to purge one of the junk folders?
  int32_t mPurgeTimerInterval;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGPURGESERVICE_H_
