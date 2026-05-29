import { useTheme } from "@/contexts/ThemeContext";
import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current color scheme.
 * Respects the manual override set in ThemeContext (persisted to AsyncStorage).
 * Falls back to light palette when dark tokens are not defined.
 */
export function useColors() {
  const { isDark } = useTheme();
  const palette = isDark && "dark" in colors
    ? (colors as Record<string, typeof colors.light>).dark
    : colors.light;
  return { ...palette, radius: colors.radius };
}
