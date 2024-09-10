/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMailDatabase_H_
#define _nsMailDatabase_H_

#include "nsMsgDatabase.h"
#include "nsTArray.h"

#include "nsIDBChangeListener.h"
#include "nsIMsgOfflineImapOperation.h"
#include "nsIFile.h"

// This is the subclass of nsMsgDatabase that handles local mail messages.

class nsMailDatabase : public nsMsgDatabase {
 public:
  nsMailDatabase();
  virtual ~nsMailDatabase();
  NS_IMETHOD ForceClosed() override;
  NS_IMETHOD DeleteMessages(nsTArray<nsMsgKey> const& nsMsgKeys,
                            nsIDBChangeListener* instigator) override;

  nsresult Open(nsMsgDBService* aDBService, nsIFile* aSummaryFile, bool create,
                bool upgrading) override;
  virtual nsMailDatabase* GetMailDB() { return this; }

  virtual uint32_t GetCurVersion() override { return kMsgDBVersion; }

  NS_IMETHOD GetOfflineOpForKey(nsMsgKey opKey, bool create,
                                nsIMsgOfflineImapOperation** op) override;
  NS_IMETHOD RemoveOfflineOp(nsIMsgOfflineImapOperation* op) override;

  NS_IMETHOD SetSummaryValid(bool valid) override;
  NS_IMETHOD GetSummaryValid(bool* valid) override;

  NS_IMETHOD ListAllOfflineOpIds(nsTArray<nsMsgKey>& offlineOpIds) override;
  NS_IMETHOD ListAllOfflineDeletes(nsTArray<nsMsgKey>& offlineDeletes) override;

 protected:
  nsresult GetAllOfflineOpsTable();  // get this on demand

  // get the time and date of the mailbox file
  void GetMailboxModProperties(int64_t* aSize, uint32_t* aDate);

  nsCOMPtr<nsIMdbTable> m_mdbAllOfflineOpsTable;
  mdb_token m_offlineOpsRowScopeToken;
  mdb_token m_offlineOpsTableKindToken;

  virtual void SetReparse(bool reparse);

 protected:
  bool m_reparse;
};

#endif
