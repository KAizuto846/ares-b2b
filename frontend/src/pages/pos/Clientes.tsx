import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { Skeleton, Vacio } from '../../components/UI'
import { apiPos } from '../../lib/api-pos'
import type { PosCliente } from '../../lib/api-pos'

/** Clientes de la caja: para tickets con nombre o factura. */
export default function Clientes() {
  const [clientes, setClientes] = useState<PosCliente[] | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [nuevo, setNuevo] = useState(false)

  const cargar = useCallback(() => {
    apiPos
      .clientes()
      .then((d) => {
        setClientes(d.clientes)
        setError('')
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <>
      <header className="pagina-cab">
        <div>
          <h1 style={{ margin: 0 }}>Clientes de la caja</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            Para tickets con nombre o factura.
          </p>
        </div>
        <div className="pos-atajos">
          <button type="button" className="btn btn--mini" onClick={() => setNuevo(true)}>
            <Icon name="mas" size={17} /> Cliente
          </button>
          <Link className="btn btn--claro btn--mini" to="/pos">
            Ir a caja
          </Link>
        </div>
      </header>

      {aviso && <div className="aviso aviso--ok" style={{ marginBottom: 14 }}>{aviso}</div>}
      {error && <div className="aviso aviso--error" style={{ marginBottom: 14 }}>{error}</div>}

      {!clientes ? (
        <div className="card">
          <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
            <Skeleton h={40} />
            <Skeleton h={180} />
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Correo</th>
                  <th>RFC</th>
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <Vacio
                        titulo="Sin clientes registrados"
                        texto="Agrégalos para emitir el ticket a nombre de quien compra."
                      />
                    </td>
                  </tr>
                ) : (
                  clientes.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.nombre}</strong>
                      </td>
                      <td>{c.telefono || '—'}</td>
                      <td>{c.email || '—'}</td>
                      <td>{c.rfc || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {nuevo && (
        <FormularioCliente
          onCerrar={() => setNuevo(false)}
          onHecho={() => {
            setNuevo(false)
            setAviso('Cliente guardado.')
            cargar()
          }}
        />
      )}
    </>
  )
}

function FormularioCliente({ onCerrar, onHecho }: { onCerrar: () => void; onHecho: () => void }) {
  const [f, setF] = useState({ nombre: '', telefono: '', email: '', rfc: '' })
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (f.nombre.trim() === '') {
      setError('El nombre es obligatorio.')
      return
    }
    setOcupado(true)
    setError('')
    try {
      await apiPos.crearCliente({
        nombre: f.nombre.trim(),
        telefono: f.telefono.trim(),
        email: f.email.trim(),
        rfc: f.rfc.trim().toUpperCase(),
      })
      onHecho()
    } catch (err) {
      setError((err as Error).message)
      setOcupado(false)
    }
  }

  return (
    <div className="pos-modal" role="dialog" aria-modal="true" aria-labelledby="pos-cliente">
      <div className="pos-modal__caja">
        <h2 id="pos-cliente" style={{ margin: '0 0 14px' }}>
          Nuevo cliente
        </h2>
        <form onSubmit={guardar} style={{ display: 'grid', gap: 12 }}>
          <label className="campo">
            <span>Nombre</span>
            <input
              value={f.nombre}
              onChange={(e) => setF({ ...f, nombre: e.target.value })}
              maxLength={120}
              required
              autoFocus
            />
          </label>
          <div className="pos-fila">
            <label className="campo">
              <span>Teléfono</span>
              <input
                value={f.telefono}
                onChange={(e) => setF({ ...f, telefono: e.target.value })}
                maxLength={20}
                inputMode="tel"
              />
            </label>
            <label className="campo">
              <span>RFC</span>
              <input
                value={f.rfc}
                onChange={(e) => setF({ ...f, rfc: e.target.value.toUpperCase() })}
                maxLength={13}
              />
            </label>
          </div>
          <label className="campo">
            <span>Correo</span>
            <input
              type="email"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              maxLength={190}
            />
          </label>
          {error && <div className="aviso aviso--error">{error}</div>}
          <div className="pos-modal__acciones">
            <button type="button" className="btn btn--claro" onClick={onCerrar} disabled={ocupado}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={ocupado}>
              {ocupado ? 'Guardando…' : 'Guardar cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
