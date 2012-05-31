# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

if [ "$COMM_BUILD" ]; then
add_makefiles "
instantbird/Makefile
instantbird/app/Makefile
instantbird/app/profile/Makefile
instantbird/app/profile/extensions/Makefile
instantbird/branding/nightly/Makefile
instantbird/branding/nightly/locales/Makefile
instantbird/branding/halloween/Makefile
instantbird/branding/halloween/locales/Makefile
instantbird/branding/release/Makefile
instantbird/branding/release/locales/Makefile
instantbird/content/Makefile
instantbird/components/Makefile
instantbird/components/mintrayr/Makefile
instantbird/locales/Makefile
instantbird/modules/Makefile
instantbird/themes/Makefile
instantbird/installer/Makefile
instantbird/installer/windows/Makefile
"
fi
