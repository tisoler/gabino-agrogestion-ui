import { useState, useEffect } from 'react'
import { Plus, Search, Filter, MoreHorizontal, Edit, Trash2 } from 'lucide-react'
import { Table } from '../components/Table'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

interface Labor {
  id: number
  nombre: string
  descripcion: string
}

export default function Labores() {
  const [labores, setLabores] = useState<Labor[]>([])
  const [loading, setLoading] = useState(true)
  const { permisos } = useAuth()

  const canWrite = permisos.includes('escritura:labor')

  useEffect(() => {
    fetchLabores()
  }, [])

  const fetchLabores = async () => {
    try {
      setLoading(true)
      const res = await api.get('/labores')
      setLabores(res.data)
    } catch (err) {
      console.error('Error al cargar labores', err)
      // Mock data for demo if API is not running/migrated yet
      setLabores([
         { id: 1, nombre: 'Arado', descripcion: 'Preparación del suelo' },
         { id: 2, nombre: 'Siembra', descripcion: 'Colocación de semillas' },
         { id: 3, nombre: 'Cosecha', descripcion: 'Recolección de frutos' },
         { id: 4, nombre: 'Fumigación', descripcion: 'Aplicación de agroquímicos' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    { header: 'ID', accessor: 'id' as keyof Labor },
    { header: 'Nombre', accessor: 'nombre' as keyof Labor },
    { header: 'Descripción', accessor: 'descripcion' as keyof Labor },
    { 
      header: 'Acciones', 
      accessor: (item: Labor) => (
        <div className="row-actions">
          <button className="icon-btn" title="Editar"><Edit size={16} /></button>
          <button className="icon-btn delete" title="Eliminar"><Trash2 size={16} /></button>
          <style>{`
            .row-actions { display: flex; gap: 8px; }
            .icon-btn { 
              background: none; border: none; padding: 4px; border-radius: 4px; color: var(--text-secondary); 
              transition: all 0.2s;
            }
            .icon-btn:hover { background: var(--border-color); color: var(--primary-color); }
            .icon-btn.delete:hover { color: var(--danger); background: rgba(211, 47, 47, 0.1); }
          `}</style>
        </div>
      )
    }
  ]

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-titles">
          <h1>🚜 Labores</h1>
          <p>Catálogo maestro de actividades agrícolas</p>
        </div>
        
        {canWrite && (
          <button className="primary-btn">
            <Plus size={20} />
            <span>Nueva Labor</span>
          </button>
        )}
      </div>

      <div className="filters-bar premium-card">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input type="text" placeholder="Buscar actividad..." />
        </div>
        <button className="secondary-btn">
          <Filter size={18} />
          <span>Filtros</span>
        </button>
      </div>

      <Table 
        data={labores} 
        columns={columns} 
      />

      {loading && <div className="loading-spinner">Cargando...</div>}

      <style>{`
        .page-container { display: flex; flex-direction: column; gap: 24px; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-end; }
        .header-titles h1 { font-size: 2rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; }
        .header-titles p { color: var(--text-secondary); font-size: 1rem; }

        .filters-bar { 
          display: flex; gap: 16px; padding: 16px 24px; align-items: center; 
          background: var(--card-bg) !important;
        }
        .search-box { 
          flex: 1; position: relative; display: flex; align-items: center;
        }
        .search-icon { position: absolute; left: 12px; color: var(--text-secondary); pointer-events: none; }
        .search-box input {
          width: 100%; padding: 10px 10px 10px 40px; border-radius: 10px; border: 1px solid var(--border-color);
          background: var(--background-alt); font-size: 0.95rem; outline: none; transition: border-color 0.2s;
        }
        .search-box input:focus { border-color: var(--primary-color); }

        .primary-btn {
          background: var(--primary-color); color: white; border: none; padding: 12px 24px; 
          border-radius: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px;
          transition: transform 0.2s, background 0.2s;
        }
        .primary-btn:hover { background: var(--primary-hover); transform: translateY(-2px); }
        .primary-btn:active { transform: translateY(0); }

        .secondary-btn {
          background: var(--background-alt); color: var(--text-primary); border: 1px solid var(--border-color); 
          padding: 10px 16px; border-radius: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px;
          transition: all 0.2s;
        }
        .secondary-btn:hover { background: var(--border-color); }

        .loading-spinner { text-align: center; color: var(--primary-color); font-weight: 600; padding: 20px; }
      `}</style>
    </div>
  )
}
