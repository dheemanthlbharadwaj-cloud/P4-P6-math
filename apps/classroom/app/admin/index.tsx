import React, { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { Shell } from "../../src/admin/Shell";
import { SECTIONS, useAdmin, type Section } from "../../src/admin/store";
import { TeachersSection } from "../../src/admin/sections/Teachers";
import { ClassesSection } from "../../src/admin/sections/Classes";
import { LoginsSection } from "../../src/admin/sections/Logins";

export default function AdminDashboard() {
  const { section: wanted } = useLocalSearchParams<{ section?: string }>();
  useEffect(() => {
    const s = SECTIONS.find((x) => x.id === wanted)?.id;
    if (s) useAdmin.getState().go(s);
  }, [wanted]);
  return (
    <Shell>
      {(section: Section) => {
        switch (section) {
          case "teachers": return <TeachersSection />;
          case "classes": return <ClassesSection />;
          case "logins": return <LoginsSection />;
        }
      }}
    </Shell>
  );
}
