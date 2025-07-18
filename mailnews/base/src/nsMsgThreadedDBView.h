/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGTHREADEDDBVIEW_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGTHREADEDDBVIEW_H_

#include "nsMsgGroupView.h"

class nsMsgThreadedDBView : public nsMsgGroupView {
 public:
  nsMsgThreadedDBView();
  virtual ~nsMsgThreadedDBView();

  NS_IMETHOD Open(nsIMsgFolder* folder, nsMsgViewSortTypeValue sortType,
                  nsMsgViewSortOrderValue sortOrder,
                  nsMsgViewFlagsTypeValue viewFlags) override;
  NS_IMETHOD CloneDBView(nsIMessenger* aMessengerInstance,
                         nsIMsgWindow* aMsgWindow,
                         nsIMsgDBViewCommandUpdater* aCommandUpdater,
                         nsIMsgDBView** _retval) override;
  NS_IMETHOD Close() override;
  NS_IMETHOD Sort(nsMsgViewSortTypeValue sortType,
                  nsMsgViewSortOrderValue sortOrder) override;
  NS_IMETHOD GetViewType(nsMsgViewTypeValue* aViewType) override;
  NS_IMETHOD OnParentChanged(nsMsgKey aKeyChanged, nsMsgKey oldParent,
                             nsMsgKey newParent,
                             nsIDBChangeListener* aInstigator) override;

 protected:
  nsresult InitThreadedView(int32_t& count);
  virtual nsresult OnNewHeader(nsIMsgDBHdr* newHdr, nsMsgKey aParentKey,
                               bool ensureListed) override;
  virtual nsresult AddMsgToThreadNotInView(nsIMsgThread* threadHdr,
                                           nsIMsgDBHdr* msgHdr,
                                           bool ensureListed);
  nsresult InitSort(nsMsgViewSortTypeValue sortType,
                    nsMsgViewSortOrderValue sortOrder);
  virtual nsresult SortThreads(nsMsgViewSortTypeValue sortType,
                               nsMsgViewSortOrderValue sortOrder);
  virtual void OnExtraFlagChanged(nsMsgViewIndex index,
                                  uint32_t extraFlag) override;
  virtual void OnHeaderAddedOrDeleted() override;
  void ClearPrevIdArray();
  virtual nsresult RemoveByIndex(nsMsgViewIndex index) override;
  nsMsgViewIndex GetInsertInfoForNewHdr(nsIMsgDBHdr* newHdr,
                                        nsMsgViewIndex threadIndex,
                                        int32_t targetLevel);
  void MoveThreadAt(nsMsgViewIndex threadIndex);

  // these are used to save off the previous view so that bopping back and forth
  // between two views is quick (e.g., threaded and flat sorted by date).
  bool m_havePrevView;
  nsTArray<nsMsgKey> m_prevKeys;  // this is used for caching non-threaded view.
  nsTArray<uint32_t> m_prevFlags;
  nsTArray<uint8_t> m_prevLevels;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGTHREADEDDBVIEW_H_
