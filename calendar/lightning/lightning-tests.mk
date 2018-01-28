# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

PKG_STAGE = $(DIST)/test-stage

# This is the target that should be called externally
stage-package: stage-mozmill

# stage mozmill tests and shared modules. Cross your fingers that there are no
# name conflicts between calendar/ and mail/
stage-mozmill:
	$(NSINSTALL) -D $(PKG_STAGE)/mozmill/shared-modules
	(cd $(commtopsrcdir)/calendar/test/mozmill && tar $(TAR_CREATE_FLAGS) - `cat $(commtopsrcdir)/calendar/test/mozmill/mozmilltests.list`) | (cd $(PKG_STAGE)/mozmill && tar -xf -)
	(cd $(commtopsrcdir)/calendar/test/mozmill/shared-modules && tar $(TAR_CREATE_FLAGS) - *) | (cd $(PKG_STAGE)/mozmill/shared-modules && tar -xf -)
	$(call py_action,buildlist,$(PKG_STAGE)/mozmill/mozmilltests.list $(shell cat $(commtopsrcdir)/calendar/test/mozmill/mozmilltests.list))
