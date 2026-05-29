---
name: SpectraID icon standard
description: Icon library choice and font preloading strategy for SpectraID mobile app
---

## Rule
All **new** components must use `MaterialIcons` from `@expo/vector-icons`. Do not use Ionicons or MaterialCommunityIcons in new screens.

**Why:** Ionicons were causing empty square icons on web because icon fonts weren't preloaded. Standardizing on MaterialIcons with explicit font preloading in `_layout.tsx` fixed this.

**How to apply:**
- New screens/components: `import { MaterialIcons } from "@expo/vector-icons"` only.
- Use hyphenated names (see material-icons-naming.md).
- `_layout.tsx` spreads all four font families in `useFonts`: `...Ionicons.font, ...MaterialIcons.font, ...MaterialCommunityIcons.font, ...Feather.font`. This allows legacy Ionicons screens (admin-*, attendance, register-worker, etc.) to continue rendering without changes.
- Legacy screens (admin-*.tsx, attendance.tsx, login.tsx, etc.) still use Ionicons — they work correctly because fonts are now preloaded. Do not change them unless explicitly asked.
