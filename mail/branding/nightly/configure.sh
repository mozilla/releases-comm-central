# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

MOZ_APP_DISPLAYNAME="Thunderbird Daily"
MOZ_MACBUNDLE_ID="thunderbird-daily"

# Only shippable builds from comm-central will set the update channel to "nightly"
if test "$MOZ_UPDATE_CHANNEL" = "nightly"; then
  # Official nightly (shippable) builds
  MOZ_HANDLER_CLSID="e5643070-8ec1-4978-8e6c-f0f1753e329e"
  MOZ_IHANDLERCONTROL_IID="d1324f09-3446-404e-ae12-a3128ba8580e"
  MOZ_ASYNCIHANDLERCONTROL_IID="15f84f27-8a4c-4bdf-ae0a-c0fea8fefe91"
  MOZ_IGECKOBACKCHANNEL_IID="6ab50aef-8ad3-460f-9235-e4b72e7e2e7e"
fi
