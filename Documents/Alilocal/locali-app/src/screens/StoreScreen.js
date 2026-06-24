import { View, Text, TouchableOpacity, Linking, StyleSheet, Platform } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { COLORS } from '../config';

export default function StoreScreen({ route }) {
  const { store, title, priceUsd } = route.params;
  const lat = store.lat || store.latitude;
  const lng = store.lng || store.longitude;

  const waMsg = encodeURIComponent(`שלום, יש לכם "${title}"? מצאתי אותו בחו״ל ב-$${priceUsd}`);
  const waLink = store.phone ? `https://wa.me/${String(store.phone).replace(/\D/g, '')}?text=${waMsg}` : null;
  const mapsUrl = store.google_maps_url
    || (lat && lng ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null);

  return (
    <View style={s.page}>
      {lat && lng ? (
        <MapView
          style={s.map}
          initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        >
          <Marker coordinate={{ latitude: lat, longitude: lng }} title={store.name} pinColor={COLORS.blue} />
        </MapView>
      ) : (
        <View style={[s.map, s.mapPh]}><Text style={{ fontSize: 44 }}>🏪</Text></View>
      )}

      <View style={s.body}>
        <Text style={s.name}>{store.name}</Text>
        <Text style={s.addr}>📍 {store.address}{store.distance_km ? ` · ${store.distance_km} ק״מ ממך` : ''}</Text>
        {store.rating ? (
          <Text style={s.rating}>{'★'.repeat(Math.round(store.rating))} {store.rating} ({store.rating_count || ''})</Text>
        ) : null}
        {store.open_now != null && (
          <Text style={[s.open, { color: store.open_now ? COLORS.green : COLORS.red }]}>
            {store.open_now ? '● פתוח עכשיו' : '● סגור כרגע'}
          </Text>
        )}

        <View style={s.btns}>
          {waLink && (
            <TouchableOpacity style={[s.btn, { backgroundColor: '#22c55e' }]} onPress={() => Linking.openURL(waLink)}>
              <Text style={s.btnText}>💬 שאל ב-WhatsApp</Text>
            </TouchableOpacity>
          )}
          {mapsUrl && (
            <TouchableOpacity style={[s.btn, { backgroundColor: COLORS.blue }]} onPress={() => Linking.openURL(mapsUrl)}>
              <Text style={s.btnText}>🗺️ נווט לחנות</Text>
            </TouchableOpacity>
          )}
          {store.website && (
            <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => Linking.openURL(store.website)}>
              <Text style={[s.btnText, { color: COLORS.blue }]}>🌐 אתר החנות</Text>
            </TouchableOpacity>
          )}
          {store.phone && (
            <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => Linking.openURL(`tel:${store.phone}`)}>
              <Text style={[s.btnText, { color: COLORS.blue }]}>📞 התקשר</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.bg },
  map: { height: 260, width: '100%' },
  mapPh: { backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20 },
  name: { fontSize: 22, fontWeight: '900', color: COLORS.text, textAlign: 'right' },
  addr: { fontSize: 13, color: COLORS.gray, textAlign: 'right', marginTop: 6 },
  rating: { fontSize: 13, color: '#f59e0b', textAlign: 'right', marginTop: 6 },
  open: { fontSize: 13, fontWeight: '800', textAlign: 'right', marginTop: 6 },
  btns: { marginTop: 22, gap: 10 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.blue },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
