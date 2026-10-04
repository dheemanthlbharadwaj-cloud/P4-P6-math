// DEV TOOLS panel (testing only, see devTools.ts): a floating 🛠 button that opens shortcuts to unlock content and
// simulate situations (out of hearts/energy, ads failing, PSLE tomorrow, wrong questions to review, …).
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MAX_ENERGY, MAX_HEARTS, STORE_ITEMS, type Grade } from "@p6/shared";
import { Sheet } from "../components/ui";
import { getAllLv1, getTopics } from "../content";
import { usePlayer, computeMeters } from "../store/player";
import { useProgress } from "../store/progress";
import { useProfile } from "../store/profile";
import { useCosmetics } from "../store/cosmetics";
import { useWrong } from "../store/wrong";
import { resetAllStores } from "../store/reset";
import { useNow } from "../hooks/useNow";
import { colors, fonts, radius } from "../theme/colors";
import { DEV_TOOLS, useDev, type AdOutcome } from "./devTools";

const isoIn = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

function Btn({ label, onPress, tone = "plain" }: { label: string; onPress: () => void; tone?: "plain" | "on" | "danger" }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({
        paddingHorizontal: 12, minHeight: 40, justifyContent: "center", borderRadius: 12, borderWidth: 2, borderColor: colors.border, marginRight: 8, marginBottom: 8,
        backgroundColor: tone === "on" ? colors.primary : tone === "danger" ? colors.badBg : pressed ? colors.highlight : "#fff",
      })}>
      <Text style={{ fontFamily: fonts.displayMedium, fontSize: 14, color: tone === "on" ? "#fff" : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 15, color: colors.inkSoft, marginBottom: 6 }}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{children}</View>
    </View>
  );
}

export function DevToolsButton() {
  const [open, setOpen] = useState(false);
  if (!DEV_TOOLS) return null;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Open dev tools"
        style={{ position: "absolute", right: 10, bottom: 96, width: 46, height: 46, borderRadius: 23, backgroundColor: "#33262a", alignItems: "center", justifyContent: "center", opacity: 0.85, zIndex: 999 }}>
        <Text style={{ fontSize: 22 }}>🛠</Text>
      </Pressable>
      {open ? <DevToolsSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function DevToolsSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const now = useNow(1000);
  const grade = useProfile((s) => s.grade) as Grade;
  const onboarded = useProfile((s) => s.onboarded);
  const stars = useProfile((s) => s.starBalance);
  const psle = useProfile((s) => s.psleDate);
  const player = usePlayer();
  const m = computeMeters(player, now);
  const unlocked = useProgress((s) => s.grades[grade]?.unlockedTopics.length ?? 0);
  const flagged = useWrong((s) => Object.keys(s.byGrade[grade] ?? {}).length);
  const adOutcome = useDev((s) => s.adOutcome);
  const [note, setNote] = useState<string | null>(null);
  const topics = getTopics(grade);
  const done = (msg: string) => setNote(msg);

  const setMeter = (kind: "hearts" | "energy", value: number) => {
    usePlayer.setState({ [kind]: { value, updatedAt: Date.now() } } as never);
    done(`${kind === "hearts" ? "Hearts" : "Energy"} set to ${value}`);
  };
  // Pretend the last change was yesterday, so the midnight refill happens now.
  const simulateMidnight = () => {
    const y = Date.now() - 86_400_000;
    usePlayer.setState((s) => ({ hearts: { ...s.hearts, updatedAt: y }, energy: { ...s.energy, updatedAt: y } }));
    done("Midnight passed: hearts and energy refilled");
  };
  const ensure = () => useProgress.getState().ensureGrade(grade, useProfile.getState().topicsLearnt);
  const unlockAll = () => { ensure(); for (const t of topics) useProgress.getState().unlockTopic(grade, t.id); done("All maps unlocked"); };
  const lockToLearnt = () => {
    ensure();
    const g = useProgress.getState().grades[grade]!;
    const learnt = useProfile.getState().topicsLearnt;
    useProgress.setState((s) => ({ grades: { ...s.grades, [grade]: { ...g, unlockedTopics: topics.filter((t, i) => i === 0 || learnt.includes(t.id)).map((t) => t.id) } } }));
    done("Maps locked back to the topics chosen at sign-up (plus the first)");
  };
  const complete = (which: "first-map" | "all" | "half-first") => {
    ensure();
    const list = which === "all" ? topics : [topics[0]];
    for (const t of list) {
      const subs = [...t.subtopics].sort((a, b) => a.order - b.order);
      const take = which === "half-first" ? subs.slice(0, Math.ceil(subs.length / 2)) : subs;
      for (const s of take) for (const l of [1, 2, 3] as const) useProgress.getState().recordLevel(grade, s.id, l, 5, true);
      if (which === "all") useProgress.getState().unlockTopic(grade, t.id);
    }
    done(which === "all" ? "Every level on every map completed" : which === "first-map" ? "First map completed (gold buttons)" : "Half of the first map completed");
  };
  const resetProgress = () => { useProgress.getState().reset(); ensure(); done("Progress cleared"); };
  const flagWrong = (n: number) => {
    const pool = getAllLv1(grade).filter((q) => q.autoMarkable);
    for (let i = 0; i < n && pool.length; i++) useWrong.getState().add(grade, pool[Math.floor(Math.random() * pool.length)].id);
    done(`${n} random questions flagged as previously wrong`);
  };
  const go = (path: string) => { onClose(); router.push(path as never); };
  const firstSub = [...(topics[0]?.subtopics ?? [])].sort((a, b) => a.order - b.order)[0];

  return (
    <Sheet visible onClose={onClose}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
        <Text style={{ flex: 1, fontFamily: fonts.display, fontSize: 22, color: colors.ink }}>🛠 Dev tools</Text>
        <Btn label="Close" onPress={onClose} />
      </View>
      <Text style={{ color: colors.inkSoft, fontSize: 13, marginBottom: 8 }}>
        Hearts {m.hearts}/{MAX_HEARTS} · Energy {m.energy}/{MAX_ENERGY} · Stars {stars} · Maps open {unlocked}/{topics.length} · Flagged {flagged} · PSLE {psle}
        {m.subscribed ? " · SUBSCRIBED" : ""}
      </Text>
      {note ? <Text style={{ backgroundColor: colors.goodBg, borderRadius: radius.s, padding: 8, marginBottom: 8, color: colors.ink, fontWeight: "700" }}>✓ {note}</Text> : null}
      <ScrollView style={{ maxHeight: 480 }}>
        <Section title="Access">
          <Btn label="Unlock all maps" onPress={unlockAll} />
          <Btn label="Lock maps again" onPress={lockToLearnt} />
          <Btn label={player.subscribed ? "Subscription: ON" : "Subscription: OFF"} tone={player.subscribed ? "on" : "plain"} onPress={() => { usePlayer.getState().setSubscribed(!player.subscribed); done(player.subscribed ? "Subscription off" : "Subscribed (unlimited hearts & energy)"); }} />
          <Btn label="Own all shop items" onPress={() => { useCosmetics.getState().grantOwned(STORE_ITEMS.map((i) => i.id)); done("All colours and hats owned"); }} />
          <Btn label="Stars → 500" onPress={() => { useProfile.getState().set({ starBalance: 500 }); done("Star balance 500"); }} />
          <Btn label="Stars → 0" onPress={() => { useProfile.getState().set({ starBalance: 0 }); done("Star balance 0"); }} />
        </Section>
        <Section title="Progress">
          <Btn label="Half of map 1 done" onPress={() => complete("half-first")} />
          <Btn label="Map 1 all gold" onPress={() => complete("first-map")} />
          <Btn label="Everything done" onPress={() => complete("all")} />
          <Btn label="Clear progress" tone="danger" onPress={resetProgress} />
        </Section>
        <Section title="Hearts & energy">
          <Btn label="Out of hearts" onPress={() => setMeter("hearts", 0)} />
          <Btn label="1 heart" onPress={() => setMeter("hearts", 1)} />
          <Btn label="Full hearts" onPress={() => setMeter("hearts", MAX_HEARTS)} />
          <Btn label="Out of energy" onPress={() => setMeter("energy", 0)} />
          <Btn label="Full energy" onPress={() => setMeter("energy", MAX_ENERGY)} />
          <Btn label="Simulate midnight" onPress={simulateMidnight} />
        </Section>
        <Section title="Next ad (watch-an-ad buttons)">
          {(["rewarded", "load-failed", "dismissed"] as AdOutcome[]).map((o) => (
            <Btn key={o} label={o === "rewarded" ? "Gives reward" : o === "load-failed" ? "Fails to load" : "Closed early"} tone={adOutcome === o ? "on" : "plain"} onPress={() => { useDev.getState().setAdOutcome(o); done(`Ads now: ${o}`); }} />
          ))}
        </Section>
        <Section title="Mini games">
          <Btn label="Flag 5 wrong questions" onPress={() => flagWrong(5)} />
          <Btn label="Clear wrong questions" onPress={() => { useWrong.getState().reset(); done("Wrong questions cleared"); }} />
          <Btn label="Open 5-Minute Challenge" onPress={() => go(`/minigame/challenge?grade=${grade}`)} />
          <Btn label="Open Unlimited Mistakes" onPress={() => go(`/minigame/mistakes?grade=${grade}`)} />
        </Section>
        <Section title="PSLE countdown">
          <Btn label="PSLE tomorrow" onPress={() => { useProfile.getState().set({ psleDate: isoIn(1) }); done("PSLE set to tomorrow"); }} />
          <Btn label="PSLE today" onPress={() => { useProfile.getState().set({ psleDate: isoIn(0) }); done("PSLE set to today"); }} />
          <Btn label="PSLE in 30 days" onPress={() => { useProfile.getState().set({ psleDate: isoIn(30) }); done("PSLE in 30 days"); }} />
        </Section>
        <Section title="Jump to">
          {firstSub ? <Btn label="Map 1 · first level" onPress={() => go(`/level/${grade}/${firstSub.id}/1`)} /> : null}
          <Btn label="Map" onPress={() => go("/(tabs)/map")} />
          <Btn label="Cat Shop" onPress={() => go("/(tabs)/store")} />
          <Btn label="Profile" onPress={() => go("/(tabs)/profile")} />
        </Section>
        <Section title="Account">
          <Btn label={onboarded ? "Redo onboarding" : "Onboarding pending"} onPress={() => { useProfile.getState().set({ onboarded: false }); onClose(); }} />
          <Btn label="Reset app (fresh install)" tone="danger" onPress={() => { resetAllStores(); onClose(); router.replace("/(onboarding)/login" as never); }} />
        </Section>
      </ScrollView>
    </Sheet>
  );
}
