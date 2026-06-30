import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getUser, getAccessToken, hasPin, clearCredentials } from './src/services/security';
import LoginScreen from './src/screens/LoginScreen';
import PinSetupScreen from './src/screens/PinSetupScreen';
import PinAuthScreen from './src/screens/PinAuthScreen';
import UsagerHomeScreen from './src/screens/UsagerHomeScreen';
import ChauffeurHomeScreen from './src/screens/ChauffeurHomeScreen';

type ScreenState = 'LOADING' | 'LOGIN' | 'PIN_SETUP' | 'PIN_AUTH' | 'HOME';

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('LOADING');
  const [user, setUser] = useState<any | null>(null);

  // Vérifier l'état de connexion de l'utilisateur au démarrage
  useEffect(() => {
    const checkAuthState = async () => {
      try {
        const token = await getAccessToken();
        const userData = await getUser();
        const pinSet = await hasPin();

        if (token && userData) {
          setUser(userData);
          if (pinSet) {
            setScreen('PIN_AUTH');
          } else {
            setScreen('PIN_SETUP');
          }
        } else {
          setScreen('LOGIN');
        }
      } catch (error) {
        console.error('Erreur lors du check auth au démarrage:', error);
        setScreen('LOGIN');
      }
    };

    checkAuthState();
  }, []);

  const handleLoginSuccess = (loggedInUser: any, needsPinSetup: boolean) => {
    setUser(loggedInUser);
    if (needsPinSetup) {
      setScreen('PIN_SETUP');
    } else {
      setScreen('HOME');
    }
  };

  const handlePinSetupComplete = () => {
    setScreen('HOME');
  };

  const handlePinAuthSuccess = () => {
    setScreen('HOME');
  };

  const handleLogout = async () => {
    setScreen('LOADING');
    try {
      await clearCredentials();
      setUser(null);
      setScreen('LOGIN');
    } catch (error) {
      console.error('Erreur lors du logout:', error);
      setScreen('LOGIN');
    }
  };

  const renderScreen = () => {
    switch (screen) {
      case 'LOADING':
        return (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#F97316" />
            <Text style={styles.loadingText}>Chargement de BabiTrack...</Text>
          </View>
        );
      case 'LOGIN':
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
      case 'PIN_SETUP':
        return <PinSetupScreen onComplete={handlePinSetupComplete} />;
      case 'PIN_AUTH':
        return (
          <PinAuthScreen
            onAuthSuccess={handlePinAuthSuccess}
            onLogout={handleLogout}
          />
        );
      case 'HOME':
        if (!user) return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
        
        // Router selon le rôle de l'utilisateur
        if (user.role === 'USAGER') {
          return <UsagerHomeScreen user={user} onLogout={handleLogout} />;
        } else {
          // CHAUFFEUR ou ADMIN
          return <ChauffeurHomeScreen user={user} onLogout={handleLogout} />;
        }
      default:
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {renderScreen()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#A1A1AA',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '600',
  },
});
