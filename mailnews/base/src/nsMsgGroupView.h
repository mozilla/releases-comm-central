/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgGroupView_H_
#define _nsMsgGroupView_H_

#include "mozilla/Attributes.h"
#include "nsMsgDBView.h"
#include "nsInterfaceHashtable.h"

class nsIMsgThread;
class nsMsgGroupThread;

// Please note that if you override a method of nsMsgDBView,
// you will most likely want to check the m_viewFlags to see if
// we're grouping, and if not, call the base class implementation.
class nsMsgGroupView : public nsMsgDBView {
 public:
  nsMsgGroupView();
  virtual ~nsMsgGroupView();

  NS_IMETHOD Open(nsIMsgFolder* folder, nsMsgViewSortTypeValue sortType,
                  nsMsgViewSortOrderValue sortOrder,
                  nsMsgViewFlagsTypeValue viewFlags) override;
  NS_IMETHOD OpenWithHdrs(nsIMsgEnumerator* aHeaders,
                          nsMsgViewSortTypeValue aSortType,
                          nsMsgViewSortOrderValue aSortOrder,
                          nsMsgViewFlagsTypeValue aViewFlags) override;
  NS_IMETHOD GetViewType(nsMsgViewTypeValue* aViewType) override;
  NS_IMETHOD CopyDBView(nsMsgDBView* aNewMsgDBView,
                        nsIMessenger* aMessengerInstance,
                        nsIMsgWindow* aMsgWindow,
                        nsIMsgDBViewCommandUpdater* aCmdUpdater);
  NS_IMETHOD Close() override;
  NS_IMETHOD OnHdrDeleted(nsIMsgDBHdr* aHdrDeleted, nsMsgKey aParentKey,
                          int32_t aFlags,
                          nsIDBChangeListener* aInstigator) override;
  NS_IMETHOD OnHdrFlagsChanged(nsIMsgDBHdr* aHdrChanged, uint32_t aOldFlags,
                               uint32_t aNewFlags,
                               nsIDBChangeListener* aInstigator) override;

  NS_IMETHOD GetCellProperties(int32_t aRow, nsTreeColumn* aCol,
                               nsAString& aProperties) override;
  NS_IMETHOD GetRowProperties(int32_t aRow, nsAString& aProperties) override;
  NS_IMETHOD CellTextForColumn(int32_t aRow, const nsAString& aColumnName,
                               nsAString& aValue) override;
  NS_IMETHOD GetThreadContainingMsgHdr(nsIMsgDBHdr* msgHdr,
                                       nsIMsgThread** pThread) override;
  NS_IMETHOD AddColumnHandler(const nsAString& column,
                              nsIMsgCustomColumnHandler* handler) override;

 protected:
  virtual void InternalClose();
  nsMsgGroupThread* AddHdrToThread(nsIMsgDBHdr* msgHdr, bool* pNewThread);
  virtual nsresult HashHdr(nsIMsgDBHdr* msgHdr, nsString& aHashKey);
  // Helper function to get age bucket for a hdr, useful when grouped by date.
  nsresult GetAgeBucketValue(nsIMsgDBHdr* aMsgHdr, uint32_t* aAgeBucket,
                             bool rcvDate = false);
  nsresult OnNewHeader(nsIMsgDBHdr* newHdr, nsMsgKey aParentKey,
                       bool /*ensureListed*/) override;
  virtual int32_t FindLevelInThread(nsIMsgDBHdr* msgHdr,
                                    nsMsgViewIndex startOfThread,
                                    nsMsgViewIndex viewIndex) override;

  // Returns true if we are grouped by a sort attribute that uses a dummy row.
  bool GroupViewUsesDummyRow();
  nsresult RebuildView(nsMsgViewFlagsTypeValue viewFlags);
  virtual nsMsgGroupThread* CreateGroupThread(nsIMsgDatabase* db);

  nsInterfaceHashtable<nsStringHashKey, nsIMsgThread> m_groupsTable;
  PRExplodedTime m_lastCurExplodedTime{0};
  bool m_dayChanged;
};

#endif
