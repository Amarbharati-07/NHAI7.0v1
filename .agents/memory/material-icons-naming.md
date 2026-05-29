---
name: MaterialIcons naming convention
description: @expo/vector-icons MaterialIcons uses hyphenated names, not underscores — critical for avoiding silent icon failures
---

## Rule
`@expo/vector-icons` MaterialIcons icon names use **hyphens**, not underscores.

**Correct:** `check-circle`, `cloud-upload`, `person-add`, `arrow-back`, `chevron-right`, `verified-user`, `account-circle`, `cloud-sync`, `access-time`, `supervisor-account`

**Wrong:** `check_circle`, `cloud_upload`, `person_add`, `arrow_back`, `chevron_right`, `verified_user`, `account_circle`, `cloud_sync`, `access_time`, `supervisor_account`

**Why:** The Google Material Icons documentation shows underscores, but the npm package `@expo/vector-icons` uses the hyphenated variant internally. Using underscores causes the icon to silently not render with a console warning `"xxx_yyy" is not a valid icon name for family "material"`.

**How to apply:** Any time you add a MaterialIcons icon, use hyphens between words. Single-word icons like `people`, `person`, `face`, `security`, `analytics`, `storage`, `sync`, `wifi`, `monitor`, `cancel`, `warning`, `notifications`, `business`, `history`, `settings`, `dashboard`, `logout`, `menu`, `search`, `edit`, `save`, `close`, `call`, `work`, `badge`, `star`, `visibility`, `face`, `smartphone` are fine as-is.
