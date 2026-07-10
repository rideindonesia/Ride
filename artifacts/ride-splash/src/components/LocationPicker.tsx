import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456];
const DEFAULT_ZOOM = 12;

interface LocationPickerProps {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [map, lat, lng]);
  return null;
}

export default function LocationPicker({ lat, lng, onChange }: LocationPickerProps) {
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const hasPin = !isNaN(parsedLat) && !isNaN(parsedLng);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const setPin = (la: number, ln: number) => {
    onChange(la.toFixed(6), ln.toFixed(6));
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setGeoError("Perangkat tidak mendukung lokasi otomatis.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setPin(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setGeoError("Gagal mengambil lokasi. Izinkan akses lokasi atau ketuk peta.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div>
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1.5px solid #d0dce8" }}>
        <MapContainer
          center={hasPin ? [parsedLat, parsedLng] : DEFAULT_CENTER}
          zoom={hasPin ? 16 : DEFAULT_ZOOM}
          style={{ height: 220, width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={setPin} />
          {hasPin && (
            <>
              <Marker position={[parsedLat, parsedLng]} />
              <Recenter lat={parsedLat} lng={parsedLng} />
            </>
          )}
        </MapContainer>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          style={{
            padding: "10px 14px", borderRadius: 10, border: "none",
            background: "#1a3a5c", color: "#fff", fontWeight: 600, fontSize: 13,
            fontFamily: "'Inter', sans-serif", cursor: locating ? "wait" : "pointer", flexShrink: 0,
          }}
        >
          {locating ? "Mencari lokasi..." : "Gunakan lokasi saya"}
        </button>
        <span style={{ fontSize: 12, color: "#7a8a9a", fontFamily: "'Inter', sans-serif", lineHeight: 1.4 }}>
          Ketuk peta untuk menandai titik pas warung Anda.
        </span>
      </div>

      {geoError && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#c0392b", fontFamily: "'Inter', sans-serif" }}>{geoError}</div>
      )}

      {hasPin ? (
        <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(26,122,106,0.08)", fontSize: 13, fontWeight: 600, color: "#1a7a6a", fontFamily: "'Inter', sans-serif" }}>
          ✓ Lokasi ditandai: {parsedLat.toFixed(5)}, {parsedLng.toFixed(5)}
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 12, color: "#7a8a9a", fontFamily: "'Inter', sans-serif" }}>
          Belum ada titik lokasi. Ketuk peta atau gunakan lokasi saya.
        </div>
      )}
    </div>
  );
}
