/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMailDatabase_H_
#define _nsMailDatabase_H_

#include "mozilla/Attributes.h"
#include "nsMsgDatabase.h"
#include "nsMsgMessageFlags.h"
#include "nsIFile.h"
#include "nsTArray.h"

// This is the subclass of nsMsgDatabase that handles local mail messages.
class nsIOFileStream;
class nsIFile;
class nsOfflineImapOperation;

class nsMailDatabase : public nsMsgDatabase
{
public:
  nsMailDatabase();
  virtual ~nsMailDatabase();
  NS_IMETHOD  ForceClosed() override;
  NS_IMETHOD DeleteMessages(uint32_t aNumKeys, nsMsgKey* nsMsgKeys,
                            nsIDBChangeListener *instigator) override;

  NS_IMETHOD StartBatch() override;
  NS_IMETHOD EndBatch() override;

  nsresult  Open(nsMsgDBService* aDBService, nsIFile *aSummaryFile, bool create, bool upgrading) override;
  virtual nsMailDatabase  *GetMailDB() {return this;}

  virtual uint32_t  GetCurVersion() override {return kMsgDBVersion;}
  
  NS_IMETHOD  GetOfflineOpForKey(nsMsgKey opKey, bool create,
                                 nsIMsgOfflineImapOperation **op) override;
  NS_IMETHOD  RemoveOfflineOp(nsIMsgOfflineImapOperation *op) override;

  NS_IMETHOD  SetSummaryValid(bool valid) override;
  NS_IMETHOD  GetSummaryValid(bool *valid) override;
	
  NS_IMETHOD    EnumerateOfflineOps(nsISimpleEnumerator **enumerator) override;
  NS_IMETHOD    ListAllOfflineOpIds(nsTArray<nsMsgKey> *offlineOpIds) override;
  NS_IMETHOD    ListAllOfflineDeletes(nsTArray<nsMsgKey> *offlineDeletes) override;

  friend class nsMsgOfflineOpEnumerator;
protected:

  nsresult        GetAllOfflineOpsTable(); // get this on demand

  // get the time and date of the mailbox file
  void            GetMailboxModProperties(int64_t *aSize, uint32_t *aDate); 

  nsCOMPtr <nsIMdbTable>  m_mdbAllOfflineOpsTable;
  mdb_token       m_offlineOpsRowScopeToken;
  mdb_token       m_offlineOpsTableKindToken;

  virtual void    SetReparse(bool reparse);
  
protected:
  
  bool            m_reparse;
};

#endif
