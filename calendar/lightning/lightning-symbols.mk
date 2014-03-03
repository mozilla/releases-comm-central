# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

SYMBOL_INDEX_NAME=$(XPI_NAME)-$(LIGHTNING_VERSION)-$(OS_TARGET)-$(GRE_BUILDID)-$(CPU_ARCH)-symbols.txt
MAKE_SYM_STORE_PATH=$(abspath $(DIST))/$(UNIVERSAL_PATH)xpi-stage/$(XPI_NAME)
SYM_STORE_SOURCE_DIRS=$(topsrcdir)/calendar
SYMBOL_FULL_ARCHIVE_BASENAME=$(XPI_PKGNAME).crashreporter-symbols-full
SYMBOL_ARCHIVE_BASENAME=$(XPI_PKGNAME).crashreporter-symbols

buildsymbols:
	make -C $(DEPTH)/mozilla \
	  MAKE_SYM_STORE_PATH=$(MAKE_SYM_STORE_PATH) \
	  SYM_STORE_SOURCE_DIRS=$(SYM_STORE_SOURCE_DIRS) \
	  SYMBOL_INDEX_NAME=$(SYMBOL_INDEX_NAME) \
	  SYMBOL_FULL_ARCHIVE_BASENAME=$(SYMBOL_FULL_ARCHIVE_BASENAME) \
	  SYMBOL_ARCHIVE_BASENAME=$(SYMBOL_ARCHIVE_BASENAME) \
	  $@

uploadsymbols:
ifdef MOZ_CRASHREPORTER
	$(SHELL) $(MOZILLA_SRCDIR)/toolkit/crashreporter/tools/upload_symbols.sh \
	  $(SYMBOL_INDEX_NAME) \
	  "$(DIST)/$(PKG_PATH)$(SYMBOL_FULL_ARCHIVE_BASENAME).zip"
endif
