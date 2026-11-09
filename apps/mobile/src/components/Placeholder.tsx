import { StyleSheet, Text, View } from 'react-native';

/** Temporary screen body until Claude Design screens land (Phase 8). */
export function Placeholder({ title, lines }: { title: string; lines: string[] }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      {lines.map((l) => (
        <Text key={l} style={styles.line}>
          {l}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '600' },
  line: { fontSize: 15, color: '#666' },
});
