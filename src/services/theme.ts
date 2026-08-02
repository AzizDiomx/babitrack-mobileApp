import { useColorScheme } from 'react-native';

export interface ThemeColors {
  background: string;
  card: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  inputBg: string;
  inputBorder: string;
  primary: string;
  primaryBg: string;
  success: string;
  warning: string;
  danger: string;
  separator: string;
  statusBarStyle: 'light' | 'dark';
  mapStyle?: any[];
}

export const darkColors: ThemeColors = {
  background: '#000000',
  card: '#121212',
  cardBorder: '#27272A',
  text: '#FFFFFF',
  textSecondary: '#D4D4D8',
  textMuted: '#71717A',
  inputBg: '#18181B',
  inputBorder: '#27272A',
  primary: '#F97316',
  primaryBg: 'rgba(249, 115, 22, 0.15)',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  separator: '#27272A',
  statusBarStyle: 'light',
  mapStyle: [
    { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    {
      featureType: 'administrative.locality',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#d59563' }],
    },
    {
      featureType: 'poi',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#d59563' }],
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [{ color: '#38414e' }],
    },
    {
      featureType: 'road',
      elementType: 'geometry.stroke',
      stylers: [{ color: '#212a37' }],
    },
    {
      featureType: 'road',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#9ca5b3' }],
    },
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: '#17263c' }],
    },
  ],
};

export const lightColors: ThemeColors = {
  background: '#F4F4F5',
  card: '#FFFFFF',
  cardBorder: '#E4E4E7',
  text: '#18181B',
  textSecondary: '#52525B',
  textMuted: '#A1A1AA',
  inputBg: '#F4F4F5',
  inputBorder: '#E4E4E7',
  primary: '#F97316',
  primaryBg: 'rgba(249, 115, 22, 0.1)',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  separator: '#E4E4E7',
  statusBarStyle: 'dark',
  mapStyle: [], // standard Google/Apple maps light style
};

export const useAppTheme = () => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
  return { colors, isDark, scheme };
};
