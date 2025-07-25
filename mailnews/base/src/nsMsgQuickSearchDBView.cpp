/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgQuickSearchDBView.h"

#include "mozilla/ProfilerMarkers.h"
#include "msgCore.h"
#include "nsMsgFolderFlags.h"
#include "nsIMsgHdr.h"
#include "nsIMsgImapMailFolder.h"
#include "nsImapCore.h"
#include "nsIMsgHdr.h"
#include "nsIDBFolderInfo.h"
#include "nsMsgMessageFlags.h"
#include "nsMsgUtils.h"

nsMsgQuickSearchDBView::nsMsgQuickSearchDBView() {
  m_usingCachedHits = false;
  m_cacheEmpty = true;
}

nsMsgQuickSearchDBView::~nsMsgQuickSearchDBView() {}

NS_IMPL_ISUPPORTS_INHERITED(nsMsgQuickSearchDBView, nsMsgDBView, nsIMsgDBView,
                            nsIMsgSearchNotify)

NS_IMETHODIMP nsMsgQuickSearchDBView::Open(nsIMsgFolder* folder,
                                           nsMsgViewSortTypeValue sortType,
                                           nsMsgViewSortOrderValue sortOrder,
                                           nsMsgViewFlagsTypeValue viewFlags) {
  AUTO_PROFILER_LABEL("nsMsgQuickSearchDBView::Open", MAILNEWS);
  nsresult rv = nsMsgDBView::Open(folder, sortType, sortOrder, viewFlags);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!m_db) return NS_ERROR_NULL_POINTER;
  m_viewFolder = nullptr;

  int32_t count;
  rv = InitThreadedView(count);
  return rv;
}

NS_IMETHODIMP
nsMsgQuickSearchDBView::CloneDBView(nsIMessenger* aMessengerInstance,
                                    nsIMsgWindow* aMsgWindow,
                                    nsIMsgDBViewCommandUpdater* aCmdUpdater,
                                    nsIMsgDBView** _retval) {
  nsMsgQuickSearchDBView* newMsgDBView = new nsMsgQuickSearchDBView();
  nsresult rv =
      CopyDBView(newMsgDBView, aMessengerInstance, aMsgWindow, aCmdUpdater);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_IF_ADDREF(*_retval = newMsgDBView);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgQuickSearchDBView::CopyDBView(nsMsgDBView* aNewMsgDBView,
                                   nsIMessenger* aMessengerInstance,
                                   nsIMsgWindow* aMsgWindow,
                                   nsIMsgDBViewCommandUpdater* aCmdUpdater) {
  nsMsgThreadedDBView::CopyDBView(aNewMsgDBView, aMessengerInstance, aMsgWindow,
                                  aCmdUpdater);
  nsMsgQuickSearchDBView* newMsgDBView = (nsMsgQuickSearchDBView*)aNewMsgDBView;

  // now copy all of our private member data
  newMsgDBView->m_origKeys = m_origKeys.Clone();
  return NS_OK;
}

nsresult nsMsgQuickSearchDBView::DeleteMessages(
    nsIMsgWindow* window, nsTArray<nsMsgViewIndex> const& selection,
    bool deleteStorage) {
  for (nsMsgViewIndex viewIndex : selection) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    (void)GetMsgHdrForViewIndex(viewIndex, getter_AddRefs(msgHdr));
    if (msgHdr) {
      RememberDeletedMsgHdr(msgHdr);
    }
  }
  return nsMsgDBView::DeleteMessages(window, selection, deleteStorage);
}

NS_IMETHODIMP nsMsgQuickSearchDBView::DoCommand(
    nsMsgViewCommandTypeValue aCommand) {
  if (aCommand == nsMsgViewCommandType::markAllRead) {
    nsresult rv = NS_OK;
    m_folder->EnableNotifications(nsIMsgFolder::allMessageCountNotifications,
                                  false);

    for (uint32_t i = 0; NS_SUCCEEDED(rv) && i < GetSize(); i++) {
      rv = m_db->MarkRead(m_keys[i], true, nullptr);
    }

    m_folder->EnableNotifications(nsIMsgFolder::allMessageCountNotifications,
                                  true);

    nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(m_folder);
    if (NS_SUCCEEDED(rv) && imapFolder)
      rv = imapFolder->StoreImapFlags(kImapMsgSeenFlag, true, m_keys, nullptr);

    m_db->SetSummaryValid(true);
    return rv;
  } else
    return nsMsgDBView::DoCommand(aCommand);
}

NS_IMETHODIMP nsMsgQuickSearchDBView::GetViewType(
    nsMsgViewTypeValue* aViewType) {
  NS_ENSURE_ARG_POINTER(aViewType);
  *aViewType = nsMsgViewType::eShowQuickSearchResults;
  return NS_OK;
}

nsresult nsMsgQuickSearchDBView::AddHdr(nsIMsgDBHdr* msgHdr,
                                        nsMsgViewIndex* resultIndex) {
  nsMsgKey msgKey;
  msgHdr->GetMessageKey(&msgKey);
  // protect against duplication.
  if (m_origKeys.BinaryIndexOf(msgKey) == m_origKeys.NoIndex) {
    nsMsgViewIndex insertIndex = GetInsertIndexHelper(
        msgHdr, m_origKeys, nullptr, nsMsgViewSortOrder::ascending,
        nsMsgViewSortType::byId);
    m_origKeys.InsertElementAt(insertIndex, msgKey);
  }
  if (m_viewFlags & (nsMsgViewFlagsType::kGroupBySort |
                     nsMsgViewFlagsType::kThreadedDisplay)) {
    nsMsgKey parentKey;
    msgHdr->GetThreadParent(&parentKey);
    return nsMsgThreadedDBView::OnNewHeader(msgHdr, parentKey, true);
  } else
    return nsMsgDBView::AddHdr(msgHdr, resultIndex);
}

nsresult nsMsgQuickSearchDBView::OnNewHeader(nsIMsgDBHdr* newHdr,
                                             nsMsgKey aParentKey,
                                             bool ensureListed) {
  if (newHdr) {
    bool match = false;
    nsCOMPtr<nsIMsgSearchSession> searchSession =
        do_QueryReferent(m_searchSession);
    if (searchSession) searchSession->MatchHdr(newHdr, m_db, &match);
    if (match) {
      // put the new header in m_origKeys, so that expanding a thread will
      // show the newly added header.
      nsMsgKey newKey;
      (void)newHdr->GetMessageKey(&newKey);
      nsMsgViewIndex insertIndex = GetInsertIndexHelper(
          newHdr, m_origKeys, nullptr, nsMsgViewSortOrder::ascending,
          nsMsgViewSortType::byId);
      m_origKeys.InsertElementAt(insertIndex, newKey);
      nsMsgThreadedDBView::OnNewHeader(
          newHdr, aParentKey,
          ensureListed);  // do not add a new message if there isn't a match.
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgQuickSearchDBView::OnHdrFlagsChanged(
    nsIMsgDBHdr* aHdrChanged, uint32_t aOldFlags, uint32_t aNewFlags,
    nsIDBChangeListener* aInstigator) {
  nsresult rv = nsMsgGroupView::OnHdrFlagsChanged(aHdrChanged, aOldFlags,
                                                  aNewFlags, aInstigator);

  if (m_viewFolder && (m_viewFolder != m_folder) &&
      (aOldFlags & nsMsgMessageFlags::Read) !=
          (aNewFlags & nsMsgMessageFlags::Read)) {
    // if we're displaying a single folder virtual folder for an imap folder,
    // the search criteria might be on message body, and we might not have the
    // message body offline, in which case we can't tell if the message
    // matched or not. But if the unread flag changed, we need to update the
    // unread counts. Normally, VirtualFolderChangeListener::OnHdrFlagsChanged
    // will handle this, but it won't work for body criteria when we don't have
    // the body offline.
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(m_viewFolder);
    if (imapFolder) {
      nsMsgViewIndex hdrIndex = FindHdr(aHdrChanged);
      if (hdrIndex != nsMsgViewIndex_None) {
        nsCOMPtr<nsIMsgSearchSession> searchSession =
            do_QueryReferent(m_searchSession);
        if (searchSession) {
          bool oldMatch, newMatch;
          rv = searchSession->MatchHdr(aHdrChanged, m_db, &newMatch);
          aHdrChanged->SetFlags(aOldFlags);
          rv = searchSession->MatchHdr(aHdrChanged, m_db, &oldMatch);
          aHdrChanged->SetFlags(aNewFlags);
          // if it doesn't match the criteria,
          // VirtualFolderChangeListener::OnHdrFlagsChanged won't tweak the
          // read/unread counts. So do it here:
          if (!oldMatch && !newMatch) {
            nsCOMPtr<nsIMsgDatabase> virtDatabase;
            nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;

            rv = m_viewFolder->GetDBFolderInfoAndDB(
                getter_AddRefs(dbFolderInfo), getter_AddRefs(virtDatabase));
            NS_ENSURE_SUCCESS(rv, rv);
            dbFolderInfo->ChangeNumUnreadMessages(
                (aOldFlags & nsMsgMessageFlags::Read) ? 1 : -1);
            m_viewFolder->UpdateSummaryTotals(true);  // force update from db.
            virtDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
          }
        }
      }
    }
  }
  return rv;
}

NS_IMETHODIMP
nsMsgQuickSearchDBView::OnHdrPropertyChanged(nsIMsgDBHdr* aHdrChanged,
                                             const nsACString& property,
                                             bool aPreChange, uint32_t* aStatus,
                                             nsIDBChangeListener* aInstigator) {
  // If the junk mail plugin just activated on a message, then
  // we'll allow filters to remove from view.
  // Otherwise, just update the view line.
  //
  // Note this will not add newly matched headers to the view. This is
  // probably a bug that needs fixing.

  NS_ENSURE_ARG_POINTER(aStatus);
  NS_ENSURE_ARG_POINTER(aHdrChanged);

  nsMsgViewIndex index = FindHdr(aHdrChanged);
  if (index == nsMsgViewIndex_None)  // message does not appear in view
    return NS_OK;

  nsCString originStr;
  (void)aHdrChanged->GetStringProperty("junkscoreorigin", originStr);
  // check for "plugin" with only first character for performance
  bool plugin = (originStr.get()[0] == 'p');

  if (aPreChange) {
    // first call, done prior to the change
    *aStatus = plugin;
    return NS_OK;
  }

  // second call, done after the change
  bool wasPlugin = *aStatus;

  bool match = true;
  nsCOMPtr<nsIMsgSearchSession> searchSession(
      do_QueryReferent(m_searchSession));
  if (searchSession) searchSession->MatchHdr(aHdrChanged, m_db, &match);

  if (!match && plugin && !wasPlugin)
    RemoveByIndex(index);  // remove hdr from view
  else
    NoteChange(index, 1, nsMsgViewNotificationCode::changed);

  return NS_OK;
}

NS_IMETHODIMP
nsMsgQuickSearchDBView::GetSearchSession(nsIMsgSearchSession** aSession) {
  NS_ASSERTION(false, "GetSearchSession method is not implemented");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsMsgQuickSearchDBView::SetSearchSession(nsIMsgSearchSession* aSession) {
  m_searchSession = do_GetWeakReference(aSession);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgQuickSearchDBView::OnSearchHit(nsIMsgDBHdr* aMsgHdr,
                                    nsIMsgFolder* folder) {
  NS_ENSURE_ARG(aMsgHdr);
  if (!m_db) return NS_ERROR_NULL_POINTER;
  // remember search hit and when search is done, reconcile cache
  // with new hits;
  m_hdrHits.AppendObject(aMsgHdr);
  nsMsgKey key;
  aMsgHdr->GetMessageKey(&key);
  // Is FindKey going to be expensive here? A lot of hits could make
  // it a little bit slow to search through the view for every hit.
  if (m_cacheEmpty || FindKey(key, false) == nsMsgViewIndex_None)
    return AddHdr(aMsgHdr);
  else
    return NS_OK;
}

NS_IMETHODIMP
nsMsgQuickSearchDBView::OnSearchDone(nsresult status) {
  // This batch began in OnNewSearch.
  if (mJSTree) mJSTree->EndUpdateBatch();
  // We're a single-folder virtual folder if viewFolder != folder, and that is
  // the only case in which we want to be messing about with a results cache
  // or unread counts.
  if (m_db && m_viewFolder && m_viewFolder != m_folder) {
    nsTArray<nsMsgKey> keyArray;
    nsCString searchUri;
    m_viewFolder->GetURI(searchUri);
    uint32_t count = m_hdrHits.Count();
    // Build up message keys. The cache expects them to be sorted.
    for (uint32_t i = 0; i < count; i++) {
      nsMsgKey key;
      m_hdrHits[i]->GetMessageKey(&key);
      keyArray.AppendElement(key);
    }
    keyArray.Sort();
    nsTArray<nsMsgKey> staleHits;
    nsresult rv = m_db->RefreshCache(searchUri, keyArray, staleHits);
    NS_ENSURE_SUCCESS(rv, rv);
    for (nsMsgKey staleKey : staleHits) {
      nsCOMPtr<nsIMsgDBHdr> hdrDeleted;
      m_db->GetMsgHdrForKey(staleKey, getter_AddRefs(hdrDeleted));
      if (hdrDeleted) OnHdrDeleted(hdrDeleted, nsMsgKey_None, 0, this);
    }

    nsCOMPtr<nsIMsgDatabase> virtDatabase;
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    rv = m_viewFolder->GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                                            getter_AddRefs(virtDatabase));
    NS_ENSURE_SUCCESS(rv, rv);
    uint32_t numUnread = 0;
    size_t numTotal = m_origKeys.Length();

    for (size_t i = 0; i < m_origKeys.Length(); i++) {
      bool isRead;
      m_db->IsRead(m_origKeys[i], &isRead);
      if (!isRead) numUnread++;
    }
    dbFolderInfo->SetNumUnreadMessages(numUnread);
    dbFolderInfo->SetNumMessages(numTotal);
    m_viewFolder->UpdateSummaryTotals(true);  // force update from db.
    virtDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
  }
  if (m_sortType !=
      nsMsgViewSortType::byThread)  // we do not find levels for the results.
  {
    m_sortValid = false;  // sort the results
    Sort(m_sortType, m_sortOrder);
  }
  if (m_viewFolder && (m_viewFolder != m_folder))
    SetMRUTimeForFolder(m_viewFolder);

  return NS_OK;
}

NS_IMETHODIMP
nsMsgQuickSearchDBView::OnNewSearch() {
  int32_t oldSize = GetSize();

  m_keys.Clear();
  m_levels.Clear();
  m_flags.Clear();
  m_hdrHits.Clear();
  // this needs to happen after we remove all the keys, since RowCountChanged()
  // will call our GetRowCount()
  if (mTree) mTree->RowCountChanged(0, -oldSize);
  if (mJSTree) mJSTree->RowCountChanged(0, -oldSize);
  uint32_t folderFlags = 0;
  if (m_viewFolder) m_viewFolder->GetFlags(&folderFlags);
  // check if it's a virtual folder - if so, we should get the cached hits
  // from the db, and set a flag saying that we're using cached values.
  if (folderFlags & nsMsgFolderFlags::Virtual) {
    nsCOMPtr<nsIMsgEnumerator> cachedHits;
    nsCString searchUri;
    m_viewFolder->GetURI(searchUri);
    m_db->GetCachedHits(searchUri, getter_AddRefs(cachedHits));
    if (cachedHits) {
      bool hasMore;

      m_usingCachedHits = true;
      cachedHits->HasMoreElements(&hasMore);
      m_cacheEmpty = !hasMore;
      if (mTree) mTree->BeginUpdateBatch();
      if (mJSTree) mJSTree->BeginUpdateBatch();
      while (hasMore) {
        nsCOMPtr<nsIMsgDBHdr> header;
        nsresult rv = cachedHits->GetNext(getter_AddRefs(header));
        if (header && NS_SUCCEEDED(rv))
          AddHdr(header);
        else
          break;
        cachedHits->HasMoreElements(&hasMore);
      }
      if (mTree) mTree->EndUpdateBatch();
      if (mJSTree) mJSTree->EndUpdateBatch();
    }
  }

  // Prevent updates for every message found. This batch ends in OnSearchDone.
  if (mJSTree) mJSTree->BeginUpdateBatch();

  return NS_OK;
}

nsresult nsMsgQuickSearchDBView::GetFirstMessageHdrToDisplayInThread(
    nsIMsgThread* threadHdr, nsIMsgDBHdr** result) {
  uint32_t numChildren;
  nsresult rv = NS_OK;
  uint8_t minLevel = 0xff;
  threadHdr->GetNumChildren(&numChildren);
  nsMsgKey threadRootKey;
  nsCOMPtr<nsIMsgDBHdr> rootParent;
  threadHdr->GetRootHdr(getter_AddRefs(rootParent));
  if (rootParent)
    rootParent->GetMessageKey(&threadRootKey);
  else
    threadHdr->GetThreadKey(&threadRootKey);

  nsCOMPtr<nsIMsgDBHdr> retHdr;

  // iterate over thread, finding mgsHdr in view with the lowest level.
  for (uint32_t childIndex = 0; childIndex < numChildren; childIndex++) {
    nsCOMPtr<nsIMsgDBHdr> child;
    rv = threadHdr->GetChildHdrAt(childIndex, getter_AddRefs(child));
    if (NS_SUCCEEDED(rv) && child) {
      nsMsgKey msgKey;
      child->GetMessageKey(&msgKey);

      // this works because we've already sorted m_keys by id.
      nsMsgViewIndex keyIndex = m_origKeys.BinaryIndexOf(msgKey);
      if (keyIndex != nsMsgViewIndex_None) {
        // this is the root, so it's the best we're going to do.
        if (msgKey == threadRootKey) {
          retHdr = child;
          break;
        }
        uint8_t level = 0;
        nsMsgKey parentId;
        child->GetThreadParent(&parentId);
        nsCOMPtr<nsIMsgDBHdr> parent;
        // count number of ancestors - that's our level
        while (parentId != nsMsgKey_None) {
          m_db->GetMsgHdrForKey(parentId, getter_AddRefs(parent));
          if (parent) {
            nsMsgKey saveParentId = parentId;
            parent->GetThreadParent(&parentId);
            // message is it's own parent - bad, let's break out of here.
            // Or we've got some circular ancestry.
            if (parentId == saveParentId || level > numChildren) break;
            level++;
          } else  // if we can't find the parent, don't loop forever.
            break;
        }
        if (level < minLevel) {
          minLevel = level;
          retHdr = child;
        }
      }
    }
  }
  retHdr.forget(result);
  return NS_OK;
}

nsresult nsMsgQuickSearchDBView::SortThreads(
    nsMsgViewSortTypeValue sortType, nsMsgViewSortOrderValue sortOrder) {
  // don't need to sort by threads for group view.
  if (m_viewFlags & nsMsgViewFlagsType::kGroupBySort) return NS_OK;
  // iterate over the messages in the view, getting the thread id's
  // sort m_keys so we can quickly find if a key is in the view.
  m_keys.Sort();
  // array of the threads' root hdr keys.
  nsTArray<nsMsgKey> threadRootIds;
  nsCOMPtr<nsIMsgDBHdr> rootHdr;
  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  nsCOMPtr<nsIMsgThread> threadHdr;
  for (uint32_t i = 0; i < m_keys.Length(); i++) {
    GetMsgHdrForViewIndex(i, getter_AddRefs(msgHdr));
    m_db->GetThreadContainingMsgHdr(msgHdr, getter_AddRefs(threadHdr));
    if (threadHdr) {
      nsMsgKey rootKey;
      threadHdr->GetChildKeyAt(0, &rootKey);
      nsMsgViewIndex threadRootIndex = threadRootIds.BinaryIndexOf(rootKey);
      // if we already have that id in top level threads, ignore this msg.
      if (threadRootIndex != nsMsgViewIndex_None) continue;
      // it would be nice if GetInsertIndexHelper always found the hdr, but it
      // doesn't.
      threadHdr->GetChildHdrAt(0, getter_AddRefs(rootHdr));
      if (!rootHdr) continue;
      threadRootIndex = GetInsertIndexHelper(rootHdr, threadRootIds, nullptr,
                                             nsMsgViewSortOrder::ascending,
                                             nsMsgViewSortType::byId);
      threadRootIds.InsertElementAt(threadRootIndex, rootKey);
    }
  }

  // Need to sort the top level threads now by sort order, even if it's by id
  // and ascending (which is the order per above), to ensure certain side
  // effects of nsMsgDBView::Sort().
  m_sortType = nsMsgViewSortType::byNone;  // sort from scratch
  m_keys.SwapElements(threadRootIds);
  nsMsgDBView::Sort(sortType, sortOrder);
  threadRootIds.SwapElements(m_keys);
  m_keys.Clear();
  m_levels.Clear();
  m_flags.Clear();
  // now we've build up the list of thread ids - need to build the view
  // from that. So for each thread id, we need to list the messages in the
  // thread.
  uint32_t numThreads = threadRootIds.Length();
  for (uint32_t threadIndex = 0; threadIndex < numThreads; threadIndex++) {
    m_db->GetMsgHdrForKey(threadRootIds[threadIndex], getter_AddRefs(rootHdr));
    if (rootHdr) {
      nsCOMPtr<nsIMsgDBHdr> displayRootHdr;
      m_db->GetThreadContainingMsgHdr(rootHdr, getter_AddRefs(threadHdr));
      if (threadHdr) {
        nsMsgKey rootKey;
        uint32_t rootFlags;
        GetFirstMessageHdrToDisplayInThread(threadHdr,
                                            getter_AddRefs(displayRootHdr));
        if (!displayRootHdr) continue;
        displayRootHdr->GetMessageKey(&rootKey);
        displayRootHdr->GetFlags(&rootFlags);
        rootFlags |= MSG_VIEW_FLAG_ISTHREAD;
        m_keys.AppendElement(rootKey);
        m_flags.AppendElement(rootFlags);
        m_levels.AppendElement(0);

        nsMsgViewIndex startOfThreadViewIndex = m_keys.Length();
        nsMsgViewIndex rootIndex = startOfThreadViewIndex - 1;
        uint32_t numListed = 0;
        ListIdsInThreadOrder(threadHdr, rootKey, 1, &startOfThreadViewIndex,
                             &numListed);
        if (numListed > 0)
          m_flags[rootIndex] = rootFlags | MSG_VIEW_FLAG_HASCHILDREN;
      }
    }
  }

  // The thread state is left expanded (despite viewFlags) so at least reflect
  // the correct state.
  m_viewFlags |= nsMsgViewFlagsType::kExpandAll;

  return NS_OK;
}

nsresult nsMsgQuickSearchDBView::ListCollapsedChildren(
    nsMsgViewIndex viewIndex, nsTArray<RefPtr<nsIMsgDBHdr>>& messageArray) {
  nsCOMPtr<nsIMsgThread> threadHdr;
  nsresult rv = GetThreadContainingIndex(viewIndex, getter_AddRefs(threadHdr));
  NS_ENSURE_SUCCESS(rv, rv);
  uint32_t numChildren;
  threadHdr->GetNumChildren(&numChildren);
  nsCOMPtr<nsIMsgDBHdr> rootHdr;
  nsMsgKey rootKey;
  GetMsgHdrForViewIndex(viewIndex, getter_AddRefs(rootHdr));
  rootHdr->GetMessageKey(&rootKey);
  // group threads can have the root key twice, one for the dummy row.
  bool rootKeySkipped = false;
  for (uint32_t i = 0; i < numChildren; i++) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    threadHdr->GetChildHdrAt(i, getter_AddRefs(msgHdr));
    if (msgHdr) {
      nsMsgKey msgKey;
      msgHdr->GetMessageKey(&msgKey);
      if (msgKey != rootKey || (GroupViewUsesDummyRow() && rootKeySkipped)) {
        // if this hdr is in the original view, add it to new view.
        if (m_origKeys.BinaryIndexOf(msgKey) != m_origKeys.NoIndex)
          messageArray.AppendElement(msgHdr);
      } else {
        rootKeySkipped = true;
      }
    }
  }
  return NS_OK;
}

nsresult nsMsgQuickSearchDBView::ListIdsInThread(
    nsIMsgThread* threadHdr, nsMsgViewIndex startOfThreadViewIndex,
    uint32_t* pNumListed) {
  if (m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay &&
      !(m_viewFlags & nsMsgViewFlagsType::kGroupBySort)) {
    nsMsgKey parentKey = m_keys[startOfThreadViewIndex++];
    return ListIdsInThreadOrder(threadHdr, parentKey, 1,
                                &startOfThreadViewIndex, pNumListed);
  }

  uint32_t numChildren;
  threadHdr->GetNumChildren(&numChildren);
  uint32_t i;
  uint32_t viewIndex = startOfThreadViewIndex + 1;
  nsCOMPtr<nsIMsgDBHdr> rootHdr;
  nsMsgKey rootKey;
  uint32_t rootFlags = m_flags[startOfThreadViewIndex];
  *pNumListed = 0;
  GetMsgHdrForViewIndex(startOfThreadViewIndex, getter_AddRefs(rootHdr));
  rootHdr->GetMessageKey(&rootKey);
  // group threads can have the root key twice, one for the dummy row.
  bool rootKeySkipped = false;
  for (i = 0; i < numChildren; i++) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    threadHdr->GetChildHdrAt(i, getter_AddRefs(msgHdr));
    if (msgHdr != nullptr) {
      nsMsgKey msgKey;
      msgHdr->GetMessageKey(&msgKey);
      if (msgKey != rootKey || (GroupViewUsesDummyRow() && rootKeySkipped)) {
        nsMsgViewIndex threadRootIndex = m_origKeys.BinaryIndexOf(msgKey);
        // if this hdr is in the original view, add it to new view.
        if (threadRootIndex != nsMsgViewIndex_None) {
          uint32_t childFlags;
          msgHdr->GetFlags(&childFlags);
          InsertMsgHdrAt(
              viewIndex, msgHdr, msgKey, childFlags,
              FindLevelInThread(msgHdr, startOfThreadViewIndex, viewIndex));
          if (!(rootFlags & MSG_VIEW_FLAG_HASCHILDREN))
            m_flags[startOfThreadViewIndex] =
                rootFlags | MSG_VIEW_FLAG_HASCHILDREN;

          viewIndex++;
          (*pNumListed)++;
        }
      } else {
        rootKeySkipped = true;
      }
    }
  }
  return NS_OK;
}

nsresult nsMsgQuickSearchDBView::ListIdsInThreadOrder(
    nsIMsgThread* threadHdr, nsMsgKey parentKey, uint32_t level,
    uint32_t callLevel, nsMsgKey keyToSkip, nsMsgViewIndex* viewIndex,
    uint32_t* pNumListed) {
  nsCOMPtr<nsIMsgEnumerator> msgEnumerator;
  nsresult rv =
      threadHdr->EnumerateMessages(parentKey, getter_AddRefs(msgEnumerator));
  NS_ENSURE_SUCCESS(rv, rv);

  // We use the numChildren as a sanity check on the thread structure.
  uint32_t numChildren;
  (void)threadHdr->GetNumChildren(&numChildren);
  bool hasMore;
  while (NS_SUCCEEDED(rv = msgEnumerator->HasMoreElements(&hasMore)) &&
         hasMore) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    rv = msgEnumerator->GetNext(getter_AddRefs(msgHdr));
    NS_ENSURE_SUCCESS(rv, rv);

    nsMsgKey msgKey;
    msgHdr->GetMessageKey(&msgKey);
    if (msgKey == keyToSkip) continue;

    // If we discover depths of more than numChildren, it means we have
    // some sort of circular thread relationship and we bail out of the
    // while loop before overflowing the stack with recursive calls.
    // Technically, this is an error, but forcing a database rebuild
    // is too destructive so we just return.
    if (*pNumListed > numChildren || callLevel > numChildren) {
      NS_ERROR("loop in message threading while listing children");
      return NS_OK;
    }

    int32_t childLevel = level;
    if (m_origKeys.BinaryIndexOf(msgKey) != m_origKeys.NoIndex) {
      uint32_t msgFlags;
      msgHdr->GetFlags(&msgFlags);
      InsertMsgHdrAt(*viewIndex, msgHdr, msgKey, msgFlags & ~MSG_VIEW_FLAGS,
                     level);
      (*pNumListed)++;
      (*viewIndex)++;
      childLevel++;
    }
    rv = ListIdsInThreadOrder(threadHdr, msgKey, childLevel, callLevel + 1,
                              keyToSkip, viewIndex, pNumListed);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return rv;
}

nsresult nsMsgQuickSearchDBView::ListIdsInThreadOrder(nsIMsgThread* threadHdr,
                                                      nsMsgKey parentKey,
                                                      uint32_t level,
                                                      nsMsgViewIndex* viewIndex,
                                                      uint32_t* pNumListed) {
  nsresult rv = ListIdsInThreadOrder(threadHdr, parentKey, level, level,
                                     nsMsgKey_None, viewIndex, pNumListed);
  // Because a quick search view might not have the actual thread root
  // as its root, and thus might have a message that potentially has siblings
  // as its root, and the enumerator will miss the siblings, we might need to
  // make a pass looking for the siblings of the non-root root. We'll put
  // those after the potential children of the root. So we will list the
  // children of the faux root's parent, ignoring the faux root.
  if (level == 1) {
    nsCOMPtr<nsIMsgDBHdr> root;
    nsCOMPtr<nsIMsgDBHdr> rootParent;
    nsMsgKey rootKey;
    threadHdr->GetRootHdr(getter_AddRefs(rootParent));
    if (rootParent) {
      rootParent->GetMessageKey(&rootKey);
      if (rootKey != parentKey)
        rv = ListIdsInThreadOrder(threadHdr, rootKey, level, level, parentKey,
                                  viewIndex, pNumListed);
    }
  }
  return rv;
}

nsresult nsMsgQuickSearchDBView::ExpansionDelta(nsMsgViewIndex index,
                                                int32_t* expansionDelta) {
  *expansionDelta = 0;
  if (index >= ((nsMsgViewIndex)m_keys.Length()))
    return NS_MSG_MESSAGE_NOT_FOUND;

  char flags = m_flags[index];

  if (!(m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay)) return NS_OK;

  nsCOMPtr<nsIMsgThread> threadHdr;
  nsresult rv = GetThreadContainingIndex(index, getter_AddRefs(threadHdr));
  NS_ENSURE_SUCCESS(rv, rv);
  uint32_t numChildren;
  threadHdr->GetNumChildren(&numChildren);
  nsCOMPtr<nsIMsgDBHdr> rootHdr;
  nsMsgKey rootKey;
  GetMsgHdrForViewIndex(index, getter_AddRefs(rootHdr));
  rootHdr->GetMessageKey(&rootKey);
  // group threads can have the root key twice, one for the dummy row.
  bool rootKeySkipped = false;
  for (uint32_t i = 0; i < numChildren; i++) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    threadHdr->GetChildHdrAt(i, getter_AddRefs(msgHdr));
    if (msgHdr) {
      nsMsgKey msgKey;
      msgHdr->GetMessageKey(&msgKey);
      if (msgKey != rootKey || (GroupViewUsesDummyRow() && rootKeySkipped)) {
        // if this hdr is in the original view, add it to new view.
        if (m_origKeys.BinaryIndexOf(msgKey) != m_origKeys.NoIndex)
          (*expansionDelta)++;
      } else {
        rootKeySkipped = true;
      }
    }
  }
  if (!(flags & nsMsgMessageFlags::Elided))
    *expansionDelta = -(*expansionDelta);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgQuickSearchDBView::OpenWithHdrs(nsIMsgEnumerator* aHeaders,
                                     nsMsgViewSortTypeValue aSortType,
                                     nsMsgViewSortOrderValue aSortOrder,
                                     nsMsgViewFlagsTypeValue aViewFlags) {
  if (aViewFlags & nsMsgViewFlagsType::kGroupBySort)
    return nsMsgGroupView::OpenWithHdrs(aHeaders, aSortType, aSortOrder,
                                        aViewFlags);

  m_sortType = aSortType;
  m_sortOrder = aSortOrder;
  m_viewFlags = aViewFlags;

  bool hasMore;
  nsCOMPtr<nsISupports> supports;
  nsresult rv = NS_OK;
  while (NS_SUCCEEDED(rv = aHeaders->HasMoreElements(&hasMore)) && hasMore) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    rv = aHeaders->GetNext(getter_AddRefs(msgHdr));
    if (NS_SUCCEEDED(rv) && msgHdr) {
      AddHdr(msgHdr);
    } else {
      break;
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgQuickSearchDBView::SetViewFlags(
    nsMsgViewFlagsTypeValue aViewFlags) {
  nsresult rv = NS_OK;
  // if the grouping has changed, rebuild the view
  if ((m_viewFlags & nsMsgViewFlagsType::kGroupBySort) ^
      (aViewFlags & nsMsgViewFlagsType::kGroupBySort))
    rv = RebuildView(aViewFlags);
  nsMsgDBView::SetViewFlags(aViewFlags);

  return rv;
}

nsresult nsMsgQuickSearchDBView::GetMessageEnumerator(
    nsIMsgEnumerator** enumerator) {
  return GetViewEnumerator(enumerator);
}

NS_IMETHODIMP
nsMsgQuickSearchDBView::OnHdrDeleted(nsIMsgDBHdr* aHdrDeleted,
                                     nsMsgKey aParentKey, int32_t aFlags,
                                     nsIDBChangeListener* aInstigator) {
  NS_ENSURE_ARG_POINTER(aHdrDeleted);
  nsMsgKey msgKey;
  aHdrDeleted->GetMessageKey(&msgKey);
  size_t keyIndex = m_origKeys.BinaryIndexOf(msgKey);
  if (keyIndex != m_origKeys.NoIndex) m_origKeys.RemoveElementAt(keyIndex);
  return nsMsgThreadedDBView::OnHdrDeleted(aHdrDeleted, aParentKey, aFlags,
                                           aInstigator);
}

NS_IMETHODIMP nsMsgQuickSearchDBView::GetNumMsgsInView(int32_t* aNumMsgs) {
  NS_ENSURE_ARG_POINTER(aNumMsgs);
  *aNumMsgs = m_origKeys.Length();
  return NS_OK;
}
