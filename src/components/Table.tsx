import { ReactNode } from 'react'

interface Column<T> {
  header: string
  accessor: keyof T | ((item: T) => ReactNode)
}

interface TableProps<T> {
  data: T[]
  columns: Column<T>[]
  title?: string
  actions?: ReactNode
}

export function Table<T>({ data, columns, title, actions }: TableProps<T>) {
  return (
    <div className="premium-card">
      <div className="table-header">
        {title && <h2>{title}</h2>}
        {actions && <div className="table-actions">{actions}</div>}
      </div>
      
      <div className="table-container">
        <table>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length > 0 ? (
              data.map((item, ri) => (
                <tr key={ri}>
                  {columns.map((col, ci) => (
                    <td key={ci}>
                      {typeof col.accessor === 'function' 
                        ? col.accessor(item) 
                        : (item[col.accessor] as ReactNode)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-state">
                  No hay datos disponibles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .table-header h2 { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
        .table-container { overflow-x: auto; }
        table { width: 100%; border-collapse: separate; border-spacing: 0; }
        th {
          text-align: left;
          padding: 16px;
          background: var(--background-alt);
          color: var(--text-secondary);
          font-weight: 600;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid var(--border-color);
        }
        td {
          padding: 16px;
          border-bottom: 1px solid var(--border-color);
          color: var(--text-primary);
          font-size: 0.95rem;
        }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: var(--background-alt); }
        .empty-state { text-align: center; padding: 40px; color: var(--text-secondary); font-style: italic; }
      `}</style>
    </div>
  )
}
