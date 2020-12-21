/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsImportService_h__
#define nsImportService_h__

#include "nsString.h"
#include "nsMemory.h"
#include "nsIImportModule.h"
#include "nsIImportService.h"
#include "nsIStringBundle.h"
#include "nsTArray.h"

class ImportModuleDesc {
 public:
  ImportModuleDesc(const nsCID& cid, const nsString& name, const nsString& desc,
                   const char* supports)
      : m_cid(cid), m_name(name), m_description(desc), m_supports(supports) {}

  nsCID GetCID(void) { return m_cid; }
  const char16_t* GetName(void) { return m_name.get(); }
  const char16_t* GetDescription(void) { return m_description.get(); }
  const char* GetSupports(void) { return m_supports.get(); }

  void GetModule(nsIImportModule**);

  bool SupportsThings(const nsACString& pThings);

 private:
  nsCID m_cid;
  nsString m_name;
  nsString m_description;
  nsCString m_supports;
  nsCOMPtr<nsIImportModule> m_pModule;
};

class nsImportService : public nsIImportService {
 public:
  nsImportService();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMPORTSERVICE

 private:
  virtual ~nsImportService();
  nsresult LoadModuleInfo(const char* pClsId, const char* pSupports);
  nsresult DoDiscover(void);
  ImportModuleDesc* GetImportModule(const char* filter, int32_t index);

 private:
  AutoTArray<ImportModuleDesc, 10> m_importModules;
  bool m_didDiscovery;
  nsCString m_sysCharset;
  nsCOMPtr<nsIStringBundle> m_stringBundle;
};

#endif  // nsImportService_h__
