import React, { useEffect } from "react";
import { ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Shell } from "../../src/lessons/Shell";
import { SECTIONS, useTeacher } from "../../src/lessons/store";
import { LessonsSection } from "../../src/lessons/sections/Lessons";
import { StudentsSection } from "../../src/lessons/sections/Students";
import { BuilderSection } from "../../src/lessons/sections/Builder";
import { TeachersSection } from "../../src/admin/sections/Teachers";
import { useAdmin } from "../../src/admin/store";
import { Muted, Notice } from "../../src/components/dash";
import { colors, space } from "../../src/theme/colors";

/** Admins only: loads the admin store (teacher list) on first open. */
function TeachersArea() {
  const { phase, error, load } = useAdmin();
  useEffect(() => { if (phase === "idle") void load(); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  if (phase === "idle" || phase === "loading") return <><ActivityIndicator size="large" color={colors.primary} /><Muted style={{ marginTop: space.m }}>Loading…</Muted></>;
  if (phase === "denied") return <Notice kind="error">Only the owner can manage teachers.</Notice>;
  if (phase === "error") return <Notice kind="error" onRetry={() => void load()}>{error ?? "Something went wrong."}</Notice>;
  return <TeachersSection />;
}

export default function TeacherHome() {
  const { section: wanted } = useLocalSearchParams<{ section?: string }>();
  const section = useTeacher((s) => s.section);
  useEffect(() => { const s = SECTIONS.find((x) => x.id === wanted)?.id; if (s) useTeacher.getState().go(s); }, [wanted]);
  return (
    <Shell>
      {section === "lessons" ? <LessonsSection /> : section === "students" ? <StudentsSection /> : section === "teachers" ? <TeachersArea /> : <BuilderSection />}
    </Shell>
  );
}
