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

TIERS += app

ifdef MOZ_BRANDING_DIRECTORY
tier_app_dirs += $(MOZ_BRANDING_DIRECTORY)
else
tier_app_dirs += instantbird/branding/nightly
endif

tier_app_dirs += \
  purple \
  instantbird \
  $(NULL)

endif


installer:
	@$(MAKE) -C instantbird/installer installer

SHIPPED_LOCALES_FILE = $(topsrcdir)/instantbird/locales/shipped-locales
SHIPPED_LOCALES := $(shell if test -f $(SHIPPED_LOCALES_FILE); then cat $(SHIPPED_LOCALES_FILE); fi)

package:
	@$(MAKE) -C instantbird/installer libs installer
ifdef L10NBASEDIR
	$(foreach locale,$(SHIPPED_LOCALES),$(MAKE) -C instantbird/locales/ repack-$(locale) LOCALE_MERGEDIR=mergedir ;)
endif

install::
	@$(MAKE) -C instantbird/installer install

ib::
	@$(MAKE) -C purple export libs
	@$(MAKE) -C instantbird libs
