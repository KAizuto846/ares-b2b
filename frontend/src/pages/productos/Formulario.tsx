import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, InputHTMLAttributes } from 'react'
import { useParams } from 'react-router-dom'
import { apiCatalogo, urlFoto } from '../../lib/api-catalogo'
import type { Categoria, ErrorCatalogo, EntradaProducto } from '../../lib/api-catalogo'
import { money } from '../../lib/format'
import { Skeleton } from '../../components/UI'
import Icon from '../../components/Icon'
import { useNavegar, useSesion } from '../../store/session'

type Campos = {
  nombre: string
  categoria_id: string
  descripcion: string
  unidad_venta: string
  contenido: string
  precio_base: string
  iva_tasa: string
  peso_kg: string
  volumen_m3: string
  stock: string
  cantidad_minima: string
  multiplo_venta: string
}

type Banderas = { perecedero: boolean; requiere_frio: boolean; inflamable: boolean; restringido: boolean; activo: boolean }
type FilaEscala = { desde: string; precio: string }

const CAMPOS_INICIALES: Campos = {
  nombre: '',
  categoria_id: '',
  descripcion: '',
  unidad_venta: '',
  contenido: '',
  precio_base: '',
  iva_tasa: '16',
  peso_kg: '',
  volumen_m3: '',
  stock: '0',
  cantidad_minima: '1',
  multiplo_venta: '1',
}

const BANDERAS_INICIALES: Banderas = {
  perecedero: false,
  requiere_frio: false,
  inflamable: false,
  restringido: false,
  activo: true,
}

const num = (valor: string) => {
  const limpio = String(valor ?? '').trim().replace(/\s/g, '').replace(',', '.')
  return limpio === '' ? Number.NaN : Number(limpio)
}

const entero = (valor: string) => {
  const n = num(valor)
  return Number.isFinite(n) ? Math.trunc(n) : Number.NaN
}

/** Valida en el cliente con los mismos límites que ProductoService. */
function validar(campos: Campos, filas: FilaEscala[]): Record<string, string> {
  const e: Record<string, string> = {}

  if (campos.nombre.trim() === '') e.nombre = 'Escribe el nombre del producto.'
  else if (campos.nombre.trim().length > 160) e.nombre = 'El nombre no puede pasar de 160 caracteres.'

  if (campos.categoria_id === '') e.categoria_id = 'Elige una categoría.'

  if (campos.unidad_venta.trim() === '') e.unidad_venta = 'Indica cómo se vende: caja, pieza, costal…'
  else if (campos.unidad_venta.trim().length > 30) e.unidad_venta = 'Máximo 30 caracteres.'

  if (campos.contenido.trim() === '') e.contenido = 'Indica qué lleva cada unidad de venta.'
  else if (campos.contenido.trim().length > 60) e.contenido = 'Máximo 60 caracteres.'

  const precio = num(campos.precio_base)
  if (!Number.isFinite(precio) || precio <= 0) e.precio_base = 'El precio debe ser mayor que cero.'

  const iva = num(campos.iva_tasa)
  if (!Number.isFinite(iva) || iva < 0 || iva > 100) e.iva_tasa = 'El IVA va entre 0 y 100.'

  const peso = num(campos.peso_kg)
  if (!Number.isFinite(peso) || peso <= 0) e.peso_kg = 'El peso en kg debe ser mayor que cero.'

  const volumen = num(campos.volumen_m3)
  if (!Number.isFinite(volumen) || volumen <= 0) e.volumen_m3 = 'El volumen en m³ debe ser mayor que cero.'

  const stock = entero(campos.stock)
  if (!Number.isFinite(stock) || stock < 0) e.stock = 'El stock no puede ser negativo.'

  const minimo = entero(campos.cantidad_minima)
  if (!Number.isFinite(minimo) || minimo < 1) e.cantidad_minima = 'La cantidad mínima es al menos 1.'

  const multiplo = entero(campos.multiplo_venta)
  if (!Number.isFinite(multiplo) || multiplo < 1) e.multiplo_venta = 'El múltiplo de venta es al menos 1.'

  if (!e.cantidad_minima && !e.multiplo_venta && multiplo > 1 && minimo % multiplo !== 0) {
    e.cantidad_minima = `La cantidad mínima debe ser múltiplo de ${multiplo}.`
  }

  // Escalas: se capturan de menor a mayor y el precio tiene que bajar.
  const tramos: { desde: number; precio: number; indice: number }[] = []

  filas.forEach((fila, indice) => {
    const vacia = fila.desde.trim() === '' && fila.precio.trim() === ''
    if (vacia) return

    const desde = entero(fila.desde)
    const precioTramo = num(fila.precio)

    if (!Number.isFinite(desde) || desde < 1) {
      e.escalas = `Escala ${indice + 1}: la cantidad «desde» debe ser al menos 1.`
      return
    }

    if (!Number.isFinite(precioTramo) || precioTramo <= 0) {
      e.escalas = `Escala ${indice + 1}: escribe un precio mayor que cero.`
      return
    }

    tramos.push({ desde, precio: precioTramo, indice })
  })

  if (!e.escalas && tramos.length > 0) {
    if (Number.isFinite(precio) && tramos[0].precio >= precio) {
      e.escalas = 'El precio de la primera escala debe ser menor que el precio base.'
    }

    for (let i = 1; i < tramos.length && !e.escalas; i++) {
      if (tramos[i].desde <= tramos[i - 1].desde) {
        e.escalas = 'Las escalas deben ir de menor a mayor cantidad, sin repetir el «desde».'
      } else if (tramos[i].precio >= tramos[i - 1].precio) {
        e.escalas = 'El precio debe bajar al subir el volumen en cada escala.'
      }
    }
  }

  return e
}

async function comprimirImagen(archivo: File): Promise<string> {
  const bitmap = await createImageBitmap(archivo)
  const lado = 1200
  const factor = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * factor))
  canvas.height = Math.max(1, Math.round(bitmap.height * factor))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  if (typeof bitmap.close === 'function') bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

export default function ProductoFormulario() {
  const { uuid } = useParams<{ uuid: string }>()
  const esNuevo = !uuid
  const navegar = useNavegar()
  const { aviso } = useSesion()

  const [categorias, setCategorias] = useState<Categoria[] | null>(null)
  const [campos, setCampos] = useState<Campos>(CAMPOS_INICIALES)
  const [banderas, setBanderas] = useState<Banderas>(BANDERAS_INICIALES)
  const [filas, setFilas] = useState<FilaEscala[]>([])
  const [fotoActual, setFotoActual] = useState<string | null>(null)
  const [fotoNueva, setFotoNueva] = useState<string | null>(null)
  const [quitarFoto, setQuitarFoto] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const tope = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let vivo = true

    const tareas: Promise<void>[] = [
      apiCatalogo.categorias().then((r) => {
        if (vivo) setCategorias(r.categorias)
      }),
    ]

    if (uuid) {
      tareas.push(
        apiCatalogo.detalle(uuid).then((r) => {
          if (!vivo) return
          const p = r.producto
          setCampos({
            nombre: p.nombre,
            categoria_id: String(p.categoria_id),
            descripcion: p.descripcion ?? '',
            unidad_venta: p.unidad_venta,
            contenido: p.contenido,
            precio_base: String(p.precio_base),
            iva_tasa: String(p.iva_tasa),
            peso_kg: String(p.peso_kg),
            volumen_m3: String(p.volumen_m3),
            stock: String(p.stock),
            cantidad_minima: String(p.cantidad_minima),
            multiplo_venta: String(p.multiplo_venta),
          })
          setBanderas({
            perecedero: p.perecedero,
            requiere_frio: p.requiere_frio,
            inflamable: p.inflamable,
            restringido: p.restringido,
            activo: p.activo,
          })
          setFilas(p.escalas.map((tramo) => ({ desde: String(tramo.desde), precio: String(tramo.precio) })))
          setFotoActual(p.foto ? `${urlFoto(p.uuid)}?v=${Date.parse(p.updated_at.replace(' ', 'T')) || 0}` : null)
        }),
      )
    }

    Promise.all(tareas)
      .catch((e) => {
        if (vivo) setErrorGeneral((e as Error).message)
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })

    return () => {
      vivo = false
    }
  }, [uuid])

  useEffect(() => {
    if (!cargando && window.location.hash === '#escalas') {
      window.setTimeout(() => tope.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    }
  }, [cargando])

  const vista = fotoNueva ?? (quitarFoto ? null : fotoActual)
  const precio = num(campos.precio_base)
  const iva = num(campos.iva_tasa)
  const conIva = useMemo(() => (Number.isFinite(precio) && Number.isFinite(iva) ? precio * (1 + iva / 100) : Number.NaN), [precio, iva])

  const poner = (clave: keyof Campos, valor: string) => {
    setCampos((previo) => ({ ...previo, [clave]: valor }))
    setErrores((previo) => {
      if (!previo[clave]) return previo
      const copia = { ...previo }
      delete copia[clave]
      return copia
    })
  }

  const ponerFila = (indice: number, clave: keyof FilaEscala, valor: string) => {
    setFilas((previas) => previas.map((fila, i) => (i === indice ? { ...fila, [clave]: valor } : fila)))
    setErrores((previo) => {
      if (!previo.escalas) return previo
      const copia = { ...previo }
      delete copia.escalas
      return copia
    })
  }

  const elegirFoto = async (archivo: File | undefined) => {
    if (!archivo) return
    if (!/^image\/(png|jpeg|webp)$/.test(archivo.type)) {
      setErrores((previo) => ({ ...previo, imagen: 'Solo se aceptan fotos PNG, JPG o WebP.' }))
      return
    }
    try {
      const dataUrl = await comprimirImagen(archivo)
      setFotoNueva(dataUrl)
      setQuitarFoto(false)
      setErrores((previo) => {
        const copia = { ...previo }
        delete copia.imagen
        return copia
      })
    } catch (e) {
      setErrores((previo) => ({ ...previo, imagen: (e as Error).message }))
    }
  }

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault()
    setErrorGeneral('')

    const encontrados = validar(campos, filas)
    if (Object.keys(encontrados).length > 0) {
      setErrores(encontrados)
      setErrorGeneral('Revisa los campos marcados.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const limpios = filas
      .filter((fila) => fila.desde.trim() !== '' || fila.precio.trim() !== '')
      .map((fila) => ({ desde: entero(fila.desde), precio: num(fila.precio) }))
      .sort((a, b) => a.desde - b.desde)

    const datos: EntradaProducto = {
      nombre: campos.nombre.trim(),
      categoria_id: Number(campos.categoria_id),
      descripcion: campos.descripcion.trim(),
      unidad_venta: campos.unidad_venta.trim(),
      contenido: campos.contenido.trim(),
      precio_base: num(campos.precio_base),
      iva_tasa: num(campos.iva_tasa),
      peso_kg: num(campos.peso_kg),
      volumen_m3: num(campos.volumen_m3),
      stock: entero(campos.stock),
      cantidad_minima: entero(campos.cantidad_minima),
      multiplo_venta: entero(campos.multiplo_venta),
      ...banderas,
      escalas: limpios,
    }

    if (fotoNueva) datos.imagen = fotoNueva
    if (quitarFoto && !fotoNueva) datos.quitar_imagen = true

    setGuardando(true)
    try {
      if (esNuevo) await apiCatalogo.crear(datos)
      else await apiCatalogo.actualizar(uuid as string, datos)
      aviso(esNuevo ? 'Producto creado.' : 'Producto actualizado.')
      navegar('/productos')
    } catch (e) {
      const fallo = e as ErrorCatalogo
      if (fallo.campos && Object.keys(fallo.campos).length > 0) setErrores(fallo.campos)
      setErrorGeneral(fallo.message)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setGuardando(false)
    }
  }

  const campo = (clave: keyof Campos, etiqueta: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="campo">
      <span>{etiqueta}</span>
      <input
        {...props}
        value={campos[clave]}
        aria-invalid={errores[clave] ? true : undefined}
        onChange={(e) => poner(clave, e.target.value)}
      />
      {errores[clave] && <em className="error-campo">{errores[clave]}</em>}
    </label>
  )

  if (cargando) {
    return (
      <div className="cat-pagina">
        <div className="card">
          <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
            <Skeleton h={44} />
            <Skeleton h={44} />
            <Skeleton h={44} />
            <Skeleton h={130} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <form className="cat-pagina" onSubmit={guardar} noValidate>
      <header className="pagina-cab">
        <div className="rise">
          <h1>{esNuevo ? 'Nuevo producto' : 'Editar producto'}</h1>
          <p>
            Precio, peso y volumen son obligatorios: sin ellos no se puede calcular el envío. Las escalas por volumen son
            opcionales.
          </p>
        </div>
        <div className="cat-acciones-cab rise" style={{ ['--i' as string]: 1 }}>
          <button type="button" className="btn btn--claro" onClick={() => navegar('/productos')} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar producto'}
          </button>
        </div>
      </header>

      {errorGeneral && <div className="aviso aviso--error">{errorGeneral}</div>}

      <div className="cat-form">
        <section className="card rise" style={{ ['--i' as string]: 2 }}>
          <div className="card__cab">
            <Icon name="productos" size={18} />
            <h2>Datos del producto</h2>
          </div>
          <div className="card__cuerpo cat-grid">
            <div className="cat-grid__ancho">
              {campo('nombre', 'Nombre del producto', { type: 'text', maxLength: 160, placeholder: 'Café molido 1 kg', autoComplete: 'off' })}
            </div>

            <label className="campo">
              <span>Categoría</span>
              <select
                value={campos.categoria_id}
                aria-invalid={errores.categoria_id ? true : undefined}
                onChange={(e) => poner('categoria_id', e.target.value)}
              >
                <option value="">Elige una categoría…</option>
                {(categorias ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.restringida ? ' (restringida)' : ''}
                  </option>
                ))}
              </select>
              {errores.categoria_id && <em className="error-campo">{errores.categoria_id}</em>}
              <small className="cat-ayuda">Las categorías restringidas dejan el producto como borrador hasta revisión.</small>
            </label>

            {campo('unidad_venta', 'Unidad de venta', { type: 'text', maxLength: 30, placeholder: 'Caja' })}
            {campo('contenido', 'Contenido', { type: 'text', maxLength: 60, placeholder: '12 piezas' })}

            <div className="cat-grid__ancho">
              <label className="campo">
                <span>Descripción</span>
                <textarea
                  rows={3}
                  value={campos.descripcion}
                  placeholder="Opcional, pero ayuda a vender"
                  onChange={(e) => poner('descripcion', e.target.value)}
                />
              </label>
            </div>

            {campo('peso_kg', 'Peso por unidad (kg)', { type: 'number', step: '0.001', min: '0.001', placeholder: '6.5', inputMode: 'decimal' })}
            {campo('volumen_m3', 'Volumen por unidad (m³)', { type: 'number', step: '0.0001', min: '0.0001', placeholder: '0.02', inputMode: 'decimal' })}
          </div>
        </section>

        <section className="card rise" style={{ ['--i' as string]: 3 }}>
          <div className="card__cab">
            <Icon name="dinero" size={18} />
            <h2>Precio</h2>
          </div>
          <div className="card__cuerpo cat-grid">
            {campo('precio_base', 'Precio base sin IVA', { type: 'number', step: '0.01', min: '0.01', placeholder: '120.00', inputMode: 'decimal' })}
            {campo('iva_tasa', 'IVA (%)', { type: 'number', step: '0.01', min: '0', max: '100', inputMode: 'decimal' })}
            <div className="cat-grid__ancho cat-nota">
              {Number.isFinite(conIva) ? (
                <>
                  El comercio verá <strong>{money(conIva)}</strong> con IVA por unidad de venta.
                </>
              ) : (
                'Escribe el precio para ver cuánto pagará el comercio con IVA.'
              )}
            </div>
          </div>
        </section>

        <section className="card rise" style={{ ['--i' as string]: 4 }}>
          <div className="card__cab">
            <Icon name="inventario" size={18} />
            <h2>Stock y venta</h2>
          </div>
          <div className="card__cuerpo cat-grid">
            {campo('stock', esNuevo ? 'Stock inicial' : 'Stock disponible', {
              type: 'number',
              step: '1',
              min: '0',
              inputMode: 'numeric',
            })}
            {campo('cantidad_minima', 'Cantidad mínima', { type: 'number', step: '1', min: '1', inputMode: 'numeric' })}
            {campo('multiplo_venta', 'Múltiplo de venta', { type: 'number', step: '1', min: '1', inputMode: 'numeric' })}
            <div className="cat-grid__ancho cat-nota">
              {esNuevo
                ? 'El stock inicial entra como movimiento de inventario, no se escribe a mano en la tabla.'
                : 'Si cambias el stock se registra un ajuste con tu usuario y el motivo «Ajuste desde el catálogo».'}
            </div>
          </div>
        </section>

        <section className="card rise" style={{ ['--i' as string]: 5 }} ref={tope} id="escalas">
          <div className="card__cab">
            <Icon name="etiqueta" size={18} />
            <h2>Escalas por volumen</h2>
          </div>
          <div className="card__cuerpo">
            <p className="cat-ayuda" style={{ marginTop: 0 }}>
              Opcional. Cada tramo empieza en una cantidad y baja el precio; el «hasta» se calcula solo: termina donde empieza el
              siguiente tramo. El último tramo no tiene tope.
            </p>

            {filas.length === 0 && <p className="cat-vacio-escalas">Sin escalas: todos pagan el precio base.</p>}

            {filas.map((fila, indice) => {
              const siguiente = filas[indice + 1]
              const hasta = siguiente && entero(siguiente.desde) > 1 ? String(entero(siguiente.desde) - 1) : ''
              return (
                <div className="cat-escala-fila" key={indice}>
                  <label className="campo">
                    <span>Desde (piezas)</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={fila.desde}
                      onChange={(e) => ponerFila(indice, 'desde', e.target.value)}
                      placeholder="10"
                    />
                  </label>
                  <label className="campo">
                    <span>Precio c/u sin IVA</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={fila.precio}
                      onChange={(e) => ponerFila(indice, 'precio', e.target.value)}
                      placeholder="110.00"
                    />
                  </label>
                  <div className="campo cat-escala-hasta">
                    <span>Hasta</span>
                    <div className="cat-escala-tope">{hasta === '' ? 'en adelante' : `${hasta}`}</div>
                  </div>
                  <button
                    type="button"
                    className="icono-btn cat-borrar"
                    aria-label={`Quitar escala ${indice + 1}`}
                    title="Quitar tramo"
                    onClick={() => setFilas((previas) => previas.filter((_, i) => i !== indice))}
                  >
                    <Icon name="basura" size={17} />
                  </button>
                </div>
              )
            })}

            {errores.escalas && <em className="error-campo">{errores.escalas}</em>}

            <div className="cat-escala-acciones">
              <button type="button" className="btn btn--claro btn--mini" onClick={() => setFilas((previas) => [...previas, { desde: '', precio: '' }])}>
                <Icon name="mas" size={15} /> Añadir tramo
              </button>
            </div>
          </div>
        </section>

        <section className="card rise" style={{ ['--i' as string]: 6 }}>
          <div className="card__cab">
            <Icon name="subir" size={18} />
            <h2>Foto del producto</h2>
          </div>
          <div className="card__cuerpo cat-foto-campo">
            <div className={`cat-foto-preview${vista ? '' : ' cat-foto-preview--vacia'}`}>
              {vista ? <img src={vista} alt="Foto del producto" /> : <Icon name="productos" size={26} />}
            </div>
            <div className="cat-foto-texto">
              <div className="cat-foto-botones">
                <label className="btn btn--claro btn--mini cat-foto-btn">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      void elegirFoto(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <Icon name="subir" size={15} /> {vista ? 'Cambiar foto' : 'Elegir foto'}
                </label>
                {vista && (
                  <button
                    type="button"
                    className="btn btn--fantasma btn--mini"
                    onClick={() => {
                      setFotoNueva(null)
                      setQuitarFoto(true)
                    }}
                  >
                    Quitar
                  </button>
                )}
              </div>
              <p className="cat-ayuda">PNG, JPG o WebP. Se reduce a 1 200 px y se guarda con el producto.</p>
              {errores.imagen && <em className="error-campo">{errores.imagen}</em>}
            </div>
          </div>
        </section>

        <section className="card rise" style={{ ['--i' as string]: 7 }}>
          <div className="card__cab">
            <Icon name="etiqueta" size={18} />
            <h2>Características</h2>
          </div>
          <div className="card__cuerpo">
            <div className="cat-checks">
              {(
                [
                  ['perecedero', 'Perecedero'],
                  ['requiere_frio', 'Requiere frío'],
                  ['inflamable', 'Inflamable'],
                  ['restringido', 'Restringido'],
                  ['activo', 'Publicar en el catálogo'],
                ] as [keyof Banderas, string][]
              ).map(([clave, texto]) => (
                <label key={clave} className="cat-check">
                  <input
                    type="checkbox"
                    checked={banderas[clave]}
                    onChange={(e) => setBanderas((previas) => ({ ...previas, [clave]: e.target.checked }))}
                  />
                  {texto}
                </label>
              ))}
            </div>
            <p className="cat-ayuda">
              Sin KYC aprobado, o en una categoría restringida, el producto se guarda como borrador aunque marques «Publicar».
            </p>
          </div>
        </section>
      </div>

      <div className="cat-pie-form">
        <button type="submit" className="btn" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar producto'}
        </button>
        <button type="button" className="btn btn--claro" onClick={() => navegar('/productos')} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
