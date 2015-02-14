# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This is defined here instead of in build.mk to override values from
# upload-files.mk which is loaded by moz-automation.mk after our build.mk
UPLOAD_FILES = $(wildcard $(foreach file,\
	                     $(foreach AB_CD,$(AB_CD) $(SHIPPED_LOCALES),\
                                       $(PACKAGE) $(INSTALLER_PACKAGE))\
                             $(PKG_BASENAME).txt $(PKG_UPDATE_PATH)*.mar,\
                            $(DIST)/$(file)))
