# In-App Notifications

In-app notifications is a system to schedule notifications for subsets of our user base with server-side definitions. As such, we don't have to ship all possible messaging in advance when building the application. However, we still include some high value notifications in the built application to ensure they are shown to as many users as possible.

## Location

The in-app notification system is fairly self-contained in `mail/components/inappnotifications`. The only exception are strings for localization, styles, as well as branding specific data, prefs and the starting entrypoints in `MailGlue` and `messenger.js`.

The cache is stored in the `scheduled-notifications` folder within the profile.

## Architecture

The client code is generally split into two concerns: a back-end that manages the data and picking out the notification that should currently be shown, as well as handling the special notification types that open a browser or in-application tab directly.

The UI code is almost entirely implemented in custom elements, which are injected from messenger.js.

The code for the server service used to serve the notification data is available at https://github.com/thunderbird/thunderbird-notifications/. It also contains a schema describing the shape of the notification data.

The back-end is initialized from the `InAppNotifications` module, which glues all the features of the back-end together.

The custom elements start with an `in-app-notification-manager` element that connects to the events of the `NotificationManager` exposed through the `InAppNotifications` module from the back-end and then creates and removes notifications as needed. It does not have any interaction logic itself, instead it tells the `NotificationManager` about the user interaction, which might then in turn tell the UI to hide a notification.

### Selecting which notification to display

The `NotificationManager` is what ultimately selects the notification to display, after the raw data was filtered by `NotificationFilter`. The notifications eligible to be displayed are sorted by `severity` (ascending), then the `start_at` timestamp (ascending), and finally by the `percent_chance` (ascending), and the first message is selected for display. It tries to avoid switching notification if there is one already visible, only displacing the current notification if there is a notification with a higher severity to display instead. Lastly the notification manager handles the case where the notification expires (`end_at` transitioning to the past), requesting new notifications when that happens. It also requests new notifications to display when a notification is dismissed. It generally tries to wait a bit before showing the next notification.

Display of notifications is rate limited to no more than 6 in a 24 hour period. If additional notifications are attempted to be displayed they will be deferred until 24 hours from the timestamp of the first of the last 6 notifications.

`InAppNotifications` asks `NotificationManager` to recalculate the current notification whenever the raw data is updated, or when any new notification becomes available (its `start_at`transitioning to the past). It also handles the requests for current notifications from the `NotificationManager` by giving it the currently cached list of available notifications.

### Updating

The local cache of notifications is regularly refreshed against a server (specified by an URL that is formatted using the [URL formatter](https://searchfox.org/mozilla-central/source/toolkit/components/urlformatter/URLFormatter.sys.mjs)). If the url contains the token `%IAN_SCHEMA_VERSION%` it will be replaced with the current hardcoded schema version before formatting. If at startup of the system the server can't be reached and there's no valid network cache or the cache is empty, it falls back to a set of notifications that were included at build time.

The notification are cached based on the caching headers from the notification server, if the cache is not expired no network requests will be done. The time to the next update is influenced by notifications server via the cache headers.

In addition to the cache the requests are also rate limited to 24 requests in a 24 hour period. If additional requests are attempted they will be deferred until 24 hours from the timestamp of the first of the last 24 requests.

If a request fails for some reason like a network error, the request will be retried progressively waiting longer each time. The first request will be retried in 1 minute, then ten minutes and finally once an hour until a successful request is completed.

### Cache

The notification data provided by the server is cached locally (`notifications`), in addition the cache also contains seeds for the set of notifications currently returned by the server (`seeds`), a list of notification IDs that should no longer be shown because the user interacted with them (`interactedWith`) - also limited to notifications that the server currently returns.

See also the [displayed_notifications](#displayed-notifications) section for some more usage info related to the list of notifications that were shown.

The seeds are stored in an object, keyed by notification ID with the value being the seed this profile rolled for that notification.

## Data format/contents

The schema for the notifiation data is maintained at https://github.com/thunderbird/thunderbird-notifications/.

### Text fields

The user-facing text fields are generally expected to only contain plain text. The UI might limit how much of the text is visible by default.

### URL

Only URL values that use the `https` protocol are allowed, otherwise the notification is never shown. The URL is formatted using the [URL formatter](https://searchfox.org/mozilla-central/source/toolkit/components/urlformatter/URLFormatter.sys.mjs).

### Types

There are two kinds of notification types: ones that show an actual notification within the application and ones that trigger an action directly when "shown".

Type               | Behavior                                                                                     | Used fields                         | Telemetry events
-------------------|----------------------------------------------------------------------------------------------|-------------------------------------|----------------------------------------
`donation_browser` | Opens tab in the default system browser                                                      | `URL`                               | `interaction`
`donation_tab`     | Opens tab within the application                                                             | `URL`                               | `interaction`
`donation`         | Shows a dismissable notification with illustrations related to our typical fundraising look. | `title`, `description`, `CTA`/`URL` | `shown`, `interaction`, `closed`, `dismissed`
`blog`             | Shows a dismissable notification with a simple style and a "circle-question" icon.           | `title`, `description`, `CTA`/`URL` | `shown`, `interaction`, `closed`, `dismissed`
`message`          | Shows a dismissable notification with a simple style and a "circle-error" icon.              | `title`, `description`, `CTA`/`URL` | `shown`, `interaction`, `closed`, `dismissed`
`security`         | Shows a dismissable notification with a simple style and a "warning" icon.                   | `title`, `description`, `CTA`/`URL` | `shown`, `interaction`, `closed`, `dismissed`

Notably the `shown` telemetry event is triggered every time a notification is shown, which can be multiple times per profile, since it will be shown every time the application is launched until any of the other three events occurs.

### Targeting/filtering

#### Date range

Notifications will be only shown in the timespan between `start_at` and `end_at`. This means a notifications will be shown at `start_at` at the earliest, and hidden by `end_at`, even if the user never interacted with it - or never got to see it. The date-time string is parsed using `Date.parse`, so the format should be one supported by it (like ISO 8601).

#### percent_chance

The value determines how many percent of the user population should see the notification. This is implemented by rolling a seed between 0 and 100 (inclusive) per notification stored in the profile. That way, we always make the same decision for the same notification, but we don't end up showing all notifications to some users and much fewer notification to another set of users.

Removes that amount of people from the remaining pool if used in combination with `displayed_notifications`. So 33%/33%/33% is actually declared as 33%/50%/100% with decreasing severity.

#### exclude/include

The `exclude` and `include` keys allow us to target specific configurations of Thunderbird. They are both arrays of configurations. To put it differently, the objects in the array are ORed against each other, while the keys in the objects are ANDed - so like a DNF.

When the `exclude` or `include` key are `null` or omitted the notification is displayed without any checks in relation to the conditions those keys could check. An empty array for `exclude` will also behave like that, however an empty array for `include` will lead to the notification never being shown.

##### Profile properties

There are two kinds of keys that we target in the profile, single values and lists of values. Both of them have arrays in the targeting profile, but the arrays behave differently.
Single values are `locales`, `versions`, `channels` and `operating systems` - there is only one possible active value for all of them. So the values in the array of the targeting profile are ORed against each other, if any of them is the current value the profile matches.
`displayed_notifications`, `pref_true` and `pref_false` compare against lists of values. So all of the items listed in the targeting profile have to be true for the profile to match.

If any key is missing or `null` it will not affect the filtering result. Meanwhile an empty array will behave differently for the single values, leading to the profile always matching, while it behaves like `null` for the properties for lists of values.

##### displayed_notifications

Assert that the IDs listed have been displayed in this profile. The IDs have to still be present as notifications in the full list returned by the server since they were shown. Else the application forgets that it has shown the notification. Notably, those "past" notifications no longer need to have any useful information returned by the server, apart from their ID and they would still need to be valid according to the schema, so they should probably retain their `end_at` date. But things like targeting and texts can be shortened to the minimum allowed value.

##### pref_true/pref_false

The `pref_true` key allows targeting preferences that are set to `true`. If there is no default value shipped with the application, unset values are treated as `false`. `pref_false` is almost the opposite, except that it treats unset prefs as being `true`.

This means an unset pref can be targeted with the following:
```json
{
  "id": "test-notification",
  [...],
  "targeting": {
    "exclude": [
      {
        "pref_true": ["example.unset.pref"],
      },
      {
        "pref_false": ["example.unset.pref"],
      },
    ]
  }
}
```

## Preferences

### `mail.inappnotifications.bypass-filtering`

This preference disables all filtering logic (excluding if a notification has been shown before and was interacted with), leading to the most severe notification provided by the server being shown. This applies the next time the active notification is updated, so either when the currently shown notification is closed, a new notification could become active or when the application is restarted.

### `mail.inappnotifications.url`

The URL is specified in the branding specific preferences, so its value varies depending on the version of Thunderbird. The value is the URL used to update notifications from the server.

### `mail.inappnotifications.refreshInterval`

The refresh interval controls how often we try to get new notifications from the server. It is a value in seconds. The fetch does not bypass HTTP caching, so this interval might not be well aligned with HTTP caching.
