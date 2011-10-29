# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is the Mozilla build system.
#
# The Initial Developer of the Original Code is
# the Mozilla Foundation <http://www.mozilla.org/>.
# Portions created by the Initial Developer are Copyright (C) 2006
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   Benjamin Smedberg <benjamin@smedbergs.us> (Initial Code)
#   Florian QUEZE <florian@instantbird.org>
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****

ifndef COMM_BUILD

ifndef LIBXUL_SDK
include $(topsrcdir)/toolkit/toolkit-tiers.mk
endif

TIERS += app

ifdef MOZ_EXTENSIONS
tier_app_dirs += extensions
endif

else

ifndef MOZILLA_DIR
MOZILLA_DIR = $(MOZILLA_SRCDIR)
endif
include $(MOZILLA_SRCDIR)/toolkit/mozapps/installer/package-name.mk

TIERS += app

ifdef MOZ_BRANDING_DIRECTORY
tier_app_dirs += $(MOZ_BRANDING_DIRECTORY)
else
tier_app_dirs += instantbird/branding/nightly
endif

tier_app_dirs += \
  chat \
  purple \
  instantbird \
  $(NULL)

endif

BUILD_YEAR := $(shell echo $(BUILDID) | cut -c 1-4)
BUILD_MONTH := $(shell echo $(BUILDID) | cut -c 5-6)
BUILD_DAY := $(shell echo $(BUILDID) | cut -c 7-8)
BUILD_HOUR := $(shell echo $(BUILDID) | cut -c 9-10)

ifndef PKG_SUFFIX
ifeq (cocoa,$(MOZ_WIDGET_TOOLKIT))
PKG_SUFFIX = .dmg
else
ifeq (,$(filter-out WINNT WINCE, $(OS_ARCH)))
PKG_SUFFIX = .zip
else
ifeq ($(MOZ_WIDGET_TOOLKIT),gtk2)
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

UPLOAD_FILES = $(wildcard $(foreach file,\
	                     $(foreach AB_CD,$(AB_CD) $(SHIPPED_LOCALES),\
                                       $(PACKAGE) $(INSTALLER_PACKAGE))\
                             $(PKG_BASENAME).txt $(PKG_UPDATE_PATH)*.mar,\
                            $(DIST)/$(file)))

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
	@$(MAKE) buildsymbols
	@$(MAKE) -C instantbird/installer libs installer
ifdef MOZ_UPDATE_PACKAGING
	$(MAKE) -C $(MOZDEPTH)/tools/update-packaging full-update PKG_INST_PATH=
endif
ifdef L10NBASEDIR
	$(foreach locale,$(SHIPPED_LOCALES),$(MAKE) -C instantbird/locales/ repack-$(locale) LOCALE_MERGEDIR=mergedir ;)
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
	PATH="$(realpath $(LIBXUL_DIST)/host/bin):$(PATH)" $(PYTHON) $(MOZILLA_SRCDIR)/tools/update-packaging/make_incremental_updates.py -f $(PATCH_FILE)
endif
endif
ifdef SYMBOL_SERVER_HOST
	@$(MAKE) uploadsymbols
endif
ifdef UPLOAD_CMD
	$(MAKE) upload
endif

upload:
ifdef UPLOAD_CMD
	$(PRE_UPLOAD_CMD)
	$(UPLOAD_CMD)
	$(POST_UPLOAD_CMD)
endif

installer:
	@$(MAKE) -C instantbird/installer installer

SHIPPED_LOCALES_FILE = $(topsrcdir)/instantbird/locales/shipped-locales
SHIPPED_LOCALES := $(shell if test -f $(SHIPPED_LOCALES_FILE); then cat $(SHIPPED_LOCALES_FILE); fi)

package:
	@$(MAKE) -C instantbird/installer

install::
	@$(MAKE) -C instantbird/installer install

ib::
	@$(MAKE) -C purple export libs
	@$(MAKE) -C instantbird libs
