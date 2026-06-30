import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const TOKEN_KEY = 'babitrack_jwt_token';
const REFRESH_TOKEN_KEY = 'babitrack_refresh_token';
const USER_KEY = 'babitrack_user_data';
const PIN_KEY = 'babitrack_pin_code';

export const saveTokens = async (accessToken: string, refreshToken: string): Promise<void> => {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
};

export const getAccessToken = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync(TOKEN_KEY);
};

export const getRefreshToken = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
};

export const saveUser = async (user: any): Promise<void> => {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
};

export const getUser = async (): Promise<any | null> => {
  const data = await SecureStore.getItemAsync(USER_KEY);
  if (!data) return null;
  return JSON.parse(data);
};

export const savePin = async (pin: string): Promise<void> => {
  await SecureStore.setItemAsync(PIN_KEY, pin);
};

export const getPin = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync(PIN_KEY);
};

export const hasPin = async (): Promise<boolean> => {
  const pin = await getPin();
  return pin !== null && pin.length === 4;
};

export const isBiometricsSupported = async (): Promise<boolean> => {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
};

export const authenticateBiometrics = async (): Promise<boolean> => {
  try {
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    let promptMessage = 'Authentification requise';
    
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      promptMessage = 'Connexion avec Face ID';
    } else {
      promptMessage = 'Connexion avec Touch ID / Empreinte';
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Utiliser le code PIN',
      disableDeviceFallback: true, // Forcer l'application à gérer son propre repli (code PIN BabiTrack)
    });

    return result.success;
  } catch (error) {
    console.error('Erreur lors de la validation biométrique:', error);
    return false;
  }
};

export const clearCredentials = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  // Note : On ne supprime pas forcément le code PIN lors d'un simple logout, 
  // mais on peut le supprimer si nécessaire. Laissons-le pour permettre la reconnexion PIN.
};
