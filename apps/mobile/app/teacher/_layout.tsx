// /teacher: the teacher dashboard (web). Everything below passes through the sign-in / teacher check.
import React from "react";
import { Slot } from "expo-router";
import { TeacherGate } from "../../src/teacher/Gate";

export default function TeacherLayout() {
  return (
    <TeacherGate>
      <Slot />
    </TeacherGate>
  );
}
