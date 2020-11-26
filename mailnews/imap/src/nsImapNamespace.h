/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsImapNamespace_H_
#define _nsImapNamespace_H_

#include "nsImapCore.h"
#include "nsTArray.h"

class nsImapNamespace {
 public:
  nsImapNamespace(EIMAPNamespaceType type, const char* prefix, char delimiter,
                  bool from_prefs);

  ~nsImapNamespace();

  EIMAPNamespaceType GetType() { return m_namespaceType; }
  const char* GetPrefix() { return m_prefix; }
  char GetDelimiter() { return m_delimiter; }
  void SetDelimiter(char delimiter, bool delimiterFilledIn);
  bool GetIsDelimiterFilledIn() { return m_delimiterFilledIn; }
  bool GetIsNamespaceFromPrefs() { return m_fromPrefs; }

  // returns -1 if this box is not part of this namespace,
  // or the length of the prefix if it is part of this namespace
  int MailboxMatchesNamespace(const char* boxname);

 protected:
  EIMAPNamespaceType m_namespaceType;
  char* m_prefix;
  char m_delimiter;
  bool m_fromPrefs;
  bool m_delimiterFilledIn;
};

// represents an array of namespaces for a given host
class nsImapNamespaceList {
 public:
  ~nsImapNamespaceList();

  static nsImapNamespaceList* CreatensImapNamespaceList();

  nsresult InitFromString(const char* nameSpaceString,
                          EIMAPNamespaceType nstype);
  nsresult OutputToString(nsCString& OutputString);
  int UnserializeNamespaces(const char* str, char** prefixes, int len);
  nsresult SerializeNamespaces(char** prefixes, int len,
                               nsCString& serializedNamespace);

  void ClearNamespaces(bool deleteFromPrefsNamespaces,
                       bool deleteServerAdvertisedNamespaces,
                       bool reallyDelete);
  int GetNumberOfNamespaces();
  int GetNumberOfNamespaces(EIMAPNamespaceType);
  nsImapNamespace* GetNamespaceNumber(int nodeIndex);
  nsImapNamespace* GetNamespaceNumber(int nodeIndex, EIMAPNamespaceType);

  nsImapNamespace* GetDefaultNamespaceOfType(EIMAPNamespaceType type);
  int AddNewNamespace(nsImapNamespace* ns);
  nsImapNamespace* GetNamespaceForMailbox(const char* boxname);
  static nsImapNamespace* GetNamespaceForFolder(const char* hostName,
                                                const char* canonicalFolderName,
                                                char delimiter);
  static bool GetFolderIsNamespace(const char* hostName,
                                   const char* canonicalFolderName,
                                   char delimiter,
                                   nsImapNamespace* namespaceForFolder);
  static char* GetFolderNameWithoutNamespace(
      nsImapNamespace* namespaceForFolder, const char* canonicalFolderName);
  static char* AllocateServerFolderName(const char* canonicalFolderName,
                                        char delimiter);
  static char* GetFolderOwnerNameFromPath(nsImapNamespace* namespaceForFolder,
                                          const char* canonicalFolderName);
  static char* AllocateCanonicalFolderName(const char* onlineFolderName,
                                           char delimiter);
  static void SuggestHierarchySeparatorForNamespace(
      nsImapNamespace* namespaceForFolder, char delimiterFromFolder);
  static char* GenerateFullFolderNameWithDefaultNamespace(
      const char* hostName, const char* canonicalFolderName, const char* owner,
      EIMAPNamespaceType nsType, nsImapNamespace** nsUsed);

 protected:
  nsImapNamespaceList();  // use CreatensImapNamespaceList to create one

  nsTArray<nsImapNamespace*> m_NamespaceList;
};
#endif
