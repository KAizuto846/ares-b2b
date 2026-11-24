# OSRM self-hosted — servidor de rutas

Ares usa OSRM (Open Source Routing Machine) para:
1. ETA y polyline del tracking (TrackingService).
2. Orden óptimo de paradas de rutas multi-parada (ConsolidacionService, endpoint `/trip`).

## Instalación (requiere Docker)

```bash
# 1. Descargar el extracto del mapa de tu zona (ejemplo CDMX):
#    https://download.geofabrik.de/americas/mexico.html
mkdir -p ~/osrm-data && cd ~/osrm-data
wget https://download.geofabrik.de/americas/mexico/ciudad-de-mexico-latest.osm.pbf

# 2. Preprocesar (una vez; perfil auto para calles vehiculares):
docker run -t -v "$PWD:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua --threads 4 /data/ciudad-de-mexico-latest.osm.pbf
docker run -t -v "$PWD:/data" osrm/osrm-backend osrm-partition /data/ciudad-de-mexico-latest.osm.pbf
docker run -t -v "$PWD:/data" osrm/osrm-backend osrm-customize /data/ciudad-de-mexico-latest.osm.pbf

# 3. Levantar el servidor (queda en 127.0.0.1:5000):
docker run -d --name osrm \
  -v "$PWD:/data" -p 127.0.0.1:5000:5000 \
  osrm/osrm-backend osrm-routed --algorithm mld --max-table-size 1000 /data/ciudad-de-mexico-latest.osm.pbf

# 4. Verificar:
curl "http://127.0.0.1:5000/route/v1/driving/-99.13,19.43;-99.15,19.44?overview=false"
```

## Configuración

- `.env` del backend: `OSRM_URL=http://127.0.0.1:5000`
- Si el servidor local no responde, `TrackingService` cae al servidor público
  (`router.project-osrm.org`) automáticamente: la app nunca deja de funcionar.
- Sin Docker en el host: queda funcionando con el servidor público (usado solo
  para ETA/rutas; sin restricciones de cuota relevantes al volumen actual).

## Referencia del endpoint que usa la consolidación

`POST {OSRM_URL}/trip/v1/driving/{lng1},{lat1};{lng2},{lat2};...?source=first&roundtrip=false`
Devuelve `waypoints[].trip_index` con el orden óptimo de visita de las paradas.
