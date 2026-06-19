import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Visit } from "../types";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

type Props = {
  visits: Visit[];
  className?: string;
};

function pickPin(visit: Visit) {
  if (visit.checkOutLocation) {
    return visit.checkOutLocation;
  }
  if (visit.checkInLocation) {
    return visit.checkInLocation;
  }
  return null;
}

export function VisitsMap({ visits, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      return;
    }
    if (!containerRef.current || mapRef.current) {
      return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-7.5898, 33.5731],
      zoom: 5,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const points = visits
      .map((visit) => ({ visit, location: pickPin(visit) }))
      .filter((entry): entry is { visit: Visit; location: { lat: number; lng: number } } => Boolean(entry.location));

    points.forEach(({ visit, location }) => {
      const popup = new mapboxgl.Popup({ offset: 12 }).setHTML(
        `<div style="font-family:inherit;font-size:12px;line-height:1.4">
           <div style="font-weight:700">${visit.clientName}</div>
           <div style="color:#555">${visit.objective || "Visite"}</div>
           <div style="color:#555;margin-top:4px">${visit.scheduledDate} ${visit.startTime}</div>
         </div>`,
      );
      const marker = new mapboxgl.Marker({ color: visit.status === "completed" ? "#2e7d5b" : "#f59e0b" })
        .setLngLat([location.lng, location.lat])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
    });

    if (points.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      points.forEach(({ location }) => bounds.extend([location.lng, location.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 600 });
    }
  }, [visits]);

  useEffect(() => () => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={className}>
        <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-center text-sm text-secondary">
          Mapbox non configuré. Définissez VITE_MAPBOX_TOKEN pour afficher la carte.
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className={className} style={{ minHeight: 380 }} />;
}
