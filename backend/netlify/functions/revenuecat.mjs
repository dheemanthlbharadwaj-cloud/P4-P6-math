import { handleRevenueCat } from "../handler.mjs";

export default (request) => handleRevenueCat(request);
export const config = { path: "/revenuecat" };
