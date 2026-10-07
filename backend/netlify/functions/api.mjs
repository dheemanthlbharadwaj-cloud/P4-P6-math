import { handleApi } from "../handler.mjs";

export default (request) => handleApi(request);
export const config = { path: "/api/*" };
