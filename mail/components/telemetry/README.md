# Notes on telemetry in Thunderbird

## Hooking into the build process

The comm-central probe definitions in this directory (`Events.yaml`,
`Scalars.yaml` and `Histograms.json`) are used _in addition_ to
their mozilla-central counterparts (in `toolkit/components/telemetry/`).

As part of the mozilla-central telemetry build process, scripts are used to
generate the C++ files which define the probe registry (enums, string tables
etc).

Because of this code generation, the extra comm-central probe definitions
need to be included when the mozilla-central telemetry is built.

This is done by setting `MOZ_TELEMETRY_EXTRA_*` config values. You can
see these in `comm/mail/moz.configure`.
These config values are used by `toolkit/components/telemetry/moz.build`
(mozilla-central) to pass the extra probe definitions to the code
generation scripts.

The build scripts can be found under `toolkit/components/telemetry/build_scripts`.
They are written in Python.

## Naming probes

To avoid clashing with the mozilla-central probes, we'll be pretty liberal
about slapping on prefixes to our definitions.

For Events and Scalars, we keep everything under `tb.`.

For Histograms, we use a `TB_` or `TELEMETRY_TEST_TB_` prefix.

(Why not just `TB_`? Because the telemetry test helper functions
`getSnapshotForHistograms()`/`getSnapshotForKeyedHistograms()` have an option
to filter out histograms with a `TELEMETRY_TEST_` prefix).


## Enabling telemetry

### Compile-time

Telemetry is not compiled in by default. You need to add the following line
to your mozconfig:

    export MOZ_TELEMETRY_REPORTING=1

The nightly and release configs have this setting already (`$ grep -r MOZ_TELEMETRY_ mail/config/mozconfigs`).


### At run time

There's a complex set of conditions to enable telemetry reporting.
The runtime settings needed for a minimal test setup are:

- `toolkit.telemetry.server` - URL where the collected data will be POSTed to
   (`https://incoming.telemetry.mozilla.org`). So if you're running a local
   server for testing, you'll likely want this to be some localhost URL.
- `toolkit.telemetry.server.owner` - The owner of the server (`Mozilla`).
   The implication is that it's polite to change this if you're running a
   non-Mozilla server.
- `toolkit.telemetry.send.overrideOfficialCheck` - usually, telemetry is only
   send for official builds (ie `export MOZILLA_OFFICIAL=1` in `mozconfig`).
   Setting this to `true` enables sending for unofficial builds.
- `datareporting.policy.dataSubmissionEnabled` - allows submission to the
   server.
- `datareporting.policy.dataSubmissionPolicyBypassNotification` - bypasses the
   checks to see if the policy has been shown and agreed to by the user. Set it
   to `true` for testing.
- `toolkit.telemetry.log.level` - very handy for watching telemetry activity in
   the javascript console. `Trace`, `Debug`, `Info`, `Warn`, etc...

example (values to paste into prefs.js):

```
user_pref("toolkit.telemetry.server", "http://localhost:8080/wibble");
user_pref("toolkit.telemetry.server_owner", "Nobody");
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification",true);
user_pref("datareporting.policy.dataSubmissionEnabled", true);
user_pref("toolkit.telemetry.log.level", "Trace");
user_pref("toolkit.telemetry.send.overrideOfficialCheck", true);
```

## Troubleshooting

### Running a test server

To run a test server locally to dump out the sent data, try
https://github.com/mozilla/gzipServer
(or alternatively https://github.com/bcampbell/webhole).

Make sure you set `toolkit.telemetry.server`/`toolkit.telemetry.server_owner`
to point to your local server.

### Log output

If you've got logging on (eg `user_pref("toolkit.telemetry.log.level", "Trace");`),
the output will show up on the javascript console:

    Menu => "Tools" => "Developer Tools" => "Error Console"

If data isn't showing up, keep an eye out for messages in the console.
For example: "Telemetry is not allowed to send pings" is an indication that
the official-build check is failing (overridden by
`toolkit.telemetry.send.overrideOfficialCheck`).

### Test pings

From the javascript console, you can force an immediate test ping:

```
Cu.import("resource://gre/modules/TelemetrySession.jsm");
TelemetrySession.testPing()
```

## Further documentation

The Telemetry documentation index is at:

https://firefox-source-docs.mozilla.org/toolkit/components/telemetry/telemetry/index.html

There's a good summary of settings (both compile-time and run-time prefs):

https://firefox-source-docs.mozilla.org/toolkit/components/telemetry/telemetry/internals/preferences.html

