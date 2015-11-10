# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

ifndef COMM_BUILD

ifndef MOZILLA_DIR
MOZILLA_DIR = $(topsrcdir)
endif
# included to get $(BUILDID), which needs $(MOZILLA_DIR)
include $(topsrcdir)/toolkit/mozapps/installer/package-name.mk

BUILD_YEAR = $(shell echo $(BUILDID) | cut -c 1-4)
BUILD_MONTH = $(shell echo $(BUILDID) | cut -c 5-6)
BUILD_DAY = $(shell echo $(BUILDID) | cut -c 7-8)
BUILD_HOUR = $(shell echo $(BUILDID) | cut -c 9-10)

ifndef PKG_SUFFIX
ifeq (cocoa,$(MOZ_WIDGET_TOOLKIT))
PKG_SUFFIX = .dmg
else
ifeq ($(OS_ARCH),WINNT)
PKG_SUFFIX = .zip
else
ifdef MOZ_WIDGET_GTK
PKG_SUFFIX = .tar.bz2
else
PKG_SUFFIX = .tar.gz
endif
endif
endif
endif # PKG_SUFFIX
PACKAGE = $(PKG_BASENAME)$(PKG_SUFFIX)
ifeq ($(OS_TARGET), WINNT)
INSTALLER_PACKAGE = $(PKG_INST_BASENAME).exe
endif

PREVIOUS_MAR_DIR := $(DIST)/$(PKG_UPDATE_PATH)previous
MAR_FILE_DEST = $(PREVIOUS_MAR_DIR)/$(buildid)/$(notdir $(MAR_FILE_SRC))
PATCH_FILE := $(DIST)/$(PKG_UPDATE_PATH)patch_list
FORCE_UPDATE := components/components.list|Contents/MacOS/components/components.list

#Example of environment variables to set before using make distribution:

#Convenience variables:
# SSH_SERVER=ftp.instantbird.org
# SSH_USERNAME=buildbot
# UPLOAD_PATH=/www/anonymous/nightly/$(BUILD_YEAR)/$(BUILD_MONTH)/$(BUILD_YEAR)-$(BUILD_MONTH)-$(BUILD_DAY)-$(BUILD_HOUR)-$(MOZ_APP_NAME)

#Required to upload files:
# UPLOAD_CMD=scp $(UPLOAD_FILES) $(SSH_USERNAME)@$(SSH_SERVER):$(UPLOAD_PATH)/
#  The UPLOAD_FILES variable is set by the build system to the (space separated)
#  list of local files that should be uploaded.
#Optional:
# PRE_UPLOAD_CMD=ssh $(SSH_USERNAME)@$(SSH_SERVER) mkdir -p $(UPLOAD_PATH)
# POST_UPLOAD_CMD=ssh $(SSH_USERNAME)@$(SSH_SERVER) register_builds.php $(UPLOAD_PATH) $(MOZ_PKG_PLATFORM)

# LIST_PREVIOUS_MAR_CMD=ssh $(SSH_USERNAME)@$(SSH_SERVER) previous_builds.php $(MOZ_PKG_PLATFORM)
#  This command should return a list of mar files.
#  Each line should use this format: <buildid>:<lang>:<path>/<filename>.mar
# DOWNLOAD_MAR_CMD=scp $(SSH_USERNAME)@$(SSH_SERVER):/www/anonymous/$(MAR_FILE_SRC) $(MAR_FILE_DEST)
#  The MAR_FILE_SRC variable is set by the build system to a value returned by
#  the LIST_PREVIOUS_MAR_CMD command (format: <path>/<filename>.mar).
#  The MAR_FILE_DEST variable is set by the build system and indicates where
#  the file should be put on the local system.

#If there's a symbol server:
# SYMBOL_SERVER_HOST=symbols.instantbird.org
# SYMBOL_SERVER_PATH=/www/instantbird/socorro/symbols
# SYMBOL_SERVER_PORT=22
# SYMBOL_SERVER_USER=buildbot

distribution:
	@$(MAKE) MAKE_SYM_STORE_PATH=$(MAKE_SYM_STORE_PATH) SYM_STORE_SOURCE_DIRS='$(topsrcdir)/mozilla/extensions/purple $(topsrcdir)/mozilla $(topsrcdir)' buildsymbols
	@$(MAKE) -C im/installer libs installer
ifdef ENABLE_TESTS
	$(MAKE) xpcshell-tests
endif
ifdef MOZ_UPDATE_PACKAGING
	$(MAKE) -C tools/update-packaging complete-patch PKG_INST_PATH=
endif
ifdef L10NBASEDIR
	$(foreach locale,$(SHIPPED_LOCALES),$(MAKE) -C im/locales/ repack-$(locale) LOCALE_MERGEDIR=mergedir MOZ_MAKE_COMPLETE_MAR=$(MOZ_UPDATE_PACKAGING) ;)
endif
ifdef MOZ_UPDATE_PACKAGING
ifdef LIST_PREVIOUS_MAR_CMD
	rm -rf $(PREVIOUS_MAR_DIR) $(PATCH_FILE)
	mkdir $(PREVIOUS_MAR_DIR)
	touch $(PATCH_FILE)
	$(foreach marline,$(shell $(LIST_PREVIOUS_MAR_CMD)),\
	  $(foreach MAR_FILE_SRC,$(shell echo $(marline) |cut -d : -f 3),\
	    $(foreach AB_CD,$(filter $(shell echo $(marline) |cut -d : -f 2),$(AB_CD) $(SHIPPED_LOCALES)),\
	      $(foreach buildid,$(shell echo $(marline) |cut -d : -f 1),\
		mkdir -p $(PREVIOUS_MAR_DIR)/$(buildid) ; \
	        $(DOWNLOAD_MAR_CMD) ; \
		echo "$(MAR_FILE_DEST),$(DIST)/$(COMPLETE_MAR),$(DIST)/$(PKG_UPDATE_PATH)$(PKG_UPDATE_BASENAME).partial.from-$(buildid).mar,$(FORCE_UPDATE)" >> $(PATCH_FILE) ;))))
	PATH="$(realpath $(DIST)/host/bin):$(PATH)" $(PYTHON) $(topsrcdir)/tools/update-packaging/make_incremental_updates.py -f $(PATCH_FILE)
endif
endif
ifdef SYMBOL_SERVER_HOST
	@$(MAKE) uploadsymbols
endif
ifdef UPLOAD_CMD
	$(MAKE) upload
endif

installer:
	@$(MAKE) -C im/installer installer

SHIPPED_LOCALES_FILE = $(topsrcdir)/im/locales/shipped-locales
SHIPPED_LOCALES := $(shell if test -f $(SHIPPED_LOCALES_FILE); then cat $(SHIPPED_LOCALES_FILE); fi)

package:
	@$(MAKE) -C im/installer

install::
	@$(MAKE) -C im/installer install

upload:
ifdef UPLOAD_CMD
	$(PRE_UPLOAD_CMD)
	$(UPLOAD_CMD)
	$(POST_UPLOAD_CMD)
endif

ib::
	@$(MAKE) -C chat export libs
	@$(MAKE) -C im libs

endif # COMM_BUILD
