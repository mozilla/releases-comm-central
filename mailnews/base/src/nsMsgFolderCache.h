/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMsgFolderCache_H
#define nsMsgFolderCache_H

#include "nsIMsgFolderCache.h"
#include "nsIFile.h"
#include "nsITimer.h"

namespace Json {
class Value;
};

/**
 * nsMsgFolderCache implements the folder cache, which stores values which
 * might be slow for the folder to calculate.
 * It persists the cache data by dumping it out to a .json file when changes
 * are made. To avoid huge numbers of writes, this autosaving is deferred -
 * when a cached value is changed, it'll wait a minute or so before
 * writing, to collect any other changes that occur during that time.
 * If any changes are outstanding at destruction time, it'll perform an
 * immediate save then.
 */
class nsMsgFolderCache : public nsIMsgFolderCache {
 public:
  friend class nsMsgFolderCacheElement;

  nsMsgFolderCache();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGFOLDERCACHE

 protected:
  virtual ~nsMsgFolderCache();

  nsresult LoadFolderCache(nsIFile* jsonFile);
  nsresult SaveFolderCache(nsIFile* jsonFile);
  // Flag that a save is required. It'll be deferred by kAutoSaveDelayMs.
  void SetModified();
  static constexpr uint32_t kSaveDelayMs = 1000 * 60 * 1;  // 1 minute.
  static void doSave(nsITimer*, void* closure);

  // Path to the JSON file backing the cache.
  nsCOMPtr<nsIFile> mCacheFile;

  // This is our data store. Kept as a Json::Value for ease of saving, but
  // it's actually not a bad format for access (it's basically a std::map).
  // Using a pointer to allow forward declaration. The json headers aren't
  // in the include path for other modules, so we don't want to expose them
  // here.
  Json::Value* mRoot;

  bool mSavePending;
  nsCOMPtr<nsITimer> mSaveTimer;
};

#endif
