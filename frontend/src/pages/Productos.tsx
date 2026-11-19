import { useCallback, useEffect, useRef, useState } from 'react'
import { urlApp } from '../lib/api'
import { apiCatalogo } from '../lib/api-catalogo'
import type { ListaCatalogo, ProductoCatalogo } from '../lib/api-catalogo'
import { money, money0 } from '../lib/format'
import { Skeleton, Vacio } from '../components/UI'
import Icon from '../components/Icon'
import { useNavegar, useSesion } from '../store/session'

const FILTROS = [
  { valor: '', texto: 'Todos' },
  { valor: 'activos', texto: 'Publicados' },
  { valor: 'agotados', texto: 'Agotados' },
  { valor: 'borrador', texto: 'Borradores' },
]

const POR_PAGINA = 12

const tonoStock = (stock: number) => (stock === 0 ? 'var(--rojo)' : stock < 10 ? '#a56a12' : 'inherit')

const VACIO: ListaCatalogo = {
  productos: [],
  total: 0,
  page: 1,
  paginas: 1,
  per_page: POR_PAGINA,
  conteos: { total: 0, activos: 0, agotados: 0, borrador: 0, unidades: 0, valor_inventario: 0 },
  puede_publicar: true,
}

export default function Productos() {
  const [datos, setDatos] = useState<ListaCatalogo | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('')
  const [page, setPage] = useState(1)
  const [porBorrar, setPorBorrar] = useState<ProductoCatalogo | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const navegar = useNavegar()
  const { aviso } = useSesion()
  const turno = useRef(0)

  const cargar = useCallback(() => {
    const mio = ++turno.current
    setError('')
    apiCatalogo
      .lista({ q, estado, page, per_page: POR_PAGINA })
      .then((r) => {
        if (mio === turno.current) setDatos(r)
      })
      .catch((e) => {
        if (mio !== turno.current) return
        setError((e as Error).message)
        setDatos(VACIO)
      })
  }, [q, estado, page])

  useEffect(() => {
    const t = window.setTimeout(cargar, q ? 250 : 0)
    return () => window.clearTimeout(t)
  }, [cargar, q])

  const borrar = async () => {
    if (!porBorrar) return
    setOcupado(true)
    try {
      await apiCatalogo.borrar(porBorrar.uuid)
      aviso(`«${porBorrar.nombre}» se dio de baja.`)
      const ultimaFila = datos?.productos.length === 1 && page > 1
      setPorBorrar(null)
      if (ultimaFila) setPage(page - 1)
      else cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  const conteos = datos?.conteos
  const totalFiltrado = datos?.total ?? 0

  return (
    <div className="cat-pagina">
      <header className="pagina-cab">
        <div className="rise">
          <h1>Mi catálogo</h1>
          <p>Precios, presentación y existencias de tus productos. Captura uno por uno o carga todo tu inventario desde un CSV.</p>
        </div>
        <div className="cat-acciones-cab rise" style={{ ['--i' as string]: 1 }}>
          <button type="button" className="btn btn--claro" onClick={() => navegar('/productos/importar')}>
            <Icon name="subir" size={17} /> Importar CSV
          </button>
          <button type="button" className="btn" onClick={() => navegar('/productos/nuevo')}>
            <Icon name="mas" size={17} /> Nuevo producto
          </button>
        </div>
      </header>

      {datos && !datos.puede_publicar && (
        <div className="aviso aviso--info rise">
          Tu cuenta todavía no está verificada. Puedes capturar productos, pero se guardan como borrador hasta que el KYC esté aprobado.
        </div>
      )}

      <div className="kpis rise" style={{ ['--i' as string]: 2 }}>
        <div className="kpi">
          <div className="kpi__valor">{conteos ? conteos.activos : '—'}</div>
          <div className="kpi__etiqueta">Publicados</div>
          <div className="kpi__nota">Visibles para los comercios</div>
        </div>
        <div className={`kpi${conteos && conteos.agotados > 0 ? ' kpi--alerta' : ''}`}>
          <div className="kpi__valor">{conteos ? conteos.agotados : '—'}</div>
          <div className="kpi__etiqueta">Agotados</div>
          <div className="kpi__nota">Sin piezas disponibles</div>
        </div>
        <div className="kpi">
          <div className="kpi__valor">{conteos ? conteos.borrador : '—'}</div>
          <div className="kpi__etiqueta">Borradores</div>
          <div className="kpi__nota">Aún no publicados</div>
        </div>
        <div className="kpi">
          <div className="kpi__valor">{conteos ? money0(conteos.valor_inventario) : '—'}</div>
          <div className="kpi__etiqueta">Valor de inventario</div>
          <div className="kpi__nota">{conteos ? `${conteos.unidades} piezas sin IVA` : 'Precio × existencia'}</div>
        </div>
      </div>

      <div className="card card--plana rise" style={{ ['--i' as string]: 3 }}>
        <div className="card__cuerpo cat-barra">
          <div className="buscador__campo">
            <Icon name="buscar" size={18} />
            <input
              type="search"
              placeholder="Buscar por nombre o descripción…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
              aria-label="Buscar productos"
            />
          </div>
          <div className="cat-filtros" role="group" aria-label="Filtrar por estado">
            {FILTROS.map((f) => {
              const cuenta = f.valor === 'activos' ? conteos?.activos : f.valor === 'agotados' ? conteos?.agotados : f.valor === 'borrador' ? conteos?.borrador : undefined
              return (
                <button
                  key={f.valor || 'todos'}
                  type="button"
                  className={`cat-chip${estado === f.valor ? ' cat-chip--activo' : ''}`}
                  aria-pressed={estado === f.valor}
                  onClick={() => {
                    setEstado(f.valor)
                    setPage(1)
                  }}
                >
                  {f.texto}
                  {cuenta !== undefined && <span className="cat-chip__n">{cuenta}</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {error && <div className="aviso aviso--error">{error}</div>}

      {!datos ? (
        <div className="card">
          <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
            <Skeleton h={46} />
            <Skeleton h={46} />
            <Skeleton h={46} />
            <Skeleton h={46} />
          </div>
        </div>
      ) : datos.productos.length === 0 ? (
        <div className="card rise" style={{ ['--i' as string]: 4 }}>
          {q || estado ? (
            <Vacio
              titulo="Ningún producto coincide"
              texto="Prueba con otro nombre o quita el filtro de estado."
              accion={
                <button
                  type="button"
                  className="btn btn--claro"
                  onClick={() => {
                    setQ('')
                    setEstado('')
                    setPage(1)
                  }}
                >
                  Limpiar filtros
                </button>
              }
            />
          ) : (
            <Vacio
              titulo="Tu catálogo está vacío"
              texto="Da de alta tu primer producto o importa tu inventario desde un archivo CSV."
              accion={
                <button type="button" className="btn" onClick={() => navegar('/productos/nuevo')}>
                  Nuevo producto
                </button>
              }
            />
          )}
        </div>
      ) : (
        <>
          <div className="card rise" style={{ ['--i' as string]: 4, overflow: 'hidden' }}>
            <div className="tabla-scroll">
              <table className="tabla cat-tabla">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Foto</th>
                    <th>Producto</th>
                    <th>Precio</th>
                    <th>Presentación</th>
                    <th>Stock</th>
                    <th>Estado</th>
                    <th style={{ width: 236 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.productos.map((p) => {
                    const chip = !p.activo
                      ? { texto: 'Borrador', tono: 'neutro' }
                      : p.stock === 0
                        ? { texto: 'Agotado', tono: 'alerta' }
                        : { texto: 'Publicado', tono: 'ok' }
                    return (
                      <tr key={p.uuid}>
                        <td>
                          <div className={`prod-foto${p.foto ? '' : ' prod-foto--vacia'}`}>
                            {p.foto ? <img src={urlApp(p.foto)} alt={`Foto de ${p.nombre}`} loading="lazy" /> : <Icon name="productos" size={17} />}
                          </div>
                        </td>
                        <td>
                          <div className="prod-nombre">{p.nombre}</div>
                          <div className="prod-sub">
                            {p.categoria}
                            {p.escalas > 0 ? ` · ${p.escalas} escala${p.escalas === 1 ? '' : 's'}` : ''}
                          </div>
                        </td>
                        <td className="num">
                          <strong>{money(p.precio_base)}</strong>
                          <div className="prod-sub">sin IVA</div>
                        </td>
                        <td>
                          <div>{p.unidad_venta}</div>
                          <div className="prod-sub">de {p.contenido}</div>
                        </td>
                        <td className="num" style={{ color: tonoStock(p.stock), fontWeight: 650 }}>
                          {p.stock}
                          {p.multiplo_venta > 1 && <div className="prod-sub">múltiplo {p.multiplo_venta}</div>}
                        </td>
                        <td>
                          <span className={`chip chip--${chip.tono}`}>{chip.texto}</span>
                        </td>
                        <td>
                          <div className="cat-acciones">
                            <button type="button" className="btn btn--claro btn--mini" onClick={() => navegar(`/productos/${p.uuid}`)}>
                              <Icon name="editar" size={15} /> Editar
                            </button>
                            <button type="button" className="btn btn--claro btn--mini" onClick={() => navegar(`/productos/${p.uuid}#escalas`)}>
                              <Icon name="dinero" size={15} /> Escalas
                            </button>
                            <button
                              type="button"
                              className="icono-btn cat-borrar"
                              aria-label={`Dar de baja ${p.nombre}`}
                              title="Dar de baja"
                              onClick={() => setPorBorrar(p)}
                            >
                              <Icon name="basura" size={17} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {datos.paginas > 1 && (
            <div className="cat-paginador">
              <button type="button" className="btn btn--claro btn--mini" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span>
                Página {datos.page} de {datos.paginas} · {totalFiltrado} producto{totalFiltrado === 1 ? '' : 's'}
              </span>
              <button type="button" className="btn btn--claro btn--mini" disabled={page >= datos.paginas} onClick={() => setPage(page + 1)}>
                Siguiente
              </button>
            </div>
          )}
        </>
      )}

      {porBorrar && (
        <div className="cat-modal" role="dialog" aria-modal="true" aria-labelledby="cat-modal-titulo">
          <div className="cat-modal__velo" onClick={() => !ocupado && setPorBorrar(null)} />
          <div className="cat-modal__caja">
            <h2 id="cat-modal-titulo">¿Dar de baja «{porBorrar.nombre}»?</h2>
            <p>
              Dejará de aparecer en tu catálogo y los comercios no podrán pedirlo. El historial de ventas se conserva; el stock
              queda congelado en {porBorrar.stock} pieza{porBorrar.stock === 1 ? '' : 's'}.
            </p>
            <div className="cat-modal__acciones">
              <button type="button" className="btn btn--claro" onClick={() => setPorBorrar(null)} disabled={ocupado}>
                Cancelar
              </button>
              <button type="button" className="btn btn--peligro" onClick={borrar} disabled={ocupado}>
                {ocupado ? 'Dando de baja…' : 'Dar de baja'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
