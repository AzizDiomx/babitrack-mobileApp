export interface RouteStop {
  id?: string;
  nom: string;
  latitude: number;
  longitude: number;
  ordre: number;
}

export interface RouteSegment {
  fromStopName: string;
  toStopName: string;
  distanceMeters: number;
  durationSeconds: number;
  formattedDistance: string;
  formattedDuration: string;
}

export interface RealRoadRouteResult {
  polyline: { latitude: number; longitude: number }[];
  segments: RouteSegment[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  formattedTotalDistance: string;
  formattedTotalDuration: string;
  stops: RouteStop[];
}

/**
 * Calcul de la distance à vol d'oiseau (Haversine) en mètres entre 2 coordonnées
 */
export function getHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Rayon de la Terre en mètres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Génère des points lissés directs entre deux arrêts en cas d'anomalie de sens unique OSRM
 */
function interpolateDirectRoad(from: RouteStop, to: RouteStop): { latitude: number; longitude: number }[] {
  const points = [];
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    points.push({
      latitude: from.latitude + (to.latitude - from.latitude) * ratio,
      longitude: from.longitude + (to.longitude - from.longitude) * ratio,
    });
  }
  return points;
}

/**
 * Calcul d'itinéraire routier optimisé tronçon par tronçon (Direct Segment Routing)
 * Élimine les détours indirects, demi-tours parasites et boucles superflues entre deux relais.
 */
export async function fetchRealRoadRoute(stops: RouteStop[]): Promise<RealRoadRouteResult> {
  if (!stops || stops.length < 2) {
    const defaultCoords = (stops || []).map(s => ({ latitude: s.latitude, longitude: s.longitude }));
    return {
      polyline: defaultCoords,
      segments: [],
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      formattedTotalDistance: '0 km',
      formattedTotalDuration: '0 min',
      stops: stops || [],
    };
  }

  // 1. Trier les points d'arrêt selon leur ordre chronologique
  const sortedStops = [...stops].sort((a, b) => a.ordre - b.ordre);

  const fullPolyline: { latitude: number; longitude: number }[] = [];
  const segments: RouteSegment[] = [];
  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;

  // 2. Calculer chaque tronçon individuellement entre 2 points relais consécutifs (A ➔ B)
  for (let i = 0; i < sortedStops.length - 1; i++) {
    const fromStop = sortedStops[i];
    const toStop = sortedStops[i + 1];

    const straightDist = getHaversineDistanceMeters(
      fromStop.latitude,
      fromStop.longitude,
      toStop.latitude,
      toStop.longitude
    );

    let segPolyline: { latitude: number; longitude: number }[] = [];
    let segDist = straightDist;
    let segDur = Math.round(straightDist / 11); // Vitesse ~40 km/h

    try {
      // URL OSRM directe avec paramètre continue_straight=true et tolérance de snap à 500m
      const url = `https://router.project-osrm.org/route/v1/driving/${fromStop.longitude},${fromStop.latitude};${toStop.longitude},${toStop.latitude}?overview=full&geometries=geojson&continue_straight=true&radiuses=500;500`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const osrmDist = route.distance || straightDist;
        const ratio = osrmDist / (straightDist || 1);

        // Anti-Détour Guard : Si OSRM fait faire un détour supérieur à 3.2x la distance directe (demi-tour en sens unique),
        // l'algorithme utilise la trajectoire lissée directe entre les deux arrêts.
        if (ratio <= 3.2 || straightDist < 150) {
          segPolyline = route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({
            latitude: lat,
            longitude: lng,
          }));
          segDist = osrmDist;
          segDur = route.duration || segDur;
        } else {
          segPolyline = interpolateDirectRoad(fromStop, toStop);
        }
      } else {
        segPolyline = interpolateDirectRoad(fromStop, toStop);
      }
    } catch (err) {
      segPolyline = interpolateDirectRoad(fromStop, toStop);
    }

    // Assemblage continu de la polyligne globale
    if (fullPolyline.length > 0 && segPolyline.length > 0) {
      fullPolyline.push(...segPolyline.slice(1));
    } else {
      fullPolyline.push(...segPolyline);
    }

    totalDistanceMeters += segDist;
    totalDurationSeconds += segDur;

    segments.push({
      fromStopName: fromStop.nom,
      toStopName: toStop.nom,
      distanceMeters: segDist,
      durationSeconds: segDur,
      formattedDistance: formatDistance(segDist),
      formattedDuration: formatDuration(segDur),
    });
  }

  return {
    polyline: fullPolyline,
    segments,
    totalDistanceMeters,
    totalDurationSeconds,
    formattedTotalDistance: formatDistance(totalDistanceMeters),
    formattedTotalDuration: formatDuration(totalDurationSeconds),
    stops: sortedStops,
  };
}

/**
 * Fallback direct
 */
function fallbackDirectPoints(sortedStops: RouteStop[]): RealRoadRouteResult {
  const polyline = sortedStops.map(s => ({ latitude: s.latitude, longitude: s.longitude }));
  return {
    polyline,
    segments: [],
    totalDistanceMeters: 0,
    totalDurationSeconds: 0,
    formattedTotalDistance: '-- km',
    formattedTotalDuration: '-- min',
    stops: sortedStops,
  };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h${remainingMins > 0 ? `${remainingMins}m` : ''}`;
}
