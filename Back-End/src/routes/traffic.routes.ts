import { Router } from "express";
import { getRealtimeTraffic, getIncidents, getForecast, getForecastHourly, getForecast48hHandler, getVolumeAdt, getTrafficAnalytics , getWeatherEvidence, getTrafficPrescriptiveHandler} from "../controllers/traffic.controller.js";
import { asyncHandler } from "../middleware/error.middleware.js";

const router = Router();

router.get("/analytics", asyncHandler(getTrafficAnalytics));
router.get("/realtime", asyncHandler(getRealtimeTraffic));
router.get("/incidents", asyncHandler(getIncidents));
router.get("/forecast", asyncHandler(getForecast));
router.get("/weather-evidence", asyncHandler(getWeatherEvidence));
router.get("/forecast/hourly", asyncHandler(getForecastHourly));
router.get("/forecast/48h", asyncHandler(getForecast48hHandler));
router.get("/volume-adt", asyncHandler(getVolumeAdt));
router.get("/prescriptive", asyncHandler(getTrafficPrescriptiveHandler));

export default router;
