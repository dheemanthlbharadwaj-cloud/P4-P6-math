// /teacher: teachers and admins only (parents are sent to /parent).
import React from "react";
import { Slot } from "expo-router";
import { TeacherGate } from "../../src/lessons/Gate";

export default function TeacherLayout() {
  return <TeacherGate><Slot /></TeacherGate>;
}
