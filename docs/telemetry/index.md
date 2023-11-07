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

## Compile-time switches

Telemetry is compiled in by default for Nightly and Official builds. To enable for
unofficial builds, add the following line to your mozconfig (lack of a value is
intentional):

    ac_add_options MOZ_TELEMETRY_REPORTING=

## Runtime prefs for testing

There are a few `user.js` settings you'll want to set up for enabling telemetry local builds:

### Send telemetry to a local server

You'll want to set the telemetry end point to a locally-running http server, eg:
```
user_pref("toolkit.telemetry.server", "http://localhost:12345");
user_pref("toolkit.telemetry.server_owner", "TimmyTestfish");
user_pref("datareporting.healthreport.uploadEnabled",true);
```

For a simple test server, try https://github.com/mozilla/gzipServer
(or alternatively https://github.com/bcampbell/webhole).

### Override the official-build-only check

```
user_pref("toolkit.telemetry.send.overrideOfficialCheck", true);
```

Without toolkit.telemetry.send.overrideOfficialCheck set, telemetry is only sent for official builds.

### Bypass data policy checks

The data policy checks make sure the user has been shown and
has accepted the data policy. Bypass them with:

```
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification",true);
user_pref("datareporting.policy.dataSubmissionEnabled", true);
```

### Enable telemetry tracing

```
user_pref("toolkit.telemetry.log.level", "Trace");
```

The output will show up on the DevTools console:

    Menu => "Tools" => "Developer Tools" => "Error Console"  (CTRL+SHIFT+J)

If pings aren't showing up, look there for clues.

To log to stdout as well as the console:
```
user_pref("toolkit.telemetry.log.dump", true);
```

### Reduce submission interval

For testing it can be handy to reduce down the submission interval (it's
usually on the order of hours), eg:
```
user_pref("services.sync.telemetry.submissionInterval", 20); // in seconds
```

### Example user.js file

All the above suggestions in one go, for `$PROFILE/user.js`:

```
user_pref("toolkit.telemetry.server", "http://localhost:12345");
user_pref("toolkit.telemetry.server_owner", "TimmyTestfish");
user_pref("toolkit.telemetry.log.level", "Trace");
user_pref("toolkit.telemetry.log.dump", true);
user_pref("toolkit.telemetry.send.overrideOfficialCheck", true);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification",true);
user_pref("services.sync.telemetry.submissionInterval", 20);
user_pref("datareporting.policy.dataSubmissionEnabled", true);
user_pref("datareporting.healthreport.uploadEnabled",true);
```

## Troubleshooting

### Sending test pings

From the DevTools console, you can send an immediate test ping:

```
const { TelemetrySession } = ChromeUtils.import(
  "resource://gre/modules/TelemetrySession.jsm"
);
TelemetrySession.testPing();
```

### Trace message: "Telemetry is not allowed to send pings"

This indicates `TelemetrySend.sendingEnabled()` is returning false;

Fails if not an official build (override using `toolkit.telemetry.send.overrideOfficialCheck`).

If `toolkit.telemetry.unified` and `datareporting.healthreport.uploadEnabled` are true, then
`sendingEnabled()` returns true;

If `toolkit.telemetry.unified` is false, then the intended-to-be-deprecated `toolkit.telemetry.enabled` controls the result.
We're using unified telemetry, so this shouldn't be an issue.

### Trace message: "can't send ping now, persisting to disk"

Trace shows:
```
TelemetrySend::submitPing - can't send ping now, persisting to disk - canSendNow: false
```

This means `TelemetryReportingPolicy.canUpload()` is returning false.

Requirements for `canUpload()`:

`datareporting.policy.dataSubmissionEnabled` must be true.
AND
`datareporting.policy.dataSubmissionPolicyNotifiedTime` has a sane timestamp (and is > `OLDEST_ALLOWED_ACCEPTANCE_YEAR`).
AND
`datareporting.policy.dataSubmissionPolicyAcceptedVersion` >= `datareporting.policy.minimumPolicyVersion`

Or the notification policy can be bypassed by setting:
`datareporting.policy.dataSubmissionPolicyBypassNotification` to true.

## Further documentation

The Telemetry documentation index is at:

https://firefox-source-docs.mozilla.org/toolkit/components/telemetry/telemetry/index.html

There's a good summary of settings (both compile-time and run-time prefs):

https://firefox-source-docs.mozilla.org/toolkit/components/telemetry/telemetry/internals/preferences.html
