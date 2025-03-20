/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Thread.h"

namespace mozilla::mailnews {

NS_IMPL_ISUPPORTS(Thread, nsIMsgThread)

NS_IMETHODIMP Thread::GetThreadKey(nsMsgKey* threadKey) {
  *threadKey = mMessage->mId;
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
NS_IMETHODIMP Thread::GetSubject(nsACString& aSubject) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::SetSubject(const nsACString& aSubject) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::GetNewestMsgDate(uint32_t* aNewestMsgDate) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::SetNewestMsgDate(uint32_t aNewestMsgDate) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::GetNumChildren(uint32_t* aNumChildren) {
  *aNumChildren = 1;
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
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::GetChild(nsMsgKey msgKey, nsIMsgDBHdr** _retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::GetChildHdrAt(uint32_t index, nsIMsgDBHdr** _retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP Thread::GetRootHdr(nsIMsgDBHdr** _retval) {
  NS_IF_ADDREF(*_retval = mMessage);
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
  return NS_ERROR_NOT_IMPLEMENTED;
}

}  // namespace mozilla::mailnews
