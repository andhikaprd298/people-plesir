import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';

export interface MapPoint {
  id: string; lat: number; lng: number; label: string; sub?: string; kind?: 'stop' | 'meal' | 'home' | 'dest'; n?: number; approximate?: boolean; href?: string;
}

const BANYUMAS: [number, number] = [-7.38, 109.24];

function icon(p: MapPoint) {
  const cls = p.kind === 'meal' ? 'sun' : p.kind === 'home' ? 'home' : '';
  const text = p.kind === 'home' ? '' : p.n != null ? String(p.n) : '';
  return L.divIcon({
    className: '',
    html: `<div class="pin-marker ${cls}"><span>${text}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -30],
  });
}

function Fit({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) { map.setView(BANYUMAS, 10); return; }
    if (points.length === 1) { map.setView([points[0].lat, points[0].lng], 13); return; }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [36, 36], maxZoom: 14 });
  }, [points, map]);
  return null;
}

/** Peta OpenStreetMap lewat Leaflet. Jika ubin peta tidak dapat dimuat (offline), penanda tetap tampil di atas latar polos. */
export function MapView({ points, route = false, tall = false, label = 'Peta lokasi', onSelect }: { points: MapPoint[]; route?: boolean; tall?: boolean; label?: string; onSelect?: (id: string) => void }) {
  const line = useMemo(() => (route ? points.map((p) => [p.lat, p.lng] as [number, number]) : []), [points, route]);
  return (
    <div className={`map-box ${tall ? 'tall' : ''}`} role="region" aria-label={label}>
      <MapContainer center={BANYUMAS} zoom={10} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {route && line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#245C45', weight: 4, dashArray: '2 9', lineCap: 'round' }} />}
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icon(p)} eventHandlers={onSelect ? { click: () => onSelect(p.id) } : undefined}>
            <Popup>
              <strong>{p.label}</strong>
              {p.sub && <div>{p.sub}</div>}
              {p.approximate && <div style={{ color: '#8a5a00', fontWeight: 700 }}>Lokasi perkiraan, perlu konfirmasi</div>}
              {p.href && <a href={p.href}>Lihat detail</a>}
            </Popup>
          </Marker>
        ))}
        <Fit points={points} />
      </MapContainer>
    </div>
  );
}

export const gmapsDirections = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
