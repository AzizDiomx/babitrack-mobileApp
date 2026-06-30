import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { savePin, isBiometricsSupported, authenticateBiometrics } from '../services/security';

interface PinSetupScreenProps {
  onComplete: () => void;
}

export default function PinSetupScreen({ onComplete }: PinSetupScreenProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<1 | 2>(1); // Step 1: Enter, Step 2: Confirm
  const [error, setError] = useState<string | null>(null);

  const handleKeyPress = (num: string) => {
    setError(null);
    const currentVal = step === 1 ? pin : confirmPin;
    
    if (currentVal.length >= 4) return;
    
    const newVal = currentVal + num;
    
    if (step === 1) {
      setPin(newVal);
      if (newVal.length === 4) {
        // Passer à l'étape 2 après une courte pause pour le retour visuel du dernier rond rempli
        setTimeout(() => {
          setStep(2);
        }, 200);
      }
    } else {
      setConfirmPin(newVal);
      if (newVal.length === 4) {
        setTimeout(() => {
          validateAndSave(newVal);
        }, 200);
      }
    }
  };

  const handleBackspace = () => {
    if (step === 1) {
      setPin(pin.slice(0, -1));
    } else {
      setConfirmPin(confirmPin.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (step === 1) {
      setPin('');
    } else {
      setConfirmPin('');
    }
  };

  const validateAndSave = async (finalConfirmPin: string) => {
    if (pin !== finalConfirmPin) {
      setError('Les codes PIN ne correspondent pas. Veuillez réessayer.');
      setPin('');
      setConfirmPin('');
      setStep(1);
      return;
    }

    try {
      // 1. Sauvegarder le code PIN dans le stockage sécurisé
      await savePin(pin);

      // 2. Vérifier si la biométrie est supportée sur l'appareil
      const biometricsAvail = await isBiometricsSupported();

      if (biometricsAvail) {
        Alert.alert(
          'Authentification Biométrique',
          'Souhaitez-vous activer la connexion rapide par biométrie (Face ID / Empreinte digitale) ?',
          [
            {
              text: 'Plus tard',
              onPress: () => onComplete(),
              style: 'cancel',
            },
            {
              text: 'Activer',
              onPress: async () => {
                const success = await authenticateBiometrics();
                if (success) {
                  Alert.alert('Succès', 'Biométrie activée avec succès.');
                }
                onComplete();
              },
            },
          ]
        );
      } else {
        onComplete();
      }
    } catch (err) {
      console.error(err);
      setError('Une erreur est survenue lors de la configuration.');
      setPin('');
      setConfirmPin('');
      setStep(1);
    }
  };

  const currentPin = step === 1 ? pin : confirmPin;

  return (
    <View style={styles.container}>
      {/* Title */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {step === 1 ? 'Créer votre code PIN' : 'Confirmer votre code PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 1
            ? 'Définissez un code PIN à 4 chiffres pour vos connexions futures.'
            : 'Veuillez saisir à nouveau le code PIN pour confirmation.'}
        </Text>
      </View>

      {/* Dots display */}
      <View style={styles.dotsContainer}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentPin.length > index && styles.dotFilled,
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
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('1')}>
            <Text style={styles.keyText}>1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('2')}>
            <Text style={styles.keyText}>2</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('3')}>
            <Text style={styles.keyText}>3</Text>
          </TouchableOpacity>
        </View>

        {/* Row 2 */}
        <View style={styles.row}>
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('4')}>
            <Text style={styles.keyText}>4</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('5')}>
            <Text style={styles.keyText}>5</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('6')}>
            <Text style={styles.keyText}>6</Text>
          </TouchableOpacity>
        </View>

        {/* Row 3 */}
        <View style={styles.row}>
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('7')}>
            <Text style={styles.keyText}>7</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('8')}>
            <Text style={styles.keyText}>8</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('9')}>
            <Text style={styles.keyText}>9</Text>
          </TouchableOpacity>
        </View>

        {/* Row 4 */}
        <View style={styles.row}>
          <TouchableOpacity style={styles.keyAction} onPress={handleClear}>
            <Text style={styles.keyActionText}>C</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('0')}>
            <Text style={styles.keyText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.keyAction} onPress={handleBackspace}>
            <Ionicons name="backspace-outline" size={26} color="#A1A1AA" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
  },
  title: {
    fontSize: 24,
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
    marginVertical: 40,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
    marginBottom: 20,
  },
  errorText: {
    color: '#FCA5A5', // Red 300
    fontSize: 14,
    fontWeight: '500',
  },
  keypad: {
    width: '100%',
    alignSelf: 'center',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 10,
  },
  key: {
    width: 76,
    height: 76,
    borderRadius: 38,
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
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyActionText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#A1A1AA',
  },
});
