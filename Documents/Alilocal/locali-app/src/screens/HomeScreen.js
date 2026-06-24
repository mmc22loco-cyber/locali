import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../config';

export default function HomeScreen({ navigation }) {
  const [clipUrl, setClipUrl] = useState(null);
  const [recent, setRecent] = useState([]);

  // Al volver a la pantalla: detectar URL en el clipboard + cargar historial
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const text = (await Clipboard.getStringAsync()) || '';
          setClipUrl(/^https?:\/\/\S+/.test(text.trim()) ? text.trim() : null);
        } catch (e) {}
        try {
          const raw = await AsyncStorage.getItem('locali_recent');
          setRecent(raw ? JSON.parse(raw) : []);
        } catch (e) {}
      })();
    }, [])
  );

  const goScan = (url) => navigation.navigate('Scan', { url });

  return (
    <View style={s.page}>
      {/* Hero */}
      <View style={s.hero}>
        <Text style={s.logo}>
          <Text style={{ color: '#fff' }}>Loca</Text>
          <Text style={{ color: '#93b4ff' }}>li</Text>
        </Text>
        <Text style={s.heroSub}>
          ראית מוצר ב-AliExpress?{'\n'}מצא אותו בחנויות בישראל 🇮🇱
        </Text>
      </View>

      {/* Clipboard detectado */}
      {clipUrl ? (
        <TouchableOpacity style={s.clipCard} onPress={() => goScan(clipUrl)}>
          <Text style={s.clipBadge}>📋 זוהה קישור בלוח</Text>
          <Text style={s.clipUrl} numberOfLines={1}>{clipUrl}</Text>
          <View style={s.clipBtn}>
            <Text style={s.clipBtnText}>🔍 חפש בישראל</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={s.howCard}>
          <Text style={s.howTitle}>איך זה עובד?</Text>
          <Text style={s.howStep}>1️⃣  העתק קישור של מוצר מ-AliExpress / Amazon / eBay</Text>
          <Text style={s.howStep}>2️⃣  חזור לאפליקציה — נזהה את הקישור אוטומטית</Text>
          <Text style={s.howStep}>3️⃣  קבל מחירים מ-KSP, Bug, Ivory וחנויות לידך</Text>
        </View>
      )}

      {/* Historial */}
      {recent.length > 0 && (
        <>
          <Text style={s.recentTitle}>חיפושים אחרונים</Text>
          <FlatList
            data={recent}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.recentRow}
                onPress={() => navigation.navigate('Results', {
                  title: item.title, priceUsd: item.priceUsd, imageUrl: item.imageUrl,
                })}
              >
                {item.imageUrl
                  ? <Image source={{ uri: item.imageUrl }} style={s.recentImg} />
                  : <View style={[s.recentImg, s.recentImgPh]}><Text>🛍️</Text></View>}
                <View style={{ flex: 1 }}>
                  <Text style={s.recentName} numberOfLines={2}>{item.title}</Text>
                  {item.priceUsd ? <Text style={s.recentPrice}>${item.priceUsd}</Text> : null}
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.bg, padding: 18 },
  hero: {
    backgroundColor: COLORS.blue, borderRadius: 18, padding: 26,
    alignItems: 'center', marginBottom: 18,
  },
  logo: { fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  heroSub: { color: '#dbe6ff', fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 23 },
  clipCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 18,
    borderWidth: 2, borderColor: COLORS.blue, marginBottom: 18,
  },
  clipBadge: { color: COLORS.blue, fontWeight: '800', fontSize: 13, textAlign: 'right' },
  clipUrl: { color: COLORS.gray, fontSize: 12, marginVertical: 8 },
  clipBtn: {
    backgroundColor: COLORS.blue, borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  clipBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  howCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 18 },
  howTitle: { fontWeight: '800', fontSize: 16, color: COLORS.text, textAlign: 'right', marginBottom: 10 },
  howStep: { fontSize: 13, color: COLORS.gray, textAlign: 'right', marginBottom: 8, lineHeight: 20 },
  recentTitle: { fontWeight: '800', fontSize: 14, color: COLORS.gray, textAlign: 'right', marginBottom: 8 },
  recentRow: {
    flexDirection: 'row-reverse', backgroundColor: '#fff', borderRadius: 12,
    padding: 10, marginBottom: 8, alignItems: 'center', gap: 10,
  },
  recentImg: { width: 48, height: 48, borderRadius: 8, backgroundColor: COLORS.bg },
  recentImgPh: { alignItems: 'center', justifyContent: 'center' },
  recentName: { fontSize: 13, color: COLORS.text, textAlign: 'right', fontWeight: '600' },
  recentPrice: { fontSize: 12, color: COLORS.blue, textAlign: 'right', fontWeight: '800', marginTop: 2 },
});
