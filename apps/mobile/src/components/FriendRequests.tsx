// Incoming friend requests (friendRequests where to == me, status pending) with Accept / Decline.
// Reads go straight to Firestore (rules allow the addressee to read); answering goes through respondFriendRequest.
import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { Body, Button, Card, H2 } from "./ui";
import { api, ApiError } from "../services/api";
import { currentUser } from "../services/auth";
import { refreshFriends } from "../services/bootstrap";
import { firebaseFirestore } from "../services/firebase";
import { isFirebaseConfigured } from "../services/config";
import { colors } from "../theme/colors";
import { SAMPLE_FRIEND_REQUEST, SAMPLE_REQUEST_PROFILE, SHOW_SAMPLES } from "../dev/samples";
import { useFriends } from "../store/friends";

interface Incoming { id: string; name: string }
let sampleAnswered = false; // the sample request was declined this session

export function FriendRequests({ onMessage }: { onMessage: (m: string) => void }) {
  const [items, setItems] = useState<Incoming[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const uid = isFirebaseConfigured ? currentUser()?.uid : null;
    if (!uid) {
      // Offline / no backend yet: one sample request to try Accept and Decline.
      const answered = useFriends.getState().friends.some((f) => f.uid === SAMPLE_REQUEST_PROFILE.uid) || sampleAnswered;
      if (SHOW_SAMPLES && !answered) setItems([SAMPLE_FRIEND_REQUEST]);
      return;
    }
    try {
      const db = firebaseFirestore();
      const snap = await getDocs(query(collection(db, "friendRequests"), where("to", "==", uid), where("status", "==", "pending")));
      const out = await Promise.all(snap.docs.map(async (d) => {
        const from = await getDoc(doc(db, "publicProfiles", String(d.data().from)));
        return { id: d.id, name: String(from.data()?.displayName ?? "A player") };
      }));
      setItems(out);
    } catch { /* offline: keep what we have */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const respond = async (id: string, accept: boolean) => {
    if (id === SAMPLE_FRIEND_REQUEST.id) {
      // Sample request: handled on this device only.
      if (accept) useFriends.getState().set([...useFriends.getState().friends, SAMPLE_REQUEST_PROFILE]);
      else sampleAnswered = true;
      setItems((xs) => xs.filter((x) => x.id !== id));
      onMessage(accept ? "You are friends now! (sample)" : "Request declined. (sample)");
      return;
    }
    setBusy(id);
    try {
      await api.respondFriendRequest({ requestId: id, accept });
      onMessage(accept ? "You are friends now!" : "Request declined.");
      await load();
      if (accept) void refreshFriends();
    } catch (e) {
      onMessage(e instanceof ApiError && e.transient ? "Connect to the internet to answer." : "Could not answer that request.");
    } finally { setBusy(null); }
  };

  if (!items.length) return null;
  return (
    <Card>
      <H2>Friend requests</H2>
      {items.map((r) => (
        <View key={r.id} style={{ marginTop: 10 }}>
          <Body style={{ fontWeight: "900", color: colors.ink }}>{r.name} wants to be your friend</Body>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
            <Button title="Accept" variant="good" small disabled={busy === r.id} onPress={() => void respond(r.id, true)} style={{ flex: 1 }} />
            <Button title="Decline" variant="ghost" small disabled={busy === r.id} onPress={() => void respond(r.id, false)} style={{ flex: 1 }} />
          </View>
        </View>
      ))}
      <Text style={{ color: colors.inkSoft, fontSize: 12, marginTop: 8 }}>Only accept people you know.</Text>
    </Card>
  );
}
