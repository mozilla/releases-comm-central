/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgSearchDBViews_H_
#define _nsMsgSearchDBViews_H_

#include "nsMsgGroupView.h"
#include "nsIMsgCopyServiceListener.h"
#include "nsIMsgSearchNotify.h"
#include "nsMsgXFViewThread.h"
#include "nsCOMArray.h"
#include "mozilla/UniquePtr.h"
#include "nsIWeakReferenceUtils.h"

class nsMsgSearchDBView : public nsMsgGroupView,
                          public nsIMsgCopyServiceListener,
                          public nsIMsgSearchNotify {
 public:
  nsMsgSearchDBView();

  // these are tied together pretty intimately
  friend class nsMsgXFViewThread;

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIMSGSEARCHNOTIFY
  NS_DECL_NSIMSGCOPYSERVICELISTENER

  NS_IMETHOD SetSearchSession(nsIMsgSearchSession* aSearchSession) override;

  virtual const char* GetViewName(void) override { return "SearchView"; }
  NS_IMETHOD Open(nsIMsgFolder* folder, nsMsgViewSortTypeValue sortType,
                  nsMsgViewSortOrderValue sortOrder,
                  nsMsgViewFlagsTypeValue viewFlags) override;
  NS_IMETHOD CloneDBView(nsIMessenger* aMessengerInstance,
                         nsIMsgWindow* aMsgWindow,
                         nsIMsgDBViewCommandUpdater* aCmdUpdater,
                         nsIMsgDBView** _retval) override;
  NS_IMETHOD CopyDBView(nsMsgDBView* aNewMsgDBView,
                        nsIMessenger* aMessengerInstance,
                        nsIMsgWindow* aMsgWindow,
                        nsIMsgDBViewCommandUpdater* aCmdUpdater) override;
  NS_IMETHOD Close() override;
  NS_IMETHOD GetViewType(nsMsgViewTypeValue* aViewType) override;
  NS_IMETHOD Sort(nsMsgViewSortTypeValue sortType,
                  nsMsgViewSortOrderValue sortOrder) override;
  NS_IMETHOD GetCommandStatus(
      nsMsgViewCommandTypeValue command, bool* selectable_p,
      nsMsgViewCommandCheckStateValue* selected_p) override;
  NS_IMETHOD DoCommand(nsMsgViewCommandTypeValue command) override;
  NS_IMETHOD DoCommandWithFolder(nsMsgViewCommandTypeValue command,
                                 nsIMsgFolder* destFolder) override;
  NS_IMETHOD GetHdrForFirstSelectedMessage(nsIMsgDBHdr** hdr) override;
  NS_IMETHOD OpenWithHdrs(nsIMsgEnumerator* aHeaders,
                          nsMsgViewSortTypeValue aSortType,
                          nsMsgViewSortOrderValue aSortOrder,
                          nsMsgViewFlagsTypeValue aViewFlags) override;
  NS_IMETHOD OnHdrDeleted(nsIMsgDBHdr* aHdrDeleted, nsMsgKey aParentKey,
                          int32_t aFlags,
                          nsIDBChangeListener* aInstigator) override;
  NS_IMETHOD OnHdrFlagsChanged(nsIMsgDBHdr* aHdrChanged, uint32_t aOldFlags,
                               uint32_t aNewFlags,
                               nsIDBChangeListener* aInstigator) override;
  NS_IMETHOD GetNumMsgsInView(int32_t* aNumMsgs) override;
  // override to get location
  NS_IMETHOD GetCellText(int32_t aRow, nsTreeColumn* aCol,
                         nsAString& aValue) override;
  virtual nsresult GetMsgHdrForViewIndex(nsMsgViewIndex index,
                                         nsIMsgDBHdr** msgHdr) override;
  virtual nsresult OnNewHeader(nsIMsgDBHdr* newHdr, nsMsgKey parentKey,
                               bool ensureListed) override;
  NS_IMETHOD GetFolderForViewIndex(nsMsgViewIndex index,
                                   nsIMsgFolder** folder) override;

  NS_IMETHOD OnAnnouncerGoingAway(nsIDBChangeAnnouncer* instigator) override;

  virtual nsCOMArray<nsIMsgFolder>* GetFolders() override;
  virtual nsresult GetFolderFromMsgURI(const nsACString& aMsgURI,
                                       nsIMsgFolder** aFolder) override;

  NS_IMETHOD GetThreadContainingMsgHdr(nsIMsgDBHdr* msgHdr,
                                       nsIMsgThread** pThread) override;

  NS_IMETHOD ApplyCommandToIndices(
      nsMsgViewCommandTypeValue command,
      nsTArray<nsMsgViewIndex> const& selection) override;

  NS_IMETHOD SetViewFlags(nsMsgViewFlagsTypeValue aViewFlags) override;

  NS_IMETHOD OnDeleteCompleted(bool aSucceeded) override;

 protected:
  virtual ~nsMsgSearchDBView();
  virtual void InternalClose() override;
  virtual nsresult HashHdr(nsIMsgDBHdr* msgHdr, nsString& aHashKey) override;
  virtual nsresult ListIdsInThread(nsIMsgThread* threadHdr,
                                   nsMsgViewIndex startOfThreadViewIndex,
                                   uint32_t* pNumListed) override;
  nsresult FetchLocation(int32_t aRow, nsAString& aLocationString);
  virtual nsresult AddHdrFromFolder(nsIMsgDBHdr* msgHdr, nsIMsgFolder* folder);
  virtual nsresult GetDBForViewIndex(nsMsgViewIndex index,
                                     nsIMsgDatabase** db) override;
  virtual nsresult RemoveByIndex(nsMsgViewIndex index) override;
  virtual nsresult CopyMessages(nsIMsgWindow* window,
                                nsTArray<nsMsgViewIndex> const& selection,
                                bool isMove, nsIMsgFolder* destFolder) override;
  virtual nsresult DeleteMessages(nsIMsgWindow* window,
                                  nsTArray<nsMsgViewIndex> const& selection,
                                  bool deleteStorage) override;
  virtual void InsertMsgHdrAt(nsMsgViewIndex index, nsIMsgDBHdr* hdr,
                              nsMsgKey msgKey, uint32_t flags,
                              uint32_t level) override;
  virtual void SetMsgHdrAt(nsIMsgDBHdr* hdr, nsMsgViewIndex index,
                           nsMsgKey msgKey, uint32_t flags,
                           uint32_t level) override;
  virtual void InsertEmptyRows(nsMsgViewIndex viewIndex,
                               int32_t numRows) override;
  virtual void RemoveRows(nsMsgViewIndex viewIndex, int32_t numRows) override;
  virtual nsMsgViewIndex FindHdr(nsIMsgDBHdr* msgHdr,
                                 nsMsgViewIndex startIndex = 0,
                                 bool allowDummy = false) override;

  // Functions for copy, move, and delete operations.
  nsresult GetFoldersAndHdrsForSelection(
      nsTArray<nsMsgViewIndex> const& selection);
  nsresult ProcessNextFolder(nsIMsgWindow* window);

  nsresult GroupSearchResultsByFolder();
  nsresult PartitionSelectionByFolder(
      nsTArray<nsMsgViewIndex> const& selection,
      mozilla::UniquePtr<nsTArray<uint32_t>[]>& indexArrays,
      int32_t* numArrays);

  virtual nsresult ApplyCommandToIndicesWithFolder(
      nsMsgViewCommandTypeValue command,
      nsTArray<nsMsgViewIndex> const& selection,
      nsIMsgFolder* destFolder) override;
  void MoveThreadAt(nsMsgViewIndex threadIndex);

  virtual nsresult GetMessageEnumerator(nsIMsgEnumerator** enumerator) override;
  virtual nsresult InsertHdrFromFolder(nsIMsgDBHdr* msgHdr,
                                       nsIMsgFolder* folder);

  // Holds the original folder of each message in this view.
  // Augments the existing arrays in nsMsgDBView (m_keys, m_flags and m_levels),
  // and is kept in sync with them.
  nsCOMArray<nsIMsgFolder> m_folders;

  // Used for copy, move, and delete operations.
  nsTArray<nsTArray<RefPtr<nsIMsgDBHdr>>> m_hdrsForEachFolder;
  nsCOMArray<nsIMsgFolder> m_uniqueFoldersSelected;
  uint32_t mCurIndex;

  int32_t mTotalIndices;
  nsCOMArray<nsIMsgDatabase> m_dbToUseList;
  nsMsgViewCommandTypeValue mCommand;
  nsCOMPtr<nsIMsgFolder> mDestFolder;
  nsWeakPtr m_searchSession;

  // these are for doing threading of the search hits

  // used for assigning thread id's to xfview threads.
  nsMsgKey m_nextThreadId;
  // this maps message-ids and reference message ids to
  // the corresponding nsMsgXFViewThread object. If we're
  // doing subject threading, we would throw subjects
  // into the same table.
  nsInterfaceHashtable<nsCStringHashKey, nsIMsgThread> m_threadsTable;

  // map message-ids to msg hdrs in the view, used for threading.
  nsInterfaceHashtable<nsCStringHashKey, nsIMsgDBHdr> m_hdrsTable;
  int32_t m_totalMessagesInView;

  virtual nsMsgGroupThread* CreateGroupThread(nsIMsgDatabase* db) override;
  nsresult GetXFThreadFromMsgHdr(nsIMsgDBHdr* msgHdr, nsIMsgThread** pThread,
                                 bool* foundByMessageId = nullptr);
  bool GetThreadFromHash(nsCString& reference, nsIMsgThread** thread);
  bool GetMsgHdrFromHash(nsCString& reference, nsIMsgDBHdr** hdr);
  nsresult AddRefToHash(nsCString& reference, nsIMsgThread* thread);
  nsresult AddMsgToHashTables(nsIMsgDBHdr* msgHdr, nsIMsgThread* thread);
  nsresult RemoveRefFromHash(nsCString& reference);
  nsresult RemoveMsgFromHashTables(nsIMsgDBHdr* msgHdr);
  nsresult InitRefHash();
};

#endif
