/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgDatabaseEnumerators.h"
#include "nsMsgDatabase.h"
#include "nsIMsgHdr.h"
#include "nsMsgThread.h"

/*
 * nsMsgDBEnumerator implementation
 */

nsMsgDBEnumerator::nsMsgDBEnumerator(nsMsgDatabase* db, nsIMdbTable* table,
                                     nsMsgDBEnumeratorFilter filter,
                                     void* closure, bool iterateForwards)
    : mDB(db),
      mDone(false),
      mIterateForwards(iterateForwards),
      mFilter(filter),
      mClosure(closure) {
  mTable = table;
  mRowPos = 0;
  mDB->m_msgEnumerators.AppendElement(this);
}

nsMsgDBEnumerator::~nsMsgDBEnumerator() { Invalidate(); }

void nsMsgDBEnumerator::Invalidate() {
  // Order is important here. If the database is destroyed first, releasing
  // the cursor will crash (due, I think, to a disconnect between XPCOM and
  // Mork internal memory management).
  mRowCursor = nullptr;
  mTable = nullptr;
  mResultHdr = nullptr;
  mDone = true;
  if (mDB) {
    mDB->m_msgEnumerators.RemoveElement(this);
    mDB = nullptr;
  }
}

nsresult nsMsgDBEnumerator::GetRowCursor() {
  mDone = false;

  if (!mDB || !mTable) return NS_ERROR_NULL_POINTER;

  if (mIterateForwards) {
    mRowPos = -1;
  } else {
    mdb_count numRows;
    mTable->GetCount(mDB->GetEnv(), &numRows);
    mRowPos = numRows;  // startPos is 0 relative.
  }
  return mTable->GetTableRowCursor(mDB->GetEnv(), mRowPos,
                                   getter_AddRefs(mRowCursor));
}

NS_IMETHODIMP nsMsgDBEnumerator::GetNext(nsIMsgDBHdr** aItem) {
  if (!aItem) return NS_ERROR_NULL_POINTER;
  *aItem = nullptr;

  // If we've already got one ready, return it.
  if (mResultHdr) {
    mResultHdr.forget(aItem);
    return NS_OK;
  }

  // Bail out if enumerator has been invalidated.
  if (!mDB) {
    return NS_ERROR_FAILURE;
  }

  nsresult rv = InternalGetNext(aItem);
  NS_ENSURE_SUCCESS(rv, rv);
  return *aItem ? NS_OK : NS_ERROR_FAILURE;
}

nsresult nsMsgDBEnumerator::InternalGetNext(nsIMsgDBHdr** nextHdr) {
  nsresult rv;

  *nextHdr = nullptr;

  if (!mRowCursor) {
    rv = GetRowCursor();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  while (true) {
    nsIMdbRow* hdrRow;
    if (mIterateForwards) {
      rv = mRowCursor->NextRow(mDB->GetEnv(), &hdrRow, &mRowPos);
    } else {
      rv = mRowCursor->PrevRow(mDB->GetEnv(), &hdrRow, &mRowPos);
    }
    NS_ENSURE_SUCCESS(rv, rv);
    if (!hdrRow) {
      // No more rows, so we're done.
      *nextHdr = nullptr;
      return NS_OK;
    }

    // Get key from row
    mdbOid outOid;
    nsMsgKey key = nsMsgKey_None;
    rv = hdrRow->GetOid(mDB->GetEnv(), &outOid);
    NS_ENSURE_SUCCESS(rv, rv);
    key = outOid.mOid_Id;

    nsCOMPtr<nsIMsgDBHdr> hdr;
    rv = mDB->CreateMsgHdr(hdrRow, key, getter_AddRefs(hdr));
    NS_ENSURE_SUCCESS(rv, rv);

    // Ignore expunged messages.
    uint32_t flags;
    hdr->GetFlags(&flags);
    if (flags & nsMsgMessageFlags::Expunged) {
      continue;
    }

    // Ignore anything which doesn't pass the filter func (if there is one).
    if (mFilter && NS_FAILED(mFilter(hdr, mClosure))) {
      continue;
    }

    // If we get this far, we've found it.
    hdr.forget(nextHdr);
    return NS_OK;
  }
}

NS_IMETHODIMP nsMsgDBEnumerator::HasMoreElements(bool* aResult) {
  if (!aResult) return NS_ERROR_NULL_POINTER;

  if (!mResultHdr) {
    // Bail out if enumerator has been invalidated.
    if (!mDB) {
      return NS_ERROR_FAILURE;
    }

    nsresult rv = InternalGetNext(getter_AddRefs(mResultHdr));
    NS_ENSURE_SUCCESS(rv, rv);
    if (!mResultHdr) {
      mDone = true;
    }
  }

  *aResult = !mDone;
  return NS_OK;
}

/*
 * nsMsgFilteredDBEnumerator implementation
 */

nsMsgFilteredDBEnumerator::nsMsgFilteredDBEnumerator(nsMsgDatabase* db,
                                                     nsIMdbTable* table,
                                                     bool reverse)
    : nsMsgDBEnumerator(db, table, nullptr, nullptr, !reverse) {}

nsMsgFilteredDBEnumerator::~nsMsgFilteredDBEnumerator() {}

/**
 * Create the search session for the enumerator,
 * add the scope term for "folder" to the search session, and add the search
 * terms in the array to the search session.
 */
nsresult nsMsgFilteredDBEnumerator::InitSearchSession(
    const nsTArray<RefPtr<nsIMsgSearchTerm>>& searchTerms,
    nsIMsgFolder* folder) {
  nsresult rv;
  m_searchSession =
      do_CreateInstance("@mozilla.org/messenger/searchSession;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  m_searchSession->AddScopeTerm(nsMsgSearchScope::offlineMail, folder);
  for (auto searchTerm : searchTerms) {
    m_searchSession->AppendTerm(searchTerm);
  }
  return NS_OK;
}

nsresult nsMsgFilteredDBEnumerator::InternalGetNext(nsIMsgDBHdr** nextHdr) {
  nsCOMPtr<nsIMsgDBHdr> hdr;
  while (true) {
    nsresult rv = nsMsgDBEnumerator::InternalGetNext(getter_AddRefs(hdr));
    NS_ENSURE_SUCCESS(rv, rv);
    if (!hdr) {
      break;  // No more.
    }
    bool matches;
    rv = m_searchSession->MatchHdr(hdr, mDB, &matches);
    NS_ENSURE_SUCCESS(rv, rv);
    if (matches) {
      break;  // Found one!
    }
  }
  hdr.forget(nextHdr);
  return NS_OK;
}

/*
 * nsMsgDBThreadEnumerator implementation
 */

nsMsgDBThreadEnumerator::nsMsgDBThreadEnumerator(
    nsMsgDatabase* db, nsMsgDBThreadEnumeratorFilter filter)
    : mDB(db),
      mTableCursor(nullptr),
      mResultThread(nullptr),
      mDone(false),
      mFilter(filter) {
  mDB->m_threadEnumerators.AppendElement(this);
  mNextPrefetched = false;
}

nsMsgDBThreadEnumerator::~nsMsgDBThreadEnumerator() { Invalidate(); }

void nsMsgDBThreadEnumerator::Invalidate() {
  // Order is important here. If the database is destroyed first, releasing
  // the cursor will crash (due, I think, to a disconnect between XPCOM and
  // Mork internal memory management).
  mTableCursor = nullptr;
  mResultThread = nullptr;
  mDone = true;
  if (mDB) {
    mDB->m_threadEnumerators.RemoveElement(this);
    mDB = nullptr;
  }
}

nsresult nsMsgDBThreadEnumerator::GetTableCursor(void) {
  nsresult rv = NS_OK;

  // DB might have disappeared.
  if (!mDB || !mDB->m_mdbStore) return NS_ERROR_NULL_POINTER;
  if (NS_FAILED(rv)) return rv;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBThreadEnumerator::HasMoreElements(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  if (!mNextPrefetched) {
    PrefetchNext();
  }
  *aResult = !mDone;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBThreadEnumerator::GetNext(nsIMsgThread** aItem) {
  NS_ENSURE_ARG_POINTER(aItem);

  *aItem = nullptr;
  nsresult rv = NS_OK;
  if (!mNextPrefetched) rv = PrefetchNext();
  if (NS_SUCCEEDED(rv)) {
    if (mResultThread) {
      NS_ADDREF(*aItem = mResultThread);
      mNextPrefetched = false;
    }
  }
  return rv;
}

nsresult nsMsgDBThreadEnumerator::PrefetchNext() {
  nsresult rv;

  // DB might have disappeared.
  if (!mDB || !mDB->m_mdbStore) {
    return NS_ERROR_NULL_POINTER;
  }

  if (!mTableCursor) {
    rv = mDB->m_mdbStore->GetPortTableCursor(
        mDB->GetEnv(), mDB->m_hdrRowScopeToken, mDB->m_threadTableKindToken,
        getter_AddRefs(mTableCursor));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIMdbTable> table;
  while (true) {
    mResultThread = nullptr;
    rv = mTableCursor->NextTable(mDB->GetEnv(), getter_AddRefs(table));
    if (!table) {
      mDone = true;
      return NS_ERROR_FAILURE;
    }
    if (NS_FAILED(rv)) {
      mDone = true;
      return rv;
    }

    mdbOid tableId;
    table->GetOid(mDB->GetEnv(), &tableId);

    mResultThread = mDB->FindExistingThread(tableId.mOid_Id);
    if (!mResultThread) mResultThread = new nsMsgThread(mDB, table);

    if (mResultThread) {
      uint32_t numChildren = 0;
      mResultThread->GetNumChildren(&numChildren);
      // we've got empty thread; don't tell caller about it.
      if (numChildren == 0) continue;
    }
    if (mFilter && NS_FAILED(mFilter(mResultThread)))
      continue;
    else
      break;
  }
  if (mResultThread) {
    mNextPrefetched = true;
    return NS_OK;
  }
  return NS_ERROR_FAILURE;
}
