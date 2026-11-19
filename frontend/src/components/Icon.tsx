const P: Record<string, string> = {
  buscar: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  inicio: 'M4 11.5 12 4l8 7.5M6 10v10h12V10',
  pedidos: 'M6 3h9l4 4v14H6zM15 3v5h4M9 13h7M9 17h5',
  finanzas: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  mensajes: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z',
  carrito: 'M3 4h2l2.4 11.2A1.8 1.8 0 0 0 9.2 16h8.4a1.8 1.8 0 0 0 1.75-1.4L21 8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  perfil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  productos: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9',
  admin: 'M12 3l8 4v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7zM9.5 12l1.8 1.8 3.4-3.6',
  kyc: 'M12 3l8 4v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7zM12 8v4m0 3h.01',
  pos: 'M4 8h16v12H4zM8 8V4h8v4M9 13h6',
  inventario: 'M4 7h16v13H4zM4 7l2-3h12l2 3M9 12h6',
  salir: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h9',
  mas: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  basura: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5',
  cerrar: 'M6 6l12 12M18 6 6 18',
  flecha: 'm9 6 6 6-6 6',
  ok: 'm5 12 4.5 4.5L19 7',
  ubicacion: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Zm0-8.4a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z',
  reloj: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2',
}

export default function Icon({ name, size = 20, stroke = 1.8 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? P.inicio} />
    </svg>
  )
}
