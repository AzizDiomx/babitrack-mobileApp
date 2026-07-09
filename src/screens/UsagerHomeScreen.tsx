import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Vibration,
  FlatList,
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  Platform,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Linking,
  StatusBar,
  useColorScheme,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import QRCode from 'react-native-qrcode-svg';
import { io as SocketIOClient } from 'socket.io-client';
import api, { API_URL } from '../services/api';
import { getAccessToken, saveUser } from '../services/security';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface UsagerHomeScreenProps {
  user: any;
  onLogout: () => void;
}

type TabType = 'map' | 'qr' | 'notifications';

export default function UsagerHomeScreen({ user, onLogout }: UsagerHomeScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>('map');
  
  // Profil States
  const [currentUser, setCurrentUser] = useState<any>(user);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editPrenom, setEditPrenom] = useState(user.prenom || '');
  const [editNom, setEditNom] = useState(user.nom || '');
  const [editTelephone, setEditTelephone] = useState(user.telephone || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const handleSaveProfile = async () => {
    if (!editPrenom || !editNom || !editTelephone) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs.");
      return;
    }
    setIsSavingProfile(true);
    try {
      const res = await api.patch('/api/users/me/profile', {
        prenom: editPrenom,
        nom: editNom,
        telephone: editTelephone
      });
      
      const updatedUser = res.data;
      setCurrentUser(updatedUser);
      await saveUser(updatedUser);
      Alert.alert("Profil mis à jour", "Vos modifications ont été enregistrées avec succès.");
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.error || "Impossible de sauvegarder les modifications.";
      Alert.alert("Erreur", errMsg);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleOpenPrivacy = () => {
    Linking.openURL('https://babitrack-frontoffice-two.vercel.app/privacy').catch(() => {
      Alert.alert("Erreur", "Impossible d'ouvrir la page de confidentialité.");
    });
  };

  const handleShowHelp = () => {
    Alert.alert(
      "Centre d'aide & Support",
      "Besoin d'assistance avec l'application BabiTrack ?\n\nContactez notre support technique :\n📧 Email : support@babitrack.com\n📞 Téléphone : +225 07 00 00 00 00",
      [{ text: "Fermer" }]
    );
  };

  const handleDeleteAccountInModal = () => {
    setIsProfileModalOpen(false);
    handleDeleteAccount();
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Supprimer le compte ?",
      "Cette action est définitive. Toutes vos données d'abonnements, de scans et d'identité seront définitivement supprimées.",
      [
        {
          text: "Annuler",
          style: "cancel"
        },
        {
          text: "Supprimer mon compte",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete('/api/users/me/delete');
              Alert.alert("Compte supprimé", "Votre compte a été supprimé avec succès.");
              onLogout();
            } catch (err: any) {
              console.error(err);
              let msg = "Impossible de supprimer votre compte. Veuillez réessayer.";
              if (err.response?.status === 404) {
                msg = "Erreur (404) : Cette fonctionnalité nécessite le déploiement de la mise à jour sur le serveur Render. Si vous testez localement, connectez l'application à votre IP de dev.";
              }
              Alert.alert("Erreur de suppression", msg);
            }
          }
        }
      ]
    );
  };

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = useMemo(() => getStyles(isDark), [isDark]);
  
  // States pour la carte
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<any | null>(null);
  const [busLocation, setBusLocation] = useState<any | null>(null);
  const [busStats, setBusStats] = useState<any>({ eta: null, stopProchain: 'En attente...' });
  const [busStatus, setBusStatus] = useState<string>('HORS_SERVICE');
  const [streetPoints, setStreetPoints] = useState<any[]>([]);
  const [loadingMap, setLoadingMap] = useState(true);
  const mapRef = useRef<MapView>(null);
  const socketRef = useRef<any>(null);

  // States pour les notifications
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // 1. Charger les trajets de la compagnie
  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const res = await api.get('/api/routes');
        setRoutes(res.data);
        if (res.data.length > 0) {
          setSelectedRoute(res.data[0]); // Sélectionner le premier trajet par défaut
        }
        setLoadingMap(false);
      } catch (err) {
        console.error('Erreur lors du chargement des trajets:', err);
        setLoadingMap(false);
      }
    };
    fetchRoutes();
  }, []);

  // 2. Se connecter en WebSocket pour suivre le véhicule
  useEffect(() => {
    if (!selectedRoute?.vehicleId) return;

    let isMounted = true;
    let socket: any = null;

    const connectSocket = async () => {
      console.log(`[Socket] Connexion pour le véhicule: ${selectedRoute.vehicleId}`);
      if (selectedRoute.vehicle?.statut) {
        setBusStatus(selectedRoute.vehicle.statut);
        if (selectedRoute.vehicle.statut === 'HORS_SERVICE') {
          setBusLocation(null);
          setBusStats({ eta: null, stopProchain: 'En attente...' });
        }
      } else {
        setBusStatus('HORS_SERVICE');
        setBusLocation(null);
        setBusStats({ eta: null, stopProchain: 'En attente...' });
      }
      const token = await getAccessToken();
      if (!isMounted) return;

      socket = SocketIOClient(API_URL, {
        auth: { token },
        transports: ['websocket'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('[Socket] Connecté au serveur');
        if (isMounted) {
          socket.emit('user:subscribe_vehicle', { vehicleId: selectedRoute.vehicleId });
        }
      });

      socket.on('connect_error', (err: any) => {
        console.error('[Socket Usager] Erreur de connexion:', err);
      });

      // Écouter la position du véhicule
      socket.on('vehicle:position', (data: any) => {
        if (!isMounted) return;
        console.log('[Socket] Position reçue:', data);
        setBusLocation({
          latitude: data.lat,
          longitude: data.lng,
          bearing: data.bearing || 0,
          speed: data.speed || 0,
        });
        setBusStats({
          eta: data.eta,
          stopProchain: data.stopProchain,
        });
        setBusStatus('EN_SERVICE');

        // Alerte de proximité : vibration et alerte visuelle si le bus est à moins de 500m de notre arrêt
        if (data.eta !== null && data.eta <= 2 && data.eta > 0) {
          Vibration.vibrate([0, 500, 200, 500]); // Vibrer deux fois
        }
      });

      // Écouter le changement de statut du trajet
      socket.on('trip:status', (data: any) => {
        if (!isMounted) return;
        console.log('[Socket] Statut reçu:', data);
        setBusStatus(data.status);
        if (data.status === 'HORS_SERVICE') {
          setBusLocation(null);
          setBusStats({ eta: null, stopProchain: 'En attente...' });
        }
      });

      // Écouter les alertes push urgentes via WebSocket
      socket.on('notification:push', (data: any) => {
        if (!isMounted) return;
        console.log('[Socket] Notification push reçue:', data);
        setNotifications((prev) => [data, ...prev]);
        Vibration.vibrate(200);
        Alert.alert(`📢 ${data.title}`, data.message);
      });
    };

    connectSocket();

    return () => {
      isMounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        console.log('[Socket] Déconnecté');
        socketRef.current = null;
      }
    };
  }, [selectedRoute]);

  // 2.5. Effet pour calculer le tracé routier réel (OSRM)
  useEffect(() => {
    if (!selectedRoute?.stops || selectedRoute.stops.length < 2) {
      setStreetPoints([]);
      return;
    }

    const fetchStreetRoute = async () => {
      const sortedStops = [...selectedRoute.stops].sort((a: any, b: any) => a.ordre - b.ordre);
      const coordsString = sortedStops
        .map((stop: any) => `${stop.longitude},${stop.latitude}`)
        .join(';');

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const streetCoords = data.routes[0].geometry.coordinates.map(
            ([lng, lat]: [number, number]) => ({
              latitude: lat,
              longitude: lng,
            })
          );
          setStreetPoints(streetCoords);
        } else {
          setStreetPoints(sortedStops.map((s: any) => ({ latitude: s.latitude, longitude: s.longitude })));
        }
      } catch (err) {
        console.error('Erreur OSRM mobile:', err);
        setStreetPoints(sortedStops.map((s: any) => ({ latitude: s.latitude, longitude: s.longitude })));
      }
    };

    fetchStreetRoute();
  }, [selectedRoute]);

  // 3. Charger les notifications historiques
  const fetchNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const res = await api.get('/api/notifications');
      setNotifications(res.data);
    } catch (err) {
      console.error('Erreur lors du chargement des notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'notifications') {
      fetchNotifications();
    }
  }, [activeTab]);

  const centerOnBus = () => {
    if (busLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: busLocation.latitude,
        longitude: busLocation.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }, 1000);
    }
  };

  // Déterminer la couleur du Badge QR en fonction du statut de l'usager
  const getQrColor = () => {
    if (user.statut === 'ACTIF') return '#22C55E'; // Vert 500
    if (user.statut === 'EN_ATTENTE') return '#F59E0B'; // Orange 500
    return '#EF4444'; // Rouge 500
  };

  // Rendu de la carte
  const renderMap = () => {
    if (loadingMap) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#F97316" />
          <Text style={styles.loadingText}>Chargement des trajets...</Text>
        </View>
      );
    }

    const routeStops = selectedRoute?.stops || [];
    const points = routeStops.map((s: any) => ({
      latitude: s.latitude,
      longitude: s.longitude,
    }));

    // Région par défaut centrée sur le trajet ou Abidjan
    const initialRegion = points.length > 0
      ? {
          latitude: points[0].latitude,
          longitude: points[0].longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }
      : {
          latitude: 5.3484,
          longitude: -4.0152,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        };

    return (
      <View style={styles.mapTabContainer}>
        {/* Map View */}
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton
          showsTraffic={true}
          showsBuildings={true}
        >
          {/* Tracé de la polyligne de l'itinéraire */}
          {streetPoints.length > 1 ? (
            <Polyline
              coordinates={streetPoints}
              strokeColor="#F97316" // Orange
              strokeWidth={4}
            />
          ) : points.length > 1 ? (
            <Polyline
              coordinates={points}
              strokeColor="#F97316" // Orange
              strokeWidth={4}
            />
          ) : null}

          {/* Marqueurs pour chaque arrêt */}
          {routeStops.map((stop: any) => (
            <Marker
              key={stop.id}
              coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
              title={stop.nom}
              description={`Ordre de passage : ${stop.ordre}`}
            >
              <View style={styles.stopMarker}>
                <Text style={styles.stopMarkerText}>{stop.ordre}</Text>
              </View>
            </Marker>
          ))}

          {/* Marqueur du Bus en déplacement */}
          {busLocation && (
            <Marker
              coordinate={{ latitude: busLocation.latitude, longitude: busLocation.longitude }}
              title="Mon Car de D'embarquement"
              description={`Vitesse : ${Math.round(busLocation.speed)} km/h`}
              rotation={busLocation.bearing}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.busMarker}>
                <Ionicons name="bus" size={20} color="#FFFFFF" />
              </View>
            </Marker>
          )}
        </MapView>

        {/* Sliding Panel d'informations en bas */}
        <View style={styles.infoPanel}>
          <View style={styles.panelRow}>
            <View>
              <Text style={styles.panelTitle}>Car de D'embarquement</Text>
              <Text style={styles.panelStatus}>
                Statut :{' '}
                <Text
                  style={{
                    color:
                      busStatus === 'EN_SERVICE'
                        ? '#22C55E'
                        : busStatus === 'RETARD'
                        ? '#F59E0B'
                        : '#EF4444',
                    fontWeight: '700',
                  }}
                >
                  {busStatus === 'EN_SERVICE'
                    ? 'EN SERVICE'
                    : busStatus === 'RETARD'
                    ? 'EN RETARD'
                    : 'HORS SERVICE'}
                </Text>
              </Text>
            </View>
            {busLocation && (
              <TouchableOpacity style={styles.centerButton} onPress={centerOnBus}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="locate" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.centerButtonText}>Recentrer</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.separator} />

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>PROCHAIN ARRÊT</Text>
              <Text style={styles.statValue} numberOfLines={1}>
                {busStats.stopProchain}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>TEMPS ESTIMÉ (ETA)</Text>
              <Text style={styles.statValue}>
                {busStats.eta !== null ? `${busStats.eta} min` : '--'}
              </Text>
            </View>
          </View>

          {/* Alerte visuelle de proximité */}
          {busStats.eta !== null && busStats.eta <= 2 && busStats.eta > 0 && (
            <View style={styles.proximityAlert}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="notifications" size={16} color="#FFEDD5" style={{ marginRight: 6 }} />
                <Text style={styles.proximityAlertText}>
                  Le bus approche ! Il est à moins de 500m de l'arrêt.
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  // Rendu du Badge QR
  const renderQr = () => {
    return (
      <View style={styles.qrContainer}>
        <View style={styles.qrCard}>
          <Text style={styles.qrCardTitle}>Badge de Transport</Text>
          <View style={[styles.qrBorder, { borderColor: getQrColor() }]}>
            <QRCode
              value={user.qrToken}
              size={200}
              backgroundColor="#FFFFFF"
              color="#000000"
            />
          </View>

          <View style={[styles.statusBadge, { backgroundColor: getQrColor() }]}>
            <Text style={styles.statusBadgeText}>
              {user.statut === 'ACTIF' ? 'ABONNEMENT ACTIF' : user.statut === 'EN_ATTENTE' ? 'EN ATTENTE' : 'INACTIF'}
            </Text>
          </View>

          <View style={styles.qrDetails}>
            <Text style={styles.qrDetailName}>
              {user.prenom} {user.nom}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Ionicons name="call-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
              <Text style={styles.qrDetailPhone}>{user.telephone}</Text>
            </View>
            <Text style={styles.qrDetailText}>Rôle : Usager Scolaire</Text>
            <Text style={styles.qrDetailText}>
              Compagnie : {user.company?.name || 'SOTRA Scolaire'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // Rendu des notifications
  const renderNotifications = () => {
    const getNotificationColor = (type: string) => {
      switch (type) {
        case 'PANNE':
          return '#EF4444'; // Rouge
        case 'RETARD':
          return '#F59E0B'; // Orange / Ambre
        case 'ANNULATION':
          return '#7C3AED'; // Violet
        case 'CHANGEMENT_ITINERAIRE':
          return '#3B82F6'; // Bleu
        case 'URGENT':
          return '#DC2626'; // Rouge Vif
        default:
          return '#64748B'; // Slate
      }
    };

    return (
      <View style={styles.notificationTabContainer}>
        <Text style={styles.sectionTitle}>Notifications de la Compagnie</Text>
        {loadingNotifications ? (
          <ActivityIndicator size="large" color="#F97316" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item }) => (
              <View style={[styles.notificationCard, { borderLeftColor: getNotificationColor(item.type) }]}>
                <View style={styles.notificationHeader}>
                  <Text style={[styles.notificationType, { color: getNotificationColor(item.type) }]}>
                    {item.type}
                  </Text>
                  <Text style={styles.notificationTime}>
                    {new Date(item.sentAt).toLocaleDateString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text style={styles.notificationTitle}>{item.title}</Text>
                <Text style={styles.notificationMessage}>{item.message}</Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Aucune notification reçue.</Text>
            }
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.welcomeText}>Bonjour,</Text>
            <Text style={styles.userName}>{currentUser.prenom}</Text>
          </View>
          <TouchableOpacity style={styles.profileAvatarBtn} onPress={() => setIsProfileModalOpen(true)}>
            <Text style={styles.profileAvatarBtnText}>
              {((currentUser.prenom?.[0] || '') + (currentUser.nom?.[0] || '')).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Main content */}
        <View style={styles.content}>
          {activeTab === 'map' && renderMap()}
          {activeTab === 'qr' && renderQr()}
          {activeTab === 'notifications' && renderNotifications()}
        </View>
      </SafeAreaView>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'map' && styles.tabItemActive]}
          onPress={() => setActiveTab('map')}
        >
          <Ionicons
            name={activeTab === 'map' ? "map" : "map-outline"}
            size={22}
            color={activeTab === 'map' ? '#F97316' : '#64748B'}
            style={{ marginBottom: 2 }}
          />
          <Text style={[styles.tabLabel, activeTab === 'map' && styles.tabLabelActive]}>Carte</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'qr' && styles.tabItemActive]}
          onPress={() => setActiveTab('qr')}
        >
          <Ionicons
            name={activeTab === 'qr' ? "qr-code" : "qr-code-outline"}
            size={22}
            color={activeTab === 'qr' ? '#F97316' : '#64748B'}
            style={{ marginBottom: 2 }}
          />
          <Text style={[styles.tabLabel, activeTab === 'qr' && styles.tabLabelActive]}>Badge QR</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'notifications' && styles.tabItemActive]}
          onPress={() => setActiveTab('notifications')}
        >
          <Ionicons
            name={activeTab === 'notifications' ? "notifications" : "notifications-outline"}
            size={22}
            color={activeTab === 'notifications' ? '#F97316' : '#64748B'}
            style={{ marginBottom: 2 }}
          />
          <Text style={[styles.tabLabel, activeTab === 'notifications' && styles.tabLabelActive]}>Alertes</Text>
        </TouchableOpacity>
      </View>

      {/* Profile & Settings Modal */}
      <Modal
        visible={isProfileModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsProfileModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mon Compte</Text>
              <TouchableOpacity style={styles.closeModalBtn} onPress={() => setIsProfileModalOpen(false)}>
                <Ionicons name="close" size={24} color={isDark ? "#FFFFFF" : "#09090B"} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              {/* User Identity Display */}
              <View style={styles.profileHeaderCard}>
                <View style={styles.profileAvatarLarge}>
                  <Text style={styles.profileAvatarLargeText}>
                    {((currentUser.prenom?.[0] || '') + (currentUser.nom?.[0] || '')).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.profileNameText}>{currentUser.prenom} {currentUser.nom}</Text>
                <Text style={styles.profileSubText}>{currentUser.telephone}</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>
                    {currentUser.role === 'USAGER' ? 'Usager / Passager' : 'Chauffeur'}
                  </Text>
                </View>
              </View>

              {/* SECTION 1: MODIFIER PROFIL */}
              <View style={styles.settingsSection}>
                <Text style={styles.sectionHeading}>Modifier mon profil</Text>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Prénom</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editPrenom}
                    onChangeText={setEditPrenom}
                    placeholder="Votre prénom"
                    placeholderTextColor="#52525B"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nom</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editNom}
                    onChangeText={setEditNom}
                    placeholder="Votre nom"
                    placeholderTextColor="#52525B"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Téléphone</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editTelephone}
                    onChangeText={setEditTelephone}
                    keyboardType="phone-pad"
                    placeholder="Votre numéro de téléphone"
                    placeholderTextColor="#52525B"
                  />
                </View>

                <TouchableOpacity 
                  style={[styles.saveBtn, isSavingProfile && styles.saveBtnDisabled]}
                  onPress={handleSaveProfile}
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Sauvegarder les modifications</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* SECTION 2: AUTRES OPTIONS */}
              <View style={styles.settingsSection}>
                <Text style={styles.sectionHeading}>Informations & Support</Text>
                
                <TouchableOpacity style={styles.menuRow} onPress={handleOpenPrivacy}>
                  <View style={styles.menuRowLeft}>
                    <Ionicons name="document-text-outline" size={20} color="#F97316" style={{ marginRight: 12 }} />
                    <Text style={styles.menuRowText}>Mentions Légales & Confidentialité</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#71717A" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuRow} onPress={handleShowHelp}>
                  <View style={styles.menuRowLeft}>
                    <Ionicons name="help-circle-outline" size={20} color="#3B82F6" style={{ marginRight: 12 }} />
                    <Text style={styles.menuRowText}>Centre d'aide & Support</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#71717A" />
                </TouchableOpacity>
              </View>

              {/* SECTION 3: ZONE DE DANGER / DECONNEXION */}
              <View style={styles.settingsSection}>
                <TouchableOpacity style={styles.logoutActionBtn} onPress={() => {
                  setIsProfileModalOpen(false);
                  onLogout();
                }} >
                  <Ionicons name="log-out-outline" size={20} color="#A1A1AA" style={{ marginRight: 12 }} />
                  <Text style={styles.logoutActionText}>Se déconnecter</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.deleteActionBtn} onPress={handleDeleteAccountInModal}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" style={{ marginRight: 12 }} />
                  <Text style={styles.deleteActionText}>Supprimer le compte</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.versionText}>BabiTrack v1.0.0 • Tous droits réservés</Text>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#000000' : '#F4F4F5',
  },
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  topBar: {
    height: 70,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: isDark ? '#27272a' : '#E4E4E7',
    backgroundColor: isDark ? '#121212' : '#FFFFFF',
  },
  welcomeText: {
    color: isDark ? '#A1A1AA' : '#71717A',
    fontSize: 14,
  },
  userName: {
    color: isDark ? '#FFFFFF' : '#09090B',
    fontSize: 18,
    fontWeight: '700',
  },
  profileAvatarBtn: {
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: isDark ? '#27272A' : '#E4E4E7',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  profileAvatarBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  logoutBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: isDark ? '#121212' : '#E4E4E7',
  },
  logoutBtnText: {
    color: isDark ? '#A1A1AA' : '#71717A',
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
  },
  loadingText: {
    color: isDark ? '#A1A1AA' : '#71717A',
    marginTop: 12,
    fontSize: 16,
  },
  mapTabContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  stopMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F97316',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopMarkerText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  busMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  busMarkerIcon: {
    fontSize: 18,
  },
  infoPanel: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: isDark ? '#121212' : '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: isDark ? '#27272A' : '#E4E4E7',
  },
  panelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: isDark ? '#FFFFFF' : '#09090B',
  },
  panelStatus: {
    fontSize: 13,
    color: isDark ? '#A1A1AA' : '#71717A',
    marginTop: 4,
  },
  centerButton: {
    backgroundColor: '#F97316',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  centerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: isDark ? '#27272a' : '#E4E4E7',
    marginVertical: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: isDark ? '#71717A' : '#A1A1AA',
    letterSpacing: 0.8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: isDark ? '#FFFFFF' : '#09090B',
    marginTop: 4,
  },
  proximityAlert: {
    backgroundColor: 'rgba(249, 115, 22, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.4)',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  proximityAlertText: {
    color: '#FFEDD5',
    fontSize: 13,
    fontWeight: '600',
  },
  qrContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  qrCard: {
    backgroundColor: isDark ? '#121212' : '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
    borderWidth: 1,
    borderColor: isDark ? '#27272A' : '#E4E4E7',
  },
  qrCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: isDark ? '#FFFFFF' : '#09090B',
    marginBottom: 20,
  },
  qrBorder: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 4,
    marginBottom: 20,
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 30,
    marginBottom: 20,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  qrDetails: {
    alignItems: 'center',
  },
  qrDetailName: {
    fontSize: 22,
    fontWeight: '700',
    color: isDark ? '#FFFFFF' : '#09090B',
  },
  qrDetailPhone: {
    fontSize: 14,
    color: isDark ? '#A1A1AA' : '#71717A',
    marginTop: 4,
  },
  qrDetailText: {
    fontSize: 13,
    color: isDark ? '#71717A' : '#A1A1AA',
    marginTop: 6,
    fontWeight: '500',
  },
  notificationTabContainer: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: isDark ? '#FFFFFF' : '#09090B',
    marginBottom: 16,
  },
  listContainer: {
    paddingBottom: 20,
  },
  notificationCard: {
    backgroundColor: isDark ? '#121212' : '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#F97316',
    borderWidth: 1,
    borderTopColor: isDark ? '#27272A' : '#E4E4E7',
    borderRightColor: isDark ? '#27272A' : '#E4E4E7',
    borderBottomColor: isDark ? '#27272A' : '#E4E4E7',
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  notificationType: {
    color: isDark ? '#A1A1AA' : '#71717A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  notificationTime: {
    color: isDark ? '#71717A' : '#A1A1AA',
    fontSize: 11,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: isDark ? '#FFFFFF' : '#09090B',
    marginBottom: 4,
  },
  notificationMessage: {
    color: isDark ? '#D4D4D8' : '#3F3F46',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyText: {
    color: isDark ? '#71717A' : '#A1A1AA',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
  tabBar: {
    height: Platform.OS === 'ios' ? 88 : 70,
    flexDirection: 'row',
    backgroundColor: isDark ? '#121212' : '#FFFFFF',
    borderTopWidth: 1,
    borderColor: isDark ? '#27272a' : '#E4E4E7',
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
    color: isDark ? '#71717A' : '#A1A1AA',
    fontSize: 11,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#F97316',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: isDark ? '#121212' : '#FFFFFF',
    marginTop: Platform.OS === 'ios' ? 50 : 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: isDark ? '#27272A' : '#E4E4E7',
    overflow: 'hidden',
  },
  modalHeader: {
    height: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderColor: isDark ? '#27272A' : '#E4E4E7',
  },
  modalTitle: {
    color: isDark ? '#FFFFFF' : '#09090B',
    fontSize: 18,
    fontWeight: '800',
  },
  closeModalBtn: {
    padding: 4,
  },
  modalScroll: {
    padding: 24,
    paddingBottom: 60,
  },
  profileHeaderCard: {
    alignItems: 'center',
    marginBottom: 28,
  },
  profileAvatarLarge: {
    height: 80,
    width: 80,
    borderRadius: 40,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: isDark ? '#27272A' : '#E4E4E7',
  },
  profileAvatarLargeText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  profileNameText: {
    color: isDark ? '#FFFFFF' : '#09090B',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  profileSubText: {
    color: isDark ? '#A1A1AA' : '#71717A',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(249, 115, 22, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.3)',
  },
  roleBadgeText: {
    color: '#F97316',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  settingsSection: {
    backgroundColor: isDark ? '#1E1E1F' : '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: isDark ? '#27272A' : '#E4E4E7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionHeading: {
    color: '#F97316',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: isDark ? '#71717A' : '#A1A1AA',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  textInput: {
    height: 48,
    backgroundColor: isDark ? '#121212' : '#F4F4F5',
    borderWidth: 1,
    borderColor: isDark ? '#27272A' : '#E4E4E7',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: isDark ? '#FFFFFF' : '#09090B',
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    height: 48,
    backgroundColor: '#F97316',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  saveBtnDisabled: {
    backgroundColor: '#7C2D12',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#27272A' : '#E4E4E7',
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuRowText: {
    color: isDark ? '#E4E4E7' : '#09090B',
    fontSize: 14,
    fontWeight: '600',
  },
  logoutActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#27272A' : '#E4E4E7',
  },
  logoutActionText: {
    color: isDark ? '#A1A1AA' : '#71717A',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  deleteActionText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  versionText: {
    textAlign: 'center',
    color: '#52525B',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 10,
  },
});

const darkMapStyle = [
  {
    "elementType": "geometry",
    "stylers": [{ "color": "#121212" }]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#a1a1aa" }]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#000000" }]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry.stroke",
    "stylers": [{ "color": "#27272a" }]
  },
  {
    "featureType": "landscape.natural",
    "elementType": "geometry",
    "stylers": [{ "color": "#000000" }]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [{ "color": "#121212" }]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#71717a" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [{ "color": "#000000" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry.stroke",
    "stylers": [{ "color": "#121212" }]
  },
  {
    "featureType": "road",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#71717a" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [{ "color": "#27272a" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry.stroke",
    "stylers": [{ "color": "#000000" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#f8fafc" }]
  },
  {
    "featureType": "transit",
    "elementType": "geometry",
    "stylers": [{ "color": "#121212" }]
  },
  {
    "featureType": "transit.station",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#a1a1aa" }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#000000" }]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#3f3f46" }]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#000000" }]
  }
];
