# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This is defined here instead of in build.mk to override values from
# upload-files.mk which is loaded by moz-automation.mk after our build.mk
PKG_INST_PATH =
UPLOAD_FILES = $(wildcard $(foreach AB_CD,$(AB_CD) $(SHIPPED_LOCALES),\
                                          $(DIST)/$(PACKAGE) $(INSTALLER_PACKAGE))\
                          $(DIST)/$(PKG_BASENAME).txt\
                          $(DIST)/$(PKG_UPDATE_PATH)*.mar)