import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Image, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL, COLORS } from '../config';

export default function ScanScreen({ route, navigation }) {
  const { url } = route.params;
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${BACKEND_URL}/api/extract?url=${encodeURIComponent(url)}`);
        if (!resp.ok) throw new Error((await resp.json()).detail || 'Error');
        const data = await resp.json();
        setProduct(data);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [url]);

  const search = async () => {
    // Guardar en historial
    try {
      const raw = await AsyncStorage.getItem('locali_recent');
      const recent = raw ? JSON.parse(raw) : [];
      const entry = { title: product.title, priceUsd: product.price_usd, imageUrl: product.image_url };
      await AsyncStorage.setItem('locali_recent',
        JSON.stringify([entry, ...recent.filter(r => r.title !== entry.title)].slice(0, 10)));
    } catch (e) {}
    navigation.replace('Results', {
      title: product.title, priceUsd: product.price_usd, imageUrl: product.image_url,
    });
  };

  if (error) {
    return (
      <View style={s.center}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
        <Text style={s.errText}>לא הצלחנו לזהות את המוצר</Text>
        <Text style={s.errSub}>{error}</Text>
        <TouchableOpacity style={s.btn} onPress={() => navigation.goBack()}>
          <Text style={s.btnText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.blue} />
        <Text style={{ color: COLORS.gray, marginTop: 14 }}>מזהה את המוצר...</Text>
      </View>
    );
  }

  return (
    <View style={s.center}>
      <Text style={s.found}>✨ מצאנו את המוצר</Text>
      {product.image_url ? (
        <Image source={{ uri: product.image_url }} style={s.img} resizeMode="contain" />
      ) : null}
      <Text style={s.title}>{product.title}</Text>
      {product.price_usd ? <Text style={s.price}>${product.price_usd}</Text> : null}
      <TouchableOpacity style={s.btn} onPress={search}>
        <Text style={s.btnText}>🇮🇱 חפש בישראל</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  found: { color: COLORS.blue, fontWeight: '800', fontSize: 16, marginBottom: 16 },
  img: { width: 180, height: 180, borderRadius: 14, backgroundColor: '#fff', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  price: { fontSize: 26, fontWeight: '900', color: '#FF4747', marginBottom: 22 },
  btn: {
    backgroundColor: COLORS.blue, borderRadius: 12, paddingVertical: 15,
    paddingHorizontal: 40, marginTop: 10,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  errText: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  errSub: { fontSize: 12, color: COLORS.grayLight, textAlign: 'center', marginBottom: 16 },
});
