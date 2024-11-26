/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCOMArray.h"
#include "nsCOMPtr.h"
#include "nsComponentManagerUtils.h"
#include "nsNetCID.h"
#include "nsString.h"
#include "mozilla/dom/Document.h"
#include "nsWMUtils.h"
#include "nsINodeList.h"
#include "nsContentList.h"
#include "nsINode.h"
#include "nsIFileStreams.h"
#include "nsIFile.h"
#include "nsLocalFile.h"
#include "nsIDirectoryEnumerator.h"
#include "ImportDebug.h"
#include "prio.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/dom/DOMParser.h"

nsresult nsWMUtils::FindWMKey(nsIWindowsRegKey** aKey) {
  nsresult rv;
  nsCOMPtr<nsIWindowsRegKey> key =
      do_CreateInstance("@mozilla.org/windows-registry-key;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = key->Open(nsIWindowsRegKey::ROOT_KEY_CURRENT_USER,
                 u"Software\\Microsoft\\Windows Live Mail"_ns,
                 nsIWindowsRegKey::ACCESS_QUERY_VALUE);
  if (NS_SUCCEEDED(rv)) {
    key.forget(aKey);
    return rv;
  }

  rv = key->Open(nsIWindowsRegKey::ROOT_KEY_CURRENT_USER,
                 u"Software\\Microsoft\\Windows Mail"_ns,
                 nsIWindowsRegKey::ACCESS_QUERY_VALUE);
  key.forget(aKey);
  return rv;
}

nsresult nsWMUtils::GetRootFolder(nsIFile** aRootFolder) {
  nsCOMPtr<nsIWindowsRegKey> key;
  if (NS_FAILED(nsWMUtils::FindWMKey(getter_AddRefs(key)))) {
    IMPORT_LOG0("*** Error finding Windows Live Mail registry account keys\n");
    return NS_ERROR_NOT_AVAILABLE;
  }
  // This is essential to proceed; it is the location on disk of xml-type
  // account files; it is in reg_expand_sz so it will need expanding to absolute
  // path.
  nsString storeRoot;
  nsresult rv = key->ReadStringValue(u"Store Root"_ns, storeRoot);
  key->Close();  // Finished with windows registry key. We do not want to return
                 // before this closing
  if (NS_FAILED(rv) || storeRoot.IsEmpty()) {
    IMPORT_LOG0("*** Error finding Windows Live Mail Store Root\n");
    return rv;
  }

  uint32_t size =
      ::ExpandEnvironmentStringsW((LPCWSTR)storeRoot.get(), nullptr, 0);
  nsString expandedStoreRoot;
  expandedStoreRoot.SetLength(size - 1);
  if (expandedStoreRoot.Length() != size - 1) return NS_ERROR_FAILURE;
  ::ExpandEnvironmentStringsW((LPCWSTR)storeRoot.get(),
                              (LPWSTR)expandedStoreRoot.BeginWriting(), size);
  storeRoot = expandedStoreRoot;

  nsCOMPtr<nsIFile> rootFolder = new nsLocalFile();
  rv = rootFolder->InitWithPath(storeRoot);
  NS_ENSURE_SUCCESS(rv, rv);

  rootFolder.forget(aRootFolder);

  return NS_OK;
}

nsresult nsWMUtils::GetOEAccountFiles(nsCOMArray<nsIFile>& aFileArray) {
  nsCOMPtr<nsIFile> rootFolder;

  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  return GetOEAccountFilesInFolder(rootFolder, aFileArray);
}

nsresult nsWMUtils::GetOEAccountFilesInFolder(nsIFile* aFolder,
                                              nsCOMArray<nsIFile>& aFileArray) {
  nsCOMPtr<nsIDirectoryEnumerator> entries;
  nsresult rv = aFolder->GetDirectoryEntries(getter_AddRefs(entries));
  if (NS_FAILED(rv) || !entries) return NS_ERROR_FAILURE;

  bool hasMore;
  while (NS_SUCCEEDED(entries->HasMoreElements(&hasMore)) && hasMore) {
    nsCOMPtr<nsIFile> file;
    rv = entries->GetNextFile(getter_AddRefs(file));
    NS_ENSURE_SUCCESS(rv, rv);

    bool isDirectory;
    rv = file->IsDirectory(&isDirectory);
    NS_ENSURE_SUCCESS(rv, rv);

    if (isDirectory) {
      GetOEAccountFilesInFolder(file, aFileArray);
    } else {
      nsString name;
      rv = file->GetLeafName(name);
      NS_ENSURE_SUCCESS(rv, rv);
      if (StringEndsWith(name, u".oeaccount"_ns)) aFileArray.AppendObject(file);
    }
  }
  return NS_OK;
}

nsresult nsWMUtils::MakeXMLdoc(mozilla::dom::Document** aXmlDoc,
                               nsIFile* aFile) {
  nsresult rv;
  nsCOMPtr<nsIFileInputStream> stream =
      do_CreateInstance(NS_LOCALFILEINPUTSTREAM_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = stream->Init(aFile, PR_RDONLY, -1, 0);
  mozilla::ErrorResult rv2;
  RefPtr<mozilla::dom::DOMParser> parser =
      mozilla::dom::DOMParser::CreateWithoutGlobal(rv2);
  if (rv2.Failed()) {
    return rv2.StealNSResult();
  }
  int64_t filesize;
  aFile->GetFileSize(&filesize);
  nsCOMPtr<mozilla::dom::Document> xmldoc = parser->ParseFromStream(
      stream, EmptyString(), int32_t(filesize),
      mozilla::dom::SupportedType::Application_xml, rv2);
  xmldoc.forget(aXmlDoc);
  return rv2.StealNSResult();
}

nsresult nsWMUtils::GetValueForTag(mozilla::dom::Document* aXmlDoc,
                                   const char* aTagName, nsAString& aValue) {
  nsAutoString tagName;
  tagName.AssignASCII(aTagName);
  nsCOMPtr<nsINodeList> list = aXmlDoc->GetElementsByTagName(tagName);
  nsCOMPtr<nsINode> node = list->Item(0);
  if (!node) return NS_ERROR_FAILURE;
  mozilla::ErrorResult rv2;
  node->GetTextContent(aValue, rv2);
  return rv2.StealNSResult();
}
