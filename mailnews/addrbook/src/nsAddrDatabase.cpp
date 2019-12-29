/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// this file implements the nsAddrDatabase interface using the MDB Interface.

#include "nsAddrDatabase.h"
#include "nsString.h"
#include "nsAutoPtr.h"
#include "nsUnicharUtils.h"
#include "nsAbBaseCID.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsMsgUtils.h"
#include "nsMorkCID.h"
#include "nsIMdbFactoryFactory.h"
#include "prprf.h"
#include "nsIMutableArray.h"
#include "nsArrayUtils.h"
#include "nsIPromptService.h"
#include "nsIStringBundle.h"
#include "nsIFile.h"
#include "nsEmbedCID.h"
#include "nsIProperty.h"
#include "nsIVariant.h"
#include "nsCOMArray.h"
#include "nsArrayEnumerator.h"
#include "nsSimpleEnumerator.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIAbManager.h"
#include "mozilla/Services.h"
#include "nsIObserverService.h"

#define ID_PAB_TABLE 1
#define ID_DELETEDCARDS_TABLE 2

// There's two books by default, although Mac may have one more, so set this
// to three. Its not going to affect much, but will save us a few reallocations
// when the cache is allocated.
const uint32_t kInitialAddrDBCacheSize = 3;

static const char kPabTableKind[] = "ns:addrbk:db:table:kind:pab";
static const char kDeletedCardsTableKind[] =
    "ns:addrbk:db:table:kind:deleted";  // this table is used to keep the
                                        // deleted cards

static const char kCardRowScope[] = "ns:addrbk:db:row:scope:card:all";
static const char kListRowScope[] = "ns:addrbk:db:row:scope:list:all";
static const char kDataRowScope[] = "ns:addrbk:db:row:scope:data:all";

#define DATAROW_ROWID 1

#define COLUMN_STR_MAX 16

#define PURGE_CUTOFF_COUNT 50

static const char kRecordKeyColumn[] = "RecordKey";
static const char kLastRecordKeyColumn[] = "LastRecordKey";
static const char kRowIDProperty[] = "DbRowID";

static const char kLowerListNameColumn[] = "LowercaseListName";

struct mdbOid gAddressBookTableOID;

static const char kMailListAddressFormat[] = "Address%d";

nsAddrDatabase::nsAddrDatabase()
    : m_mdbEnv(nullptr),
      m_mdbStore(nullptr),
      m_mdbPabTable(nullptr),
      m_mdbTokensInitialized(false),
      m_PabTableKind(0),
      m_DeletedCardsTableKind(0),
      m_CardRowScopeToken(0),
      m_UIDColumnToken(0),
      m_FirstNameColumnToken(0),
      m_LastNameColumnToken(0),
      m_PhoneticFirstNameColumnToken(0),
      m_PhoneticLastNameColumnToken(0),
      m_DisplayNameColumnToken(0),
      m_NickNameColumnToken(0),
      m_PriEmailColumnToken(0),
      m_2ndEmailColumnToken(0),
      m_WorkPhoneColumnToken(0),
      m_HomePhoneColumnToken(0),
      m_FaxColumnToken(0),
      m_PagerColumnToken(0),
      m_CellularColumnToken(0),
      m_WorkPhoneTypeColumnToken(0),
      m_HomePhoneTypeColumnToken(0),
      m_FaxTypeColumnToken(0),
      m_PagerTypeColumnToken(0),
      m_CellularTypeColumnToken(0),
      m_HomeAddressColumnToken(0),
      m_HomeAddress2ColumnToken(0),
      m_HomeCityColumnToken(0),
      m_HomeStateColumnToken(0),
      m_HomeZipCodeColumnToken(0),
      m_HomeCountryColumnToken(0),
      m_WorkAddressColumnToken(0),
      m_WorkAddress2ColumnToken(0),
      m_WorkCityColumnToken(0),
      m_WorkStateColumnToken(0),
      m_WorkZipCodeColumnToken(0),
      m_WorkCountryColumnToken(0),
      m_CompanyColumnToken(0),
      m_AimScreenNameColumnToken(0),
      m_AnniversaryYearColumnToken(0),
      m_AnniversaryMonthColumnToken(0),
      m_AnniversaryDayColumnToken(0),
      m_SpouseNameColumnToken(0),
      m_FamilyNameColumnToken(0),
      m_DefaultAddressColumnToken(0),
      m_CategoryColumnToken(0),
      m_WebPage1ColumnToken(0),
      m_WebPage2ColumnToken(0),
      m_BirthYearColumnToken(0),
      m_BirthMonthColumnToken(0),
      m_BirthDayColumnToken(0),
      m_Custom1ColumnToken(0),
      m_Custom2ColumnToken(0),
      m_Custom3ColumnToken(0),
      m_Custom4ColumnToken(0),
      m_NotesColumnToken(0),
      m_LastModDateColumnToken(0),
      m_MailFormatColumnToken(0),
      m_PopularityIndexColumnToken(0),
      m_AddressCharSetColumnToken(0),
      m_dbDirectory(nullptr) {}

nsAddrDatabase::~nsAddrDatabase() {
  Close(false);  // better have already been closed.

  RemoveFromCache(this);
  // clean up after ourself!
  if (m_mdbPabTable) m_mdbPabTable->Release();
  NS_IF_RELEASE(m_mdbStore);
  NS_IF_RELEASE(m_mdbEnv);
}

NS_IMPL_ISUPPORTS(nsAddrDatabase, nsIAddrDatabase)

// Apparently its not good for nsTArray to be allocated as static. Don't know
// why it isn't but its not, so don't think about making it a static variable.
// Maybe bz knows.
nsTArray<nsAddrDatabase *> *nsAddrDatabase::m_dbCache = nullptr;

nsTArray<nsAddrDatabase *> *nsAddrDatabase::GetDBCache() {
  if (!m_dbCache)
    m_dbCache = new AutoTArray<nsAddrDatabase *, kInitialAddrDBCacheSize>;

  return m_dbCache;
}

void nsAddrDatabase::CleanupCache() {
  if (m_dbCache) {
    for (int32_t i = m_dbCache->Length() - 1; i >= 0; --i) {
      nsAddrDatabase *pAddrDB = m_dbCache->ElementAt(i);
      if (pAddrDB) pAddrDB->ForceClosed();
    }
    // NS_ASSERTION(m_dbCache.Length() == 0, "some msg dbs left open");    //
    // better not be any open db's.
    delete m_dbCache;
    m_dbCache = nullptr;
  }
}

//----------------------------------------------------------------------
// FindInCache - this addrefs the db it finds.
//----------------------------------------------------------------------
already_AddRefed<nsAddrDatabase> nsAddrDatabase::FindInCache(nsIFile *dbName) {
  nsTArray<nsAddrDatabase *> *dbCache = GetDBCache();
  uint32_t length = dbCache->Length();
  for (uint32_t i = 0; i < length; ++i) {
    RefPtr<nsAddrDatabase> pAddrDB = dbCache->ElementAt(i);
    if (pAddrDB->MatchDbName(dbName)) {
      return pAddrDB.forget();
    }
  }
  return nullptr;
}

bool nsAddrDatabase::MatchDbName(nsIFile *dbName)  // returns true if they match
{
  bool dbMatches = false;

  nsresult rv = m_dbName->Equals(dbName, &dbMatches);
  if (NS_FAILED(rv)) return false;

  return dbMatches;
}

//----------------------------------------------------------------------
// RemoveFromCache
//----------------------------------------------------------------------
void nsAddrDatabase::RemoveFromCache(nsAddrDatabase *pAddrDB) {
  if (m_dbCache) m_dbCache->RemoveElement(pAddrDB);
}

nsresult nsAddrDatabase::GetMDBFactory(nsIMdbFactory **aMdbFactory) {
  if (!mMdbFactory) {
    nsresult rv;
    nsCOMPtr<nsIMdbFactoryService> mdbFactoryService =
        do_GetService(NS_MORK_CONTRACTID, &rv);
    if (NS_SUCCEEDED(rv) && mdbFactoryService) {
      rv = mdbFactoryService->GetMdbFactory(getter_AddRefs(mMdbFactory));
      NS_ENSURE_SUCCESS(rv, rv);
      if (!mMdbFactory) return NS_ERROR_FAILURE;
    }
  }
  NS_ADDREF(*aMdbFactory = mMdbFactory);
  return NS_OK;
}

/* caller need to delete *aDbPath */
NS_IMETHODIMP nsAddrDatabase::GetDbPath(nsIFile **aDbPath) {
  if (!aDbPath) return NS_ERROR_NULL_POINTER;

  return m_dbName->Clone(aDbPath);
}

NS_IMETHODIMP nsAddrDatabase::SetDbPath(nsIFile *aDbPath) {
  return aDbPath->Clone(getter_AddRefs(m_dbName));
}

NS_IMETHODIMP nsAddrDatabase::Open(nsIFile *aMabFile, bool aCreate,
                                   bool upgrading /* unused */,
                                   nsIAddrDatabase **pAddrDB) {
  *pAddrDB = nullptr;

  RefPtr<nsAddrDatabase> pAddressBookDB = FindInCache(aMabFile);

  if (pAddressBookDB) {
    pAddressBookDB.forget(pAddrDB);
    return NS_OK;
  }

  nsresult rv = OpenInternal(aMabFile, aCreate, pAddrDB);
  if (NS_SUCCEEDED(rv)) return NS_OK;

  if (rv == NS_ERROR_FILE_ACCESS_DENIED) {
    static bool gAlreadyAlerted;
    // only do this once per session to avoid annoying the user
    if (!gAlreadyAlerted) {
      gAlreadyAlerted = true;
      nsAutoString mabFileName;
      rv = aMabFile->GetLeafName(mabFileName);
      NS_ENSURE_SUCCESS(rv, rv);
      AlertAboutLockedMabFile(mabFileName);

      // We just overwrote rv, so return the proper value here.
      return NS_ERROR_FILE_ACCESS_DENIED;
    }
  }
  // try one more time
  // but first rename corrupt mab file
  // and prompt the user
  else if (aCreate) {
    nsCOMPtr<nsIFile> dummyBackupMabFile;
    nsCOMPtr<nsIFile> actualBackupMabFile;

    // First create a clone of the corrupt mab file that we'll
    // use to generate the name for the backup file that we are
    // going to move it to.
    rv = aMabFile->Clone(getter_AddRefs(dummyBackupMabFile));
    NS_ENSURE_SUCCESS(rv, rv);

    // Now create a second clone that we'll use to do the move
    // (this allows us to leave the original name intact)
    rv = aMabFile->Clone(getter_AddRefs(actualBackupMabFile));
    NS_ENSURE_SUCCESS(rv, rv);

    // Now we try and generate a new name for the corrupt mab
    // file using the dummy backup mab file

    // First append .bak - we have to do this the long way as
    // AppendNative is to the path, not the LeafName.
    nsAutoCString dummyBackupMabFileName;
    rv = dummyBackupMabFile->GetNativeLeafName(dummyBackupMabFileName);
    NS_ENSURE_SUCCESS(rv, rv);

    dummyBackupMabFileName.AppendLiteral(".bak");

    rv = dummyBackupMabFile->SetNativeLeafName(dummyBackupMabFileName);
    NS_ENSURE_SUCCESS(rv, rv);

    // Now see if we can create it unique
    rv = dummyBackupMabFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
    NS_ENSURE_SUCCESS(rv, rv);

    // Now get the new name
    nsAutoCString backupMabFileName;
    rv = dummyBackupMabFile->GetNativeLeafName(backupMabFileName);
    NS_ENSURE_SUCCESS(rv, rv);

    // And the parent directory
    nsCOMPtr<nsIFile> parentDir;
    rv = dummyBackupMabFile->GetParent(getter_AddRefs(parentDir));
    NS_ENSURE_SUCCESS(rv, rv);

    // Now move the corrupt file to its backup location
    rv = actualBackupMabFile->MoveToNative(parentDir, backupMabFileName);
    NS_ASSERTION(NS_SUCCEEDED(rv), "failed to rename corrupt mab file");

    if (NS_SUCCEEDED(rv)) {
      // now we can try to recreate the original mab file
      rv = OpenInternal(aMabFile, aCreate, pAddrDB);
      NS_ASSERTION(NS_SUCCEEDED(rv),
                   "failed to create .mab file, after rename");

      if (NS_SUCCEEDED(rv)) {
        nsAutoString originalMabFileName;
        rv = aMabFile->GetLeafName(originalMabFileName);
        NS_ENSURE_SUCCESS(rv, rv);

        // if this fails, we don't care
        (void)AlertAboutCorruptMabFile(
            originalMabFileName, NS_ConvertASCIItoUTF16(backupMabFileName));
      }
    }
  }
  return rv;
}

nsresult nsAddrDatabase::DisplayAlert(const char16_t *titleName,
                                      const char16_t *alertStringName,
                                      nsTArray<nsString> &formatStrings) {
  nsresult rv;
  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::services::GetStringBundleService();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIStringBundle> bundle;
  rv = bundleService->CreateBundle(
      "chrome://messenger/locale/addressbook/addressBook.properties",
      getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString alertMessage;
  rv =
      bundle->FormatStringFromName(NS_ConvertUTF16toUTF8(alertStringName).get(),
                                   formatStrings, alertMessage);
  NS_ENSURE_SUCCESS(rv, rv);

  nsString alertTitle;
  rv = bundle->GetStringFromName(NS_ConvertUTF16toUTF8(titleName).get(),
                                 alertTitle);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIPromptService> prompter =
      do_GetService(NS_PROMPTSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return prompter->Alert(nullptr /* we don't know the parent window */,
                         alertTitle.get(), alertMessage.get());
}

nsresult nsAddrDatabase::AlertAboutCorruptMabFile(
    const nsString &aOldFileName, const nsString &aNewFileName) {
  AutoTArray<nsString, 3> formatStrings = {aOldFileName, aOldFileName,
                                           aNewFileName};
  return DisplayAlert(u"corruptMabFileTitle", u"corruptMabFileAlert",
                      formatStrings);
}

nsresult nsAddrDatabase::AlertAboutLockedMabFile(const nsString &aFileName) {
  AutoTArray<nsString, 1> formatStrings = {aFileName};
  return DisplayAlert(u"lockedMabFileTitle", u"lockedMabFileAlert",
                      formatStrings);
}

nsresult nsAddrDatabase::OpenInternal(nsIFile *aMabFile, bool aCreate,
                                      nsIAddrDatabase **pAddrDB) {
  RefPtr<nsAddrDatabase> pAddressBookDB = new nsAddrDatabase();

  nsresult rv = pAddressBookDB->OpenMDB(aMabFile, aCreate);
  if (NS_SUCCEEDED(rv)) {
    pAddressBookDB->SetDbPath(aMabFile);
    GetDBCache()->AppendElement(pAddressBookDB);
    pAddressBookDB.forget(pAddrDB);
  } else {
    *pAddrDB = nullptr;
    pAddressBookDB->ForceClosed();
    pAddressBookDB = nullptr;
  }
  return rv;
}

// Open the MDB database synchronously. If successful, this routine
// will set up the m_mdbStore and m_mdbEnv of the database object
// so other database calls can work.
NS_IMETHODIMP nsAddrDatabase::OpenMDB(nsIFile *dbName, bool create) {
  nsCOMPtr<nsIMdbFactory> mdbFactory;
  nsresult ret = GetMDBFactory(getter_AddRefs(mdbFactory));
  NS_ENSURE_SUCCESS(ret, ret);

  ret = mdbFactory->MakeEnv(NULL, &m_mdbEnv);
  if (NS_SUCCEEDED(ret)) {
    nsIMdbThumb *thumb = nullptr;

    PathString filePath = dbName->NativePath();

    nsIMdbHeap *dbHeap = nullptr;

    if (m_mdbEnv) m_mdbEnv->SetAutoClear(true);

    bool dbNameExists = false;
    ret = dbName->Exists(&dbNameExists);
    NS_ENSURE_SUCCESS(ret, ret);

    if (!dbNameExists)
      ret = NS_ERROR_FILE_NOT_FOUND;
    else {
      mdbOpenPolicy inOpenPolicy;
      mdb_bool canOpen;
      mdbYarn outFormatVersion;
      nsIMdbFile *oldFile = nullptr;
      int64_t fileSize;
      ret = dbName->GetFileSize(&fileSize);
      NS_ENSURE_SUCCESS(ret, ret);

      ret = mdbFactory->OpenOldFile(
          m_mdbEnv, dbHeap, filePath.get(),
          mdbBool_kFalse,  // not readonly, we want modifiable
          &oldFile);
      if (oldFile) {
        if (NS_SUCCEEDED(ret)) {
          ret = mdbFactory->CanOpenFilePort(m_mdbEnv,
                                            oldFile,  // the file to investigate
                                            &canOpen, &outFormatVersion);
          if (NS_SUCCEEDED(ret) && canOpen) {
            inOpenPolicy.mOpenPolicy_ScopePlan.mScopeStringSet_Count = 0;
            inOpenPolicy.mOpenPolicy_MinMemory = 0;
            inOpenPolicy.mOpenPolicy_MaxLazy = 0;

            ret = mdbFactory->OpenFileStore(m_mdbEnv, dbHeap, oldFile,
                                            &inOpenPolicy, &thumb);
          } else if (fileSize != 0)
            ret = NS_ERROR_FILE_ACCESS_DENIED;
        }
        NS_RELEASE(oldFile);  // always release our file ref, store has own
      }
      if (NS_FAILED(ret)) ret = NS_ERROR_FILE_ACCESS_DENIED;
    }

    if (NS_SUCCEEDED(ret) && thumb) {
      mdb_count outTotal;        // total somethings to do in operation
      mdb_count outCurrent;      // subportion of total completed so far
      mdb_bool outDone = false;  // is operation finished?
      mdb_bool outBroken;        // is operation irreparably dead and broken?
      do {
        ret = thumb->DoMore(m_mdbEnv, &outTotal, &outCurrent, &outDone,
                            &outBroken);
        if (NS_FAILED(ret)) {
          outDone = true;
          break;
        }
      } while (NS_SUCCEEDED(ret) && !outBroken && !outDone);
      if (NS_SUCCEEDED(ret) && outDone) {
        ret = mdbFactory->ThumbToOpenStore(m_mdbEnv, thumb, &m_mdbStore);
        if (NS_SUCCEEDED(ret) && m_mdbStore) {
          ret = InitExistingDB();
          create = false;
        }
      }
    } else if (create && ret != NS_ERROR_FILE_ACCESS_DENIED) {
      ret = NS_ERROR_NOT_IMPLEMENTED;
    }
    NS_IF_RELEASE(thumb);
  }
  return ret;
}

NS_IMETHODIMP nsAddrDatabase::CloseMDB(bool commit) {
  if (commit) return NS_ERROR_NOT_IMPLEMENTED;
  //???    RemoveFromCache(this);  // if we've closed it, better not leave it in
  // the cache.
  return NS_OK;
}

// force the database to close - this'll flush out anybody holding onto
// a database without having a listener!
// This is evil in the com world, but there are times we need to delete the
// file.
NS_IMETHODIMP nsAddrDatabase::ForceClosed() {
  nsresult err = NS_OK;

  // make sure someone has a reference so object won't get deleted out from
  // under us.
  NS_ADDREF_THIS();
  // OK, remove from cache first and close the store.
  RemoveFromCache(this);

  err = CloseMDB(false);  // since we're about to delete it, no need to commit.
  NS_IF_RELEASE(m_mdbStore);
  NS_RELEASE_THIS();
  return err;
}

NS_IMETHODIMP nsAddrDatabase::Close(bool forceCommit /* = TRUE */) {
  return CloseMDB(forceCommit);
}

nsresult nsAddrDatabase::InitPabTable() {
  return m_mdbStore && m_mdbEnv
             ? m_mdbStore->NewTableWithOid(
                   m_mdbEnv, &gAddressBookTableOID, m_PabTableKind, false,
                   (const mdbOid *)nullptr, &m_mdbPabTable)
             : NS_ERROR_NULL_POINTER;
}

nsresult nsAddrDatabase::InitExistingDB() {
  nsresult err = InitMDBInfo();
  if (NS_SUCCEEDED(err)) {
    if (!m_mdbStore || !m_mdbEnv) return NS_ERROR_NULL_POINTER;

    err = m_mdbStore->GetTable(m_mdbEnv, &gAddressBookTableOID, &m_mdbPabTable);
    if (NS_SUCCEEDED(err) && m_mdbPabTable) {
      // This code has always run here. Removing it fails an assertion in the
      // Mork code which indicates a bad state. In the interest of saving
      // effort, and since this whole file is doomed after the next release,
      // I'm leaving it behind.
      nsIMdbTableRowCursor *rowCursor = nullptr;
      nsIMdbRow *findRow = nullptr;
      mdb_pos rowPos = 0;

      err = m_mdbPabTable->GetTableRowCursor(m_mdbEnv, -1, &rowCursor);
      if (NS_SUCCEEDED(err) && rowCursor) {
        do {
          err = rowCursor->NextRow(m_mdbEnv, &findRow, &rowPos);
        } while (NS_SUCCEEDED(err) && findRow);
        rowCursor->Release();
      }
    }
  }
  return err;
}

// initialize the various tokens and tables in our db's env
nsresult nsAddrDatabase::InitMDBInfo() {
  nsresult err = NS_OK;

  if (!m_mdbTokensInitialized && m_mdbStore && m_mdbEnv) {
    m_mdbTokensInitialized = true;
    err = m_mdbStore->StringToToken(m_mdbEnv, kCardRowScope,
                                    &m_CardRowScopeToken);
    err = m_mdbStore->StringToToken(m_mdbEnv, kListRowScope,
                                    &m_ListRowScopeToken);
    err = m_mdbStore->StringToToken(m_mdbEnv, kDataRowScope,
                                    &m_DataRowScopeToken);
    gAddressBookTableOID.mOid_Scope = m_CardRowScopeToken;
    gAddressBookTableOID.mOid_Id = ID_PAB_TABLE;
    if (NS_SUCCEEDED(err)) {
      m_mdbStore->StringToToken(m_mdbEnv, kUIDProperty, &m_UIDColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kFirstNameProperty,
                                &m_FirstNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kLastNameProperty,
                                &m_LastNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kPhoneticFirstNameProperty,
                                &m_PhoneticFirstNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kPhoneticLastNameProperty,
                                &m_PhoneticLastNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kDisplayNameProperty,
                                &m_DisplayNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kNicknameProperty,
                                &m_NickNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kPriEmailProperty,
                                &m_PriEmailColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kLowerPriEmailColumn,
                                &m_LowerPriEmailColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, k2ndEmailProperty,
                                &m_2ndEmailColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kLower2ndEmailColumn,
                                &m_Lower2ndEmailColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kPreferMailFormatProperty,
                                &m_MailFormatColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kPopularityIndexProperty,
                                &m_PopularityIndexColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kWorkPhoneProperty,
                                &m_WorkPhoneColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kHomePhoneProperty,
                                &m_HomePhoneColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kFaxProperty, &m_FaxColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kPagerProperty, &m_PagerColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kCellularProperty,
                                &m_CellularColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kWorkPhoneTypeProperty,
                                &m_WorkPhoneTypeColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kHomePhoneTypeProperty,
                                &m_HomePhoneTypeColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kFaxTypeProperty,
                                &m_FaxTypeColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kPagerTypeProperty,
                                &m_PagerTypeColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kCellularTypeProperty,
                                &m_CellularTypeColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kHomeAddressProperty,
                                &m_HomeAddressColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kHomeAddress2Property,
                                &m_HomeAddress2ColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kHomeCityProperty,
                                &m_HomeCityColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kHomeStateProperty,
                                &m_HomeStateColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kHomeZipCodeProperty,
                                &m_HomeZipCodeColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kHomeCountryProperty,
                                &m_HomeCountryColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kWorkAddressProperty,
                                &m_WorkAddressColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kWorkAddress2Property,
                                &m_WorkAddress2ColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kWorkCityProperty,
                                &m_WorkCityColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kWorkStateProperty,
                                &m_WorkStateColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kWorkZipCodeProperty,
                                &m_WorkZipCodeColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kWorkCountryProperty,
                                &m_WorkCountryColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kJobTitleProperty,
                                &m_JobTitleColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kDepartmentProperty,
                                &m_DepartmentColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kCompanyProperty,
                                &m_CompanyColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kScreenNameProperty,
                                &m_AimScreenNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kAnniversaryYearProperty,
                                &m_AnniversaryYearColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kAnniversaryMonthProperty,
                                &m_AnniversaryMonthColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kAnniversaryDayProperty,
                                &m_AnniversaryDayColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kSpouseNameProperty,
                                &m_SpouseNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kFamilyNameProperty,
                                &m_FamilyNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kWorkWebPageProperty,
                                &m_WebPage1ColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kHomeWebPageProperty,
                                &m_WebPage2ColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kBirthYearProperty,
                                &m_BirthYearColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kBirthMonthProperty,
                                &m_BirthMonthColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kBirthDayProperty,
                                &m_BirthDayColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kCustom1Property,
                                &m_Custom1ColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kCustom2Property,
                                &m_Custom2ColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kCustom3Property,
                                &m_Custom3ColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kCustom4Property,
                                &m_Custom4ColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kNotesProperty, &m_NotesColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kLastModifiedDateProperty,
                                &m_LastModDateColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kRecordKeyColumn,
                                &m_RecordKeyColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kAddressCharSetColumn,
                                &m_AddressCharSetColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kLastRecordKeyColumn,
                                &m_LastRecordKeyColumnToken);

      err = m_mdbStore->StringToToken(m_mdbEnv, kPabTableKind, &m_PabTableKind);

      m_mdbStore->StringToToken(m_mdbEnv, kMailListName,
                                &m_ListNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kMailListNickName,
                                &m_ListNickNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kMailListDescription,
                                &m_ListDescriptionColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kMailListTotalAddresses,
                                &m_ListTotalColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kLowerListNameColumn,
                                &m_LowerListNameColumnToken);
      m_mdbStore->StringToToken(m_mdbEnv, kDeletedCardsTableKind,
                                &m_DeletedCardsTableKind);
    }
  }
  return err;
}

////////////////////////////////////////////////////////////////////////////////

uint32_t nsAddrDatabase::GetListAddressTotal(nsIMdbRow *listRow) {
  uint32_t count = 0;
  GetIntColumn(listRow, m_ListTotalColumnToken, &count, 0);
  return count;
}

nsresult nsAddrDatabase::GetAddressRowByPos(nsIMdbRow *listRow, uint16_t pos,
                                            nsIMdbRow **cardRow) {
  if (!m_mdbStore || !listRow || !cardRow || !m_mdbEnv)
    return NS_ERROR_NULL_POINTER;

  mdb_token listAddressColumnToken;

  char columnStr[COLUMN_STR_MAX];
  PR_snprintf(columnStr, COLUMN_STR_MAX, kMailListAddressFormat, pos);
  m_mdbStore->StringToToken(m_mdbEnv, columnStr, &listAddressColumnToken);

  nsAutoString tempString;
  mdb_id rowID;
  nsresult err =
      GetIntColumn(listRow, listAddressColumnToken, (uint32_t *)&rowID, 0);
  NS_ENSURE_SUCCESS(err, err);

  return GetCardRowByRowID(rowID, cardRow);
}

nsresult nsAddrDatabase::GetStringColumn(nsIMdbRow *cardRow, mdb_token outToken,
                                         nsString &str) {
  nsresult err = NS_ERROR_NULL_POINTER;
  nsIMdbCell *cardCell;

  if (cardRow && m_mdbEnv) {
    err = cardRow->GetCell(m_mdbEnv, outToken, &cardCell);
    if (NS_SUCCEEDED(err) && cardCell) {
      struct mdbYarn yarn;
      cardCell->AliasYarn(m_mdbEnv, &yarn);
      NS_ConvertUTF8toUTF16 uniStr((const char *)yarn.mYarn_Buf,
                                   yarn.mYarn_Fill);
      if (!uniStr.IsEmpty())
        str.Assign(uniStr);
      else
        err = NS_ERROR_FAILURE;
      cardCell->Release();  // always release ref
    } else
      err = NS_ERROR_FAILURE;
  }
  return err;
}

void nsAddrDatabase::YarnToUInt32(struct mdbYarn *yarn, uint32_t *pResult) {
  uint8_t numChars = std::min<mdb_fill>(8, yarn->mYarn_Fill);
  *pResult = MsgUnhex((char *)yarn->mYarn_Buf, numChars);
}

nsresult nsAddrDatabase::GetIntColumn(nsIMdbRow *cardRow, mdb_token outToken,
                                      uint32_t *pValue, uint32_t defaultValue) {
  nsresult err = NS_ERROR_NULL_POINTER;
  nsIMdbCell *cardCell;

  if (pValue) *pValue = defaultValue;
  if (cardRow && m_mdbEnv) {
    err = cardRow->GetCell(m_mdbEnv, outToken, &cardCell);
    if (NS_SUCCEEDED(err) && cardCell) {
      struct mdbYarn yarn;
      cardCell->AliasYarn(m_mdbEnv, &yarn);
      YarnToUInt32(&yarn, pValue);
      cardCell->Release();
    } else
      err = NS_ERROR_FAILURE;
  }
  return err;
}

NS_IMETHODIMP nsAddrDatabase::InitCardFromRow(nsIAbCard *newCard,
                                              nsIMdbRow *cardRow) {
  nsresult rv = NS_OK;
  if (!newCard || !cardRow || !m_mdbEnv) return NS_ERROR_NULL_POINTER;

  nsCOMPtr<nsIMdbRowCellCursor> cursor;
  nsCOMPtr<nsIMdbCell> cell;

  rv = cardRow->GetRowCellCursor(m_mdbEnv, -1, getter_AddRefs(cursor));
  NS_ENSURE_SUCCESS(rv, rv);

  mdb_column columnNumber;
  char columnName[100];
  struct mdbYarn colYarn = {columnName, 0, sizeof(columnName), 0, 0, nullptr};
  struct mdbYarn cellYarn;

  do {
    rv = cursor->NextCell(m_mdbEnv, getter_AddRefs(cell), &columnNumber,
                          nullptr);
    NS_ENSURE_SUCCESS(rv, rv);

    if (!cell) break;

    // Get the value of the cell
    cell->AliasYarn(m_mdbEnv, &cellYarn);
    NS_ConvertUTF8toUTF16 value(static_cast<const char *>(cellYarn.mYarn_Buf),
                                cellYarn.mYarn_Fill);

    if (!value.IsEmpty()) {
      // Get the column of the cell
      // Mork makes this so hard...
      rv = m_mdbStore->TokenToString(m_mdbEnv, columnNumber, &colYarn);
      NS_ENSURE_SUCCESS(rv, rv);

      char *name = PL_strndup(static_cast<char *>(colYarn.mYarn_Buf),
                              colYarn.mYarn_Fill);
      newCard->SetPropertyAsAString(name, value);
      PL_strfree(name);
    }
  } while (true);

  uint32_t key = 0;
  rv = GetIntColumn(cardRow, m_RecordKeyColumnToken, &key, 0);
  if (NS_SUCCEEDED(rv)) newCard->SetPropertyAsUint32(kRecordKeyColumn, key);

  return NS_OK;
}

nsresult nsAddrDatabase::GetListCardFromDB(nsIAbCard *listCard,
                                           nsIMdbRow *listRow) {
  nsresult err = NS_OK;
  if (!listCard || !listRow) return NS_ERROR_NULL_POINTER;

  nsAutoString tempString;

  err = GetStringColumn(listRow, m_UIDColumnToken, tempString);
  if (NS_SUCCEEDED(err) && !tempString.IsEmpty()) {
    listCard->SetPropertyAsAString(kUIDProperty, tempString);
  }
  err = GetStringColumn(listRow, m_ListNameColumnToken, tempString);
  if (NS_SUCCEEDED(err) && !tempString.IsEmpty()) {
    listCard->SetDisplayName(tempString);
    listCard->SetLastName(tempString);
  }
  err = GetStringColumn(listRow, m_ListNickNameColumnToken, tempString);
  if (NS_SUCCEEDED(err) && !tempString.IsEmpty()) {
    listCard->SetPropertyAsAString(kNicknameProperty, tempString);
  }
  err = GetStringColumn(listRow, m_ListDescriptionColumnToken, tempString);
  if (NS_SUCCEEDED(err) && !tempString.IsEmpty()) {
    listCard->SetPropertyAsAString(kNotesProperty, tempString);
  }
  uint32_t key = 0;
  err = GetIntColumn(listRow, m_RecordKeyColumnToken, &key, 0);
  if (NS_SUCCEEDED(err)) listCard->SetPropertyAsUint32(kRecordKeyColumn, key);
  return err;
}

class nsAddrDBEnumerator : public nsSimpleEnumerator {
 public:
  const nsID &DefaultInterface() override { return NS_GET_IID(nsIAbCard); }

  // nsISimpleEnumerator methods:
  NS_DECL_NSISIMPLEENUMERATOR

  // nsAddrDBEnumerator methods:
  explicit nsAddrDBEnumerator(nsAddrDatabase *aDb);
  void Clear();

 protected:
  RefPtr<nsAddrDatabase> mDb;
  nsIMdbTable *mDbTable;
  nsCOMPtr<nsIMdbTableRowCursor> mRowCursor;
  nsCOMPtr<nsIMdbRow> mCurrentRow;
  mdb_pos mRowPos;
};

nsAddrDBEnumerator::nsAddrDBEnumerator(nsAddrDatabase *aDb)
    : mDb(aDb), mDbTable(aDb->GetPabTable()), mRowPos(-1) {}

NS_IMETHODIMP
nsAddrDBEnumerator::HasMoreElements(bool *aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = false;

  if (!mDbTable || !mDb->GetEnv()) {
    return NS_ERROR_NULL_POINTER;
  }

  nsCOMPtr<nsIMdbTableRowCursor> rowCursor;
  mDbTable->GetTableRowCursor(mDb->GetEnv(), mRowPos,
                              getter_AddRefs(rowCursor));
  NS_ENSURE_TRUE(rowCursor, NS_ERROR_FAILURE);

  mdbOid rowOid;
  rowCursor->NextRowOid(mDb->GetEnv(), &rowOid, nullptr);
  while (rowOid.mOid_Id != (mdb_id)-1) {
    if (mDb->IsListRowScopeToken(rowOid.mOid_Scope) ||
        mDb->IsCardRowScopeToken(rowOid.mOid_Scope)) {
      *aResult = true;

      return NS_OK;
    }

    if (!mDb->IsDataRowScopeToken(rowOid.mOid_Scope)) {
      return NS_ERROR_FAILURE;
    }

    rowCursor->NextRowOid(mDb->GetEnv(), &rowOid, nullptr);
  }

  return NS_OK;
}

NS_IMETHODIMP
nsAddrDBEnumerator::GetNext(nsISupports **aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  *aResult = nullptr;

  if (!mDbTable || !mDb->GetEnv()) {
    return NS_ERROR_NULL_POINTER;
  }

  if (!mRowCursor) {
    mDbTable->GetTableRowCursor(mDb->GetEnv(), -1, getter_AddRefs(mRowCursor));
    NS_ENSURE_TRUE(mRowCursor, NS_ERROR_FAILURE);
  }

  nsCOMPtr<nsIAbCard> resultCard;
  mRowCursor->NextRow(mDb->GetEnv(), getter_AddRefs(mCurrentRow), &mRowPos);
  while (mCurrentRow) {
    mdbOid rowOid;
    if (NS_SUCCEEDED(mCurrentRow->GetOid(mDb->GetEnv(), &rowOid))) {
      nsresult rv;
      if (mDb->IsListRowScopeToken(rowOid.mOid_Scope)) {
        rv = mDb->CreateABListCard(mCurrentRow, getter_AddRefs(resultCard));
        NS_ENSURE_SUCCESS(rv, rv);
      } else if (mDb->IsCardRowScopeToken(rowOid.mOid_Scope)) {
        rv = mDb->CreateABCard(mCurrentRow, 0, getter_AddRefs(resultCard));
        NS_ENSURE_SUCCESS(rv, rv);
      } else if (!mDb->IsDataRowScopeToken(rowOid.mOid_Scope)) {
        return NS_ERROR_FAILURE;
      }

      if (resultCard) {
        return CallQueryInterface(resultCard, aResult);
      }
    }

    mRowCursor->NextRow(mDb->GetEnv(), getter_AddRefs(mCurrentRow), &mRowPos);
  }

  return NS_ERROR_FAILURE;
}

class nsListAddressEnumerator final : public nsSimpleEnumerator {
 public:
  const nsID &DefaultInterface() override { return NS_GET_IID(nsIAbCard); }

  // nsISimpleEnumerator methods:
  NS_DECL_NSISIMPLEENUMERATOR

  // nsListAddressEnumerator methods:
  nsListAddressEnumerator(nsAddrDatabase *aDb, mdb_id aRowID);

 protected:
  ~nsListAddressEnumerator() override = default;
  RefPtr<nsAddrDatabase> mDb;
  nsIMdbTable *mDbTable;
  nsCOMPtr<nsIMdbRow> mListRow;
  mdb_id mListRowID;
  uint32_t mAddressTotal;
  uint16_t mAddressPos;
};

nsListAddressEnumerator::nsListAddressEnumerator(nsAddrDatabase *aDb,
                                                 mdb_id aRowID)
    : mDb(aDb),
      mDbTable(aDb->GetPabTable()),
      mListRowID(aRowID),
      mAddressPos(0) {
  mDb->GetListRowByRowID(mListRowID, getter_AddRefs(mListRow));
  mAddressTotal = aDb->GetListAddressTotal(mListRow);
}

NS_IMETHODIMP
nsListAddressEnumerator::HasMoreElements(bool *aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  *aResult = false;

  if (!mDbTable || !mDb->GetEnv()) {
    return NS_ERROR_NULL_POINTER;
  }

  // In some cases it is possible that GetAddressRowByPos returns success,
  // but currentRow is null. This is typically due to the fact that a card
  // has been deleted from the parent and not the list. Whilst we have fixed
  // that there are still a few dbs around there that we need to support
  // correctly. Therefore, whilst processing lists ensure that we don't return
  // false if the only thing stopping us is a blank row, just skip it and try
  // the next one.
  while (mAddressPos < mAddressTotal) {
    nsCOMPtr<nsIMdbRow> currentRow;
    nsresult rv = mDb->GetAddressRowByPos(mListRow, mAddressPos + 1,
                                          getter_AddRefs(currentRow));

    if (NS_SUCCEEDED(rv) && currentRow) {
      *aResult = true;
      break;
    }

    ++mAddressPos;
  }

  return NS_OK;
}

NS_IMETHODIMP
nsListAddressEnumerator::GetNext(nsISupports **aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  *aResult = nullptr;

  if (!mDbTable || !mDb->GetEnv()) {
    return NS_ERROR_NULL_POINTER;
  }

  while (++mAddressPos <= mAddressTotal) {
    nsCOMPtr<nsIMdbRow> currentRow;
    nsresult rv = mDb->GetAddressRowByPos(mListRow, mAddressPos,
                                          getter_AddRefs(currentRow));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIAbCard> resultCard;
      rv =
          mDb->CreateABCard(currentRow, mListRowID, getter_AddRefs(resultCard));
      NS_ENSURE_SUCCESS(rv, rv);

      return CallQueryInterface(resultCard, aResult);
    }
  }

  return NS_ERROR_FAILURE;
}

////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP nsAddrDatabase::EnumerateCards(nsIAbDirectory *directory,
                                             nsISimpleEnumerator **result) {
  NS_ADDREF(*result = new nsAddrDBEnumerator(this));
  m_dbDirectory = do_GetWeakReference(directory);
  return NS_OK;
}

NS_IMETHODIMP nsAddrDatabase::EnumerateListAddresses(
    nsIAbDirectory *directory, uint32_t listRowID,
    nsISimpleEnumerator **result) {
  NS_ADDREF(*result = new nsListAddressEnumerator(this, listRowID));
  m_dbDirectory = do_GetWeakReference(directory);
  return NS_OK;
}

nsresult nsAddrDatabase::CreateCard(nsIMdbRow *cardRow, mdb_id listRowID,
                                    nsIAbCard **result) {
  if (!cardRow || !m_mdbEnv || !result) return NS_ERROR_NULL_POINTER;

  nsresult rv = NS_OK;

  mdbOid outOid;
  mdb_id rowID = 0;

  if (NS_SUCCEEDED(cardRow->GetOid(m_mdbEnv, &outOid))) rowID = outOid.mOid_Id;

  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIAbCard> personCard;
    personCard = do_CreateInstance(NS_ABCARDPROPERTY_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    InitCardFromRow(personCard, cardRow);
    personCard->SetPropertyAsUint32(kRowIDProperty, rowID);

    nsAutoCString id;
    id.AppendInt(rowID);
    personCard->SetLocalId(id);

    nsCOMPtr<nsIAbDirectory> abDir(do_QueryReferent(m_dbDirectory));
    if (abDir) abDir->GetUuid(id);

    personCard->SetDirectoryId(id);

    personCard.forget(result);
  }

  return rv;
}

nsresult nsAddrDatabase::CreateABCard(nsIMdbRow *cardRow, mdb_id listRowID,
                                      nsIAbCard **result) {
  return CreateCard(cardRow, listRowID, result);
}

/* create a card for mailing list in the address book */
nsresult nsAddrDatabase::CreateABListCard(nsIMdbRow *listRow,
                                          nsIAbCard **result) {
  if (!listRow || !m_mdbEnv || !result) return NS_ERROR_NULL_POINTER;

  nsresult rv = NS_OK;

  mdbOid outOid;
  mdb_id rowID = 0;

  if (NS_SUCCEEDED(listRow->GetOid(m_mdbEnv, &outOid))) rowID = outOid.mOid_Id;

  char *listURI = nullptr;

  nsAutoString fileName;
  rv = m_dbName->GetLeafName(fileName);
  NS_ENSURE_SUCCESS(rv, rv);
  listURI = PR_smprintf("MailList%ld", rowID);

  nsCOMPtr<nsIAbCard> personCard;
  personCard = do_CreateInstance(NS_ABCARDPROPERTY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  if (personCard) {
    GetListCardFromDB(personCard, listRow);

    personCard->SetPropertyAsUint32(kRowIDProperty, rowID);
    personCard->SetIsMailList(true);
    personCard->SetMailListURI(listURI);

    nsAutoCString id;
    id.AppendInt(rowID);
    personCard->SetLocalId(id);

    nsCOMPtr<nsIAbDirectory> abDir(do_QueryReferent(m_dbDirectory));
    if (abDir) abDir->GetUuid(id);
    personCard->SetDirectoryId(id);
  }

  personCard.forget(result);
  if (listURI) PR_smprintf_free(listURI);

  return rv;
}

nsresult nsAddrDatabase::GetCardRowByRowID(mdb_id rowID, nsIMdbRow **dbRow) {
  if (!m_mdbStore || !m_mdbEnv) return NS_ERROR_NULL_POINTER;

  mdbOid rowOid;
  rowOid.mOid_Scope = m_CardRowScopeToken;
  rowOid.mOid_Id = rowID;

  return m_mdbStore->GetRow(m_mdbEnv, &rowOid, dbRow);
}

nsresult nsAddrDatabase::GetListRowByRowID(mdb_id rowID, nsIMdbRow **dbRow) {
  if (!m_mdbStore || !m_mdbEnv) return NS_ERROR_NULL_POINTER;

  mdbOid rowOid;
  rowOid.mOid_Scope = m_ListRowScopeToken;
  rowOid.mOid_Id = rowID;

  return m_mdbStore->GetRow(m_mdbEnv, &rowOid, dbRow);
}
