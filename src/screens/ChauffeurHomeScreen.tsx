import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Vibration,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { io as SocketIOClient } from 'socket.io-client';
import api, { API_URL } from '../services/api';
import { getAccessToken } from '../services/security';
import { Ionicons } from '@expo/vector-icons';

interface ChauffeurHomeScreenProps {
  user: any;
  onLogout: () => void;
}

type ChauffeurTab = 'trip' | 'scan' | 'passengers' | 'incident';

export default function ChauffeurHomeScreen({ user, onLogout }: ChauffeurHomeScreenProps) {
  const [activeTab, setActiveTab] = useState<ChauffeurTab>('trip');
  
  // Trip Selection States
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<any | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  
  // Active Trip States
  const [tripActive, setTripActive] = useState(false);
  const [loadingStart, setLoadingStart] = useState(false);
  
  // Scanner States
  const [hasPermission, requestPermission] = useCameraPermissions();
  const [scannedResult, setScannedResult] = useState<{ success: boolean; message: string; name: string } | null>(null);
  const [scanningActive, setScanningActive] = useState(true);
  
  // Passenger Counting
  const [boardedCount, setBoardedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(25); // Simulé pour l'MVP
  const [boardedPassengers, setBoardedPassengers] = useState<any[]>([]);

  // References
  const socketRef = useRef<any>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  // 1. Charger véhicules et trajets
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [resVehicles, resRoutes] = await Promise.all([
          api.get('/api/vehicles'),
          api.get('/api/routes'),
        ]);
        setVehicles(resVehicles.data);
        setRoutes(resRoutes.data);
        
        if (resVehicles.data.length > 0) setSelectedVehicle(resVehicles.data[0]);
        if (resRoutes.data.length > 0) setSelectedRoute(resRoutes.data[0]);
        
        setLoadingConfig(false);
      } catch (err) {
        console.error('Erreur de chargement configuration:', err);
        setLoadingConfig(false);
      }
    };
    fetchConfig();
  }, []);

  // Avis de consentement explicite de géolocalisation (Exigence Prominent Disclosure de Google Play)
  const showLocationDisclosure = (): Promise<boolean> => {
    return new Promise((resolve) => {
      Alert.alert(
        "Suivi de la géolocalisation",
        "BabiTrack collecte les données de localisation de votre appareil pour permettre aux usagers (parents d'élèves et collaborateurs d'entreprise) de suivre la position exacte du car sur la carte en temps réel.\n\nCette collecte s'effectue au premier plan et en arrière-plan (même lorsque l'application est fermée ou inutilisée) uniquement pendant la durée d'un trajet de transport actif.",
        [
          {
            text: "Refuser",
            onPress: () => resolve(false),
            style: "destructive"
          },
          {
            text: "Accepter et continuer",
            onPress: () => resolve(true)
          }
        ],
        { cancelable: false }
      );
    });
  };

  // 2. Émission GPS en tâche de fond lors d'un trajet actif
  const startGpsTracking = async (socket: any) => {
    try {
      const userConsented = await showLocationDisclosure();
      if (!userConsented) {
        Alert.alert('Action requise', 'Vous devez accepter l\'utilisation de la géolocalisation pour pouvoir démarrer le trajet.');
        return false;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'La permission d\'accès à la géolocalisation est requise pour le suivi du car.');
        return false;
      }

      // Émission de la position toutes les 10 secondes
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000, // 10 secondes
          distanceInterval: 10, // 10 mètres
        },
        (location) => {
          const payload = {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            speed: location.coords.speed || 0, // vitesse en m/s
            vehicleId: selectedVehicle.id,
            timestamp: new Date(location.timestamp).toISOString(),
          };
          console.log('[GPS] Émission de position:', payload);
          socket.emit('driver:location', payload);
        }
      );
      
      locationSubRef.current = sub;
      return true;
    } catch (err) {
      console.error('Erreur GPS tracking:', err);
      return false;
    }
  };

  // 3. Démarrer le trajet
  const handleStartTrip = async () => {
    if (!selectedVehicle || !selectedRoute) {
      Alert.alert('Configuration manquante', 'Veuillez sélectionner un véhicule et un trajet.');
      return;
    }

    setLoadingStart(true);

    try {
      // Obtenir le token
      const token = await getAccessToken();

      // Connecter le WebSocket
      const socket = SocketIOClient(API_URL, {
        auth: { token },
        transports: ['websocket'],
      });

      socketRef.current = socket;

      socket.on('connect', async () => {
        console.log('[Socket Chauffeur] Connecté au serveur');
        
        // Rejoindre le trajet
        socket.emit('driver:join_trip', {
          vehicleId: selectedVehicle.id,
          routeId: selectedRoute.id,
          tripType: selectedRoute.type,
        });

        // Lancer la géolocalisation
        const gpsStarted = await startGpsTracking(socket);
        if (gpsStarted) {
          setTripActive(true);
        } else {
          socket.disconnect();
        }
        setLoadingStart(false);
      });

      socket.on('connect_error', (err) => {
        console.error('Socket Connection Error:', err);
        Alert.alert('Erreur', 'Impossible de se connecter au serveur temps réel.');
        setLoadingStart(false);
      });

    } catch (err) {
      console.error(err);
      setLoadingStart(false);
    }
  };

  // 4. Arrêter le trajet
  const handleStopTrip = async () => {
    // Désactiver le GPS
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }

    // Informer le backend du changement de statut
    try {
      await api.patch(`/api/vehicles/${selectedVehicle.id}/status`, { statut: 'HORS_SERVICE' });
    } catch (err) {
      console.error(err);
    }

    // Déconnecter le socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setTripActive(false);
    Alert.alert('Trajet Terminé', 'Le trajet a été clôturé avec succès.');
  };

  // 5. Gérer le scan de code QR
  const handleBarcodeScanned = async (event: { data: string }) => {
    if (!scanningActive || !selectedVehicle) return;
    
    setScanningActive(false); // Bloquer le scan temporairement
    Vibration.vibrate(100);

    try {
      // Envoyer le token QR au serveur pour validation
      const res = await api.post('/api/trips/scan', {
        qrToken: event.data,
        vehicleId: selectedVehicle.id,
      });

      const data = res.data;

      if (data.success) {
        // Validation réussie (GREEN)
        Vibration.vibrate([0, 200]);
        setScannedResult({
          success: true,
          message: 'Accès autorisé',
          name: `${data.user.prenom} ${data.user.nom}`,
        });
        setBoardedPassengers((prev) => {
          const exists = prev.some((p) => p.id === data.user.id);
          if (exists) {
            return prev;
          }
          setBoardedCount((c) => c + 1);
          return [data.user, ...prev];
        });
      } else {
        // Validation échouée (RED)
        Vibration.vibrate([0, 500, 100, 500]);
        setScannedResult({
          success: false,
          message: data.message || 'Accès refusé',
          name: data.user ? `${data.user.prenom} ${data.user.nom}` : 'Utilisateur Inconnu',
        });
      }
    } catch (error) {
      console.error(error);
      setScannedResult({
        success: false,
        message: 'Erreur de connexion serveur',
        name: 'Veuillez réessayer',
      });
    }

    // Relancer le scanner après 3 secondes
    setTimeout(() => {
      setScannedResult(null);
      setScanningActive(true);
    }, 3000);
  };

  // 6. Signaler un incident
  const handleReportIncident = async (type: string, severity: string, message: string) => {
    if (!selectedVehicle) return;
    
    try {
      await api.post('/api/notifications/send', {
        title: `Incident : ${type}`,
        message,
        type,
        severity,
        audience: 'TOUS',
      });

      // Mettre à jour le statut du véhicule
      await api.patch(`/api/vehicles/${selectedVehicle.id}/status`, { statut: type });

      Alert.alert('Incident Signalé', `L'alerte de type "${type}" a été diffusée à tous les usagers.`);
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de signaler l\'incident.');
    }
  };

  // Rendu de l'onglet Trip
  const renderTripTab = () => {
    if (loadingConfig) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#F97316" />
          <Text style={styles.loadingText}>Chargement de la configuration...</Text>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>Préparation du Trajet</Text>
        
        <View style={styles.card}>
          <Text style={styles.label}>Véhicule assigné</Text>
          <View style={styles.selectContainer}>
            {vehicles.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[
                  styles.selectItem,
                  selectedVehicle?.id === v.id && styles.selectItemActive,
                  tripActive && styles.selectItemDisabled,
                ]}
                onPress={() => !tripActive && setSelectedVehicle(v)}
                disabled={tripActive}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons
                    name="bus-outline"
                    size={16}
                    color={selectedVehicle?.id === v.id ? '#FFFFFF' : '#94A3B8'}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.selectText, selectedVehicle?.id === v.id && styles.selectTextActive]}>
                    {v.immatriculation} ({v.capacite} places)
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Sélectionner l'itinéraire</Text>
          <View style={styles.selectContainer}>
            {routes.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[
                  styles.selectItem,
                  selectedRoute?.id === r.id && styles.selectItemActive,
                  tripActive && styles.selectItemDisabled,
                ]}
                onPress={() => !tripActive && setSelectedRoute(r)}
                disabled={tripActive}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons
                    name="map-outline"
                    size={16}
                    color={selectedRoute?.id === r.id ? '#FFFFFF' : '#94A3B8'}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.selectText, selectedRoute?.id === r.id && styles.selectTextActive]}>
                    {r.nom} ({r.type === 'MATIN' ? 'MATIN' : 'SOIR'})
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.actionContainer}>
          {!tripActive ? (
            <TouchableOpacity
              style={[styles.startButton, loadingStart && styles.buttonDisabled]}
              onPress={handleStartTrip}
              disabled={loadingStart}
            >
              {loadingStart ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="play-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.buttonText}>Démarrer le trajet</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <View>
              <View style={styles.activeTripIndicator}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="radio-button-on" size={14} color="#22C55E" style={{ marginRight: 8 }} />
                  <Text style={styles.activeTripIndicatorText}>
                    Trajet actif — Émission GPS en cours...
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.stopButton} onPress={handleStopTrip}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="stop-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.buttonText}>Terminer le trajet</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  // Rendu de l'onglet Scan
  const renderScanTab = () => {
    if (!tripActive) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={32} color="#64748B" style={{ marginBottom: 12 }} />
          <Text style={styles.emptyText}>Vous devez démarrer le trajet pour activer le scanner.</Text>
        </View>
      );
    }

    if (!hasPermission) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Demande de permission de la caméra...</Text>
        </View>
      );
    }

    if (!hasPermission.granted) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Pas d'accès à la caméra.</Text>
          <TouchableOpacity style={styles.startButton} onPress={requestPermission}>
            <Text style={styles.buttonText}>Autoriser la caméra</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.scannerContainer}>
        {scanningActive ? (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          />
        ) : (
          <View style={styles.scannerLocked}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingText}>Validation en cours...</Text>
          </View>
        )}

        {/* Cadre de ciblage */}
        <View style={styles.overlayFrame} />

        {/* Overlay du résultat du scan */}
        {scannedResult && (
          <View
            style={[
              styles.resultOverlay,
              { backgroundColor: scannedResult.success ? '#22C55E' : '#EF4444' },
            ]}
          >
            <Ionicons
              name={scannedResult.success ? "checkmark-circle-outline" : "close-circle-outline"}
              size={64}
              color="#FFFFFF"
              style={{ marginBottom: 16 }}
            />
            <Text style={styles.resultTitle}>{scannedResult.message}</Text>
            <Text style={styles.resultName}>{scannedResult.name}</Text>
          </View>
        )}
      </View>
    );
  };

  // Rendu de l'onglet Passagers
  const renderPassengersTab = () => {
    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>Contrôle d'Embarquement</Text>

        <View style={styles.statsCard}>
          <View style={styles.statsCardCol}>
            <Text style={styles.statsCardLabel}>INSCRITS</Text>
            <Text style={styles.statsCardVal}>{totalCount}</Text>
          </View>
          <View style={styles.statsCardCol}>
            <Text style={styles.statsCardLabel}>EMBARQUÉS</Text>
            <Text style={[styles.statsCardVal, { color: '#22C55E' }]}>{boardedCount}</Text>
          </View>
          <View style={styles.statsCardCol}>
            <Text style={styles.statsCardLabel}>ABSENTS</Text>
            <Text style={[styles.statsCardVal, { color: '#EF4444' }]}>
              {Math.max(0, totalCount - boardedCount)}
            </Text>
          </View>
        </View>

        <Text style={styles.label}>Liste des passagers à bord</Text>
        <FlatList
          data={boardedPassengers}
          keyExtractor={(item, idx) => item.id + idx}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <View style={styles.passengerRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="person-outline" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
                <Text style={styles.passengerName}>
                  {item.prenom} {item.nom}
                </Text>
              </View>
              <Text style={styles.passengerPhone}>{item.telephone}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Aucun passager enregistré pour le moment.</Text>
          }
        />
      </View>
    );
  };

  // Rendu de l'onglet Incidents
  const renderIncidentTab = () => {
    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>Signaler un Incident</Text>
        <Text style={styles.subtitle}>
          Signalez immédiatement les pannes ou les retards majeurs. Une alerte push sera instantanément transmise à tous les usagers concernés.
        </Text>

        <View style={styles.incidentButtonsContainer}>
          <TouchableOpacity
            style={[styles.incidentBtn, { backgroundColor: '#EF4444' }]}
            onPress={() =>
              handleReportIncident(
                'PANNE',
                'HIGH',
                'Votre car est tombé en panne. Un car de remplacement a été déployé.'
              )
            }
          >
            <Ionicons name="construct" size={24} color="#FFFFFF" style={{ marginRight: 16 }} />
            <Text style={styles.incidentBtnText}>Signaler une Panne</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.incidentBtn, { backgroundColor: '#F59E0B' }]}
            onPress={() =>
              handleReportIncident(
                'RETARD',
                'MEDIUM',
                'Retard estimé à 20 minutes en raison d\'embouteillages exceptionnels sur le trajet.'
              )
            }
          >
            <Ionicons name="time" size={24} color="#FFFFFF" style={{ marginRight: 16 }} />
            <Text style={styles.incidentBtnText}>Signaler un Retard (Trafic)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.incidentBtn, { backgroundColor: '#3B82F6' }]}
            onPress={() =>
              handleReportIncident(
                'ANNULATION',
                'HIGH',
                'Exceptionnellement, le service est annulé ce soir sur cette ligne.'
              )
            }
          >
            <Ionicons name="ban" size={24} color="#FFFFFF" style={{ marginRight: 16 }} />
            <Text style={styles.incidentBtnText}>Signaler une Annulation</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.welcomeText}>Chauffeur,</Text>
            <Text style={styles.userName}>{user.prenom} {user.nom}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="log-out-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
              <Text style={styles.logoutBtnText}>Déconnexion</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Content area */}
        <View style={styles.content}>
          {activeTab === 'trip' && renderTripTab()}
          {activeTab === 'scan' && renderScanTab()}
          {activeTab === 'passengers' && renderPassengersTab()}
          {activeTab === 'incident' && renderIncidentTab()}
        </View>
      </SafeAreaView>

      {/* Bottom Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'trip' && styles.tabItemActive]}
          onPress={() => setActiveTab('trip')}
        >
          <Ionicons
            name={activeTab === 'trip' ? "navigate" : "navigate-outline"}
            size={22}
            color={activeTab === 'trip' ? '#F97316' : '#64748B'}
            style={{ marginBottom: 2 }}
          />
          <Text style={[styles.tabLabel, activeTab === 'trip' && styles.tabLabelActive]}>Trajet</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'scan' && styles.tabItemActive]}
          onPress={() => setActiveTab('scan')}
        >
          <Ionicons
            name={activeTab === 'scan' ? "qr-code" : "qr-code-outline"}
            size={22}
            color={activeTab === 'scan' ? '#F97316' : '#64748B'}
            style={{ marginBottom: 2 }}
          />
          <Text style={[styles.tabLabel, activeTab === 'scan' && styles.tabLabelActive]}>Scanner</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'passengers' && styles.tabItemActive]}
          onPress={() => setActiveTab('passengers')}
        >
          <Ionicons
            name={activeTab === 'passengers' ? "people" : "people-outline"}
            size={22}
            color={activeTab === 'passengers' ? '#F97316' : '#64748B'}
            style={{ marginBottom: 2 }}
          />
          <Text style={[styles.tabLabel, activeTab === 'passengers' && styles.tabLabelActive]}>Passagers</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'incident' && styles.tabItemActive]}
          onPress={() => setActiveTab('incident')}
        >
          <Ionicons
            name={activeTab === 'incident' ? "alert-circle" : "alert-circle-outline"}
            size={22}
            color={activeTab === 'incident' ? '#F97316' : '#64748B'}
            style={{ marginBottom: 2 }}
          />
          <Text style={[styles.tabLabel, activeTab === 'incident' && styles.tabLabelActive]}>Incident</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    height: 70,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: '#27272a',
  },
  welcomeText: {
    color: '#A1A1AA',
    fontSize: 14,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  logoutBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#121212',
  },
  logoutBtnText: {
    color: '#A1A1AA',
    fontWeight: '600',
    fontSize: 12,
  },
  content: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    color: '#A1A1AA',
    marginTop: 12,
    fontSize: 16,
  },
  tabContent: {
    flex: 1,
    padding: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#A1A1AA',
    lineHeight: 22,
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E4E4E7',
    marginBottom: 10,
    marginTop: 12,
  },
  selectContainer: {
    marginBottom: 16,
  },
  selectItem: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    marginVertical: 4,
  },
  selectItemActive: {
    borderColor: '#F97316',
    borderWidth: 2,
  },
  selectItemDisabled: {
    opacity: 0.5,
  },
  selectText: {
    color: '#A1A1AA',
    fontSize: 14,
    fontWeight: '600',
  },
  selectTextActive: {
    color: '#FFFFFF',
  },
  actionContainer: {
    marginTop: 30,
  },
  startButton: {
    backgroundColor: '#F97316',
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  stopButton: {
    backgroundColor: '#EF4444',
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  activeTripIndicator: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  activeTripIndicatorText: {
    color: '#DCFCE7', // Green 100
    fontWeight: '700',
    fontSize: 14,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scannerLocked: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayFrame: {
    position: 'absolute',
    top: '25%',
    left: '12.5%',
    width: '75%',
    height: '40%',
    borderWidth: 2,
    borderColor: '#F97316',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  resultOverlay: {
    position: 'absolute',
    top: '25%',
    left: '12.5%',
    width: '75%',
    height: '40%',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  resultTextIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  resultName: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 8,
    fontWeight: '600',
    textAlign: 'center',
  },
  statsCard: {
    backgroundColor: '#121212',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statsCardCol: {
    flex: 1,
    alignItems: 'center',
  },
  statsCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#71717A',
  },
  statsCardVal: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 6,
  },
  listContainer: {
    paddingBottom: 20,
  },
  passengerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#27272a',
  },
  passengerName: {
    color: '#E4E4E7',
    fontSize: 15,
    fontWeight: '600',
  },
  passengerPhone: {
    color: '#71717A',
    fontSize: 14,
  },
  emptyText: {
    color: '#71717A',
    textAlign: 'center',
    fontSize: 15,
    marginTop: 40,
  },
  incidentButtonsContainer: {
    width: '100%',
  },
  incidentBtn: {
    height: 70,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  incidentBtnIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  incidentBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  tabBar: {
    height: Platform.OS === 'ios' ? 88 : 70,
    flexDirection: 'row',
    backgroundColor: '#121212',
    borderTopWidth: 1,
    borderColor: '#27272a',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabItemActive: {
    borderTopWidth: 3,
    borderTopColor: '#F97316',
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  tabLabel: {
    color: '#71717A',
    fontSize: 11,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#F97316', // Orange 500
  },
});
