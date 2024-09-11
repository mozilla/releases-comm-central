/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nsMailDatabase.h"
#include "nsDBFolderInfo.h"
#include "nsNetUtil.h"
#include "nsMsgOfflineImapOperation.h"
#include "nsMsgFolderFlags.h"
#include "mozilla/Logging.h"
#include "prprf.h"
#include "nsMsgUtils.h"
#include "nsIMsgPluggableStore.h"
#include "nsSimpleEnumerator.h"

using namespace mozilla;

extern LazyLogModule IMAPOffline;  // defined in nsMsgOfflineImapOperation.cpp

// scope for all offine ops table
const char* kOfflineOpsScope = "ns:msg:db:row:scope:ops:all";
const char* kOfflineOpsTableKind = "ns:msg:db:table:kind:ops";
struct mdbOid gAllOfflineOpsTableOID;

nsMailDatabase::nsMailDatabase() : m_reparse(false) {
  m_mdbAllOfflineOpsTable = nullptr;
  m_offlineOpsRowScopeToken = 0;
  m_offlineOpsTableKindToken = 0;
}

nsMailDatabase::~nsMailDatabase() {}

// caller passes in upgrading==true if they want back a db even if the db is out
// of date. If so, they'll extract out the interesting info from the db, close
// it, delete it, and then try to open the db again, prior to reparsing.
nsresult nsMailDatabase::Open(nsMsgDBService* aDBService, nsIFile* aSummaryFile,
                              bool aCreate, bool aUpgrading) {
#ifdef DEBUG
  nsString leafName;
  aSummaryFile->GetLeafName(leafName);
  if (!StringEndsWith(leafName, NS_LITERAL_STRING_FROM_CSTRING(SUMMARY_SUFFIX),
                      nsCaseInsensitiveStringComparator))
    NS_ERROR("non summary file passed into open");
#endif
  return nsMsgDatabase::Open(aDBService, aSummaryFile, aCreate, aUpgrading);
}

NS_IMETHODIMP nsMailDatabase::ForceClosed() {
  m_mdbAllOfflineOpsTable = nullptr;
  return nsMsgDatabase::ForceClosed();
}

// get this on demand so that only db's that have offline ops will
// create the table.
nsresult nsMailDatabase::GetAllOfflineOpsTable() {
  nsresult rv = NS_OK;
  if (!m_mdbAllOfflineOpsTable)
    rv = GetTableCreateIfMissing(kOfflineOpsScope, kOfflineOpsTableKind,
                                 getter_AddRefs(m_mdbAllOfflineOpsTable),
                                 m_offlineOpsRowScopeToken,
                                 m_offlineOpsTableKindToken);
  return rv;
}

NS_IMETHODIMP nsMailDatabase::DeleteMessages(
    nsTArray<nsMsgKey> const& nsMsgKeys, nsIDBChangeListener* instigator) {
  nsresult rv;
  if (m_folder) {
    bool isLocked;
    m_folder->GetLocked(&isLocked);
    if (isLocked) {
      NS_ASSERTION(false, "Some other operation is in progress");
      return NS_MSG_FOLDER_BUSY;
    }
  }

  rv = nsMsgDatabase::DeleteMessages(nsMsgKeys, instigator);
  SetSummaryValid(true);
  return rv;
}

NS_IMETHODIMP nsMailDatabase::GetSummaryValid(bool* aResult) {
  uint32_t version;
  m_dbFolderInfo->GetVersion(&version);
  if (GetCurVersion() != version) {
    *aResult = false;
    return NS_OK;
  }
  if (!m_folder) {
    // If the folder is not set, we just return without checking the validity
    // of the summary file. For now, this is an expected condition when the
    // message database is being opened from a URL in
    // nsMailboxUrl::GetMsgHdrForKey() which calls
    // nsMsgDBService::OpenMailDBFromFile() without a folder.
    // Returning an error here would lead to the deletion of the MSF in the
    // caller nsMsgDatabase::CheckForErrors().
    *aResult = true;
    return NS_OK;
  }

  // If this is a virtual folder, there is no storage.
  bool isVirtual = false;
  m_folder->GetFlag(nsMsgFolderFlags::Virtual, &isVirtual);
  if (isVirtual) {
    *aResult = true;
    return NS_OK;
  }

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  nsresult rv = m_folder->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  return msgStore->IsSummaryFileValid(m_folder, this, aResult);
}

NS_IMETHODIMP nsMailDatabase::SetSummaryValid(bool aValid) {
  nsMsgDatabase::SetSummaryValid(aValid);

  if (!m_folder) return NS_ERROR_NULL_POINTER;

  // If this is a virtual folder, there is no storage.
  bool flag;
  m_folder->GetFlag(nsMsgFolderFlags::Virtual, &flag);
  if (flag) return NS_OK;

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  nsresult rv = m_folder->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  return msgStore->SetSummaryFileValid(m_folder, this, aValid);
}

NS_IMETHODIMP nsMailDatabase::RemoveOfflineOp(nsIMsgOfflineImapOperation* op) {
  nsresult rv = GetAllOfflineOpsTable();
  NS_ENSURE_SUCCESS(rv, rv);

  if (!op || !m_mdbAllOfflineOpsTable) return NS_ERROR_NULL_POINTER;
  nsMsgOfflineImapOperation* offlineOp =
      static_cast<nsMsgOfflineImapOperation*>(
          op);  // closed system, so this is ok
  nsIMdbRow* row = offlineOp->GetMDBRow();
  rv = m_mdbAllOfflineOpsTable->CutRow(GetEnv(), row);
  row->CutAllColumns(GetEnv());
  return rv;
}

NS_IMETHODIMP nsMailDatabase::GetOfflineOpForKey(
    nsMsgKey msgKey, bool create, nsIMsgOfflineImapOperation** offlineOp) {
  mdb_bool hasOid;
  mdbOid rowObjectId;
  nsresult err;

  nsresult rv = GetAllOfflineOpsTable();
  NS_ENSURE_SUCCESS(rv, rv);

  if (!offlineOp || !m_mdbAllOfflineOpsTable) return NS_ERROR_NULL_POINTER;

  *offlineOp = NULL;

  rowObjectId.mOid_Id = msgKey;
  rowObjectId.mOid_Scope = m_offlineOpsRowScopeToken;
  err = m_mdbAllOfflineOpsTable->HasOid(GetEnv(), &rowObjectId, &hasOid);
  if (NS_SUCCEEDED(err) && m_mdbStore && (hasOid || create)) {
    nsCOMPtr<nsIMdbRow> offlineOpRow;
    err = m_mdbStore->GetRow(GetEnv(), &rowObjectId,
                             getter_AddRefs(offlineOpRow));

    if (create) {
      if (!offlineOpRow) {
        err = m_mdbStore->NewRowWithOid(GetEnv(), &rowObjectId,
                                        getter_AddRefs(offlineOpRow));
        NS_ENSURE_SUCCESS(err, err);
      }
      if (offlineOpRow && !hasOid)
        m_mdbAllOfflineOpsTable->AddRow(GetEnv(), offlineOpRow);
    }

    if (NS_SUCCEEDED(err) && offlineOpRow) {
      NS_IF_ADDREF(*offlineOp =
                       new nsMsgOfflineImapOperation(this, offlineOpRow));
      // The offlineOpRow uses msgKey as its oid, but we'll also explicitly
      // set the messageKey field.
      (*offlineOp)->SetMessageKey(msgKey);
    }
    if (!hasOid && m_dbFolderInfo) {
      // set initial value for flags so we don't lose them.
      nsCOMPtr<nsIMsgDBHdr> msgHdr;
      GetMsgHdrForKey(msgKey, getter_AddRefs(msgHdr));
      if (msgHdr) {
        uint32_t flags;
        msgHdr->GetFlags(&flags);
        (*offlineOp)->SetNewFlags(flags);
      }
      int32_t newFlags;
      m_dbFolderInfo->OrFlags(nsMsgFolderFlags::OfflineEvents, &newFlags);
    }
  }

  return err;
}

NS_IMETHODIMP nsMailDatabase::ListAllOfflineOpIds(
    nsTArray<nsMsgKey>& offlineOpIds) {
  nsresult rv = GetAllOfflineOpsTable();
  NS_ENSURE_SUCCESS(rv, rv);
  nsIMdbTableRowCursor* rowCursor;

  if (m_mdbAllOfflineOpsTable) {
    nsresult err =
        m_mdbAllOfflineOpsTable->GetTableRowCursor(GetEnv(), -1, &rowCursor);
    while (NS_SUCCEEDED(err) && rowCursor) {
      mdbOid outOid;
      mdb_pos outPos;

      err = rowCursor->NextRowOid(GetEnv(), &outOid, &outPos);
      // is this right? Mork is returning a 0 id, but that should valid.
      if (outPos < 0 || outOid.mOid_Id == (mdb_id)-1) break;
      if (NS_SUCCEEDED(err)) {
        offlineOpIds.AppendElement(outOid.mOid_Id);
        if (MOZ_LOG_TEST(IMAPOffline, LogLevel::Info)) {
          nsCOMPtr<nsIMsgOfflineImapOperation> offlineOp;
          GetOfflineOpForKey(outOid.mOid_Id, false, getter_AddRefs(offlineOp));
          if (offlineOp) {
            nsMsgOfflineImapOperation* logOp =
                static_cast<nsMsgOfflineImapOperation*>(
                    static_cast<nsIMsgOfflineImapOperation*>(offlineOp.get()));
            if (logOp) logOp->Log();
          }
        }
      }
    }
    // TODO: would it cause a problem to replace this with "rv = err;" ?
    rv = (NS_SUCCEEDED(err)) ? NS_OK : NS_ERROR_FAILURE;
    rowCursor->Release();
  }

  offlineOpIds.Sort();
  return rv;
}

NS_IMETHODIMP nsMailDatabase::ListAllOfflineDeletes(
    nsTArray<nsMsgKey>& offlineDeletes) {
  nsresult rv = GetAllOfflineOpsTable();
  NS_ENSURE_SUCCESS(rv, rv);
  nsIMdbTableRowCursor* rowCursor;
  if (m_mdbAllOfflineOpsTable) {
    nsresult err =
        m_mdbAllOfflineOpsTable->GetTableRowCursor(GetEnv(), -1, &rowCursor);
    while (NS_SUCCEEDED(err) && rowCursor) {
      mdbOid outOid;
      mdb_pos outPos;
      nsIMdbRow* offlineOpRow;

      err = rowCursor->NextRow(GetEnv(), &offlineOpRow, &outPos);
      // is this right? Mork is returning a 0 id, but that should valid.
      if (outPos < 0 || offlineOpRow == nullptr) break;
      if (NS_SUCCEEDED(err)) {
        offlineOpRow->GetOid(GetEnv(), &outOid);
        RefPtr<nsIMsgOfflineImapOperation> offlineOp =
            new nsMsgOfflineImapOperation(this, offlineOpRow);
        imapMessageFlagsType newFlags;
        nsOfflineImapOperationType opType;

        offlineOp->GetOperation(&opType);
        offlineOp->GetNewFlags(&newFlags);
        if (opType & nsIMsgOfflineImapOperation::kMsgMoved ||
            ((opType & nsIMsgOfflineImapOperation::kFlagsChanged) &&
             (newFlags & nsIMsgOfflineImapOperation::kMsgMarkedDeleted)))
          offlineDeletes.AppendElement(outOid.mOid_Id);

        offlineOpRow->Release();
      }
    }
    // TODO: would it cause a problem to replace this with "rv = err;" ?
    rv = (NS_SUCCEEDED(err)) ? NS_OK : NS_ERROR_FAILURE;
    rowCursor->Release();
  }
  return rv;
}

// This is used to remember that the db is out of sync with the mail folder
// and needs to be regenerated.
void nsMailDatabase::SetReparse(bool reparse) { m_reparse = reparse; }
