/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_FOLDERCOMPARATOR_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_FOLDERCOMPARATOR_H_

#include <cstdint>

namespace mozilla::intl {
class Collator;
}
namespace mozilla::mailnews {

class FolderDatabase;

/**
 * Compares folders for display in the right order. Folders with an ordinal in
 * the database are sorted ahead of those without. Folders without an ordinal
 * are sorted in alphabetical order.
 *
 * A future version of this class will handle special folder types (e.g.
 * Inbox, which goes ahead of ordinary folders).
 */
class FolderComparator {
 public:
  FolderComparator() = delete;
  explicit FolderComparator(FolderDatabase& folderDB) : mFolderDB(folderDB) {}
  bool Equals(uint64_t a, uint64_t b) const;
  bool LessThan(uint64_t a, uint64_t b) const;

 private:
  static const mozilla::intl::Collator* sCollator;
  static const mozilla::intl::Collator* GetCollator();
  uint8_t SpecialFlagsOrder(const uint32_t flags) const;
  FolderDatabase& mFolderDB;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_FOLDERCOMPARATOR_H_
