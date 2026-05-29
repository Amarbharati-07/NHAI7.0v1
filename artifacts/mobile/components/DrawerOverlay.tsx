import React, { useEffect } from "react";
import { Dimensions, StyleSheet, TouchableWithoutFeedback, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import DrawerContent from "@/components/DrawerContent";
import { useDrawer } from "@/contexts/DrawerContext";

const DRAWER_WIDTH = 300;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function DrawerOverlay({ children }: { children: React.ReactNode }) {
  const { isOpen, closeDrawer } = useDrawer();
  const translateX = useSharedValue(-DRAWER_WIDTH);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateX.value = withTiming(isOpen ? 0 : -DRAWER_WIDTH, { duration: 280 });
    opacity.value = withTiming(isOpen ? 1 : 0, { duration: 280 });
  }, [isOpen]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    pointerEvents: isOpen ? "auto" : "none",
  } as never));

  return (
    <View style={styles.root}>
      {children}
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <TouchableWithoutFeedback onPress={closeDrawer}>
          <View style={styles.overlayTouchable} />
        </TouchableWithoutFeedback>
      </Animated.View>
      <Animated.View style={[styles.drawer, { width: DRAWER_WIDTH }, drawerStyle]}>
        <DrawerContent />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 10,
  },
  overlayTouchable: { flex: 1 },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 20,
  },
});
