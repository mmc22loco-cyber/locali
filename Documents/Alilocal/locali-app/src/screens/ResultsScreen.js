import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator,
  Linking, StyleSheet,
} from 'react-native';
import * as Location from 'expo-location';
import { BACKEND_URL, COLORS } from '../config';

const STORE_LABELS = { ksp: 'KSP', bug: 'BUG', ivory: 'Ivory', zap: 'Zap' };

export default function ResultsScreen({ route, navigation }) {
  const { title, priceUsd, imageUrl } = route.params;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        let lat = 32.0853, lng = 34.7818; // Tel Aviv fallback
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            lat = pos.coords.latitude; lng = pos.coords.longitude;
          }
        } catch (e) {}
        const resp = await fetch(`${BACKEND_URL}/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id: 'app_' + Date.now(), title, price_usd: priceUsd || 0,
            specs: {}, user_lat: lat, user_lng: lng,
          }),
        });
        if (!resp.ok) throw new Error('שגיאת שרת ' + resp.status);
        setData(await resp.json());
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  if (error) return (
    <View style={s.center}><Text style={{ fontSize: 36 }}>⚠️</Text>
      <Text style={s.err}>{error}</Text></View>
  );
  if (!data) return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={COLORS.blue} />
      <Text style={{ color: COLORS.gray, marginTop: 14 }}>מחפש ב-KSP · Bug · Ivory · Zap...</Text>
    </View>
  );

  const online = data.online || [];
  const physical = data.physical || [];
  const aliIls = data.cost_analysis?.total_cost_ils;

  const sections = [
    ...(physical.length ? [{ type: 'header', label: `🏪 חנויות פיזיות לידך (${physical.length})` }] : []),
    ...physical.map(p => ({ type: 'physical', item: p })),
    ...(online.length ? [{ type: 'header', label: `🛒 חנויות אונליין (${online.length})` }] : []),
    ...online.map(o => ({ type: 'online', item: o })),
  ];

  return (
    <FlatList
      style={{ backgroundColor: COLORS.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
      data={sections}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={
        <View style={s.aliBar}>
          {imageUrl ? <Image source={{ uri: imageUrl }} style={s.aliImg} resizeMode="contain" /> : null}
          <View style={{ flex: 1 }}>
            <Text style={s.aliTitle} numberOfLines={2}>{title}</Text>
            <Text style={s.aliPrice}>
              ${priceUsd}{aliIls ? `  ≈ ₪${aliIls} כולל מע״מ` : ''}
            </Text>
          </View>
        </View>
      }
      renderItem={({ item: row }) => {
        if (row.type === 'header') return <Text style={s.section}>{row.label}</Text>;
        if (row.type === 'online') {
          const o = row.item;
          const label = STORE_LABELS[o.store] || (o.store || '').toUpperCase();
          const saving = o.price_ils && aliIls ? Math.round(aliIls - o.price_ils) : null;
          return (
            <TouchableOpacity style={s.card} onPress={() => Linking.openURL(o.url)}>
              {o.image_url
                ? <Image source={{ uri: o.image_url }} style={s.cardImg} resizeMode="contain" />
                : <View style={[s.cardImg, s.cardImgPh]}><Text style={{ fontSize: 26 }}>🛍️</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={s.storeName}>{label}</Text>
                <Text style={s.cardTitle} numberOfLines={2}>{o.title}</Text>
                <View style={s.priceRow}>
                  {o.price_ils
                    ? <Text style={s.cardPrice}>₪{o.price_ils}</Text>
                    : <Text style={s.searchLabel}>🔍 חפש בחנות</Text>}
                  {saving > 20 && <Text style={s.saveBadge}>חוסך ₪{saving}</Text>}
                </View>
              </View>
            </TouchableOpacity>
          );
        }
        const p = row.item;
        return (
          <TouchableOpacity style={s.card} onPress={() => navigation.navigate('Store', { store: p, title, priceUsd })}>
            <View style={[s.cardImg, s.cardImgPh]}><Text style={{ fontSize: 26 }}>🏪</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.storeName}>{p.name}</Text>
              <Text style={s.cardTitle} numberOfLines={1}>
                📍 {p.address}{p.distance_km ? ` · ${p.distance_km} ק״מ` : ''}
              </Text>
              <Text style={[s.openBadge, { color: p.open_now ? COLORS.green : COLORS.red }]}>
                {p.open_now === true ? '● פתוח עכשיו' : p.open_now === false ? '● סגור' : ''}
              </Text>
            </View>
            <Text style={{ color: COLORS.grayLight, fontSize: 20 }}>‹</Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  err: { color: COLORS.red, marginTop: 10, fontWeight: '700' },
  aliBar: {
    flexDirection: 'row-reverse', backgroundColor: '#fff', borderRadius: 14,
    padding: 12, marginBottom: 14, alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  aliImg: { width: 64, height: 64, borderRadius: 10, backgroundColor: COLORS.bg },
  aliTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, textAlign: 'right' },
  aliPrice: { fontSize: 15, fontWeight: '900', color: '#FF4747', textAlign: 'right', marginTop: 4 },
  section: { fontSize: 15, fontWeight: '900', color: COLORS.text, textAlign: 'right', marginVertical: 10 },
  card: {
    flexDirection: 'row-reverse', backgroundColor: '#fff', borderRadius: 13,
    padding: 12, marginBottom: 9, alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardImg: { width: 62, height: 62, borderRadius: 9, backgroundColor: COLORS.bg },
  cardImgPh: { alignItems: 'center', justifyContent: 'center' },
  storeName: { fontSize: 13, fontWeight: '900', color: COLORS.blue, textAlign: 'right' },
  cardTitle: { fontSize: 12, color: COLORS.gray, textAlign: 'right', marginTop: 2 },
  priceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 4 },
  cardPrice: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  searchLabel: { fontSize: 13, color: COLORS.gray, fontWeight: '600' },
  saveBadge: {
    fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: COLORS.green,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden',
  },
  openBadge: { fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: 3 },
});
