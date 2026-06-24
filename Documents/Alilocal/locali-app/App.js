import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import ScanScreen from './src/screens/ScanScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import StoreScreen from './src/screens/StoreScreen';
import { COLORS } from './src/config';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.blue },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '900' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Locali' }} />
        <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'זיהוי מוצר' }} />
        <Stack.Screen name="Results" component={ResultsScreen} options={{ title: 'תוצאות בישראל' }} />
        <Stack.Screen name="Store" component={StoreScreen} options={{ title: 'חנות' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
