/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nsMsgGroupThread.h"
#include "nsMsgDBView.h"
#include "nsMsgMessageFlags.h"
#include "nsMsgUtils.h"
#include "nsSimpleEnumerator.h"

NS_IMPL_ISUPPORTS(nsMsgGroupThread, nsIMsgThread)

nsMsgGroupThread::nsMsgGroupThread(nsIMsgDatabase* db,
                                   nsMsgViewSortOrderValue sortOrder) {
  m_threadKey = nsMsgKey_None;
  m_threadRootKey = nsMsgKey_None;
  m_numNewChildren = 0;
  m_numUnreadChildren = 0;
  m_flags = 0;
  m_newestMsgDate = 0;
  m_dummy = false;
  m_db = db;
  m_sortOrder = sortOrder;
}

nsMsgGroupThread::~nsMsgGroupThread() {}

already_AddRefed<nsMsgGroupThread> nsMsgGroupThread::Clone() {
  RefPtr<nsMsgGroupThread> thread = new nsMsgGroupThread(m_db, m_sortOrder);
  thread->m_threadKey = m_threadKey;
  thread->m_threadRootKey = m_threadRootKey;
  thread->m_numNewChildren = m_numNewChildren;
  thread->m_numUnreadChildren = m_numUnreadChildren;
  thread->m_flags = m_flags;
  thread->m_newestMsgDate = m_newestMsgDate;
  thread->m_dummy = m_dummy;
  thread->m_keys = m_keys.Clone();
  return thread.forget();
}

NS_IMETHODIMP nsMsgGroupThread::SetThreadKey(nsMsgKey threadKey) {
  m_threadKey = threadKey;
  // by definition, the initial thread key is also the thread root key.
  m_threadRootKey = threadKey;
  return NS_OK;
}

NS_IMETHODIMP nsMsgGroupThread::GetThreadKey(nsMsgKey* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = m_threadKey;
  return NS_OK;
}

NS_IMETHODIMP nsMsgGroupThread::GetFlags(uint32_t* aFlags) {
  NS_ENSURE_ARG_POINTER(aFlags);
  *aFlags = m_flags;
  return NS_OK;
}

NS_IMETHODIMP nsMsgGroupThread::SetFlags(uint32_t aFlags) {
  m_flags = aFlags;
  return NS_OK;
}

NS_IMETHODIMP nsMsgGroupThread::SetSubject(const nsACString& aSubject) {
  NS_ASSERTION(false, "shouldn't call this");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgGroupThread::GetSubject(nsACString& result) {
  NS_ASSERTION(false, "shouldn't call this");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgGroupThread::GetNumChildren(uint32_t* aNumChildren) {
  NS_ENSURE_ARG_POINTER(aNumChildren);
  *aNumChildren = m_keys.Length();  // - ((m_dummy) ? 1 : 0);
  return NS_OK;
}

uint32_t nsMsgGroupThread::NumRealChildren() {
  return m_keys.Length() - ((m_dummy) ? 1 : 0);
}

NS_IMETHODIMP nsMsgGroupThread::GetNumNewChildren(uint32_t* aNumNewChildren) {
  NS_ENSURE_ARG_POINTER(aNumNewChildren);
  *aNumNewChildren = m_numNewChildren;
  return NS_OK;
}

NS_IMETHODIMP nsMsgGroupThread::GetNumUnreadChildren(
    uint32_t* aNumUnreadChildren) {
  NS_ENSURE_ARG_POINTER(aNumUnreadChildren);
  *aNumUnreadChildren = m_numUnreadChildren;
  return NS_OK;
}

void nsMsgGroupThread::InsertMsgHdrAt(nsMsgViewIndex index, nsIMsgDBHdr* hdr) {
  nsMsgKey msgKey;
  hdr->GetMessageKey(&msgKey);
  m_keys.InsertElementAt(index, msgKey);
}

void nsMsgGroupThread::SetMsgHdrAt(nsMsgViewIndex index, nsIMsgDBHdr* hdr) {
  nsMsgKey msgKey;
  hdr->GetMessageKey(&msgKey);
  m_keys[index] = msgKey;
}

nsMsgViewIndex nsMsgGroupThread::FindMsgHdr(nsIMsgDBHdr* hdr) {
  nsMsgKey msgKey;
  hdr->GetMessageKey(&msgKey);
  return (nsMsgViewIndex)m_keys.IndexOf(msgKey);
}

NS_IMETHODIMP nsMsgGroupThread::AddChild(nsIMsgDBHdr* child,
                                         nsIMsgDBHdr* inReplyTo,
                                         bool threadInThread,
                                         nsIDBChangeAnnouncer* announcer) {
  NS_ASSERTION(false, "shouldn't call this");
  return NS_ERROR_NOT_IMPLEMENTED;
}

nsMsgViewIndex nsMsgGroupThread::AddMsgHdrInDateOrder(nsIMsgDBHdr* child,
                                                      nsMsgDBView* view) {
  nsMsgKey newHdrKey;
  child->GetMessageKey(&newHdrKey);
  uint32_t insertIndex = 0;
  // since we're sorted by date, we could do a binary search for the
  // insert point. Or, we could start at the end...
  if (m_keys.Length() > 0) {
    // sort by date within group.
    insertIndex = GetInsertIndexFromView(view, child, m_sortOrder);
  }
  m_keys.InsertElementAt(insertIndex, newHdrKey);
  if (!insertIndex) m_threadRootKey = newHdrKey;
  return insertIndex;
}

nsMsgViewIndex nsMsgGroupThread::GetInsertIndexFromView(
    nsMsgDBView* view, nsIMsgDBHdr* child,
    nsMsgViewSortOrderValue threadSortOrder) {
  return view->GetInsertIndexHelper(child, m_keys, nullptr, threadSortOrder,
                                    nsMsgViewSortType::byDate);
}

nsMsgViewIndex nsMsgGroupThread::AddChildFromGroupView(nsIMsgDBHdr* child,
                                                       nsMsgDBView* view) {
  uint32_t newHdrFlags = 0;
  nsMsgKey newHdrKey = 0;

  child->GetFlags(&newHdrFlags);
  child->GetMessageKey(&newHdrKey);

  uint32_t unused;
  child->AndFlags(~(nsMsgMessageFlags::Watched), &unused);
  uint32_t numChildren;

  // get the num children before we add the new header.
  GetNumChildren(&numChildren);

  // if this is an empty thread, set the root key to this header's key
  if (numChildren == 0) m_threadRootKey = newHdrKey;

  if (newHdrFlags & nsMsgMessageFlags::New) ChangeNewChildCount(1);
  if (!(newHdrFlags & nsMsgMessageFlags::Read)) ChangeUnreadChildCount(1);

  return AddMsgHdrInDateOrder(child, view);
}

nsresult nsMsgGroupThread::ReparentNonReferenceChildrenOf(
    nsIMsgDBHdr* topLevelHdr, nsMsgKey newParentKey,
    nsIDBChangeAnnouncer* announcer) {
  return NS_OK;
}

NS_IMETHODIMP nsMsgGroupThread::GetChildKeyAt(uint32_t aIndex,
                                              nsMsgKey* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  if (aIndex >= m_keys.Length()) return NS_ERROR_INVALID_ARG;
  *aResult = m_keys[aIndex];
  return NS_OK;
}

NS_IMETHODIMP nsMsgGroupThread::GetChildHdrAt(uint32_t aIndex,
                                              nsIMsgDBHdr** aResult) {
  if (aIndex >= m_keys.Length()) return NS_MSG_MESSAGE_NOT_FOUND;
  return m_db->GetMsgHdrForKey(m_keys[aIndex], aResult);
}

NS_IMETHODIMP nsMsgGroupThread::GetChild(nsMsgKey msgKey,
                                         nsIMsgDBHdr** aResult) {
  return GetChildHdrAt(m_keys.IndexOf(msgKey), aResult);
}

NS_IMETHODIMP nsMsgGroupThread::RemoveChildAt(uint32_t aIndex) {
  NS_ENSURE_TRUE(aIndex < m_keys.Length(), NS_MSG_MESSAGE_NOT_FOUND);

  m_keys.RemoveElementAt(aIndex);
  return NS_OK;
}

nsresult nsMsgGroupThread::RemoveChild(nsMsgKey msgKey) {
  m_keys.RemoveElement(msgKey);
  return NS_OK;
}

NS_IMETHODIMP nsMsgGroupThread::RemoveChildHdr(
    nsIMsgDBHdr* child, nsIDBChangeAnnouncer* announcer) {
  NS_ENSURE_ARG_POINTER(child);

  uint32_t flags;
  nsMsgKey key;

  child->GetFlags(&flags);
  child->GetMessageKey(&key);

  // if this was the newest msg, clear the newest msg date so we'll recalc.
  uint32_t date;
  child->GetDateInSeconds(&date);
  if (date == m_newestMsgDate) SetNewestMsgDate(0);

  if (flags & nsMsgMessageFlags::New) ChangeNewChildCount(-1);
  if (!(flags & nsMsgMessageFlags::Read)) ChangeUnreadChildCount(-1);
  nsMsgViewIndex threadIndex = FindMsgHdr(child);
  bool wasFirstChild = threadIndex == 0;
  nsresult rv = RemoveChildAt(threadIndex);
  // if we're deleting the root of a dummy thread, need to update the threadKey
  // and the dummy header at position 0
  if (m_dummy && wasFirstChild && m_keys.Length() > 1) {
    nsIMsgDBHdr* newRootChild;
    rv = GetChildHdrAt(1, &newRootChild);
    NS_ENSURE_SUCCESS(rv, rv);
    SetMsgHdrAt(0, newRootChild);
  }

  return rv;
}

nsresult nsMsgGroupThread::ReparentChildrenOf(nsMsgKey oldParent,
                                              nsMsgKey newParent,
                                              nsIDBChangeAnnouncer* announcer) {
  nsresult rv = NS_OK;

  uint32_t numChildren = 0;
  GetNumChildren(&numChildren);

  if (numChildren > 0) {
    nsCOMPtr<nsIMsgDBHdr> curHdr;
    for (uint32_t childIndex = 0; childIndex < numChildren; childIndex++) {
      rv = GetChildHdrAt(childIndex, getter_AddRefs(curHdr));
      if (NS_SUCCEEDED(rv) && curHdr) {
        nsMsgKey threadParent;

        curHdr->GetThreadParent(&threadParent);
        if (threadParent == oldParent) {
          nsMsgKey curKey;

          curHdr->SetThreadParent(newParent);
          curHdr->GetMessageKey(&curKey);
          if (announcer)
            announcer->NotifyParentChangedAll(curKey, oldParent, newParent,
                                              nullptr);
          // if the old parent was the root of the thread, then only the first
          // child gets promoted to root, and other children become children of
          // the new root.
          if (newParent == nsMsgKey_None) {
            m_threadRootKey = curKey;
            newParent = curKey;
          }
        }
      }
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgGroupThread::MarkChildNew(bool bNew) {
  ChangeNewChildCount(bNew ? 1 : -1);
  return NS_OK;
}

NS_IMETHODIMP nsMsgGroupThread::MarkChildRead(bool bRead) {
  ChangeUnreadChildCount(bRead ? -1 : 1);
  return NS_OK;
}

NS_IMETHODIMP nsMsgGroupThread::EnumerateMessages(nsMsgKey parentKey,
                                                  nsIMsgEnumerator** result) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgGroupThread::GetRootHdr(nsIMsgDBHdr** result) {
  NS_ENSURE_ARG_POINTER(result);

  *result = nullptr;
  int32_t resultIndex = -1;

  if (m_threadRootKey != nsMsgKey_None) {
    nsresult ret = GetChildHdrForKey(m_threadRootKey, result, &resultIndex);
    if (NS_SUCCEEDED(ret) && *result)
      return ret;
    else {
      printf("need to reset thread root key\n");
      uint32_t numChildren;
      nsMsgKey threadParentKey = nsMsgKey_None;
      GetNumChildren(&numChildren);

      for (uint32_t childIndex = 0; childIndex < numChildren; childIndex++) {
        nsCOMPtr<nsIMsgDBHdr> curChild;
        ret = GetChildHdrAt(childIndex, getter_AddRefs(curChild));
        if (NS_SUCCEEDED(ret) && curChild) {
          nsMsgKey parentKey;

          curChild->GetThreadParent(&parentKey);
          if (parentKey == nsMsgKey_None) {
            NS_ASSERTION(!(*result), "two top level msgs, not good");
            curChild->GetMessageKey(&threadParentKey);
            m_threadRootKey = threadParentKey;
            curChild.forget(result);
          }
        }
      }
      if (*result) {
        return NS_OK;
      }
    }
    // if we can't get the thread root key, we'll just get the first hdr.
    // there's a bug where sometimes we weren't resetting the thread root key
    // when removing the thread root key.
  }
  return GetChildHdrAt(0, result);
}

nsresult nsMsgGroupThread::ChangeNewChildCount(int32_t delta) {
  m_numNewChildren += delta;
  return NS_OK;
}

nsresult nsMsgGroupThread::ChangeUnreadChildCount(int32_t delta) {
  m_numUnreadChildren += delta;
  return NS_OK;
}

nsresult nsMsgGroupThread::GetChildHdrForKey(nsMsgKey desiredKey,
                                             nsIMsgDBHdr** result,
                                             int32_t* resultIndex) {
  NS_ENSURE_ARG_POINTER(result);

  nsresult rv = NS_OK;  // XXX or should this default to an error?
  uint32_t numChildren = 0;
  GetNumChildren(&numChildren);

  uint32_t childIndex;
  for (childIndex = 0; childIndex < numChildren; childIndex++) {
    nsCOMPtr<nsIMsgDBHdr> child;
    rv = GetChildHdrAt(childIndex, getter_AddRefs(child));
    if (NS_SUCCEEDED(rv) && child) {
      nsMsgKey msgKey;
      // we're only doing one level of threading, so check if caller is
      // asking for children of the first message in the thread or not.
      // if not, we will tell him there are no children.
      child->GetMessageKey(&msgKey);

      if (msgKey == desiredKey) {
        child.forget(result);
        break;
      }
    }
  }
  if (resultIndex) *resultIndex = (int32_t)childIndex;

  return rv;
}

NS_IMETHODIMP nsMsgGroupThread::GetFirstUnreadChild(nsIMsgDBHdr** result) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgGroupThread::GetNewestMsgDate(uint32_t* aResult) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgGroupThread::SetNewestMsgDate(uint32_t aNewestMsgDate) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

nsMsgXFGroupThread::nsMsgXFGroupThread(nsMsgViewSortOrderValue sortOrder)
    : nsMsgGroupThread(nullptr, sortOrder) {}

already_AddRefed<nsMsgXFGroupThread> nsMsgXFGroupThread::Clone() {
  RefPtr<nsMsgXFGroupThread> thread = new nsMsgXFGroupThread(0);
  thread->m_threadKey = m_threadKey;
  thread->m_threadRootKey = m_threadRootKey;
  thread->m_numNewChildren = m_numNewChildren;
  thread->m_numUnreadChildren = m_numUnreadChildren;
  thread->m_flags = m_flags;
  thread->m_newestMsgDate = m_newestMsgDate;
  thread->m_dummy = m_dummy;
  thread->m_sortOrder = m_sortOrder;
  thread->m_keys = m_keys.Clone();
  thread->m_folders.SetCapacity(m_folders.Count());
  thread->m_folders.AppendObjects(m_folders);
  return thread.forget();
}

nsMsgXFGroupThread::~nsMsgXFGroupThread() {}

NS_IMETHODIMP nsMsgXFGroupThread::GetNumChildren(uint32_t* aNumChildren) {
  NS_ENSURE_ARG_POINTER(aNumChildren);
  *aNumChildren = m_folders.Length();
  return NS_OK;
}

NS_IMETHODIMP nsMsgXFGroupThread::GetChildHdrAt(uint32_t aIndex,
                                                nsIMsgDBHdr** aResult) {
  if (aIndex >= m_folders.Length()) return NS_MSG_MESSAGE_NOT_FOUND;
  return m_folders.ObjectAt(aIndex)->GetMessageHeader(m_keys[aIndex], aResult);
}

NS_IMETHODIMP nsMsgXFGroupThread::GetChildKeyAt(uint32_t aIndex,
                                                nsMsgKey* aResult) {
  NS_ASSERTION(false, "shouldn't call this");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgXFGroupThread::RemoveChildAt(uint32_t aIndex) {
  NS_ENSURE_TRUE(aIndex < m_folders.Length(), NS_MSG_MESSAGE_NOT_FOUND);

  nsresult rv = nsMsgGroupThread::RemoveChildAt(aIndex);
  NS_ENSURE_SUCCESS(rv, rv);
  m_folders.RemoveElementAt(aIndex);
  return NS_OK;
}

void nsMsgXFGroupThread::InsertMsgHdrAt(nsMsgViewIndex index,
                                        nsIMsgDBHdr* hdr) {
  nsCOMPtr<nsIMsgFolder> folder;
  hdr->GetFolder(getter_AddRefs(folder));
  m_folders.InsertObjectAt(folder, index);
  nsMsgGroupThread::InsertMsgHdrAt(index, hdr);
}

void nsMsgXFGroupThread::SetMsgHdrAt(nsMsgViewIndex index, nsIMsgDBHdr* hdr) {
  nsCOMPtr<nsIMsgFolder> folder;
  hdr->GetFolder(getter_AddRefs(folder));
  m_folders.ReplaceObjectAt(folder, index);
  nsMsgGroupThread::SetMsgHdrAt(index, hdr);
}

nsMsgViewIndex nsMsgXFGroupThread::FindMsgHdr(nsIMsgDBHdr* hdr) {
  nsMsgKey msgKey;
  hdr->GetMessageKey(&msgKey);
  nsCOMPtr<nsIMsgFolder> folder;
  hdr->GetFolder(getter_AddRefs(folder));
  size_t index = 0;
  while (true) {
    index = m_keys.IndexOf(msgKey, index);
    if (index == m_keys.NoIndex || m_folders[index] == folder) break;
    index++;
  }
  return (nsMsgViewIndex)index;
}

nsMsgViewIndex nsMsgXFGroupThread::AddMsgHdrInDateOrder(nsIMsgDBHdr* child,
                                                        nsMsgDBView* view) {
  nsMsgViewIndex insertIndex =
      nsMsgGroupThread::AddMsgHdrInDateOrder(child, view);
  nsCOMPtr<nsIMsgFolder> folder;
  child->GetFolder(getter_AddRefs(folder));
  m_folders.InsertObjectAt(folder, insertIndex);
  return insertIndex;
}
nsMsgViewIndex nsMsgXFGroupThread::GetInsertIndexFromView(
    nsMsgDBView* view, nsIMsgDBHdr* child,
    nsMsgViewSortOrderValue threadSortOrder) {
  return view->GetInsertIndexHelper(child, m_keys, &m_folders, threadSortOrder,
                                    nsMsgViewSortType::byDate);
}
