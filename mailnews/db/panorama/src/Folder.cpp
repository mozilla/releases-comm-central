/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Folder.h"

#include "FolderDatabase.h"

namespace mozilla {
namespace mailnews {

NS_IMPL_ISUPPORTS(Folder, nsIFolder)

NS_IMETHODIMP
Folder::GetId(uint64_t* aId) {
  *aId = mId;
  return NS_OK;
}

NS_IMETHODIMP
Folder::GetName(nsACString& aName) {
  aName.Assign(mName);
  return NS_OK;
}

nsCString Folder::GetName() {
  nsAutoCString name;
  DebugOnly<nsresult> rv = GetName(name);
  MOZ_ASSERT(NS_SUCCEEDED(rv));
  return name;
}

NS_IMETHODIMP
Folder::GetPath(nsACString& aPath) {
  aPath.Truncate();
  if (mParent) {
    aPath = mParent->GetPath() + "/"_ns;
  }
  aPath.Append(mName);
  return NS_OK;
}

nsCString Folder::GetPath() {
  nsAutoCString path;
  DebugOnly<nsresult> rv = GetPath(path);
  MOZ_ASSERT(NS_SUCCEEDED(rv));
  return path;
}

NS_IMETHODIMP
Folder::GetFlags(uint64_t* aFlags) {
  *aFlags = mFlags;
  return NS_OK;
}

NS_IMETHODIMP Folder::GetRootFolder(nsIFolder** aRootFolder) {
  NS_IF_ADDREF(*aRootFolder = mRoot);
  return NS_OK;
}

NS_IMETHODIMP Folder::GetIsServer(bool* aIsServer) {
  *aIsServer = this == mRoot;
  return NS_OK;
}

NS_IMETHODIMP
Folder::GetAncestors(nsTArray<RefPtr<nsIFolder>>& aAncestors) {
  aAncestors.Clear();
  RefPtr<Folder> ancestor = mParent;
  while (ancestor) {
    aAncestors.AppendElement(ancestor);
    ancestor = ancestor->mParent;
  }
  return NS_OK;
}

NS_IMETHODIMP
Folder::GetParent(nsIFolder** aParent) {
  NS_IF_ADDREF(*aParent = mParent);
  return NS_OK;
}

NS_IMETHODIMP
Folder::GetChildren(nsTArray<RefPtr<nsIFolder>>& aChildren) {
  aChildren.Clear();
  for (auto f : mChildren) {
    aChildren.AppendElement(f);
  }
  return NS_OK;
}

void Folder::_GetDescendants(nsTArray<RefPtr<nsIFolder>>& aDescendants) {
  for (auto f : mChildren) {
    aDescendants.AppendElement(f);
    f->_GetDescendants(aDescendants);
  }
}

NS_IMETHODIMP
Folder::GetDescendants(nsTArray<RefPtr<nsIFolder>>& aDescendants) {
  aDescendants.Clear();
  _GetDescendants(aDescendants);
  return NS_OK;
}

NS_IMETHODIMP
Folder::IsDescendantOf(nsIFolder* aOther, bool* aIsDescendant) {
  return aOther->IsAncestorOf(this, aIsDescendant);
}

NS_IMETHODIMP
Folder::IsAncestorOf(nsIFolder* aOther, bool* aIsAncestor) {
  *aIsAncestor = false;

  nsCOMPtr<nsIFolder> other = aOther->GetParent();
  while (other) {
    if (other == this) {
      *aIsAncestor = true;
      break;
    }
    other = other->GetParent();
  };
  return NS_OK;
}

NS_IMETHODIMP
Folder::ToJSON(nsACString& aJSON) {
  aJSON = "[Folder "_ns + mName + "]"_ns;
  return NS_OK;
}

}  // namespace mailnews
}  // namespace mozilla
