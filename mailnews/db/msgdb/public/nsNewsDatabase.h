/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_MSGDB_PUBLIC_NSNEWSDATABASE_H_
#define COMM_MAILNEWS_DB_MSGDB_PUBLIC_NSNEWSDATABASE_H_

#include "nsMsgDatabase.h"
#include "nsINewsDatabase.h"
#include "nsTArray.h"
#include "nsIMsgHdr.h"

// news group database

class nsNewsDatabase : public nsMsgDatabase, public nsINewsDatabase {
 public:
  nsNewsDatabase();

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSINEWSDATABASE

  NS_IMETHOD Close(bool forceCommit) override;
  NS_IMETHOD ForceClosed() override;
  NS_IMETHOD Commit(nsMsgDBCommit commitType) override;
  virtual uint32_t GetCurVersion() override;

  virtual nsresult MarkHdrRead(nsIMsgDBHdr* msgHdr, bool bRead,
                               nsIDBChangeListener* instigator) override;

  virtual nsresult AdjustExpungedBytesOnDelete(nsIMsgDBHdr* msgHdr) override;
  nsresult SyncWithReadSet();

  NS_IMETHOD GetDefaultViewFlags(
      nsMsgViewFlagsTypeValue* aDefaultViewFlags) override;
  NS_IMETHOD GetDefaultSortType(
      nsMsgViewSortTypeValue* aDefaultSortType) override;
  NS_IMETHOD GetDefaultSortOrder(
      nsMsgViewSortOrderValue* aDefaultSortOrder) override;

  virtual nsresult GetEffectiveCharset(nsIMdbRow* row,
                                       nsACString& resultCharset) override;

 protected:
  virtual ~nsNewsDatabase();
  // this is owned by the nsNewsFolder, which lives longer than the db.
  nsMsgKeySet* m_readSet;

  nsCString mCachedCharset;
};

#endif  // COMM_MAILNEWS_DB_MSGDB_PUBLIC_NSNEWSDATABASE_H_
