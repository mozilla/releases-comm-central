/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Thread.h"

#include "prtime.h"

namespace mozilla::mailnews {

NS_IMPL_ISUPPORTS(Thread, nsIMsgThread)

NS_IMETHODIMP Thread::GetThreadKey(nsMsgKey* threadKey) {
  *threadKey = mThreadId;
  return NS_OK;
}
NS_IMETHODIMP Thread::SetThreadKey(nsMsgKey threadKey) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::GetFlags(uint32_t* aFlags) {
  *aFlags = 0;
  return NS_OK;
}
NS_IMETHODIMP Thread::SetFlags(uint32_t aFlags) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::GetNewestMsgDate(uint32_t* aNewestMsgDate) {
  if (mMaxDate == 0) {
    // We didn't get the max date when constructing this Thread. Do it now.
    nsresult rv =
        mMessageDatabase->GetThreadMaxDate(mFolderId, mThreadId, &mMaxDate);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  *aNewestMsgDate = mMaxDate / PR_USEC_PER_SEC;
  return NS_OK;
}
NS_IMETHODIMP Thread::SetNewestMsgDate(uint32_t aNewestMsgDate) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::GetNumChildren(uint32_t* aNumChildren) {
  uint64_t count;
  nsresult rv = mMessageDatabase->CountThreadKeys(mFolderId, mThreadId, &count);
  NS_ENSURE_SUCCESS(rv, rv);
  *aNumChildren = count;
  return NS_OK;
}
NS_IMETHODIMP Thread::GetNumUnreadChildren(uint32_t* aNumUnreadChildren) {
  *aNumUnreadChildren = 0;
  return NS_OK;
}
NS_IMETHODIMP Thread::GetNumNewChildren(uint32_t* aNumNewChildren) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::AddChild(nsIMsgDBHdr* child, nsIMsgDBHdr* inReplyTo,
                               bool threadInThread,
                               nsIDBChangeAnnouncer* announcer) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::GetChildKeyAt(uint32_t index, nsMsgKey* _retval) {
  nsTArray<nsMsgKey> keys;
  nsresult rv = GetKeys(keys);
  NS_ENSURE_SUCCESS(rv, rv);
  if (index >= keys.Length()) {
    return NS_ERROR_UNEXPECTED;
  }
  *_retval = keys[index];
  return NS_OK;
}
NS_IMETHODIMP Thread::GetChild(nsMsgKey msgKey, nsIMsgDBHdr** _retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::GetChildHdrAt(uint32_t index, nsIMsgDBHdr** _retval) {
  nsTArray<nsMsgKey> keys;
  nsresult rv = GetKeys(keys);
  NS_ENSURE_SUCCESS(rv, rv);
  if (index >= keys.Length()) {
    return NS_ERROR_UNEXPECTED;
  }
  RefPtr<Message> message;
  rv = mMessageDatabase->GetMessage(keys[index], getter_AddRefs(message));
  NS_ENSURE_SUCCESS(rv, rv);
  message.forget(_retval);
  return NS_OK;
}
NS_IMETHODIMP Thread::GetRootHdr(nsIMsgDBHdr** _retval) {
  // TODO: I don't like this. It relies on the bogus assumption that the
  // threadId is the id of the root message.
  RefPtr<Message> message;
  nsresult rv =
      mMessageDatabase->GetMessage(mThreadId, getter_AddRefs(message));
  NS_ENSURE_SUCCESS(rv, rv);
  message.forget(_retval);
  return NS_OK;
}
NS_IMETHODIMP Thread::RemoveChildAt(uint32_t index) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::RemoveChildHdr(nsIMsgDBHdr* child,
                                     nsIDBChangeAnnouncer* announcer) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::MarkChildNew(bool bRead) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::MarkChildRead(bool bRead) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::GetFirstUnreadChild(nsIMsgDBHdr** _retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::EnumerateMessages(nsMsgKey parent,
                                        nsIMsgEnumerator** _retval) {
  nsTArray<nsMsgKey> keys;
  mMessageDatabase->ListThreadChildKeys(mFolderId, parent, keys);
  NS_IF_ADDREF(*_retval = new ThreadMessageEnumerator(keys));
  return NS_OK;
}

nsresult Thread::GetKeys(nsTArray<nsMsgKey>& keys) {
  if (mKeys.IsEmpty()) {
    nsresult rv =
        mMessageDatabase->ListThreadKeys(mFolderId, 0, mThreadId, mKeys);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  keys = mKeys.Clone();
  return NS_OK;
}

NS_IMETHODIMP ThreadMessageEnumerator::GetNext(nsIMsgDBHdr** aItem) {
  NS_ENSURE_ARG_POINTER(aItem);
  *aItem = nullptr;

  if (mCurrent >= mKeys.Length()) {
    return NS_ERROR_FAILURE;
  }

  RefPtr<Message> message;
  nsresult rv =
      mMessageDatabase->GetMessage(mKeys[mCurrent++], getter_AddRefs(message));
  NS_ENSURE_SUCCESS(rv, rv);
  message.forget(aItem);
  return NS_OK;
}

NS_IMETHODIMP ThreadMessageEnumerator::HasMoreElements(bool* aHasNext) {
  NS_ENSURE_ARG_POINTER(aHasNext);

  *aHasNext = mCurrent < mKeys.Length();
  return NS_OK;
}

}  // namespace mozilla::mailnews
