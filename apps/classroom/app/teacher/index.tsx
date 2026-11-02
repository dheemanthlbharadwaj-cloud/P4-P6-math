import React, { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { Shell } from "../../src/lessons/Shell";
import { SECTIONS, useTeacher } from "../../src/lessons/store";
import { LessonsSection } from "../../src/lessons/sections/Lessons";
import { StudentsSection } from "../../src/lessons/sections/Students";
import { BuilderSection } from "../../src/lessons/sections/Builder";

export default function TeacherHome() {
  const { section: wanted } = useLocalSearchParams<{ section?: string }>();
  const section = useTeacher((s) => s.section);
  useEffect(() => { const s = SECTIONS.find((x) => x.id === wanted)?.id; if (s) useTeacher.getState().go(s); }, [wanted]);
  return (
    <Shell>
      {section === "lessons" ? <LessonsSection /> : section === "students" ? <StudentsSection /> : <BuilderSection />}
    </Shell>
  );
}
