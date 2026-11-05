import React from "react";
import { Redirect } from "expo-router";

export default function AdminRedirect() {
  return <Redirect href="/teacher?section=teachers" />;
}
