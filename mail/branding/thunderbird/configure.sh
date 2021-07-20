# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

MOZ_APP_DISPLAYNAME=Thunderbird

# Only shippable builds will set the update channels to "beta" and "release"
if test "$MOZ_UPDATE_CHANNEL" = "beta"; then
  # Official beta builds
  MOZ_IHANDLERCONTROL_IID="5a6e864b-5c25-49b3-9e78-0d4cad17f866"
  MOZ_ASYNCIHANDLERCONTROL_IID="5da761f6-9aca-4f2f-b22a-062ee46265b4"
  MOZ_HANDLER_CLSID="fd54d983-72e8-48d7-96a0-5c23a47f772c"
  MOZ_IGECKOBACKCHANNEL_IID="e14a4035-43b9-4751-8ad8-c3e74c088882"
else
  # Official release builds
  MOZ_IHANDLERCONTROL_IID="127c0620-d3a7-45f1-8478-13d58249d68f"
  MOZ_ASYNCIHANDLERCONTROL_IID="fe46dfa3-16b6-4780-93cc-4f6c174dc10d"
  MOZ_HANDLER_CLSID="6e5ac413-1ef1-4985-87c2-f02e86e3ecdb"
  MOZ_IGECKOBACKCHANNEL_IID="0a8c4e6c-903f-41a9-b5d0-3520db8f936b"
fi
