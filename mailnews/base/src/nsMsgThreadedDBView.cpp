/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nsMsgThreadedDBView.h"
#include "nsIMsgHdr.h"
#include "nsIMsgThread.h"
#include "nsIDBFolderInfo.h"
#include "nsIMsgSearchSession.h"
#include "nsMsgMessageFlags.h"

// Allocate this more to avoid reallocation on new mail.
#define MSGHDR_CACHE_LOOK_AHEAD_SIZE 25
// Max msghdr cache entries.
#define MSGHDR_CACHE_MAX_SIZE 8192
#define MSGHDR_CACHE_DEFAULT_SIZE 100

nsMsgThreadedDBView::nsMsgThreadedDBView() {
  /* member initializers and constructor code */
  m_havePrevView = false;
}

nsMsgThreadedDBView::~nsMsgThreadedDBView() {} /* destructor code */

NS_IMETHODIMP
nsMsgThreadedDBView::Open(nsIMsgFolder* folder, nsMsgViewSortTypeValue sortType,
                          nsMsgViewSortOrderValue sortOrder,
                          nsMsgViewFlagsTypeValue viewFlags, int32_t* pCount) {
  nsresult rv =
      nsMsgDBView::Open(folder, sortType, sortOrder, viewFlags, pCount);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!m_db) return NS_ERROR_NULL_POINTER;

  // Preset msg hdr cache size for performance reason.
  int32_t totalMessages, unreadMessages;
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
  PersistFolderInfo(getter_AddRefs(dbFolderInfo));
  NS_ENSURE_SUCCESS(rv, rv);

  // Save off sort type and order, view type and flags.
  dbFolderInfo->GetNumUnreadMessages(&unreadMessages);
  dbFolderInfo->GetNumMessages(&totalMessages);
  if (m_viewFlags & nsMsgViewFlagsType::kUnreadOnly) {
    // Set unread msg size + extra entries to avoid reallocation on new mail.
    totalMessages = (uint32_t)unreadMessages + MSGHDR_CACHE_LOOK_AHEAD_SIZE;
  } else {
    if (totalMessages > MSGHDR_CACHE_MAX_SIZE)
      // Use max default.
      totalMessages = MSGHDR_CACHE_MAX_SIZE;
    else if (totalMessages > 0)
      // Allocate extra entries to avoid reallocation on new mail.
      totalMessages += MSGHDR_CACHE_LOOK_AHEAD_SIZE;
  }

  // If total messages is 0, then we probably don't have any idea how many
  // headers are in the db so we have no business setting the cache size.
  if (totalMessages > 0) m_db->SetMsgHdrCacheSize((uint32_t)totalMessages);

  int32_t count;
  rv = InitThreadedView(count);
  if (pCount) *pCount = count;

  // This is a hack, but we're trying to find a way to correct
  // incorrect total and unread msg counts w/o paying a big
  // performance penalty. So, if we're not threaded, just add
  // up the total and unread messages in the view and see if that
  // matches what the db totals say. Except ignored threads are
  // going to throw us off...hmm. Unless we just look at the
  // unread counts which is what mostly tweaks people anyway...
  int32_t unreadMsgsInView = 0;
  if (!(m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay)) {
    for (uint32_t i = m_flags.Length(); i > 0;) {
      if (!(m_flags[--i] & nsMsgMessageFlags::Read)) ++unreadMsgsInView;
    }

    if (unreadMessages != unreadMsgsInView) m_db->SyncCounts();
  }

  m_db->SetMsgHdrCacheSize(MSGHDR_CACHE_DEFAULT_SIZE);

  return rv;
}

NS_IMETHODIMP
nsMsgThreadedDBView::Close() { return nsMsgDBView::Close(); }

// Populate the view with the ids of the first message in each thread.
nsresult nsMsgThreadedDBView::InitThreadedView(int32_t& count) {
  count = 0;
  m_keys.Clear();
  m_flags.Clear();
  m_levels.Clear();
  m_prevKeys.Clear();
  m_prevFlags.Clear();
  m_prevLevels.Clear();
  m_havePrevView = false;

  bool unreadOnly = (m_viewFlags & nsMsgViewFlagsType::kUnreadOnly);

  nsCOMPtr<nsIMsgThreadEnumerator> threads;
  nsresult rv = m_db->EnumerateThreads(getter_AddRefs(threads));
  NS_ENSURE_SUCCESS(rv, rv);

  bool hasMore = false;
  while (NS_SUCCEEDED(rv = threads->HasMoreElements(&hasMore)) && hasMore) {
    nsCOMPtr<nsIMsgThread> threadHdr;
    rv = threads->GetNext(getter_AddRefs(threadHdr));
    NS_ENSURE_SUCCESS(rv, rv);

    uint32_t numChildren;
    if (unreadOnly)
      threadHdr->GetNumUnreadChildren(&numChildren);
    else
      threadHdr->GetNumChildren(&numChildren);

    if (numChildren == 0) {
      continue;  // An empty thread.
    }

    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    if (unreadOnly) {
      rv = threadHdr->GetFirstUnreadChild(getter_AddRefs(msgHdr));
    } else {
      rv = threadHdr->GetRootHdr(getter_AddRefs(msgHdr));
    }
    NS_ENSURE_SUCCESS(rv, rv);

    // Hook to allow derived classes to filter out unwanted threads.
    if (!WantsThisThread(threadHdr)) {
      continue;
    }

    uint32_t msgFlags;
    msgHdr->GetFlags(&msgFlags);
    // Turn off high byte of msg flags - used for view flags.
    msgFlags &= ~MSG_VIEW_FLAGS;
    // Turn off these flags on msg hdr - they belong in thread.
    uint32_t newMsgFlagsUnused;
    msgHdr->AndFlags(~(nsMsgMessageFlags::Watched), &newMsgFlagsUnused);
    AdjustReadFlag(msgHdr, &msgFlags);
    // Try adding in MSG_VIEW_FLAG_ISTHREAD flag for unreadonly view.
    uint32_t threadFlags;
    threadHdr->GetFlags(&threadFlags);
    msgFlags |= MSG_VIEW_FLAG_ISTHREAD | threadFlags;
    if (numChildren > 1) {
      msgFlags |= MSG_VIEW_FLAG_HASCHILDREN;
    }

    if (!(m_viewFlags & nsMsgViewFlagsType::kShowIgnored)) {
      // Skip ignored threads.
      if (msgFlags & nsMsgMessageFlags::Ignored) {
        continue;
      }
      // Skip ignored subthreads
      bool killed;
      msgHdr->GetIsKilled(&killed);
      if (killed) {
        continue;
      }
    }

    // By default, make threads collapsed unless we're only viewing new msgs.
    if (msgFlags & MSG_VIEW_FLAG_HASCHILDREN) {
      msgFlags |= nsMsgMessageFlags::Elided;
    }

    // OK, now add it to the view!
    nsMsgKey msgKey;
    msgHdr->GetMessageKey(&msgKey);
    m_keys.AppendElement(msgKey);
    m_flags.AppendElement(msgFlags);
    m_levels.AppendElement(0);

    // We expand as we build the view, which allows us to insert at the end
    // of the key array, instead of the middle, and is much faster.
    if ((!(m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay) ||
         m_viewFlags & nsMsgViewFlagsType::kExpandAll) &&
        msgFlags & nsMsgMessageFlags::Elided) {
      ExpandByIndex(m_keys.Length() - 1, nullptr);
    }

    count++;
  }

  rv = InitSort(m_sortType, m_sortOrder);
  SaveSortInfo(m_sortType, m_sortOrder);
  return rv;
}

nsresult nsMsgThreadedDBView::SortThreads(nsMsgViewSortTypeValue sortType,
                                          nsMsgViewSortOrderValue sortOrder) {
  NS_ASSERTION(m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay,
               "trying to sort unthreaded threads");

  uint32_t numThreads = 0;
  // The idea here is that copy the current view, then build up an m_keys and
  // m_flags array of just the top level messages in the view, and then call
  // nsMsgDBView::Sort(sortType, sortOrder).
  // Then, we expand the threads in the result array that were expanded in the
  // original view (perhaps by copying from the original view, but more likely
  // just be calling expand).
  for (uint32_t i = 0; i < m_keys.Length(); i++) {
    if (m_flags[i] & MSG_VIEW_FLAG_ISTHREAD) {
      if (numThreads < i) {
        m_keys[numThreads] = m_keys[i];
        m_flags[numThreads] = m_flags[i];
      }

      m_levels[numThreads] = 0;
      numThreads++;
    }
  }

  m_keys.SetLength(numThreads);
  m_flags.SetLength(numThreads);
  m_levels.SetLength(numThreads);
  // m_viewFlags &= ~nsMsgViewFlagsType::kThreadedDisplay;
  m_sortType = nsMsgViewSortType::byNone;  // sort from scratch
  nsMsgDBView::Sort(sortType, sortOrder);
  m_viewFlags |= nsMsgViewFlagsType::kThreadedDisplay;
  SetSuppressChangeNotifications(true);

  // Loop through the original array, for each thread that's expanded,
  // find it in the new array and expand the thread. We have to update
  // MSG_VIEW_FLAG_HAS_CHILDREN because we may be going from a flat sort,
  // which doesn't maintain that flag, to a threaded sort, which requires
  // that flag.
  for (uint32_t j = 0; j < m_keys.Length(); j++) {
    uint32_t flags = m_flags[j];
    if ((flags & (MSG_VIEW_FLAG_HASCHILDREN | nsMsgMessageFlags::Elided)) ==
        MSG_VIEW_FLAG_HASCHILDREN) {
      uint32_t numExpanded;
      m_flags[j] = flags | nsMsgMessageFlags::Elided;
      ExpandByIndex(j, &numExpanded);
      j += numExpanded;
      if (numExpanded > 0)
        m_flags[j - numExpanded] = flags | MSG_VIEW_FLAG_HASCHILDREN;
    } else if (flags & MSG_VIEW_FLAG_ISTHREAD &&
               !(flags & MSG_VIEW_FLAG_HASCHILDREN)) {
      nsCOMPtr<nsIMsgDBHdr> msgHdr;
      nsCOMPtr<nsIMsgThread> pThread;
      m_db->GetMsgHdrForKey(m_keys[j], getter_AddRefs(msgHdr));
      if (msgHdr) {
        m_db->GetThreadContainingMsgHdr(msgHdr, getter_AddRefs(pThread));
        if (pThread) {
          uint32_t numChildren;
          pThread->GetNumChildren(&numChildren);
          if (numChildren > 1)
            m_flags[j] =
                flags | MSG_VIEW_FLAG_HASCHILDREN | nsMsgMessageFlags::Elided;
        }
      }
    }
  }

  SetSuppressChangeNotifications(false);

  return NS_OK;
}

NS_IMETHODIMP
nsMsgThreadedDBView::Sort(nsMsgViewSortTypeValue sortType,
                          nsMsgViewSortOrderValue sortOrder) {
  nsresult rv;

  int32_t rowCountBeforeSort = GetSize();

  if (!rowCountBeforeSort) {
    // Still need to setup our flags even when no articles - bug 98183.
    m_sortType = sortType;
    m_sortOrder = sortOrder;
    if (sortType == nsMsgViewSortType::byThread &&
        !(m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay)) {
      SetViewFlags(m_viewFlags | nsMsgViewFlagsType::kThreadedDisplay);
    }

    SaveSortInfo(sortType, sortOrder);
    return NS_OK;
  }

  if (!m_checkedCustomColumns && CustomColumnsInSortAndNotRegistered())
    return NS_OK;

  // Sort threads by sort order.
  bool sortThreads = m_viewFlags & (nsMsgViewFlagsType::kThreadedDisplay |
                                    nsMsgViewFlagsType::kGroupBySort);

  // If sort type is by thread, and we're already threaded, change sort type
  // to byId.
  if (sortType == nsMsgViewSortType::byThread &&
      (m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay) != 0) {
    sortType = nsMsgViewSortType::byId;
  }

  nsMsgKey preservedKey;
  AutoTArray<nsMsgKey, 1> preservedSelection;
  SaveAndClearSelection(&preservedKey, preservedSelection);
  // If the client wants us to forget our cached id arrays, they
  // should build a new view. If this isn't good enough, we
  // need a method to do that.
  if (sortType != m_sortType || !m_sortValid || sortThreads) {
    SaveSortInfo(sortType, sortOrder);
    if (sortType == nsMsgViewSortType::byThread) {
      m_sortType = sortType;
      m_viewFlags |= nsMsgViewFlagsType::kThreadedDisplay;
      m_viewFlags &= ~nsMsgViewFlagsType::kGroupBySort;
      if (m_havePrevView) {
        // Restore saved id array and flags array.
        m_keys = m_prevKeys.Clone();
        m_flags = m_prevFlags.Clone();
        m_levels = m_prevLevels.Clone();
        m_sortValid = true;

        // The sort may have changed the number of rows
        // before we restore the selection, tell the tree
        // do this before we call restore selection
        // this is safe when there is no selection.
        rv = AdjustRowCount(rowCountBeforeSort, GetSize());

        RestoreSelection(preservedKey, preservedSelection);
        if (mTree) mTree->Invalidate();
        if (mJSTree) mJSTree->Invalidate();

        return NS_OK;
      } else {
        // Set sort info in anticipation of what Init will do.
        // Build up thread list.
        int32_t unused;  // count.
        InitThreadedView(unused);
        if (sortOrder != nsMsgViewSortOrder::ascending)
          Sort(sortType, sortOrder);

        // The sort may have changed the number of rows
        // before we update the selection, tell the tree
        // do this before we call restore selection
        // this is safe when there is no selection.
        rv = AdjustRowCount(rowCountBeforeSort, GetSize());

        RestoreSelection(preservedKey, preservedSelection);
        if (mTree) mTree->Invalidate();
        if (mJSTree) mJSTree->Invalidate();

        return NS_OK;
      }
    } else if (sortType != nsMsgViewSortType::byThread &&
               (m_sortType == nsMsgViewSortType::byThread || sortThreads)
               /* && !m_havePrevView*/) {
      if (sortThreads) {
        SortThreads(sortType, sortOrder);
        // Hack so base class won't do anything.
        sortType = nsMsgViewSortType::byThread;
      } else {
        // Going from SortByThread to non-thread sort - must build new key,
        // level, and flags arrays.
        m_prevKeys = m_keys.Clone();
        m_prevFlags = m_flags.Clone();
        m_prevLevels = m_levels.Clone();
        // Do this before we sort, so that we'll use the cheap method
        // of expanding.
        m_viewFlags &= ~(nsMsgViewFlagsType::kThreadedDisplay |
                         nsMsgViewFlagsType::kGroupBySort);
        ExpandAll();
        // m_idArray.RemoveAll();
        // m_flags.Clear();
        m_havePrevView = true;
      }
    }
  } else if (m_sortOrder != sortOrder) {
    // Check for toggling the sort.
    nsMsgDBView::Sort(sortType, sortOrder);
  }

  if (!sortThreads) {
    // Call the base class in case we're not sorting by thread.
    rv = nsMsgDBView::Sort(sortType, sortOrder);
    NS_ENSURE_SUCCESS(rv, rv);
    SaveSortInfo(sortType, sortOrder);
  }

  // The sort may have changed the number of rows
  // before we restore the selection, tell the tree
  // do this before we call restore selection
  // this is safe when there is no selection.
  rv = AdjustRowCount(rowCountBeforeSort, GetSize());

  RestoreSelection(preservedKey, preservedSelection);
  if (mTree) mTree->Invalidate();
  if (mJSTree) mJSTree->Invalidate();

  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

void nsMsgThreadedDBView::OnExtraFlagChanged(nsMsgViewIndex index,
                                             uint32_t extraFlag) {
  if (IsValidIndex(index)) {
    if (m_havePrevView) {
      nsMsgKey keyChanged = m_keys[index];
      nsMsgViewIndex prevViewIndex = m_prevKeys.IndexOf(keyChanged);
      if (prevViewIndex != nsMsgViewIndex_None) {
        uint32_t prevFlag = m_prevFlags[prevViewIndex];
        // Don't want to change the elided bit, or has children or is thread.
        if (prevFlag & nsMsgMessageFlags::Elided)
          extraFlag |= nsMsgMessageFlags::Elided;
        else
          extraFlag &= ~nsMsgMessageFlags::Elided;

        if (prevFlag & MSG_VIEW_FLAG_ISTHREAD)
          extraFlag |= MSG_VIEW_FLAG_ISTHREAD;
        else
          extraFlag &= ~MSG_VIEW_FLAG_ISTHREAD;

        if (prevFlag & MSG_VIEW_FLAG_HASCHILDREN)
          extraFlag |= MSG_VIEW_FLAG_HASCHILDREN;
        else
          extraFlag &= ~MSG_VIEW_FLAG_HASCHILDREN;

        // Will this be right?
        m_prevFlags[prevViewIndex] = extraFlag;
      }
    }
  }

  // We don't really know what's changed, but to be on the safe side, set the
  // sort invalid so that reverse sort will pick it up.
  if (m_sortType == nsMsgViewSortType::byStatus ||
      m_sortType == nsMsgViewSortType::byFlagged ||
      m_sortType == nsMsgViewSortType::byUnread ||
      m_sortType == nsMsgViewSortType::byPriority) {
    m_sortValid = false;
  }
}

void nsMsgThreadedDBView::OnHeaderAddedOrDeleted() { ClearPrevIdArray(); }

void nsMsgThreadedDBView::ClearPrevIdArray() {
  m_prevKeys.Clear();
  m_prevLevels.Clear();
  m_prevFlags.Clear();
  m_havePrevView = false;
}

nsresult nsMsgThreadedDBView::InitSort(nsMsgViewSortTypeValue sortType,
                                       nsMsgViewSortOrderValue sortOrder) {
  // Nothing to do.
  if (m_viewFlags & nsMsgViewFlagsType::kGroupBySort) return NS_OK;

  if (sortType == nsMsgViewSortType::byThread) {
    // Sort top level threads by id.
    nsMsgDBView::Sort(nsMsgViewSortType::byId, sortOrder);
    m_sortType = nsMsgViewSortType::byThread;
    m_viewFlags |= nsMsgViewFlagsType::kThreadedDisplay;
    m_viewFlags &= ~nsMsgViewFlagsType::kGroupBySort;
    // Persist the view flags.
    SetViewFlags(m_viewFlags);
    // m_db->SetSortInfo(m_sortType, sortOrder);
  }
  //  else
  //    m_viewFlags &= ~nsMsgViewFlagsType::kThreadedDisplay;

  // By default, the unread only view should have all threads expanded.
  if ((m_viewFlags &
       (nsMsgViewFlagsType::kUnreadOnly | nsMsgViewFlagsType::kExpandAll)) &&
      (m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay)) {
    ExpandAll();
  }

  if (!(m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay)) {
    // For now, expand all and do a flat sort.
    ExpandAll();
  }

  Sort(sortType, sortOrder);
  if (sortType != nsMsgViewSortType::byThread) {
    // Forget prev view, since it has everything expanded.
    ClearPrevIdArray();
  }

  return NS_OK;
}

nsresult nsMsgThreadedDBView::OnNewHeader(nsIMsgDBHdr* newHdr,
                                          nsMsgKey aParentKey,
                                          bool ensureListed) {
  if (m_viewFlags & nsMsgViewFlagsType::kGroupBySort)
    return nsMsgGroupView::OnNewHeader(newHdr, aParentKey, ensureListed);

  NS_ENSURE_TRUE(newHdr, NS_MSG_MESSAGE_NOT_FOUND);

  nsMsgKey newKey;
  newHdr->GetMessageKey(&newKey);

  // Views can override this behaviour, which is to append to view.
  // This is the mail behaviour, but threaded views want
  // to insert in order...
  uint32_t msgFlags;
  newHdr->GetFlags(&msgFlags);
  if (m_viewFlags & nsMsgViewFlagsType::kUnreadOnly && !ensureListed &&
      msgFlags & nsMsgMessageFlags::Read) {
    return NS_OK;
  }

  // Currently, we only add the header in a threaded view if it's a thread.
  // We used to check if this was the first header in the thread, but that's
  // a bit harder in the unreadOnly view. But we'll catch it below.

  // If not threaded display just add it to the view.
  if (!(m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay))
    return AddHdr(newHdr);

  // Need to find the thread we added this to so we can change the hasnew flag
  // added message to existing thread, but not to view.
  // Fix flags on thread header.
  int32_t threadCount;
  uint32_t threadFlags;
  bool moveThread = false;
  nsMsgViewIndex threadIndex =
      ThreadIndexOfMsg(newKey, nsMsgViewIndex_None, &threadCount, &threadFlags);
  bool threadRootIsDisplayed = false;

  nsCOMPtr<nsIMsgThread> threadHdr;
  m_db->GetThreadContainingMsgHdr(newHdr, getter_AddRefs(threadHdr));
  if (threadHdr && m_sortType == nsMsgViewSortType::byDate) {
    uint32_t newestMsgInThread = 0, msgDate = 0;
    threadHdr->GetNewestMsgDate(&newestMsgInThread);
    newHdr->GetDateInSeconds(&msgDate);
    moveThread = (msgDate == newestMsgInThread);
  }

  if (threadIndex != nsMsgViewIndex_None) {
    threadRootIsDisplayed = (m_currentlyDisplayedViewIndex == threadIndex);
    uint32_t flags = m_flags[threadIndex];
    if (!(flags & MSG_VIEW_FLAG_HASCHILDREN)) {
      flags |= MSG_VIEW_FLAG_HASCHILDREN | MSG_VIEW_FLAG_ISTHREAD;
      if (!(m_viewFlags & nsMsgViewFlagsType::kUnreadOnly))
        flags |= nsMsgMessageFlags::Elided;

      m_flags[threadIndex] = flags;
    }

    if (!(flags & nsMsgMessageFlags::Elided)) {
      // Thread is expanded.
      // Insert child into thread.
      // Levels of other hdrs may have changed!
      uint32_t newFlags = msgFlags;
      int32_t level = 0;
      nsMsgViewIndex insertIndex = threadIndex;
      if (aParentKey == nsMsgKey_None) {
        newFlags |= MSG_VIEW_FLAG_ISTHREAD | MSG_VIEW_FLAG_HASCHILDREN;
      } else {
        nsMsgViewIndex parentIndex =
            FindParentInThread(aParentKey, threadIndex);
        level = m_levels[parentIndex] + 1;
        insertIndex = GetInsertInfoForNewHdr(newHdr, parentIndex, level);
      }

      InsertMsgHdrAt(insertIndex, newHdr, newKey, newFlags, level);
      // The call to NoteChange() has to happen after we add the key as
      // NoteChange() will call RowCountChanged() which will call our
      // GetRowCount().
      NoteChange(insertIndex, 1, nsMsgViewNotificationCode::insertOrDelete);

      if (aParentKey == nsMsgKey_None) {
        // this header is the new king! try collapsing the existing thread,
        // removing it, installing this header as king, and expanding it.
        CollapseByIndex(threadIndex, nullptr);
        // call base class, so child won't get promoted.
        // nsMsgDBView::RemoveByIndex(threadIndex);
        ExpandByIndex(threadIndex, nullptr);
      }
    } else if (aParentKey == nsMsgKey_None) {
      // if we have a collapsed thread which just got a new
      // top of thread, change the keys array.
      m_keys[threadIndex] = newKey;
    }

    // If this message is new, the thread is collapsed, it is the
    // root and it was displayed, expand it so that the user does
    // not find that their message has magically turned into a summary.
    if (msgFlags & nsMsgMessageFlags::New &&
        m_flags[threadIndex] & nsMsgMessageFlags::Elided &&
        threadRootIsDisplayed)
      ExpandByIndex(threadIndex, nullptr);

    if (moveThread)
      MoveThreadAt(threadIndex);
    else
      // note change, to update the parent thread's unread and total counts
      NoteChange(threadIndex, 1, nsMsgViewNotificationCode::changed);
  } else if (threadHdr) {
    // Adding msg to thread that's not in view.
    AddMsgToThreadNotInView(threadHdr, newHdr, ensureListed);
  }

  return NS_OK;
}

NS_IMETHODIMP
nsMsgThreadedDBView::OnParentChanged(nsMsgKey aKeyChanged, nsMsgKey oldParent,
                                     nsMsgKey newParent,
                                     nsIDBChangeListener* aInstigator) {
  // We need to adjust the level of the hdr whose parent changed, and
  // invalidate that row, iff we're in threaded mode.
#if 0
  // This code never runs due to the if (false) and Clang complains about it
  // so it is ifdefed out for now.
  if (false && m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay)
  {
    nsMsgViewIndex childIndex = FindViewIndex(aKeyChanged);
    if (childIndex != nsMsgViewIndex_None)
    {
      nsMsgViewIndex parentIndex = FindViewIndex(newParent);
      int32_t newParentLevel =
        (parentIndex == nsMsgViewIndex_None) ? -1 : m_levels[parentIndex];

      nsMsgViewIndex oldParentIndex = FindViewIndex(oldParent);

      int32_t oldParentLevel =
        (oldParentIndex != nsMsgViewIndex_None ||
         newParent == nsMsgKey_None) ? m_levels[oldParentIndex] : -1 ;

      int32_t levelChanged = m_levels[childIndex];
      int32_t parentDelta = oldParentLevel - newParentLevel;
      m_levels[childIndex] = (newParent == nsMsgKey_None) ? 0 : newParentLevel + 1;
      if (parentDelta > 0)
      {
        for (nsMsgViewIndex viewIndex = childIndex + 1;
             viewIndex < GetSize() && m_levels[viewIndex] > levelChanged;
             viewIndex++)
        {
          m_levels[viewIndex] = m_levels[viewIndex] - parentDelta;
          NoteChange(viewIndex, 1, nsMsgViewNotificationCode::changed);
        }
      }

      NoteChange(childIndex, 1, nsMsgViewNotificationCode::changed);
    }
  }
#endif
  return NS_OK;
}

nsMsgViewIndex nsMsgThreadedDBView::GetInsertInfoForNewHdr(
    nsIMsgDBHdr* newHdr, nsMsgViewIndex parentIndex, int32_t targetLevel) {
  uint32_t viewSize = GetSize();
  while (++parentIndex < viewSize) {
    // Loop until we find a message at a level less than or equal to the
    // parent level
    if (m_levels[parentIndex] < targetLevel) break;
  }

  return parentIndex;
}

// This method removes the thread at threadIndex from the view
// and puts it back in its new position, determined by the sort order.
// And, if the selection is affected, save and restore the selection.
void nsMsgThreadedDBView::MoveThreadAt(nsMsgViewIndex threadIndex) {
  // We need to check if the thread is collapsed or not...
  // We want to turn off tree notifications so that we don't
  // reload the current message.
  // We also need to invalidate the range between where the thread was
  // and where it ended up.
  bool changesDisabled = mSuppressChangeNotification;
  if (!changesDisabled) SetSuppressChangeNotifications(true);

  nsCOMPtr<nsIMsgDBHdr> threadHdr;

  GetMsgHdrForViewIndex(threadIndex, getter_AddRefs(threadHdr));
  int32_t childCount = 0;

  nsMsgKey preservedKey;
  AutoTArray<nsMsgKey, 1> preservedSelection;
  int32_t selectionCount;
  int32_t currentIndex;
  bool hasSelection =
      mTreeSelection &&
      ((NS_SUCCEEDED(mTreeSelection->GetCurrentIndex(&currentIndex)) &&
        currentIndex >= 0 && (uint32_t)currentIndex < GetSize()) ||
       (NS_SUCCEEDED(mTreeSelection->GetRangeCount(&selectionCount)) &&
        selectionCount > 0));
  if (hasSelection) SaveAndClearSelection(&preservedKey, preservedSelection);

  uint32_t saveFlags = m_flags[threadIndex];
  bool threadIsExpanded = !(saveFlags & nsMsgMessageFlags::Elided);

  if (threadIsExpanded) {
    ExpansionDelta(threadIndex, &childCount);
    childCount = -childCount;
  }

  nsTArray<nsMsgKey> threadKeys;
  nsTArray<uint32_t> threadFlags;
  nsTArray<uint8_t> threadLevels;

  if (threadIsExpanded) {
    threadKeys.SetCapacity(childCount);
    threadFlags.SetCapacity(childCount);
    threadLevels.SetCapacity(childCount);
    for (nsMsgViewIndex index = threadIndex + 1;
         index < GetSize() && m_levels[index]; index++) {
      threadKeys.AppendElement(m_keys[index]);
      threadFlags.AppendElement(m_flags[index]);
      threadLevels.AppendElement(m_levels[index]);
    }

    uint32_t collapseCount;
    CollapseByIndex(threadIndex, &collapseCount);
  }

  nsMsgDBView::RemoveByIndex(threadIndex);
  nsMsgViewIndex newIndex = nsMsgViewIndex_None;
  AddHdr(threadHdr, &newIndex);

  // AddHdr doesn't always set newIndex, and getting it to do so
  // is going to require some refactoring.
  if (newIndex == nsMsgViewIndex_None) newIndex = FindHdr(threadHdr);

  if (threadIsExpanded) {
    m_keys.InsertElementsAt(newIndex + 1, threadKeys);
    m_flags.InsertElementsAt(newIndex + 1, threadFlags);
    m_levels.InsertElementsAt(newIndex + 1, threadLevels);
  }

  if (newIndex == nsMsgViewIndex_None) {
    NS_WARNING("newIndex=-1 in MoveThreadAt");
    newIndex = 0;
  }

  m_flags[newIndex] = saveFlags;
  // Unfreeze selection.
  if (hasSelection) RestoreSelection(preservedKey, preservedSelection);

  if (!changesDisabled) SetSuppressChangeNotifications(false);

  nsMsgViewIndex lowIndex = threadIndex < newIndex ? threadIndex : newIndex;
  nsMsgViewIndex highIndex = lowIndex == threadIndex ? newIndex : threadIndex;

  NoteChange(lowIndex, highIndex - lowIndex + childCount + 1,
             nsMsgViewNotificationCode::changed);
}

nsresult nsMsgThreadedDBView::AddMsgToThreadNotInView(nsIMsgThread* threadHdr,
                                                      nsIMsgDBHdr* msgHdr,
                                                      bool ensureListed) {
  if (!(m_viewFlags & nsMsgViewFlagsType::kShowIgnored)) {
    uint32_t threadFlags;
    threadHdr->GetFlags(&threadFlags);
    if (threadFlags & nsMsgMessageFlags::Ignored) {
      return NS_OK;
    }
  }
  return nsMsgDBView::AddHdr(msgHdr);
}

// This method just removes the specified line from the view. It does
// NOT delete it from the database.
nsresult nsMsgThreadedDBView::RemoveByIndex(nsMsgViewIndex index) {
  nsresult rv = NS_OK;
  int32_t flags;

  if (!IsValidIndex(index)) return NS_MSG_INVALID_DBVIEW_INDEX;

  OnHeaderAddedOrDeleted();

  flags = m_flags[index];

  if (!(m_viewFlags & nsMsgViewFlagsType::kThreadedDisplay))
    return nsMsgDBView::RemoveByIndex(index);

  nsCOMPtr<nsIMsgThread> threadHdr;
  GetThreadContainingIndex(index, getter_AddRefs(threadHdr));
  NS_ENSURE_SUCCESS(rv, rv);
  uint32_t numThreadChildren = 0;
  // If we can't get a thread, it's already deleted and thus has 0 children.
  if (threadHdr) threadHdr->GetNumChildren(&numThreadChildren);

  // Check if we're the top level msg in the thread, and we're not collapsed.
  if ((flags & MSG_VIEW_FLAG_ISTHREAD) &&
      !(flags & nsMsgMessageFlags::Elided) &&
      (flags & MSG_VIEW_FLAG_HASCHILDREN)) {
    // Fix flags on thread header - newly promoted message should have
    // flags set correctly.
    if (threadHdr) {
      nsMsgDBView::RemoveByIndex(index);
      nsCOMPtr<nsIMsgThread> nextThreadHdr;
      // Above RemoveByIndex may now make index out of bounds.
      if (IsValidIndex(index) && numThreadChildren > 0) {
        // unreadOnly
        nsCOMPtr<nsIMsgDBHdr> msgHdr;
        rv = threadHdr->GetChildHdrAt(0, getter_AddRefs(msgHdr));
        if (msgHdr != nullptr) {
          uint32_t flag = 0;
          msgHdr->GetFlags(&flag);
          if (numThreadChildren > 1)
            flag |= MSG_VIEW_FLAG_ISTHREAD | MSG_VIEW_FLAG_HASCHILDREN;

          m_flags[index] = flag;
          m_levels[index] = 0;
        }
      }
    }

    return rv;
  } else if (!(flags & MSG_VIEW_FLAG_ISTHREAD)) {
    // We're not deleting the top level msg, but top level msg might be the
    // only msg in thread now.
    if (threadHdr && numThreadChildren == 1) {
      nsMsgKey msgKey;
      rv = threadHdr->GetChildKeyAt(0, &msgKey);
      if (NS_SUCCEEDED(rv)) {
        nsMsgViewIndex threadIndex = FindViewIndex(msgKey);
        if (IsValidIndex(threadIndex)) {
          uint32_t flags = m_flags[threadIndex];
          flags &= ~(MSG_VIEW_FLAG_ISTHREAD | nsMsgMessageFlags::Elided |
                     MSG_VIEW_FLAG_HASCHILDREN);
          m_flags[threadIndex] = flags;
          NoteChange(threadIndex, 1, nsMsgViewNotificationCode::changed);
        }
      }
    }

    return nsMsgDBView::RemoveByIndex(index);
  }

  // Deleting collapsed thread header is special case. Child will be promoted,
  // so just tell FE that line changed, not that it was deleted.
  // Header has already been deleted from thread.
  if (threadHdr && numThreadChildren > 0) {
    // Change the id array and flags array to reflect the child header.
    // If we're not deleting the header, we want the second header,
    // Otherwise, the first one (which just got promoted).
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    rv = threadHdr->GetChildHdrAt(0, getter_AddRefs(msgHdr));
    if (msgHdr != nullptr) {
      msgHdr->GetMessageKey(&m_keys[index]);
      uint32_t flag = 0;
      msgHdr->GetFlags(&flag);
      flag |= MSG_VIEW_FLAG_ISTHREAD;

      // If only hdr in thread (with one about to be deleted).
      if (numThreadChildren == 1) {
        // Adjust flags.
        flag &= ~MSG_VIEW_FLAG_HASCHILDREN;
        flag &= ~nsMsgMessageFlags::Elided;
        // Tell FE that thread header needs to be repainted.
        NoteChange(index, 1, nsMsgViewNotificationCode::changed);
      } else {
        flag |= MSG_VIEW_FLAG_HASCHILDREN;
        flag |= nsMsgMessageFlags::Elided;
      }

      m_flags[index] = flag;
      mIndicesToNoteChange.RemoveElement(index);
    } else {
      NS_ASSERTION(false, "couldn't find thread child");
    }

    NoteChange(index, 1, nsMsgViewNotificationCode::changed);
  } else {
    // We may have deleted a whole, collapsed thread - if so,
    // ensure that the current index will be noted as changed.
    if (!mIndicesToNoteChange.Contains(index))
      mIndicesToNoteChange.AppendElement(index);

    rv = nsMsgDBView::RemoveByIndex(index);
  }

  return rv;
}

NS_IMETHODIMP
nsMsgThreadedDBView::GetViewType(nsMsgViewTypeValue* aViewType) {
  NS_ENSURE_ARG_POINTER(aViewType);
  *aViewType = nsMsgViewType::eShowAllThreads;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgThreadedDBView::CloneDBView(nsIMessenger* aMessengerInstance,
                                 nsIMsgWindow* aMsgWindow,
                                 nsIMsgDBViewCommandUpdater* aCmdUpdater,
                                 nsIMsgDBView** _retval) {
  nsMsgThreadedDBView* newMsgDBView = new nsMsgThreadedDBView();

  if (!newMsgDBView) return NS_ERROR_OUT_OF_MEMORY;

  nsresult rv =
      CopyDBView(newMsgDBView, aMessengerInstance, aMsgWindow, aCmdUpdater);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_IF_ADDREF(*_retval = newMsgDBView);
  return NS_OK;
}
