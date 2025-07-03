/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGSPECIALVIEWS_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGSPECIALVIEWS_H_

#include "nsMsgThreadedDBView.h"

class nsMsgThreadsWithUnreadDBView : public nsMsgThreadedDBView {
 public:
  nsMsgThreadsWithUnreadDBView();
  virtual ~nsMsgThreadsWithUnreadDBView();
  NS_IMETHOD CloneDBView(nsIMessenger* aMessengerInstance,
                         nsIMsgWindow* aMsgWindow,
                         nsIMsgDBViewCommandUpdater* aCommandUpdater,
                         nsIMsgDBView** _retval) override;
  NS_IMETHOD GetViewType(nsMsgViewTypeValue* aViewType) override;
  NS_IMETHOD GetNumMsgsInView(int32_t* aNumMsgs) override;
  virtual bool WantsThisThread(nsIMsgThread* threadHdr) override;

 protected:
  virtual nsresult AddMsgToThreadNotInView(nsIMsgThread* threadHdr,
                                           nsIMsgDBHdr* msgHdr,
                                           bool ensureListed) override;
  uint32_t m_totalUnwantedMessagesInView;
};

class nsMsgWatchedThreadsWithUnreadDBView : public nsMsgThreadedDBView {
 public:
  nsMsgWatchedThreadsWithUnreadDBView();
  NS_IMETHOD GetViewType(nsMsgViewTypeValue* aViewType) override;
  NS_IMETHOD CloneDBView(nsIMessenger* aMessengerInstance,
                         nsIMsgWindow* aMsgWindow,
                         nsIMsgDBViewCommandUpdater* aCommandUpdater,
                         nsIMsgDBView** _retval) override;
  NS_IMETHOD GetNumMsgsInView(int32_t* aNumMsgs) override;
  virtual bool WantsThisThread(nsIMsgThread* threadHdr) override;

 protected:
  virtual nsresult AddMsgToThreadNotInView(nsIMsgThread* threadHdr,
                                           nsIMsgDBHdr* msgHdr,
                                           bool ensureListed) override;
  uint32_t m_totalUnwantedMessagesInView;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGSPECIALVIEWS_H_
