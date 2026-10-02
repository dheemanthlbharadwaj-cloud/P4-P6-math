// In-app "Leave?" confirmation. Alert.alert with buttons does nothing on web / in the sandboxed preview, so every
// quit flow uses this CenterModal instead. Also owns the Android hardware back button (one prompt, never stacked).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Body, Button, CenterModal, H2 } from "./ui";
import { colors } from "../theme/colors";

export function useLeaveConfirm({
  enabled = true, title, body, fallback = "/(tabs)/map",
}: { enabled?: boolean; title: string; body: string; fallback?: Href }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;

  const leave = useCallback(() => {
    setOpen(false);
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);

  const ask = useCallback(() => setOpen(true), []);

  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      // First press asks; a press while the prompt is up just dismisses it. Always handled, so no double prompts.
      setOpen(!openRef.current);
      return true;
    });
    return () => sub.remove();
  }, [enabled]);

  const modal = (
    <CenterModal visible={open && enabled} onClose={() => setOpen(false)}>
      <H2 style={{ textAlign: "center" }}>{title}</H2>
      <Body style={{ textAlign: "center", color: colors.inkSoft, marginTop: 6, marginBottom: 14 }}>{body}</Body>
      <Button title="Keep playing" variant="good" onPress={() => setOpen(false)} />
      <Button title="Leave" variant="bad" onPress={leave} style={{ marginTop: 10 }} />
    </CenterModal>
  );
  return { ask, leave, modal };
}
