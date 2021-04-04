/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgDatabaseEnumerators_H_
#define _nsMsgDatabaseEnumerators_H_

/*
 * This file provides a bunch of enumerator classes, private to nsMsgDatabase.
 * The outside world would only ever see these as nsIMsgEnumerator or
 * nsIMsgThreadEnumerator.
 * Various nsMsgDatabase functions will return these enumerators, but must
 * maintain a link to the enumerator so it can be invalidated if the database it
 * references disappears (eg via ForceClosed()).
 */

#include "nsMsgEnumerator.h"
#include "nsCOMPtr.h"
#include "nsTArray.h"
#include "mdb.h"
#include "nsIDBChangeListener.h"

#include "nsIMsgSearchTerm.h"
#include "nsIMsgSearchSession.h"

class nsMsgDatabase;
class nsIMdbTable;
class nsIMdbTableRowCursor;
class nsIMsgFolder;

/**
 * Enumerates over messages, forwards or backward, with an optional filter fn.
 */
class nsMsgDBEnumerator : public nsBaseMsgEnumerator {
 public:
  // nsIMsgEnumerator support.
  NS_IMETHOD GetNext(nsIMsgDBHdr** aItem) override;
  NS_IMETHOD HasMoreElements(bool* aResult) override;

  // nsMsgDBEnumerator methods:
  typedef nsresult (*nsMsgDBEnumeratorFilter)(nsIMsgDBHdr* hdr, void* closure);

  nsMsgDBEnumerator(nsMsgDatabase* db, nsIMdbTable* table,
                    nsMsgDBEnumeratorFilter filter, void* closure,
                    bool iterateForwards = true);
  void Clear();

 protected:
  // internals
  nsresult GetRowCursor();
  virtual nsresult PrefetchNext();
  RefPtr<nsMsgDatabase> mDB;
  nsCOMPtr<nsIMdbTableRowCursor> mRowCursor;
  mdb_pos mRowPos;
  nsCOMPtr<nsIMsgDBHdr> mResultHdr;
  bool mDone;
  bool mNextPrefetched;
  bool mIterateForwards;
  nsMsgDBEnumeratorFilter mFilter;
  nsCOMPtr<nsIMdbTable> mTable;
  void* mClosure;
  // This is used when the caller wants to limit how many headers the
  // enumerator looks at in any given time slice.
  mdb_pos mStopPos;

  virtual ~nsMsgDBEnumerator() override;
};

/**
 * Enumerate over messages which match the given search terms.
 */
class nsMsgFilteredDBEnumerator : public nsMsgDBEnumerator {
 public:
  nsMsgFilteredDBEnumerator(nsMsgDatabase* db, nsIMdbTable* table,
                            bool reverse);
  virtual ~nsMsgFilteredDBEnumerator();
  nsresult InitSearchSession(
      const nsTArray<RefPtr<nsIMsgSearchTerm>>& searchTerms,
      nsIMsgFolder* folder);

 protected:
  virtual nsresult PrefetchNext() override;

  nsCOMPtr<nsIMsgSearchSession> m_searchSession;
};

/**
 * Helper class for fetching message threads from a database.
 * It derives from nsIDBChangeListener so we can tell if the database is
 * forcibly closed, in which case we need to stop using it right away. (In fact,
 * this is probably unnecessary because this enumerator is never used in a
 * context where a DB is likely to have ForceClosed() called upon it, but for
 * safety let's leave it in. It'd be nice to have a less brittle mechanism than
 * ForceClosed()).
 */
class nsMsgDBThreadEnumerator : public nsBaseMsgThreadEnumerator,
                                nsIDBChangeListener {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  // nsIMsgThreadEnumerator support.
  NS_IMETHOD GetNext(nsIMsgThread** aItem) override;
  NS_IMETHOD HasMoreElements(bool* aResult) override;

  NS_DECL_NSIDBCHANGELISTENER

  // nsMsgDBEnumerator methods:
  typedef nsresult (*nsMsgDBThreadEnumeratorFilter)(nsIMsgThread* thread);

  nsMsgDBThreadEnumerator(nsMsgDatabase* db,
                          nsMsgDBThreadEnumeratorFilter filter);

 protected:
  ~nsMsgDBThreadEnumerator() override;
  nsresult GetTableCursor(void);
  nsresult PrefetchNext();
  RefPtr<nsMsgDatabase> mDB;
  nsCOMPtr<nsIMdbPortTableCursor> mTableCursor;
  RefPtr<nsIMsgThread> mResultThread;
  bool mDone;
  bool mNextPrefetched;
  nsMsgDBThreadEnumeratorFilter mFilter;
};

#endif  // _nsMsgDatabaseEnumerators_H_
