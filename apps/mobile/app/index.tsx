import { View } from "react-native";
import { colors } from "../src/theme/colors";

// The route guard in _layout.tsx redirects from here.
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
