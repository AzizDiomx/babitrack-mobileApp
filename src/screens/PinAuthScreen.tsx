import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getPin, isBiometricsSupported, authenticateBiometrics } from '../services/security';

import { useAppTheme } from '../services/theme';

interface PinAuthScreenProps {
  onAuthSuccess: () => void;
  onLogout: () => void;
}

export default function PinAuthScreen({ onAuthSuccess, onLogout }: PinAuthScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bioSupported, setBioSupported] = useState(false);

  const { colors } = useAppTheme();

  // Auto-lancement de la biométrie au montage
  useEffect(() => {
    const initBiometrics = async () => {
      const avail = await isBiometricsSupported();
      setBioSupported(avail);
      
      if (avail) {
        // Laisser un court délai pour que l'écran s'affiche correctement
        setTimeout(async () => {
          await triggerBiometrics();
        }, 300);
      }
    };

    initBiometrics();
  }, []);

  const triggerBiometrics = async () => {
    const success = await authenticateBiometrics();
    if (success) {
      onAuthSuccess();
    }
  };

  const handleKeyPress = async (num: string) => {
    setError(null);
    if (pin.length >= 4) return;

    const newVal = pin + num;
    setPin(newVal);

    if (newVal.length === 4) {
      const savedPin = await getPin();
      if (newVal === savedPin) {
        setTimeout(() => {
          onAuthSuccess();
        }, 150);
      } else {
        setTimeout(() => {
          setError('Code PIN incorrect. Veuillez réessayer.');
          setPin('');
        }, 200);
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.logoBackground, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Ionicons name="lock-closed" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Saisir votre code PIN</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Entrez votre code à 4 chiffres ou utilisez la biométrie pour déverrouiller.
        </Text>
      </View>

      {/* Dots display */}
      <View style={styles.dotsContainer}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[
              styles.dot,
              { borderColor: colors.cardBorder },
              pin.length > index && [styles.dotFilled, { backgroundColor: colors.primary, borderColor: colors.primary }],
            ]}
          />
        ))}
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={16} color="#FCA5A5" style={{ marginRight: 6 }} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Keypad */}
      <View style={styles.keypad}>
        {/* Row 1 */}
        <View style={styles.row}>
          <TouchableOpacity style={[styles.key, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => handleKeyPress('1')}>
            <Text style={[styles.keyText, { color: colors.text }]}>1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.key, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => handleKeyPress('2')}>
            <Text style={[styles.keyText, { color: colors.text }]}>2</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.key, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => handleKeyPress('3')}>
            <Text style={[styles.keyText, { color: colors.text }]}>3</Text>
          </TouchableOpacity>
        </View>

        {/* Row 2 */}
        <View style={styles.row}>
          <TouchableOpacity style={[styles.key, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => handleKeyPress('4')}>
            <Text style={[styles.keyText, { color: colors.text }]}>4</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.key, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => handleKeyPress('5')}>
            <Text style={[styles.keyText, { color: colors.text }]}>5</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.key, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => handleKeyPress('6')}>
            <Text style={[styles.keyText, { color: colors.text }]}>6</Text>
          </TouchableOpacity>
        </View>

        {/* Row 3 */}
        <View style={styles.row}>
          <TouchableOpacity style={[styles.key, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => handleKeyPress('7')}>
            <Text style={[styles.keyText, { color: colors.text }]}>7</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.key, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => handleKeyPress('8')}>
            <Text style={[styles.keyText, { color: colors.text }]}>8</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.key, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => handleKeyPress('9')}>
            <Text style={[styles.keyText, { color: colors.text }]}>9</Text>
          </TouchableOpacity>
        </View>

        {/* Row 4 */}
        <View style={styles.row}>
          {bioSupported ? (
            <TouchableOpacity style={styles.keyAction} onPress={triggerBiometrics}>
              <Ionicons name="finger-print" size={28} color={colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.keyAction} onPress={handleClear}>
              <Text style={[styles.keyActionText, { color: colors.textMuted }]}>C</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={[styles.key, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => handleKeyPress('0')}>
            <Text style={[styles.keyText, { color: colors.text }]}>0</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.keyAction} onPress={handleBackspace}>
            <Ionicons name="backspace-outline" size={26} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Alternative login */}
      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Text style={[styles.logoutButtonText, { color: colors.primary }]}>Se connecter avec un autre compte</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
    paddingVertical: 50,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
  },
  logoBackground: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 30,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#27272a',
    marginHorizontal: 12,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#F97316', // Orange 500
    borderColor: '#F97316',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    alignSelf: 'center',
  },
  errorText: {
    color: '#FCA5A5', // Red 300
    fontSize: 14,
    fontWeight: '500',
  },
  keypad: {
    width: '100%',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  key: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  keyText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  keyAction: {
    width: 74,
    height: 74,
    borderRadius: 37,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyActionText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  logoutButton: {
    alignSelf: 'center',
    padding: 10,
    marginTop: 10,
  },
  logoutButtonText: {
    color: '#F97316', // Orange 500
    fontSize: 14,
    fontWeight: '600',
  },
});
