/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgDatabaseEnumerators_H_
#define _nsMsgDatabaseEnumerators_H_

/*
 * This file provides some enumerator classes, private to nsMsgDatabase.
 * The outside world would only ever see these as nsIMsgEnumerator or
 * nsIMsgThreadEnumerator.
 *
 * These enumerators automatically register themselves with the nsMsgDatabase
 * during construction/destruction. This lets the database track all
 * outstanding enumerators, so they can be invalidated if the database is
 * destroyed or ForceClosed().
 * Due to this lifecycle coupling, we try to avoid using refcounted pointers
 * here, as we don't want outstanding enumerators to lock an otherwise unused
 * database in existence.
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

  // Function type for filtering which messages are enumerated.
  typedef nsresult (*nsMsgDBEnumeratorFilter)(nsIMsgDBHdr* hdr, void* closure);

  nsMsgDBEnumerator(nsMsgDatabase* db, nsIMdbTable* table,
                    nsMsgDBEnumeratorFilter filter, void* closure,
                    bool iterateForwards = true);
  // Called by db when no longer valid (db is being destroyed or ForcedClosed).
  void Invalidate();

 protected:
  // internals
  nsresult GetRowCursor();

  // Returns next message or nullptr if none more.
  virtual nsresult InternalGetNext(nsIMsgDBHdr** nextHdr);

  // Our source DB. Not refcounted, because we don't want to lock the DB
  // in existence. The enumerator is registered with the DB, and the DB will
  // call Invalidate() if it is destroyed or ForceClosed().
  nsMsgDatabase* mDB;
  nsCOMPtr<nsIMdbTableRowCursor> mRowCursor;
  mdb_pos mRowPos;
  nsCOMPtr<nsIMsgDBHdr> mResultHdr;
  bool mDone;
  bool mIterateForwards;
  nsMsgDBEnumeratorFilter mFilter;
  nsIMdbTable* mTable;
  void* mClosure;

  virtual ~nsMsgDBEnumerator() override;
};

/**
 * Enumerate over messages which match the given search terms.
 */
class nsMsgFilteredDBEnumerator : public nsMsgDBEnumerator {
 public:
  nsMsgFilteredDBEnumerator(nsMsgDatabase* db, nsIMdbTable* table,
                            bool reverse);
  virtual ~nsMsgFilteredDBEnumerator() override;
  nsresult InitSearchSession(
      const nsTArray<RefPtr<nsIMsgSearchTerm>>& searchTerms,
      nsIMsgFolder* folder);

 protected:
  virtual nsresult InternalGetNext(nsIMsgDBHdr** nextHdr) override;

  nsCOMPtr<nsIMsgSearchSession> m_searchSession;
};

/**
 * Helper class for fetching message threads from a database.
 * This enumerator automatically registers itself with the nsMsgDatabase.
 * If the DB is destroyed or ForceClosed() it will call the enumerators
 * Invalidate() method.
 */
class nsMsgDBThreadEnumerator : public nsBaseMsgThreadEnumerator {
 public:
  // nsIMsgThreadEnumerator support.
  NS_IMETHOD GetNext(nsIMsgThread** aItem) override;
  NS_IMETHOD HasMoreElements(bool* aResult) override;

  // Function type for filtering threads that appear in the enumeration.
  typedef nsresult (*nsMsgDBThreadEnumeratorFilter)(nsIMsgThread* thread);

  nsMsgDBThreadEnumerator(nsMsgDatabase* db,
                          nsMsgDBThreadEnumeratorFilter filter);

  // Called by DB when being destroyed or ForcedClosed.
  void Invalidate();

 protected:
  virtual ~nsMsgDBThreadEnumerator();
  nsresult GetTableCursor(void);
  nsresult PrefetchNext();

  // Our source DB. Not refcounted, because we don't want to lock the DB
  // in existence. The enumerator is registered with the DB, and the DB will
  // call Invalidate() if it is destroyed or ForceClosed().
  nsMsgDatabase* mDB;
  nsCOMPtr<nsIMdbPortTableCursor> mTableCursor;
  RefPtr<nsIMsgThread> mResultThread;
  bool mDone;
  bool mNextPrefetched;
  nsMsgDBThreadEnumeratorFilter mFilter;
};

#endif  // _nsMsgDatabaseEnumerators_H_
