// Tiny toast: a message pinned near the bottom of the screen that clears itself. Works the same on web and native
// (no Alert, no system UI), so feedback is visible even inside the sandboxed web preview.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { colors, radius } from "../theme/colors";

export function useToast(ms = 3200) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useCallback(() => setText(null), []);
  const show = useCallback((m: string) => {
    setText(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), ms);
  }, [ms]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const node = text ? (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: 16, alignItems: "center", zIndex: 50 }}>
      <Pressable onPress={hide} accessibilityRole="alert" accessibilityLabel={text}
        style={{ backgroundColor: colors.ink, borderRadius: radius.m, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 520, borderWidth: 2, borderColor: colors.border }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15, textAlign: "center" }}>{text}</Text>
      </Pressable>
    </View>
  ) : null;
  return { show, node };
}
