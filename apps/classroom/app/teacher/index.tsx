import React, { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { Shell } from "../../src/teacher/Shell";
import { SECTIONS, useTeacher, type Section } from "../../src/teacher/store";
import { ClassesSection } from "../../src/teacher/sections/Classes";
import { PostsSection } from "../../src/teacher/sections/Posts";
import { TasksSection } from "../../src/teacher/sections/Tasks";
import { MarkingSection } from "../../src/teacher/sections/Marking";
import { AnalyticsSection } from "../../src/teacher/sections/Analytics";

export default function TeacherDashboard() {
  const { section: wanted, class: classWanted } = useLocalSearchParams<{ section?: string; class?: string }>();
  useEffect(() => {
    const s = SECTIONS.find((x) => x.id === wanted)?.id;
    if (s) useTeacher.getState().go(s);
    if (classWanted && useTeacher.getState().classes.some((c) => c.id === classWanted)) useTeacher.getState().selectClass(classWanted);
  }, [wanted, classWanted]);
  return (
    <Shell>
      {(section: Section) => {
        switch (section) {
          case "classes": return <ClassesSection />;
          case "posts": return <PostsSection />;
          case "tasks": return <TasksSection />;
          case "marking": return <MarkingSection />;
          case "analytics": return <AnalyticsSection />;
        }
      }}
    </Shell>
  );
}
