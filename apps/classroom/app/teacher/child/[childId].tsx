import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Shell } from "../../../src/lessons/Shell";
import { ChildProfile } from "../../../src/lessons/ChildProfile";
import { useTeacher } from "../../../src/lessons/store";

export default function ChildPage() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const router = useRouter();
  return <Shell active="students"><ChildProfile childId={childId} onBack={() => { useTeacher.getState().go("students"); router.replace("/teacher"); }} /></Shell>;
}
