// /admin: the admin (owner) dashboard (web). Everything below passes through the sign-in / admin check.
import React from "react";
import { Slot } from "expo-router";
import { AdminGate } from "../../src/admin/Gate";

export default function AdminLayout() {
  return (
    <AdminGate>
      <Slot />
    </AdminGate>
  );
}
