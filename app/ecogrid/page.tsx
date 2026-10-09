import { buildPopulationHeatPoints, buildRiskRanking, buildWorkerOrders, buildZoneRiskDataset, getDhakaMockObservationInputs } from '@/lib/ecogrid/riskEngine'
import EcoGridDashboardClient from './widgets/EcoGridDashboardClient'

export default function EcoGridPage() {
  const zones = buildZoneRiskDataset(getDhakaMockObservationInputs())
  const ranking = buildRiskRanking(zones)
  const workerOrders = buildWorkerOrders(zones)
  const populationHeatPoints = buildPopulationHeatPoints(zones)

  return <EcoGridDashboardClient zones={zones} ranking={ranking} workerOrders={workerOrders} populationHeatPoints={populationHeatPoints} />
}
