import { useNavigate, useSearchParams } from 'react-router-dom'
import { useVolver } from '../lib/navegacion'
import MonitoreoModal from '../components/MonitoreoModal'

/**
 * Ruta /monitoreos/nuevo (acceso directo o link externo).
 * El flujo principal usa MonitoreoModal sin abandonar la vista.
 */
export default function MonitoreoNuevo() {
  const navigate = useNavigate()
  const volver = useVolver('/monitoreos')
  const [searchParams] = useSearchParams()
  const campaniaPreset = searchParams.get('campaniaId')

  return (
    <MonitoreoModal
      campaniaId={campaniaPreset ? Number(campaniaPreset) : null}
      onCreated={(idCampania) => navigate(`/campanias/${idCampania}`)}
      onClose={volver}
    />
  )
}
