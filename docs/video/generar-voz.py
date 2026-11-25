#!/usr/bin/env python3
"""Sintetiza cada línea del guion a WAV con Supertonic 3 (voz local)."""
import os, sys
from supertonic import TTS
import numpy as np
import soundfile as sf

VOZ = sys.argv[1] if len(sys.argv) > 1 else 'M2'
DIR = os.path.expanduser('~/ares-react/docs/video/voz')
os.makedirs(DIR, exist_ok=True)

LINEAS = [
    # 01 — portada
    'Ares: la plataforma B2B de compras de mayoreo. Proyecto web full stack.',
    # 02 — problema
    'Los comercios de barrio compran a mayoristas por mensajería: precios en fotos, stock que ya no existe y pedidos que se pierden. Ares conecta a los dos lados en una sola plataforma.',
    # 03 — roles
    'Cada cuenta tiene su propio panel: el comercio compra, el mayorista vende y administra sus anuncios, el repartidor entrega, y el administrador supervisa todo.',
    # 04 — catálogo / búsqueda
    'El comercio busca productos cerca de su negocio, compara precios por escala y arma su carrito con montos mínimos por mayorista.',
    # 05 — checkout
    'El checkout reserva el stock, calcula el IVA y confirma el pedido de forma idempotente: dos clics nunca generan dos pedidos.',
    # 06 — mayorista
    'El mayorista ve sus pedidos en curso al momento, administra su catálogo con precios por volumen, y publica anuncios pagados que aparecen en el inicio de los comercios.',
    # 07 — POS
    'Incluye un punto de venta con cobro por tarjeta: validación de número, vencimiento y código de seguridad en el propio navegador.',
    # 08 — reparto
    'El repartidor recibe sus entregas asignadas con el mapa de la ruta y confirma cada entrega.',
    # 09 — técnica
    'Bajo el capó: React con TypeScript, API REST en PHP con cien por ciento de consultas preparadas, MySQL, autenticación con tokens JWT, y pruebas automatizadas que corren en cada cambio con integración continua.',
    # 10 — cierre
    'Ares: del catálogo del mayorista al pedido del comercio y la entrega en puerta. Proyecto web full stack.',
]

tts = TTS(auto_download=True)
style = tts.get_voice_style(voice_name=VOZ)

for i, texto in enumerate(LINEAS, 1):
    wav, dur = tts.synthesize(texto, voice_style=style, lang='es')
    d = float(np.asarray(dur).mean()) if not isinstance(dur, float) else dur
    # recortar el silencio que Supertonic agrega al inicio/fin (~0.6 s c/u)
    audio = np.asarray(wav).squeeze()
    if audio.ndim > 1:
        audio = audio.mean(axis=0)
    umbral = 0.01
    idx = np.where(np.abs(audio) > umbral)[0]
    sr = 24000
    if len(idx):
        entrada = max(0, idx[0] - int(0.06 * sr))
        salida = min(len(audio), idx[-1] + int(0.12 * sr))
        audio = audio[entrada:salida]
    sf.write(f'{DIR}/{i:02d}.wav', audio, sr)
    print(f'{i:02d}: {len(audio)/sr:.1f}s | {texto[:50]}')
