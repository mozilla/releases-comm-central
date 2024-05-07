/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nsMsgFolderCache.h"
#include "nsIMsgFolderCacheElement.h"
#include "nsNetUtil.h"
#include "nsStreamUtils.h"
#include "nsIOutputStream.h"
#include "nsIInputStream.h"
#include "nsISafeOutputStream.h"
#include "prprf.h"
#include "mozilla/Logging.h"
// Mork-related includes.
#include "nsIMdbFactoryFactory.h"
#include "mdb.h"
// Includes for jsoncpp.
#include "json/json.h"
#include <string>

using namespace mozilla;

static LazyLogModule sFolderCacheLog("MsgFolderCache");

// Helper functions for migration of legacy pancea.dat files.
static nsresult importFromMork(PathString const& dbName, Json::Value& root);
static nsresult convertTable(nsIMdbEnv* env, nsIMdbStore* store,
                             nsIMdbTable* table, Json::Value& root);
static void applyEntry(nsCString const& name, nsCString const& val,
                       Json::Value& obj);

/*
 * nsMsgFolderCacheElement
 * Folders are given this to let them manipulate their cache data.
 */
class nsMsgFolderCacheElement : public nsIMsgFolderCacheElement {
 public:
  nsMsgFolderCacheElement(nsMsgFolderCache* owner, nsACString const& key)
      : mOwner(owner), mKey(key) {}
  nsMsgFolderCacheElement() = delete;

  NS_DECL_ISUPPORTS

  NS_IMETHOD GetKey(nsACString& key) override {
    key = mKey;
    return NS_OK;
  }

  NS_IMETHOD SetKey(nsACString const& newKey) override {
    // Update the parent nsMsgFolderCache.
    Json::Value& root = *mOwner->mRoot;
    if (root.isMember(PromiseFlatCString(newKey).get())) {
      return NS_ERROR_FAILURE;  // newKey already exists!
    }
    Json::Value obj;
    if (!root.removeMember(PromiseFlatCString(mKey).get(), &obj)) {
      return NS_ERROR_NOT_AVAILABLE;  // Key not found.
    }
    mKey = newKey;
    Obj() = obj;
    mOwner->SetModified();
    return NS_OK;
  }

  NS_IMETHOD GetCachedString(const char* name, nsACString& _retval) override {
    if (!Obj().isMember(name)) return NS_ERROR_NOT_AVAILABLE;
    Json::Value& o = Obj()[name];
    if (o.isConvertibleTo(Json::stringValue)) {
      _retval = o.asString().c_str();
      return NS_OK;
    }
    // Leave _retval unchanged if an error occurs.
    return NS_ERROR_NOT_AVAILABLE;
  }

  NS_IMETHOD GetCachedInt32(const char* name, int32_t* _retval) override {
    if (!Obj().isMember(name)) return NS_ERROR_NOT_AVAILABLE;
    Json::Value& o = Obj()[name];
    if (o.isConvertibleTo(Json::intValue)) {
      *_retval = o.asInt();
      return NS_OK;
    }
    // Leave _retval unchanged if an error occurs.
    return NS_ERROR_NOT_AVAILABLE;
  }

  NS_IMETHOD GetCachedUInt32(const char* name, uint32_t* _retval) override {
    if (!Obj().isMember(name)) return NS_ERROR_NOT_AVAILABLE;
    Json::Value& o = Obj()[name];
    if (o.isConvertibleTo(Json::uintValue)) {
      *_retval = o.asUInt();
      return NS_OK;
    }
    // Leave _retval unchanged if an error occurs.
    return NS_ERROR_NOT_AVAILABLE;
  }

  NS_IMETHOD GetCachedInt64(const char* name, int64_t* _retval) override {
    if (!Obj().isMember(name)) return NS_ERROR_NOT_AVAILABLE;
    Json::Value& o = Obj()[name];
    // isConvertibleTo() doesn't seem to support Int64. Hence multiple checks.
    if (o.isNumeric() || o.isNull() || o.isBool()) {
      *_retval = o.asInt64();
      return NS_OK;
    }
    // Leave _retval unchanged if an error occurs.
    return NS_ERROR_NOT_AVAILABLE;
  }

  NS_IMETHOD SetCachedString(const char* name,
                             const nsACString& value) override {
    if (Obj()[name] != PromiseFlatCString(value).get()) {
      Obj()[name] = PromiseFlatCString(value).get();
      mOwner->SetModified();
    }
    return NS_OK;
  }

  NS_IMETHOD SetCachedInt32(const char* name, int32_t value) override {
    if (Obj()[name] != value) {
      Obj()[name] = value;
      mOwner->SetModified();
    }
    return NS_OK;
  }

  NS_IMETHOD SetCachedUInt32(const char* name, uint32_t value) override {
    if (Obj()[name] != value) {
      Obj()[name] = value;
      mOwner->SetModified();
    }
    return NS_OK;
  }
  NS_IMETHOD SetCachedInt64(const char* name, int64_t value) override {
    if (Obj()[name] != value) {
      Obj()[name] = value;
      mOwner->SetModified();
    }
    return NS_OK;
  }

 protected:
  virtual ~nsMsgFolderCacheElement() {}
  RefPtr<nsMsgFolderCache> mOwner;
  nsAutoCString mKey;

  // Helper to get the Json object for this nsFolderCacheElement,
  // creating it if it doesn't already exist.
  Json::Value& Obj() {
    Json::Value& root = *mOwner->mRoot;
    // This will create an empty object if it doesn't already exist.
    Json::Value& v = root[mKey.get()];
    if (v.isObject()) {
      return v;
    }
    // uhoh... either the folder entry doesn't exist (expected) or
    // the json file wasn't the structure we were expecting.
    // We _really_ don't want jsoncpp to be throwing exceptions, so in either
    // case we'll create a fresh new empty object there.
    root[mKey.get()] = Json::Value(Json::objectValue);
    return root[mKey.get()];
  }
};

NS_IMPL_ISUPPORTS(nsMsgFolderCacheElement, nsIMsgFolderCacheElement)

/*
 * nsMsgFolderCache implementation
 */

NS_IMPL_ISUPPORTS(nsMsgFolderCache, nsIMsgFolderCache)

// mRoot dynamically allocated here to avoid exposing Json in header file.
nsMsgFolderCache::nsMsgFolderCache()
    : mRoot(new Json::Value(Json::objectValue)),
      mSavePending(false),
      mSaveTimer(NS_NewTimer()) {}

NS_IMETHODIMP nsMsgFolderCache::Init(nsIFile* cacheFile, nsIFile* legacyFile) {
  mCacheFile = cacheFile;
  // Is there a JSON file to load?
  bool exists;
  nsresult rv = cacheFile->Exists(&exists);
  if (NS_SUCCEEDED(rv) && exists) {
    rv = LoadFolderCache(cacheFile);
    if (NS_FAILED(rv)) {
      MOZ_LOG(
          sFolderCacheLog, LogLevel::Error,
          ("Failed to load %s (code 0x%x)",
           cacheFile->HumanReadablePath().get(), static_cast<uint32_t>(rv)));
    }
    // Ignore error. If load fails, we'll just start off with empty cache.
    return NS_OK;
  }

  MOZ_LOG(sFolderCacheLog, LogLevel::Debug, ("No cache file found."));

  // No sign of new-style JSON file. Maybe there's an old panacea.dat we can
  // migrate?
  if (!legacyFile) {
    return NS_OK;
  }

  rv = legacyFile->Exists(&exists);
  if (NS_SUCCEEDED(rv) && exists) {
    MOZ_LOG(sFolderCacheLog, LogLevel::Debug,
            ("Found %s. Attempting migration.",
             legacyFile->HumanReadablePath().get()));
    Json::Value root(Json::objectValue);
    rv = importFromMork(legacyFile->NativePath(), root);
    if (NS_SUCCEEDED(rv)) {
      *mRoot = root;
      MOZ_LOG(sFolderCacheLog, LogLevel::Debug,
              ("Migration: Legacy cache imported"));
      // Migrate it to JSON.
      rv = SaveFolderCache(cacheFile);
      if (NS_SUCCEEDED(rv)) {
        // We're done with the legacy panacea.dat - remove it.
        legacyFile->Remove(false);
      } else {
        MOZ_LOG(
            sFolderCacheLog, LogLevel::Error,
            ("Migration: save failed (code 0x%x)", static_cast<uint32_t>(rv)));
      }
    } else {
      MOZ_LOG(
          sFolderCacheLog, LogLevel::Error,
          ("Migration: import failed (code 0x%x)", static_cast<uint32_t>(rv)));
    }
  }
  // Never fails.
  return NS_OK;
}

nsMsgFolderCache::~nsMsgFolderCache() {
  Flush();
  delete mRoot;
}

NS_IMETHODIMP nsMsgFolderCache::Flush() {
  if (mSavePending) {
    mSaveTimer->Cancel();
    mSavePending = false;
    MOZ_LOG(sFolderCacheLog, LogLevel::Debug, ("Forced save."));
    nsresult rv = SaveFolderCache(mCacheFile);
    if (NS_FAILED(rv)) {
      MOZ_LOG(
          sFolderCacheLog, LogLevel::Error,
          ("Failed to write to %s (code 0x%x)",
           mCacheFile->HumanReadablePath().get(), static_cast<uint32_t>(rv)));
    }
  }
  return NS_OK;
}

// Read the cache data from inFile.
// It's atomic - if a failure occurs, the cache data will be left unchanged.
nsresult nsMsgFolderCache::LoadFolderCache(nsIFile* inFile) {
  MOZ_LOG(sFolderCacheLog, LogLevel::Debug,
          ("Loading %s", inFile->HumanReadablePath().get()));

  nsCOMPtr<nsIInputStream> inStream;
  nsresult rv = NS_NewLocalFileInputStream(getter_AddRefs(inStream), inFile);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString data;
  rv = NS_ConsumeStream(inStream, UINT32_MAX, data);
  if (NS_FAILED(rv)) {
    MOZ_LOG(sFolderCacheLog, LogLevel::Error, ("Read failed."));
    return rv;
  }

  Json::Value root;
  Json::CharReaderBuilder builder;
  std::unique_ptr<Json::CharReader> const reader(builder.newCharReader());
  if (!reader->parse(data.BeginReading(), data.EndReading(), &root, nullptr)) {
    MOZ_LOG(sFolderCacheLog, LogLevel::Error, ("Error parsing JSON"));
    return NS_ERROR_FAILURE;  // parsing failed.
  }
  if (!root.isObject()) {
    MOZ_LOG(sFolderCacheLog, LogLevel::Error, ("JSON root is not an object"));
    return NS_ERROR_FAILURE;  // bad format.
  }
  *mRoot = root;
  return NS_OK;
}

// Write the cache data to outFile.
nsresult nsMsgFolderCache::SaveFolderCache(nsIFile* outFile) {
  MOZ_LOG(sFolderCacheLog, LogLevel::Debug,
          ("Save to %s", outFile->HumanReadablePath().get()));

  // Serialise the data.
  Json::StreamWriterBuilder b;
  //  b["indentation"] = "";
  std::string out = Json::writeString(b, *mRoot);

  // Safe stream, writes to a tempfile first then moves into proper place when
  // Finish() is called. Could use NS_NewAtomicFileOutputStream, but seems hard
  // to justify a full filesystem flush).
  nsCOMPtr<nsIOutputStream> outputStream;
  nsresult rv =
      NS_NewSafeLocalFileOutputStream(getter_AddRefs(outputStream), outFile,
                                      PR_CREATE_FILE | PR_TRUNCATE | PR_WRONLY);
  NS_ENSURE_SUCCESS(rv, rv);

  const char* ptr = out.data();
  uint32_t remaining = out.length();
  while (remaining > 0) {
    uint32_t written = 0;
    rv = outputStream->Write(ptr, remaining, &written);
    NS_ENSURE_SUCCESS(rv, rv);
    remaining -= written;
    ptr += written;
  }
  nsCOMPtr<nsISafeOutputStream> safeStream = do_QueryInterface(outputStream);
  MOZ_ASSERT(safeStream);
  rv = safeStream->Finish();
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

NS_IMETHODIMP nsMsgFolderCache::GetCacheElement(
    const nsACString& pathKey, bool createIfMissing,
    nsIMsgFolderCacheElement** result) {
  if (mRoot->isMember(PromiseFlatCString(pathKey).get()) || createIfMissing) {
    nsCOMPtr<nsIMsgFolderCacheElement> element =
        new nsMsgFolderCacheElement(this, pathKey);
    element.forget(result);
    return NS_OK;
  }
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP nsMsgFolderCache::RemoveElement(const nsACString& key) {
  mRoot->removeMember(PromiseFlatCString(key).get());
  return NS_OK;
}

void nsMsgFolderCache::SetModified() {
  if (mSavePending) {
    return;
  }
  nsresult rv = mSaveTimer->InitWithNamedFuncCallback(
      doSave, (void*)this, kSaveDelayMs, nsITimer::TYPE_ONE_SHOT,
      "msgFolderCache::doSave");
  if (NS_SUCCEEDED(rv)) {
    MOZ_LOG(sFolderCacheLog, LogLevel::Debug,
            ("AutoSave in %ds", kSaveDelayMs / 1000));
    mSavePending = true;
  }
}

// static
void nsMsgFolderCache::doSave(nsITimer*, void* closure) {
  MOZ_LOG(sFolderCacheLog, LogLevel::Debug, ("AutoSave"));
  nsMsgFolderCache* that = static_cast<nsMsgFolderCache*>(closure);
  nsresult rv = that->SaveFolderCache(that->mCacheFile);
  if (NS_FAILED(rv)) {
    MOZ_LOG(sFolderCacheLog, LogLevel::Error,
            ("Failed writing %s (code 0x%x)",
             that->mCacheFile->HumanReadablePath().get(),
             static_cast<uint32_t>(rv)));
  }
  that->mSavePending = false;
}

// Helper to apply a legacy property to the new JSON format.
static void applyEntry(nsCString const& name, nsCString const& val,
                       Json::Value& obj) {
  // The old mork version stored all numbers as hex, so we need to convert
  // them into proper Json numeric types. But there's no type info in the
  // database so we just have to know which values to convert.
  // We can find a list of all the numeric values by grepping the codebase
  // for GetCacheInt32/GetCachedInt64. We treat everything else as a string.
  // It's much harder to get a definitive list of possible keys for strings,
  // because nsIMsgFolderCache is also used to cache nsDBFolderInfo data -
  // see nsMsgDBFolder::GetStringProperty().

  // One of the Int32 properties?
  if (name.EqualsLiteral("hierDelim") ||
      name.EqualsLiteral("lastSyncTimeInSec") ||
      name.EqualsLiteral("nextUID") || name.EqualsLiteral("pendingMsgs") ||
      name.EqualsLiteral("pendingUnreadMsgs") ||
      name.EqualsLiteral("serverRecent") || name.EqualsLiteral("serverTotal") ||
      name.EqualsLiteral("serverUnseen") || name.EqualsLiteral("totalMsgs") ||
      name.EqualsLiteral("totalUnreadMsgs")) {
    if (val.IsEmpty()) {
      return;
    }
    int32_t i32;
    if (PR_sscanf(val.get(), "%x", &i32) != 1) {
      return;
    }
    obj[name.get()] = i32;
    return;
  }

  // Flags were int32. But the upper bit can be set, meaning we'll get
  // annoying negative values, which isn't what we want. Not so much of an
  // issue with legacy pancea.dat as it was all hex strings anyway. But let's
  // fix it up as we go to JSON.
  if (name.EqualsLiteral("aclFlags") || name.EqualsLiteral("boxFlags") ||
      name.EqualsLiteral("flags")) {
    uint32_t u32;
    if (PR_sscanf(val.get(), "%x", &u32) != 1) {
      return;
    }
    obj[name.get()] = u32;
    return;
  }

  // One of the Int64 properties?
  if (name.EqualsLiteral("expungedBytes") || name.EqualsLiteral("folderSize")) {
    if (val.IsEmpty()) {
      return;
    }
    int64_t i64;
    if (PR_sscanf(val.get(), "%llx", &i64) != 1) {
      return;
    }
    obj[name.get()] = i64;
    return;
  }

  // Assume anything else is a string.
  obj[name.get()] = val.get();
}

// Import an old panacea.dat mork file, converting it into our JSON form.
// The flow of this is taken from the old implementation. There are a couple
// of steps that may not be strictly required, but have been left in anyway
// on the grounds that it works.
static nsresult importFromMork(PathString const& dbName, Json::Value& root) {
  nsresult rv;
  nsCOMPtr<nsIMdbFactoryService> factoryService =
      do_GetService("@mozilla.org/db/mork;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMdbFactory> factory;
  rv = factoryService->GetMdbFactory(getter_AddRefs(factory));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMdbEnv> env;
  rv = factory->MakeEnv(nullptr, getter_AddRefs(env));
  NS_ENSURE_SUCCESS(rv, rv);

  env->SetAutoClear(true);
  nsCOMPtr<nsIMdbFile> dbFile;
  rv = factory->OpenOldFile(env,
                            nullptr,  // Use default heap alloc fns.
                            dbName.get(),
                            mdbBool_kTrue,  // Frozen (read only).
                            getter_AddRefs(dbFile));
  NS_ENSURE_SUCCESS(rv, rv);

  // Unsure if we actually need this...
  mdb_bool canOpen;
  mdbYarn outFormatVersion;
  rv = factory->CanOpenFilePort(env, dbFile, &canOpen, &outFormatVersion);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!canOpen) {
    return NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE;
  }

  mdbOpenPolicy inOpenPolicy;
  inOpenPolicy.mOpenPolicy_ScopePlan.mScopeStringSet_Count = 0;
  inOpenPolicy.mOpenPolicy_MinMemory = 0;
  inOpenPolicy.mOpenPolicy_MaxLazy = 0;

  nsCOMPtr<nsIMdbThumb> thumb;
  rv = factory->OpenFileStore(env,
                              nullptr,  // Use default heap alloc fns.
                              dbFile, &inOpenPolicy, getter_AddRefs(thumb));
  NS_ENSURE_SUCCESS(rv, rv);

  // Unsure what this is doing. Applying appended-but-unapplied writes?
  {
    mdb_count outTotal;    // total somethings to do in operation
    mdb_count outCurrent;  // subportion of total completed so far
    mdb_bool outDone;      // is operation finished?
    mdb_bool outBroken;    // is operation irreparably dead and broken?
    do {
      rv = thumb->DoMore(env, &outTotal, &outCurrent, &outDone, &outBroken);
      NS_ENSURE_SUCCESS(rv, rv);
    } while (!outBroken && !outDone);
  }

  // Finally, open the store.
  nsCOMPtr<nsIMdbStore> store;
  rv = factory->ThumbToOpenStore(env, thumb, getter_AddRefs(store));
  NS_ENSURE_SUCCESS(rv, rv);

  // Resolve some tokens we'll need.
  const char* kFoldersScope = "ns:msg:db:row:scope:folders:all";
  mdb_token folderRowScopeToken;
  rv = store->StringToToken(env, kFoldersScope, &folderRowScopeToken);
  NS_ENSURE_SUCCESS(rv, rv);

  // Find the table. Only one, and we assume id=1. Eek! But original code
  // did this too...
  mdbOid allFoldersTableOID{folderRowScopeToken, 1};
  nsCOMPtr<nsIMdbTable> allFoldersTable;
  rv = store->GetTable(env, &allFoldersTableOID,
                       getter_AddRefs(allFoldersTable));
  NS_ENSURE_SUCCESS(rv, rv);
  // GetTable() can return null even without an error.
  NS_ENSURE_STATE(allFoldersTable);

  rv = convertTable(env, store, allFoldersTable, root);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

// The legacy panacea.dat mork db has a single table, with a row per
// folder. This function reads it in and writes it into our Json::Value
// object.
static nsresult convertTable(nsIMdbEnv* env, nsIMdbStore* store,
                             nsIMdbTable* table, Json::Value& root) {
  MOZ_ASSERT(root.isObject());
  MOZ_ASSERT(table);

  nsresult rv;
  nsCOMPtr<nsIMdbTableRowCursor> rowCursor;
  rv = table->GetTableRowCursor(env, -1, getter_AddRefs(rowCursor));
  NS_ENSURE_SUCCESS(rv, rv);
  // For each row in the table...
  while (true) {
    nsCOMPtr<nsIMdbRow> row;
    mdb_pos pos;
    rv = rowCursor->NextRow(env, getter_AddRefs(row), &pos);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!row) {
      break;  // That's all the rows done.
    }

    nsCOMPtr<nsIMdbRowCellCursor> cellCursor;
    rv = row->GetRowCellCursor(env, -1, getter_AddRefs(cellCursor));
    NS_ENSURE_SUCCESS(rv, rv);

    Json::Value obj(Json::objectValue);
    // For each cell in the row...
    nsAutoCString rowKey;
    while (true) {
      nsCOMPtr<nsIMdbCell> cell;
      mdb_column column;
      rv = cellCursor->NextCell(env, getter_AddRefs(cell), &column, nullptr);
      NS_ENSURE_SUCCESS(rv, rv);
      if (!cell) {
        break;  // No more cells.
      }

      // Get the column name
      nsAutoCString colName;
      {
        char buf[100];
        mdbYarn colYarn{buf, 0, sizeof(buf), 0, 0, nullptr};
        // Get the column of the cell
        nsresult rv = store->TokenToString(env, column, &colYarn);
        NS_ENSURE_SUCCESS(rv, rv);

        colName.Assign((const char*)colYarn.mYarn_Buf, colYarn.mYarn_Fill);
      }
      // Get the value
      nsAutoCString colValue;
      {
        mdbYarn yarn;
        cell->AliasYarn(env, &yarn);
        colValue.Assign((const char*)yarn.mYarn_Buf, yarn.mYarn_Fill);
      }
      if (colName.EqualsLiteral("key")) {
        rowKey = colValue;
      } else {
        applyEntry(colName, colValue, obj);
      }
    }
    if (rowKey.IsEmpty()) {
      continue;
    }

    MOZ_LOG(sFolderCacheLog, LogLevel::Debug,
            ("Migration: migrated key '%s' (%d properties)", rowKey.get(),
             (int)obj.size()));
    root[rowKey.get()] = obj;
  }
  return NS_OK;
}
