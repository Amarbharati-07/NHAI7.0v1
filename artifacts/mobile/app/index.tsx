import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";

// ─── Screen metrics ────────────────────────────────────────────────────────────
const { width: SW, height: SH } = Dimensions.get("window");
const SMALL = SH < 720;

// ─── Reference image crop (853 × 1844 actual dimensions) ──────────────────────
// Booth photo section lives from ~64% to ~82% of the reference image height
const IMG_H_RATIO = 1844 / 853; // height-to-width ratio
const IMG_DISPLAY_H = SW * IMG_H_RATIO; // displayed height when width = SW
const BOOTH_START = IMG_DISPLAY_H * 0.645; // px from top where booth photo begins
const BOOTH_CLIP_H = Math.max(IMG_DISPLAY_H * 0.175, 120); // visible booth height

// ─── Palette ────────────────────────────────────────────────────────────────
const NAVY = "#002060";
const DARK_NAVY = "#001445";
const ROAD_NAVY = "#001952";

// ─── Feature cards ──────────────────────────────────────────────────────────
const FEATURES: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string }[] = [
  { icon: "people",       label: "Workforce\nManagement" },
  { icon: "face",         label: "Smart\nAttendance"     },
  { icon: "cloud-upload", label: "Offline\nSync"         },
  { icon: "analytics",   label: "Real-time\nAnalytics"   },
];

// ─── NHAI Logo ───────────────────────────────────────────────────────────────
function NHAILogo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <ClipPath id="lc">
          <Circle cx="60" cy="60" r="48" />
        </ClipPath>
      </Defs>

      {/* White base disc */}
      <Circle cx="60" cy="60" r="54" fill="white" />

      {/* Sky fill */}
      <Rect x="12" y="12" width="96" height="96" fill="#6FAFD4" clipPath="url(#lc)" />
      <Rect x="12" y="12" width="96" height="42" fill="#A8CEEA" clipPath="url(#lc)" />

      {/* Road (perspective trapezoid: narrows toward top) */}
      <Path d="M 53 52 L 26 108 L 94 108 L 67 52 Z" fill="#697E8E" clipPath="url(#lc)" />
      <Path d="M 55 52 L 29 108 L 91 108 L 65 52 Z" fill="#8A9FAD" clipPath="url(#lc)" />

      {/* Yellow center stripe */}
      <Line x1="60" y1="52" x2="60" y2="108" stroke="#FFC107" strokeWidth="3" clipPath="url(#lc)" />

      {/* Left lane dashes */}
      <Line x1="45" y1="62" x2="37" y2="78" stroke="white" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.85" clipPath="url(#lc)" />
      <Line x1="36" y1="81" x2="29" y2="96" stroke="white" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.85" clipPath="url(#lc)" />

      {/* Right lane dashes */}
      <Line x1="75" y1="62" x2="83" y2="78" stroke="white" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.85" clipPath="url(#lc)" />
      <Line x1="84" y1="81" x2="91" y2="96" stroke="white" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.85" clipPath="url(#lc)" />

      {/* Green tree clusters */}
      <Circle cx="20" cy="64" r="11" fill="#3D7A4E" clipPath="url(#lc)" />
      <Circle cx="100" cy="64" r="11" fill="#3D7A4E" clipPath="url(#lc)" />
      <Circle cx="18" cy="58" r="8" fill="#4A8F5C" clipPath="url(#lc)" />
      <Circle cx="102" cy="58" r="8" fill="#4A8F5C" clipPath="url(#lc)" />

      {/* Bottom navy band */}
      <Path d="M 12 84 Q 60 77 108 84 L 108 108 L 12 108 Z" fill="#002060" clipPath="url(#lc)" />

      {/* Devanagari abbreviation */}
      <SvgText
        x="60" y="92"
        textAnchor="middle"
        fill="white"
        fontSize="6"
        fontFamily="sans-serif"
      >
        {"भा रा रा प्रा"}
      </SvgText>

      {/* NHAI label */}
      <SvgText
        x="60" y="104"
        textAnchor="middle"
        fill="white"
        fontSize="11"
        fontWeight="bold"
        fontFamily="sans-serif"
        letterSpacing="1"
      >
        NHAI
      </SvgText>

      {/* Outer ring */}
      <Circle cx="60" cy="60" r="54" fill="none" stroke="#002060" strokeWidth="6" />
      {/* Inner thin white ring */}
      <Circle cx="60" cy="60" r="48" fill="none" stroke="white" strokeWidth="1.5" />
    </Svg>
  );
}

// ─── Loading dots ────────────────────────────────────────────────────────────
function LoadingDots() {
  const d1 = useRef(new Animated.Value(0.3)).current;
  const d2 = useRef(new Animated.Value(0.3)).current;
  const d3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1,   duration: 350, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 350, useNativeDriver: true }),
          Animated.delay(700),
        ])
      ).start();
    pulse(d1, 0);
    pulse(d2, 220);
    pulse(d3, 440);
  }, []);

  const dot = (anim: Animated.Value) => ({
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: "rgba(255,255,255,0.9)",
    marginHorizontal: 4,
    opacity: anim,
    transform: [{ scale: anim.interpolate({ inputRange: [0.3, 1], outputRange: [0.7, 1.1] }) }],
  });

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 10 }}>
      <Animated.View style={dot(d1)} />
      <Animated.View style={dot(d2)} />
      <Animated.View style={dot(d3)} />
    </View>
  );
}

// ─── Splash Screen ────────────────────────────────────────────────────────────
export default function SplashScreen() {
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Animation values
  const bgFade     = useRef(new Animated.Value(0)).current;
  const logoAnim   = useRef(new Animated.Value(0)).current;
  const contentAnim= useRef(new Animated.Value(0)).current;
  const cardsAnim  = useRef(new Animated.Value(0)).current;
  const exitFade   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.sequence([
      Animated.timing(bgFade,    { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(logoAnim,    { toValue: 1, tension: 55, friction: 7, useNativeDriver: true }),
        Animated.timing(contentAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
      Animated.timing(cardsAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();

    // Auto-navigate after 3 s
    const t = setTimeout(() => {
      Animated.timing(exitFade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        router.replace(userRef.current ? "/dashboard" : "/login");
      });
    }, 3000);

    return () => clearTimeout(t);
  }, []);

  const logoY   = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  const textY   = contentAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const cardsY  = cardsAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  const logoSize = SMALL ? 100 : 120;

  return (
    <Animated.View style={[s.root, { opacity: Animated.multiply(bgFade, exitFade) }]}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Sky + Content ───────────────────────────────────────── */}
      <LinearGradient
        colors={["#7EC8E3", "#AADAF0", "#CBE9F5", "#E0F3FA", "#EBF8FC"]}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        style={[s.skySection, { paddingTop: insets.top + (SMALL ? 10 : 18) }]}
      >
        {/* NHAI Logo */}
        <Animated.View style={{
          opacity: logoAnim,
          transform: [{ translateY: logoY }, { scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          marginBottom: SMALL ? 8 : 12,
          alignSelf: "center",
        }}>
          <View style={s.logoShadow}>
            <NHAILogo size={logoSize} />
          </View>
        </Animated.View>

        {/* Brand name */}
        <Animated.View style={{ opacity: contentAnim, transform: [{ translateY: textY }], alignItems: "center" }}>
          <Text style={[s.hindiText, SMALL && { fontSize: 12 }]}>
            भारतीय राष्ट्रीय राजमार्ग प्राधिकरण
          </Text>
          <Text style={[s.englishText, SMALL && { fontSize: 11 }]}>
            National Highways Authority of India
          </Text>
        </Animated.View>

        {/* Separator */}
        <View style={s.sep} />

        {/* Main headings */}
        <Animated.View style={{ opacity: contentAnim, transform: [{ translateY: textY }], alignItems: "center" }}>
          <Text style={[s.nhaiHeading, SMALL && { fontSize: 38, lineHeight: 42 }]}>NHAI</Text>
          <Text style={[s.opsHeading, SMALL && { fontSize: 15 }]}>WORKFORCE OPERATIONS</Text>
          <Text style={[s.subtitle, SMALL && { fontSize: 11, marginTop: 6 }]}>
            Digitizing Workforce. Strengthening Highways.
          </Text>
        </Animated.View>

        {/* Feature cards */}
        <Animated.View style={[
          s.featureCard,
          { opacity: cardsAnim, transform: [{ translateY: cardsY }], marginTop: SMALL ? 10 : 14 },
        ]}>
          {FEATURES.map((f, i) => (
            <View key={i} style={s.featureItem}>
              <View style={s.featureIconBg}>
                <MaterialIcons name={f.icon} size={SMALL ? 22 : 26} color={NAVY} />
              </View>
              <Text style={[s.featureLabel, SMALL && { fontSize: 9 }]}>{f.label}</Text>
            </View>
          ))}
        </Animated.View>
      </LinearGradient>

      {/* ── Toll Plaza ─────────────────────────────────────────── */}
      <Animated.View style={[s.tollSection, { opacity: contentAnim }]}>
        {/* Dark banner strip */}
        <View style={s.tollBanner}>
          <Text style={[s.tollBannerText, SMALL && { fontSize: 9.5 }]}>
            BUILDING A NATION, NOT JUST ROADS
          </Text>
        </View>
        {/* Cropped booth photo */}
        <View style={[s.tollClip, { height: SMALL ? 110 : BOOTH_CLIP_H }]}>
          <Image
            source={require("../assets/images/toll-plaza.png")}
            style={[s.tollImg, {
              width: SW,
              height: IMG_DISPLAY_H,
              marginTop: -(SMALL ? IMG_DISPLAY_H * 0.655 : BOOTH_START),
            }]}
            resizeMode="stretch"
          />
        </View>
      </Animated.View>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <LinearGradient
        colors={[NAVY, DARK_NAVY]}
        style={[s.footer, { borderTopLeftRadius: SMALL ? 18 : 26, borderTopRightRadius: SMALL ? 18 : 26,
          paddingBottom: Math.max(insets.bottom + 4, 14) }]}
      >
        <View style={s.footerRow}>
          <View style={s.shieldCircle}>
            <MaterialIcons name="verified-user" size={SMALL ? 22 : 26} color="white" />
          </View>
          <Text style={[s.footerTagline, SMALL && { fontSize: 15 }]}>
            Safe Highways. Secure Nation.
          </Text>
        </View>
        <View style={s.footerDivider} />
        <Text style={s.copyright}>© 2026 NHAI. All Rights Reserved.</Text>
        <LoadingDots />
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#7EC8E3" },

  // Sky
  skySection: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  logoShadow: {
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  },

  // Branding text
  hindiText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: NAVY,
    textAlign: "center",
    lineHeight: 20,
    fontFamily: "System",
  },
  englishText: {
    fontSize: 12,
    color: "#1A3A7A",
    textAlign: "center",
    marginTop: 2,
    letterSpacing: 0.1,
  },
  sep: {
    width: 36,
    height: 1.5,
    backgroundColor: NAVY + "50",
    borderRadius: 1,
    marginVertical: 8,
  },

  // Headings
  nhaiHeading: {
    fontSize: 48,
    fontWeight: "900",
    color: NAVY,
    letterSpacing: 5,
    lineHeight: 52,
    textAlign: "center",
  },
  opsHeading: {
    fontSize: 17,
    fontWeight: "900",
    color: NAVY,
    letterSpacing: 2.5,
    textAlign: "center",
    lineHeight: 22,
  },
  subtitle: {
    fontSize: 12.5,
    color: "#3A5070",
    textAlign: "center",
    marginTop: 8,
    letterSpacing: 0.2,
    lineHeight: 18,
  },

  // Feature cards
  featureCard: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 6,
    width: "100%",
    boxShadow: "0 3px 10px rgba(0,0,30,0.09)",
  },
  featureItem: { flex: 1, alignItems: "center", gap: 6, paddingHorizontal: 2 },
  featureIconBg: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: NAVY + "12",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: NAVY + "1A",
  },
  featureLabel: {
    fontSize: 10,
    color: "#1A2D52",
    textAlign: "center",
    fontWeight: "600",
    lineHeight: 13,
  },

  // Toll plaza
  tollSection: { width: "100%" },
  tollBanner: {
    backgroundColor: ROAD_NAVY,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  tollBannerText: {
    color: "#FFCC00",
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1.8,
    textAlign: "center",
  },
  tollClip: { width: "100%", overflow: "hidden", backgroundColor: "#334455" },
  tollImg: { position: "absolute", left: 0, top: 0 },

  // Footer
  footer: {
    paddingTop: 16,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  shieldCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  footerTagline: {
    color: "white",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  footerDivider: {
    height: 1,
    width: "65%",
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 8,
  },
  copyright: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    textAlign: "center",
    letterSpacing: 0.1,
  },
});
